/**
 * DIFFUSION RUNNER — the publication job entrypoint, EXECUTED (GATE-41).
 *
 * `src/diffusion/runner.ts` is the process the scheduler spawns per claimed job
 * and the code that runs the destructive half of publication (removeRecords).
 * Until this gate it was loaded by NO test: `diffusion_actions.test.ts` spawns
 * it through the scheduler in `stub_run` mode (runStubJob — no plan, no
 * writes), and `diffusion_compile_degrade_native` reads the file and makes
 * five `toContain` string assertions on call expressions. A mutation that gate
 * cannot see, by construction: pass the FULL record list to `removeRecords`
 * and every string still matches — this gate is what turns that red.
 *
 * WHAT IT DRIVES. The exported `runJob(jobId)` IN-PROCESS on the suite
 * database, through the real queue: enqueue → claim (the scheduler's own
 * transition) → runJob → read the job row + the published output back. The
 * situation is the zzdif generic domain (test/helpers/zzdif_diffusion_domain.ts)
 * — its markdown FILE element `zzdif80`, so the run needs Postgres + a scratch
 * files root and nothing else: the sql element's MariaDB target is not something the
 * suite owns, and `runJob` cannot be handed a plan (it compiles its own from
 * `DEDALO_DIFFUSION_DOMAIN`, which this gate points at the fixture's domain for
 * the duration of the run — readEnv is live, virtual_tree resolves by term).
 * The MariaDB leg is therefore NOT here, and that is stated rather than
 * papered over: every branch of `runJob` / `runPublicationJob` executes on the
 * file leg (plan → resolve → writeRows → removeRecords → dd1758 log →
 * progress → checkpoint → close / fail / cancel), only the sql writer session
 * differs, and it has its own gate.
 *
 * LEGS (each mutation-verified against runner.ts — see the row in
 * engineering/TRIPWIRES.md):
 *   completed — state, ok:true result, tables, checkpoint {cursor,
 *               run_started_at, processed}, totals.counter, one dd1758
 *               'published' row per PUBLISHABLE primary, one `.md` per
 *               publishable id, and a PLANTED stale file for the dd64/no record
 *               is UNLINKED by removeRecords (the destructive half, observed);
 *   failed    — the broken element (unknown parser fn) → 'failed', ok:false,
 *               the typed compile code, the msg prefix;
 *   cancelled — cancel requested before the run → 'cancelled' + the pinned msg;
 *   no-op     — a queued (unclaimed) job and an unknown id are left untouched.
 *
 * WRITES: job rows in the per-run scratch jobs table, dd1758 rows in the
 * scratch activity table (both preload seams), files under a MARKED scratch
 * media root — all swept in afterAll; the situation's residue is asserted 0.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import { activityTable } from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import {
	checkpointJob,
	claimNextQueuedJob,
	type DiffusionJobRow,
	deleteJobsForTests,
	enqueueDiffusionJob,
	getJobById,
	listActiveJobs,
	requestCancel,
} from '../../src/diffusion/jobs/queue.ts';
import { pauseScheduler, resumeScheduler } from '../../src/diffusion/jobs/scheduler.ts';
import { bumpOntologyRevision } from '../../src/diffusion/plan/cache.ts';
import { runJob } from '../../src/diffusion/runner.ts';
import { scratchMediaRoot } from '../helpers/media_scratch_root.ts';
import {
	dropZzdifDomain,
	ensureZzdifDomain,
	ZZDIF_BROKEN_ELEMENT,
	ZZDIF_DOMAIN_NAME,
	ZZDIF_EXTRA_PUBLISHABLE_IDS,
	ZZDIF_FILE_ELEMENT,
	ZZDIF_FILE_FORMAT,
	ZZDIF_FILE_SERVICE_NAME,
	ZZDIF_FILE_TABLE_NAME,
	ZZDIF_PUBLISHABLE_ID,
	ZZDIF_SECTION,
	ZZDIF_UNPUBLISHABLE_ID,
} from '../helpers/zzdif_diffusion_domain.ts';

/** The superuser: unscoped selection, and a real owner for the dd1758 actor. */
const OWNER = -1;
/** The runner's cancellation line (runner.ts CANCELLED_MSG — the client renders it). */
const CANCELLED_MSG = 'Process cancelled by user';

const PUBLISHABLE_IDS = [ZZDIF_PUBLISHABLE_ID, ...ZZDIF_EXTRA_PUBLISHABLE_IDS].sort();

let filesRoot: string;
const savedEnv: Record<string, string | undefined> = {};
const createdJobIds: string[] = [];

function setEnv(key: string, value: string): void {
	savedEnv[key] = process.env[key];
	process.env[key] = value;
}
function restoreEnv(): void {
	for (const [key, value] of Object.entries(savedEnv)) {
		// assigning undefined would leave the string 'undefined' in process.env
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

/** The run directory: `<root>/<format>/<service_name>/` (writers/files.ts). */
function outputDir(): string {
	return join(filesRoot, ZZDIF_FILE_FORMAT, ZZDIF_FILE_SERVICE_NAME);
}

/** Per-record file — the delete-side grammar `<section_tipo>_<section_id>.md`. */
function recordFile(sectionId: number): string {
	return join(outputDir(), `${ZZDIF_SECTION}_${sectionId}.md`);
}

/** section_ids that currently have a published `.md` in the run directory. */
function publishedIds(): number[] {
	if (!existsSync(outputDir())) return [];
	const pattern = new RegExp(`^${ZZDIF_SECTION}_(\\d+)\\.md$`);
	return readdirSync(outputDir())
		.map((name) => pattern.exec(name)?.[1])
		.filter((id): id is string => id !== undefined)
		.map(Number)
		.sort();
}

/** dd1758 'published' (action 1) rows for the primary section, by target id. */
async function publishedActivityIds(): Promise<number[]> {
	const rows = (await sql.unsafe(
		`SELECT (relation->'dd1763'->0->>'section_id')::int AS id
		 FROM "${activityTable()}"
		 WHERE section_tipo = 'dd1758'
		   AND relation->'dd1763'->0->>'section_tipo' = $1
		   AND relation->'dd1767'->0->>'diffusion_action' = '1'`,
		[ZZDIF_SECTION],
	)) as { id: number }[];
	return rows.map((row) => row.id).sort();
}

/** Enqueue one job for `elementTipo` and CLAIM it the way the scheduler does. */
async function enqueueAndClaim(
	elementTipo: string,
	options: Record<string, unknown> = {},
): Promise<DiffusionJobRow> {
	const { job, attached } = await enqueueDiffusionJob({
		ownerUserId: OWNER,
		clientProcessId: `process_diffusion_${OWNER}_${elementTipo}_${ZZDIF_SECTION}`,
		spec: {
			diffusion_element_tipo: elementTipo,
			section_tipo: ZZDIF_SECTION,
			type: ZZDIF_FILE_FORMAT,
			sqo: { section_tipo: ZZDIF_SECTION },
			estimated_total: PUBLISHABLE_IDS.length + 1,
			options,
		},
	});
	createdJobIds.push(job.job_id);
	if (attached) throw new Error(`attached to a pre-existing active run for ${elementTipo}`);
	const claimed = await claimNextQueuedJob('diffusion_runner_native');
	if (claimed === null || claimed.job_id !== job.job_id) {
		throw new Error(
			`claimed ${claimed?.job_id ?? 'nothing'} instead of the job just enqueued (${job.job_id}) — a stale queued row survived the purge`,
		);
	}
	expect(claimed.state).toBe('running');
	return claimed;
}

beforeAll(async () => {
	// No scheduler tick may claim our queued job between enqueue and claim.
	pauseScheduler();
	await ensureZzdifDomain();
	filesRoot = scratchMediaRoot('dedalo_diffusion_runner_');
	setEnv('DEDALO_DIFFUSION_FILES_ROOT', filesRoot);
	// runJob compiles its plan from the CONFIGURED domain; point it at the fixture.
	setEnv('DEDALO_DIFFUSION_DOMAIN', ZZDIF_DOMAIN_NAME);
	bumpOntologyRevision(); // a plan cached under another domain must not serve
	// A queued row left behind by an earlier file would be claimed before ours.
	const stale = (await listActiveJobs()).filter((row) => row.state === 'queued');
	await deleteJobsForTests(stale.map((row) => row.job_id));
	await sql.unsafe(
		`DELETE FROM "${activityTable()}" WHERE section_tipo = 'dd1758'
		   AND relation->'dd1763'->0->>'section_tipo' = $1`,
		[ZZDIF_SECTION],
	);
});

afterAll(async () => {
	await deleteJobsForTests(createdJobIds);
	await sql.unsafe(
		`DELETE FROM "${activityTable()}" WHERE section_tipo = 'dd1758'
		   AND relation->'dd1763'->0->>'section_tipo' = $1`,
		[ZZDIF_SECTION],
	);
	restoreEnv();
	bumpOntologyRevision();
	resumeScheduler();
	if (filesRoot !== undefined) rmSync(filesRoot, { recursive: true, force: true });
	expect(await dropZzdifDomain()).toBe(0);
});

describe('runJob — the real publication pipeline on the file element', () => {
	let job: DiffusionJobRow;
	let finished: DiffusionJobRow;

	beforeAll(async () => {
		// A STALE publication of the record that is dd64/no today — what a real
		// site holds after an editor withdraws a record. The run must unlink it.
		mkdirSync(outputDir(), { recursive: true });
		writeFileSync(
			recordFile(ZZDIF_UNPUBLISHABLE_ID),
			`# stale publication of ${ZZDIF_UNPUBLISHABLE_ID} — must be removed by the run\n`,
		);
		job = await enqueueAndClaim(ZZDIF_FILE_ELEMENT);
		await runJob(job.job_id);
		const row = await getJobById(job.job_id);
		if (row === null) throw new Error('job row vanished during the run');
		finished = row;
	}, 120_000);

	test('the job finishes completed with a success record naming the published table', () => {
		expect(finished.state).toBe('completed');
		expect(finished.result?.ok).toBe(true);
		expect(finished.result?.msg).toBe('OK. Request done');
		const tables = finished.result?.tables as { table_name: string; records_affected: number }[];
		const table = tables.find((entry) => entry.table_name === ZZDIF_FILE_TABLE_NAME);
		// 4 files written + 1 stale file unlinked (markdown counters)
		expect(table?.records_affected).toBe(PUBLISHABLE_IDS.length + 1);
		expect(finished.result?.errors).toEqual([]);
	});

	test('the output holds EXACTLY the publishable primaries — the stale dd64/no file is UNLINKED', () => {
		// The destructive half, observed. A runner that passed the whole batch to
		// removeRecords (the mutation the string gate could not see) unlinks every
		// file it just wrote; one that skipped removeRecords leaves the planted
		// stale file on the "site".
		expect(publishedIds()).toEqual(PUBLISHABLE_IDS);
		expect(existsSync(recordFile(ZZDIF_UNPUBLISHABLE_ID))).toBe(false);
	});

	test('progress + checkpoint are the resume contract: cursor, run_started_at, processed', () => {
		// processed counts PRIMARY records seen (publish AND unpublish): 5.
		const seen = PUBLISHABLE_IDS.length + 1;
		expect(finished.totals.counter).toBe(seen);
		expect(finished.checkpoint.processed).toBe(seen);
		// keyset cursor = the last primary id of the (single) batch
		expect(Number(finished.checkpoint.cursor)).toBe(Math.max(...PUBLISHABLE_IDS));
		const runStartedAt = Number(finished.checkpoint.run_started_at);
		expect(runStartedAt).toBeGreaterThan(1_700_000_000);
		expect(runStartedAt).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
	});

	test('one dd1758 published row per PUBLISHABLE primary — none for the unpublishable one', async () => {
		expect(await publishedActivityIds()).toEqual(PUBLISHABLE_IDS);
	});
});

describe('runJob — failure is a typed FAILURE RECORD on the job row', () => {
	test('the broken element (unknown parser fn) fails the job with the compile code and msg prefix', async () => {
		const job = await enqueueAndClaim(ZZDIF_BROKEN_ELEMENT);
		await runJob(job.job_id);
		const finished = await getJobById(job.job_id);
		expect(finished?.state).toBe('failed');
		expect(finished?.result?.ok).toBe(false);
		const error = finished?.result?.error as { code: string };
		expect(error.code).toBe('diffusion.plan_compile_failed');
		expect(String(finished?.result?.msg)).toStartWith('Error. Diffusion run failed: ');
		expect(finished?.totals.msg).toBe(String(finished?.result?.msg));
	}, 120_000);
});

describe('runJob — cancellation and idempotent restarts', () => {
	test('a cancel requested before the first batch ends the run cancelled with the pinned msg', async () => {
		const job = await enqueueAndClaim(ZZDIF_FILE_ELEMENT);
		const { cancelled } = await requestCancel(job.client_process_id, OWNER);
		expect(cancelled).toBe(true);
		await runJob(job.job_id);
		const finished = await getJobById(job.job_id);
		expect(finished?.state).toBe('cancelled');
		expect(finished?.result?.ok).toBe(false);
		expect((finished?.result?.error as { code: string }).code).toBe('diffusion.cancelled');
		expect(finished?.result?.msg).toBe(CANCELLED_MSG);
	}, 120_000);

	test('a RESUMED job continues after its checkpoint: cursor honoured, processed carried, run_started_at NOT re-stamped', async () => {
		// The runner's checkpoint read (runner.ts runPublicationJob). A crashed
		// runner's job is re-claimed with the checkpoint of its last COMMITTED
		// batch; the resume must publish only the primaries AFTER the cursor,
		// count on from `processed`, and keep the FIRST attempt's timestamp.
		rmSync(outputDir(), { recursive: true, force: true });
		await sql.unsafe(
			`DELETE FROM "${activityTable()}" WHERE section_tipo = 'dd1758'
			   AND relation->'dd1763'->0->>'section_tipo' = $1`,
			[ZZDIF_SECTION],
		);
		const job = await enqueueAndClaim(ZZDIF_FILE_ELEMENT);
		// the first attempt "committed" the primaries up to the dd64/no record
		const cursor = ZZDIF_UNPUBLISHABLE_ID;
		const alreadyProcessed = 2; // 940001 + 940002
		const firstAttemptStartedAt = 1_800_000_000; // a pinned past instant
		await checkpointJob(job.job_id, {
			cursor,
			run_started_at: firstAttemptStartedAt,
			processed: alreadyProcessed,
		});
		await runJob(job.job_id);
		const finished = await getJobById(job.job_id);
		expect(finished?.state).toBe('completed');
		const remaining = PUBLISHABLE_IDS.filter((id) => id > cursor);
		expect(remaining.length).toBeGreaterThan(0);
		expect(publishedIds()).toEqual(remaining);
		expect(await publishedActivityIds()).toEqual(remaining);
		expect(finished?.totals.counter).toBe(alreadyProcessed + remaining.length);
		expect(finished?.checkpoint.processed).toBe(alreadyProcessed + remaining.length);
		expect(Number(finished?.checkpoint.run_started_at)).toBe(firstAttemptStartedAt);
		expect(Number(finished?.checkpoint.cursor)).toBe(Math.max(...remaining));
	}, 120_000);

	test('a job that is not running (queued, never claimed) is left untouched', async () => {
		const { job } = await enqueueDiffusionJob({
			ownerUserId: OWNER,
			clientProcessId: `process_diffusion_${OWNER}_${ZZDIF_FILE_ELEMENT}_${ZZDIF_SECTION}`,
			spec: {
				diffusion_element_tipo: ZZDIF_FILE_ELEMENT,
				section_tipo: ZZDIF_SECTION,
				type: ZZDIF_FILE_FORMAT,
				sqo: { section_tipo: ZZDIF_SECTION },
				estimated_total: 0,
				options: {},
			},
		});
		createdJobIds.push(job.job_id);
		expect(job.state).toBe('queued');
		await runJob(job.job_id);
		const after = await getJobById(job.job_id);
		expect(after?.state).toBe('queued');
		expect(after?.result).toBeNull();
		await deleteJobsForTests([job.job_id]);
	});

	test('an unknown job id is a no-op, not a throw', async () => {
		await expect(runJob('00000000-0000-4000-8000-000000000000')).resolves.toBeUndefined();
	});
});
