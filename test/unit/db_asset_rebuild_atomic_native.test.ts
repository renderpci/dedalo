/**
 * A DROP NEVER COMMITS WITHOUT ITS ADD (OPS-6/PERF-11 review, 2026-09-30).
 *
 * THE DEFECT. `rebuildTemplated` (db_assets.ts — rebuild_db_constraints,
 * rebuild_db_indexes, recreate_db_assets' constraint/trigger/index passes) ran
 * each (entry, table) as TWO autocommit statements: the DROP committed, then the
 * ADD ran on its own. PERF-11 moved these actions onto the maintenance pool,
 * whose connections carry a 5s startup `lock_timeout`, so an ADD queued behind
 * a writer's lock for 5s gives up — and the object the DROP removed stays gone:
 * the (section_id, section_tipo) unique key (duplicate record addresses become
 * writable), or the string-search / relation-index sync trigger (every later
 * write silently stops maintaining the derived store). The failure reached the
 * operator only as a warning string.
 *
 * THE LAW. Each (entry, table) pair is ONE transaction: a failed ADD — a lock
 * wait that timed out, or any other error — rolls the DROP back, and the old
 * object is still there. An INDEX pair builds the replacement FIRST, under a
 * temporary name, then drops the old one and renames in the same transaction:
 * during the build the table keeps serving reads through the old index (only
 * CREATE INDEX's SHARE lock is held — the naive drop-first transaction would
 * hold ACCESS EXCLUSIVE, blocking every reader, for the whole build).
 *
 * THE MEASUREMENT (outcomes, deterministic). A scratch table T carries a unique
 * constraint, a trigger and an index; each scratch entry's ADD ends with a read
 * of a blocker table B that this process holds ACCESS EXCLUSIVE, so the ADD's
 * lock wait is exactly the finding's — on the real maintenance pool (the door's
 * `withUnboundedStatements`), 5s, SQLSTATE 55P03:
 *   - held past 5s → all three pairs fail, and T STILL has its constraint, its
 *     trigger and its index with the OLD definition;
 *   - a non-lock failure (an ADD naming a missing column) → same outcome;
 *   - the index pair paused on B → a reader of T is NOT blocked; released →
 *     the index carries the NEW definition and no temporary name is left;
 *   - a stale index already holding the temporary name → the rebuild FAILS
 *     (never swaps the stale one in), the old index intact;
 *   - an index name at the 63-character limit → rebuilds (the temporary name is
 *     truncated; untruncated, PostgreSQL would fold it onto the real name).
 * Control: the REAL definitions through the REAL door (rebuild_db_constraints,
 * rebuild_db_indexes on three tables incl. the multi-statement adds) and the
 * trigger pass finish error-free with every declared object present.
 *
 * SURFACES. Lane SUITE database only (assertTestDatabase first). Scratch:
 * tables `dedalo_ts_test_asset_<pid>` / `…_blk` and function `…_noop`, dropped
 * in afterAll. The control rebuilds the lane's own declared constraints,
 * triggers and indexes (their normal operation).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchWidgetRequest } from '../../src/core/area_maintenance/widgets/registry.ts';
import { type AssetEntry, rebuildTemplated, rebuildTriggers } from '../../src/core/db/db_assets.ts';
import definitions from '../../src/core/db/db_pg_definitions.json';
import { sql, withTransaction, withUnboundedStatements } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const PID = process.pid;
const T = `dedalo_ts_test_asset_${PID}`;
const B = `${T}_blk`;
const NOOP = `${T}_noop`;
const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

/** A read of B: waits on the ACCESS EXCLUSIVE this process holds there. */
const WAIT_ON_BLOCKER = `SELECT count(*) FROM ${B}`;

const constraintEntry = (addTail: string): AssetEntry => ({
	name: 'zz_constraint',
	tables: [T],
	drop: 'ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$table}_k',
	add: `ALTER TABLE {$table} ADD CONSTRAINT {$table}_k UNIQUE (section_id, section_tipo);${addTail}`,
});
const triggerEntry = (addTail: string): AssetEntry => ({
	name: 'zz_trigger',
	tables: [T],
	drop: 'DROP TRIGGER IF EXISTS {$table}_sync ON {$table}',
	add: `CREATE TRIGGER {$table}_sync AFTER INSERT ON {$table} FOR EACH ROW EXECUTE FUNCTION ${NOOP}();${addTail}`,
});
const indexEntry = (addTail: string): AssetEntry => ({
	name: 'zz_index',
	tables: [T],
	drop: 'DROP INDEX IF EXISTS {$table}_idx',
	add: `CREATE INDEX IF NOT EXISTS {$table}_idx ON {$table} USING btree (section_tipo, section_id);${addTail}`,
});

async function hasConstraint(): Promise<boolean> {
	const rows = (await sql.unsafe(
		`SELECT 1 FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2`,
		[T, `${T}_k`],
	)) as unknown[];
	return rows.length === 1;
}

async function hasTrigger(): Promise<boolean> {
	const rows = (await sql.unsafe(
		`SELECT 1 FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname = $2 AND NOT tgisinternal`,
		[T, `${T}_sync`],
	)) as unknown[];
	return rows.length === 1;
}

/** The index definitions on T named like its test index (incl. any temporary name). */
async function indexDefinitions(): Promise<Record<string, string>> {
	const rows = (await sql.unsafe(
		`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1 AND indexname LIKE $2`,
		[T, `${T}_idx%`],
	)) as { indexname: string; indexdef: string }[];
	return Object.fromEntries(rows.map((row) => [row.indexname, row.indexdef]));
}

async function resetScratch(): Promise<void> {
	await sql.unsafe(`DROP TABLE IF EXISTS ${T}`, []);
	await sql.unsafe(`CREATE TABLE ${T} (section_id integer, section_tipo text)`, []);
	await sql.unsafe(`INSERT INTO ${T} VALUES (1, 'test3'), (2, 'test3')`, []);
	await sql.unsafe(`ALTER TABLE ${T} ADD CONSTRAINT ${T}_k UNIQUE (section_id, section_tipo)`, []);
	await sql.unsafe(
		`CREATE TRIGGER ${T}_sync AFTER INSERT ON ${T} FOR EACH ROW EXECUTE FUNCTION ${NOOP}()`,
		[],
	);
	await sql.unsafe(`CREATE INDEX ${T}_idx ON ${T} USING btree (section_id)`, []);
}

/**
 * Hold ACCESS EXCLUSIVE on B until `release()` — on its own transaction (the
 * request pool; the rebuild under test runs on the maintenance pool).
 */
async function holdBlocker(): Promise<{ release: () => void; done: Promise<void> }> {
	let release = () => {};
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	let locked = () => {};
	const isLocked = new Promise<void>((resolve) => {
		locked = resolve;
	});
	const done = withTransaction(async () => {
		await sql.unsafe(`LOCK TABLE ${B} IN ACCESS EXCLUSIVE MODE`, []);
		locked();
		await released;
	});
	await isLocked;
	return { release, done };
}

/** Wait until some backend is queued on a lock while reading B. */
async function waitUntilQueuedOnBlocker(): Promise<void> {
	const deadline = Date.now() + 4000;
	while (Date.now() < deadline) {
		const rows = (await sql.unsafe(
			`SELECT 1 FROM pg_stat_activity
			 WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE $1`,
			[`%count(*) FROM ${B}%`],
		)) as unknown[];
		if (rows.length > 0) return;
		await Bun.sleep(50);
	}
	throw new Error('the rebuild never queued on the blocker table');
}

beforeAll(async () => {
	await assertTestDatabase('db_asset_rebuild_atomic_native');
	await sql.unsafe(
		`CREATE OR REPLACE FUNCTION ${NOOP}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`,
		[],
	);
	await sql.unsafe(`DROP TABLE IF EXISTS ${B}`, []);
	await sql.unsafe(`CREATE TABLE ${B} (id integer)`, []);
});

afterAll(async () => {
	await sql.unsafe(`DROP TABLE IF EXISTS ${T}`, []);
	await sql.unsafe(`DROP TABLE IF EXISTS ${B}`, []);
	await sql.unsafe(`DROP FUNCTION IF EXISTS ${NOOP}()`, []);
});

describe('asset rebuild: a drop never commits without its add', () => {
	test('an ADD whose lock wait times out on the maintenance pool leaves constraint, trigger and index in place', async () => {
		await resetScratch();
		const blocker = await holdBlocker();
		let response: Awaited<ReturnType<typeof rebuildTemplated>>;
		try {
			response = await withUnboundedStatements(() =>
				rebuildTemplated([
					constraintEntry(` ${WAIT_ON_BLOCKER};`),
					triggerEntry(` ${WAIT_ON_BLOCKER};`),
					indexEntry(` ${WAIT_ON_BLOCKER};`),
				]),
			);
		} finally {
			blocker.release();
			await blocker.done;
		}
		// Each pair failed on the 5s lock bound (55P03 — "lock timeout").
		expect(response.errors).toHaveLength(3);
		for (const error of response.errors) expect(String(error)).toMatch(/lock timeout/i);
		// …and rolled back: every object the DROP removed is still there.
		expect(await hasConstraint()).toBe(true);
		expect(await hasTrigger()).toBe(true);
		const indexes = await indexDefinitions();
		expect(Object.keys(indexes)).toEqual([`${T}_idx`]);
		expect(indexes[`${T}_idx`]).toMatch(/btree \(section_id\)$/);
	}, 60_000);

	test('an ADD that fails for any other reason rolls its DROP back too', async () => {
		await resetScratch();
		const broken = (entry: AssetEntry): AssetEntry => ({
			...entry,
			add: entry.add.replace(/\(section_(id|tipo), section_(id|tipo)\)/, '(no_such_column)'),
		});
		const response = await withUnboundedStatements(() =>
			rebuildTemplated([broken(constraintEntry('')), broken(indexEntry(''))]),
		);
		expect(response.errors).toHaveLength(2);
		expect(await hasConstraint()).toBe(true);
		const indexes = await indexDefinitions();
		expect(Object.keys(indexes)).toEqual([`${T}_idx`]);
		expect(indexes[`${T}_idx`]).toMatch(/btree \(section_id\)$/);
	});

	test('an index rebuild keeps the table readable while it builds, then swaps the new definition in', async () => {
		await resetScratch();
		const blocker = await holdBlocker();
		const rebuilding = withUnboundedStatements(() =>
			rebuildTemplated([indexEntry(` ${WAIT_ON_BLOCKER};`)]),
		);
		let readVerdict: 'read' | 'blocked';
		try {
			await waitUntilQueuedOnBlocker();
			// The build is in progress (paused on B). A reader of T must get through.
			readVerdict = await Promise.race([
				sql.unsafe(`SELECT count(*) FROM ${T}`, []).then(() => 'read' as const),
				Bun.sleep(1500).then(() => 'blocked' as const),
			]);
		} finally {
			blocker.release();
			await blocker.done;
		}
		const response = await rebuilding;
		expect(readVerdict).toBe('read');
		expect(response.errors).toEqual([]);
		const indexes = await indexDefinitions();
		expect(Object.keys(indexes)).toEqual([`${T}_idx`]);
		expect(indexes[`${T}_idx`]).toMatch(/btree \(section_tipo, section_id\)$/);
	}, 30_000);

	test('a stale temporary name fails the rebuild loudly instead of being swapped in', async () => {
		await resetScratch();
		await sql.unsafe(`CREATE INDEX ${T}_idx_rebuild ON ${T} USING btree (section_tipo)`, []);
		const response = await withUnboundedStatements(() => rebuildTemplated([indexEntry('')]));
		expect(response.errors).toHaveLength(1);
		const indexes = await indexDefinitions();
		expect(indexes[`${T}_idx`]).toMatch(/btree \(section_id\)$/);
		expect(indexes[`${T}_idx_rebuild`]).toMatch(/btree \(section_tipo\)$/);
	});

	test('an index name at the 63-character identifier limit rebuilds (its temporary name is truncated, never clashing)', async () => {
		await resetScratch();
		const longName = `${T}_idx_${'x'.repeat(63)}`.slice(0, 63);
		await sql.unsafe(`CREATE INDEX ${longName} ON ${T} USING btree (section_id)`, []);
		const response = await withUnboundedStatements(() =>
			rebuildTemplated([
				{
					name: 'zz_long_index',
					tables: [T],
					drop: `DROP INDEX IF EXISTS ${longName}`,
					add: `CREATE INDEX IF NOT EXISTS ${longName} ON {$table} USING btree (section_tipo, section_id)`,
				},
			]),
		);
		expect(response.errors).toEqual([]);
		const indexes = await indexDefinitions();
		expect(indexes[longName]).toMatch(/btree \(section_tipo, section_id\)$/);
		expect(Object.keys(indexes).sort()).toEqual([`${T}_idx`, longName].sort());
	});

	test('control: the real definitions rebuild error-free through the door, every object present', async () => {
		const call = (action: string, options: Record<string, unknown> = {}) =>
			dispatchWidgetRequest(
				ADMIN,
				{ model: 'database_info', action },
				options,
			) as unknown as Promise<Record<string, unknown>>;
		const existing = new Set(
			(
				(await sql.unsafe(
					`SELECT table_name FROM information_schema.tables
					 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
					[],
				)) as { table_name: string }[]
			).map((row) => row.table_name),
		);

		// The only accepted errors: declared tables this install does not have.
		const unexpected = (errors: unknown) =>
			((errors as unknown[] | undefined) ?? []).filter(
				(error) => !/does not exist\. Ignored/.test(String(error)),
			);
		const constraints = await call('rebuild_db_constraints');
		expect(unexpected(constraints.errors)).toEqual([]);
		const constraintRows = (await sql.unsafe(
			`SELECT conrelid::regclass::text AS t, conname FROM pg_constraint WHERE contype = 'u'`,
			[],
		)) as { t: string; conname: string }[];
		const constraintNames = new Set(constraintRows.map((row) => `${row.t}.${row.conname}`));
		for (const entry of definitions.ar_constraint as AssetEntry[]) {
			for (const table of (entry.tables ?? []).filter((name) => existing.has(name))) {
				const name = entry.add.match(/ADD CONSTRAINT (\S+)/)?.[1]?.replaceAll('{$table}', table);
				expect(constraintNames.has(`${table}.${name}`)).toBe(true);
			}
		}

		const triggers = await withUnboundedStatements(() => rebuildTriggers());
		expect(unexpected(triggers.errors)).toEqual([]);
		const triggerRows = (await sql.unsafe(
			`SELECT tgrelid::regclass::text AS t, tgname FROM pg_trigger WHERE NOT tgisinternal`,
			[],
		)) as { t: string; tgname: string }[];
		const triggerNames = new Set(triggerRows.map((row) => `${row.t}.${row.tgname}`));
		for (const entry of definitions.ar_trigger as AssetEntry[]) {
			for (const table of (entry.tables ?? []).filter((name) => existing.has(name))) {
				const name = entry.add.match(/CREATE TRIGGER (\S+)/)?.[1]?.replaceAll('{$table}', table);
				expect(triggerNames.has(`${table}.${name}`)).toBe(true);
			}
		}

		const tables = ['matrix_time_machine', 'matrix_langs', 'matrix_test'];
		const indexes = await call('rebuild_db_indexes', { tables });
		expect(unexpected(indexes.errors)).toEqual([]);
		const indexRows = (await sql.unsafe(
			`SELECT tablename, indexname FROM pg_indexes WHERE tablename IN ($1, $2, $3)`,
			tables,
		)) as { tablename: string; indexname: string }[];
		const indexNames = new Set(indexRows.map((row) => `${row.tablename}.${row.indexname}`));
		for (const entry of definitions.ar_index as AssetEntry[]) {
			if (entry.add.trim() === '') continue;
			for (const table of (entry.tables ?? []).filter((name) => tables.includes(name))) {
				const name = entry.add
					.match(/CREATE INDEX IF NOT EXISTS (\S+)/)?.[1]
					?.replaceAll('{$table}', table);
				expect(indexNames.has(`${table}.${name}`)).toBe(true);
			}
		}
		// No temporary build name survives a rebuild.
		expect([...indexNames].filter((name) => name.endsWith('_rebuild'))).toEqual([]);
	}, 120_000);
});
