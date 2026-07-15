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
import { ConflictError, LimitExceededError, NotFoundError, ValidationError } from '../errors';
import { getDriver } from '../drivers/registry';
import type { AgentProcess, DriverId, SessionStartOptions } from '../drivers/types';
import { readManifest } from '../sites/manifest';
import { commitAll, changedFiles } from '../sites/git';
import { siteExists, workspaceSizeMb } from '../sites/workspace';
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

export function isSiteBusy(slug: string): boolean {
  return liveByslug.get(slug)?.state === 'running';
}

export function activeTurnCount(): number {
  return activeTurns;
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

/** Starts a NEW session for a site and runs its first turn. Returns the session id. */
export async function startSession(slug: string, prompt: string, driverOverride?: DriverId): Promise<StartResult> {
  validatePrompt(prompt);
  if (!siteExists(slug)) throw new NotFoundError(`No site named '${slug}'`);
  if (isSiteBusy(slug)) throw new ConflictError(`A session is already running for '${slug}'`, 'session_running');

  const manifest = await readManifest(slug);
  const driver = driverOverride ?? manifest.driver;

  await enforceQuota(slug);
  acquireGlobalSlot();

  const sessionId = randomUUID();
  const meta: SessionMeta = {
    session_id: sessionId,
    slug,
    driver,
    started_at: new Date().toISOString(),
    turns: 0,
    state: 'running',
    resume_token: null,
  };
  await writeMeta(meta);

  slugBySession.set(sessionId, slug);
  liveByslug.set(slug, { slug, session_id: sessionId, state: 'running', proc: null, interrupted: false });

  // Fire the turn detached; the caller streams via SSE.
  void runTurn(meta, prompt).catch(() => {
    /* runTurn contains its own error handling; this guards against an unexpected throw */
  });

  return { session_id: sessionId };
}

/** Continues an existing session with a follow-up message (a new turn, resumed). */
export async function sendMessage(sessionId: string, message: string): Promise<void> {
  validatePrompt(message);
  const slug = slugBySession.get(sessionId) ?? (await resolveSlugFromDisk(sessionId));
  if (!slug) throw new NotFoundError(`No session '${sessionId}'`);
  if (isSiteBusy(slug)) throw new ConflictError(`A turn is already running for '${slug}'`, 'session_running');

  const meta = await readMeta(slug, sessionId);
  if (!meta) throw new NotFoundError(`No session '${sessionId}'`);

  await enforceQuota(slug);
  acquireGlobalSlot();

  meta.state = 'running';
  await writeMeta(meta);
  liveByslug.set(slug, { slug, session_id: sessionId, state: 'running', proc: null, interrupted: false });

  void runTurn(meta, message).catch(() => {});
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
 * The shared turn runner. Persists turn_start, spawns the driver, consumes its normalized
 * events (persist → fan), then commits the workspace and writes turn_end + updated meta.
 * Always releases the global slot and clears the running state, on every exit path.
 */
async function runTurn(meta: SessionMeta, prompt: string): Promise<void> {
  const { slug, session_id: sessionId, driver } = meta;
  const turn = meta.turns + 1;
  let finalState: SessionState = 'idle';
  let resumeToken: string | undefined = meta.resume_token ?? undefined;
  let sawError = false;

  try {
    // Spawn BEFORE the first await so the AgentProcess is registered the instant the site
    // is marked running — otherwise stopSession could race in and find no proc to kill.
    const opts = buildStartOptions(slug, driver, prompt, meta.resume_token ?? undefined);
    const proc = getDriver(driver).startTurn(opts);
    const live = liveByslug.get(slug);
    if (live) live.proc = proc;

    await persist(slug, sessionId, { type: 'turn_start', turn, prompt });

    for await (const event of proc.events) {
      await persist(slug, sessionId, event);
      if (event.type === 'result' && event.resumeToken) resumeToken = event.resumeToken;
      if (event.type === 'error') sawError = true;
    }

    // File-change backstop: derive the turn's edits from git, so every driver reports a
    // consistent file_change regardless of how well its native stream describes edits.
    try {
      const files = await changedFiles(slug);
      if (files.length > 0) await persist(slug, sessionId, { type: 'file_change', files });
    } catch {
      // non-fatal
    }

    // Commit whatever the agent wrote, so the turn is a rollback point.
    try {
      await commitAll(slug, `agent: session ${sessionId} turn ${turn}`);
    } catch {
      // a failed commit is logged by git.ts's throw path but must not fail the turn
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
    });
  } finally {
    meta.turns = turn;
    meta.state = finalState;
    meta.resume_token = resumeToken ?? null;
    await writeMeta(meta);

    await persist(slug, sessionId, { type: 'turn_end', state: finalState, resumeToken });

    const live = liveByslug.get(slug);
    if (live) {
      live.state = finalState;
      live.proc = null;
    }
    releaseGlobalSlot();
  }
}

/** Marks a turn as interrupted from the outside (used by stop + boot sweep bookkeeping). */
export function markInterrupted(slug: string): void {
  const live = liveByslug.get(slug);
  if (live) live.state = 'interrupted';
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
    if (meta.state === 'running') {
      try {
        await commitAll(slug, `agent: recovered after restart (session ${sessionId})`);
      } catch {
        // non-fatal
      }
      meta.state = 'interrupted';
      await writeMeta(meta);
      await persist(slug, sessionId, { type: 'turn_end', state: 'interrupted' });
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

async function enforceQuota(slug: string): Promise<void> {
  const sizeMb = await workspaceSizeMb(slug);
  if (sizeMb > config.SITE_DISK_QUOTA_MB) {
    throw new LimitExceededError(
      `Workspace over disk quota (${Math.round(sizeMb)} MB > ${config.SITE_DISK_QUOTA_MB} MB)`,
      'disk_quota',
    );
  }
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

/** Builds the driver's tight env allowlist — the agent-secrets boundary. */
function buildStartOptions(
  slug: string,
  driver: DriverId,
  prompt: string,
  resumeToken: string | undefined,
): SessionStartOptions {
  const workspace = confinedPath(config.SITES_ROOT, slug);
  const baseEnv: Record<string, string> = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: config.SITES_ROOT,
  };
  if (driver === 'claude_code' && config.ANTHROPIC_API_KEY) {
    baseEnv.ANTHROPIC_API_KEY = config.ANTHROPIC_API_KEY;
  }
  if (driver === 'opencode') Object.assign(baseEnv, parseEnvPairs(config.OPENCODE_ENV));
  if (driver === 'pi') Object.assign(baseEnv, parseEnvPairs(config.PI_ENV));

  const headers: Record<string, string> | undefined = config.PUBLICATION_API_KEY
    ? { 'X-API-Key': config.PUBLICATION_API_KEY }
    : undefined;

  return {
    workspace,
    prompt,
    resumeToken,
    mcp: {
      name: 'dedalo_publication',
      url: `${config.PUBLICATION_API_URL.replace(/\/$/, '')}/mcp`,
      headers,
    },
    env: baseEnv,
    timeoutMs: config.SESSION_TURN_TIMEOUT_MS,
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
