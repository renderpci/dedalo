/**
 * ITEM 3.10a PART 1 — the derived-search-store boot self-provisioning probe
 * (src/core/db/db_assets.ts): expectedTriggerNames / inspectSearchStores /
 * SEARCH_STORE_BACKFILLS.
 *
 * Why this gate exists: ensureSearchStores runs on EVERY boot and its whole job
 * is to decide "is the schema already healthy?". Both failure directions are
 * expensive and silent — a false "needs DDL" re-runs the extension/table/
 * function/trigger/index passes on every restart, and a false "healthy" leaves
 * relation search failing loudly (requireRelationIndex) with no self-heal. The
 * decision hinges on a string derivation (`all_matrix` → suffix) that nothing
 * else in the tree checks, and on a backfill whose row filter MUST be the twin
 * of the sync trigger's or a backfilled store silently differs from a
 * trigger-maintained one.
 *
 * READ-ONLY: every query here is a SELECT. No scratch surface is needed and
 * nothing is written — the destructive halves (rebuild passes, TRUNCATE +
 * backfill) are deliberately NOT exercised.
 *
 * Not covered on purpose: the `storesNeedingBackfill === []` half of
 * ensureSearchStores step 2. On a populated database `if (any.length > 0)
 * continue;` short-circuits BEFORE the probe runs, so no probe regression can
 * be detected through that path — the probe is called directly instead.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	type AssetEntry,
	expectedTriggerNames,
	inspectSearchStores,
	SEARCH_STORE_BACKFILLS,
} from '../../src/core/db/db_assets.ts';
import definitions from '../../src/core/db/db_pg_definitions.json';
import { sql } from '../../src/core/db/postgres.ts';

const DB_ASSETS_PATH = join(import.meta.dir, '../../src/core/db/db_assets.ts');

/**
 * The WHERE predicates of a SELECT over the `jsonb_each`/`jsonb_array_elements`
 * expansion, normalized so the trigger's and the backfill's are comparable:
 * whitespace collapsed and the row aliases (m. / NEW. / OLD.) stripped, since
 * the trigger reads the NEW row and the backfill reads the table alias.
 */
function expansionWhereSet(sqlText: string): Set<string> {
	const tail = sqlText.slice(sqlText.lastIndexOf('jsonb_array_elements'));
	const match = /WHERE\s+([\s\S]*?)(?:;|$)/.exec(tail);
	const clause = match?.[1];
	if (clause === undefined) throw new Error('no WHERE found after the jsonb expansion');
	return new Set(
		clause
			.split(' AND ')
			.map((predicate) =>
				predicate
					.replaceAll(/\s+/g, ' ')
					.replaceAll(/\b(?:m|NEW|OLD)\./g, '')
					.trim(),
			)
			.filter((predicate) => predicate !== ''),
	);
}

describe('expectedTriggerNames (pure derivation)', () => {
	test('derives {table}{suffix} for EXISTING tables only, stripping the full all_matrix prefix', () => {
		const names = expectedTriggerNames(
			[
				{
					name: 'all_matrix_string_search_sync',
					tables: ['matrix_test', 'matrix_absent'],
					add: '',
					drop: '',
				},
			],
			new Set(['matrix_test']),
		);
		// matrix_absent is filtered out by `present`; matrix_test keeps the suffix
		// left after removing `all_matrix` — NOT after removing `all_`, which
		// would yield the nonsense identifier asserted against below.
		expect(names).toEqual(['matrix_test_string_search_sync']);
		expect(names).not.toContain('matrix_testmatrix_string_search_sync');
	});

	test('an entry with no tables, and an empty present set, both derive nothing', () => {
		expect(
			expectedTriggerNames(
				[{ name: 'all_matrix_string_search_sync', add: '', drop: '' }],
				new Set(['matrix_test']),
			),
		).toEqual([]);
		expect(
			expectedTriggerNames(
				[{ name: 'all_matrix_string_search_sync', tables: ['matrix_test'], add: '', drop: '' }],
				new Set(),
			),
		).toEqual([]);
	});

	test('the derived name EQUALS the identifier the entry`s own CREATE TRIGGER declares', () => {
		// This is what makes the derivation legitimate rather than a second
		// source of truth: probe name and created name are provably the same.
		const triggers = definitions.ar_trigger as AssetEntry[];
		let checked = 0;
		for (const { triggerEntry } of SEARCH_STORE_BACKFILLS) {
			const entry = triggers.find((candidate) => candidate.name === triggerEntry);
			if (entry === undefined) throw new Error(`missing trigger entry ${triggerEntry}`);
			const table = 'matrix_test';
			const created = /CREATE TRIGGER (\S+)/.exec(entry.add.replaceAll('{$table}', table))?.[1];
			if (created === undefined) throw new Error(`${triggerEntry} add has no CREATE TRIGGER`);
			const derived = expectedTriggerNames([{ ...entry, tables: [table] }], new Set([table]));
			expect(derived).toEqual([created]);
			checked++;
		}
		expect(checked).toBe(SEARCH_STORE_BACKFILLS.length);
		expect(checked).toBeGreaterThan(0); // anti-vacuity
	});
});

describe('inspectSearchStores (read-only DDL probe, live DB)', () => {
	test('a healthy install needs no DDL, and says so from a NON-EMPTY expectation', async () => {
		const inspection = await inspectSearchStores();
		// ANTI-VACUITY GUARD: without this the whole assertion is satisfied by
		// an empty expected list (0 === 0), which is exactly what a broken
		// derivation or a widened/emptied definitions file would produce.
		expect(inspection.expectedTriggers.length).toBeGreaterThan(0);
		expect(inspection.presentTriggerCount).toBe(inspection.expectedTriggers.length);
		expect(inspection.ddlNeeded).toBe(false);
		// both declared stores exist as public BASE TABLEs
		for (const store of inspection.storeTables) expect(inspection.present.has(store)).toBe(true);
		expect(inspection.storeTables).toEqual(SEARCH_STORE_BACKFILLS.map(({ store }) => store));
	});

	test('the probe queries are parameterised with the $1::text::jsonb bind and exclude internal triggers', () => {
		// NOTE (honest scope): dropping `table_schema = 'public'` would WIDEN
		// `present` and STILL yield ddlNeeded false, so behaviour cannot pin it.
		// Only these two are pinnable, and textually.
		const source = readFileSync(DB_ASSETS_PATH, 'utf-8');
		const body = source.split('export async function inspectSearchStores')[1] ?? '';
		const probe = body.split('\nexport ')[0];
		expect(probe).toContain('$1::text::jsonb');
		expect(probe).toContain('NOT tgisinternal');
	});
});

describe('SEARCH_STORE_BACKFILLS row filter — the trigger twin', () => {
	const stringStore = SEARCH_STORE_BACKFILLS[0] as (typeof SEARCH_STORE_BACKFILLS)[number];

	test('the store list is the two declared derived stores', () => {
		expect(SEARCH_STORE_BACKFILLS.map(({ store }) => store)).toEqual([
			'matrix_string_search',
			'matrix_relation_index',
		]);
	});

	test('probe(matrix_test) finds rows on the populated test database', async () => {
		const rows = (await sql.unsafe(stringStore.probe('matrix_test'), [])) as unknown[];
		expect(rows.length).toBe(1); // LIMIT 1 — presence, not a count
	});

	test('backfill WHERE ⊃ trigger WHERE, with the null guard as the ONLY difference', () => {
		// The two are NOT set-equal and must not be asserted as such: the backfill
		// scans a whole table so it guards `string IS NOT NULL` in the WHERE, while
		// the trigger expresses the same guard as an `IF … NEW.string IS NOT NULL`
		// around the INSERT. Containment + hard cardinality is the honest shape;
		// a normalizer loose enough to make them equal degenerates to ∅ === ∅.
		const fn = (definitions.ar_function as AssetEntry[]).find(
			(entry) => entry.name === 'matrix_string_search_sync',
		);
		expect(fn, 'missing matrix_string_search_sync function entry').toBeDefined();

		const triggerWhere = expansionWhereSet((fn as AssetEntry).add);
		const backfillWhere = expansionWhereSet(stringStore.insert('matrix_test'));

		expect(triggerWhere.size).toBe(3);
		expect(backfillWhere.size).toBe(4);
		for (const predicate of triggerWhere) expect(backfillWhere.has(predicate)).toBe(true);
		expect([...backfillWhere].filter((predicate) => !triggerWhere.has(predicate))).toEqual([
			'string IS NOT NULL',
		]);
		// literal membership: a normalizer that mangled a predicate into a
		// different-but-consistent token would still satisfy the set algebra above
		for (const predicate of [
			"jsonb_typeof(kv.value) = 'array'",
			"e->>'value' IS NOT NULL",
			"e->>'value' <> ''",
		]) {
			expect(triggerWhere.has(predicate)).toBe(true);
			expect(backfillWhere.has(predicate)).toBe(true);
		}
	});

	test('FIDELITY (primary): the backfill SELECT and the trigger-maintained store agree on matrix_test', async () => {
		// The behavioural twin check the textual one only approximates: what the
		// backfill WOULD insert for matrix_test vs what the triggers actually put
		// in the store for that table's section_tipo.
		const insertSql = stringStore.insert('matrix_test');
		const selectSql = insertSql.slice(insertSql.indexOf('SELECT'));
		const wouldInsert = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM (${selectSql}) AS q`,
			[],
		)) as { n: number }[];
		const stored = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix_string_search WHERE section_tipo = $1`,
			['test3'],
		)) as { n: number }[];

		expect(Number(wouldInsert[0]?.n)).toBeGreaterThan(0); // anti-vacuity: 0 === 0 proves nothing
		expect(Number(wouldInsert[0]?.n)).toBe(Number(stored[0]?.n));
	});
});

describe('ensureSearchStores rewire', () => {
	test('the inline DDL probe is GONE from ensureSearchStores — it delegates to inspectSearchStores', () => {
		const source = readFileSync(DB_ASSETS_PATH, 'utf-8');
		const body = (source.split('export async function ensureSearchStores')[1] ?? '').split(
			'\n/** One index dropped',
		)[0];
		expect(body).toContain('await inspectSearchStores()');
		// a second copy of any of these inside ensureSearchStores means the
		// extraction left a parallel source of truth behind
		expect(body).not.toContain('information_schema');
		expect(body).not.toContain('pg_trigger');
		expect(body).not.toContain('tgisinternal');
		expect(body).not.toContain('all_matrix');
		expect(source).toContain('export function expectedTriggerNames');
	});
});
