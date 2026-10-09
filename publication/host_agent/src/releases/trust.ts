/**
 * THE AGENT'S SIDE OF FAPOLICYD (owner decision 2026-10-09). On a fapolicyd host the
 * provisioner renders `dedalo-pubhost-trust-<instance>.service` and names it in the env file
 * (config.TRUST_UNIT, TRUST_RESULT_FILE); everywhere else both are absent and nothing here runs.
 *
 * The agent never says WHAT to trust: it `systemctl start`s the root oneshot (exec.ts startTrust,
 * no argument — polkit grants exactly that pair) and reads the record it leaves. The oneshot
 * derives the set itself (src/provision/fapolicyd_trust.ts: bun_bin, agent_dir, each served API's
 * `current` and the store's `previous`), so the moments matter, and install.ts calls in at them:
 *   - install: after commitStaging, BEFORE the scratch boot — the new release is then the store's
 *     `previous` (the newest other release), so it is trusted before it ever runs; a reused
 *     release is first stamped newest (store.ts markNewest) for the same reason;
 *   - rollback: BEFORE the swap — the target is the store's `previous`, trusted already, proved;
 *   - after either swap: once more, to record the final state (never fatal: the code that runs
 *     was trusted before it ran).
 */
import { readFileSync } from 'node:fs';
import { config } from '../config';
import { ReleaseRefusedError } from '../errors';
import { exec } from '../exec';
import type { TrustResult } from '../provision/fapolicyd_trust';
import { parseTrustResult } from '../provision/fapolicyd_trust';
import type { ApiName } from './ustar';

/** What one trigger learned: the oneshot's exit and its record (null = none readable). */
export interface TrustReport {
  readonly code: number;
  readonly record: TrustResult | null;
}

const OK = new Set(['applied', 'unchanged', 'inactive']);

let seam: { readonly unit: string; readonly resultFile: string } | null = null;

/** Test seam: a fapolicyd host's two keys without a second env file. Refused outside NODE_ENV=test. */
export function setTrustSeamForTests(value: { unit: string; resultFile: string } | null): () => void {
  if (config.NODE_ENV !== 'test') throw new Error('setTrustSeamForTests is refused outside NODE_ENV=test');
  const previous = seam;
  seam = value;
  return () => {
    seam = previous;
  };
}

/** The trust unit this agent starts, or null on a host without fapolicyd. */
export function trustUnit(): string | null {
  return seam?.unit ?? config.TRUST_UNIT ?? null;
}

function resultFile(): string | null {
  return seam?.resultFile ?? config.TRUST_RESULT_FILE ?? null;
}

/** The trust record as the oneshot left it, or null (no fapolicyd, absent, not one of ours). */
export function readTrustRecord(): TrustResult | null {
  const file = resultFile();
  if (file === null) return null;
  try {
    return parseTrustResult(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Start the oneshot once; null on a host without one. */
export async function triggerTrust(): Promise<TrustReport | null> {
  if (trustUnit() === null) return null;
  const started = await exec().startTrust();
  return { code: started.code, record: readTrustRecord() };
}

/**
 * A trigger that must succeed before `<api>:<id>` runs: the oneshot exits 0, its record says the
 * set is loaded (or read at the daemon's start), AND lists THAT release among the trusted — a
 * release the derivation left out (fapolicyd_trust.ts `refused`) is refused here, by name.
 */
export async function requireTrust(api: ApiName, releaseId: string, what: string): Promise<TrustReport | null> {
  const report = await triggerTrust();
  if (report === null) return null;
  const record = report.record;
  if (report.code === 0 && record !== null && OK.has(record.outcome) && record.releases.includes(`${api}:${releaseId}`)) return report;
  const missing = report.code === 0 && record !== null && OK.has(record.outcome) ? [`${api}:${releaseId} is not among the trusted releases`] : [];
  const reasons = [...missing, ...(record?.reasons ?? [])].join('; ') || 'no reason recorded';
  throw new ReleaseRefusedError(
    'trust_failed',
    `fapolicyd: ${trustUnit()}.service exited ${report.code} (${record?.outcome ?? 'no record'}: ${reasons}), so ${what} was refused before it ran; the previous release still serves`,
    { trust: record },
  );
}

/** The trust state for an audit line: outcome and counts, never a path list. */
export function trustDetail(report: TrustReport | null): Record<string, unknown> | null {
  if (report === null) return null;
  return {
    code: report.code,
    outcome: report.record?.outcome ?? null,
    entries: report.record?.entries ?? null,
    releases: report.record?.releases ?? [],
  };
}
