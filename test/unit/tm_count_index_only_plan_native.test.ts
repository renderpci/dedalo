/**
 * THE dd15 HISTORY COUNT STAYS INDEX-ONLY (read_tm.ts tmHistoryCountSql;
 * migration 0011_tm_role_hidden_index.sql; WC-2026-09-27-bulk-revert-undo-log).
 *
 * THE DEFECT THIS PINS. Once every history reader narrowed with
 * `tm_role IS NULL` (0010), the bare dd15 COUNT — every list open pays it at
 * TM count TTL 0 — could no longer be index-only: `tm_role` is in no full
 * index, so the count read the heap. Measured on 29.45M rows: 3,072 ms
 * (Parallel Index Only Scan) became 15,020 ms (Parallel Seq Scan + Nested Loop
 * Anti Join), planned from a 61,356-row estimate where 29.27M matched, because
 * the new column had no statistics.
 *
 * OUTCOMES PINNED (on the real suite table, through the REAL artefacts — the
 * migration file as the boot runner applies it, and the exact SQL the engine
 * emits):
 *   - the migration leaves `tm_role` WITH statistics and the partial index
 *     present with its predicate;
 *   - the emitted count is EXACT: equal to the heap count of visible history;
 *   - its PLAN never filters tm_role on fetched rows: both halves are served
 *     by covering indexes (so index-only wherever the visibility map allows),
 *     the hidden half on the partial index whose predicate implies its test.
 *     Seq and bitmap paths are disabled for the EXPLAIN (a suite-sized table
 *     would pick a seq scan on cost alone), so the question is whether an
 *     index path that never re-reads tm_role EXISTS — which a `tm_role IS
 *     NULL` count can never have (`Filter: (tm_role IS NULL)`, measured).
 *
 * AND the deep-page late row lookup (tmLatePageSql, migration 0012): its id
 * walk carries `tm_role IS NULL` too, and the visible partial must serve it
 * without re-reading tm_role (planned on a scratch table holding that index
 * alone — the pick on the real suite table is a cost choice, not an outcome).
 *
 * Both migrations are ONLINE (install/db/online_migration.ts): applied here as
 * the online runner applies them — statement by statement, outside any
 * transaction — never as one transactional text (CONCURRENTLY refuses that).
 *
 * Writes nothing but the migrations' own idempotent indexes + ANALYZE on the
 * suite database (assertTestDatabase first).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isOnlineMigration, parseOnlineMigration } from '../../install/db/online_migration.ts';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { ensureTmHistoryReady, withTmHistory } from '../../src/core/db/record_generation.ts';
import { tmHistoryCountSql, tmLatePageSql } from '../../src/core/resolve/read_tm.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const MIGRATIONS = join(import.meta.dir, '..', '..', 'install', 'db', 'migrations');
const MIGRATION = join(MIGRATIONS, '0011_tm_role_hidden_index.sql');
const VISIBLE_MIGRATION = join(MIGRATIONS, '0012_tm_history_visible_index.sql');
const HIDDEN_INDEX = 'matrix_time_machine_tm_role_hidden_idx';
const VISIBLE_INDEX = 'matrix_time_machine_history_visible_idx';
/** A scratch table for the retargeted migration (dropped by the test itself). */
const SCRATCH = 'dedalo_ts_test_tm_role_stats';
/** A scratch copy of the TM columns carrying ONLY migration 0012's index (dropped by the test itself). */
const WALK_SCRATCH = 'dedalo_ts_test_tm_visible_walk';
/** An OFFSET past any suite table: the deep-page regime, where no LIMIT cuts a walk short. */
const DEEP_OFFSET = 100_000_000;

interface PlanNode {
	'Node Type': string;
	'Relation Name'?: string;
	'Index Name'?: string;
	Filter?: string;
	Plans?: PlanNode[];
}

/** A scan node, readable in a failure message. */
function nodeLabel(node: PlanNode): string {
	return `${node['Node Type']} ${node['Index Name'] ?? ''} ${node.Filter ?? ''}`.trim();
}

/** Every scan node on `relation` (default matrix_time_machine) in a plan tree. */
function tmScans(
	node: PlanNode,
	relation = 'matrix_time_machine',
	out: PlanNode[] = [],
): PlanNode[] {
	if (node['Relation Name'] === relation) out.push(node);
	for (const child of node.Plans ?? []) tmScans(child, relation, out);
	return out;
}

async function planOf(statement: string, params: unknown[] = []): Promise<PlanNode> {
	return await withTransaction(async () => {
		await sql.unsafe('SET LOCAL enable_seqscan = off', []);
		await sql.unsafe('SET LOCAL enable_bitmapscan = off', []);
		const rows = (await sql.unsafe(`EXPLAIN (FORMAT JSON) ${statement}`, params)) as {
			'QUERY PLAN': { Plan: PlanNode }[] | string;
		}[];
		const raw = rows[0]?.['QUERY PLAN'];
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
		return (parsed as { Plan: PlanNode }[])[0]?.Plan as PlanNode;
	});
}

/**
 * An ONLINE migration's text as the online runner applies it
 * (install/db/migrate.ts runOnlineMigrations): parsed by the SAME grammar
 * (a file outside it throws here too), each statement on its own, OUTSIDE any
 * transaction — `CREATE INDEX CONCURRENTLY` refuses one.
 */
async function applyOnline(file: string, text: string): Promise<void> {
	expect(isOnlineMigration(text)).toBe(true);
	for (const statement of parseOnlineMigration(file, text)) {
		await sql.unsafe(statement.sql, []);
	}
}

beforeAll(async () => {
	await assertTestDatabase('tm_count_index_only_plan_native');
	await ensureTmHistoryReady();
	for (const file of [MIGRATION, VISIBLE_MIGRATION]) {
		await applyOnline(file, readFileSync(file, 'utf8'));
	}
	// THE PRODUCTION REGIME, not the suite's churn. A 29M-row TM is mostly
	// static: its visibility map is set, so an index-only scan costs what it is.
	// Other gates leave the suite TM freshly written (VM unset, statistics of a
	// 30-row table): the planner then costs every index-only tuple as a heap
	// fetch and prefers ANY small index plus a per-row `tm_role` filter —
	// measured 2026-09-27 (section_id_idx + Filter tm_role IS NULL, 56 rows),
	// a plan no production table picks. VACUUM (ANALYZE) restores the regime the
	// plan questions below are about; it changes no row.
	await sql.unsafe('VACUUM (ANALYZE) matrix_time_machine', []);
}, 120_000);

describe('the dd15 history count (tmHistoryCountSql)', () => {
	test('migration 0011 leaves tm_role WITH statistics and the partial index in place', async () => {
		// The migration's own text, RETARGETED at a fresh scratch table (a table
		// that has been analyzed keeps its statistics, so only a fresh one can
		// show that the file itself produces them).
		await sql.unsafe(`DROP TABLE IF EXISTS "${SCRATCH}"`, []);
		await sql.unsafe(
			`CREATE TABLE "${SCRATCH}" (id serial PRIMARY KEY, section_tipo varchar, section_id integer, tm_role smallint)`,
			[],
		);
		try {
			await sql.unsafe(
				`INSERT INTO "${SCRATCH}" (section_tipo, section_id, tm_role)
				 SELECT 'test3', g, CASE WHEN g % 50 = 0 THEN 1 END FROM generate_series(1, 500) g`,
				[],
			);
			const text = readFileSync(MIGRATION, 'utf8').replaceAll('matrix_time_machine', SCRATCH);
			await applyOnline(MIGRATION, text);
			const rows = (await sql.unsafe(
				`SELECT (SELECT COUNT(*) FROM pg_stats
				          WHERE tablename = $1 AND attname = 'tm_role')::int AS stats,
				        (SELECT indexdef FROM pg_indexes WHERE tablename = $1 AND indexdef LIKE '%WHERE%') AS indexdef`,
				[SCRATCH],
			)) as { stats: number; indexdef: string | null }[];
			expect(rows[0]?.stats).toBe(1);
			expect(rows[0]?.indexdef ?? '').toContain(
				'(section_tipo, section_id DESC, id DESC) WHERE (tm_role IS NOT NULL)',
			);
		} finally {
			await sql.unsafe(`DROP TABLE IF EXISTS "${SCRATCH}"`, []);
		}
		// ...and on the real table, applied in beforeAll.
		const [real] = (await sql.unsafe(
			'SELECT COUNT(*)::int AS c FROM pg_indexes WHERE indexname = $1',
			[HIDDEN_INDEX],
		)) as { c: number }[];
		expect(real?.c).toBe(1);
	});

	test('EXACT: total − hidden equals the visible-history heap count', async () => {
		for (const whereSql of ['true', "tipo = 'dd15'", 'section_id > 0']) {
			const [emitted] = (await sql.unsafe(tmHistoryCountSql(whereSql), [])) as { c: number }[];
			const [heap] = (await sql.unsafe(
				`SELECT COUNT(*)::int AS c FROM matrix_time_machine WHERE ${withTmHistory(whereSql)}`,
				[],
			)) as { c: number }[];
			expect(Number(emitted?.c)).toBe(Number(heap?.c));
		}
	});

	test('the bare count never evaluates tm_role from the heap: both halves are index-served', async () => {
		const scans = tmScans(await planOf(tmHistoryCountSql('true')));
		// No scan filters tm_role on fetched rows — the thing that took the count
		// off its index-only path. The visible total carries no tm_role test at
		// all, and the hidden half's `tm_role IS NOT NULL` is IMPLIED by the
		// partial index's predicate, so it is never re-checked per row.
		expect(scans.filter((scan) => /tm_role/.test(scan.Filter ?? '')).map(nodeLabel)).toEqual([]);
		// Every scan is an index path whose columns cover the statement, so it is
		// index-only wherever the visibility map allows (which of plain index /
		// index-only a small, freshly written suite table picks swings with its
		// visibility map — measured; `enable_indexscan = off` would disable both).
		expect(
			scans.filter((scan) => !/^Index (Only )?Scan$/.test(scan['Node Type'])).map(nodeLabel),
		).toEqual([]);
		// FLOOR: both halves are in the plan (an empty list passes vacuously).
		expect(scans.length).toBeGreaterThanOrEqual(2);
		expect(scans.some((scan) => scan['Index Name'] === HIDDEN_INDEX)).toBe(true);
	});
});

describe('the dd15 deep-page late row lookup (tmLatePageSql)', () => {
	test('its id walk never evaluates tm_role from the heap: the visible partial serves it', async () => {
		// The walk carries withTmHistory's `tm_role IS NULL`, in no FULL index:
		// measured 8.9-10.0 s (Parallel Seq Scan + external sort) vs 4.1 s
		// index-only at OFFSET 5M on 29.06M rows. On the partial index whose
		// predicate it implies, no scan re-reads tm_role.
		//
		// THE QUESTION IS WHETHER THAT PATH EXISTS, never which path the planner
		// picks (review 2026-09-28). On the real suite table the pick is a COST
		// choice between correct paths that swings with table size and statistics:
		// on a few dozen rows the PK walk or section_id_idx plus a per-row tm_role
		// filter is the cheap plan, for the bare browse and a section-scoped list
		// alike (measured 3/3 red on a correct engine). So the walk is planned on
		// a scratch table with the TM's COLUMNS and migration 0012's index ALONE
		// (its own text, retargeted, applied as the online runner applies it), seq
		// and bitmap paths off: an index path that never re-reads tm_role is then
		// the only cheap one, and a missing or mis-predicated partial leaves a
		// filtered scan the gate reddens on. The OFFSET is the deep regime by
		// construction (beyond any table: no LIMIT cuts the walk short).
		await sql.unsafe(`DROP TABLE IF EXISTS "${WALK_SCRATCH}"`, []);
		await sql.unsafe(`CREATE TABLE "${WALK_SCRATCH}" (LIKE matrix_time_machine)`, []);
		try {
			await sql.unsafe(
				`INSERT INTO "${WALK_SCRATCH}" (id, section_tipo, section_id, tipo, lang, tm_role)
				 SELECT g, 'test3', g % 97, 'test52', 'lg-spa', CASE WHEN g % 50 = 0 THEN 1 END
				 FROM generate_series(1, 2000) g`,
				[],
			);
			const text = readFileSync(VISIBLE_MIGRATION, 'utf8').replaceAll(
				'matrix_time_machine',
				WALK_SCRATCH,
			);
			await applyOnline(VISIBLE_MIGRATION, text);
			await sql.unsafe(`VACUUM (ANALYZE) "${WALK_SCRATCH}"`, []);
			const partial = VISIBLE_INDEX.replace('matrix_time_machine', WALK_SCRATCH);
			for (const whereSql of ['true', "section_tipo = 'test3'"]) {
				const statement = tmLatePageSql(whereSql, 'DESC', 2).replaceAll(
					'matrix_time_machine',
					WALK_SCRATCH,
				);
				const scans = tmScans(await planOf(statement, [10, DEEP_OFFSET]), WALK_SCRATCH);
				expect(scans.filter((scan) => /tm_role/.test(scan.Filter ?? '')).map(nodeLabel)).toEqual(
					[],
				);
				// FLOOR: the walk is on the visible partial (an empty list passes
				// vacuously), as an index path — index-only wherever the visibility map
				// allows.
				const walk = scans.filter((scan) => scan['Index Name'] === partial);
				expect(walk.map((scan) => /^Index (Only )?Scan$/.test(scan['Node Type']))).toEqual([true]);
			}
		} finally {
			await sql.unsafe(`DROP TABLE IF EXISTS "${WALK_SCRATCH}"`, []);
		}
	});

	test('EXACT: the page equals the plain visible-history page', async () => {
		const [late, plain] = await Promise.all([
			sql.unsafe(tmLatePageSql('true', 'DESC', 2), [5, 3]) as Promise<{ id: number }[]>,
			sql.unsafe(
				`SELECT id FROM matrix_time_machine WHERE ${withTmHistory('true')} ORDER BY id DESC LIMIT 5 OFFSET 3`,
				[],
			) as Promise<{ id: number }[]>,
		]);
		expect(plain.length).toBeGreaterThan(0); // FLOOR
		expect(late.map((row) => Number(row.id))).toEqual(plain.map((row) => Number(row.id)));
	});
});
