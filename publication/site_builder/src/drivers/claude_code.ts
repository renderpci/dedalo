/**
 * The Claude Code driver — the default agent.
 *
 * Verified against: Claude Code CLI 1.x (stream-json output format). The CLI's flags move
 * fast; detect() refuses a version it has not been tested against rather than mis-parsing
 * a changed stream shape.
 *
 * Invocation: `claude -p "<prompt>" --output-format stream-json --verbose
 * --permission-mode acceptEdits --max-turns 50 --mcp-config <workspace>/.builder/mcp.json`,
 * with `--resume <id>` to continue a session. The MCP config points the agent at the
 * publication API's /mcp endpoint, so its only data reach is the read-only published data.
 *
 * The child environment is a tight allowlist — ANTHROPIC_API_KEY, HOME, PATH — assembled
 * by the session manager, never process.env. Claude Code reads CLAUDE.md natively (the
 * symlink to AGENTS.md).
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';
import { runBinary } from '../util/spawn';
import { spawnAgentProcess } from './process';
import type {
  AgentDriver,
  AgentEvent,
  DriverInfo,
  SessionStartOptions,
  AgentProcess,
} from './types';

const VERSION_PROBE_TIMEOUT_MS = 10_000;
// Major versions whose stream-json shape this parser has been validated against.
const SUPPORTED_MAJORS = new Set([1, 2]);

async function detect(): Promise<DriverInfo | null> {
  const bin = config.CLAUDE_CODE_BIN;
  if (!bin) return null;
  const result = await runBinary([bin, '--version'], {
    timeoutMs: VERSION_PROBE_TIMEOUT_MS,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
  });
  if (result.exitCode !== 0) return null;
  // Output like "1.2.3 (Claude Code)"; take the leading semver.
  const match = result.stdout.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  const major = Number(match[1]);
  if (!SUPPORTED_MAJORS.has(major)) return null;
  return { id: 'claude_code', binPath: bin, version: match[0] };
}

async function writeMcpConfig(opts: SessionStartOptions): Promise<string> {
  const path = join(opts.workspace, '.builder', 'mcp.json');
  const server: Record<string, unknown> = { type: 'http', url: opts.mcp.url };
  if (opts.mcp.headers && Object.keys(opts.mcp.headers).length > 0) {
    server.headers = opts.mcp.headers;
  }
  await writeFile(path, JSON.stringify({ mcpServers: { [opts.mcp.name]: server } }, null, 2), 'utf8');
  return path;
}

function startTurn(opts: SessionStartOptions): AgentProcess {
  return spawnAgentProcess(opts, async () => {
    const mcpConfigPath = await writeMcpConfig(opts);
    const argv = [
      config.CLAUDE_CODE_BIN,
      '-p',
      opts.prompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'acceptEdits',
      '--max-turns',
      '50',
      '--mcp-config',
      mcpConfigPath,
    ];
    if (opts.resumeToken) {
      argv.push('--resume', opts.resumeToken);
    }
    return { argv, parseLine: parseStreamJsonLine };
  });
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
  startTurn,
};
