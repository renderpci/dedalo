/**
 * GET /v1/status — what this publication host IS right now (spec §6 `status`): agent and
 * runtime versions, the pairing fingerprint, each API's current/previous release (from the
 * release store), the hash stamp of the LIVE media include (from rules/apply.ts), the media
 * probe, and free disk under the state root.
 *
 * Everything is read at request time — no cached copy that can disagree with the disk.
 * Read-only, takes no input, no audit line (nothing changed). The instance NAME is not in
 * the body: the fingerprint is the pairing proof, exactly as on /health. `handleStatus` is a
 * RouteHandler (src/router.ts) that uses neither the request nor its URL.
 */

import { statfs } from 'node:fs/promises';
import packageJson from '../../package.json';
import { config } from '../config';
import { probeMedia, type MediaProbe } from '../media/probe';
import { currentRelease, previousRelease } from '../releases/store';
import type { ApiName } from '../releases/ustar';
import { appliedRulesHash } from '../rules/apply';
import { instanceFingerprint } from '../security/pairing';
import { json } from '../util/response';

export interface AgentStatus {
  agent_version: string;
  bun_version: string;
  platform: string;
  instance_fingerprint: string;
  apis: Record<ApiName, { current: string | null; previous: string | null }>;
  rules: { server: string; hash: string | null };
  media: MediaProbe;
  disk: { state_root_free_bytes: number };
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
  const apis = {} as AgentStatus['apis'];
  for (const api of STATUS_APIS) {
    apis[api] = { current: currentRelease(api), previous: previousRelease(api) };
  }
  const [media, freeBytes] = await Promise.all([probeMedia(), stateRootFreeBytes()]);
  return {
    agent_version: AGENT_VERSION,
    bun_version: Bun.version,
    platform: `${process.platform}-${process.arch}`,
    instance_fingerprint: instanceFingerprint(config.INSTANCE, config.SERVICE_TOKEN),
    apis,
    rules: { server: config.WEB_SERVER, hash: appliedRulesHash() },
    media,
    disk: { state_root_free_bytes: freeBytes },
  };
}

export async function handleStatus(): Promise<Response> {
  return json(await buildStatus());
}
