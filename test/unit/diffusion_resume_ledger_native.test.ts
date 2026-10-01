/**
 * DIFF-1 — A RESUMED PUBLICATION RUN PUBLISHES WHAT AN UNINTERRUPTED ONE DOES.
 *
 * THE FINDING (audit 2026-09-26, DIFF-1). A run's durable resume state was the
 * checkpoint `{cursor, run_started_at, processed}`: the primary keyset position
 * and nothing else. The relation FRONTIER (the linked records the primaries
 * queue for publication, drained after the primaries) and the set of artifacts
 * the run had written lived only in the runner's memory. A runner that died after
 * its primaries' checkpoint resumed with the cursor past every primary, so the
 * frontier was never re-derived: the linked records were never published, and
 * the consolidated artifact (`diffusion_md.zip`) was rebuilt from the RESUMED
 * session's files only — or not at all. The docs claimed the opposite: a
 * byte-identical resume keystone.
 *
 * WHAT IS ASSERTED — outcomes on disk and in the ledger, never a spelling:
 *   reference — an uninterrupted run of the HOP element (zzdif90: markdown, one
 *               portal hop, `levels: 1`): the sha256 of every file in the run
 *               directory, and the run's `result.tables`;
 *   crash 1   — an obstacle (a directory) planted at a PRIMARY record's path
 *               fails the run mid-primaries; admin requeue, obstacle removed,
 *               claim, run → the tree is byte-identical to the reference;
 *   crash 2   — the obstacle at a LINKED record's path (`zzdif20_940102.md`):
 *               the run fails inside the frontier DRAIN → byte-identical;
 *   kill -9   — a real runner process SIGKILLs itself when the first linked
 *               file lands (test/helpers/diffusion_runner_kill_child.ts); the
 *               sweeper requeues, a claim + run finish it → byte-identical;
 *   every crash — the crashed attempt COMMITTED batches first (`checkpoint.
 *               batch_seq` past the crash point's floor, ledger rows present):
 *               a crash before any commit would make the "resume" a fresh run
 *               (this is also the gate that DEDALO_DIFFUSION_BATCH_RECORDS is
 *               honoured — at the default 500 every primary is one batch);
 *   tail      — the batch TAIL is atomic with its batch (DIFF-1/DIFF-2 unit):
 *               a crash INSIDE the tail of a primary batch — at its dd1758
 *               insert (the row is fatal, never swallowed), after it at the
 *               run-ledger append (a test trigger), or at the checkpoint
 *               UPDATE — leaves NOTHING of that batch committed (no
 *               dd1758 row, no ledger row, checkpoint unmoved); the resume is
 *               byte-identical with exactly one dd1758 row per primary;
 *   stale publish — a LINKED record queued by a committed primary is
 *               unpublished by a curator while the run is down; the resumed
 *               drain must ask the gate NOW: its file is not written, it is
 *               not in the archive (a replayed queue-time "publishable"
 *               decision would republish it — failing OPEN, days later);
 *   errors    — a line only the FIRST attempt reports (the opportunistic
 *               dd1758 retry's unredeemed debt) survives the crash: the resumed
 *               run ends "Partial success" naming it;
 *   every leg — exactly ONE dd1758 'published' row per publishable primary, and
 *               `result.tables` equal to the reference (counts cover the RUN);
 *   cancel    — a complete `diffusion_md.zip` is seeded; the run is cancelled
 *               after its first batch → the zip is byte-UNCHANGED (a cancel
 *               never consolidates a partial run); an admin requeue then
 *               finishes the run → the tree equals the reference;
 *   ledger    — the job-scoped run ledger exists and is EMPTY once the runs
 *               completed.
 *
 * (The legacy-checkpoint leg — a checkpoint without `v:2` restarts from zero —
 * lives where the old resume contract was pinned: diffusion_runner_native.)
 *
 * THE SITUATION IS BUILT: the zzdif generic domain (test/helpers/
 * zzdif_diffusion_domain.ts) with its hop element; every job is enqueued, claimed
 * and seeded by test/helpers/diffusion_job_harness.ts with a PINNED
 * `run_started_at`; batches of ONE record (`DEDALO_DIFFUSION_BATCH_RECORDS=1`) so
 * every record is its own committed unit; files under a MARKED scratch root.
 *
 * WRITES: job rows in the lane's scratch jobs table, dd1758 rows in the scratch
 * activity table, files under the scratch root — all swept in afterAll; the
 * situation's residue is asserted 0.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { runDetachedFromTransaction, sql } from '../../src/core/db/postgres.ts';
import {
	activityTable,
	DIFFUSION_ACTION,
	logDiffusionActivity,
} from '../../src/core/diffusion_bridge/diffusion_delete.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import {
	type DiffusionJobRow,
	deleteJobsForTests,
	getJobById,
	listActiveJobs,
	requestCancel,
} from '../../src/diffusion/jobs/queue.ts';
import { pauseScheduler, resumeScheduler } from '../../src/diffusion/jobs/scheduler.ts';
import {
	DIFFUSION_JOB_LEDGER_TABLE,
	DIFFUSION_JOBS_TABLE,
} from '../../src/diffusion/jobs/schema.ts';
import { bumpOntologyRevision } from '../../src/diffusion/plan/cache.ts';
import { runJob } from '../../src/diffusion/runner.ts';
import { markdownWriter } from '../../src/diffusion/writers/markdown.ts';
import {
	enqueueClaimSeeded,
	requeueAndClaim,
	sweepAndClaim,
} from '../helpers/diffusion_job_harness.ts';
import { ensureDiffusionScratchTables } from '../helpers/diffusion_scratch_tables.ts';
import { scratchMediaRoot } from '../helpers/media_scratch_root.ts';
import { scratchRunEntries } from '../helpers/scratch_run_entries.ts';
import {
	dropZzdifDomain,
	ensureZzdifDomain,
	ZZDIF_DOMAIN_NAME,
	ZZDIF_EXTRA_PUBLISHABLE_IDS,
	ZZDIF_FILE_FORMAT,
	ZZDIF_HOP_FILE_ELEMENT,
	ZZDIF_HOP_SERVICE_NAME,
	ZZDIF_LINKED_IDS,
	ZZDIF_LINKED_PUBLICATION,
	ZZDIF_LINKED_SECTION,
	ZZDIF_PUBLISHABLE_ID,
	ZZDIF_SECTION,
} from '../helpers/zzdif_diffusion_domain.ts';

/** The superuser: unscoped selection, and a real owner for the dd1758 actor. */
const OWNER = -1;
const PUBLISHABLE_IDS = [ZZDIF_PUBLISHABLE_ID, ...ZZDIF_EXTRA_PUBLISHABLE_IDS].sort();
const KILL_CHILD = join(import.meta.dir, '..', 'helpers', 'diffusion_runner_kill_child.ts');
const REPO_ROOT = join(import.meta.dir, '..', '..');

let filesRoot: string;
const savedEnv: Record<string, string | undefined> = {};
const createdJobIds: string[] = [];

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

/** `<root>/markdown/zzdif_md_hop/` — the hop element's run directory. */
function outputDir(): string {
	return join(filesRoot, ZZDIF_FILE_FORMAT, ZZDIF_HOP_SERVICE_NAME);
}

/** Empty the run directory (a leg starts from a site with nothing published). */
function resetOutput(): void {
	rmSync(outputDir(), { recursive: true, force: true });
	mkdirSync(outputDir(), { recursive: true });
}

/** name → sha256 of every regular file in the run directory (the published "site"). */
function treeSnapshot(): Record<string, string> {
	const snapshot: Record<string, string> = {};
	for (const name of scratchRunEntries(outputDir())) {
		const path = join(outputDir(), name);
		if (!statSync(path).isFile()) {
			snapshot[name] = '<not a regular file>';
			continue;
		}
		snapshot[name] = createHash('sha256').update(readFileSync(path)).digest('hex');
	}
	return snapshot;
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

async function clearActivity(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM "${activityTable()}" WHERE section_tipo = 'dd1758'
		   AND relation->'dd1763'->0->>'section_tipo' = $1`,
		[ZZDIF_SECTION],
	);
}

/** Enqueue + claim + seed one run of the HOP element (levels 1: the frontier exists). */
function seedHopJob(): Promise<DiffusionJobRow> {
	return enqueueClaimSeeded(
		{
			elementTipo: ZZDIF_HOP_FILE_ELEMENT,
			sectionTipo: ZZDIF_SECTION,
			type: ZZDIF_FILE_FORMAT,
			ownerUserId: OWNER,
			options: { levels: 1 },
		},
		createdJobIds,
	);
}

async function run(job: DiffusionJobRow): Promise<DiffusionJobRow> {
	await runJob(job.job_id, job.attempt);
	const row = await getJobById(job.job_id);
	if (row === null) throw new Error('job row vanished during the run');
	return row;
}

/** dd64 values of the linked section's component_publication. */
const YES_FLAG = 1;
const NO_FLAG = 2;

/** Set a LINKED record's publication flag in the matrix (the curator's edit). */
async function setLinkedFlag(sectionId: number, value: number): Promise<void> {
	await assertTestDatabase('diffusion_resume_ledger_native publication flip');
	const updated = (await sql.unsafe(
		`UPDATE matrix_test SET relation = jsonb_set(relation, $3::text[], $4::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2 RETURNING section_id`,
		[
			ZZDIF_LINKED_SECTION,
			sectionId,
			`{${ZZDIF_LINKED_PUBLICATION}}`,
			encodeForJsonb([{ section_tipo: 'dd64', section_id: value }]),
		],
	)) as unknown[];
	if (updated.length !== 1) {
		throw new Error(`publication flip touched ${updated.length} rows — the fixture moved`);
	}
}

/** Plant a DIRECTORY where a record file must land: the write fails there, loudly. */
function plantObstacle(name: string): void {
	mkdirSync(join(outputDir(), name, 'obstacle'), { recursive: true });
}
function removeObstacle(name: string): void {
	rmSync(join(outputDir(), name), { recursive: true, force: true });
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
	await step(() => dropTailCrash());
	await step(() => deleteJobsForTests(createdJobIds));
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
		throw new AggregateError(failures, `diffusion_resume_ledger_native teardown failed`);
	}
}

let reference: {
	tree: Record<string, string>;
	tables: unknown;
	msg: unknown;
	zipBytes: Uint8Array;
};

/** The engine's own run-ledger name (never re-derived here: a drifted copy reads an empty nowhere). */
const LEDGER_TABLE = DIFFUSION_JOB_LEDGER_TABLE;
/** The test-only crash trigger (function + trigger share the name; dropped by every leg). */
const TAIL_CRASH = 'zzdif_resume_tail_crash';

/** The committed batch count of a job row's v2 checkpoint (0 when absent). */
function batchSeqOf(row: DiffusionJobRow | null): number {
	return Number((row?.checkpoint as { batch_seq?: unknown } | undefined)?.batch_seq) || 0;
}

/** Run-ledger rows of a job with batch_seq > `after`. */
async function ledgerRowsAfter(jobId: string, after: number): Promise<number> {
	const [count] = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${LEDGER_TABLE}" WHERE job_id = $1 AND batch_seq > $2`,
		[jobId, after],
	)) as { n: number }[];
	return count?.n ?? 0;
}

/**
 * Plant a crash INSIDE a batch's tail: a BEFORE trigger on `table` raising for
 * the rows `condition` names — the batch's target phase and its dd1758 row
 * already ran in the same transaction when it fires.
 */
async function plantTailCrash(table: string, event: string, condition: string): Promise<void> {
	await assertTestDatabase('diffusion_resume_ledger_native tail crash');
	await dropTailCrash();
	await sql.unsafe(
		`CREATE FUNCTION ${TAIL_CRASH}() RETURNS trigger LANGUAGE plpgsql AS $fn$
		 BEGIN
		   IF ${condition} THEN RAISE EXCEPTION 'zzdif test crash inside the batch tail'; END IF;
		   RETURN NEW;
		 END $fn$`,
	);
	await sql.unsafe(
		`CREATE TRIGGER ${TAIL_CRASH} BEFORE ${event} ON "${table}"
		 FOR EACH ROW EXECUTE FUNCTION ${TAIL_CRASH}()`,
	);
}
async function dropTailCrash(): Promise<void> {
	for (const table of [LEDGER_TABLE, DIFFUSION_JOBS_TABLE, activityTable()]) {
		await sql.unsafe(`DROP TRIGGER IF EXISTS ${TAIL_CRASH} ON "${table}"`);
	}
	await sql.unsafe(`DROP FUNCTION IF EXISTS ${TAIL_CRASH}()`);
}

beforeAll(async () => {
	await ensureDiffusionScratchTables();
	pauseScheduler();
	await ensureZzdifDomain();
	filesRoot = scratchMediaRoot('dedalo_diffusion_resume_ledger_');
	setEnv('DEDALO_DIFFUSION_FILES_ROOT', filesRoot);
	setEnv('DEDALO_DIFFUSION_DOMAIN', ZZDIF_DOMAIN_NAME);
	// One record per committed unit: every record is its own crash boundary.
	setEnv('DEDALO_DIFFUSION_BATCH_RECORDS', '1');
	bumpOntologyRevision();
	const stale = (await listActiveJobs()).filter((row) => row.state === 'queued');
	await deleteJobsForTests(stale.map((row) => row.job_id));
	await clearActivity();

	// THE REFERENCE: one uninterrupted run.
	resetOutput();
	const finished = await run(await seedHopJob());
	if (finished.state !== 'completed') {
		throw new Error(
			`reference run did not complete (${finished.state}): ${JSON.stringify(finished.result)}`,
		);
	}
	reference = {
		tree: treeSnapshot(),
		tables: finished.result?.tables,
		msg: finished.result?.msg,
		zipBytes: new Uint8Array(readFileSync(join(outputDir(), 'diffusion_md.zip'))),
	};
	await clearActivity();
}, 120_000);

afterAll(teardown);

describe('DIFF-1 — a resumed run publishes exactly what an uninterrupted run does', () => {
	test('the reference is non-degenerate: primaries, the FRONTIER, and the archive', () => {
		// Without the linked files the run has no frontier and every crash leg
		// below would be about the primaries only — the half that always resumed.
		// (Floor: the tree holds MORE than the primaries — the frontier landed.)
		// The listing's own floor, on the run directory the reference left.
		const listed = scratchRunEntries(outputDir());
		// 4 primaries + 2 linked + the archive = 7 entries; anything ≤ 5 lost the frontier.
		expect(listed.length).toBeGreaterThan(5);
		expect(listed.length).toBeGreaterThan(PUBLISHABLE_IDS.length + 1);
		expect(Object.keys(reference.tree)).toEqual(listed);
		expect(Object.keys(reference.tree)).toEqual(
			[
				...PUBLISHABLE_IDS.map((id) => `${ZZDIF_SECTION}_${id}.md`),
				...ZZDIF_LINKED_IDS.map((id) => `${ZZDIF_LINKED_SECTION}_${id}.md`),
				'diffusion_md.zip',
			].sort(),
		);
	});

	/**
	 * Fail a run at `obstacle`, then requeue + resume it; return the finished row.
	 * `committedFloor`: the crashed attempt must have committed at least that many
	 * batches, or the "resume" is a fresh run and the leg is vacuous.
	 */
	async function crashAndResume(
		obstacle: string,
		committedFloor: number,
	): Promise<DiffusionJobRow> {
		resetOutput();
		await clearActivity();
		plantObstacle(obstacle);
		const job = await seedHopJob();
		const crashed = await run(job);
		// The precondition, or the leg is vacuous: the run DID die at the obstacle…
		expect(crashed.state).toBe('failed');
		// …AFTER committing batches (the batch knob honoured; the ledger written).
		expect(
			batchSeqOf(crashed),
			'the crashed attempt committed no batch before the obstacle — its resume would be a fresh run',
		).toBeGreaterThanOrEqual(committedFloor);
		expect(await ledgerRowsAfter(job.job_id, 0)).toBeGreaterThan(0);
		removeObstacle(obstacle);
		return run(await requeueAndClaim(job.job_id));
	}

	test('crash 1 — the run dies among the PRIMARIES; the resumed tree is byte-identical', async () => {
		// 940001 and 940002 (the unpublishable one) commit first: two batches of one.
		const finished = await crashAndResume(`${ZZDIF_SECTION}_940003.md`, 2);
		expect(finished.state).toBe('completed');
		expect(treeSnapshot()).toEqual(reference.tree);
		expect(await publishedActivityIds()).toEqual(PUBLISHABLE_IDS);
		expect(finished.result?.tables).toEqual(reference.tables);
	}, 120_000);

	test('crash 2 — the run dies inside the FRONTIER DRAIN; the resumed tree is byte-identical', async () => {
		// Every primary batch committed before the drain began.
		const finished = await crashAndResume(
			`${ZZDIF_LINKED_SECTION}_${ZZDIF_LINKED_IDS[1]}.md`,
			PUBLISHABLE_IDS.length + 1,
		);
		expect(finished.state).toBe('completed');
		// The linked record the crash stopped at, and the archive of the WHOLE run.
		expect(treeSnapshot()).toEqual(reference.tree);
		expect(await publishedActivityIds()).toEqual(PUBLISHABLE_IDS);
		expect(finished.result?.tables).toEqual(reference.tables);
	}, 120_000);

	/**
	 * Crash inside the tail of 940003's batch (a PRIMARY with a dd1758 row, after
	 * two committed batches), then resume. Nothing of the crashed batch may be
	 * committed: were the ledger append, the checkpoint or the dd1758 row outside
	 * the unit's transaction, the crash would leave that half behind (and the
	 * resume would publish 940003's dd1758 row twice).
	 */
	async function tailCrashAndResume(
		table: string,
		event: string,
		condition: string,
	): Promise<void> {
		resetOutput();
		await clearActivity();
		const job = await seedHopJob();
		let crashed: DiffusionJobRow;
		try {
			await plantTailCrash(table, event, condition);
			crashed = await run(job);
		} finally {
			await dropTailCrash();
		}
		expect(crashed.state, 'the tail crash never fired').toBe('failed');
		const committed = batchSeqOf(crashed);
		expect(committed, 'the checkpoint moved past the crashed batch').toBe(2);
		expect(
			await ledgerRowsAfter(job.job_id, committed),
			'the crashed batch left run-ledger rows behind',
		).toBe(0);
		expect(
			await publishedActivityIds(),
			"the crashed batch's dd1758 row was committed without its batch",
		).toEqual([ZZDIF_PUBLISHABLE_ID]);

		const finished = await run(await requeueAndClaim(job.job_id));
		expect(finished.state).toBe('completed');
		expect(treeSnapshot()).toEqual(reference.tree);
		expect(await publishedActivityIds()).toEqual(PUBLISHABLE_IDS);
		expect(finished.result?.tables).toEqual(reference.tables);
	}

	test('tail — a crash at the RUN-LEDGER append of a primary batch commits nothing of it', async () => {
		await tailCrashAndResume(
			LEDGER_TABLE,
			'INSERT',
			`NEW.kind = 'wrote' AND NEW.section_tipo = '${ZZDIF_SECTION}' AND NEW.section_id #>> '{}' = '940003'`,
		);
	}, 120_000);

	// The dd1758 row is FATAL to its batch: a published record without its row is
	// never unpublished on delete. A SAVEPOINT (or nested transaction) + catch
	// around logDiffusionActivity would commit the batch WITHOUT its row — and a
	// plain catch survives only by accident (the aborted transaction fails the
	// next statement). This leg makes the insert itself fail.
	test('tail — a failing dd1758 insert of a primary fails its batch: nothing of it commits', async () => {
		await tailCrashAndResume(
			activityTable(),
			'INSERT',
			`NEW.section_tipo = 'dd1758'
			 AND NEW.relation->'dd1763'->0->>'section_tipo' = '${ZZDIF_SECTION}'
			 AND NEW.relation->'dd1763'->0->>'section_id' = '940003'`,
		);
	}, 120_000);

	test('tail — a crash at the CHECKPOINT of a primary batch commits nothing of it', async () => {
		await tailCrashAndResume(
			DIFFUSION_JOBS_TABLE,
			'UPDATE OF checkpoint',
			`NEW.checkpoint->>'v' = '2' AND NEW.checkpoint->>'cursor' = '940003'`,
		);
	}, 120_000);

	test('stale publish — a linked record unpublished while the run is down is NOT published by the resume', async () => {
		const flipped = ZZDIF_LINKED_IDS[0] as number;
		const kept = ZZDIF_LINKED_IDS[1] as number;
		const flippedFile = `${ZZDIF_LINKED_SECTION}_${flipped}.md`;
		// Control: the uninterrupted run publishes it (the leg is about the resume).
		expect(reference.tree[flippedFile]).toBeDefined();
		const obstacle = `${ZZDIF_SECTION}_940003.md`;
		resetOutput();
		await clearActivity();
		let finished: DiffusionJobRow;
		let planted = false;
		try {
			plantObstacle(obstacle);
			planted = true;
			const job = await seedHopJob();
			const crashed = await run(job);
			expect(crashed.state).toBe('failed');
			// 940001 (which queued the linked records while publishable) committed.
			expect(batchSeqOf(crashed)).toBeGreaterThanOrEqual(2);
			const queued = (await sql.unsafe(
				`SELECT count(*)::int AS n FROM "${LEDGER_TABLE}"
				 WHERE job_id = $1 AND kind = 'queue' AND section_tipo = $2 AND section_id #>> '{}' = $3`,
				[job.job_id, ZZDIF_LINKED_SECTION, String(flipped)],
			)) as { n: number }[];
			expect(queued[0]?.n, 'the crashed attempt never queued the linked record').toBe(1);
			removeObstacle(obstacle);
			planted = false;
			// While the run is down, a curator unpublishes the linked record.
			await setLinkedFlag(flipped, NO_FLAG);
			finished = await run(await requeueAndClaim(job.job_id));
		} finally {
			if (planted) removeObstacle(obstacle);
			await setLinkedFlag(flipped, YES_FLAG);
		}
		expect(finished.state).toBe('completed');
		const tree = treeSnapshot();
		expect(
			tree[flippedFile],
			'the resumed run published a record that is unpublishable NOW (a stale queue-time decision)',
		).toBeUndefined();
		// Non-degenerate: the other linked record and every primary are published.
		expect(tree[`${ZZDIF_LINKED_SECTION}_${kept}.md`]).toBe(
			reference.tree[`${ZZDIF_LINKED_SECTION}_${kept}.md`] as string,
		);
		for (const id of PUBLISHABLE_IDS) {
			expect(tree[`${ZZDIF_SECTION}_${id}.md`]).toBe(
				reference.tree[`${ZZDIF_SECTION}_${id}.md`] as string,
			);
		}
		const zip = Buffer.from(readFileSync(join(outputDir(), 'diffusion_md.zip')));
		expect(zip.includes(Buffer.from(`${ZZDIF_LINKED_SECTION}_${kept}.md`))).toBe(true);
		expect(
			zip.includes(Buffer.from(flippedFile)),
			'the archive carries the record unpublished while the run was down',
		).toBe(false);
	}, 120_000);

	test('errors — a line only the FIRST attempt reports survives the crash: the resumed run ends Partial success', async () => {
		// Control: the uninterrupted run reported nothing, so any line below is the debt's.
		expect(reference.msg).toBe('OK. Request done');
		resetOutput();
		await clearActivity();
		await assertTestDatabase('diffusion_resume_ledger_native errors leg');
		// An unredeemable dd1758 debt: a pending row that names no target (never
		// settled, never stamped). The opportunistic retry reports it on the FIRST
		// invocation only — a resume skips the retry.
		const debtRow = await logDiffusionActivity({
			sectionTipo: ZZDIF_SECTION,
			sectionId: 940999,
			elementTipo: null,
			action: DIFFUSION_ACTION.unpublishPending,
		});
		await sql.unsafe(
			`UPDATE "${activityTable()}" SET relation = relation - 'dd1763'
			 WHERE section_tipo = 'dd1758' AND section_id = $1`,
			[debtRow],
		);
		const obstacle = `${ZZDIF_LINKED_SECTION}_${ZZDIF_LINKED_IDS[1]}.md`;
		let finished: DiffusionJobRow;
		let planted = false;
		try {
			plantObstacle(obstacle);
			planted = true;
			const job = await seedHopJob();
			const crashed = await run(job);
			expect(crashed.state).toBe('failed');
			expect(batchSeqOf(crashed)).toBeGreaterThan(0);
			removeObstacle(obstacle);
			planted = false;
			finished = await run(await requeueAndClaim(job.job_id));
		} finally {
			if (planted) removeObstacle(obstacle);
			await sql.unsafe(
				`DELETE FROM "${activityTable()}" WHERE section_tipo = 'dd1758' AND section_id = $1`,
				[debtRow],
			);
		}
		expect(finished.state).toBe('completed');
		expect(treeSnapshot()).toEqual(reference.tree);
		const result = finished.result as { msg?: unknown; errors?: unknown[] } | null;
		expect(
			String(result?.msg),
			"the resumed run forgot the crashed attempt's error lines — it reports a clean success",
		).toStartWith('Partial success');
		expect(
			(result?.errors ?? [])
				.map(String)
				.some((line) => line.startsWith('pending unpublish queue:')),
		).toBe(true);
	}, 120_000);

	test('kill -9 — a runner process dies mid-drain; sweep, claim, run → byte-identical', async () => {
		resetOutput();
		await clearActivity();
		const job = await seedHopJob();
		const child = Bun.spawn(
			[
				process.execPath,
				'run',
				KILL_CHILD,
				outputDir(),
				`${ZZDIF_LINKED_SECTION}_`,
				job.job_id,
				String(job.attempt),
			],
			{ cwd: REPO_ROOT, env: process.env, stdout: 'pipe', stderr: 'pipe' },
		);
		await child.exited;
		const stdout = await new Response(child.stdout).text();
		const stderr = await new Response(child.stderr).text();
		// The kill landed where it was aimed, or the leg proves nothing.
		expect(
			child.signalCode,
			`the runner child was not killed mid-drain (exit ${child.exitCode}); stdout: ${stdout} stderr: ${stderr.slice(-2000)}`,
		).toBe('SIGKILL');
		// The kill fired in the drain: every primary batch was committed.
		expect(batchSeqOf(await getJobById(job.job_id))).toBeGreaterThanOrEqual(
			PUBLISHABLE_IDS.length + 1,
		);
		// The dead child's backend releases its FOR KEY SHARE on the job row only
		// once it has processed the socket EOF and rolled back; until then the
		// sweeper's SKIP LOCKED passes the row by. Poll the sweep, bounded — only
		// a row still unrequeued at the bound is a defect.
		let resumed: DiffusionJobRow | null = null;
		const sweepDeadline = Date.now() + 10_000;
		while (resumed === null && Date.now() < sweepDeadline) {
			resumed = await sweepAndClaim(job.job_id);
			if (resumed === null) await Bun.sleep(50);
		}
		expect(resumed, 'the sweeper did not requeue the killed run within 10 s').not.toBeNull();
		const finished = await run(resumed as DiffusionJobRow);
		expect(finished.state).toBe('completed');
		expect(treeSnapshot()).toEqual(reference.tree);
		expect(await publishedActivityIds()).toEqual(PUBLISHABLE_IDS);
		expect(finished.result?.tables).toEqual(reference.tables);
	}, 120_000);

	test('cancel — a cancelled run never consolidates: the seeded archive is byte-unchanged; a requeue finishes the run', async () => {
		resetOutput();
		await clearActivity();
		// What the site holds from the LAST complete run.
		writeFileSync(join(outputDir(), 'diffusion_md.zip'), reference.zipBytes);
		const job = await seedHopJob();

		// Cancel lands after the run's FIRST written batch: the session's
		// writeRows is wrapped to raise the flag once, right after it returns.
		const writer = markdownWriter as { open: typeof markdownWriter.open };
		const originalOpen = writer.open;
		let raised = false;
		writer.open = async (...args: Parameters<typeof markdownWriter.open>) => {
			const session = await originalOpen.apply(markdownWriter, args);
			const writeRows = session.writeRows.bind(session);
			session.writeRows = async (...writeArgs: Parameters<typeof session.writeRows>) => {
				const result = await writeRows(...writeArgs);
				if (!raised) {
					raised = true;
					// Detached: the cancel is another session's request, never the batch's.
					await runDetachedFromTransaction(() => requestCancel(job.client_process_id, OWNER));
				}
				return result;
			};
			return session;
		};
		let cancelled: DiffusionJobRow;
		try {
			cancelled = await run(job);
		} finally {
			writer.open = originalOpen;
		}
		expect(raised).toBe(true);
		expect(cancelled.state).toBe('cancelled');
		expect(
			Buffer.from(readFileSync(join(outputDir(), 'diffusion_md.zip'))).equals(
				Buffer.from(reference.zipBytes),
			),
			'the cancelled run rewrote the consolidated archive from its partial work',
		).toBe(true);
		expect(scratchRunEntries(outputDir()).filter((name) => /\.(tmp|part)-/.test(name))).toEqual([]);

		const finished = await run(await requeueAndClaim(job.job_id));
		expect(finished.state).toBe('completed');
		expect(treeSnapshot()).toEqual(reference.tree);
		expect(await publishedActivityIds()).toEqual(PUBLISHABLE_IDS);
	}, 120_000);

	test('the job-scoped run ledger exists, and is empty once every run completed', async () => {
		const ledger = LEDGER_TABLE;
		const [present] = (await sql.unsafe('SELECT to_regclass($1) IS NOT NULL AS present', [
			`"${ledger}"`,
		])) as { present: boolean }[];
		expect(present?.present, `no run ledger table "${ledger}"`).toBe(true);
		const [count] = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM "${ledger}" WHERE job_id = ANY($1::uuid[])`,
			[`{${createdJobIds.join(',')}}`],
		)) as { n: number }[];
		expect(count?.n).toBe(0);
	});
});
