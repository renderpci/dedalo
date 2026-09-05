/**
 * SORTING BY A RELATED SECTION IS DETERMINISTIC (PERF-08).
 *
 * A relation component holds an ARRAY of locators, and the join chain's
 * `LEFT JOIN LATERAL jsonb_array_elements` fans one record into ONE ROW PER
 * LOCATOR. That is right for a FILTER (a filter must match ANY locator) and
 * wrong for an ORDER: the sort key of a two-locator record became whichever
 * fan-out row the outer `DISTINCT ON` happened to keep — arbitrary, and not
 * even stable between two identical paints — while the whole related section
 * had to materialise before the LIMIT could apply.
 *
 * THE RULE, stated in buildJoinChain's own docstring so the twins cannot
 * drift: an ORDER chain collapses the fan-out to the record's FIRST STORED
 * locator (`WITH ORDINALITY … ORDER BY ord LIMIT 1`) — the record's own stored
 * order, the same order the client renders the portal in.
 *
 * FIXTURE: the zzscale corpus's TWO-LOCATOR record (id 1220), whose locators
 * are stored in DESCENDING target order on purpose, so "first stored" and
 * "smallest target" are different answers and the gate can tell them apart.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { buildJoinChain } from '../../src/core/search/conform.ts';
import {
	ZZSCALE_INDEX_OWNER_COMPONENT,
	ZZSCALE_INDEX_OWNER_ID,
	ZZSCALE_INDEX_TARGET_IDS,
	ZZSCALE_PARENT_COMPONENT,
	ZZSCALE_SECTION,
	ZZSCALE_TERM_COMPONENT,
} from '../../src/core/test_data/situations/zzscale_constants.ts';
import {
	dropZzScaleCorpus,
	ensureZzScaleCorpus,
} from '../../src/core/test_data/situations/zzscale_corpus.ts';

const TABLE = 'matrix_test';

/** The two-hop path: the portal component, then the target's term. */
const PATH = [
	{ section_tipo: ZZSCALE_SECTION, component_tipo: ZZSCALE_INDEX_OWNER_COMPONENT },
	{ section_tipo: ZZSCALE_SECTION, component_tipo: ZZSCALE_TERM_COMPONENT },
];

/** Rows the chain produces for the two-locator record, and the joined target. */
async function chainRows(purpose: 'filter' | 'order'): Promise<number[]> {
	const chain = await buildJoinChain(structuredClone(PATH), 'm', undefined, purpose);
	const joins = chain.joins.map((join) => join.sql).join('\n');
	const rows = (await sql.unsafe(
		`SELECT ${chain.lastAlias}.section_id AS target FROM ${TABLE} AS m\n${joins}\n` +
			`WHERE m.section_tipo = $1 AND m.section_id = $2`,
		[ZZSCALE_SECTION, ZZSCALE_INDEX_OWNER_ID],
	)) as { target: number | null }[];
	return rows.map((row) => Number(row.target));
}

beforeAll(async () => {
	await ensureZzScaleCorpus();
}, 60000);

afterAll(async () => {
	await dropZzScaleCorpus();
});

describe('a multi-locator ORDER path resolves to ONE row', () => {
	test('the fixture really holds more than one locator', () => {
		// Floor: with a single locator there is nothing to collapse and every
		// leg below would pass on a record that never had the defect.
		expect(ZZSCALE_INDEX_TARGET_IDS.length).toBeGreaterThan(1);
		// stored DESCENDING, so "first stored" ≠ "smallest target"
		expect(ZZSCALE_INDEX_TARGET_IDS[0]).toBeGreaterThan(
			ZZSCALE_INDEX_TARGET_IDS[ZZSCALE_INDEX_TARGET_IDS.length - 1] as number,
		);
	});

	test('the FILTER twin still fans out — a filter must see EVERY locator', async () => {
		const targets = await chainRows('filter');
		expect(targets.length).toBe(ZZSCALE_INDEX_TARGET_IDS.length);
		expect([...targets].sort()).toEqual([...ZZSCALE_INDEX_TARGET_IDS].sort());
	});

	test('the ORDER twin yields exactly ONE row: the FIRST stored locator', async () => {
		const targets = await chainRows('order');
		expect(targets.length).toBe(1);
		expect(targets[0]).toBe(ZZSCALE_INDEX_TARGET_IDS[0] as number);
		// and it is NOT merely the smallest target — the rule is stored order
		expect(targets[0]).not.toBe(Math.min(...(ZZSCALE_INDEX_TARGET_IDS as readonly number[])));
	});

	test('the collapse is IN the chain builder, not copied beside it', async () => {
		const order = await buildJoinChain(structuredClone(PATH), 'm', undefined, 'order');
		const filter = await buildJoinChain(structuredClone(PATH), 'm', undefined, 'filter');
		const orderSql = order.joins.map((join) => join.sql).join('\n');
		const filterSql = filter.joins.map((join) => join.sql).join('\n');
		expect(orderSql).toContain('WITH ORDINALITY');
		expect(orderSql).toContain('LIMIT 1');
		expect(filterSql).not.toContain('WITH ORDINALITY');
		// and the two live in DIFFERENT alias namespaces, or the assembler's
		// alias-keyed join sink would dedup one into the other and the ORDER key
		// would read a column the emitted join never defines
		expect(order.lastAlias).not.toBe(filter.lastAlias);
	});

	test('a record with ONE locator is unchanged by the collapse', async () => {
		// The tree records hold a single parent locator; both purposes must
		// resolve it identically (the collapse may not narrow ordinary data).
		const singlePath = [
			{ section_tipo: ZZSCALE_SECTION, component_tipo: ZZSCALE_PARENT_COMPONENT },
			{ section_tipo: ZZSCALE_SECTION, component_tipo: ZZSCALE_TERM_COMPONENT },
		];
		const results: number[][] = [];
		for (const purpose of ['filter', 'order'] as const) {
			const chain = await buildJoinChain(structuredClone(singlePath), 'm', undefined, purpose);
			const joins = chain.joins.map((join) => join.sql).join('\n');
			const rows = (await sql.unsafe(
				`SELECT ${chain.lastAlias}.section_id AS target FROM ${TABLE} AS m\n${joins}\n` +
					`WHERE m.section_tipo = $1 AND m.section_id = $2`,
				[ZZSCALE_SECTION, 100],
			)) as { target: number | null }[];
			results.push(rows.map((row) => Number(row.target)));
		}
		expect(results[0]?.length).toBe(1);
		expect(results[1]).toEqual(results[0] as number[]);
	});
});
