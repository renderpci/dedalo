/**
 * GET /v1/status — what this publication host IS right now (spec §6 `status`): agent and
 * runtime versions, the pairing fingerprint, which APIs the host serves (`served_apis`: v2
 * always, v1 only with PHP_BIN), each API's current/previous release (from the release store), the hash stamp of the LIVE media include (from rules/apply.ts), the
 * host-wide nginx map's state for this instance (rules/map.ts hostMapStatus), the media
 * probe, free disk under the state root, and (fapolicyd hosts) the trust oneshot's last record.
 *
 * Everything is read at request time — no cached copy that can disagree with the disk.
 * Read-only, takes no input, no audit line (nothing changed). The instance NAME is not in
 * the body: the fingerprint is the pairing proof, exactly as on /health. `handleStatus` is a
 * RouteHandler (src/router.ts) that uses neither the request nor its URL.
 */

import { statfs } from 'node:fs/promises';
import packageJson from '../../package.json';
import { config, hostServedApis } from '../config';
import { probeMedia, type MediaProbe } from '../media/probe';
import { currentRelease, previousRelease } from '../releases/store';
import type { ApiName } from '../releases/ustar';
import { appliedRulesHash } from '../rules/apply';
import { hostMapStatus, type RulesMapStatus } from '../rules/map';
import type { TrustResult } from '../provision/fapolicyd_trust';
import { readTrustRecord, trustUnit } from '../releases/trust';
import { instanceFingerprint } from '../security/pairing';
import { json } from '../util/response';

export interface AgentStatus {
  agent_version: string;
  bun_version: string;
  platform: string;
  instance_fingerprint: string;
  /**
   * The APIs this host serves (src/config.ts servedApis): ['v1', 'v2'], or ['v2'] on a v2-only
   * host. `apis` keeps both keys; an unserved API's slot is {current: null, previous: null}.
   */
  served_apis: readonly ApiName[];
  apis: Record<ApiName, { current: string | null; previous: string | null }>;
  /** `map`: the host-wide nginx map (spec §13.4) — null on apache, `{managed: false}` when placed by hand. */
  rules: { server: string; hash: string | null; map: RulesMapStatus };
  media: MediaProbe;
  disk: { state_root_free_bytes: number };
  /**
   * fapolicyd (owner decision 2026-10-09): null on a host without it (no TRUST_UNIT); else the
   * trust oneshot's last record (`record: null` = it never ran or left none readable).
   */
  trust: { unit: string; record: TrustResult | null } | null;
}

export const AGENT_VERSION: string = packageJson.version;

/** The APIs this agent deploys, in report order. */
export const STATUS_APIS: readonly ApiName[] = Object.freeze(['v1', 'v2'] as const);

/** Bytes available to an unprivileged writer (bavail, not bfree) on the state root's filesystem. */
export async function stateRootFreeBytes(root: string = config.STATE_ROOT): Promise<number> {
  const fs = await statfs(root);
  return Number(fs.bavail) * Number(fs.bsize);
}

export async function buildStatus(): Promise<AgentStatus> {
  const served = hostServedApis();
  const apis = {} as AgentStatus['apis'];
  for (const api of STATUS_APIS) {
    // An unserved API has no tree here: its slot is empty, never read from disk.
    apis[api] = served.includes(api)
      ? { current: currentRelease(api), previous: previousRelease(api) }
      : { current: null, previous: null };
  }
  const [media, freeBytes] = await Promise.all([probeMedia(), stateRootFreeBytes()]);
  return {
    agent_version: AGENT_VERSION,
    bun_version: Bun.version,
    platform: `${process.platform}-${process.arch}`,
    instance_fingerprint: instanceFingerprint(config.INSTANCE, config.SERVICE_TOKEN),
    served_apis: [...served],
    apis,
    rules: { server: config.WEB_SERVER, hash: appliedRulesHash(), map: hostMapStatus() },
    media,
    disk: { state_root_free_bytes: freeBytes },
    trust: (() => {
      const unit = trustUnit();
      return unit === null ? null : { unit, record: readTrustRecord() };
    })(),
  };
}

export async function handleStatus(): Promise<Response> {
  return json(await buildStatus());
}
