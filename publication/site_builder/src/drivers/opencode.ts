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
 */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';
import { relativeUnderRoot, writeFileAgentReadable } from '../util/shared_tree';
import { runBinary } from '../util/spawn';
import { spawnAgentProcess } from './process';
import type { AgentDriver, AgentEvent, DriverInfo, SessionStartOptions, AgentProcess } from './types';

const VERSION_PROBE_TIMEOUT_MS = 10_000;

async function detect(): Promise<DriverInfo | null> {
  const bin = config.OPENCODE_BIN;
  if (!bin) return null;
  const result = await runBinary([bin, '--version'], {
    timeoutMs: VERSION_PROBE_TIMEOUT_MS,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
  });
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
  // 0640 and deleted when the turn ends: this file carries the Publication API key. And it
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

function startTurn(opts: SessionStartOptions): AgentProcess {
  return spawnAgentProcess(opts, async () => {
    const configPath = await writeMcpConfig(opts);
    const argv = [config.OPENCODE_BIN, 'run', opts.prompt, '--format', 'json'];
    if (opts.resumeToken) argv.push('--session', opts.resumeToken);
    return { argv, parseLine: parseJsonLine, cleanup: () => rm(configPath, { force: true }) };
  });
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
  detect,
  startTurn,
};
