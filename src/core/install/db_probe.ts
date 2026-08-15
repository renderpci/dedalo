/**
 * Connection probes (PHP installer test_db_connection / test_diffusion_connection).
 * Both take POSTED credentials and answer the client contract `{result, msg,
 * ...}`. The Postgres probe additionally distinguishes "DB missing" from
 * "auth/host wrong" by falling back to the `postgres` maintenance DB, so the
 * wizard can tell the operator whether to create the database.
 *
 * This module is the EFFECTFUL shell only — the option coercion and the
 * outcome classification live in db_probe_plan.ts (pure, gate-testable).
 */

import type { DbProbeResult } from './db_probe_plan.ts';
import { classifyDbProbe, diffusionConnFromOptions, pgConnFromOptions } from './db_probe_plan.ts';
import { psqlSelect1 } from './pg_exec.ts';

export type { DbProbeResult } from './db_probe_plan.ts';

/** Probe the posted Postgres connection (target DB, then `postgres` fallback). */
export async function testDbConnection(o: Record<string, unknown>): Promise<DbProbeResult> {
	const conn = pgConnFromOptions(o);
	if (conn.database === '' || conn.user === '') {
		return {
			result: false,
			can_connect: false,
			db_exists: false,
			can_create: false,
			msg: 'Database name and user are required',
		};
	}

	// 1) Try the target database directly.
	const target = await psqlSelect1(conn);
	if (target.exitCode === 0) {
		return classifyDbProbe(conn.database, target, null);
	}

	// 2) Only on failure do we spawn the maintenance-DB fallback.
	const maintenance = await psqlSelect1(conn, 'postgres');
	return classifyDbProbe(conn.database, target, maintenance);
}

export interface DiffusionProbeResult {
	result: boolean;
	msg: string;
}

/** Probe the posted MariaDB diffusion connection (one-shot, then closed). */
export async function testDiffusionConnection(
	o: Record<string, unknown>,
): Promise<DiffusionProbeResult> {
	// Reach MariaDB ONLY through the diffusion facade (boundary_seam rule).
	const { probeDiffusionConnection } = await import('../../diffusion/api/info.ts');
	// The facade now answers `{ok, code?, message}` (P1 error sweep). The install
	// wizard's own `{result,msg}` step contract is untouched here — it is the
	// install sweep's to retire; this is the one-line adapter between them.
	const status = await probeDiffusionConnection(diffusionConnFromOptions(o));
	return { result: status.ok, msg: status.message };
}
