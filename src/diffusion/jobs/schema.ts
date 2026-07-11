/**
 * Durable diffusion job store — table bootstrap (DIFFUSION_SPEC §4.2).
 *
 * TS-OWNED infrastructure tables (deliberate, documented exception to the
 * "no bespoke tables" convention — a job queue is high-churn operational
 * state: heartbeats, checkpoints, FOR UPDATE SKIP LOCKED claiming; squeezing
 * it through matrix JSONB rows buys nothing. dd1758 REMAINS the user-facing
 * publication ledger). Naming follows the established `dedalo_ts_*` prefix
 * (component locks / session store precedent); bootstrap is the same lazy
 * idempotent CREATE IF NOT EXISTS those modules use — the TS tree is
 * self-contained, there is no install/db step.
 *
 * All SQL here runs through src/core/db/postgres.ts (the only SQL surface);
 * MariaDB never appears in this module (spec §2.5 module boundary).
 *
 * Lifecycle states:
 *   queued → running → completed | failed | cancelled
 *                    ↘ interrupted (stale heartbeat / dead runner) → queued (re-attempt)
 *
 * One ACTIVE run per (element, section) is enforced by a partial unique index
 * — the client label 'process_diffusion_{user}_{element}_{section}' therefore
 * maps to at most one active job, which is what makes the copied client's
 * reconnect-by-label deterministic.
 */

import { readEnv } from '../../config/env.ts';
import { sql } from '../../core/db/postgres.ts';

/**
 * TEST-ONLY table override (S1-17 / DEC-18a). One shared jobs table + an
 * always-on 2 s scheduler meant `bun test` and the live dev server CLAIMED
 * EACH OTHER'S JOBS — the real mechanism behind the ledgered
 * diffusion_server_control flake (live-scheduler interference, not parallel
 * load). The bun-test preload (test/preload/session_db.ts) points
 * DIFFUSION_JOBS_TABLE at a scratch table, so test queues/schedulers and the
 * live control plane never share state. Guard: an override MUST carry the
 * scratch prefix `dedalo_ts_test_` — production can never be redirected to an
 * arbitrary table. The remote-runner-era `runner_group` column (DEC-18b)
 * composes with, and will not replace, this seam.
 */
function resolveJobsTable(): string {
	// readEnv (not process.env) per the S2-21 config rule; the bun-test preload
	// sets this in the real process env, which wins the precedence chain anyway,
	// and the dedalo_ts_test_ guard below keeps ANY source from redirecting
	// production to an arbitrary table.
	const override = readEnv('DIFFUSION_JOBS_TABLE');
	if (override === undefined || override === '') {
		return 'dedalo_ts_diffusion_jobs';
	}
	if (!/^dedalo_ts_test_[a-z0-9_]*$/.test(override)) {
		throw new Error(
			`DIFFUSION_JOBS_TABLE override '${override}' rejected: it is a TEST seam and must match /^dedalo_ts_test_[a-z0-9_]*$/.`,
		);
	}
	return override;
}

export const DIFFUSION_JOBS_TABLE = resolveJobsTable();
export const DIFFUSION_JOB_EVENTS_TABLE =
	DIFFUSION_JOBS_TABLE === 'dedalo_ts_diffusion_jobs'
		? 'dedalo_ts_diffusion_job_events'
		: `${DIFFUSION_JOBS_TABLE}_events`;

/** Job lifecycle states (checked constraint below must match). */
export type DiffusionJobState =
	| 'queued'
	| 'running'
	| 'completed'
	| 'failed'
	| 'cancelled'
	| 'interrupted';

let ensured: Promise<void> | null = null;

/**
 * Idempotent table bootstrap. Memoized per process; safe to await from every
 * queue entry point (locks.ts pattern). Additive-only evolution: new columns
 * arrive as separate ALTER IF NOT EXISTS statements appended here.
 */
export function ensureDiffusionJobTables(): Promise<void> {
	if (ensured === null) {
		ensured = createTables().catch((error) => {
			// A failed bootstrap must not poison the memo forever (e.g. transient
			// DB outage at first call) — reset so the next caller retries.
			ensured = null;
			throw error;
		});
	}
	return ensured;
}

async function createTables(): Promise<void> {
	await sql.unsafe(`
		CREATE TABLE IF NOT EXISTS "${DIFFUSION_JOBS_TABLE}" (
			job_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			client_process_id text NOT NULL,
			owner_user_id     integer NOT NULL,
			kind              text NOT NULL DEFAULT 'diffuse',
			spec              jsonb NOT NULL,
			state             text NOT NULL DEFAULT 'queued'
				CHECK (state IN ('queued','running','completed','failed','cancelled','interrupted')),
			checkpoint        jsonb NOT NULL DEFAULT '{}'::jsonb,
			totals            jsonb NOT NULL DEFAULT '{}'::jsonb,
			errors            jsonb NOT NULL DEFAULT '[]'::jsonb,
			result            jsonb,
			cancel_requested  boolean NOT NULL DEFAULT false,
			attempt           integer NOT NULL DEFAULT 0,
			max_attempts      integer NOT NULL DEFAULT 3,
			runner            jsonb NOT NULL DEFAULT '{}'::jsonb,
			heartbeat_at      timestamptz,
			created_at        timestamptz NOT NULL DEFAULT now(),
			started_at        timestamptz,
			finished_at       timestamptz
		)
	`);
	// One ACTIVE run per publication target (element + section). The spec keys
	// are stamped by enqueueDiffusionJob — never trusted from the raw client SQO.
	await sql.unsafe(`
		CREATE UNIQUE INDEX IF NOT EXISTS ${DIFFUSION_JOBS_TABLE}_active_target_idx
			ON "${DIFFUSION_JOBS_TABLE}" ((spec->>'diffusion_element_tipo'), (spec->>'section_tipo'))
			WHERE state IN ('queued','running')
	`);
	await sql.unsafe(`
		CREATE INDEX IF NOT EXISTS ${DIFFUSION_JOBS_TABLE}_owner_created_idx
			ON "${DIFFUSION_JOBS_TABLE}" (owner_user_id, created_at DESC)
	`);
	await sql.unsafe(`
		CREATE INDEX IF NOT EXISTS ${DIFFUSION_JOBS_TABLE}_state_idx
			ON "${DIFFUSION_JOBS_TABLE}" (state)
			WHERE state IN ('queued','running')
	`);
	await sql.unsafe(`
		CREATE TABLE IF NOT EXISTS "${DIFFUSION_JOB_EVENTS_TABLE}" (
			event_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
			job_id    uuid NOT NULL REFERENCES "${DIFFUSION_JOBS_TABLE}" (job_id) ON DELETE CASCADE,
			at        timestamptz NOT NULL DEFAULT now(),
			level     text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','error')),
			phase     text NOT NULL DEFAULT '',
			payload   jsonb NOT NULL DEFAULT '{}'::jsonb
		)
	`);
	await sql.unsafe(`
		CREATE INDEX IF NOT EXISTS ${DIFFUSION_JOB_EVENTS_TABLE}_job_idx
			ON "${DIFFUSION_JOB_EVENTS_TABLE}" (job_id, event_id)
	`);
}

/** Test hook: drop the memo so a suite that truncates tables can re-ensure. */
export function resetEnsureMemoForTests(): void {
	ensured = null;
}
