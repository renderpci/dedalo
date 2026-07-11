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
// dedalo_ts_test_ prefix. An externally provided value (CI) wins.
if (process.env.DIFFUSION_JOBS_TABLE === undefined) {
	process.env.DIFFUSION_JOBS_TABLE = 'dedalo_ts_test_diffusion_jobs';
}

// dd1758 activity-ledger isolation seam (the jobs-table seam twin): tests that
// drive deleteDiffusionRecord/retryPendingDiffusion must read and write a
// SCRATCH activity table, never the REAL matrix_activity_diffusion — a test's
// stub engine could otherwise flip real pending rows to 'unpublished' without
// any actual delete, and ≥10 older real pending rows starve the probe rows
// (the ledgered retry-queue intermittent). diffusion_delete.ts enforces the
// dedalo_ts_test_ prefix. An externally provided value (CI) wins.
if (process.env.DIFFUSION_ACTIVITY_TABLE === undefined) {
	process.env.DIFFUSION_ACTIVITY_TABLE = 'dedalo_ts_test_activity_diffusion';
}
