/**
 * Wire-contract gate: the REAL copied client sends explicit `null` (not absent)
 * for unset optional SQO fields. The RQO/SQO zod schemas at the API boundary
 * MUST accept these nulls, or every filtered search returns HTTP 400
 * ("Invalid RQO") and the list view breaks.
 *
 * Captured verbatim from the browser (numisdata6 "Id = 5" filter, reqid=423):
 * the offending fields were `sqo.filter.$and[].q_operator = null` and
 * `sqo.filter_by_locators = null`. `limit`/`offset` null were already handled.
 */

import { describe, expect, test } from 'bun:test';
import { rqoSchema } from '../../src/core/concepts/rqo.ts';
import { CLIENT_MAX_LIMIT, sanitizeClientSqo, sqoSchema } from '../../src/core/concepts/sqo.ts';

// The exact filtered-search RQO the client emits (Id = 5 over numisdata6).
const CLIENT_SEARCH_RQO = {
	id: 'section_numisdata6_numisdata6_list_lg-spa',
	action: 'read',
	source: {
		typo: 'source',
		type: 'section',
		action: 'search',
		model: 'section',
		tipo: 'numisdata6',
		section_tipo: 'numisdata6',
		section_id: null,
		mode: 'list',
		view: null,
		lang: 'lg-spa',
	},
	sqo: {
		section_tipo: ['numisdata6'],
		limit: 10,
		offset: 0,
		filter: {
			$and: [
				{
					q: [{ id: 1, value: '5' }],
					q_operator: null,
					path: [
						{
							name: 'Id',
							model: 'component_section_id',
							section_tipo: 'numisdata6',
							component_tipo: 'numisdata15',
						},
					],
					q_split: false,
					type: 'jsonb',
				},
			],
		},
		order: [],
		filter_by_locators: null,
		children_recursive: false,
	},
};

describe('SQO wire contract: client explicit nulls', () => {
	test('full RQO with null q_operator + null filter_by_locators parses (no 400)', () => {
		const parsed = rqoSchema.safeParse(CLIENT_SEARCH_RQO);
		expect(parsed.success).toBe(true);
	});

	test('filter-leaf null q_operator is accepted', () => {
		const parsed = sqoSchema.safeParse(CLIENT_SEARCH_RQO.sqo);
		expect(parsed.success).toBe(true);
	});

	test('null filter_by_locators is accepted', () => {
		const parsed = sqoSchema.safeParse({ section_tipo: ['numisdata6'], filter_by_locators: null });
		expect(parsed.success).toBe(true);
	});

	test('sanitizeClientSqo passes the client SQO through (nulls survive the gate)', () => {
		const clean = sanitizeClientSqo(
			structuredClone(CLIENT_SEARCH_RQO.sqo) as Record<string, unknown>,
		);
		expect(clean.parsed).toBe(false); // gate forces re-parse
		expect(clean.filter_by_locators ?? null).toBeNull();
	});

	test('L7: a pathologically deep filter tree is rejected (no unbounded recursion)', () => {
		// Build a $and nested far past the depth ceiling.
		let deep: Record<string, unknown> = { q: 'x' };
		for (let i = 0; i < 200; i++) deep = { $and: [deep] };
		expect(() => sanitizeClientSqo({ section_tipo: ['numisdata6'], filter: deep })).toThrow(
			/depth/i,
		);
	});

	test('L7: a normally-nested filter still passes the gate', () => {
		const nested = { $and: [{ $or: [{ q: 'a' }, { q: 'b' }] }, { q: 'c' }] };
		expect(() => sanitizeClientSqo({ section_tipo: ['numisdata6'], filter: nested })).not.toThrow();
	});
});

/**
 * REJECTION side (test-quality audit 2026-07-07, relations cluster finding #3:
 * this file only asserted the ACCEPT side — replace the schema with z.any()
 * and every test above stays green. These cases make schema decay fail.)
 */
describe('SQO wire contract: malformed shapes are REJECTED', () => {
	test('section_tipo is mandatory and typed — missing/null/number all fail parse', () => {
		expect(sqoSchema.safeParse({}).success).toBe(false);
		expect(sqoSchema.safeParse({ section_tipo: null }).success).toBe(false);
		expect(sqoSchema.safeParse({ section_tipo: 42 }).success).toBe(false);
		expect(sqoSchema.safeParse({ section_tipo: [42] }).success).toBe(false);
	});

	test('wrong-typed structural fields fail parse', () => {
		expect(sqoSchema.safeParse({ section_tipo: 'x1', filter: 'DROP TABLE' }).success).toBe(false);
		expect(sqoSchema.safeParse({ section_tipo: 'x1', order: 'name ASC' }).success).toBe(false);
		expect(
			sqoSchema.safeParse({ section_tipo: 'x1', filter_by_locators: 'not-an-array' }).success,
		).toBe(false);
		expect(
			sqoSchema.safeParse({ section_tipo: 'x1', filter_by_locators_op: 'UNION' }).success,
		).toBe(false);
	});

	test('sanitizeClientSqo pins the numeric coercions (INJ-06)', () => {
		const clean = sanitizeClientSqo({
			section_tipo: ['numisdata6'],
			offset: 'abc' as unknown as number,
			limit: 0,
		});
		expect(clean.offset).toBe(0); // NaN offset → 0, never a raw string downstream
		expect(clean.limit).toBe(CLIENT_MAX_LIMIT); // non-positive limit → ceiling
		const negative = sanitizeClientSqo({ section_tipo: ['numisdata6'], offset: -5 });
		expect(negative.offset).toBe(0); // negative offset clamped
		const huge = sanitizeClientSqo({
			section_tipo: ['numisdata6'],
			limit: CLIENT_MAX_LIMIT + 1,
		});
		expect(huge.limit).toBe(CLIENT_MAX_LIMIT); // over-ceiling clamped
	});

	test('sanitizeClientSqo forces parsed=false even when the client claims true', () => {
		const clean = sanitizeClientSqo({ section_tipo: ['numisdata6'], parsed: true });
		expect(clean.parsed).toBe(false); // conform can never be skipped by the client
	});

	test('INJ-03: server-only keys are stripped CASE-INSENSITIVELY, recursively', () => {
		const clean = sanitizeClientSqo({
			section_tipo: ['numisdata6'],
			SENTENCE: 'DROP TABLE matrix',
			Column_Sql: 'evil',
			filter: {
				$and: [{ q: 'a', SKIP_PROJECTS_FILTER: true, sentence: 'smuggled' }],
			},
		} as Record<string, unknown>);
		const raw = JSON.stringify(clean).toLowerCase();
		expect(raw).not.toContain('sentence');
		expect(raw).not.toContain('column_sql');
		expect(raw).not.toContain('skip_projects_filter');
		// Anti-vacuity: the innocent leaf survived the strip.
		expect(raw).toContain('"q":"a"');
	});

	test('L7: the node-count ceiling rejects a WIDE tree (not just a deep one)', () => {
		const wide = { $and: Array.from({ length: 10_001 }, (_, i) => ({ q: String(i) })) };
		expect(() => sanitizeClientSqo({ section_tipo: ['numisdata6'], filter: wide })).toThrow(
			/node count/i,
		);
	});
});
