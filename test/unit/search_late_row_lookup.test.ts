/**
 * Late-row-lookup pagination (sql_assembler::buildSearchSql, SEARCH_LATE_ROW_LOOKUP_OFFSET):
 * from the configured offset on, the default-ordered single-section query is
 * rewritten to find the page of section_ids on an index-only scan first and
 * join back for the wide jsonb columns. Identical rows, order and columns —
 * only the SQL shape changes, and ONLY above the threshold (shallow pages and
 * every fixture-replayed shape keep the plain OFFSET query byte-identical).
 *
 * The tests ride the key's DEFAULT (1000): offsets below stay plain, offsets
 * at/above rewrite. The DB-backed case proves row equality against the plain
 * shape written out verbatim.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';

const SECTION = 'es1'; // matrix_hierarchy, thousands of records
const THRESHOLD = config.ops.searchLateRowLookupOffset;

let dbReady = false;
beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false;
	}
});

describe('late row lookup SQL shape', () => {
	test('sanity: the default threshold is active (tests ride it)', () => {
		expect(THRESHOLD).toBeGreaterThan(0);
	});

	test('offset 0 → plain query (no rewrite, no OFFSET)', async () => {
		const { sql: builtSql } = await buildSearchSql({
			section_tipo: [SECTION],
			limit: 30,
			offset: 0,
		} as never);
		expect(builtSql).not.toContain('page ON');
		expect(builtSql).not.toContain('OFFSET');
	});

	test('shallow offset (below threshold) → plain OFFSET query', async () => {
		const { sql: builtSql } = await buildSearchSql({
			section_tipo: [SECTION],
			limit: 30,
			offset: THRESHOLD - 1,
		} as never);
		expect(builtSql).not.toContain('page ON');
		expect(builtSql).toContain(`OFFSET ${THRESHOLD - 1}`);
	});

	test('deep offset (at threshold) → late-row-lookup join', async () => {
		const { sql: builtSql } = await buildSearchSql({
			section_tipo: [SECTION],
			limit: 30,
			offset: THRESHOLD,
		} as never);
		expect(builtSql).toContain('JOIN (');
		expect(builtSql).toContain('page ON page.section_id');
		// The page subquery carries the LIMIT/OFFSET; the outer re-orders.
		expect(builtSql).toContain(`OFFSET ${THRESHOLD}`);
		expect(builtSql).toMatch(/ORDER BY\s+\w+\.section_id ASC;$/);
	});

	test('deep offset with a CUSTOM order flattens (no window, no page rewrite)', async () => {
		// Single-section + no joins → DISTINCT ON is a no-op, so a custom order
		// is emitted inline (ORDER BY + LIMIT/OFFSET directly, no main_select
		// wrapper — the wrapper forced a full-table materialization before LIMIT).
		const { sql: builtSql } = await buildSearchSql({
			section_tipo: [SECTION],
			limit: 30,
			offset: THRESHOLD,
			order: [{ direction: 'DESC', path: [{ component_tipo: 'id' }] }],
		} as never);
		expect(builtSql).not.toContain('main_select');
		expect(builtSql).not.toContain('DISTINCT ON');
		expect(builtSql).not.toContain('page ON');
		expect(builtSql).toMatch(/ORDER BY\s+id DESC NULLS LAST, section_id ASC\nLIMIT 30 OFFSET \d+;$/);
	});

	test('multi-section deep offset keeps the plain shape (no rewrite)', async () => {
		const { sql: builtSql } = await buildSearchSql({
			section_tipo: [SECTION, 'es4'],
			limit: 30,
			offset: THRESHOLD,
		} as never);
		expect(builtSql).not.toContain('page ON');
		expect(builtSql).toContain(`OFFSET ${THRESHOLD}`);
	});

	test('full_count is untouched by deep offsets (count has no pagination)', async () => {
		const { sql: builtSql } = await buildSearchSql({
			section_tipo: [SECTION],
			full_count: true,
			limit: 30,
			offset: THRESHOLD,
		} as never);
		expect(builtSql).toContain('full_count');
		expect(builtSql).not.toContain('page ON');
		expect(builtSql).not.toContain('OFFSET');
	});

	test('late-lookup rows are IDENTICAL to the plain OFFSET shape', async () => {
		if (!dbReady) return;
		const limit = 25;
		const offset = THRESHOLD + 200;
		const { sql: builtSql, params } = await buildSearchSql({
			section_tipo: [SECTION],
			limit,
			offset,
		} as never);
		expect(builtSql).toContain('page ON'); // proves the rewrite fired
		const late = (await sql.unsafe(builtSql, params as (string | number | null)[])) as Record<
			string,
			unknown
		>[];
		// The pre-rewrite shape, written out verbatim (default order,
		// DEFAULT_SELECT_COLUMNS in assembler order).
		const plain = (await sql.unsafe(
			`SELECT DISTINCT ON (es1.section_id) es1.section_id, es1.section_tipo,
			        es1.data, es1.relation, es1.string, es1.date, es1.iri, es1.geo,
			        es1.number, es1.media, es1.misc, es1.meta
			 FROM matrix_hierarchy AS es1
			 WHERE (es1.section_tipo = $1::text)
			 ORDER BY es1.section_id ASC
			 LIMIT ${limit} OFFSET ${offset}`,
			[SECTION],
		)) as Record<string, unknown>[];
		expect(late.length).toBe(plain.length);
		expect(late.length).toBeGreaterThan(0); // es1 must be deep enough to page here
		expect(JSON.parse(JSON.stringify(late))).toEqual(JSON.parse(JSON.stringify(plain)));
	});
});
