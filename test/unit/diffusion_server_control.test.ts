/**
 * Unit gate: the diffusion_server_control maintenance widget, re-homed onto the
 * NATIVE diffusion engine (no separate daemon). get_value now surfaces the
 * in-process advisory, the durable job queue (admin scope), the scheduler
 * status and an engine-native config summary; the action surface is
 * cancel / requeue / purge / set_scheduler / retry_pending_deletions. The old
 * socket-daemon lifecycle (start/stop/restart) is GONE and now denies loudly —
 * the lifecycle controls live on set_scheduler instead and act on DISPATCH
 * (pause / resume / drain_resume), which is the only thing there is left to
 * control now that diffusion runs in-process.
 *
 * Positive queue paths run against the REAL Postgres (this suite already needs
 * a DB for the pending-count query); every row it creates is deleted in
 * afterAll and the shared scheduler pause flag is always reset.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchWidgetRequest } from '../../src/core/area_maintenance/widgets/registry.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { DiffusionJobSpec } from '../../src/diffusion/jobs/queue.ts';
import { deleteJobsForTests, enqueueDiffusionJob } from '../../src/diffusion/jobs/queue.ts';
import {
	isSchedulerDraining,
	isSchedulerPaused,
	resumeScheduler,
} from '../../src/diffusion/jobs/scheduler.ts';

const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;
const OWNER = 424301;
const createdJobIds: string[] = [];

function call(action: string, options: Record<string, unknown> = {}) {
	return dispatchWidgetRequest(ADMIN, { model: 'diffusion_server_control', action }, options);
}

function spec(element: string, section: string): DiffusionJobSpec {
	return {
		diffusion_element_tipo: element,
		section_tipo: section,
		type: 'sql',
		sqo: { section_tipo: [section], limit: 10, offset: 0 },
		estimated_total: 5,
		options: {},
	};
}

beforeAll(() => resumeScheduler());
afterAll(async () => {
	resumeScheduler(); // never leak a paused scheduler to sibling suites
	await deleteJobsForTests(createdJobIds);
});

describe('diffusion_server_control widget (native engine)', () => {
	test('get_value: native advisory + scheduler status + jobs + config', async () => {
		const body = await call('get_value');
		const result = body.result as {
			engine: { state: string; checks: { engine: string; formats: string[] } };
			scheduler: {
				running: number;
				max_runners: number;
				queued: number;
				stale_after_seconds: number;
				paused: boolean;
			};
			jobs: unknown[];
			pending: number;
			config: { native: boolean; formats: string[]; langs: string[] };
			is_admin: boolean;
		};
		expect(result.engine.state).toBe('ok');
		expect(result.engine.checks.engine).toBe('native');
		expect(result.engine.checks.formats).toContain('sql');
		expect(typeof result.scheduler.max_runners).toBe('number');
		expect(result.scheduler.stale_after_seconds).toBe(20);
		expect(typeof result.scheduler.running).toBe('number');
		expect(typeof result.scheduler.queued).toBe('number');
		expect(result.scheduler.paused).toBe(false);
		expect(Array.isArray(result.jobs)).toBe(true);
		expect(result.config.formats).toContain('sql');
		expect(Array.isArray(result.config.langs)).toBe(true);
		expect(typeof result.config.native).toBe('boolean');
		expect(typeof result.pending).toBe('number');
		expect(result.is_admin).toBe(true);
	});

	test('get_value: each job row carries the exact shape the client renders', async () => {
		// The widget's job rows ARE a wire contract — the progress bar, the state
		// badge, the attempt cell and the per-row action buttons each read a named
		// field, and a rename here renders as a blank cell rather than an error.
		// Asserting only Array.isArray (as this suite did) would let any of them
		// disappear silently. Pinned against a real enqueued job, not a fixture.
		const job = await enqueueDiffusionJob({
			ownerUserId: OWNER,
			clientProcessId: `process_diffusion_${OWNER}_dscshape_dscsec1`,
			spec: spec('dscshape', 'dscsec1'),
		});
		createdJobIds.push(job.job.job_id);

		const body = await call('get_value');
		const jobs = (body.result as { jobs: Record<string, unknown>[] }).jobs;
		const row = jobs.find((candidate) => candidate.job_id === job.job.job_id);
		expect(row, 'the freshly enqueued job is missing from get_value').toBeDefined();

		expect(Object.keys(row as Record<string, unknown>).sort()).toEqual([
			'attempt',
			'cancel_requested',
			'counter',
			'created_at',
			'element_tipo',
			'errors',
			'finished_at',
			'job_id',
			'max_attempts',
			'msg',
			'process_id',
			'section_tipo',
			'started_at',
			'state',
			'total',
			'type',
		]);
		// the fields the progress cell reads, with the types it assumes
		expect(typeof (row as { counter: unknown }).counter).toBe('number');
		expect(typeof (row as { total: unknown }).total).toBe('number');
		expect((row as { state: unknown }).state).toBe('queued');
		// process_id is the CLIENT label, never the job uuid (the row keys off
		// job_id, but every human-facing string is the label)
		expect((row as { process_id: unknown }).process_id).toBe(job.job.client_process_id);
		expect((row as { process_id: unknown }).process_id).not.toBe(job.job.job_id);
	});

	test('removed lifecycle methods deny loudly (no daemon to control)', async () => {
		for (const action of ['start_server', 'stop_server', 'restart_server']) {
			const body = await call(action);
			expect(body.result).toBe(false);
			expect(body.errors).toContain('unauthorized_method');
		}
	});

	test('unregistered method still denies loudly', async () => {
		const body = await call('drop_the_server');
		expect(body.result).toBe(false);
		expect(body.errors).toContain('unauthorized_method');
	});

	test('cancel_process: validation + queue-backed positive path', async () => {
		const invalid = await call('cancel_process', {});
		expect(invalid.result).toBe(false);
		expect(invalid.errors).toContain('invalid_process_id');

		const missing = await call('cancel_process', { process_id: 'process_diffusion_0_nope_nope' });
		expect(missing.result).toBe(false);
		expect(missing.errors).toContain('not_found');

		const job = await enqueueDiffusionJob({
			ownerUserId: OWNER,
			clientProcessId: `process_diffusion_${OWNER}_dsc1_dscsec1`,
			spec: spec('dsc1', 'dscsec1'),
		});
		createdJobIds.push(job.job.job_id);
		const cancelled = await call('cancel_process', { process_id: job.job.client_process_id });
		expect(cancelled.result).toBe(true);
		expect(String(cancelled.msg)).toContain('cancelled');
	});

	test('requeue_job: validation + revive a terminal job', async () => {
		const invalid = await call('requeue_job', {});
		expect(invalid.result).toBe(false);
		expect(invalid.errors).toContain('invalid_job_id');

		const notFound = await call('requeue_job', { job_id: '00000000-0000-0000-0000-000000000000' });
		expect(notFound.result).toBe(false);
		expect(notFound.errors).toContain('not_requeueable');

		const job = await enqueueDiffusionJob({
			ownerUserId: OWNER,
			clientProcessId: `process_diffusion_${OWNER}_dsc2_dscsec1`,
			spec: spec('dsc2', 'dscsec1'),
		});
		createdJobIds.push(job.job.job_id);
		// cancel it (queued → cancelled = terminal), then requeue.
		await call('cancel_process', { process_id: job.job.client_process_id });
		const requeued = await call('requeue_job', { job_id: job.job.job_id });
		expect(requeued.result).toBe(true);
		expect(String(requeued.msg)).toContain('requeued');
	});

	test('purge_jobs returns a count envelope', async () => {
		const body = await call('purge_jobs', { older_than_hours: 24 });
		expect(body.result).toBe(true);
		expect(String(body.msg)).toContain('Purged');
	});

	test('set_scheduler: validation + pause/resume flips the shared flag', async () => {
		const bad = await call('set_scheduler', { action: 'bogus' });
		expect(bad.result).toBe(false);
		expect(bad.errors).toContain('invalid_action');

		const paused = await call('set_scheduler', { action: 'pause' });
		expect(paused.result).toBe(true);
		expect(isSchedulerPaused()).toBe(true);

		const resumed = await call('set_scheduler', { action: 'resume' });
		expect(resumed.result).toBe(true);
		expect(isSchedulerPaused()).toBe(false);
	});

	// The quiesce ("restart", honestly named). With an EMPTY running set it
	// completes on the first poll, so this asserts the whole round trip without
	// leaving a paused scheduler or a background wait behind.
	test('set_scheduler drain_resume: returns at once and drains an idle queue', async () => {
		const body = await call('set_scheduler', { action: 'drain_resume' });
		expect(body.result).toBe(true);
		expect(body.errors).toEqual([]);
		expect(String(body.msg)).toContain('Draining');

		// Started, not awaited — the request must not carry the wait (it is bounded
		// by DRAIN_TIMEOUT_MS, minutes beyond any request budget).
		await Bun.sleep(50);
		expect(isSchedulerDraining()).toBe(false);
		expect(isSchedulerPaused()).toBe(false); // drained, then resumed itself
	});

	test('get_value reports the drain state alongside paused', async () => {
		const body = await call('get_value');
		const scheduler = (body.result as { scheduler: Record<string, unknown> }).scheduler;
		// Both flags must be present: the client renders ONE dispatch pill from
		// them, and a missing `draining` would silently read as "not draining".
		expect(typeof scheduler.paused).toBe('boolean');
		expect(typeof scheduler.draining).toBe('boolean');
	});

	test('retry_pending_deletions count_only reports the dd1758 pending rows', async () => {
		const body = await call('retry_pending_deletions', { count_only: true });
		const result = body.result as { pending: number };
		expect(typeof result.pending).toBe('number');
		expect(String(body.msg)).toContain(`${result.pending} pending deletion(s)`);
	});
});
