/**
 * READ-4 (sink half) — THE RELATION SINK RENDERS ONLY A WINDOW IT CAN NAME.
 *
 * `search/search_related.ts` interpolates its page window into SQL
 * (`LIMIT ${…}` / `OFFSET ${…}`) in two places — findInverseReferences (and its
 * JS-window branch when `tables` narrows the result) and
 * findInverseReferenceLocators. Before the fix the tails trusted their input:
 * NaN / ±Infinity / a non-numeric string / a value past
 * Number.MAX_SAFE_INTEGER rendered `LIMIT NaN`, `LIMIT Infinity`,
 * `LIMIT 1e+21` — a raw Postgres error surfacing as a 500 — and a non-numeric
 * offset was silently dropped (page 1 served for any page asked).
 *
 * THE OUTCOME PINNED (both sinks, both branches): a window the sink cannot
 * name is a TYPED refusal — `DedaloError` `search.invalid_sqo` (400) — never a
 * Postgres error and never a silently different page. The sink stays TOLERANT
 * of what server callers legitimately pass (`false` = no window, numeric
 * strings, over-ceiling ontology limits): those render exactly as before.
 *
 * A NAMEABLE non-positive limit or negative offset is a SERVER caller's
 * window and keeps its old rendering (`max(1, ·)` / `max(0, ·)`): CLIENT pages
 * never reach the sink with one — they are bounded at their doors
 * (clampClientPage) and at the wire (wireSqoSchema), pinned by
 * client_page_doors_native and wire_sqo_page_bound_native.
 *
 * Situation `zzpw` (matrix_test via test24): one host referenced by five
 * records, ids 900760..900765, dropped with a residue-0 assertion.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { DedaloError } from '../../src/core/errors/index.ts';
import {
	findInverseReferenceLocators,
	findInverseReferences,
} from '../../src/core/search/search_related.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const HOST_SECTION = 'zzpw1';
const HOST_ID = 900760;
const REF_SECTION = 'zzpw2';
const REF_IDS = [900761, 900762, 900763, 900764, 900765];

const S = situation({
	name: 'zzpw sink page window',
	tld: 'zzpw',
	nodes: [
		{
			tipo: 'zzpw1',
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Anfitrión ventana' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzpw2',
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Referencias ventana' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzpw3',
			parent: 'zzpw2',
			model: 'component_portal',
			term: { 'lg-spa': 'Portal' },
			relations: [{ tipo: 'zzpw1' }],
		},
	],
	records: [
		{ section_tipo: HOST_SECTION, section_id: HOST_ID, columns: { data: {} } },
		...REF_IDS.map((id) => ({
			section_tipo: REF_SECTION,
			section_id: id,
			columns: {
				relation: {
					zzpw3: [
						{
							id: 1,
							type: 'dd151',
							section_tipo: HOST_SECTION,
							section_id: HOST_ID,
							from_component_tipo: 'zzpw3',
						},
					],
				},
			},
		})),
	],
});

const FILTER = [{ section_tipo: HOST_SECTION, section_id: HOST_ID }];

/** The three sink call shapes, each taking a raw window. */
const SINKS: { name: string; run: (limit: unknown, offset: unknown) => Promise<unknown[]> }[] = [
	{
		name: 'findInverseReferences (SQL window)',
		run: (limit, offset) =>
			findInverseReferences(FILTER, {
				limit: limit as number,
				offset: offset as number,
				order: 'section_id',
			}),
	},
	{
		name: 'findInverseReferences (JS window: tables narrowing)',
		run: (limit, offset) =>
			findInverseReferences(FILTER, {
				limit: limit as number,
				offset: offset as number,
				order: 'section_id',
				tables: ['matrix_test'],
			}),
	},
	{
		name: 'findInverseReferenceLocators',
		run: (limit, offset) =>
			findInverseReferenceLocators(FILTER, {
				limit: limit as number,
				offset: offset as number,
				order: 'section_id',
			}),
	},
];

const BAD_LIMITS: unknown[] = [Number.NaN, Number.POSITIVE_INFINITY, 'all', 1e21, 'x'];
const BAD_OFFSETS: unknown[] = [Number.POSITIVE_INFINITY, 1e21, 'x'];

/** What the sink did with a window: its rows, or the refusal's identity. */
async function outcome(
	run: () => Promise<unknown[]>,
): Promise<{ rows: number } | { code: string } | { raw: string }> {
	try {
		return { rows: (await run()).length };
	} catch (error) {
		if (error instanceof DedaloError) return { code: error.code };
		return { raw: String((error as Error)?.message ?? error).slice(0, 160) };
	}
}

describe.if(DB_READY)('READ-4 — the relation sink window', () => {
	beforeAll(async () => {
		await ensureSituation(S);
	});

	afterAll(async () => {
		expect(await dropSituation(S)).toBe(0);
	});

	for (const sink of SINKS) {
		test(`${sink.name}: controls — false / 5000 / '5' / 2 / offset 3 render as before`, async () => {
			expect(await outcome(() => sink.run(false, undefined))).toEqual({ rows: REF_IDS.length });
			expect(await outcome(() => sink.run(5000, 0))).toEqual({ rows: REF_IDS.length });
			expect(await outcome(() => sink.run('5', 0))).toEqual({ rows: 5 });
			expect(await outcome(() => sink.run(2, 0))).toEqual({ rows: 2 });
			expect(await outcome(() => sink.run(2, 3))).toEqual({ rows: 2 });
		});

		test(`${sink.name}: the window selects WHICH rows — offset 3, limit 2 are the 4th and 5th ids`, async () => {
			// Not only how many: a window that ignored its offset (the JS branch
			// slicing from 0) would also answer 2 rows.
			const ids = (await sink.run(2, 3)).map((row) =>
				Number((row as { section_id?: unknown }).section_id),
			);
			const ordered = [...REF_IDS].sort((a, b) => a - b);
			expect(ids).toEqual(ordered.slice(3, 5));
			expect(
				(await sink.run(2, 0)).map((row) => Number((row as { section_id?: unknown }).section_id)),
			).toEqual(ordered.slice(0, 2));
		});

		test(`${sink.name}: a nameable non-positive limit / negative offset renders as before (server tolerance)`, async () => {
			const seen = {
				limit0: await outcome(() => sink.run(0, 0)),
				limitMinus1: await outcome(() => sink.run(-1, 0)),
				offsetMinus5: await outcome(() => sink.run(2, -5)),
			};
			expect(seen).toEqual({
				limit0: { rows: 1 },
				limitMinus1: { rows: 1 },
				offsetMinus5: { rows: 2 },
			});
		});

		test(`${sink.name}: an unnameable LIMIT is a typed search.invalid_sqo, never a Postgres error`, async () => {
			const seen: Record<string, unknown> = {};
			for (const limit of BAD_LIMITS) {
				seen[String(limit)] = await outcome(() => sink.run(limit, 0));
			}
			expect(seen).toEqual(
				Object.fromEntries(
					BAD_LIMITS.map((limit) => [String(limit), { code: 'search.invalid_sqo' }]),
				),
			);
		});

		test(`${sink.name}: an unnameable OFFSET is a typed search.invalid_sqo, never a silent page 1`, async () => {
			const seen: Record<string, unknown> = {};
			for (const offset of BAD_OFFSETS) {
				seen[String(offset)] = await outcome(() => sink.run(2, offset));
			}
			expect(seen).toEqual(
				Object.fromEntries(
					BAD_OFFSETS.map((offset) => [String(offset), { code: 'search.invalid_sqo' }]),
				),
			);
		});
	}
});
