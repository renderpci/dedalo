/**
 * ORDER-clause assembly (sql_assembler::buildSearchSql) for the two shapes a
 * SECTION-list default sort can take (PHP build_sql_query_order parity):
 *
 *  1. `component_tipo: 'id'` — the matrix PK. It is NOT among
 *     DEFAULT_SELECT_COLUMNS, so the outer windowed query
 *     `SELECT * FROM (…) main_select ORDER BY id` can only see it when the inner
 *     SELECT surfaces it. The assembler adds `<alias>.id AS id` exactly ONCE
 *     (no duplicated select sentence, even if id appears twice in the order).
 *  2. A single `{path,direction}` OBJECT (how an ontology default sort is often
 *     authored, e.g. dd542 Activity's dd549) must produce the SAME SQL as the
 *     one-element array form — PHP tolerates both.
 *
 * dd542 (Activity → matrix_activity) is the live carrier of this config.
 */

import { describe, expect, test } from 'bun:test';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';

const ID_ORDER = { direction: 'DESC', path: [{ component_tipo: 'id' }] };

describe('search ORDER BY id (matrix PK) assembly', () => {
	test("order by 'id' surfaces the PK into the SELECT exactly once and orders by it", async () => {
		const { sql } = await buildSearchSql(
			{ section_tipo: ['dd542'], limit: 25, offset: 0, order: [ID_ORDER] } as never,
			{},
		);
		// The inner SELECT surfaces the PK — exactly one `AS id` sentence.
		const idSelects = sql.match(/\bAS id\b/g) ?? [];
		expect(idSelects.length).toBe(1);
		expect(sql).toContain('.id AS id');
		// Windowed query: inner ORDER BY (DISTINCT ON tiebreaker) + outer ORDER BY id.
		expect(sql).toContain('main_select');
		expect(sql).toMatch(/ORDER BY\s+id DESC/);
		// No `column "id" does not exist`: the ordered column is the surfaced alias,
		// present in main_select's projection.
	});

	test("order by 'id' does NOT duplicate the select sentence when id appears twice", async () => {
		// Degenerate but legal: two id clauses. The select must still carry `AS id`
		// once (the `!selectExtra.includes` dedup guard), while both order sentences
		// are emitted.
		const { sql } = await buildSearchSql(
			{
				section_tipo: ['dd542'],
				limit: 25,
				offset: 0,
				order: [ID_ORDER, { direction: 'ASC', path: [{ component_tipo: 'id' }] }],
			} as never,
			{},
		);
		expect((sql.match(/\bAS id\b/g) ?? []).length).toBe(1);
	});

	test('a single order OBJECT normalizes to the same SQL as the one-element array', async () => {
		const base = { section_tipo: ['dd542'], limit: 25, offset: 0 };
		const asArray = await buildSearchSql({ ...base, order: [ID_ORDER] } as never, {});
		const asObject = await buildSearchSql({ ...base, order: ID_ORDER } as never, {});
		expect(asObject.sql).toBe(asArray.sql);
		expect(asObject.params).toEqual(asArray.params);
	});

	test('no order → the global section_id ASC default (unchanged baseline)', async () => {
		const { sql } = await buildSearchSql(
			{ section_tipo: ['dd542'], limit: 25, offset: 0 } as never,
			{},
		);
		// No custom order → no window, no `AS id`, inner default ASC only.
		expect(sql).not.toContain('AS id');
		expect(sql).not.toContain('main_select');
		expect(sql).toMatch(/ORDER BY\s+dd542\.section_id ASC/);
	});
});

/**
 * The `column` order convention (WC-009): a path end-step names an exact DB
 * column directly, as the clear alternative to overloading `component_tipo`.
 * `component_tipo` WINS when both are present.
 */
describe('search ORDER BY exact `column` convention', () => {
	async function outerOrder(order: unknown): Promise<string> {
		const { sql } = await buildSearchSql(
			{ section_tipo: ['dd542'], limit: 25, offset: 0, order } as never,
			{},
		);
		const m = sql.match(/main_select\s+ORDER BY\s+([^;]+)/) ?? sql.match(/ORDER BY\s+([^;]+)/);
		return (m?.[1] ?? '').replace(/\s+/g, ' ').trim();
	}

	test('`column: "section_id"` (no component_tipo) orders by that column', async () => {
		expect(await outerOrder([{ direction: 'DESC', path: [{ column: 'section_id' }] }])).toMatch(
			/^section_id DESC/,
		);
	});

	test('`column: "id"` surfaces the PK into the SELECT once', async () => {
		const { sql } = await buildSearchSql(
			{
				section_tipo: ['dd542'],
				limit: 25,
				offset: 0,
				order: [{ direction: 'DESC', path: [{ column: 'id' }] }],
			} as never,
			{},
		);
		expect((sql.match(/\bAS id\b/g) ?? []).length).toBe(1);
		expect(sql).toMatch(/main_select\s+ORDER BY\s+id DESC/);
	});

	test('`component_tipo` WINS when both component_tipo and column are set', async () => {
		// component_tipo:'id' (→ id) beats column:'section_tipo'.
		const order = [{ direction: 'DESC', path: [{ component_tipo: 'id', column: 'section_tipo' }] }];
		const outer = await outerOrder(order);
		expect(outer).toMatch(/^id DESC/);
		expect(outer).not.toContain('section_tipo');
	});

	test('a single {path,direction} OBJECT with `column` normalizes like the array form', async () => {
		const base = { section_tipo: ['dd542'], limit: 25, offset: 0 };
		const arr = await buildSearchSql(
			{ ...base, order: [{ direction: 'DESC', path: [{ column: 'section_id' }] }] } as never,
			{},
		);
		const obj = await buildSearchSql(
			{ ...base, order: { direction: 'DESC', path: [{ column: 'section_id' }] } } as never,
			{},
		);
		expect(obj.sql).toBe(arr.sql);
	});

	test('an invalid `column` is rejected by the identifier gate', async () => {
		await expect(
			buildSearchSql(
				{
					section_tipo: ['dd542'],
					limit: 25,
					offset: 0,
					order: [{ direction: 'DESC', path: [{ column: 'DROP TABLE' }] }],
				} as never,
				{},
			),
		).rejects.toThrow(/invalid data column/);
	});
});
