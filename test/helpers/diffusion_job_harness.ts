/**
 * DIFFUSION JOB HARNESS — the queue transitions a runner gate drives by hand,
 * on the lane's suite database only.
 *
 * The runner gates (diffusion_resume_ledger_native, diffusion_target_fence_native)
 * do what the scheduler and the sweeper do in production, one explicit step at a
 * time, so a crash, a revocation or a requeue lands at a chosen point:
 *
 *   enqueueClaimSeeded — enqueue one job, CLAIM that row (never "the oldest
 *                        queued"), and seed its checkpoint with a PINNED
 *                        `run_started_at` so every run of a gate publishes the
 *                        same bytes (the runner keeps a seeded timestamp);
 *   requeueAndClaim    — the admin requeue of a failed/cancelled job + a claim;
 *   sweepAndClaim      — the sweeper's revocation of a running job + a claim.
 *
 * Every door refuses on a database without the suite marker (assertTestDatabase)
 * before its first write. Rows are recorded in `createdJobIds` for the caller's
 * teardown.
 */

import { sql } from '../../src/core/db/postgres.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import {
	checkpointJob,
	type DiffusionJobRow,
	enqueueDiffusionJob,
	getJobById,
	requeueTerminalJob,
	sweepStaleJobs,
} from '../../src/diffusion/jobs/queue.ts';
import { ensureDiffusionScratchTables } from './diffusion_scratch_tables.ts';

/** The pinned first-attempt instant every seeded job carries (epoch seconds). */
export const PINNED_RUN_STARTED_AT = 1_800_000_000;

/** The checkpoint a v2 run starts from: nothing done, timestamp pinned. */
export function seededCheckpoint(): Record<string, unknown> {
	return { v: 2, run_started_at: PINNED_RUN_STARTED_AT, batch_seq: 0 };
}

/** Claim ONE named queued row (the scheduler's transition, on this row only). */
export async function claimThisJob(jobId: string): Promise<DiffusionJobRow> {
	await assertTestDatabase('diffusion_job_harness.claimThisJob');
	// The scratch jobs table, built if absent — and its name, from the one helper.
	const { jobs } = await ensureDiffusionScratchTables();
	const rows = (await sql.unsafe(
		`UPDATE "${jobs}"
		 SET state = 'running', started_at = COALESCE(started_at, now()),
		     heartbeat_at = now(), attempt = attempt + 1,
		     runner = jsonb_build_object('host', 'diffusion_job_harness'::text)
		 WHERE job_id = $1 AND state = 'queued'
		 RETURNING job_id`,
		[jobId],
	)) as { job_id: string }[];
	if (rows.length !== 1) throw new Error(`claimThisJob: job ${jobId} was not queued`);
	const row = await getJobById(jobId);
	if (row === null) throw new Error(`claimThisJob: job ${jobId} vanished`);
	return row;
}

export interface SeededJobInput {
	elementTipo: string;
	sectionTipo: string;
	type: string;
	ownerUserId: number;
	options?: Record<string, unknown>;
	/** Checkpoint to seed after the claim; default `seededCheckpoint()`. */
	checkpoint?: Record<string, unknown> | null;
}

/** Enqueue + claim + seed the checkpoint. Throws if it ATTACHED to a live run. */
export async function enqueueClaimSeeded(
	input: SeededJobInput,
	createdJobIds: string[],
): Promise<DiffusionJobRow> {
	await assertTestDatabase('diffusion_job_harness.enqueueClaimSeeded');
	const { job, attached } = await enqueueDiffusionJob({
		ownerUserId: input.ownerUserId,
		clientProcessId: `process_diffusion_${input.ownerUserId}_${input.elementTipo}_${input.sectionTipo}`,
		spec: {
			diffusion_element_tipo: input.elementTipo,
			section_tipo: input.sectionTipo,
			type: input.type,
			sqo: { section_tipo: input.sectionTipo },
			estimated_total: 0,
			options: input.options ?? {},
		},
	});
	createdJobIds.push(job.job_id);
	if (attached) {
		throw new Error(`enqueueClaimSeeded: attached to a live run for ${input.elementTipo}`);
	}
	const claimed = await claimThisJob(job.job_id);
	const checkpoint = input.checkpoint === undefined ? seededCheckpoint() : input.checkpoint;
	if (checkpoint !== null) {
		await checkpointJob({ job_id: claimed.job_id, attempt: claimed.attempt }, checkpoint);
	}
	const seeded = await getJobById(job.job_id);
	if (seeded === null) throw new Error('enqueueClaimSeeded: job vanished');
	return seeded;
}

/** Admin requeue of a terminal job, then claim it: the resume a crash leaves to an operator. */
export async function requeueAndClaim(jobId: string): Promise<DiffusionJobRow> {
	await assertTestDatabase('diffusion_job_harness.requeueAndClaim');
	const requeued = await requeueTerminalJob(jobId);
	if (requeued === null) throw new Error(`requeueAndClaim: job ${jobId} was not terminal`);
	return claimThisJob(jobId);
}

/**
 * The sweeper's revocation of a RUNNING job (stale bound 0 = every running row),
 * then a claim of THIS row. Returns null when the sweeper did not requeue it.
 */
export async function sweepAndClaim(jobId: string): Promise<DiffusionJobRow | null> {
	await assertTestDatabase('diffusion_job_harness.sweepAndClaim');
	const { requeued } = await sweepStaleJobs(0);
	if (!requeued.includes(jobId)) return null;
	return claimThisJob(jobId);
}

/** Poll a job row until `predicate` holds or `timeoutMs` passes (null = timed out). */
export async function waitForJob(
	jobId: string,
	predicate: (row: DiffusionJobRow) => boolean,
	timeoutMs: number,
	intervalMs = 20,
): Promise<DiffusionJobRow | null> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const row = await getJobById(jobId);
		if (row !== null && predicate(row)) return row;
		await Bun.sleep(intervalMs);
	}
	return null;
}
