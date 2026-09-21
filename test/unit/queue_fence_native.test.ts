/**
 * DIFFUSION LEASE FENCE — a revoked lease cannot write (PUB-13).
 *
 * THE SITUATION THIS GATE BUILDS, and no other gate does: a LIVE runner whose
 * row was taken from it. The three existing sweep gates
 * (diffusion_jobs.test.ts) construct a DEAD runner — they sweep a stale row and
 * assert the requeue — which is the easy half. The dangerous half is the runner
 * that was merely SLOW: it missed its heartbeats, the sweeper requeued the row,
 * a new claim handed it to a second runner, and then the first one woke up and
 * kept writing. Before the fence every one of its writes landed: heartbeat
 * (making the live run look alive on the loser's clock), progress and
 * checkpoint (corrupting the live run's resume point) and finally finishJob,
 * which stamped the loser's terminal state on a run that was still publishing.
 *
 * THE LEASE is `(job_id, attempt)`. `attempt` is incremented inside the claim
 * statement and is NOT reset by the sweeper's requeue, so each claim of a row
 * has a unique epoch. Every lease-holder write carries it and is fenced with
 * `AND attempt = $epoch AND state = 'running'`; zero rows affected throws
 * `diffusion.lease_revoked` and the caller aborts WITHOUT writing.
 *
 * WHAT IS ASSERTED
 *  - the epoch SURVIVES the sweeper's requeue (runner/heartbeat reset, attempt
 *    kept) — the property the whole fence rests on;
 *  - the epoch is not re-issued by the ADMIN requeue either: the second half of
 *    this gate builds the ABA the first half cannot see — a loser holding epoch
 *    1, its row failed on budget exhaustion, REVIVED by an admin, and claimed
 *    again. If the admin path reset the counter the new claim would hand out
 *    epoch 1 a second time and every fenced write of the loser would land;
 *  - all FIVE row mutators (recordRunnerPid, heartbeatJob, updateJobProgress,
 *    checkpointJob, finishJob) refuse the revoked epoch-1 lease with the typed
 *    code, and the row is byte-identical after each refusal;
 *  - the runner ENTRYPOINT refuses a revoked epoch before doing any work;
 *  - POSITIVE CONTROL: the identical calls under the live epoch-2 lease all
 *    succeed and move the row — without it the refusals would prove nothing.
 *
 * Scratch hygiene: the suite runs on the SCRATCH jobs table (the S1-17 preload
 * seam) with fake element/section tipos that collide with no real diffusion
 * target, and deletes every row it created.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { DedaloError, isDedaloError } from '../../src/core/errors/index.ts';
import type { DiffusionJobSpec, JobLease } from '../../src/diffusion/jobs/queue.ts';
import {
	checkpointJob,
	claimNextQueuedJob,
	deleteJobsForTests,
	enqueueDiffusionJob,
	failedJobResult,
	finishJob,
	getJobById,
	heartbeatJob,
	recordRunnerPid,
	requeueTerminalJob,
	sweepStaleJobs,
	updateJobProgress,
} from '../../src/diffusion/jobs/queue.ts';
import { DIFFUSION_JOBS_TABLE } from '../../src/diffusion/jobs/schema.ts';
import { runJob } from '../../src/diffusion/runner.ts';

/** Fake owner + tipos: nothing here can name a real diffusion target. */
const OWNER = 424901;
const ELEMENT = 'zzfence1';
const SECTION = 'zzfencesec1';
/** A second, independent target for the admin-requeue (ABA) half. */
const ABA_ELEMENT = 'zzfence2';
const ABA_SECTION = 'zzfencesec2';

const createdJobIds: string[] = [];

function spec(element: string = ELEMENT, section: string = SECTION): DiffusionJobSpec {
	return {
		diffusion_element_tipo: element,
		section_tipo: section,
		type: 'sql',
		// stub_run keeps the runner entrypoint off the real publication pipeline:
		// this gate is about the lease, not about what a run publishes.
		sqo: { section_tipo: [section], limit: 10, offset: 0 },
		estimated_total: 5,
		options: { stub_run: true },
	};
}

/**
 * Make this row the OLDEST queued one, so the REAL claim (`ORDER BY created_at`)
 * is guaranteed to take it in a scratch table other suites also enqueue into.
 * The claim statement itself is never reproduced here — it is the code under
 * test, and it is what stamps the epoch.
 */
async function makeOldest(jobId: string): Promise<void> {
	await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}" SET created_at = timestamptz '2000-01-01' WHERE job_id = $1`,
		[jobId],
	);
}

/** Age the heartbeat past any sweep window, so the sweeper sees a lost runner. */
async function staleHeartbeat(jobId: string): Promise<void> {
	await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}" SET heartbeat_at = now() - interval '1 hour' WHERE job_id = $1`,
		[jobId],
	);
}

/** The whole row as comparable bytes — the "nothing was written" probe. */
async function rowBytes(jobId: string): Promise<string> {
	const rows = (await sql.unsafe(
		`SELECT to_jsonb(t) AS row FROM "${DIFFUSION_JOBS_TABLE}" t WHERE job_id = $1`,
		[jobId],
	)) as { row: unknown }[];
	const row = rows[0]?.row;
	return JSON.stringify(typeof row === 'string' ? JSON.parse(row) : row);
}

/** Assert a call is refused with the typed lease code (never a silent no-op). */
async function expectLeaseRevoked(operation: string, call: () => Promise<unknown>): Promise<void> {
	let caught: unknown;
	try {
		await call();
	} catch (error) {
		caught = error;
	}
	expect(caught, `${operation} must REFUSE a revoked lease, it resolved instead`).toBeDefined();
	expect(isDedaloError(caught)).toBe(true);
	expect((caught as { code: string }).code, `${operation} refusal code`).toBe(
		'diffusion.lease_revoked',
	);
}

let jobId = '';
let revoked: JobLease;
let live: JobLease;

beforeAll(async () => {
	// A leftover row from a crashed earlier run would take the enqueue's
	// attach path instead of inserting — start from a clean target.
	await sql.unsafe(
		`DELETE FROM "${DIFFUSION_JOBS_TABLE}" WHERE spec->>'diffusion_element_tipo' = $1`,
		[ELEMENT],
	);
	const enqueued = await enqueueDiffusionJob({
		ownerUserId: OWNER,
		clientProcessId: `process_diffusion_${OWNER}_${ELEMENT}_${SECTION}`,
		spec: spec(),
	});
	expect(enqueued.attached).toBe(false);
	jobId = enqueued.job.job_id;
	createdJobIds.push(jobId);

	// FIRST CLAIM — the real scheduler statement, on this row.
	await makeOldest(jobId);
	const first = await claimNextQueuedJob('fence-host-1');
	expect(first?.job_id).toBe(jobId);
	revoked = { job_id: jobId, attempt: first?.attempt ?? -1 };

	// The runner goes quiet (it is NOT dead — this process still holds `revoked`).
	await staleHeartbeat(jobId);
	const swept = await sweepStaleJobs(1);
	expect(swept.requeued).toContain(jobId);

	// SECOND CLAIM — a new runner takes the row.
	await makeOldest(jobId);
	const second = await claimNextQueuedJob('fence-host-2');
	expect(second?.job_id).toBe(jobId);
	live = { job_id: jobId, attempt: second?.attempt ?? -1 };
});

afterAll(async () => {
	await deleteJobsForTests(createdJobIds);
	for (const created of createdJobIds) expect(await getJobById(created)).toBeNull();
});

describe('the epoch is what survives a requeue', () => {
	test('the sweep reset runner+heartbeat but NOT attempt, so the two claims differ', () => {
		expect(revoked.attempt).toBe(1);
		expect(live.attempt).toBe(2);
	});

	test('the row is running under the LIVE epoch while the revoked runner is still alive', async () => {
		const row = await getJobById(jobId);
		expect(row?.state).toBe('running');
		expect(row?.attempt).toBe(live.attempt);
		expect(row?.runner.host).toBe('fence-host-2');
	});
});

describe('every mutator refuses the revoked lease and writes nothing', () => {
	test('recordRunnerPid', async () => {
		const before = await rowBytes(jobId);
		await expectLeaseRevoked('recordRunnerPid', () => recordRunnerPid(revoked, 999_001));
		expect(await rowBytes(jobId)).toBe(before);
	});

	test('heartbeatJob', async () => {
		const before = await rowBytes(jobId);
		await expectLeaseRevoked('heartbeatJob', () => heartbeatJob(revoked));
		expect(await rowBytes(jobId)).toBe(before);
	});

	test('updateJobProgress', async () => {
		const before = await rowBytes(jobId);
		await expectLeaseRevoked('updateJobProgress', () =>
			updateJobProgress(revoked, {
				counter: 99,
				msg: 'the loser writing over the live run',
				error: 'the loser appending to the live error list',
			}),
		);
		expect(await rowBytes(jobId)).toBe(before);
	});

	test('checkpointJob', async () => {
		const before = await rowBytes(jobId);
		await expectLeaseRevoked('checkpointJob', () =>
			checkpointJob(revoked, { cursor: 999_999, processed: 999 }),
		);
		expect(await rowBytes(jobId)).toBe(before);
	});

	test('finishJob — the write the fence exists for', async () => {
		const before = await rowBytes(jobId);
		await expectLeaseRevoked('finishJob', () =>
			finishJob(revoked, 'completed', { ok: true, msg: 'the loser ending the live run' }),
		);
		const after = await rowBytes(jobId);
		expect(after).toBe(before);
		const row = await getJobById(jobId);
		expect(row?.state).toBe('running');
		expect(row?.finished_at).toBeNull();
		expect(row?.result).toBeNull();
	});

	test('the runner entrypoint refuses a revoked epoch before doing any work', async () => {
		const before = await rowBytes(jobId);
		await expect(runJob(jobId, revoked.attempt)).resolves.toBeUndefined();
		expect(await rowBytes(jobId)).toBe(before);
	});
});

describe('POSITIVE CONTROL — the live lease makes the same calls succeed', () => {
	test('recordRunnerPid + heartbeatJob + progress + checkpoint all land', async () => {
		await recordRunnerPid(live, 999_002);
		await heartbeatJob(live);
		await updateJobProgress(live, { counter: 7, msg: 'live run', error: 'a real record error' });
		await checkpointJob(live, { cursor: 4242, processed: 7 });

		const row = await getJobById(jobId);
		expect(row?.runner.pid).toBe(999_002);
		expect(row?.heartbeat_at).not.toBeNull();
		expect(row?.totals.counter).toBe(7);
		expect(row?.totals.msg).toBe('live run');
		expect(row?.errors).toEqual(['a real record error']);
		expect(row?.checkpoint).toEqual({ cursor: 4242, processed: 7 });
		// none of the loser's values reached the row
		expect(row?.runner.pid).not.toBe(999_001);
		expect(row?.checkpoint.cursor).not.toBe(999_999);
	});

	test('finishJob under the live lease ends the run', async () => {
		await finishJob(live, 'completed', { ok: true, msg: 'OK. Request done', tables: [] });
		const row = await getJobById(jobId);
		expect(row?.state).toBe('completed');
		expect(row?.finished_at).not.toBeNull();
		expect(row?.totals.msg).toBe('OK. Request done');
	});

	test('once terminal, even the LIVE lease can no longer write (state guard)', async () => {
		const before = await rowBytes(jobId);
		await expectLeaseRevoked('heartbeatJob after terminal', () => heartbeatJob(live));
		expect(await rowBytes(jobId)).toBe(before);
	});
});

/**
 * THE ABA. The first half of this gate proves the SWEEPER's requeue keeps the
 * epoch. That is not the whole story: a job also comes back from the dead by
 * hand. An admin looking at a failed run presses requeue, the row goes back to
 * 'queued' and a scheduler claim hands it to a runner — and if that path RESET
 * the counter, the new claim would issue epoch 1 to the new runner while the
 * original epoch-1 holder is still alive. Both fence legs (`attempt = 1`,
 * `state = 'running'`) would match for the loser and it would write straight
 * over the live run: measured, before the fix, as heartbeat + progress + a
 * terminal `finishJob` all landing.
 *
 * So the budget must be granted FORWARD (max_attempts), never by rewinding the
 * epoch. This suite builds exactly that history through the real functions —
 * claim, budget exhaustion, sweep, admin requeue, re-claim — and asserts the
 * second claim's epoch is strictly greater than the loser's.
 */
describe('the ADMIN requeue does not re-issue the epoch (ABA)', () => {
	let abaJobId = '';
	let abaLoser: JobLease;
	let abaLive: JobLease;

	beforeAll(async () => {
		await sql.unsafe(
			`DELETE FROM "${DIFFUSION_JOBS_TABLE}" WHERE spec->>'diffusion_element_tipo' = $1`,
			[ABA_ELEMENT],
		);
		const enqueued = await enqueueDiffusionJob({
			ownerUserId: OWNER,
			clientProcessId: `process_diffusion_${OWNER}_${ABA_ELEMENT}_${ABA_SECTION}`,
			spec: spec(ABA_ELEMENT, ABA_SECTION),
		});
		abaJobId = enqueued.job.job_id;
		createdJobIds.push(abaJobId);

		await makeOldest(abaJobId);
		const first = await claimNextQueuedJob('aba-host-1');
		expect(first?.job_id).toBe(abaJobId);
		abaLoser = { job_id: abaJobId, attempt: first?.attempt ?? -1 };

		// Exhaust the retry BUDGET (not the epoch) so the sweeper fails the row
		// instead of requeueing it — the state an admin actually revives.
		await sql.unsafe(
			`UPDATE "${DIFFUSION_JOBS_TABLE}" SET max_attempts = attempt WHERE job_id = $1`,
			[abaJobId],
		);
		await staleHeartbeat(abaJobId);
		const swept = await sweepStaleJobs(1);
		expect(swept.failed).toContain(abaJobId);

		// The admin revive, through the real widget path's function.
		const revived = await requeueTerminalJob(abaJobId);
		expect(revived?.state).toBe('queued');

		await makeOldest(abaJobId);
		const second = await claimNextQueuedJob('aba-host-2');
		expect(second?.job_id).toBe(abaJobId);
		abaLive = { job_id: abaJobId, attempt: second?.attempt ?? -1 };
	});

	test('the admin requeue kept the epoch and granted the budget forward', async () => {
		const row = await getJobById(abaJobId);
		expect(row?.state).toBe('running');
		expect(abaLive.attempt).toBeGreaterThan(abaLoser.attempt);
		// budget, not epoch: the row can be retried again
		expect(row?.max_attempts).toBeGreaterThan(row?.attempt ?? 0);
	});

	test('the epoch-1 loser is still locked out after the revive — no mutator writes', async () => {
		const before = await rowBytes(abaJobId);
		await expectLeaseRevoked('recordRunnerPid (ABA)', () => recordRunnerPid(abaLoser, 999_101));
		await expectLeaseRevoked('heartbeatJob (ABA)', () => heartbeatJob(abaLoser));
		await expectLeaseRevoked('updateJobProgress (ABA)', () =>
			updateJobProgress(abaLoser, { counter: 999, msg: 'LOSER ENDED THE RUN' }),
		);
		await expectLeaseRevoked('checkpointJob (ABA)', () =>
			checkpointJob(abaLoser, { cursor: 999_999 }),
		);
		await expectLeaseRevoked('finishJob (ABA)', () =>
			finishJob(
				abaLoser,
				'failed',
				failedJobResult(new DedaloError('diffusion.run_failed'), 'LOSER ENDED THE RUN'),
			),
		);
		expect(await rowBytes(abaJobId)).toBe(before);
		const row = await getJobById(abaJobId);
		expect(row?.state).toBe('running');
		expect(row?.totals.msg).not.toBe('LOSER ENDED THE RUN');
	});

	test('POSITIVE CONTROL: the post-revive lease writes and ends the run', async () => {
		await heartbeatJob(abaLive);
		await updateJobProgress(abaLive, { counter: 3, msg: 'live run after revive' });
		await finishJob(abaLive, 'completed', { ok: true, msg: 'OK. Request done' });
		const row = await getJobById(abaJobId);
		expect(row?.state).toBe('completed');
		expect(row?.totals.counter).toBe(3);
		expect(row?.totals.msg).toBe('OK. Request done');
	});
});
