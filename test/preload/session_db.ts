/**
 * bun-test preload (bunfig.toml [test].preload) — the S1-18 isolation seam.
 *
 * session_store.ts opens its sqlite Database at module init; without this
 * override every `bun test` run shares — and resetSessionStoreForTests wipes —
 * the LIVE ../private/dedalo_ts_sessions.sqlite while the dev server holds it
 * open. The preload runs before any test module is imported, so the env var is
 * visible to the store's readEnv at open time. An externally provided
 * DEDALO_SESSION_DB_PATH (CI, package scripts) wins.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** One per-run scratch dir shared by the file-path seams below (lazy — only
 * created when at least one override is not externally provided). */
let scratchDirValue: string | undefined;
function scratchDir(): string {
	scratchDirValue ??= mkdtempSync(join(tmpdir(), 'dedalo_ts_test_sessions-'));
	return scratchDirValue;
}

if (process.env.DEDALO_SESSION_DB_PATH === undefined) {
	process.env.DEDALO_SESSION_DB_PATH = join(scratchDir(), 'sessions.sqlite');
}

// Server-state isolation seam (ops-test audit 2026-07-07, same S1-18 shape):
// server_state.ts writes <private>/ts_state.json — the widget round-trip test
// flips maintenance_mode on the LIVE server mid-test, and a killed run leaves
// production in maintenance mode. Point the whole test process at a per-run
// scratch file. An externally provided value (CI, package scripts) wins.
if (process.env.DEDALO_TS_STATE_PATH === undefined) {
	process.env.DEDALO_TS_STATE_PATH = join(scratchDir(), 'ts_state.json');
}

// S1-17 / DEC-18a — diffusion job-queue isolation seam: point every queue and
// scheduler that a test process spins up at a SCRATCH jobs table, so bun test
// and the live dev server's always-on scheduler stop claiming each other's
// jobs (the real mechanism behind the ledgered diffusion_server_control flake
// — live-scheduler interference, not parallel load). schema.ts enforces the
// dedalo_ts_test_ prefix. Same for the dd1758 activity-ledger seam (the jobs
// twin): tests that drive deleteDiffusionRecord/retryPendingDiffusion must
// read and write a SCRATCH activity table, never the REAL
// matrix_activity_diffusion — a test's stub engine could otherwise flip real
// pending rows to 'unpublished' without any actual delete, and ≥10 older real
// pending rows starve the probe rows (the ledgered retry-queue intermittent).
// diffusion_delete.ts enforces the same prefix.
//
// PRECEDENCE, made explicit (2026-08-25) because the two rules pull in
// opposite directions and the old "set only when undefined" silently picked
// one of them:
//  1. A SHARD ASSIGNMENT WINS OVER AN INHERITED VALUE. DEDALO_TEST_SHARD_ID
//     (exported by the shard runner) means several bun-test processes share
//     one Postgres — every shard MUST get its own pair of tables, so the
//     suffixed names are set UNCONDITIONALLY. Under the undefined-only rule a
//     shard id was a silent no-op the moment ANY value was inherited (a CI
//     export, a parent runner's own seam), and two shards then claimed each
//     other's jobs — exactly the flake this preload exists to kill. The
//     suffix keeps schema.ts's dedalo_ts_test_ prefix, so the production
//     refusal still holds.
//  2. An EXTERNAL VALUE WINS in the ABSENCE of a shard assignment: a CI or
//     package-script export names the table on purpose, and an unsharded run
//     has no reason to override it.
//  3. Otherwise, the fixed scratch defaults.
// A malformed shard id REFUSES loudly (throwing here aborts the whole run —
// the right failure for a runner bug) rather than falling through to shared
// tables and reintroducing the cross-claim silently.
const shardId = process.env.DEDALO_TEST_SHARD_ID;
if (shardId !== undefined) {
	if (!/^\d+$/.test(shardId)) {
		throw new Error(
			`test preload: DEDALO_TEST_SHARD_ID='${shardId}' is not a plain integer. Refusing to guess a diffusion-table suffix — a wrong guess means two shards claim each other's jobs.`,
		);
	}
	process.env.DIFFUSION_JOBS_TABLE = `dedalo_ts_test_diffusion_jobs__shard${shardId}`;
	process.env.DIFFUSION_ACTIVITY_TABLE = `dedalo_ts_test_activity_diffusion__shard${shardId}`;
} else {
	if (process.env.DIFFUSION_JOBS_TABLE === undefined) {
		process.env.DIFFUSION_JOBS_TABLE = 'dedalo_ts_test_diffusion_jobs';
	}
	if (process.env.DIFFUSION_ACTIVITY_TABLE === undefined) {
		process.env.DIFFUSION_ACTIVITY_TABLE = 'dedalo_ts_test_activity_diffusion';
	}
}
