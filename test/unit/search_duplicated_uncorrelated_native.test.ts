/**
 * THE DUPLICATED-VALUES SEARCH ('!!') IS ANSWERED ONCE, NOT PER ROW (PERF-07).
 *
 * The PHP shape this replaced was a CORRELATED `EXISTS` whose inner FROM
 * cross-joined the WHOLE matrix table with TWO `jsonb_path_query` calls and was
 * re-executed for every outer row — O(n^2) jsonpath evaluations, which on a
 * museum-scale section is not slow but unfinishable. The duplicate set does not
 * depend on the outer row at all, so it is grouped ONCE.
 *
 * What this gate pins:
 *  - the ANSWER is unchanged: exactly the records sharing a value with another
 *    record of the same section, and only those;
 *  - the answer is SECTION-EXACT by tuple — a duplicate pair in ANOTHER tipo of
 *    the same physical table must not drag a same-numbered record in;
 *  - the shape is UNCORRELATED, measured on the PLAN (no per-row SubPlan), not
 *    on the SQL spelling;
 *  - the json twin carries the same shape (it had the identical defect).
 *
 * SITUATION: built here on the generic `test` TLD's scratch matrix table, at
 * ids this file owns, and torn down. The values are deliberately unique to this
 * gate so no ambient playground row can join a group.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { buildJsonFragment } from '../../src/core/search/builders/builder_json.ts';
import { buildStringFragment } from '../../src/core/search/builders/builder_string.ts';
import type { BuilderContext, Fragment } from '../../src/core/search/builders/types.ts';

const TABLE = 'matrix_test';
const SECTION = 'test3';
/** A second tipo in the SAME table — the cross-tipo contamination probe. */
const OTHER_SECTION = 'test2827';
const COMPONENT = 'test45';
const LANG = 'lg-eng';

/** ids this gate owns, scratch band. */
const DUP_A = 999941;
const DUP_B = 999942;
const SOLO = 999943;
/** Same section_id as DUP_A, another tipo, its own duplicate pair. */
const OTHER_A = 999941;
const OTHER_B = 999944;

const SHARED_VALUE = 'zzdup shared marker alpha';
const SOLO_VALUE = 'zzdup unique marker beta';
const OTHER_VALUE = 'zzdup other tipo marker gamma';

function stringColumn(value: string): string {
	return JSON.stringify({ [COMPONENT]: [{ id: 1, lang: LANG, value }] });
}

async function insert(sectionTipo: string, sectionId: number, value: string): Promise<void> {
	await sql.unsafe(
		`INSERT INTO ${TABLE} (section_tipo, section_id, string) VALUES ($1, $2, $3::text::jsonb)`,
		[sectionTipo, sectionId, stringColumn(value)],
	);
}

function context(overrides: Partial<BuilderContext> = {}): BuilderContext {
	return {
		alias: 'm',
		column: 'string',
		tipo: COMPONENT,
		sectionTipo: SECTION,
		table: TABLE,
		lang: LANG,
		translatable: true,
		model: 'component_input_text',
		...overrides,
	};
}

function sentenceOf(result: unknown): Fragment {
	expect((result as Fragment).kind).toBe('fragment');
	return result as Fragment;
}

/** Run the '!!' predicate over this gate's own ids and return the matches. */
async function duplicatedIds(fragment: Fragment, sectionTipo: string): Promise<number[]> {
	let sentence = fragment.sentence;
	const params: unknown[] = [sectionTipo];
	for (const [token, value] of Object.entries(fragment.tokenValues)) {
		params.push(value);
		sentence = sentence.replaceAll(token, `$${params.length}`);
	}
	const rows = (await sql.unsafe(
		`SELECT m.section_id FROM ${TABLE} AS m WHERE m.section_tipo = $1 ` +
			`AND m.section_id BETWEEN ${SOLO - 10} AND ${SOLO + 10} AND (${sentence}) ORDER BY 1`,
		params as (string | number | null)[],
	)) as { section_id: number }[];
	return rows.map((row) => Number(row.section_id));
}

async function sweep(): Promise<void> {
	await sql.unsafe(
		`DELETE FROM ${TABLE} WHERE section_id BETWEEN $1 AND $2 AND section_tipo = ANY($3::text[])`,
		[SOLO - 10, SOLO + 10, `{${SECTION},${OTHER_SECTION}}`],
	);
}

beforeAll(async () => {
	await sweep();
	await insert(SECTION, DUP_A, SHARED_VALUE);
	await insert(SECTION, DUP_B, SHARED_VALUE);
	await insert(SECTION, SOLO, SOLO_VALUE);
	await insert(OTHER_SECTION, OTHER_A, OTHER_VALUE);
	await insert(OTHER_SECTION, OTHER_B, OTHER_VALUE);
});

afterAll(async () => {
	await sweep();
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM ${TABLE} WHERE section_id BETWEEN $1 AND $2`,
		[SOLO - 10, SOLO + 10],
	)) as { n: number }[];
	expect(rows[0]?.n).toBe(0);
});

describe("'!!' duplicated values — the answer", () => {
	test('the situation is really there (a vacuous empty-vs-empty cannot pass)', async () => {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM ${TABLE} WHERE section_id BETWEEN $1 AND $2`,
			[SOLO - 10, SOLO + 10],
		)) as { n: number }[];
		expect(rows[0]?.n).toBe(5);
	});

	test('exactly the records sharing a value — the solo one is NOT a duplicate', async () => {
		const built = sentenceOf(buildStringFragment('!!', null, false, context()));
		expect(await duplicatedIds(built, SECTION)).toEqual([DUP_A, DUP_B]);
	});

	test('SECTION-EXACT: another tipo’s duplicate pair cannot drag a record in', async () => {
		// OTHER_A shares its section_id with DUP_A and its VALUE with OTHER_B, in
		// the same physical table. A bare `section_id IN (…)` membership test
		// would have made this record a duplicate of itself across tipos.
		const built = sentenceOf(buildStringFragment('!!', null, false, context()));
		const inOther = await duplicatedIds(built, OTHER_SECTION);
		expect(inOther).toEqual([OTHER_A, OTHER_B]);
		// and the string sentence really asks by TUPLE
		expect(built.sentence).toContain('(m.section_tipo, m.section_id) IN (');
	});

	test('LANG-EXACT: a value that only matches in another lang is not a duplicate', async () => {
		// Same value text, a different lang on one of the two records: under the
		// lang-scoped jsonpath they are not the same entry.
		await sql.unsafe(
			`UPDATE ${TABLE} SET string = $1::text::jsonb WHERE section_tipo = $2 AND section_id = $3`,
			[
				JSON.stringify({ [COMPONENT]: [{ id: 1, lang: 'lg-spa', value: SHARED_VALUE }] }),
				SECTION,
				DUP_B,
			],
		);
		const scoped = sentenceOf(buildStringFragment('!!', null, false, context()));
		// CORPUS FLOOR for the emptiness below: the two records are still there,
		// still carry the same value text, and are still visible to a lang-blind
		// scan — so `[]` measures the lang scoping and not an empty table.
		const scanned = await duplicatedIds(
			sentenceOf(buildStringFragment('!!', null, false, context({ lang: 'all' }))),
			SECTION,
		);
		expect(scanned.length).toBeGreaterThan(1);
		expect(await duplicatedIds(scoped, SECTION)).toEqual([]);
		// lang 'all' is lang-blind and sees the pair again
		const all = sentenceOf(buildStringFragment('!!', null, false, context({ lang: 'all' })));
		expect(await duplicatedIds(all, SECTION)).toEqual([DUP_A, DUP_B]);
		// restore the fixture for any later leg
		await sql.unsafe(
			`UPDATE ${TABLE} SET string = $1::text::jsonb WHERE section_tipo = $2 AND section_id = $3`,
			[stringColumn(SHARED_VALUE), SECTION, DUP_B],
		);
	});

	test('a VALUELESS entry is not everybody’s duplicate', async () => {
		// The retired correlated shape compared `f_unaccent(a) = f_unaccent(b)`,
		// and NULL never equals NULL, so entries with no `value` key could not
		// pair. `GROUP BY` treats NULLs as EQUAL — without the inner
		// `IS NOT NULL` filter the aggregate reports every such record as a
		// duplicate of every other. Two records, each holding one entry with no
		// value: they must NOT be duplicates, while the real pair still is.
		for (const id of [SOLO + 1, SOLO + 2]) {
			await sql.unsafe(
				`INSERT INTO ${TABLE} (section_id, section_tipo, string) VALUES ($1, $2, $3::text::jsonb)`,
				[id, SECTION, JSON.stringify({ [COMPONENT]: [{ id: 1, lang: LANG }] })],
			);
		}
		const present = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM ${TABLE} WHERE section_tipo = $1 AND section_id = ANY($2::int[])`,
			[SECTION, `{${SOLO + 1},${SOLO + 2}}`],
		)) as { n: number }[];
		// floor: the two valueless records really exist before the assertion
		expect(present[0]?.n).toBe(2);
		const built = sentenceOf(buildStringFragment('!!', null, false, context()));
		expect(await duplicatedIds(built, SECTION)).toEqual([DUP_A, DUP_B]);
		await sql.unsafe(
			`DELETE FROM ${TABLE} WHERE section_tipo = $1 AND section_id = ANY($2::int[])`,
			[SECTION, `{${SOLO + 1},${SOLO + 2}}`],
		);
	});
});

describe("'!!' duplicated values — the shape", () => {
	test('the PLAN carries NO per-row SubPlan (the O(n^2) signature)', async () => {
		const built = sentenceOf(buildStringFragment('!!', null, false, context()));
		let sentence = built.sentence;
		const params: unknown[] = [SECTION];
		for (const [token, value] of Object.entries(built.tokenValues)) {
			params.push(value);
			sentence = sentence.replaceAll(token, `$${params.length}`);
		}
		const rows = (await sql.unsafe(
			`EXPLAIN SELECT m.section_id FROM ${TABLE} AS m WHERE m.section_tipo = $1 AND (${sentence})`,
			params as (string | number | null)[],
		)) as Record<string, string>[];
		const plan = rows.map((row) => String(Object.values(row)[0])).join('\n');
		// A correlated EXISTS plans as a SubPlan re-executed per outer row; the
		// aggregate plans as a one-shot grouping joined once.
		expect(plan).not.toContain('SubPlan');
		expect(plan).toContain('GroupAggregate');
	});

	test('the json twin has the same uncorrelated shape', () => {
		const built = sentenceOf(buildJsonFragment('!!', null, context({ column: 'misc' })));
		expect(built.sentence).toContain('(m.section_tipo, m.section_id) IN (');
		expect(built.sentence).toContain('HAVING count(DISTINCT dv.section_id) > 1');
		// the correlated self-join is GONE from both twins
		expect(built.sentence).not.toContain('m2.section_id != m.section_id');
		const stringTwin = sentenceOf(buildStringFragment('!!', null, false, context()));
		expect(stringTwin.sentence).not.toContain('m2.section_id != m.section_id');
	});

	test('store-covered + lang-blind adds the store SUPERSET, and only then', () => {
		const covered = sentenceOf(
			buildStringFragment('!!', null, false, context({ lang: 'all', searchStoreCovered: true })),
		);
		expect(covered.sentence).toContain('matrix_string_search sv');
		expect(covered.tokenValues._Qt_).toBe(COMPONENT);
		// lang-scoped: the store has no lang column, so it may NOT pre-filter
		const scoped = sentenceOf(
			buildStringFragment('!!', null, false, context({ searchStoreCovered: true })),
		);
		expect(scoped.sentence).not.toContain('matrix_string_search sv');
	});
});
