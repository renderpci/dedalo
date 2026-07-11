/**
 * Durable diffusion job queue — lifecycle gates (DIFFUSION_PLAN D4.1).
 *
 * THE GUARANTEES under test, against the REAL Postgres:
 * - enqueue is target-unique: a second diffuse on the same element+section
 *   ATTACHES to the active run instead of double-publishing;
 * - claim is exclusive (FOR UPDATE SKIP LOCKED) and increments the attempt;
 * - progress/checkpoint/finish mutate the row the SSE layer projects;
 * - cancel is owner-scoped and finalizes queued jobs immediately;
 * - the sweeper re-queues stale running jobs while the attempt budget lasts,
 *   then fails them — the crash-recovery path the durable queue exists for.
 *
 * Every row this suite creates is deleted in afterAll (scratch hygiene). The
 * fake element/section tipos can never collide with real diffusion targets.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	claimNextQueuedJob,
	countQueuedJobs,
	deleteJobsForTests,
	enqueueDiffusionJob,
	finishJob,
	getJobByClientProcessId,
	getJobById,
	heartbeatJob,
	isCancelRequested,
	listJobsForCaller,
	purgeTerminalJobs,
	requestCancel,
	requeueTerminalJob,
	sweepStaleJobs,
	updateJobProgress,
} from '../../src/diffusion/jobs/queue.ts';
import type { DiffusionJobSpec } from '../../src/diffusion/jobs/queue.ts';
import { DIFFUSION_JOBS_TABLE } from '../../src/diffusion/jobs/schema.ts';

const OWNER_A = 424201;
const OWNER_B = 424202;
const createdJobIds: string[] = [];

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

/** Purge every row this suite's FAKE element tipos ever created — reruns after
 * a crashed attempt must start clean (the fake tipos collide with nothing). */
async function purgeSuiteRows(): Promise<void> {
	// By element AND by label: a row with a corrupted spec (jsonb string) would
	// escape the element predicate but never the label one.
	await sql.unsafe(
		`DELETE FROM "${DIFFUSION_JOBS_TABLE}"
		 WHERE spec->>'diffusion_element_tipo' LIKE 'jobtest%'
		    OR client_process_id LIKE 'process_diffusion_424201_%'
		    OR client_process_id LIKE 'process_diffusion_424202_%'`,
	);
}

beforeAll(purgeSuiteRows);
afterAll(async () => {
	await deleteJobsForTests(createdJobIds);
	await purgeSuiteRows();
});

describe('diffusion job queue (durable, Postgres-backed)', () => {
	test('enqueue creates a queued job; same target attaches instead of duplicating', async () => {
		const first = await enqueueDiffusionJob({
			ownerUserId: OWNER_A,
			clientProcessId: `process_diffusion_${OWNER_A}_jobtest1_jobsec1`,
			spec: spec('jobtest1', 'jobsec1'),
		});
		createdJobIds.push(first.job.job_id);
		expect(first.attached).toBe(false);
		expect(first.job.state).toBe('queued');
		expect(first.job.totals.msg).toBe('Starting diffusion...');
		expect(first.job.totals.total).toBe(5);

		const second = await enqueueDiffusionJob({
			ownerUserId: OWNER_A,
			clientProcessId: `process_diffusion_${OWNER_A}_jobtest1_jobsec1`,
			spec: spec('jobtest1', 'jobsec1'),
		});
		expect(second.attached).toBe(true);
		expect(second.job.job_id).toBe(first.job.job_id);

		// A DIFFERENT target is not blocked by the active one.
		const other = await enqueueDiffusionJob({
			ownerUserId: OWNER_A,
			clientProcessId: `process_diffusion_${OWNER_A}_jobtest2_jobsec1`,
			spec: spec('jobtest2', 'jobsec1'),
		});
		createdJobIds.push(other.job.job_id);
		expect(other.attached).toBe(false);
	});

	test('claim transitions queued → running exactly once per job', async () => {
		// Two claims: each must return a DIFFERENT job (the two queued above),
		// a third finds nothing else queued from this suite... other suites may
		// queue jobs, so assert disjointness rather than emptiness.
		const claimedA = await claimNextQueuedJob('test-host');
		const claimedB = await claimNextQueuedJob('test-host');
		expect(claimedA).not.toBeNull();
		expect(claimedB).not.toBeNull();
		expect(claimedA?.job_id).not.toBe(claimedB?.job_id);
		expect(claimedA?.state).toBe('running');
		expect(claimedA?.attempt).toBe(1);
		expect(claimedA?.runner.host).toBe('test-host');
	});

	test('progress + checkpoint + finish shape the row the SSE layer reads', async () => {
		const jobId = createdJobIds[0] ?? '';
		await heartbeatJob(jobId);
		await updateJobProgress(jobId, {
			counter: 3,
			msg: 'Processing records 3 of 5...',
			current: { section_id: 3, time: 120 },
			total_ms: 999,
		});
		let row = await getJobById(jobId);
		expect(row?.totals.counter).toBe(3);
		expect(row?.totals.msg).toBe('Processing records 3 of 5...');
		expect(row?.totals.current).toEqual({ section_id: 3, time: 120 });
		// The enqueue-time total survives the merge.
		expect(row?.totals.total).toBe(5);

		await updateJobProgress(jobId, { counter: 4, error: 'record 4 failed' });
		row = await getJobById(jobId);
		expect(row?.errors).toEqual(['record 4 failed']);

		await finishJob(jobId, 'completed', { result: true, msg: 'OK. Request done', tables: [] });
		row = await getJobById(jobId);
		expect(row?.state).toBe('completed');
		expect(row?.finished_at).not.toBeNull();
		expect(row?.totals.msg).toBe('OK. Request done');
		expect(row?.result).toEqual({ result: true, msg: 'OK. Request done', tables: [] });
	});

	test('cancel is owner-scoped; a queued job finalizes immediately', async () => {
		const queued = await enqueueDiffusionJob({
			ownerUserId: OWNER_A,
			clientProcessId: `process_diffusion_${OWNER_A}_jobtest3_jobsec1`,
			spec: spec('jobtest3', 'jobsec1'),
		});
		createdJobIds.push(queued.job.job_id);

		// Wrong owner: no match (id knowledge grants nothing).
		const denied = await requestCancel(queued.job.client_process_id, OWNER_B);
		expect(denied.cancelled).toBe(false);

		const cancelled = await requestCancel(queued.job.client_process_id, OWNER_A);
		expect(cancelled.cancelled).toBe(true);
		const row = await getJobById(queued.job.job_id);
		expect(row?.state).toBe('cancelled');
		expect(row?.errors).toContain('Process cancelled by user');

		// A RUNNING job only gets the flag — the runner honors it between batches.
		const running = createdJobIds[1] ?? '';
		const flagBefore = await isCancelRequested(running);
		expect(flagBefore).toBe(false);
		const runningJob = await getJobById(running);
		const cancelRunning = await requestCancel(runningJob?.client_process_id ?? '', OWNER_A);
		expect(cancelRunning.cancelled).toBe(true);
		expect(await isCancelRequested(running)).toBe(true);
		expect((await getJobById(running))?.state).toBe('running');
	});

	test('sweeper re-queues a stale running job, then fails it past the attempt budget', async () => {
		const victim = await enqueueDiffusionJob({
			ownerUserId: OWNER_A,
			clientProcessId: `process_diffusion_${OWNER_A}_jobtest4_jobsec1`,
			spec: spec('jobtest4', 'jobsec1'),
		});
		createdJobIds.push(victim.job.job_id);
		// Force it into running with an ancient heartbeat + attempts at the edge.
		await sql.unsafe(
			`UPDATE "${DIFFUSION_JOBS_TABLE}"
			 SET state = 'running', attempt = 2, max_attempts = 3,
			     heartbeat_at = now() - interval '1 hour'
			 WHERE job_id = $1`,
			[victim.job.job_id],
		);
		const sweep1 = await sweepStaleJobs(20);
		expect(sweep1.requeued).toContain(victim.job.job_id);
		expect((await getJobById(victim.job.job_id))?.state).toBe('queued');

		// Past the budget: interrupted → failed.
		await sql.unsafe(
			`UPDATE "${DIFFUSION_JOBS_TABLE}"
			 SET state = 'running', attempt = 3,
			     heartbeat_at = now() - interval '1 hour'
			 WHERE job_id = $1`,
			[victim.job.job_id],
		);
		const sweep2 = await sweepStaleJobs(20);
		expect(sweep2.failed).toContain(victim.job.job_id);
		const failedRow = await getJobById(victim.job.job_id);
		expect(failedRow?.state).toBe('failed');
		expect(String(failedRow?.result?.msg)).toContain('Interrupted after 3 attempts');
	});

	test('lookups are owner-scoped (admin scope = null sees all)', async () => {
		const label = `process_diffusion_${OWNER_A}_jobtest1_jobsec1`;
		expect(await getJobByClientProcessId(label, OWNER_A)).not.toBeNull();
		expect(await getJobByClientProcessId(label, OWNER_B)).toBeNull();
		expect(await getJobByClientProcessId(label, null)).not.toBeNull();

		const mineA = await listJobsForCaller(OWNER_A);
		expect(mineA.some((job) => job.owner_user_id !== OWNER_A)).toBe(false);
		expect(mineA.length).toBeGreaterThanOrEqual(3);
		const forB = await listJobsForCaller(OWNER_B);
		expect(forB.some((job) => job.owner_user_id === OWNER_A)).toBe(false);
	});

	test('countQueuedJobs sees a freshly queued job and not a finished one', async () => {
		const job = await enqueueDiffusionJob({
			ownerUserId: OWNER_A,
			clientProcessId: `process_diffusion_${OWNER_A}_jobtest5_jobsec1`,
			spec: spec('jobtest5', 'jobsec1'),
		});
		createdJobIds.push(job.job.job_id);
		expect(await countQueuedJobs()).toBeGreaterThanOrEqual(1);
		await finishJob(job.job.job_id, 'completed', { result: true, msg: 'done' });
		// The row is no longer queued (other suites may still have queued rows, so
		// assert on THIS job's state rather than a global count).
		expect((await getJobById(job.job.job_id))?.state).toBe('completed');
	});

	test('requeueTerminalJob revives a failed job with a fresh attempt budget', async () => {
		const job = await enqueueDiffusionJob({
			ownerUserId: OWNER_A,
			clientProcessId: `process_diffusion_${OWNER_A}_jobtest6_jobsec1`,
			spec: spec('jobtest6', 'jobsec1'),
		});
		createdJobIds.push(job.job.job_id);
		await finishJob(job.job.job_id, 'failed', { result: false, msg: 'boom' });

		const requeued = await requeueTerminalJob(job.job.job_id);
		expect(requeued).not.toBeNull();
		expect(requeued?.state).toBe('queued');
		expect(requeued?.attempt).toBe(0);
		expect(requeued?.finished_at).toBeNull();
		expect(requeued?.cancel_requested).toBe(false);
		expect(requeued?.errors).toEqual([]);
		expect(requeued?.totals.msg).toBe('Requeued by admin');
	});

	test('requeueTerminalJob is a no-op on a running job (state guard)', async () => {
		const job = await enqueueDiffusionJob({
			ownerUserId: OWNER_A,
			clientProcessId: `process_diffusion_${OWNER_A}_jobtest7_jobsec1`,
			spec: spec('jobtest7', 'jobsec1'),
		});
		createdJobIds.push(job.job.job_id);
		await sql.unsafe(`UPDATE "${DIFFUSION_JOBS_TABLE}" SET state = 'running' WHERE job_id = $1`, [
			job.job.job_id,
		]);
		expect(await requeueTerminalJob(job.job.job_id)).toBeNull();
		expect((await getJobById(job.job.job_id))?.state).toBe('running');
	});

	test('purgeTerminalJobs removes only aged terminal rows', async () => {
		const job = await enqueueDiffusionJob({
			ownerUserId: OWNER_A,
			clientProcessId: `process_diffusion_${OWNER_A}_jobtest8_jobsec1`,
			spec: spec('jobtest8', 'jobsec1'),
		});
		createdJobIds.push(job.job.job_id);
		await finishJob(job.job.job_id, 'completed', { result: true, msg: 'done' });

		// Not yet aged: a 24h purge leaves it.
		await purgeTerminalJobs(24);
		expect(await getJobById(job.job.job_id)).not.toBeNull();

		// Backdate finished_at past the cutoff, then purge.
		await sql.unsafe(
			`UPDATE "${DIFFUSION_JOBS_TABLE}" SET finished_at = now() - interval '48 hours' WHERE job_id = $1`,
			[job.job.job_id],
		);
		const { purged } = await purgeTerminalJobs(24);
		expect(purged).toBeGreaterThanOrEqual(1);
		expect(await getJobById(job.job.job_id)).toBeNull();
	});
});
