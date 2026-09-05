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
 */

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config';
import { relativeUnderRoot, writeFileAgentReadable } from '../util/shared_tree';
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
  // 0640, and DELETED WHEN THE TURN ENDS (the cleanup thunk below). This file carries the
  // museum's Publication API key: the turn needs it, nothing after the turn does, and a
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
  return writeFileAgentReadable(
    config.SITES_ROOT,
    join(relativeUnderRoot(config.SITES_ROOT, opts.workspace), '.builder', 'mcp.json'),
    JSON.stringify({ mcpServers: { [opts.mcp.name]: server } }, null, 2),
  );
}

/**
 * THE TOOLS A SITE BUILD NEEDS, and the complete set this driver grants.
 *
 * Read, Write, Edit and Glob/Grep are the whole of "build a website in this directory"; the
 * MCP server is the one door to museum data and is named as a wildcard so the publication
 * API's tool list can grow without this constant becoming a second census of it.
 */
export const ALLOWED_TOOLS: readonly string[] = Object.freeze([
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'TodoWrite',
  'mcp__dedalo_publication',
]);

/**
 * THE TOOLS NO SITE BUILD MAY HAVE, whatever the allow list or a future default says.
 *
 * Bash is arbitrary execution — the confinement makes that a bounded uid rather than a
 * bounded capability, and a museum's site builder has no legitimate use for it. WebFetch
 * and WebSearch are the outbound half of a disclosure: everything the read tools can reach
 * becomes exfiltrable the moment the agent can address a URL of its own choosing.
 */
export const DENIED_TOOLS: readonly string[] = Object.freeze(['Bash', 'WebFetch', 'WebSearch']);

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
      '--allowedTools',
      ALLOWED_TOOLS.join(','),
      '--disallowedTools',
      DENIED_TOOLS.join(','),
    ];
    if (opts.resumeToken) {
      argv.push('--resume', opts.resumeToken);
    }
    return {
      argv,
      parseLine: parseStreamJsonLine,
      cleanup: () => rm(mcpConfigPath, { force: true }),
    };
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
