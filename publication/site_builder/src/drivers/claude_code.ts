/**
 * The Claude Code driver — the default agent.
 *
 * Verified against: Claude Code CLI 2.1.286 (stream-json output format). The CLI's flags move
 * fast, so the driver does not trust them: it PROBES the installed binary (`--version`,
 * `--help`) and refuses every turn whose argv names a flag the binary does not list (below).
 *
 * Invocation (`claudeTurnArgv`): `claude -p --output-format stream-json --verbose
 * --permission-mode acceptEdits --max-turns 50 --setting-sources '' --settings <daemon JSON>
 * --strict-mcp-config --mcp-config <workspace>/.builder/mcp.json --allowedTools … --disallowedTools
 * … [--append-system-prompt <AGENTS.md>] [--resume <id>] -- <prompt>`. The MCP config points the
 * agent at the publication API's /mcp endpoint, so its only data reach is the read-only
 * published data.
 *
 * The child environment is a tight allowlist — ANTHROPIC_API_KEY, PATH — assembled by the
 * session manager, never process.env.
 *
 * THE TOOL SET IS STATED, NOT INHERITED. `--permission-mode acceptEdits` decides how a
 * request for a tool is ANSWERED; it does not decide which tools exist. Relying on "Bash is
 * not auto-granted in headless mode" is relying on another project's default: it is not
 * this daemon's to keep, it is not visible in this file, and the day it changes nothing
 * here goes red. So the argv names the tools a site build legitimately needs and DENIES the
 * three that turn a workspace-scoped agent into a host-scoped one — Bash (arbitrary
 * execution as the agent uid), WebFetch and WebSearch (an exfiltration channel for anything
 * the read tools can reach). The deny list wins over the allow list in Claude Code, so the
 * two together are a closed statement rather than a preference.
 *
 * AND THE CONFIGURATION IS STATED, NOT FOUND (PLANT). A deny list is only as strong as the
 * CONFIGURATION the CLI loads next to it, and by default Claude Code loads it from places the
 * agent writes: `<workspace>/.claude/settings.json` and `settings.local.json` (hooks — a shell
 * command run on SessionStart / UserPromptSubmit / every tool call), `<workspace>/.mcp.json` (a
 * stdio MCP server IS a command), `~/.claude/settings.json` in the turn's own persistent HOME,
 * and the skills, commands and agents under `.claude/`. A turn's Write tool, a build's
 * `postinstall`, or a git hook can plant any of them, and the NEXT turn executed it — shell
 * despite `--disallowedTools Bash`. Measured on 2.1.286 against a planted workspace: every
 * user/project/local hook fired and the planted stdio server ran. So the turn names its sources:
 *
 *   - `--setting-sources ''` — NO user, project or local source: no settings file, hook, MCP
 *     approval, skill, command, agent or project memory from the workspace or HOME is read.
 *     (Root's managed policy still applies — it is root's, not the agent's.)
 *   - `--settings <DAEMON_SETTINGS>` — the one settings source, a JSON string in the argv
 *     (no file the agent could swap): hooks off, project MCP servers never auto-approved. An
 *     independent layer — measured, it alone stops every planted hook.
 *   - `--strict-mcp-config` + `--mcp-config` — the daemon's MCP server and no other.
 *   - The brief (AGENTS.md, which the CLI no longer reads as project memory) is read by the
 *     DAEMON through the link-refusing reader and passed as `--append-system-prompt`.
 *   - `--` before the prompt: the prompt is text a person typed, and a prompt that began with
 *     `-` was parsed as an OPTION (`--mcp-config=…`, `--dangerously-skip-permissions`).
 *
 * A CLI THAT CANNOT SAY IT DOES NOT RUN. Each of those flags exists only from some release on,
 * and a binary that does not know one either errors or — in a release that tolerates unknown
 * options — ignores it and runs with every planted source. So the binary is probed (at boot,
 * at admission, and again in every turn's setup; a DEFINITIVE answer is cached per binary
 * INODE, so an upgrade is re-probed, and a transient one — a timeout, a spawn failure — is
 * asked again) and a turn whose argv names a flag the binary's `--help` does not list, or whose
 * binary the daemon cannot execute at all, is refused, typed (`confinement.agent_cli_unsupported`,
 * 503) — never run without it.
 */

import { realpathSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { config } from '../config';
import { ConfinementRefusedError, ValidationError } from '../errors';
import { readFileSharedBounded, relativeUnderRoot, restateDaemonStateDir, writeFileAgentReadable } from '../util/shared_tree';
import { runBinary, type SpawnResult } from '../util/spawn';
import { spawnAgentProcess, type TurnPlan } from './process';
import { claudeTurnArgv, listedFlags, MAX_BRIEF_BYTES, requiredCliFlags } from './claude_argv';
import type {
  AgentDriver,
  AgentEvent,
  DriverInfo,
  SessionStartOptions,
  AgentProcess,
} from './types';

export {
  ALLOWED_TOOLS,
  argvFlags,
  claudeTurnArgv,
  type ClaudeTurnInput,
  DAEMON_SETTINGS,
  DENIED_TOOLS,
  listedFlags,
  MAX_BRIEF_BYTES,
  requiredCliFlags,
  UNLISTED_FLAGS,
} from './claude_argv';

const VERSION_PROBE_TIMEOUT_MS = 10_000;
// Major versions whose stream-json shape this parser has been validated against.
const SUPPORTED_MAJORS = new Set([1, 2]);

/* ────────────────────────────────────────────────────────────────────────────────────
 * The probe — what the INSTALLED binary says it can do
 * ──────────────────────────────────────────────────────────────────────────────────── */

/** How the probe runs the binary: `runBinary` in production, a gate's runner otherwise. */
export type ProbeRunner = (argv: readonly string[]) => Promise<Pick<SpawnResult, 'exitCode' | 'stdout'>>;

const runProbe: ProbeRunner = argv =>
  // No cwd inside any workspace and no HOME: `--version` / `--help` read no settings, and the
  // probe must never be a turn in disguise.
  runBinary(argv, { timeoutMs: VERSION_PROBE_TIMEOUT_MS, cwd: '/', env: { PATH: process.env.PATH ?? '/usr/bin:/bin' } });

/** What the probe of one binary found. */
export interface ClaudeCliProbe {
  readonly version: string | null;
  /** Empty = this binary may run a turn. */
  readonly problems: readonly string[];
  /**
   * True when the answer is a FACT ABOUT THE BINARY — a parsed version and a `--help` that ran
   * to exit 0 (or a major this driver does not parse). Only such an answer is cached; a spawn
   * that failed, a probe killed by its timeout, a non-zero exit are facts about THIS MOMENT
   * (a loaded host at boot, a hiccup) and are asked again at the next admission.
   */
  readonly definitive: boolean;
}

/** One probe run; a binary the daemon cannot spawn is an answer (null + why), never a throw. */
async function runOnce(run: ProbeRunner, argv: readonly string[]): Promise<Pick<SpawnResult, 'exitCode' | 'stdout'> | { readonly spawnError: string }> {
  try {
    return await run(argv);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    return { spawnError: code ? `${code}: ${(error as Error).message}` : String((error as Error)?.message ?? error) };
  }
}

const unspawnable = (bin: string, why: string) =>
  `CLAUDE_CODE_BIN ('${bin}') cannot be executed by this daemon (${why}). It must exist, be executable by the ` +
  `daemon's user, and lie outside /home, /root, /tmp and /run — the daemon's own unit masks those ` +
  `(the native installer's ~/.local/bin is under /home: install it under /usr/local or /opt).`;

/** Probe `bin` — never cached here; `probeClaudeCli` is the cached door. */
export async function probeClaudeCliUncached(bin: string, run: ProbeRunner = runProbe): Promise<ClaudeCliProbe> {
  if (!bin) return { version: null, problems: ['CLAUDE_CODE_BIN is not configured, so there is no Claude Code binary to run.'], definitive: true };
  if (!isAbsolute(bin)) return { version: null, problems: [`CLAUDE_CODE_BIN ('${bin}') is not an absolute path.`], definitive: true };
  const versionRun = await runOnce(run, [bin, '--version']);
  if ('spawnError' in versionRun) return { version: null, problems: [unspawnable(bin, versionRun.spawnError)], definitive: false };
  const match = versionRun.exitCode === 0 ? versionRun.stdout.match(/(\d+)\.(\d+)\.(\d+)/) : null;
  if (!match) {
    return { version: null, problems: [`'${bin} --version' did not answer a version (exit ${String(versionRun.exitCode)}).`], definitive: false };
  }
  const version = match[0];
  if (!SUPPORTED_MAJORS.has(Number(match[1]))) {
    return {
      version,
      problems: [`Claude Code ${version} is outside the majors this driver parses (${[...SUPPORTED_MAJORS].join(', ')}).`],
      definitive: true,
    };
  }
  const helpRun = await runOnce(run, [bin, '--help']);
  if ('spawnError' in helpRun) return { version, problems: [unspawnable(bin, helpRun.spawnError)], definitive: false };
  if (helpRun.exitCode !== 0) {
    return { version, problems: [`'${bin} --help' failed (exit ${String(helpRun.exitCode)}), so its flags cannot be proved.`], definitive: false };
  }
  const listed = listedFlags(helpRun.stdout);
  const missing = requiredCliFlags().filter(flag => !listed.has(flag));
  if (missing.length === 0) return { version, problems: [], definitive: true };
  return {
    version,
    problems: [
      `Claude Code ${version} ('${bin}') does not list ${missing.join(', ')} in --help. A turn without ` +
        `them would load hooks, MCP servers and settings the agent can write into its own workspace ` +
        `or HOME (shell despite the Bash deny), so no Claude Code turn is run. Upgrade Claude Code.`,
    ],
    definitive: true,
  };
}

/** One binary's identity: its resolved path and inode — an upgrade (a new file or a re-pointed link) is a new key. */
function binaryKey(bin: string): string | null {
  try {
    const real = realpathSync(bin);
    const facts = statSync(real);
    return `${real}\0${facts.dev}\0${facts.ino}\0${facts.size}\0${facts.mtimeMs}`;
  } catch {
    return null;
  }
}

/** The last DEFINITIVE probe per binary key (module state: a host fact, re-asked whenever the inode changes). */
const probeCache = new Map<string, ClaudeCliProbe>();

/**
 * THE CACHED PROBE. Asked at boot, at every admission and in every turn's setup; it runs the
 * binary again only when the binary is not the inode last probed — so an upgrade (or a
 * downgrade) between two turns is probed before the next one runs. Only a DEFINITIVE answer is
 * kept (`ClaudeCliProbe.definitive`): a binary that cannot be stat'ed or spawned, a probe killed
 * by its timeout, a non-zero exit — each is probed (and refused) again at the next ask, never
 * cached, so one slow cold start on a loaded host is not a refusal until the daemon restarts.
 */
export async function probeClaudeCli(bin: string = config.CLAUDE_CODE_BIN, run: ProbeRunner = runProbe): Promise<ClaudeCliProbe> {
  const key = bin && isAbsolute(bin) ? binaryKey(bin) : null;
  const cached = key === null ? undefined : probeCache.get(key);
  if (cached) return cached;
  const probe = await probeClaudeCliUncached(bin, run);
  if (key !== null && probe.definitive) {
    // One entry per path: an upgraded binary replaces its predecessor's answer.
    const real = key.slice(0, key.indexOf('\0'));
    for (const stale of [...probeCache.keys()].filter(other => other.startsWith(`${real}\0`))) probeCache.delete(stale);
    probeCache.set(key, probe);
  }
  return probe;
}

/**
 * THE REFUSAL: a Claude Code turn runs only on a binary whose `--help` lists every flag the
 * argv passes. 503 `confinement.agent_cli_unsupported`, in BOTH confinement modes — the flags
 * are what make the tool deny list true at all, confined or declared-unconfined.
 */
export async function assertClaudeCliConfinable(bin: string = config.CLAUDE_CODE_BIN, run: ProbeRunner = runProbe): Promise<void> {
  const probe = await probeClaudeCli(bin, run);
  if (probe.problems.length > 0) {
    throw new ConfinementRefusedError('agent_cli_unsupported', `${probe.problems.join(' ')} Nothing was started.`);
  }
}

async function detect(): Promise<DriverInfo | null> {
  const bin = config.CLAUDE_CODE_BIN;
  if (!bin) return null;
  // AVAILABLE MEANS RUNNABLE: a binary whose flags cannot keep the agent's own files out of its
  // configuration is reported unavailable (/health, /v1/capabilities), not merely refused later.
  const probe = await probeClaudeCli(bin);
  if (probe.version === null || probe.problems.length > 0) return null;
  return { id: 'claude_code', binPath: bin, version: probe.version };
}

/**
 * THE BOOT PROBE (src/boot.ts): when this daemon is configured with a Claude Code binary,
 * probe it once at boot and SAY so — a host whose CLI cannot run a turn is a line in the boot
 * log, not a surprise at the first request. Returns the problems (empty = runnable).
 */
export async function bootProbeClaudeCli(bin: string = config.CLAUDE_CODE_BIN, run: ProbeRunner = runProbe): Promise<readonly string[]> {
  if (!bin) return [];
  return (await probeClaudeCli(bin, run)).problems;
}

/**
 * Writes the per-turn MCP config that points Claude Code at the publication API's /mcp
 * endpoint, and returns its path for `--mcp-config`. It lives under the daemon-owned
 * .builder/ dir (the agent is told not to touch it) rather than the workspace root, so it
 * never lands in the site's committed source. Returns the path for the argv.
 */
export async function writeMcpConfig(opts: SessionStartOptions): Promise<string> {
  const server: Record<string, unknown> = { type: 'http', url: opts.mcp.url };
  if (opts.mcp.headers && Object.keys(opts.mcp.headers).length > 0) {
    server.headers = opts.mcp.headers;
  }
  // 0640, and DELETED WHEN THE TURN ENDS (the cleanup thunk below). Under `systemd_scope`
  // the URL is the unit's loopback and there are NO headers — the egress gate adds the key on
  // the daemon's side (sessions/manager.ts buildStartOptions). Under a declared `none` this
  // file carries the museum's Publication API key: the turn needs it, nothing after does, and a
  // credential that stays resident in a directory an agent writes to is a credential
  // waiting to be committed, published or read by the next turn on another site. The mode
  // keeps it out of every uid on the host except the daemon and its own agent, which share
  // this instance's group.
  //
  // AND IT IS WRITTEN THROUGH THE FD-BASED WRITER, because a path-based one wrote the key
  // wherever a planted `.builder/mcp.json -> …` pointed — the museum's Publication API key
  // in a file of the agent's choosing, outliving the turn (the cleanup unlinks the LINK).
  // `SITES_ROOT` is the trusted prefix; everything below it, the workspace directory
  // included, is walked `O_NOFOLLOW`.
  //
  // AND THE TURN CAN OPEN IT. A confined turn is the SITE's identity, not the daemon: it reaches
  // `mcp.json` through `.builder`'s group `x` (0710, `DAEMON_STATE_DIR_MODE`), restated here for
  // a `.builder` made before that mode existed (0700 — EACCES on `--mcp-config` for every turn).
  const workspace = relativeUnderRoot(config.SITES_ROOT, opts.workspace);
  await restateDaemonStateDir(config.SITES_ROOT, join(workspace, '.builder'));
  return writeFileAgentReadable(
    config.SITES_ROOT,
    join(workspace, '.builder', 'mcp.json'),
    JSON.stringify({ mcpServers: { [opts.mcp.name]: server } }, null, 2),
  );
}

/**
 * THE SITE'S BRIEF, read by the daemon: `<workspace>/AGENTS.md` through the link- and
 * hard-link-refusing reader (the workspace is agent-writable; a planted link to a daemon file
 * would otherwise be read into the prompt — it is THROWN, never folded into "no brief").
 * Absent = no brief. Over `MAX_BRIEF_BYTES` = cut, and the cut is said.
 *
 * AND THE FILE IS THE AGENT'S, SO ITS SHAPE IS TOO. A build's `postinstall` can replace it
 * with a FIFO (an open that blocks a daemon thread, and this turn's setup, forever), a sparse
 * multi-GB file (read whole into the daemon before any cut), or a body with a NUL (an argv
 * cannot carry one: the unit's spawn throws and every later turn fails with no exit frame, so
 * no turn could ever repair it). So: opened non-blocking and refused unless REGULAR, never
 * more than `MAX_BRIEF_BYTES + 1` bytes read, and a NUL refused here — typed, named, before
 * anything is written or connected.
 */
export async function readBrief(workspace: string): Promise<string | undefined> {
  const relative = relativeUnderRoot(config.SITES_ROOT, workspace);
  const file = join(relative, 'AGENTS.md');
  const read = await readFileSharedBounded(config.SITES_ROOT, file, MAX_BRIEF_BYTES + 1);
  if (read === null || read.size === 0) return undefined;
  if (read.bytes.includes(0)) {
    throw new ValidationError(
      `${file} contains a NUL byte, which no argv can carry; the brief is refused and nothing was started. ` +
        `Remove the NUL from AGENTS.md (a person can edit it; the agent's next turn cannot run until it is fixed).`,
    );
  }
  if (read.size <= MAX_BRIEF_BYTES) return read.bytes.toString('utf8');
  console.warn(`[claude_code] ${file} is ${read.size} bytes; the brief is cut at ${MAX_BRIEF_BYTES}.`);
  const cut = read.bytes.subarray(0, MAX_BRIEF_BYTES).toString('utf8').replace(/\uFFFD+$/, '');
  return `${cut}\n\n[The site brief (AGENTS.md, ${read.size} bytes) was cut at ${MAX_BRIEF_BYTES} bytes.]`;
}

/** The per-turn seams: the binary and how it is probed. Production states neither. */
export interface ClaudeTurnSeams {
  readonly bin?: string;
  readonly run?: ProbeRunner;
}

/**
 * ONE TURN'S SETUP — the thunk the supervisor runs. The probe FIRST (the guarantee behind the
 * admission's courtesy): a binary that cannot carry the restriction flags refuses here, before
 * the MCP config is written and before anything is opened.
 */
export function claudeTurnSetup(opts: SessionStartOptions, seams: ClaudeTurnSeams = {}): () => Promise<TurnPlan> {
  const bin = seams.bin ?? config.CLAUDE_CODE_BIN;
  return async () => {
    await assertClaudeCliConfinable(bin, seams.run);
    const brief = await readBrief(opts.workspace);
    const mcpConfigPath = await writeMcpConfig(opts);
    return {
      argv: claudeTurnArgv({ bin, prompt: opts.prompt, mcpConfigPath, brief, resumeToken: opts.resumeToken }),
      parseLine: parseStreamJsonLine,
      cleanup: () => rm(mcpConfigPath, { force: true }),
    };
  };
}

function startTurn(opts: SessionStartOptions): AgentProcess {
  return spawnAgentProcess(opts, claudeTurnSetup(opts));
}

/**
 * Maps one line of Claude Code's stream-json output to zero or more AgentEvents.
 * The shapes handled: assistant text blocks, tool_use blocks, and the terminal result
 * message (which carries session_id → resumeToken, cost and duration). Anything else is
 * ignored (system/init frames, partial deltas we do not surface).
 */
export function parseStreamJsonLine(line: string): AgentEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }

  const events: AgentEvent[] = [];
  const type = msg.type as string | undefined;

  if (type === 'assistant') {
    const message = msg.message as { content?: unknown[] } | undefined;
    for (const block of message?.content ?? []) {
      const b = block as Record<string, unknown>;
      if (b.type === 'text' && typeof b.text === 'string') {
        events.push({ type: 'text', text: b.text });
      } else if (b.type === 'tool_use' && typeof b.name === 'string') {
        events.push({ type: 'tool', name: b.name, summary: summarizeTool(b) });
      }
    }
  } else if (type === 'result') {
    events.push({
      type: 'result',
      ok: true,
      resumeToken: typeof msg.session_id === 'string' ? msg.session_id : undefined,
      costUsd: typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : undefined,
      durationMs: typeof msg.duration_ms === 'number' ? msg.duration_ms : 0,
    });
  }
  return events;
}

function summarizeTool(block: Record<string, unknown>): string {
  const name = String(block.name ?? 'tool');
  const input = block.input as Record<string, unknown> | undefined;
  const target =
    (input?.file_path as string | undefined) ??
    (input?.path as string | undefined) ??
    (input?.command as string | undefined) ??
    (input?.query as string | undefined);
  return target ? `${name}: ${String(target).slice(0, 120)}` : name;
}

export const claudeCodeDriver: AgentDriver = {
  id: 'claude_code',
  capabilities: { resume: true, mcpHttp: true, reportsFileChanges: true },
  detect,
  admit: () => assertClaudeCliConfinable(),
  startTurn,
};
