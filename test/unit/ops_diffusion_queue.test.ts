/**
 * Diffusion queue ops-hardening gate (audit S3-63/S3-64, WS-E item 9).
 *
 * THE GUARANTEES under test, against the REAL Postgres (scratch hygiene: fake
 * tipos, every row deleted in afterAll — the diffusion_jobs.test.ts pattern):
 * - claim-with-budget: claimNextQueuedJob(host, max) returns null once the
 *   RUNNING count has reached max, even with queued work waiting (the old
 *   read-count-then-claim two-step is gone);
 * - crash-atomic sweep: ONE sweepStaleJobs call takes a stale running job all
 *   the way to 'queued' (budget left) or 'failed' (budget spent) — never
 *   parking it in 'interrupted', the black-hole state S3-63 diagnosed.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	claimNextQueuedJob,
	deleteJobsForTests,
	enqueueDiffusionJob,
	getJobById,
	sweepStaleJobs,
} from '../../src/diffusion/jobs/queue.ts';
import type { DiffusionJobSpec } from '../../src/diffusion/jobs/queue.ts';
import { DIFFUSION_JOBS_TABLE } from '../../src/diffusion/jobs/schema.ts';

const OWNER = 424401;
const createdJobIds: string[] = [];

function spec(element: string, section: string): DiffusionJobSpec {
	return {
		diffusion_element_tipo: element,
		section_tipo: section,
		type: 'sql',
		sqo: { section_tipo: [section], limit: 10, offset: 0 },
		estimated_total: 1,
		options: {},
	};
}

async function enqueue(element: string, section: string): Promise<string> {
	const { job } = await enqueueDiffusionJob({
		ownerUserId: OWNER,
		clientProcessId: `process_diffusion_${OWNER}_${element}_${section}`,
		spec: spec(element, section),
	});
	createdJobIds.push(job.job_id);
	return job.job_id;
}

afterAll(async () => {
	await deleteJobsForTests(createdJobIds);
});

/** Un-claim a job that belongs to the LIVE system (see the shared-table note). */
async function restoreForeignClaim(jobId: string): Promise<void> {
	await sql.unsafe(
		`UPDATE "${DIFFUSION_JOBS_TABLE}"
		 SET state = 'queued', runner = '{}'::jsonb, heartbeat_at = NULL,
		     attempt = GREATEST(attempt - 1, 0)
		 WHERE job_id = $1 AND state = 'running'`,
		[jobId],
	);
}

/** Claim until one of OUR jobs comes back (restoring any live job we caught —
 * the queue is shared with the live scheduler until DEC-18's table seam lands). */
async function claimMine(budget: number | undefined): Promise<string | null> {
	for (let i = 0; i < 10; i++) {
		const claimed = await claimNextQueuedJob('ops-test-host', budget);
		if (claimed === null) return null;
		if (createdJobIds.includes(claimed.job_id)) return claimed.job_id;
		await restoreForeignClaim(claimed.job_id);
	}
	return null;
}

describe('claim-with-budget (S3-64)', () => {
	test('claims stop at the budget even with queued work waiting', async () => {
		// The table is SHARED with the live system (DEC-18 seam pending), so the
		// budget is expressed relative to the ambient running count.
		const ambientRows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM "${DIFFUSION_JOBS_TABLE}" WHERE state = 'running'`,
		)) as { n: number }[];
		const budget = (ambientRows[0]?.n ?? 0) + 2;

		const a = await enqueue('opsbudget1', 'opsbudgetsec1');
		const b = await enqueue('opsbudget2', 'opsbudgetsec2');
		const c = await enqueue('opsbudget3', 'opsbudgetsec3');

		const first = await claimMine(budget);
		const second = await claimMine(budget);
		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		// Budget spent: the next claim must refuse although a job is queued.
		const third = await claimNextQueuedJob('ops-test-host', budget);
		expect(third).toBeNull();

		// Budget-less claim (the pre-existing signature) still claims.
		const unbounded = await claimMine(undefined);
		expect(unbounded).not.toBeNull();
		// Park all three out of 'running' so they never distort the live budget
		// (deleteJobsForTests removes them at the end regardless).
		for (const id of [a, b, c]) {
			await sql.unsafe(
				`UPDATE "${DIFFUSION_JOBS_TABLE}" SET state = 'cancelled', finished_at = now() WHERE job_id = $1`,
				[id],
			);
		}
	});
});

describe('claim-with-budget under CONCURRENCY (READ COMMITTED race)', () => {
	test('N simultaneous claims with room for exactly ONE admit at most one', async () => {
		// The hazard: claimNextQueuedJob's budget check is an uncorrelated
		// count(running) subquery — under READ COMMITTED two concurrent claim
		// statements can BOTH snapshot count<max and (SKIP LOCKED handing them
		// different queued rows) BOTH admit, overshooting the budget. Repeat the
		// round several times: the race is timing-dependent, one over-admission
		// anywhere fails the gate.
		for (let round = 0; round < 8; round++) {
			const ambientRows = (await sql.unsafe(
				`SELECT count(*)::int AS n FROM "${DIFFUSION_JOBS_TABLE}" WHERE state = 'running'`,
			)) as { n: number }[];
			const budget = (ambientRows[0]?.n ?? 0) + 1; // room for exactly ONE more

			const a = await enqueue(`opsrace${round}a`, `opsracesec${round}a`);
			const b = await enqueue(`opsrace${round}b`, `opsracesec${round}b`);

			const claims = await Promise.all([
				claimNextQueuedJob('ops-race-host-1', budget),
				claimNextQueuedJob('ops-race-host-2', budget),
			]);
			const succeeded = claims.filter((claim) => claim !== null);
			// Hygiene FIRST (a failed expect must not leave running claims behind):
			// ours → cancel; a foreign scratch job caught by SKIP LOCKED → restore.
			for (const claim of succeeded) {
				if (createdJobIds.includes(claim.job_id)) {
					await sql.unsafe(
						`UPDATE "${DIFFUSION_JOBS_TABLE}" SET state = 'cancelled', finished_at = now() WHERE job_id = $1`,
						[claim.job_id],
					);
				} else {
					await restoreForeignClaim(claim.job_id);
				}
			}
			for (const id of [a, b]) {
				await sql.unsafe(
					`UPDATE "${DIFFUSION_JOBS_TABLE}" SET state = 'cancelled', finished_at = now() WHERE job_id = $1 AND state = 'queued'`,
					[id],
				);
			}
			expect(succeeded.length).toBeLessThanOrEqual(1);
		}
	}, 60_000);
});

describe('crash-atomic sweep (S3-63)', () => {
	test('one sweep call: budget left → queued; budget spent → failed; never interrupted', async () => {
		const requeueable = await enqueue('opssweep1', 'opssweepsec1');
		const doomed = await enqueue('opssweep2', 'opssweepsec2');
		await sql.unsafe(
			`UPDATE "${DIFFUSION_JOBS_TABLE}"
			 SET state = 'running', attempt = 1, max_attempts = 3,
			     heartbeat_at = now() - interval '1 hour'
			 WHERE job_id = $1`,
			[requeueable],
		);
		await sql.unsafe(
			`UPDATE "${DIFFUSION_JOBS_TABLE}"
			 SET state = 'running', attempt = 3, max_attempts = 3,
			     heartbeat_at = now() - interval '1 hour'
			 WHERE job_id = $1`,
			[doomed],
		);

		const swept = await sweepStaleJobs(20);
		expect(swept.requeued).toContain(requeueable);
		expect(swept.failed).toContain(doomed);

		const requeuedRow = await getJobById(requeueable);
		expect(requeuedRow?.state).toBe('queued');
		expect(requeuedRow?.runner).toEqual({});

		const failedRow = await getJobById(doomed);
		expect(failedRow?.state).toBe('failed');
		expect(failedRow?.finished_at).not.toBeNull();
		expect(String(failedRow?.result?.msg)).toContain('Interrupted after 3 attempts');
		expect(String(failedRow?.totals?.msg)).toContain('Interrupted after 3 attempts');

		// The black-hole state never appears (crash-atomicity is structural: one
		// UPDATE statement — but at minimum the OBSERVABLE contract holds).
		for (const id of [requeueable, doomed]) {
			expect((await getJobById(id))?.state).not.toBe('interrupted');
		}
		// Park the requeued job so the live scheduler never claims a fake tipo.
		await sql.unsafe(
			`UPDATE "${DIFFUSION_JOBS_TABLE}" SET state = 'cancelled', finished_at = now() WHERE job_id = $1`,
			[requeueable],
		);
	});
});
