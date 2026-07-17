/**
 * full_count SELECT shape (sql_assembler::buildSearchSql): count(*) vs
 * count(DISTINCT section_id).
 *
 * Every matrix table carries UNIQUE (section_id, section_tipo), so a
 * single-section count with no join chain scans rows whose section_id is
 * already unique — count(*) is equivalent and unlocks a parallel index-only
 * scan (measured 260k → 1.6k buffers on a 438k-row tipo). DISTINCT remains
 * REQUIRED in exactly two shapes:
 *
 *  1. multi-hop join chains (LEFT JOIN LATERAL unnest) — a record with N
 *     matching locators becomes N joined rows;
 *  2. multi-section UNION — PHP's cross-tipo collapse semantics (two tipos in
 *     one table may share a section_id) must be preserved per branch.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { sanitizeClientSqo } from '../../src/core/concepts/sqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';

const SECTION = 'es1';
const TERM = 'hierarchy25';

let dbReady = false;
beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false;
	}
});

describe('full_count SELECT shape', () => {
	test('single section, no filter → plain count(*) (no DISTINCT)', async () => {
		const { sql: builtSql } = await buildSearchSql({
			section_tipo: [SECTION],
			full_count: true,
		} as never);
		expect(builtSql).toContain('count(*) as full_count');
		expect(builtSql).not.toContain('count(DISTINCT');
	});

	test('single section, flat (non-join) filter → still plain count(*)', async () => {
		const sqo = sanitizeClientSqo(
			structuredClone({
				section_tipo: [SECTION],
				full_count: true,
				filter: {
					$and: [
						{ q: 'ea', path: [{ section_tipo: SECTION, component_tipo: TERM }], q_split: true },
					],
				},
			}),
		);
		const { sql: builtSql } = await buildSearchSql(sqo, {});
		expect(builtSql).toContain('count(*) as full_count');
		expect(builtSql).not.toContain('count(DISTINCT');
		expect(builtSql).not.toContain('LEFT JOIN LATERAL');
	});

	test('multi-section UNION keeps count(DISTINCT (cross-tipo collapse parity)', async () => {
		const { sql: builtSql } = await buildSearchSql({
			section_tipo: [SECTION, 'es4'],
			full_count: true,
		} as never);
		expect(builtSql).toContain('count(DISTINCT');
		expect(builtSql).not.toContain('count(*) as full_count');
	});

	test('multi-hop join filter keeps count(DISTINCT (LATERAL multiplies rows)', async () => {
		// Two-step path: rsc197.rsc91 → es1 term — conform builds the LATERAL
		// unnest + LEFT JOIN chain, so the count must dedup section_id.
		const sqo = sanitizeClientSqo(
			structuredClone({
				section_tipo: ['rsc197'],
				full_count: true,
				filter: {
					$and: [
						{
							q: 'ea',
							path: [
								{ section_tipo: 'rsc197', component_tipo: 'rsc91' },
								{ section_tipo: SECTION, component_tipo: TERM },
							],
							q_split: true,
						},
					],
				},
			}),
		);
		const { sql: builtSql } = await buildSearchSql(sqo, {});
		expect(builtSql).toContain('LEFT JOIN LATERAL');
		expect(builtSql).toContain('count(DISTINCT');
		expect(builtSql).not.toContain('count(*) as full_count');
	});

	test('count(*) value equals count(DISTINCT section_id) on a real section', async () => {
		if (!dbReady) return;
		const { sql: builtSql, params } = await buildSearchSql({
			section_tipo: [SECTION],
			full_count: true,
		} as never);
		const rows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
			full_count: number | string;
		}[];
		const plain = rows.reduce((sum, row) => sum + Number(row.full_count), 0);
		const truth = (await sql.unsafe(
			'SELECT count(DISTINCT section_id)::int AS c FROM matrix_hierarchy WHERE section_tipo = $1',
			[SECTION],
		)) as { c: number }[];
		expect(plain).toBe(truth[0]?.c as number);
	});
});
