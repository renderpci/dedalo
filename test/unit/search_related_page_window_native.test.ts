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
 * THE PAST TAILS ARE THE SINKS' OWN ROWS FROM THE OFFSET ON (READ-4's scoped
 * probes, findInverseReferencesPast / findInverseReferenceLocatorsPast): for
 * every order each sink takes, and every offset, the tail's rows are EXACTLY
 * the sink's unwindowed rows from that offset — same rows, same order. A tail
 * in another order is another SET past the offset (rows of the page counted as
 * past, rows past it missed). The situation makes order observable: TAIL_HOST
 * is referenced from TWO sections whose ids INTERLEAVE, inserted in DESCENDING
 * id order, so neither insertion order nor a section-first grouping order
 * coincides with an id order.
 *
 * And the tails refuse an UNCOVERED relation index exactly as the sinks do
 * (`search.index_unavailable`): a tail asked over a store missing a table's
 * locators would under-answer "anything past?" silently. Made uncovered by
 * dropping matrix_test's sync trigger INSIDE a transaction that is rolled back
 * (the marked suite database; the coverage cache is cleared on both sides).
 *
 * Situation `zzpw` (matrix_test via test24): one host referenced by five
 * records, ids 900760..900765; TAIL_HOST 900766 referenced by seven records of
 * zzpw2 / zzpw4, ids 900767..900773 — dropped with a residue-0 assertion.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql, withTransaction } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/index.ts';
import {
	findInverseReferenceLocators,
	findInverseReferenceLocatorsPast,
	findInverseReferences,
	findInverseReferencesPast,
} from '../../src/core/search/search_related.ts';
import { clearSearchStoreCache } from '../../src/core/search/search_store.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const HOST_SECTION = 'zzpw1';
const HOST_ID = 900760;
const REF_SECTION = 'zzpw2';
const REF_IDS = [900761, 900762, 900763, 900764, 900765];
/** The Past-tail host (see the header). */
const TAIL_HOST_ID = 900766;
const TAIL_SECOND_SECTION = 'zzpw4';
/** [section, id] in DESCENDING id order — the order they are inserted. */
const TAIL_REFS: readonly [string, number][] = [
	[REF_SECTION, 900773],
	[TAIL_SECOND_SECTION, 900772],
	[REF_SECTION, 900771],
	[TAIL_SECOND_SECTION, 900770],
	[REF_SECTION, 900769],
	[TAIL_SECOND_SECTION, 900768],
	[REF_SECTION, 900767],
];

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
		{
			tipo: TAIL_SECOND_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Referencias ventana 2' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: 'zzpw5',
			parent: TAIL_SECOND_SECTION,
			model: 'component_portal',
			term: { 'lg-spa': 'Portal 2' },
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
		{ section_tipo: HOST_SECTION, section_id: TAIL_HOST_ID, columns: { data: {} } },
		...TAIL_REFS.map(([sectionTipo, id]) => {
			const portal = sectionTipo === REF_SECTION ? 'zzpw3' : 'zzpw5';
			return {
				section_tipo: sectionTipo,
				section_id: id,
				columns: {
					relation: {
						[portal]: [
							{
								id: 1,
								type: 'dd151',
								section_tipo: HOST_SECTION,
								section_id: TAIL_HOST_ID,
								from_component_tipo: portal,
							},
						],
					},
				},
			};
		}),
	],
});

const FILTER = [{ section_tipo: HOST_SECTION, section_id: HOST_ID }];
const TAIL_FILTER = [{ section_tipo: HOST_SECTION, section_id: TAIL_HOST_ID }];

/** A row's identity, as both a sink hit and a tail row carry it. */
const rowKey = (row: unknown): string => {
	const record = row as { section_tipo?: unknown; section_id?: unknown; locator_data?: unknown };
	const locator =
		record.locator_data === undefined ? '' : ` ${JSON.stringify(record.locator_data)}`;
	return `${String(record.section_tipo)}/${Number(record.section_id)}${locator}`;
};

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

	test("findInverseReferencesPast: the tail is the sink's own rows from the offset on, in every order", async () => {
		const seen: string[] = [];
		const expected: string[] = [];
		for (const order of [undefined, 'section_id', 'section_tipo_section_id'] as const) {
			const full = (await findInverseReferences(TAIL_FILTER, { limit: false, order })).map(rowKey);
			expect(full.length).toBe(TAIL_REFS.length);
			for (let offset = 0; offset <= full.length; offset++) {
				const past = await findInverseReferencesPast(TAIL_FILTER, { order }, offset);
				const rows = (await sql.unsafe(past.sql, past.params)) as unknown[];
				seen.push(`${order ?? 'table'} @${offset}: ${rows.map(rowKey).join(' ')}`);
				expected.push(`${order ?? 'table'} @${offset}: ${full.slice(offset).join(' ')}`);
			}
		}
		expect(seen).toEqual(expected);
		// Non-degeneracy: the id order interleaves the two sections.
		const byId = (
			await findInverseReferences(TAIL_FILTER, { limit: false, order: 'section_id' })
		).map((hit) => hit.section_tipo);
		expect(byId.slice(0, 3)).toEqual([REF_SECTION, TAIL_SECOND_SECTION, REF_SECTION]);
	});

	test("findInverseReferenceLocatorsPast: the tail is the breakdown's own rows from the offset on, in every order", async () => {
		const seen: string[] = [];
		const expected: string[] = [];
		for (const order of [undefined, 'section_id'] as const) {
			const full = (await findInverseReferenceLocators(TAIL_FILTER, { limit: false, order })).map(
				rowKey,
			);
			expect(full.length).toBe(TAIL_REFS.length);
			for (let offset = 0; offset <= full.length; offset++) {
				const past = await findInverseReferenceLocatorsPast(TAIL_FILTER, { order }, offset);
				const rows = past === null ? [] : ((await sql.unsafe(past.sql, past.params)) as unknown[]);
				seen.push(`${order ?? 'table'} @${offset}: ${rows.map(rowKey).join(' ')}`);
				expected.push(`${order ?? 'table'} @${offset}: ${full.slice(offset).join(' ')}`);
			}
		}
		expect(seen).toEqual(expected);
	});

	test('the Past tails refuse an UNCOVERED relation index (search.index_unavailable), like the sinks', async () => {
		await assertTestDatabase('search_related_page_window_native');
		const ROLLBACK = new Error('roll the dropped trigger back');
		const code = async (run: () => Promise<unknown>): Promise<string> => {
			try {
				await run();
				return 'answered';
			} catch (error) {
				return error instanceof DedaloError ? error.code : `raw ${String(error)}`;
			}
		};
		const seen: Record<string, string> = {};
		clearSearchStoreCache();
		try {
			await withTransaction(async () => {
				await sql.unsafe('DROP TRIGGER matrix_test_relation_index_sync ON matrix_test', []);
				// CONTROLS: the sinks themselves refuse.
				seen.findInverseReferences = await code(() =>
					findInverseReferences(TAIL_FILTER, { limit: false }),
				);
				seen.findInverseReferenceLocators = await code(() =>
					findInverseReferenceLocators(TAIL_FILTER, { limit: false }),
				);
				seen.findInverseReferencesPast = await code(() =>
					findInverseReferencesPast(TAIL_FILTER, {}, 1),
				);
				seen.findInverseReferenceLocatorsPast = await code(() =>
					findInverseReferenceLocatorsPast(TAIL_FILTER, {}, 1),
				);
				throw ROLLBACK;
			});
		} catch (error) {
			if (error !== ROLLBACK) throw error;
		} finally {
			clearSearchStoreCache();
		}
		expect(seen).toEqual({
			findInverseReferences: 'search.index_unavailable',
			findInverseReferenceLocators: 'search.index_unavailable',
			findInverseReferencesPast: 'search.index_unavailable',
			findInverseReferenceLocatorsPast: 'search.index_unavailable',
		});
		// Restored: covered again, the tail answers.
		expect(await code(() => findInverseReferencesPast(TAIL_FILTER, {}, 1))).toBe('answered');
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
