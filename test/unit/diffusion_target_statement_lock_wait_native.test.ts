/**
 * WAITING IS NOT WORKING — a target statement that waits on a lock ANOTHER
 * session holds on the MariaDB target fails at the bound, and the door's unit
 * releases the publication-target lock (closure review cross-diffusion:r4, S2
 * "Fence keepalive holds a target lock with no time limit while a MariaDB
 * statement that has no timeout hangs"; core/diffusion_bridge/target_lock.ts
 * boundSqlTargetStatement).
 *
 * THE FINDING. A live unit never loses its fence (its keepalive refreshes the
 * Postgres idle bound), and no MariaDB statement it ran had a lock-wait bound:
 * a writer's ALTER behind the public site's long read (a metadata lock —
 * MariaDB waits a DAY by default), or an upsert behind a row lock, held the
 * EXCLUSIVE `sql:<db>` lock that long — every other run, unpublish, sweep and
 * rebuild on the target waiting or going pending with it.
 *
 * WHAT IS ASSERTED — outcomes on the suite MariaDB, each door run in its REAL
 * unit (withTargetLock / its own fence) with the bound shortened to 1 s by the
 * test seam: the blocked statement fails with errno 1205 well inside
 * HANG_MS (unbounded, it waits for the blocker: a day for a metadata lock, the
 * server's 50 s for a row lock), the door answers, and while the BLOCKER STILL
 * HOLDS its MariaDB lock the publication-target lock is free again.
 *   W1. writer ensureSchema: the ALTER ADD behind a reader's metadata lock.
 *   W2. writer ensureSchema: the CREATE TABLE IF NOT EXISTS queued behind a
 *       pending ALTER (another session's), itself behind a reader.
 *   W3. writer writeRows: the upsert behind a row lock.
 *   W4. writer removeRecords: the DELETE behind a row lock.
 *   D1. the record-delete executor (request path, SHARED lock): the DELETE
 *       behind a row lock — the target in `errors` (the unpublish stays
 *       pending), the row still there.
 *   S1. the phantom-lang sweep (its REAL pool dependency, EXCLUSIVE fence): a
 *       DELETE chunk behind a row lock — reported in `errors`, nothing swept.
 *   M1. the media-index rebuild (EXCLUSIVE fence): its SELECT queued behind a
 *       pending ALTER — reported, the database's markers kept.
 *   +   the bound composes with a statement's own `SET STATEMENT` (the sweep's
 *       read budget) and never leaks to the pooled connection.
 *
 * WRITES: dedalo_ts_zzlw_* tables in the zzdif suite MariaDB database (dropped
 * in afterAll; a dedalo_ts_* name keeps the writer's marker store a no-op) and
 * a temp marker store for M1 (removed).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import {
	boundSqlTargetStatement,
	DIFFUSION_TARGET_LOCK_CLASS,
	SQL_TARGET_LOCK_WAIT_S,
	sqlTargetLockKey,
	withSqlTargetLockWaitForTests,
	withTargetLock,
} from '../../src/core/diffusion_bridge/target_lock.ts';
import type { FieldPlan, PublicationPlan, SectionPlan } from '../../src/diffusion/plan/types.ts';
import { closeAllTargetPools, getTargetPool } from '../../src/diffusion/targets/mariadb/db.ts';
import { executeSqlDeleteTargets } from '../../src/diffusion/targets/mariadb/delete_record.ts';
import {
	DEFAULT_LANG_SWEEP_DEPENDENCIES,
	type LangSweepDependencies,
	sweepPhantomLangs,
} from '../../src/diffusion/targets/mariadb/lang_sweep.ts';
import {
	overrideMediaIndexBaseForTests,
	rebuildMediaIndexStore,
} from '../../src/diffusion/targets/mediastore/media_index.ts';
import { mariadbSqlWriter } from '../../src/diffusion/writers/mariadb_sql.ts';
import type { WriterSession } from '../../src/diffusion/writers/types.ts';
import { databasesOf, requireSuiteMariadb } from '../helpers/suite_mariadb.ts';
import { ZZDIF_SITUATION } from '../helpers/zzdif_diffusion_domain.ts';

const DATABASE = 'zzdif_publication_db';
const TARGET_KEY = sqlTargetLockKey(DATABASE);
const TABLE = 'dedalo_ts_zzlw_target';
/** The seam's bound for every leg (seconds). */
const BOUND_S = 1;
/** A door still waiting after this has no bound: the unbounded waits are a day / 50 s. */
const HANG_MS = 15_000;
/** A lock WAIT error (metadata or row): ER_LOCK_WAIT_TIMEOUT. */
const LOCK_WAIT_TIMEOUT_ERRNO = 1205;
const POLICY_LANG = 'lg-eng';
const PHANTOM_LANG = 'lg-fra';

const field: FieldPlan = {
	id: 'testdd1',
	columnName: 'title',
	sourceChain: [],
	transform: [],
	column: { fieldModel: 'field_varchar', varcharLength: 50 },
	policy: {},
};
const section: SectionPlan = {
	sectionTipo: 'test3',
	tableName: TABLE,
	tableTipo: 'testdd0',
	fields: [field],
};
const plan: PublicationPlan = {
	planId: 'zzlw-lock-wait',
	elementTipo: 'testdd_element',
	format: 'sql',
	serviceName: null,
	target: { kind: 'table', database: DATABASE },
	sections: [section],
	recursion: { maxLevels: 1 },
	langPolicy: { langs: [POLICY_LANG], mainLang: POLICY_LANG },
	warnings: [],
};

type Pool = ReturnType<typeof getTargetPool>;
type Reserved = Awaited<ReturnType<Pool['reserve']>>;

function pool(): Pool {
	return getTargetPool(DATABASE);
}

/** The table, complete, holding (7, lg-eng) and (7, lg-fra). */
async function resetTable(): Promise<void> {
	await pool().unsafe(`DROP TABLE IF EXISTS \`${TABLE}\``, []);
	const session = await mariadbSqlWriter.open(plan);
	await session.ensureSchema();
	await session.writeRows(section, [
		{ sectionId: 7, lang: POLICY_LANG, columns: { title: 'kept' } },
		{ sectionId: 7, lang: PHANTOM_LANG, columns: { title: 'phantom' } },
	]);
}

async function openSession(): Promise<WriterSession> {
	return mariadbSqlWriter.open(plan);
}

/** Is the publication-target lock free right now (an EXCLUSIVE try from another session)? */
async function targetLockFree(): Promise<boolean> {
	const connection = await sql.reserve();
	try {
		const [row] = (await connection.unsafe(
			'SELECT pg_try_advisory_lock($1::int, hashtext($2)) AS got',
			[DIFFUSION_TARGET_LOCK_CLASS, TARGET_KEY],
		)) as { got: boolean }[];
		if (row?.got === true) {
			await connection.unsafe('SELECT pg_advisory_unlock($1::int, hashtext($2))', [
				DIFFUSION_TARGET_LOCK_CLASS,
				TARGET_KEY,
			]);
			return true;
		}
		return false;
	} finally {
		connection.release();
	}
}

/** A MariaDB session holding a lock on the table until `release()`. */
interface Blocker {
	release: () => Promise<void>;
}

/** Another session's open transaction that READ the table: a shared metadata lock. */
async function holdReader(): Promise<Blocker & { connection: Reserved }> {
	const connection = await pool().reserve();
	await connection.unsafe('START TRANSACTION', []);
	await connection.unsafe(`SELECT section_id FROM \`${TABLE}\` LIMIT 1`, []);
	return {
		connection,
		release: async () => {
			await connection.unsafe('ROLLBACK', []).catch(() => {});
			connection.release();
		},
	};
}

/** Another session's open transaction holding every row FOR UPDATE: row locks. */
async function holdRows(): Promise<Blocker> {
	const connection = await pool().reserve();
	await connection.unsafe('START TRANSACTION', []);
	await connection.unsafe(`SELECT section_id FROM \`${TABLE}\` FOR UPDATE`, []);
	return {
		release: async () => {
			await connection.unsafe('ROLLBACK', []).catch(() => {});
			connection.release();
		},
	};
}

/**
 * A reader plus ANOTHER session's ALTER queued behind it: every new statement on
 * the table (even a read) now queues behind the pending exclusive metadata lock.
 */
async function holdPendingAlter(): Promise<Blocker> {
	const reader = await holdReader();
	const alterer = await pool().reserve();
	const pending = alterer
		.unsafe(`SET STATEMENT lock_wait_timeout=120 FOR ALTER TABLE \`${TABLE}\` COMMENT = 'zzlw'`, [])
		.catch(() => {});
	const deadline = Date.now() + 10_000;
	for (;;) {
		const [row] = (await reader.connection.unsafe(
			`SELECT count(*) AS n FROM information_schema.PROCESSLIST
			 WHERE DB = ? AND ID <> CONNECTION_ID() AND STATE LIKE 'Waiting for table metadata lock'`,
			[DATABASE],
		)) as { n: number | string }[];
		if (Number(row?.n ?? 0) > 0) break;
		if (Date.now() > deadline) {
			await reader.release();
			await pending;
			alterer.release();
			throw new Error('the external ALTER never queued behind the reader');
		}
		await Bun.sleep(25);
	}
	return {
		release: async () => {
			await reader.release();
			await pending;
			alterer.release();
		},
	};
}

/**
 * Run the door under the 1 s seam while `blocker` holds; it must ANSWER inside
 * HANG_MS, and the target lock must be free while the blocker STILL holds.
 * Returns the door's settled outcome.
 */
async function doorUnderBlocker<T>(
	blocker: Blocker,
	door: () => Promise<T>,
): Promise<{ value?: T; error?: unknown; elapsed: number }> {
	const startedAt = Date.now();
	const settled = withSqlTargetLockWaitForTests(BOUND_S, door).then(
		(value) => ({ value }),
		(error: unknown) => ({ error }),
	);
	let outcome: { value?: T; error?: unknown } | 'hung';
	let freeWhileHeld = false;
	try {
		outcome = await Promise.race([settled, Bun.sleep(HANG_MS).then(() => 'hung' as const)]);
		if (outcome !== 'hung') freeWhileHeld = await targetLockFree();
	} finally {
		await blocker.release();
	}
	if (outcome === 'hung') {
		await settled;
		throw new Error(
			`the door was still waiting on the target after ${HANG_MS} ms — its statement has no lock-wait bound, so its unit held the publication-target lock for as long as the blocker did`,
		);
	}
	expect(
		freeWhileHeld,
		'the door answered but the publication-target lock was still held while the blocker held its MariaDB lock',
	).toBe(true);
	return { ...outcome, elapsed: Date.now() - startedAt };
}

function errnoOf(error: unknown): number | undefined {
	return (error as { errno?: number } | undefined)?.errno;
}

beforeAll(async () => {
	await requireSuiteMariadb(import.meta.path, databasesOf(ZZDIF_SITUATION));
}, 120_000);

afterAll(async () => {
	try {
		await pool().unsafe(`DROP TABLE IF EXISTS \`${TABLE}\``, []);
	} finally {
		await closeAllTargetPools();
	}
});

describe('the MariaDB writer in its fenced unit', () => {
	test('W1 — the ALTER ADD behind a reader’s metadata lock fails at the bound and the unit releases the target', async () => {
		await resetTable();
		await pool().unsafe(`ALTER TABLE \`${TABLE}\` DROP COLUMN title`, []);
		const session = await openSession();
		const outcome = await doorUnderBlocker(await holdReader(), () =>
			withTargetLock(TARGET_KEY, () => session.ensureSchema()),
		);
		expect(errnoOf(outcome.error), 'the ALTER did not fail on its lock wait').toBe(
			LOCK_WAIT_TIMEOUT_ERRNO,
		);
	}, 60_000);

	test('W2 — the CREATE TABLE IF NOT EXISTS queued behind a pending ALTER fails at the bound', async () => {
		await resetTable();
		const session = await openSession();
		const outcome = await doorUnderBlocker(await holdPendingAlter(), () =>
			withTargetLock(TARGET_KEY, () => session.ensureSchema()),
		);
		expect(errnoOf(outcome.error), 'the CREATE did not fail on its lock wait').toBe(
			LOCK_WAIT_TIMEOUT_ERRNO,
		);
	}, 60_000);

	test('W3 — the upsert behind a row lock fails at the bound (the batch rolls back)', async () => {
		await resetTable();
		const session = await openSession();
		await session.ensureSchema();
		const outcome = await doorUnderBlocker(await holdRows(), () =>
			withTargetLock(TARGET_KEY, () =>
				session.writeRows(section, [
					{ sectionId: 7, lang: POLICY_LANG, columns: { title: 'overwritten' } },
				]),
			),
		);
		expect(errnoOf(outcome.error), 'the upsert did not fail on its lock wait').toBe(
			LOCK_WAIT_TIMEOUT_ERRNO,
		);
		const rows = (await pool().unsafe(
			`SELECT title FROM \`${TABLE}\` WHERE section_id = 7 AND lang = ?`,
			[POLICY_LANG],
		)) as { title: string }[];
		expect(rows.map((row) => row.title)).toEqual(['kept']);
	}, 60_000);

	test('W4 — the unpublish DELETE behind a row lock fails at the bound', async () => {
		await resetTable();
		const session = await openSession();
		await session.ensureSchema();
		const outcome = await doorUnderBlocker(await holdRows(), () =>
			withTargetLock(TARGET_KEY, () => session.removeRecords(section, [7])),
		);
		expect(errnoOf(outcome.error), 'the DELETE did not fail on its lock wait').toBe(
			LOCK_WAIT_TIMEOUT_ERRNO,
		);
	}, 60_000);
});

describe('the other doors on a sql target', () => {
	test('D1 — the record-delete executor: the target in errors (pending), the row kept, the SHARED lock released', async () => {
		await resetTable();
		const outcome = await doorUnderBlocker(await holdRows(), () =>
			executeSqlDeleteTargets([{ database_name: DATABASE, table_name: TABLE, section_ids: [7] }]),
		);
		expect(outcome.error).toBeUndefined();
		expect(outcome.value?.deleted).toEqual([]);
		expect(outcome.value?.errors).toHaveLength(1);
		expect(String(outcome.value?.errors[0])).toContain('Lock wait timeout');
		const rows = (await pool().unsafe(`SELECT count(*) AS n FROM \`${TABLE}\``, [])) as {
			n: number | string;
		}[];
		expect(Number(rows[0]?.n)).toBe(2);
	}, 60_000);

	test('S1 — the phantom-lang sweep (real pool): the DELETE chunk behind a row lock is reported, nothing swept', async () => {
		await resetTable();
		const dependencies: LangSweepDependencies = {
			...DEFAULT_LANG_SWEEP_DEPENDENCIES,
			listTargetDatabases: async () => ({ databases: [DATABASE], invalid: [] }),
			listDeclaredTables: async () => new Set([TABLE]),
			policyLangs: () => [POLICY_LANG],
		};
		const outcome = await doorUnderBlocker(await holdRows(), () =>
			sweepPhantomLangs({ langs: [PHANTOM_LANG], databases: [DATABASE] }, dependencies),
		);
		expect(outcome.error).toBeUndefined();
		expect(outcome.value?.swept).toEqual([]);
		expect(
			outcome.value?.errors.some((line) => line.includes('Lock wait timeout')),
			`the sweep's DELETE did not fail on its lock wait: ${JSON.stringify(outcome.value?.errors)}`,
		).toBe(true);
		const phantom = (await pool().unsafe(`SELECT count(*) AS n FROM \`${TABLE}\` WHERE lang = ?`, [
			PHANTOM_LANG,
		])) as { n: number | string }[];
		expect(Number(phantom[0]?.n)).toBe(1);
	}, 60_000);

	test('M1 — the media-index rebuild: its SELECT queued behind a pending ALTER is reported, markers kept', async () => {
		await resetTable();
		const base = mkdtempSync(join(tmpdir(), 'dedalo_zzlw_markers_'));
		overrideMediaIndexBaseForTests(base);
		try {
			const outcome = await doorUnderBlocker(await holdPendingAlter(), () =>
				rebuildMediaIndexStore(
					[{ database_name: DATABASE, table_name: TABLE, section_tipo: 'test3' }],
					undefined,
					{ boundMs: 5_000 },
				),
			);
			expect(outcome.error).toBeUndefined();
			expect(
				(outcome.value?.errors ?? []).some((line) => line.includes('Lock wait timeout')),
				`the rebuild's SELECT did not fail on its lock wait: ${JSON.stringify(outcome.value)}`,
			).toBe(true);
		} finally {
			overrideMediaIndexBaseForTests(null);
			rmSync(base, { recursive: true, force: true });
		}
	}, 60_000);
});

describe('the bound itself', () => {
	test('it merges into a statement’s own SET STATEMENT, runs, and never leaks to the pooled connection', async () => {
		await resetTable();
		const merged = boundSqlTargetStatement(
			`SET STATEMENT max_statement_time=5 FOR SELECT @@lock_wait_timeout AS l, @@innodb_lock_wait_timeout AS i, @@max_statement_time AS m FROM \`${TABLE}\` LIMIT 1`,
		);
		const [inside] = (await pool().unsafe(merged, [])) as {
			l: number | string;
			i: number | string;
			m: number | string;
		}[];
		expect([Number(inside?.l), Number(inside?.i), Number(inside?.m)]).toEqual([
			SQL_TARGET_LOCK_WAIT_S,
			SQL_TARGET_LOCK_WAIT_S,
			5,
		]);
		const connection = await pool().reserve();
		try {
			const [before] = (await connection.unsafe('SELECT @@lock_wait_timeout AS l', [])) as {
				l: number | string;
			}[];
			await connection.unsafe(boundSqlTargetStatement('SELECT 1'), []);
			const [after] = (await connection.unsafe('SELECT @@lock_wait_timeout AS l', [])) as {
				l: number | string;
			}[];
			expect(Number(after?.l)).toBe(Number(before?.l));
			expect(Number(after?.l)).not.toBe(SQL_TARGET_LOCK_WAIT_S);
		} finally {
			connection.release();
		}
	}, 60_000);

	test('the seam refuses an unusable bound', () => {
		expect(() => withSqlTargetLockWaitForTests(0, async () => undefined)).toThrow(
			'not a usable bound',
		);
	});
});
