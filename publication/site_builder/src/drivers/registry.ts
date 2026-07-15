/**
 * Driver registry — selection and availability detection.
 *
 * The registry maps a DriverId to its implementation and knows which binary each is
 * configured to use. `detectDrivers()` backs GET /health and GET /v1/capabilities: it
 * reports, per driver, whether it is usable on this host right now. A driver whose binary
 * is unconfigured (empty *_BIN) or absent reports unavailable rather than failing a
 * session start later with a confusing spawn error.
 */

import { config } from '../config';
import type { AgentDriver, DriverId, DriverInfo } from './types';
import { claudeCodeDriver } from './claude_code';
import { opencodeDriver } from './opencode';
import { piDriver } from './pi';

const DRIVERS: Record<DriverId, AgentDriver> = {
  claude_code: claudeCodeDriver,
  opencode: opencodeDriver,
  pi: piDriver,
};

// Test-only overrides: the session-orchestration tests inject a fake driver here so the
// full manager → store → SSE → git path can be exercised without a real agent CLI. Never
// set outside tests; production reads only DRIVERS.
const testOverrides = new Map<DriverId, AgentDriver>();

export function getDriver(id: DriverId): AgentDriver {
  return testOverrides.get(id) ?? DRIVERS[id];
}

/** TEST ONLY — override (or with null, restore) a driver implementation. */
export function __setTestDriver(id: DriverId, driver: AgentDriver | null): void {
  if (driver) testOverrides.set(id, driver);
  else testOverrides.delete(id);
}

export interface DriverAvailability {
  id: DriverId;
  available: boolean;
  version: string | null;
  is_default: boolean;
}

/** Probes every driver's binary. Results feed /health and /v1/capabilities. */
export async function detectDrivers(): Promise<DriverAvailability[]> {
  const results = await Promise.all(
    (Object.keys(DRIVERS) as DriverId[]).map(async id => {
      let info: DriverInfo | null = null;
      try {
        info = await DRIVERS[id].detect();
      } catch {
        info = null;
      }
      return {
        id,
        available: info !== null,
        version: info?.version ?? null,
        is_default: id === config.AGENT_DRIVER,
      };
    }),
  );
  return results;
}
