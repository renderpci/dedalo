/**
 * S1-17 / DEC-18a gate — the diffusion job-queue test/live isolation seam.
 *
 * Under `bun test` the preload (test/preload/session_db.ts) must point
 * DIFFUSION_JOBS_TABLE at the scratch table, so test-enqueued jobs can never
 * be claimed by the live server's always-on scheduler (and vice versa: test
 * schedulers never claim real queued jobs). The override is guarded — only
 * `dedalo_ts_test_*` names are accepted — so the seam cannot silently
 * redirect a production process.
 */

import { describe, expect, test } from 'bun:test';
import { DIFFUSION_ACTIVITY_TABLE } from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import {
	DIFFUSION_JOBS_TABLE,
	DIFFUSION_JOB_EVENTS_TABLE,
} from '../../src/diffusion/jobs/schema.ts';

describe('diffusion jobs table seam (S1-17/DEC-18a)', () => {
	test('bun test runs against the SCRATCH jobs table, never the live one', () => {
		// The preload sets the override before any module loads.
		expect(process.env.DIFFUSION_JOBS_TABLE).toBeDefined();
		expect(DIFFUSION_JOBS_TABLE.startsWith('dedalo_ts_test_')).toBe(true);
		expect(DIFFUSION_JOBS_TABLE).not.toBe('dedalo_ts_diffusion_jobs');
		expect(DIFFUSION_JOB_EVENTS_TABLE).toBe(`${DIFFUSION_JOBS_TABLE}_events`);
	});

	test('a non-scratch override is REJECTED at module load (fail-loud guard)', async () => {
		const probe = Bun.spawn(
			['bun', '-e', `await import('${import.meta.dir}/../../src/diffusion/jobs/schema.ts');`],
			{
				env: { ...process.env, DIFFUSION_JOBS_TABLE: 'dedalo_ts_diffusion_jobs_evil' },
				stdout: 'pipe',
				stderr: 'pipe',
			},
		);
		const exitCode = await probe.exited;
		const stderr = await new Response(probe.stderr).text();
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain('DIFFUSION_JOBS_TABLE override');
	});
});

// The dd1758 activity-ledger twin of the jobs seam: without it, a test's
// retryPendingDiffusion selects the oldest pending rows of the REAL
// matrix_activity_diffusion — its stub engine can flip REAL pending rows to
// 'unpublished' without any actual delete, and ≥10 older real pending rows
// starve the test's probe rows (the ledgered retry-queue intermittent).
describe('diffusion activity table seam (dd1758 ledger)', () => {
	test('bun test runs against the SCRATCH activity table, never the live one', () => {
		// The preload sets the override before any module loads.
		expect(process.env.DIFFUSION_ACTIVITY_TABLE).toBeDefined();
		expect(DIFFUSION_ACTIVITY_TABLE.startsWith('dedalo_ts_test_')).toBe(true);
		expect(DIFFUSION_ACTIVITY_TABLE).not.toBe('matrix_activity_diffusion');
	});

	test('a non-scratch override is REJECTED at module load (fail-loud guard)', async () => {
		const probe = Bun.spawn(
			[
				'bun',
				'-e',
				`await import('${import.meta.dir}/../../src/core/diffusion_bridge/diffusion_delete.ts');`,
			],
			{
				env: { ...process.env, DIFFUSION_ACTIVITY_TABLE: 'matrix_activity_diffusion_evil' },
				stdout: 'pipe',
				stderr: 'pipe',
			},
		);
		const exitCode = await probe.exited;
		const stderr = await new Response(probe.stderr).text();
		expect(exitCode).not.toBe(0);
		expect(stderr).toContain('DIFFUSION_ACTIVITY_TABLE override');
	});
});
