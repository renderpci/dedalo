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

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';
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

async function writeMcpConfig(opts: SessionStartOptions): Promise<void> {
  const path = join(opts.workspace, 'opencode.json');
  const server: Record<string, unknown> = { type: 'remote', url: opts.mcp.url };
  if (opts.mcp.headers && Object.keys(opts.mcp.headers).length > 0) {
    server.headers = opts.mcp.headers;
  }
  await writeFile(path, JSON.stringify({ mcp: { [opts.mcp.name]: server } }, null, 2), 'utf8');
}

function startTurn(opts: SessionStartOptions): AgentProcess {
  return spawnAgentProcess(opts, async () => {
    await writeMcpConfig(opts);
    const argv = [config.OPENCODE_BIN, 'run', opts.prompt, '--format', 'json'];
    if (opts.resumeToken) argv.push('--session', opts.resumeToken);
    return { argv, parseLine: parseJsonLine };
  });
}

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
