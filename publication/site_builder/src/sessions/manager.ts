/**
 * Session manager — orchestrates agent turns and owns the live/durable event fan-out.
 *
 * Invariants it enforces:
 *   - ONE active turn per site (a per-slug lock). A second start while a turn runs is a
 *     409, never a concurrent agent in the same workspace.
 *   - At most MAX_CONCURRENT_SESSIONS turns across all sites (a global counting
 *     semaphore). Over the cap is a 429.
 *   - A workspace over its disk quota refuses new work until it is cleaned up.
 *
 * A turn's events are appended to the durable JSONL log (store.ts) BEFORE being pushed to
 * live SSE subscribers, so the log is always authoritative and a subscriber can reconcile
 * by seq. The turn itself runs detached: startSession/sendMessage persist the turn_start
 * marker, spawn the driver, kick an async consumer, and return — the caller gets the
 * session id immediately and streams the rest over SSE.
 */

import { randomUUID } from 'node:crypto';
import { config, parseEnvPairs } from '../config';
import { confinedPath } from '../util/paths';
import { ConfinementRefusedError, ConflictError, LimitExceededError, NotFoundError, ValidationError } from '../errors';
import { assertConfinementAvailable, policyFromConfig, type ConfinementPolicy } from '../drivers/confinement';
import { MCP_PORT } from '../drivers/network_profile';
import { getDriver } from '../drivers/registry';
import type { AgentProcess, DriverId, SessionStartOptions } from '../drivers/types';
import { readSiteDriver } from '../sites/driver_record';
import { readManifest } from '../sites/manifest';
import { commitAll, changedFiles } from '../sites/git';
import { assertWithinQuota, siteExists } from '../sites/workspace';
import { busyDetail, busyReason, end, endTurn, tryBegin, tryBeginTurn } from '../workspace_activity';
import type { SessionEventBody, SessionMeta, StoredEvent } from './events';
import {
  appendEvent,
  readMeta,
  writeMeta,
  allSessionMetaFiles,
} from './store';

export type SessionState = 'idle' | 'running' | 'interrupted' | 'error';

interface LiveSession {
  slug: string;
  session_id: string;
  state: SessionState;
  proc: AgentProcess | null;
  /** Set when stopSession interrupts this turn, so the finally block reports it honestly. */
  interrupted: boolean;
}

// slug -> the site's current live session (at most one). A site absent from this map has
// no in-memory session this process lifetime; getSessionState reports it from disk-idle.
const liveByslug = new Map<string, LiveSession>();
// session_id -> slug, so stop/subscribe can resolve a session without a disk scan.
const slugBySession = new Map<string, string>();
// session_id -> live subscribers (SSE tails). Fed every persisted event.
const subscribers = new Map<string, Set<(event: StoredEvent) => void>>();

let activeTurns = 0;

// --- read accessors (used by the site-status join and routes) ---

export function getSessionState(slug: string): { state: SessionState; session_id: string | null } {
  const live = liveByslug.get(slug);
  if (!live) return { state: 'idle', session_id: null };
  return { state: live.state, session_id: live.session_id };
}

/**
 * Whether the given session has a turn actively running right now. Resolves session → slug
 * → live state; a session this process never saw (pre-restart) is not running by
 * definition. The SSE handler uses this to decide whether to keep tailing or close after
 * draining the backlog.
 */
export function isTurnRunning(sessionId: string): boolean {
  const slug = slugBySession.get(sessionId);
  return slug !== undefined && liveByslug.get(slug)?.state === 'running';
}

// --- live subscription (SSE) ---

/**
 * Registers a live-event listener for a session and returns its unsubscribe closure. Every
 * persisted event is fanned to all current listeners (see `fan`). The SSE handler
 * subscribes BEFORE replaying the durable backlog so no event that lands mid-replay is
 * lost; it dedupes the overlap by seq.
 */
export function subscribe(sessionId: string, fn: (event: StoredEvent) => void): () => void {
  let set = subscribers.get(sessionId);
  if (!set) {
    set = new Set();
    subscribers.set(sessionId, set);
  }
  set.add(fn);
  return () => set?.delete(fn);
}

function fan(sessionId: string, event: StoredEvent): void {
  const set = subscribers.get(sessionId);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(event);
    } catch {
      // a broken subscriber must not break persistence or the other subscribers
    }
  }
}

// --- turn orchestration ---

export interface StartResult {
  session_id: string;
}

/**
 * Starts a NEW session for a site and runs its first turn. Returns the session id.
 *
 * `policy` is the confinement the turn is CHECKED against and RUN under — one value, threaded
 * to the supervisor and to the turn's git commands (a parameter for the reason `startBuild`'s
 * is: a refusal whose input cannot be stated is one no gate can put a failing host in front of).
 */
export async function startSession(
  slug: string,
  prompt: string,
  driverOverride?: DriverId,
  policy: ConfinementPolicy = policyFromConfig(),
): Promise<StartResult> {
  validatePrompt(prompt);
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  // BEFORE ANY RESERVATION, and with the site's OWN driver: its provider host is part of the
  // egress plan, and a driver whose provider nobody named can reach nothing
  // (AGENT_PROVIDER_HOSTS). A host that cannot run this turn under the agent's own uid refuses
  // the REQUEST (503, naming what is missing) instead of accepting a session and failing it
  // asynchronously — and, above all, instead of running the agent as this daemon. Never the
  // instance DEFAULT driver's plan: that would refuse a claude_code site on an opencode host
  // for a provider list it does not use. And the site's driver is the DAEMON's record, never
  // `site.json` (agent-writable: a planted `"driver":"opencode"` was a way around every PLANT
  // closure of the Claude Code driver — sites/driver_record.ts).
  const driver = driverOverride ?? (await readSiteDriver(slug));
  await assertConfinementAvailable('turn', policy, driver, slug);
  // And the DRIVER's own question (claude_code: does the installed CLI list every flag that
  // keeps agent-written settings, hooks and MCP servers out of the turn?) — 503, before any
  // reservation, in either confinement mode.
  await getDriver(driver).admit?.();

  // Reserve the workspace SYNCHRONOUSLY — check-and-mark with no await in between, and
  // cross-exclusive with builds (workspace_activity.ts). From here every failure path
  // before runTurn takes ownership must endTurn; runTurn's finally owns it afterwards.
  if (!tryBeginTurn(slug)) {
    const reason = busyReason(slug) ?? 'session_running';
    throw new ConflictError(busyDetail(reason, slug), reason);
  }

  try {
    await enforceQuota(slug);
    acquireGlobalSlot();

    // Everything between acquiring the slot and handing off to runTurn (whose finally owns
    // the release from then on) must release it on failure — a leaked increment here would
    // permanently shrink the instance's concurrency budget.
    try {
      const sessionId = randomUUID();
      const meta: SessionMeta = {
        session_id: sessionId,
        slug,
        driver,
        started_at: new Date().toISOString(),
        turns: 0,
        state: 'running',
        resume_token: null,
        identity_epoch: policy.identityEpoch ?? config.AGENT_IDENTITY_EPOCH,
      };
      await writeMeta(meta);

      slugBySession.set(sessionId, slug);
      liveByslug.set(slug, { slug, session_id: sessionId, state: 'running', proc: null, interrupted: false });

      // Fire the turn detached; the caller streams via SSE. Ownership of the workspace
      // reservation and the global slot transfers to runTurn's finally here.
      void runTurn(meta, prompt, policy).catch(() => {
        /* runTurn contains its own error handling; this guards against an unexpected throw */
      });

      return { session_id: sessionId };
    } catch (error) {
      releaseGlobalSlot();
      throw error;
    }
  } catch (error) {
    endTurn(slug);
    throw error;
  }
}

/** Continues an existing session with a follow-up message (a new turn, resumed). */
export async function sendMessage(
  sessionId: string,
  message: string,
  policy: ConfinementPolicy = policyFromConfig(),
): Promise<void> {
  validatePrompt(message);
  const slug = slugBySession.get(sessionId) ?? (await resolveSlugFromDisk(sessionId));
  if (!slug) throw new NotFoundError(`No session '${sessionId}'`);
  // Asked again, before the reservation and with the SESSION's driver (fixed at its start):
  // a second turn is as much an agent run as the first, and a host that lost its runner
  // between them must not answer it as this daemon.
  const known = await readMeta(slug, sessionId);
  if (!known) throw new NotFoundError(`No session '${sessionId}'`);
  await assertConfinementAvailable('turn', policy, known.driver, slug);
  await getDriver(known.driver).admit?.();

  // Same synchronous reservation as startSession (cross-exclusive with builds).
  if (!tryBeginTurn(slug)) {
    const reason = busyReason(slug) ?? 'session_running';
    throw new ConflictError(reason === 'session_running' ? `A turn is already running for '${slug}'` : busyDetail(reason, slug), reason);
  }

  try {
    const meta = await readMeta(slug, sessionId);
    if (!meta) throw new NotFoundError(`No session '${sessionId}'`);

    await enforceQuota(slug);
    acquireGlobalSlot();

    // Same slot-release guard as startSession: runTurn's finally owns the release only once
    // the turn is actually fired.
    try {
      meta.state = 'running';
      await writeMeta(meta);
      liveByslug.set(slug, { slug, session_id: sessionId, state: 'running', proc: null, interrupted: false });

      void runTurn(meta, message, policy).catch(() => {});
    } catch (error) {
      releaseGlobalSlot();
      throw error;
    }
  } catch (error) {
    endTurn(slug);
    throw error;
  }
}

/** Interrupts the running turn of a session (SIGINT → SIGKILL), if any. */
export async function stopSession(sessionId: string): Promise<void> {
  const slug = slugBySession.get(sessionId);
  const live = slug ? liveByslug.get(slug) : undefined;
  if (!live || live.state !== 'running' || !live.proc) {
    throw new ConflictError('No running turn to stop', 'not_running');
  }
  live.interrupted = true;
  await live.proc.interrupt();
}

/**
 * MARK EVERY LIVE TURN INTERRUPTED — the shutdown's counterpart to `sweepOnBoot()`.
 *
 * A turn that is still running when the process is going away is not going to finish, and
 * the only wrong answer is silence: left as it is, its metadata says 'running' until the
 * NEXT boot's sweep discovers it, so a restart shows a museum a turn that is still working
 * when nothing is. This interrupts each live process (the driver's own interrupt, so a
 * partial answer is committed exactly as `stopSession` commits one) and returns how many
 * there were, for the shutdown log.
 *
 * Best effort by construction: it runs while the process is being torn down, so one driver
 * that will not die must not stop the others from being marked.
 */
export async function interruptLiveTurns(): Promise<number> {
  let interrupted = 0;
  for (const live of liveByslug.values()) {
    if (live.state !== 'running' || !live.proc) continue;
    live.interrupted = true;
    interrupted++;
    try {
      await live.proc.interrupt();
    } catch (error) {
      console.error(`[shutdown] could not interrupt the turn on '${live.slug}':`, error);
    }
  }
  return interrupted;
}

/**
 * The shared turn runner. Persists turn_start, spawns the driver, consumes its normalized
 * events (persist → fan), then commits the workspace and writes turn_end + updated meta.
 * Always releases the global slot and clears the running state, on every exit path.
 */
async function runTurn(meta: SessionMeta, prompt: string, policy: ConfinementPolicy): Promise<void> {
  const { slug, session_id: sessionId, driver } = meta;
  const turn = meta.turns + 1;
  let finalState: SessionState = 'idle';
  // THE RESUME EPOCH (LEAD-1b). A resume token names agent state in a HOME owned by the uid
  // that minted it; when the site's identity has changed since (the epoch moved — a
  // migration, a re-declared site), that state is not this identity's to resume, so the
  // token is DROPPED and the drop is a typed event in the session's own log. Sessions older
  // than the field count as epoch 0.
  const epoch = policy.identityEpoch ?? config.AGENT_IDENTITY_EPOCH;
  const tokenEpoch = typeof meta.identity_epoch === 'number' ? meta.identity_epoch : 0;
  const staleToken = meta.resume_token !== null && meta.resume_token !== undefined && tokenEpoch !== epoch;
  if (staleToken) meta.resume_token = null;
  meta.identity_epoch = epoch;
  let resumeToken: string | undefined = meta.resume_token ?? undefined;
  let sawError = false;

  try {
    // Spawn BEFORE the first await so the AgentProcess is registered the instant the site
    // is marked running — otherwise stopSession could race in and find no proc to kill.
    const opts: SessionStartOptions = {
      ...buildStartOptions(slug, driver, prompt, meta.resume_token ?? undefined, policy.mode),
      slug,
      confinement: policy,
    };
    const proc = getDriver(driver).startTurn(opts);
    const live = liveByslug.get(slug);
    if (live) live.proc = proc;

    if (staleToken) await persist(slug, sessionId, { type: 'resume_unavailable', reason: 'agent identity migrated' });
    await persist(slug, sessionId, { type: 'turn_start', turn, prompt });

    for await (const event of proc.events) {
      await persist(slug, sessionId, event);
      if (event.type === 'result' && event.resumeToken) resumeToken = event.resumeToken;
      if (event.type === 'error') sawError = true;
    }

    // File-change backstop: derive the turn's edits from git, so every driver reports a
    // consistent file_change regardless of how well its native stream describes edits.
    try {
      const files = await changedFiles(slug, policy);
      if (files.length > 0) await persist(slug, sessionId, { type: 'file_change', files });
    } catch {
      // non-fatal
    }

    // Commit whatever the agent wrote, so the turn is a rollback point.
    try {
      await commitAll(slug, `agent: session ${sessionId} turn ${turn}`, policy);
    } catch (error) {
      // A failed commit must not fail the turn — but it is never a silence.
      console.error(`[sessions] the commit after turn ${turn} of '${slug}' failed:`, error);
      // Refused because the daemon is stopping (a connect would cancel its stop): the next
      // boot's sweep makes this commit as a recovery point.
      if (error instanceof ConfinementRefusedError && error.code === 'daemon_stopping') meta.recovery_pending = true;
    }

    // An interrupted turn reports 'interrupted' regardless of how its stream ended.
    if (liveByslug.get(slug)?.interrupted) finalState = 'interrupted';
    else finalState = sawError ? 'error' : 'idle';
  } catch (error) {
    sawError = true;
    finalState = 'error';
    await persist(slug, sessionId, {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      retriable: true,
    }).catch(() => {
      // the persistence layer itself is failing; the finally below still runs
    });
  } finally {
    // The persistence writes can themselves fail (disk full, workspace deleted mid-turn).
    // They are wrapped so the state/slot releases BELOW run unconditionally — a throw here
    // escaping into the callers' `void runTurn().catch(() => {})` would permanently leak a
    // global concurrency slot and leave the site marked running forever.
    try {
      meta.turns = turn;
      meta.state = finalState;
      meta.resume_token = resumeToken ?? null;
      await writeMeta(meta);

      await persist(slug, sessionId, { type: 'turn_end', state: finalState, resumeToken });
    } catch (error) {
      console.error(`[sessions] failed to persist turn end for '${slug}' — state may be stale on disk:`, error);
    }

    const live = liveByslug.get(slug);
    if (live) {
      live.state = finalState;
      live.proc = null;
    }
    endTurn(slug);
    releaseGlobalSlot();
  }
}

async function persist(slug: string, sessionId: string, body: SessionEventBody): Promise<void> {
  const event = await appendEvent(slug, sessionId, body);
  fan(sessionId, event);
}

// --- boot recovery ---

/**
 * On boot, any session whose meta says 'running' is a lie — the process that ran it died.
 * Mark those interrupted, commit any uncommitted work as a recovery point, and rebuild
 * the session→slug index so stop/subscribe work for pre-restart sessions.
 */
export async function sweepOnBoot(): Promise<void> {
  const all = await allSessionMetaFiles();
  for (const { slug, sessionId } of all) {
    slugBySession.set(sessionId, slug);
    const meta = await readMeta(slug, sessionId);
    if (!meta) continue;
    // 'running' is a process that died mid-turn; `recovery_pending` a turn whose commit the
    // shutdown refused (sessions/events.ts). Both leave work only a recovery commit records.
    const wasRunning = meta.state === 'running';
    if (wasRunning || meta.recovery_pending === true) {
      // THE RECOVERY COMMIT HOLDS THE SITE (LEAD-1b). It runs git — agent-authored text's
      // interpreter — in the workspace, exactly as a turn's own commit does, so it takes the
      // same kind of reservation: nothing else may start on the site while it runs, and a
      // confined run of this site is refused without one at all.
      let recorded = false;
      if (tryBegin(slug, 'recovery')) {
        try {
          await commitAll(slug, `agent: recovered after restart (session ${sessionId})`);
          recorded = true;
        } catch (error) {
          // Not fatal to the boot — but a recovery point that was not made is a fact an
          // operator must be able to find, never a silence.
          console.error(`[sessions] the recovery commit for '${slug}' (session ${sessionId}) failed:`, error);
        } finally {
          end(slug, 'recovery');
        }
      } else {
        console.error(
          `[sessions] the recovery commit for '${slug}' (session ${sessionId}) was skipped: the site ` +
            `is held (${busyReason(slug) ?? 'unknown'}).`,
        );
      }
      // A refused commit stays owed until one is made (the next boot asks again).
      if (recorded) delete meta.recovery_pending;
      if (wasRunning) meta.state = 'interrupted';
      await writeMeta(meta);
      if (wasRunning) await persist(slug, sessionId, { type: 'turn_end', state: 'interrupted' });
    }
  }
}

// --- helpers ---

function validatePrompt(prompt: unknown): void {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new ValidationError('prompt must be a non-empty string');
  }
  if (prompt.length > 32 * 1024) {
    throw new ValidationError('prompt exceeds 32 KiB');
  }
}

/**
 * The quota gate before an agent turn. It measures the WHOLE site — workspace plus both
 * release stores (`assertWithinQuota`) — because a turn that cannot be published is not a
 * turn worth starting, and the releases are the half of a site's footprint a museum cannot
 * see. The promote path asks the same question again, immediately before it adds a copy.
 */
async function enforceQuota(slug: string): Promise<void> {
  await assertWithinQuota(await readManifest(slug), `a turn on '${slug}'`);
}

function acquireGlobalSlot(): void {
  if (activeTurns >= config.MAX_CONCURRENT_SESSIONS) {
    throw new LimitExceededError(
      `Too many concurrent sessions (${config.MAX_CONCURRENT_SESSIONS})`,
      'max_concurrent_sessions',
    );
  }
  activeTurns++;
}

function releaseGlobalSlot(): void {
  if (activeTurns > 0) activeTurns--;
}

/**
 * Builds the driver's tight env allowlist — the agent-secrets boundary — and its MCP
 * attachment.
 *
 * THE PUBLICATION API KEY NEVER ENTERS A CONFINED TURN. Under `systemd_scope` the agent is
 * handed a LOOPBACK MCP url with no headers — the egress shim forwards it to the gate's
 * mcp.sock — and the key travels only in `mcpUpstream`, which the supervisor gives the gate
 * and nothing writes to a file. Before this, the key sat in `.builder/mcp.json` inside the
 * workspace for the life of the turn, readable by the agent it was meant to authorize. Under
 * a DECLARED `none` there is no gate, so the direct shape (URL + X-API-Key header) remains,
 * as that mode's announced cost.
 *
 * `mode` is a parameter so both shapes are assertable on a host that runs only one of them.
 */
export function buildStartOptions(
  slug: string,
  driver: DriverId,
  prompt: string,
  resumeToken: string | undefined,
  mode: 'systemd_scope' | 'none' = config.AGENT_CONFINEMENT,
): SessionStartOptions {
  const workspace = confinedPath(config.SITES_ROOT, slug);
  const baseEnv: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    // NO HOME (LEAD-1b). The UNIT fixes it — each (site, door) its own directory, owned by
    // the site's identity, masked from every other run — and the shim refuses a spec that
    // tries to set it. A caller-chosen HOME was one HOME shared by every site: the cross-site
    // plant channel for the agent's configuration, credentials and MCP servers.
  };
  if (driver === 'claude_code' && config.ANTHROPIC_API_KEY) {
    baseEnv.ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;
  }
  if (driver === 'opencode') Object.assign(baseEnv, parseEnvPairs(config.OPENCODE_ENV));
  if (driver === 'pi') Object.assign(baseEnv, parseEnvPairs(config.PI_ENV));

  const apiBase = config.PUBLICATION_API_URL.replace(/\/$/, '');
  const common = { workspace, driver, prompt, resumeToken, env: baseEnv, timeoutMs: config.SESSION_TURN_TIMEOUT_MS };

  if (mode === 'systemd_scope') {
    return {
      ...common,
      mcp: { name: 'dedalo_publication', url: `http://127.0.0.1:${MCP_PORT}/mcp` },
      mcpUpstream: { url: apiBase, apiKey: config.PUBLICATION_API_KEY },
    };
  }

  const headers: Record<string, string> | undefined = config.PUBLICATION_API_KEY
    ? { 'X-API-Key': config.PUBLICATION_API_KEY }
    : undefined;
  return {
    ...common,
    mcp: { name: 'dedalo_publication', url: `${apiBase}/mcp`, headers },
  };
}

async function resolveSlugFromDisk(sessionId: string): Promise<string | null> {
  const all = await allSessionMetaFiles();
  const hit = all.find(entry => entry.sessionId === sessionId);
  if (hit) {
    slugBySession.set(sessionId, hit.slug);
    return hit.slug;
  }
  return null;
}

/** Resolves a session id to its site slug (in-memory index, then disk). Public accessor. */
export async function slugForSession(sessionId: string): Promise<string | null> {
  return slugBySession.get(sessionId) ?? (await resolveSlugFromDisk(sessionId));
}
