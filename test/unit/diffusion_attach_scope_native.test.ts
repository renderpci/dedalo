/**
 * DIFF-3 — ATTACH AND FOLLOW ARE SCOPED TO THE RUN'S OWNER AND ITS SPEC.
 *
 * THE FINDING (audit 2026-09-26, DIFF-3). A second `diffuse` on an
 * (element, section) that already had an active run ATTACHED to that run —
 * whoever asked, whatever they asked for: the partial unique index answered the
 * conflict, and the action handed the caller the live run's follow stream. User B
 * clicking "publish" on the section user A was publishing received A's progress
 * frames (A's run, A's counters, A's outcome) as if they were B's own, and B's
 * own request — perhaps a different selection — was silently dropped.
 *
 * THE CONTRACT (owner decision 2026-09-30: the exclusion unit stays one active
 * run per (element, section) — the index is what keeps two writers off one
 * target — but attach is scoped): a second request ATTACHES only when it is the
 * SAME owner asking for the SAME run (canonical spec: type, sqo, options without
 * the display-only `total`); anything else is refused with the typed
 * `diffusion.target_busy` (409, retryable), whose body names none of the live
 * run's identity (owner, job id, label). The follow stream reads the job through
 * an OWNER-SCOPED getter — gated through the real action: a followed run that
 * is another owner's by the next poll yields the not-found chunk, never a frame
 * of that run.
 *
 * DRIVEN through the real action (`diffuseAction`) with the synthetic ACL
 * fixture's two real principals — A the non-admin reader (read = 1 on test3),
 * B the global admin — on a fake element this file owns (`zzdifc…`, stub runs,
 * scheduler paused: no runner ever starts, the job stays queued). Admins are NOT
 * exempt: strict owner equality (flagged for owner review in the WC entry).
 *
 * NOT HERMETIC: enqueues on the lane's suite database diffusion jobs table and
 * resolves the fixture principals through matrix_users/matrix_profiles.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { CATEGORY_STATUS, isDedaloError, toErrorBody } from '../../src/core/errors/index.ts';
import { type Principal, resolvePrincipal } from '../../src/core/security/permissions.ts';
import { diffuseAction } from '../../src/diffusion/api/actions.ts';
import * as queue from '../../src/diffusion/jobs/queue.ts';
import {
	type DiffusionJobRow,
	deleteJobsForTests,
	getJobByClientProcessId,
	getJobById,
	requestCancel,
} from '../../src/diffusion/jobs/queue.ts';
import { pauseScheduler, resumeScheduler } from '../../src/diffusion/jobs/scheduler.ts';
import { DIFFUSION_JOBS_TABLE } from '../../src/diffusion/jobs/schema.ts';
import {
	ACL_ADMIN_USER_ID,
	ACL_GRANTED_SECTION,
	ACL_NON_ADMIN_USER_ID,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { ensureDiffusionScratchTables } from '../helpers/diffusion_scratch_tables.ts';

const ELEMENT_PREFIX = 'zzdifc';
const ELEMENT = `${ELEMENT_PREFIX}1`;
const SECTION = ACL_GRANTED_SECTION;
const createdJobIds: string[] = [];

async function purgeOwnRows(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM "${DIFFUSION_JOBS_TABLE}"
		 WHERE spec->>'diffusion_element_tipo' LIKE '${ELEMENT_PREFIX}%'
		    OR client_process_id LIKE 'process_diffusion_%_${ELEMENT_PREFIX}%'`,
	);
}

function labelOf(principal: Principal): string {
	return `process_diffusion_${principal.userId}_${ELEMENT}_${SECTION}`;
}

type DiffuseOutcome =
	| { kind: 'stream'; stream: ReadableStream<Uint8Array> }
	| { kind: 'error'; error: unknown };

/** One `diffuse` as `principal` (stub run, the scheduler is paused). */
async function diffuse(
	principal: Principal,
	sqo: Record<string, unknown> = { section_tipo: [SECTION], limit: 1 },
): Promise<DiffuseOutcome> {
	try {
		const result = await diffuseAction(
			{
				action: 'diffuse',
				dd_api: 'dd_diffusion_api',
				source: { section_tipo: SECTION },
				sqo,
				options: {
					type: 'sql',
					diffusion_element_tipo: ELEMENT,
					total: 1,
					process_id: labelOf(principal),
					stub_run: true,
				},
			} as never,
			principal,
		);
		return { kind: 'stream', stream: result.stream as ReadableStream<Uint8Array> };
	} catch (error) {
		return { kind: 'error', error };
	}
}

/** The first frame of a follow stream, then the stream is released. */
async function firstFrame(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	try {
		const { value } = await reader.read();
		return new TextDecoder().decode(value ?? new Uint8Array());
	} finally {
		await reader.cancel().catch(() => {});
	}
}

function expectTargetBusy(outcome: DiffuseOutcome, why: string): unknown {
	if (outcome.kind === 'stream') void outcome.stream.cancel().catch(() => {});
	expect(outcome.kind, why).toBe('error');
	const error = (outcome as { error: unknown }).error;
	expect(isDedaloError(error), `expected a DedaloError, got ${String(error)}`).toBe(true);
	expect((error as { code: string }).code).toBe('diffusion.target_busy');
	return error;
}

describe.if(DB_READY)('DIFF-3 — attach is scoped to the run owner and its spec', () => {
	let userA: Principal;
	let userB: Principal;
	let jobA: DiffusionJobRow;

	beforeAll(async () => {
		await installAclIdentityFixture();
		await ensureDiffusionScratchTables();
		await purgeOwnRows();
		pauseScheduler();
		userA = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
		userB = await resolvePrincipal(ACL_ADMIN_USER_ID);
	});
	afterAll(async () => {
		await requestCancel(labelOf(userA), null).catch(() => {});
		await deleteJobsForTests(createdJobIds);
		await purgeOwnRows();
		resumeScheduler();
		await removeAclIdentityFixture();
	});

	test('A diffuses: a run is enqueued and A follows it', async () => {
		const outcome = await diffuse(userA);
		expect(outcome.kind).toBe('stream');
		if (outcome.kind === 'stream') void outcome.stream.cancel().catch(() => {});
		const job = await getJobByClientProcessId(labelOf(userA), null);
		expect(job?.state).toBe('queued');
		expect(job?.owner_user_id).toBe(userA.userId);
		jobA = job as DiffusionJobRow;
		createdJobIds.push(jobA.job_id);
	});

	test("B on A's target is REFUSED (409 diffusion.target_busy), never attached; the body names nothing of A's run", async () => {
		const error = expectTargetBusy(
			await diffuse(userB),
			"B was ATTACHED to A's run: B's diffuse returned the follow stream of a run B does not own",
		);
		const errorBody = toErrorBody(error as never);
		// 409: the conflict category's status (CATEGORY_STATUS), retryable.
		expect(errorBody.category).toBe('conflict');
		expect(CATEGORY_STATUS.conflict).toBe(409);
		const body = JSON.stringify(errorBody);
		expect(body).not.toContain(jobA.job_id);
		expect(body).not.toContain(jobA.client_process_id);
		expect(body).not.toContain(String(userA.userId));
		// A's run is untouched; no row carries B.
		const after = await getJobById(jobA.job_id);
		expect(after?.state).toBe('queued');
		expect(after?.owner_user_id).toBe(userA.userId);
		const [rowsOfB] = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM "${DIFFUSION_JOBS_TABLE}"
			 WHERE spec->>'diffusion_element_tipo' = $1 AND owner_user_id = $2`,
			[ELEMENT, userB.userId],
		)) as { n: number }[];
		expect(rowsOfB?.n).toBe(0);
	});

	test('A asking for a DIFFERENT selection on the busy target is refused too (never attached to the other spec)', async () => {
		expectTargetBusy(
			await diffuse(userA, { section_tipo: [SECTION], limit: 2 }),
			"A's second request with another selection was ATTACHED to the first run — the second selection is silently dropped",
		);
	});

	test('CONTROL — A repeating the SAME request attaches, and its frames carry A’s process_id', async () => {
		const outcome = await diffuse(userA);
		expect(outcome.kind).toBe('stream');
		const frame = await firstFrame((outcome as { stream: ReadableStream<Uint8Array> }).stream);
		expect(frame).toContain(labelOf(userA));
		const job = await getJobByClientProcessId(labelOf(userA), null);
		expect(job?.job_id).toBe(jobA.job_id);
	});

	test("the FOLLOW is owner-scoped: a stream whose run becomes another owner's yields none of that run's frames", async () => {
		// The attach decision is one guard; the follow getter is the other. Drive
		// the second through the real action: A attaches to its own run, then the
		// run the stream follows is B's (the row re-owned between two polls — the
		// shape of an enqueue that handed back a job the caller does not own).
		const outcome = await diffuse(userA);
		expect(outcome.kind).toBe('stream');
		const reader = (outcome as { stream: ReadableStream<Uint8Array> }).stream.getReader();
		const marker = 'zzdifc: B OWNS THIS RUN NOW';
		try {
			const first = new TextDecoder().decode((await reader.read()).value ?? new Uint8Array());
			expect(first).toContain(labelOf(userA));
			await sql.unsafe(
				`UPDATE "${DIFFUSION_JOBS_TABLE}"
				 SET owner_user_id = $2,
				     totals = jsonb_set(COALESCE(totals, '{}'::jsonb), '{msg}', to_jsonb($3::text))
				 WHERE job_id = $1`,
				[jobA.job_id, userB.userId, marker],
			);
			const next = await Promise.race([
				reader.read().then(({ value }) => new TextDecoder().decode(value ?? new Uint8Array())),
				new Promise<string>((resolve) => setTimeout(() => resolve('<no frame in 5 s>'), 5000)),
			]);
			expect(
				next,
				'the follow stream served the frames of a run the caller does not own (unscoped getter)',
			).not.toContain(marker);
			// …and it says so: the terminal not-found chunk, not silence.
			expect(next).toContain('Process not found');
		} finally {
			await reader.cancel().catch(() => {});
			await sql.unsafe(
				`UPDATE "${DIFFUSION_JOBS_TABLE}" SET owner_user_id = $2 WHERE job_id = $1`,
				[jobA.job_id, userA.userId],
			);
		}
	}, 20_000);

	test("the follow getter is OWNER-SCOPED: B cannot read A's job through it", async () => {
		const getOwned = (queue as Record<string, unknown>).getOwnedJobById;
		expect(typeof getOwned, 'queue.ts exports no owner-scoped job getter').toBe('function');
		const owned = getOwned as (jobId: string, owner: number) => Promise<DiffusionJobRow | null>;
		expect(await owned(jobA.job_id, userB.userId)).toBeNull();
		expect((await owned(jobA.job_id, userA.userId))?.job_id).toBe(jobA.job_id);
	});
});
