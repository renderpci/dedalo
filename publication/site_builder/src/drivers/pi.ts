/**
 * The Pi driver — a placeholder behind the common interface.
 *
 * Pi is a planned third agent. Its detect() is wired (so capabilities/health report it
 * accurately once a PI_BIN is configured and the version probe succeeds), but startTurn
 * is not implemented until the CLI's flags and stream shape are verified against a pinned
 * version. Keeping the driver registered — rather than absent — means the plumbing
 * (registry, capabilities, config keys) is exercised now and the only remaining work is
 * this file's turn logic.
 */

import { config } from '../config';
import { runBinary } from '../util/spawn';
import type { AgentDriver, DriverInfo, SessionStartOptions, AgentProcess } from './types';

const VERSION_PROBE_TIMEOUT_MS = 10_000;

async function detect(): Promise<DriverInfo | null> {
  const bin = config.PI_BIN;
  if (!bin) return null;
  const result = await runBinary([bin, '--version'], {
    timeoutMs: VERSION_PROBE_TIMEOUT_MS,
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
  });
  if (result.exitCode !== 0) return null;
  const match = result.stdout.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { id: 'pi', binPath: bin, version: match[0] };
}

function startTurn(_opts: SessionStartOptions): AgentProcess {
  throw new Error('The Pi driver is not yet implemented. Configure claude_code or opencode.');
}

export const piDriver: AgentDriver = {
  id: 'pi',
  capabilities: { resume: false, mcpHttp: true, reportsFileChanges: false },
  detect,
  startTurn,
};
