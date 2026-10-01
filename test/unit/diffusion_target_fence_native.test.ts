/**
 * DIFF-2 — THE PUBLICATION TARGET IS FENCED: one writer at a time, and a
 * revoked runner writes NOTHING.
 *
 * THE FINDING (audit 2026-09-26, DIFF-2). The lease epoch (PUB-13) fenced every
 * write to the JOB ROW, but nothing fenced the TARGET: a runner checked its lease
 * only when it wrote progress, i.e. AFTER a batch's files or MariaDB rows had
 * landed. A runner the sweeper revoked while it was slow kept publishing into the
 * target the new epoch was publishing into, and the rdf/xml `abort()` swept every
 * `.tmp-*` in the shared target directory — including another session's
 * in-flight temps. The exclusion unit (element, section) was not the thing that
 * can be corrupted: the TARGET is (a files directory, a MariaDB database).
 *
 * WHAT IS ASSERTED — outcomes (files on disk, MariaDB rows, dd1758 rows, the job
 * row), each leg built here on the zzdif generic domain:
 *   A.  a runner that must WAIT for a target another session holds (the
 *       per-target advisory lock of the fence) shows the busy message; revoked
 *       while it waits (sweep + a newer claim) it then writes NOTHING — no file,
 *       no MariaDB row, no dd1758 row; the newer epoch then publishes everything
 *       (positive control), and its FENCED close sweeps a crashed holder's
 *       leftover `.tmp-*` from the directory (writers/files.ts sweepStaleTemps).
 *       Once for the markdown file element, once for the sql element.
 *   A3. the CLOSE is a fenced unit too: a target taken between the last batch
 *       and close() makes the runner wait (busy) with the consolidated zip and
 *       a live holder's `.tmp-*` untouched; revoked meanwhile, it renames no
 *       zip and sweeps no temp; the live epoch resumes with no batch left and
 *       closes.
 *   B.  a runner blocked INSIDE its batch (MariaDB `LOCK TABLES … WRITE` held by
 *       another connection) cannot be revoked: the sweeper requeues nothing, a
 *       cancel request does not block, and the run ends on its own epoch.
 *   C.  the sweeper, SQL-level: a running row another transaction holds
 *       `FOR KEY SHARE` (the fence's hold) is skipped; once released, swept.
 *   D.  the other target doors wait for the fence too: the record-delete
 *       executor gives up after its bound (the target in `errors`, the row still
 *       there — dd1758 stays pending), and the ghost unpublish applies only
 *       after the holder releases.
 *   D4. core's files-unlink door (`unlinkPublishedFiles`, the record delete's
 *       settle and the retry drains) takes the files target's fence SHARED:
 *       an exclusive holder leaves the file and the row pending on the request
 *       path, a patient drain waits for it, another unpublisher does not.
 *   D2. the retry DRAINS wait, through their real doors (the runner's
 *       opportunistic retry, the retry_pending_deletions action, the
 *       maintenance widget's retry): the target
 *       held for 1.5 s, the debt is paid after; and the drain's patience is ONE
 *       budget (two held databases in one scope cost ~10 s, not 20 s).
 *   E.  a record deleted from the archive WHILE its batch waited for the target
 *       is not published: revalidated under the lock, unpublished instead.
 *   F.  a LIVE unit whose target step outlasts the idle bound (shortened by
 *       the test seam) still holds its lock: the timer keepalive, not the door,
 *       keeps the fence session alive.
 *   H.  liveness stamps are the WALL clock: progress, checkpoint and finish
 *       written at the end of a fenced unit held past the stale bound leave the
 *       row live at commit (the sweeper revokes nothing) and finished_at is the
 *       completion, not the unit start.
 *   G.  a runner in a pool of ONE connection (the real runJob, in a process of
 *       its own) fails loudly before it touches the target; in a pool of two it
 *       publishes.
 *   +   the rdf/xml `abort()` sweeps no temps, while a FENCED close does
 *       (writer level: diffusion_rdfxml_writers.test.ts).
 *
 * THE LOCK KEY is a cross-door contract, not an implementation detail: the
 * runner, the delete executor, the ghost reconcile and the core files-unlink
 * door must all name the same target the same way (one producer:
 * core/diffusion_bridge/target_lock.ts) —
 * `pg_advisory_*lock(17580002, hashtext('sql:<database>' | 'files:<format>/<label>'))`.
 * This gate holds it from ANOTHER session, exactly like a second writer would;
 * the last test pins that the fence module's producers agree with it.
 *
 * WRITES: job rows in the lane's scratch jobs table, dd1758 rows in the scratch
 * activity table, files under a MARKED scratch root, tables in the zzdif suite
 * MariaDB database, one zzdif1 matrix row deleted (leg E, the situation is
 * dropped in afterAll) — all swept; the situation's residue is asserted 0.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { widget as diffusionServerControl } from '../../src/core/area_maintenance/widgets/diffusion_server_control.ts';
import { runDetachedFromTransaction, sql } from '../../src/core/db/postgres.ts';
import {
	activityTable,
	DIFFUSION_ACTION,
	logDiffusionActivity,
	registerNativeDiffusionSqlDelete,
	resetNativeDiffusionSqlDeleteForTests,
	unlinkPublishedFiles,
} from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import {
	DELETE_TARGET_LOCK_BOUND_MS,
	withPatientDeleteWait,
	withTargetLock,
} from '../../src/core/diffusion_bridge/target_lock.ts';
import { isTempSibling } from '../../src/core/files/temp_path.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { retryPendingDeletionsAction } from '../../src/diffusion/api/actions.ts';
import { retryPendingUnpublishOpportunistically } from '../../src/diffusion/jobs/pending_retry.ts';
import {
	checkpointJob,
	type DiffusionJobRow,
	deleteJobsForTests,
	enqueueDiffusionJob,
	finishJob,
	getJobById,
	heartbeatJob,
	listActiveJobs,
	requestCancel,
	sweepStaleJobs,
	updateJobProgress,
} from '../../src/diffusion/jobs/queue.ts';
import { pauseScheduler, resumeScheduler } from '../../src/diffusion/jobs/scheduler.ts';
import {
	DIFFUSION_JOB_LEDGER_TABLE,
	DIFFUSION_JOBS_TABLE,
} from '../../src/diffusion/jobs/schema.ts';
import { withFencedBatch } from '../../src/diffusion/jobs/target_fence.ts';
import { bumpOntologyRevision } from '../../src/diffusion/plan/cache.ts';
import { runJob } from '../../src/diffusion/runner.ts';
import { closeAllTargetPools, getTargetPool } from '../../src/diffusion/targets/mariadb/db.ts';
import { executeSqlDeleteTargets } from '../../src/diffusion/targets/mariadb/delete_record.ts';
import { unpublishGhosts } from '../../src/diffusion/targets/mariadb/public_tier_reconcile.ts';
import { markdownWriter } from '../../src/diffusion/writers/markdown.ts';
import {
	claimThisJob,
	enqueueClaimSeeded,
	requeueAndClaim,
	sweepAndClaim,
	waitForJob,
} from '../helpers/diffusion_job_harness.ts';
import { ensureDiffusionScratchTables } from '../helpers/diffusion_scratch_tables.ts';
import { scratchMediaRoot } from '../helpers/media_scratch_root.ts';
import { startPowerLossModel } from '../helpers/power_loss_model.ts';
import { scratchRunEntries } from '../helpers/scratch_run_entries.ts';
import { databasesOf, requireSuiteMariadb } from '../helpers/suite_mariadb.ts';
import {
	dropZzdifDomain,
	ensureZzdifDomain,
	ZZDIF_DOMAIN_NAME,
	ZZDIF_ELEMENT,
	ZZDIF_EXTRA_PUBLISHABLE_IDS,
	ZZDIF_FILE_ELEMENT,
	ZZDIF_FILE_FORMAT,
	ZZDIF_FILE_SERVICE_NAME,
	ZZDIF_PUBLISHABLE_ID,
	ZZDIF_SECTION,
	ZZDIF_SITUATION,
} from '../helpers/zzdif_diffusion_domain.ts';

/** The fence's two-int advisory key space: (class, hashtext(target key)). */
const DIFFUSION_TARGET_LOCK_CLASS = 17580002;
const SQL_DATABASE = 'zzdif_publication_db';
const SQL_PRIMARY_TABLE = 'zzdif_primary';
/** A dedalo_ts_* name: the media-index marker store no-ops on it (no marker writes). */
const PROBE_TABLE = 'dedalo_ts_zzdif_fence_probe';
const SQL_TARGET_KEY = `sql:${SQL_DATABASE}`;
const FILE_TARGET_KEY = `files:${ZZDIF_FILE_FORMAT}/${ZZDIF_FILE_SERVICE_NAME}`;
/** The job's totals.msg while its runner waits for a held target. */
const BUSY_PREFIX = 'Waiting for the publication target';

const OWNER = -1;
const PUBLISHABLE_IDS = [ZZDIF_PUBLISHABLE_ID, ...ZZDIF_EXTRA_PUBLISHABLE_IDS].sort();

let filesRoot: string;
const savedEnv: Record<string, string | undefined> = {};
const createdJobIds: string[] = [];
const runnersInFlight: Promise<unknown>[] = [];

function setEnv(key: string, value: string): void {
	if (!(key in savedEnv)) savedEnv[key] = process.env[key];
	process.env[key] = value;
}
function restoreEnv(): void {
	for (const [key, value] of Object.entries(savedEnv)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
}

function outputDir(): string {
	return join(filesRoot, ZZDIF_FILE_FORMAT, ZZDIF_FILE_SERVICE_NAME);
}
function resetOutput(): void {
	rmSync(outputDir(), { recursive: true, force: true });
	mkdirSync(outputDir(), { recursive: true });
}
/** section_ids with a published `.md` in the file element's directory. */
function publishedIds(): number[] {
	if (!existsSync(outputDir())) return [];
	const pattern = new RegExp(`^${ZZDIF_SECTION}_(\\d+)\\.md$`);
	return scratchRunEntries(outputDir())
		.map((name) => pattern.exec(name)?.[1])
		.filter((id): id is string => id !== undefined)
		.map(Number)
		.sort();
}

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
async function clearActivity(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM "${activityTable()}" WHERE section_tipo = 'dd1758'
		   AND relation->'dd1763'->0->>'section_tipo' = $1`,
		[ZZDIF_SECTION],
	);
}

/**
 * Run-ledger rows of a job. The table is the ENGINE's (its one name export) and
 * must exist (ensureDiffusionScratchTables built it): a missing table throws —
 * a "0 rows" read from nowhere would make every "wrote no ledger row" vacuous.
 */
async function ledgerRows(jobId: string): Promise<number> {
	const [present] = (await sql.unsafe('SELECT to_regclass($1) IS NOT NULL AS present', [
		`"${DIFFUSION_JOB_LEDGER_TABLE}"`,
	])) as { present: boolean }[];
	if (present?.present !== true) {
		throw new Error(
			`the run-ledger table ${DIFFUSION_JOB_LEDGER_TABLE} does not exist — a ledger count here would measure nothing`,
		);
	}
	const [count] = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${DIFFUSION_JOB_LEDGER_TABLE}" WHERE job_id = $1`,
		[jobId],
	)) as { n: number }[];
	if (count === undefined) throw new Error('ledger count returned no row');
	return count.n;
}

async function sqlTableIds(table: string): Promise<number[]> {
	try {
		const rows = (await getTargetPool(SQL_DATABASE).unsafe(
			`SELECT DISTINCT section_id FROM \`${table}\` ORDER BY section_id`,
			[],
		)) as { section_id: number | string }[];
		return rows.map((row) => Number(row.section_id)).sort();
	} catch (error) {
		if ((error as { errno?: number }).errno === 1146) return [];
		throw error;
	}
}

/**
 * Hold the fence's advisory lock for `key` from ANOTHER session — what a second
 * writer of the same target does. `acquire` resolves once it is granted.
 */
async function holdTargetLock(
	key: string,
	options: { shared?: boolean } = {},
): Promise<{
	acquired: Promise<void>;
	release: () => Promise<void>;
}> {
	const suffix = options.shared === true ? '_shared' : '';
	const connection = await sql.reserve();
	const acquired = connection
		.unsafe(`SELECT pg_advisory_lock${suffix}($1::int, hashtext($2))`, [
			DIFFUSION_TARGET_LOCK_CLASS,
			key,
		])
		.then(() => undefined);
	let released = false;
	return {
		acquired,
		release: async () => {
			if (released) return;
			released = true;
			try {
				await acquired;
				await connection.unsafe(`SELECT pg_advisory_unlock${suffix}($1::int, hashtext($2))`, [
					DIFFUSION_TARGET_LOCK_CLASS,
					key,
				]);
			} finally {
				connection.release();
			}
		},
	};
}

/**
 * holdTargetLock, returning only once the request is QUEUED behind the current
 * holder (a not-granted row in pg_locks) — so it is granted the instant that
 * holder's unit commits, before the holder's NEXT unit can try again.
 */
async function queueTargetHold(key: string): Promise<Awaited<ReturnType<typeof holdTargetLock>>> {
	const hold = await holdTargetLock(key);
	const deadline = Date.now() + 10_000;
	for (;;) {
		const [row] = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM pg_locks
			 WHERE locktype = 'advisory' AND NOT granted
			   AND classid = $1::int::oid AND objid = hashtext($2)::oid AND objsubid = 2`,
			[DIFFUSION_TARGET_LOCK_CLASS, key],
		)) as { n: number }[];
		if ((row?.n ?? 0) > 0) return hold;
		if (Date.now() > deadline) {
			await hold.release();
			throw new Error(`the hold on ${key} never queued behind the running unit`);
		}
		await Bun.sleep(20);
	}
}

function seedJob(elementTipo: string, type: string): Promise<DiffusionJobRow> {
	return enqueueClaimSeeded(
		{ elementTipo, sectionTipo: ZZDIF_SECTION, type, ownerUserId: OWNER },
		createdJobIds,
	);
}

/** Wait until the runner shows the busy message, or it left `running` (never waited). */
async function waitUntilBusy(jobId: string): Promise<DiffusionJobRow | null> {
	return waitForJob(
		jobId,
		(row) => row.state !== 'running' || String(row.totals.msg ?? '').startsWith(BUSY_PREFIX),
		15_000,
	);
}

function expectWaited(row: DiffusionJobRow | null): void {
	expect(
		row?.state,
		`the runner ended '${row?.state}' while ANOTHER session held its publication target — it never waited for the target (no per-target exclusion)`,
	).toBe('running');
	expect(String(row?.totals.msg)).toStartWith(BUSY_PREFIX);
}

async function teardown(): Promise<void> {
	const failures: unknown[] = [];
	const step = async (work: () => unknown | Promise<unknown>): Promise<void> => {
		try {
			await work();
		} catch (error) {
			failures.push(error);
		}
	};
	await step(() => Promise.allSettled(runnersInFlight));
	await step(() => resetNativeDiffusionSqlDeleteForTests());
	await step(() => deleteJobsForTests(createdJobIds));
	await step(async () => {
		const pool = getTargetPool(SQL_DATABASE);
		for (const table of [SQL_PRIMARY_TABLE, PROBE_TABLE, 'zzdif_linked'])
			await pool.unsafe(`DROP TABLE IF EXISTS \`${table}\``, []);
	});
	await step(() => closeAllTargetPools());
	await step(() => clearActivity());
	await step(() => restoreEnv());
	await step(() => bumpOntologyRevision());
	await step(() => resumeScheduler());
	await step(() => {
		if (filesRoot !== undefined) rmSync(filesRoot, { recursive: true, force: true });
	});
	await step(async () => {
		const residue = await dropZzdifDomain();
		if (residue !== 0) throw new Error(`zzdif situation residue after drop: ${residue} rows`);
	});
	if (failures.length === 1) throw failures[0];
	if (failures.length > 1) {
		throw new AggregateError(failures, 'diffusion_target_fence_native teardown failed');
	}
}

beforeAll(async () => {
	await requireSuiteMariadb(import.meta.path, databasesOf(ZZDIF_SITUATION));
	await ensureDiffusionScratchTables();
	pauseScheduler();
	await ensureZzdifDomain();
	filesRoot = scratchMediaRoot('dedalo_diffusion_target_fence_');
	setEnv('DEDALO_DIFFUSION_FILES_ROOT', filesRoot);
	setEnv('DEDALO_DIFFUSION_DOMAIN', ZZDIF_DOMAIN_NAME);
	bumpOntologyRevision();
	const stale = (await listActiveJobs()).filter((row) => row.state === 'queued');
	await deleteJobsForTests(stale.map((row) => row.job_id));
	await clearActivity();
}, 120_000);

afterAll(teardown);

describe('DIFF-2 A — a runner revoked while it waited for a held target writes NOTHING', () => {
	test("markdown file target: no file, no dd1758 row, no ledger row; epoch 2 publishes and its fenced close sweeps a dead holder's temp", async () => {
		resetOutput();
		await clearActivity();
		// What a holder killed mid-write (a crashed createZip / atomicWriteFile) leaves.
		const staleTemp = join(outputDir(), 'diffusion_md.zip.tmp-crashed');
		writeFileSync(staleTemp, 'a partial archive of a dead holder');
		const lock = await holdTargetLock(FILE_TARGET_KEY);
		await lock.acquired;
		const job = await seedJob(ZZDIF_FILE_ELEMENT, ZZDIF_FILE_FORMAT);
		const runner1 = runJob(job.job_id, job.attempt);
		runnersInFlight.push(runner1);
		let epoch2: DiffusionJobRow | null = null;
		try {
			expectWaited(await waitUntilBusy(job.job_id));
			epoch2 = await sweepAndClaim(job.job_id);
			expect(epoch2?.attempt).toBe(job.attempt + 1);
		} finally {
			await lock.release();
		}
		await runner1;

		expect(publishedIds(), 'the REVOKED runner published files').toEqual([]);
		expect(await publishedActivityIds(), 'the REVOKED runner logged dd1758 rows').toEqual([]);
		expect(await ledgerRows(job.job_id)).toBe(0);
		const row = await getJobById(job.job_id);
		expect(row?.state).toBe('running');
		expect(row?.attempt).toBe(job.attempt + 1);

		// POSITIVE CONTROL — the live epoch publishes everything.
		await runJob(job.job_id, (epoch2 as DiffusionJobRow).attempt);
		expect((await getJobById(job.job_id))?.state).toBe('completed');
		const published = publishedIds();
		// The listing's own floor: an emptied listing can never pass the legs above.
		expect(published.length).toBeGreaterThan(0);
		expect(published).toEqual(PUBLISHABLE_IDS);
		// The close ran under the fence: no other session could own a temp there.
		expect(existsSync(staleTemp), "a dead holder's temp outlived a fenced close").toBe(false);
	}, 120_000);

	test('sql target (suite MariaDB): no row, no dd1758 row; epoch 2 publishes', async () => {
		await getTargetPool(SQL_DATABASE).unsafe(`DROP TABLE IF EXISTS \`${SQL_PRIMARY_TABLE}\``, []);
		await clearActivity();
		const lock = await holdTargetLock(SQL_TARGET_KEY);
		await lock.acquired;
		const job = await seedJob(ZZDIF_ELEMENT, 'sql');
		const runner1 = runJob(job.job_id, job.attempt);
		runnersInFlight.push(runner1);
		let epoch2: DiffusionJobRow | null = null;
		try {
			expectWaited(await waitUntilBusy(job.job_id));
			epoch2 = await sweepAndClaim(job.job_id);
			expect(epoch2?.attempt).toBe(job.attempt + 1);
		} finally {
			await lock.release();
		}
		await runner1;

		expect(await sqlTableIds(SQL_PRIMARY_TABLE), 'the REVOKED runner wrote rows').toEqual([]);
		expect(await publishedActivityIds()).toEqual([]);
		expect(await ledgerRows(job.job_id)).toBe(0);

		await runJob(job.job_id, (epoch2 as DiffusionJobRow).attempt);
		expect((await getJobById(job.job_id))?.state).toBe('completed');
		expect(await sqlTableIds(SQL_PRIMARY_TABLE)).toEqual(PUBLISHABLE_IDS);
	}, 120_000);
});

describe('DIFF-2 A2 — a runner WAITING for a held target honours a cancel', () => {
	test('cancelled while the target is still held: it ends cancelled, published nothing, never waited for the release', async () => {
		resetOutput();
		await clearActivity();
		const lock = await holdTargetLock(FILE_TARGET_KEY);
		await lock.acquired;
		const job = await seedJob(ZZDIF_FILE_ELEMENT, ZZDIF_FILE_FORMAT);
		const runner = runJob(job.job_id, job.attempt);
		runnersInFlight.push(runner);
		let ended: 'ended' | 'still waiting' = 'still waiting';
		try {
			expectWaited(await waitUntilBusy(job.job_id));
			await requestCancel(job.client_process_id, OWNER);
			// The lock is STILL held: only the wait loop's cancel check can end the run.
			ended = await Promise.race([
				runner.then(() => 'ended' as const),
				Bun.sleep(15_000).then(() => 'still waiting' as const),
			]);
		} finally {
			await lock.release();
		}
		await runner;
		expect(ended, 'a cancelled runner kept waiting for a held target').toBe('ended');
		expect((await getJobById(job.job_id))?.state).toBe('cancelled');
		expect(publishedIds()).toEqual([]);
		expect(await publishedActivityIds()).toEqual([]);
	}, 120_000);
});

/**
 * The CLOSE is the run's longest target write (streamed merge, createZip, the
 * rename over the consolidated archive) and its FENCED flag lets it sweep every
 * `.tmp-*` in the directory — so it is a fenced unit like the batches, not an
 * exception to them. The hold is queued INSIDE the run's last batch unit (the
 * unit count is measured on an identical clean run first), so it is granted the
 * moment that batch commits and the runner meets it at close().
 */
describe('DIFF-2 A3 — the CLOSE unit is fenced: held, it waits; revoked, it renames nothing', () => {
	test('markdown: batches committed, close waits busy with the zip and a live temp untouched; the revoked epoch renames no zip; epoch 2 closes', async () => {
		const writer = markdownWriter as { open: typeof markdownWriter.open };
		const originalOpen = writer.open;
		/** Batch units seen by the current run (session.checkpoint is called once per batch unit). */
		let units = 0;
		let armAt = Number.POSITIVE_INFINITY;
		let lock: Awaited<ReturnType<typeof holdTargetLock>> | null = null;
		writer.open = async (...args: Parameters<typeof markdownWriter.open>) => {
			const session = await originalOpen.apply(markdownWriter, args);
			const checkpoint = session.checkpoint.bind(session);
			session.checkpoint = async () => {
				const value = await checkpoint();
				units += 1;
				if (units === armAt) {
					// Detached: this runs inside the runner's own fenced transaction.
					lock = await runDetachedFromTransaction(() => queueTargetHold(FILE_TARGET_KEY));
				}
				return value;
			};
			return session;
		};
		const zipPath = join(outputDir(), 'diffusion_md.zip');
		const PREVIOUS_ZIP = 'the archive of an earlier, completed run';
		let job: DiffusionJobRow | null = null;
		let runner1: Promise<void> | null = null;
		let epoch2: DiffusionJobRow | null = null;
		let liveTemp = '';
		try {
			// The run's batch-unit count, on the same (clean) state.
			resetOutput();
			await clearActivity();
			const counting = await seedJob(ZZDIF_FILE_ELEMENT, ZZDIF_FILE_FORMAT);
			await runJob(counting.job_id, counting.attempt);
			expect((await getJobById(counting.job_id))?.state).toBe('completed');
			const batchUnits = units;
			expect(batchUnits, 'the counting run committed no batch unit').toBeGreaterThan(0);

			resetOutput();
			await clearActivity();
			writeFileSync(zipPath, PREVIOUS_ZIP);
			// A temp the lock holder is still writing — only a fence holder may sweep it.
			liveTemp = join(outputDir(), 'diffusion_md.zip.tmp-liveholder');
			writeFileSync(liveTemp, 'the in-flight archive of the session that holds the target');
			expect(isTempSibling(liveTemp), 'the planted temp is not a name the sweep recognizes').toBe(
				true,
			);
			units = 0;
			armAt = batchUnits;
			job = await seedJob(ZZDIF_FILE_ELEMENT, ZZDIF_FILE_FORMAT);
			runner1 = runJob(job.job_id, job.attempt);
			runnersInFlight.push(runner1);
			expectWaited(await waitUntilBusy(job.job_id));
			expect(lock, 'the hold was never queued inside the last batch unit').not.toBeNull();
			// Every batch committed; ONLY the close is waiting.
			expect(publishedIds()).toEqual(PUBLISHABLE_IDS);
			expect(await publishedActivityIds()).toEqual(PUBLISHABLE_IDS);
			expect(
				readFileSync(zipPath, 'utf8'),
				'the close rewrote the archive while another session held the target',
			).toBe(PREVIOUS_ZIP);
			expect(existsSync(liveTemp), "the close swept a LIVE holder's temp").toBe(true);
			epoch2 = await sweepAndClaim(job.job_id);
			expect(epoch2?.attempt).toBe(job.attempt + 1);
		} finally {
			writer.open = originalOpen;
			await (lock as Awaited<ReturnType<typeof holdTargetLock>> | null)?.release();
		}
		await runner1;
		expect(readFileSync(zipPath, 'utf8'), 'the REVOKED epoch renamed a zip').toBe(PREVIOUS_ZIP);
		expect(existsSync(liveTemp), 'the REVOKED epoch swept temps').toBe(true);
		const row = await getJobById((job as DiffusionJobRow).job_id);
		expect(row?.state).toBe('running');
		expect(row?.attempt).toBe((epoch2 as DiffusionJobRow).attempt);

		// POSITIVE CONTROL — the live epoch resumes with NO batch left, and closes.
		units = 0;
		armAt = Number.POSITIVE_INFINITY;
		writer.open = async (...args: Parameters<typeof markdownWriter.open>) => {
			const session = await originalOpen.apply(markdownWriter, args);
			const checkpoint = session.checkpoint.bind(session);
			session.checkpoint = async () => {
				units += 1;
				return checkpoint();
			};
			return session;
		};
		try {
			await runJob((job as DiffusionJobRow).job_id, (epoch2 as DiffusionJobRow).attempt);
		} finally {
			writer.open = originalOpen;
		}
		expect(units, 'the held unit was a batch, not the close').toBe(0);
		expect((await getJobById((job as DiffusionJobRow).job_id))?.state).toBe('completed');
		expect(readFileSync(zipPath, 'utf8')).not.toBe(PREVIOUS_ZIP);
		// Now nothing holds the target: the fenced close owns the directory's temps.
		expect(existsSync(liveTemp)).toBe(false);
	}, 120_000);
});

/**
 * DIFF-2 put progress/checkpoint/finish INSIDE the fenced unit. A liveness
 * stamp written with now() (the transaction START) would, at commit, set the
 * heartbeat back to when a long unit began; the KEY SHARE is gone at commit,
 * and the sweeper would revoke a healthy runner. Built at the queue level
 * (no interval heartbeat to mask it), on the real fence unit.
 */
describe('DIFF-2 H — liveness stamps are the wall clock: a committed long unit leaves the row LIVE', () => {
	test('progress, checkpoint and finish written at the end of a unit held past the stale bound', async () => {
		const STALE_S = 2;
		const HOLD_MS = (STALE_S + 1) * 1_000;
		const { job } = await enqueueDiffusionJob({
			ownerUserId: OWNER,
			clientProcessId: `process_diffusion_${OWNER}_zzdiflive_zzdiflivesec`,
			spec: {
				diffusion_element_tipo: 'zzdiflive',
				section_tipo: 'zzdiflivesec',
				type: 'sql',
				sqo: { section_tipo: 'zzdiflivesec' },
				estimated_total: 0,
				options: {},
			},
		});
		createdJobIds.push(job.job_id);
		const claimed = await claimThisJob(job.job_id);
		const lease = { job_id: claimed.job_id, attempt: claimed.attempt };
		const key = 'files:zzdif_probe/liveness';

		const longUnit = async (write: () => Promise<void>): Promise<void> => {
			const unit = await withFencedBatch(lease, key, async () => {
				await Bun.sleep(HOLD_MS);
				await write();
			});
			expect(unit.acquired).toBe(true);
		};
		const expectLive = async (what: string): Promise<void> => {
			const swept = await sweepStaleJobs(STALE_S);
			expect(
				swept.requeued,
				`${what} inside a ${HOLD_MS} ms unit left a heartbeat older than ${STALE_S} s at commit — the sweeper revoked a live runner`,
			).not.toContain(job.job_id);
			const row = await getJobById(job.job_id);
			expect(row?.state).toBe('running');
			expect(row?.attempt).toBe(lease.attempt);
		};

		await longUnit(() => updateJobProgress(lease, { counter: 1, msg: 'probe' }));
		await expectLive('updateJobProgress');
		await longUnit(() => checkpointJob(lease, { v: 2, batch_seq: 1 }));
		await expectLive('checkpointJob');

		let before: Date | null = null;
		await longUnit(async () => {
			const [clock] = (await runDetachedFromTransaction(() =>
				sql.unsafe('SELECT clock_timestamp() AS at'),
			)) as { at: Date }[];
			before = new Date(clock?.at as Date);
			await finishJob(lease, 'completed', { ok: true, msg: 'probe' });
		});
		const finished = await getJobById(job.job_id);
		expect(finished?.state).toBe('completed');
		expect(
			new Date(finished?.finished_at as unknown as string).getTime(),
			'finished_at is the unit START, not the completion',
		).toBeGreaterThanOrEqual((before as unknown as Date).getTime());
	}, 60_000);
});

describe('DIFF-2 H2 — a liveness stamp NEVER moves the heartbeat backwards', () => {
	// The rule of queue.ts LIVENESS_NOW: a stamp that lands after a fresher one
	// keeps the fresher. Measured as an outcome: a heartbeat already ahead of
	// the wall clock survives every lease-holder stamp (a plain
	// clock_timestamp()/now() in any of the three statements pulls it back).
	test('heartbeatJob, updateJobProgress and checkpointJob keep a fresher heartbeat_at', async () => {
		const { job } = await enqueueDiffusionJob({
			ownerUserId: OWNER,
			clientProcessId: `process_diffusion_${OWNER}_zzdifmono_zzdifmonosec`,
			spec: {
				diffusion_element_tipo: 'zzdifmono',
				section_tipo: 'zzdifmonosec',
				type: 'sql',
				sqo: { section_tipo: 'zzdifmonosec' },
				estimated_total: 0,
				options: {},
			},
		});
		createdJobIds.push(job.job_id);
		const claimed = await claimThisJob(job.job_id);
		const lease = { job_id: claimed.job_id, attempt: claimed.attempt };
		await sql.unsafe(
			`UPDATE "${DIFFUSION_JOBS_TABLE}" SET heartbeat_at = clock_timestamp() + interval '1 hour' WHERE job_id = $1`,
			[job.job_id],
		);
		const stillAhead = async (what: string): Promise<void> => {
			const [row] = (await sql.unsafe(
				`SELECT heartbeat_at > now() + interval '50 minutes' AS ahead FROM "${DIFFUSION_JOBS_TABLE}" WHERE job_id = $1`,
				[job.job_id],
			)) as { ahead: boolean }[];
			expect(row?.ahead, `${what} moved heartbeat_at BACKWARDS`).toBe(true);
		};
		await heartbeatJob(lease);
		await stillAhead('heartbeatJob');
		await updateJobProgress(lease, { counter: 1, msg: 'probe' });
		await stillAhead('updateJobProgress');
		await checkpointJob(lease, { v: 2, batch_seq: 1 });
		await stillAhead('checkpointJob');
		await finishJob(lease, 'completed', { ok: true, msg: 'probe' });
	});
});

describe('DIFF-2 G — a runner needs two connections (its fenced batch + the heartbeat beside it)', () => {
	/** The REAL runJob on `job`, in a process whose pool holds `max` connections. */
	async function runInPool(max: number, job: DiffusionJobRow): Promise<string> {
		const child = Bun.spawn(
			[
				process.execPath,
				'run',
				'test/helpers/diffusion_runner_pool_child.ts',
				job.job_id,
				String(job.attempt),
			],
			{
				cwd: join(import.meta.dir, '..', '..'),
				env: { ...process.env, DB_POOL_MAX: String(max) },
				stdout: 'pipe',
				stderr: 'pipe',
			},
		);
		// A runner deadlocked on its own pool never returns: bounded, and killed.
		const deadline = setTimeout(() => child.kill('SIGKILL'), 45_000);
		const [out, err] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		await child.exited;
		clearTimeout(deadline);
		if (child.signalCode === 'SIGKILL') {
			throw new Error(
				`a runner in a pool of ${max} HUNG (killed after 45 s) — its heartbeat or statements queued behind its own batch: ${err.slice(-800)}`,
			);
		}
		if (!out.includes('RUN_RETURNED')) {
			throw new Error(`pool child did not return (exit ${child.exitCode}): ${err.slice(-800)}`);
		}
		return err;
	}

	test('a pool of ONE: the run fails loudly (internal.invariant naming DB_POOL_MAX) and nothing reaches the target; a pool of two publishes', async () => {
		resetOutput();
		await clearActivity();
		const job = await seedJob(ZZDIF_FILE_ELEMENT, ZZDIF_FILE_FORMAT);
		const stderr = await runInPool(1, job);
		const refused = await getJobById(job.job_id);
		expect(
			refused?.state,
			'a runner ran in a pool of one (its heartbeat would queue behind its own batch)',
		).toBe('failed');
		expect((refused?.result as { error?: { code?: string } } | null)?.error?.code).toBe(
			'internal.invariant',
		);
		expect(stderr).toContain('DB_POOL_MAX');
		expect(publishedIds()).toEqual([]);
		expect(await publishedActivityIds()).toEqual([]);

		// POSITIVE CONTROL — the same job, a pool of two.
		await runInPool(2, await requeueAndClaim(job.job_id));
		expect((await getJobById(job.job_id))?.state).toBe('completed');
		expect(publishedIds()).toEqual(PUBLISHABLE_IDS);
	}, 120_000);
});

describe('DIFF-2 B — a runner INSIDE its batch cannot be revoked', () => {
	test('MariaDB table locked under the runner: the sweeper requeues nothing, cancel does not block, the run ends on its own epoch', async () => {
		// The table must exist to be locked: one clean run first.
		const setup = await seedJob(ZZDIF_ELEMENT, 'sql');
		await runJob(setup.job_id, setup.attempt);
		expect((await getJobById(setup.job_id))?.state).toBe('completed');

		// Another connection holds every row of the table in an open transaction (the
		// suite user has no LOCK TABLES grant): the runner's writes queue behind it.
		const pool = getTargetPool(SQL_DATABASE);
		const blocker = await pool.reserve();
		let job: DiffusionJobRow | null = null;
		let runner: Promise<void> | null = null;
		try {
			await blocker.unsafe('START TRANSACTION', []);
			await blocker.unsafe(`SELECT section_id FROM \`${SQL_PRIMARY_TABLE}\` FOR UPDATE`, []);
			job = await seedJob(ZZDIF_ELEMENT, 'sql');
			runner = runJob(job.job_id, job.attempt);
			runnersInFlight.push(runner);
			// Blocked = one of the runner's statements has been waiting for >= 1 s.
			const deadline = Date.now() + 15_000;
			let blocked = false;
			while (!blocked && Date.now() < deadline) {
				const [waiting] = (await blocker.unsafe(
					`SELECT count(*) AS n FROM information_schema.PROCESSLIST
					 WHERE DB = ? AND ID <> CONNECTION_ID() AND COMMAND IN ('Query', 'Execute') AND TIME >= 1`,
					[SQL_DATABASE],
				)) as { n: number | string }[];
				blocked = Number(waiting?.n ?? 0) > 0;
				if (!blocked) await Bun.sleep(50);
			}
			expect(blocked, 'the runner never blocked on the held target rows').toBe(true);

			const swept = await sweepStaleJobs(0);
			expect(
				swept.requeued,
				'the sweeper REVOKED a runner in the middle of its batch — the blocked write lands after the revocation, under a lease that is no longer its own',
			).not.toContain(job.job_id);
			const cancel = await Promise.race([
				requestCancel(job.client_process_id, OWNER).then(() => 'resolved' as const),
				Bun.sleep(5_000).then(() => 'blocked' as const),
			]);
			expect(cancel, 'a cancel request blocked behind the running batch').toBe('resolved');
		} finally {
			await blocker.unsafe('ROLLBACK', []).catch(() => {});
			blocker.release();
		}
		await runner;
		const row = await getJobById((job as DiffusionJobRow).job_id);
		expect(row?.attempt).toBe((job as DiffusionJobRow).attempt);
		expect(['completed', 'cancelled']).toContain(row?.state as string);
	}, 120_000);
});

describe('DIFF-2 C — the sweeper skips a row the fence holds (SQL level)', () => {
	test('FOR KEY SHARE held on a stale running row: skipped; released: swept', async () => {
		const { job } = await enqueueDiffusionJob({
			ownerUserId: OWNER,
			clientProcessId: `process_diffusion_${OWNER}_zzdiffence_zzdiffsec`,
			spec: {
				diffusion_element_tipo: 'zzdiffence',
				section_tipo: 'zzdiffsec',
				type: 'sql',
				sqo: { section_tipo: 'zzdiffsec' },
				estimated_total: 0,
				options: {},
			},
		});
		createdJobIds.push(job.job_id);
		await claimThisJob(job.job_id);
		const holder = await sql.reserve();
		let result: { requeued: string[] } | 'blocked';
		try {
			await holder.unsafe('BEGIN');
			await holder.unsafe(
				`SELECT job_id FROM "${DIFFUSION_JOBS_TABLE}" WHERE job_id = $1 FOR KEY SHARE`,
				[job.job_id],
			);
			result = await Promise.race([
				sweepStaleJobs(0),
				Bun.sleep(8_000).then(() => 'blocked' as const),
			]);
		} finally {
			await holder.unsafe('COMMIT');
			holder.release();
		}
		expect(result, 'the sweep blocked behind the fence instead of skipping it').not.toBe('blocked');
		expect(
			(result as { requeued: string[] }).requeued,
			'the sweeper requeued a row a fenced batch holds',
		).not.toContain(job.job_id);
		const after = await sweepStaleJobs(0);
		const row = await getJobById(job.job_id);
		expect(after.requeued.includes(job.job_id) || row?.state === 'queued').toBe(true);
	}, 60_000);
});

describe('DIFF-2 D — the other target doors take the same fence', () => {
	async function seedProbeRow(sectionId: number): Promise<void> {
		const pool = getTargetPool(SQL_DATABASE);
		await pool.unsafe(
			`CREATE TABLE IF NOT EXISTS \`${PROBE_TABLE}\` (section_id VARCHAR(32), lang VARCHAR(16))`,
			[],
		);
		await pool.unsafe(`DELETE FROM \`${PROBE_TABLE}\``, []);
		await pool.unsafe(`INSERT INTO \`${PROBE_TABLE}\` (section_id, lang) VALUES (?, 'lg-spa')`, [
			String(sectionId),
		]);
	}

	test('the record-delete executor on the REQUEST path does not wait: the target in errors at once, the row still there', async () => {
		await seedProbeRow(940001);
		const lock = await holdTargetLock(SQL_TARGET_KEY);
		await lock.acquired;
		let result: Awaited<ReturnType<typeof executeSqlDeleteTargets>>;
		const startedAt = Date.now();
		let elapsed: number;
		try {
			result = await executeSqlDeleteTargets([
				{ database_name: SQL_DATABASE, table_name: PROBE_TABLE, section_ids: [940001] },
			]);
			elapsed = Date.now() - startedAt;
		} finally {
			await lock.release();
		}
		expect(result.deleted, 'the delete door wrote into a target another session holds').toEqual([]);
		expect(result.errors.length).toBe(1);
		// A bulk delete during a long sweep costs no wait per row (the row stays pending).
		expect(elapsed, 'the request-path delete waited for a held target').toBeLessThan(2_000);
		expect(await sqlTableIds(PROBE_TABLE)).toEqual([940001]);
	}, 60_000);

	test('inside a retry drain (the patient scope) the executor WAITS for the holder, then deletes', async () => {
		await seedProbeRow(940001);
		const lock = await holdTargetLock(SQL_TARGET_KEY);
		await lock.acquired;
		const release = Bun.sleep(1_500).then(() => lock.release());
		let result: Awaited<ReturnType<typeof executeSqlDeleteTargets>>;
		try {
			result = await withPatientDeleteWait(() =>
				executeSqlDeleteTargets([
					{ database_name: SQL_DATABASE, table_name: PROBE_TABLE, section_ids: [940001] },
				]),
			);
		} finally {
			await release;
		}
		expect(result.errors).toEqual([]);
		expect(result.deleted).toEqual([`${SQL_DATABASE}|${PROBE_TABLE}`]);
		expect(await sqlTableIds(PROBE_TABLE)).toEqual([]);
	}, 60_000);

	test('the ghost unpublish applies only after the holder releases', async () => {
		await seedProbeRow(940002);
		const lock = await holdTargetLock(SQL_TARGET_KEY);
		await lock.acquired;
		let pending: Promise<unknown> | null = null;
		let whileHeld: number[] = [];
		try {
			pending = unpublishGhosts([
				{
					store: 'mariadb',
					target: `${SQL_DATABASE}|${PROBE_TABLE}`,
					section_tipo: ZZDIF_SECTION,
					section_id: 940002,
					reason: 'record_absent',
				},
			]);
			runnersInFlight.push(pending);
			await Bun.sleep(1_500);
			whileHeld = await sqlTableIds(PROBE_TABLE);
		} finally {
			await lock.release();
		}
		await pending;
		expect(whileHeld, 'the ghost unpublish deleted while another session held the target').toEqual([
			940002,
		]);
		expect(await sqlTableIds(PROBE_TABLE)).toEqual([]);
	}, 60_000);

	// The mariadb leg above is ALSO carried by the delete executor's own
	// (re-entrant, bounded) fence; a FILE ghost has no inner door — only the
	// ghost unpublish's own per-target fence keeps it off a held directory.
	test('a FILE ghost is unlinked only after the holder of its directory releases', async () => {
		mkdirSync(outputDir(), { recursive: true });
		const ghostPath = join(outputDir(), `${ZZDIF_SECTION}_940003.md`);
		writeFileSync(ghostPath, '# ghost\n');
		const lock = await holdTargetLock(FILE_TARGET_KEY);
		await lock.acquired;
		let pending: Promise<unknown> | null = null;
		let presentWhileHeld = false;
		try {
			pending = unpublishGhosts([
				{
					store: 'file',
					target: `${ZZDIF_FILE_FORMAT}:${ZZDIF_FILE_SERVICE_NAME}`,
					section_tipo: ZZDIF_SECTION,
					section_id: 940003,
					path: ghostPath,
					reason: 'record_absent',
				},
			]);
			runnersInFlight.push(pending);
			await Bun.sleep(1_500);
			presentWhileHeld = existsSync(ghostPath);
		} finally {
			await lock.release();
		}
		await pending;
		expect(
			presentWhileHeld,
			'the ghost unpublish unlinked a file while another session held its directory',
		).toBe(true);
		expect(existsSync(ghostPath)).toBe(false);
	}, 60_000);
});

/**
 * The DELETE-ONLY doors take the fence SHARED: an unpublisher already inside a
 * database (modelled as a held SHARED lock — what the record-delete executor's
 * and the ghost unpublish's units hold) never leaves another delete pending,
 * while it still excludes every EXCLUSIVE writer (a runner's unit, the lang
 * sweep) — and an exclusive holder still leaves a request-path delete pending
 * (D, first leg).
 */
describe('DIFF-2 D3 — unpublishers never exclude each other, only exclusive writers', () => {
	async function seedProbeRows(sectionIds: number[]): Promise<void> {
		const pool = getTargetPool(SQL_DATABASE);
		await pool.unsafe(
			`CREATE TABLE IF NOT EXISTS \`${PROBE_TABLE}\` (section_id VARCHAR(32), lang VARCHAR(16))`,
			[],
		);
		await pool.unsafe(`DELETE FROM \`${PROBE_TABLE}\``, []);
		for (const id of sectionIds) {
			await pool.unsafe(`INSERT INTO \`${PROBE_TABLE}\` (section_id, lang) VALUES (?, 'lg-spa')`, [
				String(id),
			]);
		}
	}

	test('another unpublisher inside the database: a request-path delete and a ghost unpublish both settle at once', async () => {
		await seedProbeRows([940001, 940002]);
		const unpublisher = await holdTargetLock(SQL_TARGET_KEY, { shared: true });
		await unpublisher.acquired;
		let result: Awaited<ReturnType<typeof executeSqlDeleteTargets>>;
		let ghost: { removed: number; failed: string[] } | 'still waiting';
		try {
			result = await executeSqlDeleteTargets([
				{ database_name: SQL_DATABASE, table_name: PROBE_TABLE, section_ids: [940001] },
			]);
			const pending = unpublishGhosts([
				{
					store: 'mariadb',
					target: `${SQL_DATABASE}|${PROBE_TABLE}`,
					section_tipo: ZZDIF_SECTION,
					section_id: 940002,
					reason: 'record_absent',
				},
			]);
			runnersInFlight.push(pending);
			ghost = await Promise.race([pending, Bun.sleep(5_000).then(() => 'still waiting' as const)]);
		} finally {
			await unpublisher.release();
		}
		expect(
			result.errors,
			'a delete was left PENDING because another unpublisher held the database',
		).toEqual([]);
		expect(result.deleted).toEqual([`${SQL_DATABASE}|${PROBE_TABLE}`]);
		expect(ghost, 'the ghost unpublish waited for another unpublisher').not.toBe('still waiting');
		expect(await sqlTableIds(PROBE_TABLE)).toEqual([]);
	}, 60_000);

	test('an unpublisher inside the database still excludes an EXCLUSIVE writer', async () => {
		const unpublisher = await holdTargetLock(SQL_TARGET_KEY, { shared: true });
		await unpublisher.acquired;
		let outcome: Awaited<ReturnType<typeof withTargetLock>>;
		let ran = false;
		try {
			outcome = await withTargetLock(
				SQL_TARGET_KEY,
				async () => {
					ran = true;
				},
				{ mode: 'try' },
			);
		} finally {
			await unpublisher.release();
		}
		expect(ran, 'an exclusive writer entered a database an unpublisher holds').toBe(false);
		expect(outcome.acquired).toBe(false);
	}, 60_000);
});

/**
 * CORE'S FILES-UNLINK DOOR takes the same fence (WC R2, closed 2026-10-01): the
 * per-record file a deleted record leaves behind is unlinked by
 * `unlinkPublishedFiles` (core/diffusion_bridge/diffusion_delete.ts — the record
 * delete's settle and every retry drain), which until the lock moved into the
 * bridge could not take it. Unfenced, it unlinked inside a run's batch — after
 * the batch revalidated the record as present and before it wrote the file, so
 * a deleted record was published again — and inside a close, removing files
 * from under the archive. Now it is a DELETE-ONLY door: SHARED, given up at once
 * on the request path, waited for inside a patient drain.
 */
describe('DIFF-2 D4 — the core files-unlink door takes the files target fence', () => {
	function plantRecordFile(sectionId: number): string {
		mkdirSync(outputDir(), { recursive: true });
		const path = join(outputDir(), `${ZZDIF_SECTION}_${sectionId}.md`);
		writeFileSync(path, `# record ${sectionId}\n`);
		return path;
	}
	const unlinkRecord = (sectionId: number) =>
		unlinkPublishedFiles(ZZDIF_FILE_ELEMENT, ZZDIF_FILE_FORMAT, ZZDIF_SECTION, sectionId);

	test('on the REQUEST path an exclusive holder leaves the file in place and the unpublish pending, at once', async () => {
		const path = plantRecordFile(940004);
		const lock = await holdTargetLock(FILE_TARGET_KEY);
		await lock.acquired;
		let outcome: Awaited<ReturnType<typeof unlinkRecord>>;
		let elapsed: number;
		try {
			const startedAt = Date.now();
			outcome = await unlinkRecord(940004);
			elapsed = Date.now() - startedAt;
		} finally {
			await lock.release();
		}
		expect(
			existsSync(path),
			'the files-unlink door removed a file from a directory an exclusive writer holds',
		).toBe(true);
		expect(outcome.kind).toBe('pending');
		expect(elapsed, 'the request-path unlink waited for a held target').toBeLessThan(2_000);
		// Positive control: released, the same door unpublishes it — DURABLY: the
		// dd1758 row flips on this answer, so a power cut must not bring it back.
		const model = startPowerLossModel(filesRoot);
		let released: Awaited<ReturnType<typeof unlinkRecord>>;
		try {
			released = await unlinkRecord(940004);
		} finally {
			model.restore();
		}
		expect(released.kind).toBe('unpublished');
		expect(existsSync(path)).toBe(false);
		expect(
			model.absenceSurvives(path),
			'the unpublish answered while its unlink was not on disk (a power cut resurrects the record)',
		).toBe(true);
	}, 60_000);

	test('inside a retry drain (the patient scope) it WAITS for the holder, then unlinks', async () => {
		const path = plantRecordFile(940005);
		const lock = await holdTargetLock(FILE_TARGET_KEY);
		await lock.acquired;
		let presentWhileHeld = false;
		const release = Bun.sleep(1_500).then(() => {
			presentWhileHeld = existsSync(path);
			return lock.release();
		});
		let outcome: Awaited<ReturnType<typeof unlinkRecord>>;
		try {
			outcome = await withPatientDeleteWait(() => unlinkRecord(940005));
		} finally {
			await release;
		}
		expect(presentWhileHeld, 'the drain unlinked while another session held the directory').toBe(
			true,
		);
		expect(outcome.kind).toBe('unpublished');
		expect(existsSync(path)).toBe(false);
	}, 60_000);

	test('another unpublisher inside the directory does not hold it off (SHARED)', async () => {
		const path = plantRecordFile(940006);
		const unpublisher = await holdTargetLock(FILE_TARGET_KEY, { shared: true });
		await unpublisher.acquired;
		let outcome: Awaited<ReturnType<typeof unlinkRecord>>;
		try {
			outcome = await unlinkRecord(940006);
		} finally {
			await unpublisher.release();
		}
		expect(
			outcome.kind,
			'an unpublish was left PENDING because another unpublisher held the directory',
		).toBe('unpublished');
		expect(existsSync(path)).toBe(false);
	}, 60_000);
});

/**
 * The retry DRAINS are what wait — through their real call sites, not a leg
 * that opens the patient scope itself: the runner's opportunistic retry
 * (pending_retry.ts defaultPendingRetry) and the `retry_pending_deletions`
 * action. And the scope is ONE budget, not one per executor call.
 */
describe('DIFF-2 D2 — the retry drains wait for a held target through their REAL doors, on ONE budget', () => {
	/** dd1758 action of a row (by its id). */
	async function actionOf(rowId: number): Promise<number | null> {
		const rows = (await sql.unsafe(
			`SELECT relation->'dd1767'->0->>'diffusion_action' AS action
			 FROM "${activityTable()}" WHERE section_tipo = 'dd1758' AND section_id = $1`,
			[rowId],
		)) as { action: string | null }[];
		return rows[0]?.action === undefined || rows[0]?.action === null
			? null
			: Number(rows[0].action);
	}

	async function publishSqlElement(): Promise<void> {
		await getTargetPool(SQL_DATABASE).unsafe(`DROP TABLE IF EXISTS \`${SQL_PRIMARY_TABLE}\``, []);
		const job = await seedJob(ZZDIF_ELEMENT, 'sql');
		await runJob(job.job_id, job.attempt);
		expect((await getJobById(job.job_id))?.state).toBe('completed');
		expect(await sqlTableIds(SQL_PRIMARY_TABLE)).toEqual(PUBLISHABLE_IDS);
	}

	/**
	 * Owe the unpublish of `sectionId` (a pending dd1758 row on the sql element),
	 * hold the target, run `door`, release after 1.5 s: the door must have WAITED
	 * and then paid the debt — the MariaDB row gone, the ledger row settled.
	 */
	async function drainWaits(sectionId: number, door: () => Promise<unknown>): Promise<void> {
		await assertTestDatabase('diffusion_target_fence_native D2');
		const rowId = await logDiffusionActivity({
			sectionTipo: ZZDIF_SECTION,
			sectionId,
			elementTipo: ZZDIF_ELEMENT,
			action: DIFFUSION_ACTION.unpublishPending,
		});
		const lock = await holdTargetLock(SQL_TARGET_KEY);
		await lock.acquired;
		const release = Bun.sleep(1_500).then(() => lock.release());
		try {
			await door();
		} finally {
			await release;
		}
		expect(
			await sqlTableIds(SQL_PRIMARY_TABLE),
			'the drain gave up on the held target instead of waiting — the record is still public',
		).not.toContain(sectionId);
		expect(await actionOf(rowId)).toBe(DIFFUSION_ACTION.unpublished);
	}

	test("the runner's opportunistic retry, the retry_pending_deletions action and the maintenance widget's retry all wait, then delete", async () => {
		registerNativeDiffusionSqlDelete(executeSqlDeleteTargets);
		await clearActivity();
		await publishSqlElement();
		const [first, second, third] = ZZDIF_EXTRA_PUBLISHABLE_IDS;
		// The runner's door (single-flight included), as a run start calls it.
		await drainWaits(first as number, async () => {
			const report = await retryPendingUnpublishOpportunistically();
			expect(report.errors).toEqual([]);
		});
		// The admin action's door.
		await drainWaits(second as number, () =>
			retryPendingDeletionsAction(
				{ action: 'retry_pending_deletions' } as never,
				{
					userId: OWNER,
					isGlobalAdmin: true,
					isDeveloper: false,
				} as never,
			),
		);
		// The maintenance widget's door (core → the facade's patient drain).
		await drainWaits(third as number, async () => {
			const retry = diffusionServerControl.apiActions?.retry_pending_deletions;
			if (retry === undefined)
				throw new Error('the widget lost its retry_pending_deletions action');
			await retry({ count_only: false, limit: 100 }, {
				userId: OWNER,
				isGlobalAdmin: true,
				isDeveloper: false,
			} as never);
		});
	}, 120_000);

	test('ONE budget per scope: two held databases in one drain wait ~10 s in total, never 10 s each', async () => {
		const other = 'zzdif_fence_other_db';
		const first = await holdTargetLock(SQL_TARGET_KEY);
		const second = await holdTargetLock(`sql:${other}`);
		await first.acquired;
		await second.acquired;
		const results: Awaited<ReturnType<typeof executeSqlDeleteTargets>>[] = [];
		const startedAt = Date.now();
		let elapsed: number;
		try {
			await withPatientDeleteWait(async () => {
				// TWO executor calls (a drain settles row after row).
				results.push(
					await executeSqlDeleteTargets([
						{ database_name: SQL_DATABASE, table_name: PROBE_TABLE, section_ids: [940001] },
					]),
				);
				results.push(
					await executeSqlDeleteTargets([
						{ database_name: other, table_name: PROBE_TABLE, section_ids: [940001] },
					]),
				);
			});
			elapsed = Date.now() - startedAt;
		} finally {
			await first.release();
			await second.release();
		}
		// Non-degenerate: both targets were held for the whole scope (both given up).
		expect(results.map((result) => result.errors.length)).toEqual([1, 1]);
		expect(elapsed).toBeGreaterThanOrEqual(DELETE_TARGET_LOCK_BOUND_MS - 500);
		expect(
			elapsed,
			'the patient scope granted a fresh budget per executor call (N rows × 10 s)',
		).toBeLessThan(DELETE_TARGET_LOCK_BOUND_MS * 1.5);
	}, 60_000);
});

describe('DIFF-2 E — a record deleted while its batch waited is revalidated, not published', () => {
	test('the matrix row vanishes during the wait: no file for it, and its stale publication is removed', async () => {
		resetOutput();
		await clearActivity();
		const vanishing = ZZDIF_EXTRA_PUBLISHABLE_IDS[2];
		const stalePath = join(outputDir(), `${ZZDIF_SECTION}_${vanishing}.md`);
		writeFileSync(stalePath, '# a publication from an earlier run\n');

		// The holder's request is QUEUED from inside the runner's schema step, so it
		// is granted the moment that step commits — the runner then resolves its
		// first batch and meets the held target with the batch already in hand.
		const writer = markdownWriter as { open: typeof markdownWriter.open };
		const originalOpen = writer.open;
		let lock: Awaited<ReturnType<typeof holdTargetLock>> | null = null;
		writer.open = async (...args: Parameters<typeof markdownWriter.open>) => {
			const session = await originalOpen.apply(markdownWriter, args);
			const ensureSchema = session.ensureSchema.bind(session);
			session.ensureSchema = async () => {
				await ensureSchema();
				// Detached: the schema step may run inside the runner's own transaction.
				lock = await runDetachedFromTransaction(() => holdTargetLock(FILE_TARGET_KEY));
			};
			return session;
		};
		const job = await seedJob(ZZDIF_FILE_ELEMENT, ZZDIF_FILE_FORMAT);
		const runner = runJob(job.job_id, job.attempt);
		runnersInFlight.push(runner);
		try {
			const busy = await waitUntilBusy(job.job_id);
			expectWaited(busy);
			await assertTestDatabase('diffusion_target_fence_native leg E');
			await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
				ZZDIF_SECTION,
				vanishing,
			]);
		} finally {
			writer.open = originalOpen;
			await (lock as Awaited<ReturnType<typeof holdTargetLock>> | null)?.release();
		}
		await runner;
		expect((await getJobById(job.job_id))?.state).toBe('completed');
		expect(publishedIds()).toEqual(PUBLISHABLE_IDS.filter((id) => id !== vanishing));
		expect(existsSync(stalePath)).toBe(false);
	}, 120_000);
});

describe('the lock key is one contract', () => {
	test('the bridge lock module names targets exactly as this gate (and every other door) does', async () => {
		const fence = (await import('../../src/core/diffusion_bridge/target_lock.ts')) as Record<
			string,
			unknown
		>;
		expect(fence.DIFFUSION_TARGET_LOCK_CLASS).toBe(DIFFUSION_TARGET_LOCK_CLASS);
		expect((fence.sqlTargetLockKey as (database: string) => string)(SQL_DATABASE)).toBe(
			SQL_TARGET_KEY,
		);
		expect(
			(fence.fileTargetLockKey as (format: string, label: string) => string)(
				ZZDIF_FILE_FORMAT,
				ZZDIF_FILE_SERVICE_NAME,
			),
		).toBe(FILE_TARGET_KEY);
	});
});

describe('a fence unit is BOUNDED (a frozen holder cannot keep a target forever)', () => {
	test('inside a unit the session is killed after 5 min idle and waits at most 5 s for a lock; outside it, neither bound leaks', async () => {
		const fence = await import('../../src/core/diffusion_bridge/target_lock.ts');
		const show = async (): Promise<{ idle: string; lock: string }> => {
			const [idle] = (await sql.unsafe('SHOW idle_in_transaction_session_timeout')) as {
				idle_in_transaction_session_timeout: string;
			}[];
			const [lock] = (await sql.unsafe('SHOW lock_timeout')) as { lock_timeout: string }[];
			return {
				idle: String(idle?.idle_in_transaction_session_timeout),
				lock: String(lock?.lock_timeout),
			};
		};
		const inside = await fence.withTargetLock('files:zzdif_probe/bound', show, { mode: 'try' });
		expect(inside.acquired).toBe(true);
		expect(
			(inside as { value: { idle: string } }).value.idle,
			'a fence unit runs without the idle-in-transaction bound: a frozen runner holds its target forever',
		).toBe('5min');
		expect((inside as { value: { lock: string } }).value.lock).toBe('5s');
		// SET LOCAL: the pooled connection goes back without the unit's bounds.
		const outside = await runDetachedFromTransaction(show);
		expect(outside.idle).not.toBe('5min');
	});
});

describe('DIFF-2 F — a LIVE unit never loses its fence to the idle bound', () => {
	test('a unit whose target step outlasts the (shortened) idle bound keeps its lock and commits', async () => {
		const fence = await import('../../src/core/diffusion_bridge/target_lock.ts');
		const key = 'files:zzdif_probe/keepalive';
		const IDLE_BOUND_MS = 1_000;
		const outcome = await fence.withTargetLock(
			key,
			async () => {
				// The target step: no Postgres statement for 2.5 idle bounds (an ALTER on
				// a big table, a chunk loop, a MariaDB metadata-lock wait).
				await Bun.sleep(IDLE_BOUND_MS * 2);
				// Probed from ANOTHER session: the lock must still be held.
				const stolen = await runDetachedFromTransaction(async () => {
					const probe = await sql.reserve();
					try {
						const [row] = (await probe.unsafe(
							'SELECT pg_try_advisory_lock($1::int, hashtext($2)) AS got',
							[DIFFUSION_TARGET_LOCK_CLASS, key],
						)) as { got: boolean }[];
						if (row?.got === true) {
							await probe.unsafe('SELECT pg_advisory_unlock($1::int, hashtext($2))', [
								DIFFUSION_TARGET_LOCK_CLASS,
								key,
							]);
						}
						return row?.got === true;
					} finally {
						probe.release();
					}
				});
				await Bun.sleep(IDLE_BOUND_MS / 2);
				return { stolen, after: await sql.unsafe('SELECT 1 AS alive') };
			},
			{ mode: 'try', idleBoundMs: IDLE_BOUND_MS },
		);
		expect(outcome.acquired).toBe(true);
		const value = (outcome as { value: { stolen: boolean } }).value;
		expect(
			value.stolen,
			'the idle bound killed a LIVE unit — another session took its target mid-step',
		).toBe(false);
	}, 30_000);
});
