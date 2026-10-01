/**
 * The OpenCode driver — a provider-agnostic alternative agent.
 *
 * Verified against: OpenCode CLI (json output). Invocation:
 * `opencode run "<prompt>" --format json`, with `--session <id>` to resume. MCP is wired
 * by a daemon-written opencode.json in the workspace (`type: "remote"`), and OpenCode
 * reads AGENTS.md natively. Its JSON stream is coarser than Claude Code's, so file
 * changes lean entirely on the git backstop in drivers/process.ts.
 *
 * Provider credentials come from OPENCODE_ENV (config), forwarded only to this driver's
 * child by the session manager's env builder.
 *
 * REFUSED UNDER `systemd_scope` (LEAD-1b_SPEC §0.3, "Still open"). The PLANT closure the
 * Claude Code driver has — every configuration source named in the argv, the `--help` flag
 * probe, the prompt after `--` — does not exist here: OpenCode loads the workspace's
 * `opencode.json` and `.opencode/` plugins and HOME's `~/.config/opencode`, and its prompt is
 * positional. A turn's write or a build's postinstall could plant a plugin the NEXT turn runs
 * as the site identity, `bash: deny` notwithstanding. So a confined host refuses the driver,
 * typed (503 `confinement.agent_cli_unsupported`), at every door: detect() (unavailable),
 * admit() (before the manager reserves anything) and the turn's setup (before anything is
 * written). Lift it only with that closure and its gate. Gate: tests/opencode_refusal.test.ts.
 */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';
import { ConfinementRefusedError } from '../errors';
import { relativeUnderRoot, writeFileAgentReadable } from '../util/shared_tree';
import { runBinary } from '../util/spawn';
import { spawnAgentProcess, type TurnPlan } from './process';
import type { AgentDriver, AgentEvent, DriverInfo, SessionStartOptions, AgentProcess } from './types';

const VERSION_PROBE_TIMEOUT_MS = 10_000;

type ConfinementMode = typeof config.AGENT_CONFINEMENT;

/**
 * THE REFUSAL (see the header): under `systemd_scope` no opencode turn runs. `none` is the
 * operator's declared-unconfined mode, where this driver's surface is the declaration's.
 */
export function assertOpencodeConfinable(mode: ConfinementMode = config.AGENT_CONFINEMENT): void {
  if (mode !== 'systemd_scope') return;
  throw new ConfinementRefusedError(
    'agent_cli_unsupported',
    "The opencode driver cannot run under AGENT_CONFINEMENT=systemd_scope: it loads the workspace's " +
      "opencode.json and .opencode/ plugins and HOME's ~/.config/opencode — files a turn or a build " +
      'can write — and nothing restricts those sources yet, so a planted plugin would run as the ' +
      'site identity. Use the claude_code driver on a confined host. Nothing was started.',
  );
}

/** The detection seams: the binary, the mode and how it is probed. Production states none. */
export interface OpencodeDetectSeams {
  readonly bin?: string;
  readonly mode?: ConfinementMode;
  readonly run?: (argv: readonly string[]) => Promise<{ exitCode: number | null; stdout: string }>;
}

/**
 * AVAILABLE MEANS RUNNABLE: under `systemd_scope` the driver is unavailable (/health,
 * /v1/capabilities) without even probing the binary — it would be refused at admission.
 */
export async function detectOpencode(seams: OpencodeDetectSeams = {}): Promise<DriverInfo | null> {
  const bin = seams.bin ?? config.OPENCODE_BIN;
  if (!bin) return null;
  if ((seams.mode ?? config.AGENT_CONFINEMENT) === 'systemd_scope') return null;
  const run =
    seams.run ??
    ((argv: readonly string[]) =>
      runBinary(argv, {
        timeoutMs: VERSION_PROBE_TIMEOUT_MS,
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
      }));
  const result = await run([bin, '--version']);
  if (result.exitCode !== 0) return null;
  const match = result.stdout.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { id: 'opencode', binPath: bin, version: match[0] };
}

/**
 * Writes the opencode.json that wires the publication API as a `remote` MCP server.
 * OpenCode discovers this file by name in the working directory, so unlike the Claude Code
 * driver it must live at the workspace root (not under .builder/); the agent is instructed
 * to leave it alone.
 */
export async function writeMcpConfig(opts: SessionStartOptions): Promise<string> {
  const server: Record<string, unknown> = { type: 'remote', url: opts.mcp.url };
  if (opts.mcp.headers && Object.keys(opts.mcp.headers).length > 0) {
    server.headers = opts.mcp.headers;
  }
  // The PERMISSION BLOCK is written by the daemon, in the daemon's own file, for the same
  // reason the Claude Code driver states its tool set in the argv: an agent's default
  // permissions are that project's decision and not this museum's. Bash and webfetch are
  // denied — arbitrary execution and an outbound channel — and editing, which is the whole
  // job, is allowed.
  //
  // 0640 and deleted when the turn ends: under a declared `none` this file carries the
  // Publication API key (under `systemd_scope` the gate adds it daemon-side). And it
  // goes through the FD-BASED writer (util/shared_tree.ts) for the same reason the Claude
  // Code driver's does — at the workspace ROOT the plant is even cheaper, since the agent
  // is told to leave this exact filename alone and can therefore replace it with a link to
  // anywhere the daemon can reach.
  return writeFileAgentReadable(
    config.SITES_ROOT,
    join(relativeUnderRoot(config.SITES_ROOT, opts.workspace), 'opencode.json'),
    JSON.stringify({ mcp: { [opts.mcp.name]: server }, permission: DENIED_PERMISSIONS }, null, 2),
  );
}

/** OpenCode's own vocabulary for the same closed statement the Claude Code driver makes. */
export const DENIED_PERMISSIONS: Readonly<Record<string, string>> = Object.freeze({
  bash: 'deny',
  webfetch: 'deny',
  edit: 'allow',
});

/** The per-turn seams. Production states none. */
export interface OpencodeTurnSeams {
  readonly bin?: string;
  readonly mode?: ConfinementMode;
  readonly writeConfig?: (opts: SessionStartOptions) => Promise<string>;
}

/**
 * ONE TURN'S SETUP — the refusal FIRST (the guarantee behind admit()'s courtesy): under
 * `systemd_scope` nothing is written and no argv is returned.
 */
export function opencodeTurnSetup(opts: SessionStartOptions, seams: OpencodeTurnSeams = {}): () => Promise<TurnPlan> {
  return async () => {
    assertOpencodeConfinable(seams.mode ?? config.AGENT_CONFINEMENT);
    const configPath = await (seams.writeConfig ?? writeMcpConfig)(opts);
    const argv = [seams.bin ?? config.OPENCODE_BIN, 'run', opts.prompt, '--format', 'json'];
    if (opts.resumeToken) argv.push('--session', opts.resumeToken);
    return { argv, parseLine: parseJsonLine, cleanup: () => rm(configPath, { force: true }) };
  };
}

function startTurn(opts: SessionStartOptions): AgentProcess {
  return spawnAgentProcess(opts, opencodeTurnSetup(opts));
}

/**
 * Maps one line of OpenCode's `--format json` output to zero or more AgentEvents. The
 * stream is coarser and more version-variable than Claude Code's, so this reads each field
 * defensively and surfaces only text, tool and the terminal session (→ resumeToken) frames;
 * file changes are left to the git backstop (drivers/process.ts).
 */
function parseJsonLine(line: string): AgentEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return [];
  }
  const events: AgentEvent[] = [];
  // OpenCode's json emits assistant text and tool events; shapes vary by version, so we
  // read defensively and let the git backstop cover file changes.
  if (typeof msg.text === 'string') events.push({ type: 'text', text: msg.text });
  if (typeof msg.tool === 'string') {
    events.push({ type: 'tool', name: msg.tool, summary: String(msg.tool) });
  }
  if (msg.type === 'session' && typeof msg.id === 'string') {
    events.push({ type: 'result', ok: true, resumeToken: msg.id, durationMs: 0 });
  }
  return events;
}

export const opencodeDriver: AgentDriver = {
  id: 'opencode',
  capabilities: { resume: true, mcpHttp: true, reportsFileChanges: false },
  detect: () => detectOpencode(),
  admit: async () => assertOpencodeConfinable(),
  startTurn,
};
