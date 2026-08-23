/**
 * tool_export DEEP-BREAKDOWN — TS-NATIVE TWIN (DEC-14b) of
 * test/parity/tool_export_breakdown_differential.test.ts.
 *
 * The parity gate replays frozen PHP bodies harvested against monedaiberica's
 * bibliography records (numisdata3/1490 → rsc332 → rsc205 → rsc197), which the
 * derived corpus can never hold: a tool_export grid is DISPLAY STRINGS, so
 * scripts/derive_test_corpus.ts refuses those records as `never_revealed` and
 * the parity pair is red BY CONSTRUCTION on the suite database. This twin
 * BUILDS the same shape (test/helpers/zzbib_export_chain.ts — a 3-hop
 * bibliography with a TWO-author publication) and pins, as exact expected
 * grids, every placement rule the frozen bodies state. Each rule below was
 * TRANSCRIBED from the frozen store (fixture hashes noted per case), never
 * from the TS implementation — the frozen oracle stays the law:
 *
 *   - per-SEGMENT '|n' suffix keys, collision-free
 *     ('…zzbib12|1.zzbib20_zzbib21' — frozen 0e375416 'rsc332_rsc368|1…');
 *   - breakdown 'rows': every level explodes vertically, author rows nest
 *     under their publication; fill_the_gaps fills title/date DOWN the span
 *     (frozen c92b8bbc) and nofill leaves the deeper rows sparse (786bea50);
 *   - breakdown 'default': first indexed level → sub-rows, deeper levels →
 *     '|n' columns with ' N+1' label suffixes (frozen 3bf225d4/fa87f9ec —
 *     identical with fill on/off, pinned as such);
 *   - breakdown 'columns': everything horizontal at height 1 (0e375416);
 *   - relation-leaf FAN-OUT into the component's own request_config children
 *     (authorship → surname AND name, one column each — frozen rsc139 →
 *     rsc86 + rsc85);
 *   - deterministic column order, 'after' chain, ar_labels alternation
 *     (section term / component label), the 'end' line's authoritative order;
 *   - value format: ddos sharing the SAME top component dedupe into ONE
 *     column, later non-empty flats overwrite (frozen f67ce127), and joins
 *     use the DECLARED fields_separator per level (authorship ', ');
 *   - dedalo_raw: the stored bytes under the {"dedalo_data": …} wrapper
 *     (frozen 63735ea3);
 *   - WC-008 (deliberate, ledgered divergence): a SINGLE-step [portal] ddo
 *     exports COMPACT per-reference cells — TS side of the asymmetric pin.
 *
 * Anti-vacuity is structural: every expected grid is written out in FULL
 * (columns, rows, cells, end) over a chain whose every hop lands on a record
 * that exists, so an engine that stops walking produces a different grid, not
 * an empty comparison.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Principal } from '../../src/core/security/permissions.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { dropSituation, ensureSituation } from '../../src/core/test_data/situations/situation.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { toolExportGetExportGrid } from '../../tools/tool_export/server/tool_export.ts';
import {
	ZZBIB_AUTHORSHIP,
	ZZBIB_DATE,
	ZZBIB_MAIN_ID,
	ZZBIB_MAIN_SECTION,
	ZZBIB_PORTAL,
	ZZBIB_PUB,
	ZZBIB_PUB_SECTION,
	ZZBIB_REF_SECTION,
	ZZBIB_SITUATION,
	ZZBIB_TITLE,
} from '../helpers/zzbib_export_chain.ts';

let principal!: Principal;

beforeAll(async () => {
	await ensureSituation(ZZBIB_SITUATION);
	principal = await resolvePrincipal(-1);
});

afterAll(async () => {
	expect(await dropSituation(ZZBIB_SITUATION)).toBe(0);
});

const ctx = (options: Record<string, unknown>): ToolActionContext =>
	({ principal, userId: -1, options, background: false }) as ToolActionContext;

type Grid = {
	meta?: Record<string, unknown>;
	columns?: Record<string, unknown>[];
	rows?: Record<string, unknown>[];
	end?: Record<string, unknown> | null;
};

async function gridOf(options: Record<string, unknown>): Promise<Grid> {
	const response: ToolResponse = await toolExportGetExportGrid(ctx(options));
	return (response.data ?? {}) as Grid;
}

/** The projection the parity gate pinned: identity + labels + order hints. */
const colProjection = (column: Record<string, unknown>): Record<string, unknown> => ({
	i: column.i,
	key: column.key,
	group: column.group,
	label: column.label,
	ar_labels: column.ar_labels,
	cell_type: column.cell_type,
	model: column.model,
	after: column.after,
});
const rowProjection = (row: Record<string, unknown>): Record<string, unknown> => ({
	rec: String(row.rec),
	sub: row.sub,
	c: row.c,
});

const step = (section_tipo: string, component_tipo: string, model: string, name: string) => ({
	section_tipo,
	component_tipo,
	model,
	name,
});
const PORTAL_STEP = step(ZZBIB_MAIN_SECTION, ZZBIB_PORTAL, 'component_portal', 'Bibliography');
const PUB_STEP = step(ZZBIB_REF_SECTION, ZZBIB_PUB, 'component_autocomplete', 'Publication');
const THREE_DDOS = [
	{
		path: [
			PORTAL_STEP,
			PUB_STEP,
			step(ZZBIB_PUB_SECTION, ZZBIB_TITLE, 'component_input_text', 'Title'),
		],
	},
	{ path: [PORTAL_STEP, PUB_STEP, step(ZZBIB_PUB_SECTION, ZZBIB_DATE, 'component_date', 'Date')] },
	{
		path: [
			PORTAL_STEP,
			PUB_STEP,
			step(ZZBIB_PUB_SECTION, ZZBIB_AUTHORSHIP, 'component_autocomplete', 'Authorship'),
		],
	},
];

const buildOptions = (
	data_format: string,
	breakdown: string,
	fill: boolean,
	ddos: unknown[] = THREE_DDOS,
): Record<string, unknown> => ({
	section_tipo: ZZBIB_MAIN_SECTION,
	model: 'section',
	data_format,
	breakdown,
	fill_the_gaps: fill,
	ar_ddo_to_export: ddos,
	sqo: {
		section_tipo: [ZZBIB_MAIN_SECTION],
		limit: 0,
		offset: 0,
		filter_by_locators: [{ section_tipo: ZZBIB_MAIN_SECTION, section_id: String(ZZBIB_MAIN_ID) }],
	},
});

// ---- expected-grid vocabulary (the frozen grammar, spelled once) -----------

/** Chain key: '<sec>_<comp>' segments joined '.'; '|n' suffixes stay in place. */
const BASE = `${ZZBIB_MAIN_SECTION}_${ZZBIB_PORTAL}`;
const K = (...segments: string[]): string => [BASE, ...segments].join('.');
const SEG_PUB = `${ZZBIB_REF_SECTION}_${ZZBIB_PUB}`;
const SEG_TITLE = `${ZZBIB_PUB_SECTION}_${ZZBIB_TITLE}`;
const SEG_DATE = `${ZZBIB_PUB_SECTION}_${ZZBIB_DATE}`;
const SEG_AUTH = `${ZZBIB_PUB_SECTION}_${ZZBIB_AUTHORSHIP}`;
const SEG_SURNAME = 'zzbib30_zzbib31';
const SEG_NAME = 'zzbib30_zzbib32';

/** ar_labels alternation: [main section, portal, refs section, pub, pubs section, leaf…]. */
const ARL_HEAD = ['zzbib main', 'zzbib bibliography', 'zzbib references'];
const col = (
	i: number,
	key: string,
	label: string,
	arTail: string[],
	model: string,
): Record<string, unknown> => ({
	i,
	key,
	group: BASE,
	label,
	ar_labels: [...ARL_HEAD, ...arTail],
	cell_type: 'text',
	model,
	after: i === 0 ? null : i - 1,
});

/** The four base columns every mode shares (title, date, surname, name). */
const baseColumns = (): Record<string, unknown>[] => [
	col(
		0,
		K(SEG_PUB, SEG_TITLE),
		'zzbib bibliography | zzbib publication | zzbib title',
		['zzbib publication', 'zzbib publications', 'zzbib title'],
		'component_input_text',
	),
	col(
		1,
		K(SEG_PUB, SEG_DATE),
		'zzbib bibliography | zzbib publication | zzbib date',
		['zzbib publication', 'zzbib publications', 'zzbib date'],
		'component_date',
	),
	col(
		2,
		K(SEG_PUB, SEG_AUTH, SEG_SURNAME),
		'zzbib bibliography | zzbib publication | zzbib authorship | zzbib surname',
		[
			'zzbib publication',
			'zzbib publications',
			'zzbib authorship',
			'zzbib persons',
			'zzbib surname',
		],
		'component_input_text',
	),
	col(
		3,
		K(SEG_PUB, SEG_AUTH, SEG_NAME),
		'zzbib bibliography | zzbib publication | zzbib authorship | zzbib name',
		['zzbib publication', 'zzbib publications', 'zzbib authorship', 'zzbib persons', 'zzbib name'],
		'component_input_text',
	),
];

/** Second-author '|1' columns of breakdown 'default' (label ' 2' suffix rule). */
const secondAuthorColumns = (): Record<string, unknown>[] => [
	col(
		4,
		`${K(SEG_PUB, SEG_AUTH, SEG_SURNAME)}|1`,
		'zzbib bibliography | zzbib publication | zzbib authorship | zzbib surname 2',
		[
			'zzbib publication',
			'zzbib publications',
			'zzbib authorship',
			'zzbib persons',
			'zzbib surname 2',
		],
		'component_input_text',
	),
	col(
		5,
		`${K(SEG_PUB, SEG_AUTH, SEG_NAME)}|1`,
		'zzbib bibliography | zzbib publication | zzbib authorship | zzbib name 2',
		[
			'zzbib publication',
			'zzbib publications',
			'zzbib authorship',
			'zzbib persons',
			'zzbib name 2',
		],
		'component_input_text',
	),
];

const row = (sub: number, c: Record<string, string>): Record<string, unknown> => ({
	rec: String(ZZBIB_MAIN_ID),
	sub,
	c,
});
const end = (columns: number[], rows: number): Record<string, unknown> => ({
	t: 'end',
	columns,
	rows,
	records: 1,
});

function assertGrid(
	grid: Grid,
	expected: {
		columns: Record<string, unknown>[];
		rows: Record<string, unknown>[];
		end: Record<string, unknown>;
	},
): void {
	expect((grid.columns ?? []).map(colProjection)).toEqual(expected.columns);
	expect((grid.rows ?? []).map(rowProjection)).toEqual(expected.rows);
	expect(grid.end ?? null).toEqual(expected.end);
	expect(grid.meta?.total).toBe(1);
}

describe('tool_export deep-breakdown native twin (frozen rules on a built chain)', () => {
	// Frozen c92b8bbc: rows mode explodes every level vertically; author rows
	// nest under their publication; fill_the_gaps fills title/date DOWN.
	test("grid_value breakdown 'rows' fill_the_gaps=true", async () => {
		const grid = await gridOf(buildOptions('grid_value', 'rows', true));
		assertGrid(grid, {
			columns: baseColumns(),
			rows: [
				row(0, { 0: 'zzbib title one', 1: '2004', 2: 'zzbib surname A', 3: 'zzbib name A' }),
				row(1, { 0: 'zzbib title one', 1: '2004', 2: 'zzbib surname B', 3: 'zzbib name B' }),
				row(2, { 0: 'zzbib title two', 1: '2012', 2: 'zzbib surname C', 3: 'zzbib name C' }),
				row(3, { 0: 'zzbib title three', 1: '2015', 2: 'zzbib surname D', 3: 'zzbib name D' }),
			],
			end: end([0, 1, 2, 3], 4),
		});
	}, 60000);

	// Frozen 786bea50: nofill leaves the second-author row SPARSE.
	test("grid_value breakdown 'rows' fill_the_gaps=false", async () => {
		const grid = await gridOf(buildOptions('grid_value', 'rows', false));
		assertGrid(grid, {
			columns: baseColumns(),
			rows: [
				row(0, { 0: 'zzbib title one', 1: '2004', 2: 'zzbib surname A', 3: 'zzbib name A' }),
				row(1, { 2: 'zzbib surname B', 3: 'zzbib name B' }),
				row(2, { 0: 'zzbib title two', 1: '2012', 2: 'zzbib surname C', 3: 'zzbib name C' }),
				row(3, { 0: 'zzbib title three', 1: '2015', 2: 'zzbib surname D', 3: 'zzbib name D' }),
			],
			end: end([0, 1, 2, 3], 4),
		});
	}, 60000);

	// Frozen 3bf225d4 (fill) / fa87f9ec (nofill): default mode explodes the FIRST
	// indexed level into sub-rows and suffixes the deeper author level into '|1'
	// columns; the two fill settings produce the IDENTICAL grid here (both frozen
	// bodies carry the same rows), pinned by running both.
	for (const fill of [true, false]) {
		test(`grid_value breakdown 'default' fill_the_gaps=${fill}`, async () => {
			const grid = await gridOf(buildOptions('grid_value', 'default', fill));
			assertGrid(grid, {
				columns: [...baseColumns(), ...secondAuthorColumns()],
				rows: [
					row(0, {
						0: 'zzbib title one',
						1: '2004',
						2: 'zzbib surname A',
						3: 'zzbib name A',
						4: 'zzbib surname B',
						5: 'zzbib name B',
					}),
					row(1, { 0: 'zzbib title two', 1: '2012', 2: 'zzbib surname C', 3: 'zzbib name C' }),
					row(2, { 0: 'zzbib title three', 1: '2015', 2: 'zzbib surname D', 3: 'zzbib name D' }),
				],
				end: end([0, 1, 2, 3, 4, 5], 3),
			});
		}, 60000);
	}

	// Frozen 0e375416: columns mode suffixes EVERY indexed level at height 1 —
	// '|n' on the publication segment per reference, ddo-major order, and the
	// ' N+1' label suffix lands on the SUFFIXED segment ('zzbib publication 2').
	test("grid_value breakdown 'columns' fill_the_gaps=true", async () => {
		const grid = await gridOf(buildOptions('grid_value', 'columns', true));
		const pubLabel = (n: number): string =>
			n === 0 ? 'zzbib publication' : `zzbib publication ${n + 1}`;
		const pubSeg = (n: number): string => (n === 0 ? SEG_PUB : `${SEG_PUB}|${n}`);
		const titleCols = [0, 1, 2].map((n) =>
			col(
				n,
				K(pubSeg(n), SEG_TITLE),
				`zzbib bibliography | ${pubLabel(n)} | zzbib title`,
				[pubLabel(n), 'zzbib publications', 'zzbib title'],
				'component_input_text',
			),
		);
		const dateCols = [0, 1, 2].map((n) =>
			col(
				n + 3,
				K(pubSeg(n), SEG_DATE),
				`zzbib bibliography | ${pubLabel(n)} | zzbib date`,
				[pubLabel(n), 'zzbib publications', 'zzbib date'],
				'component_date',
			),
		);
		// Author columns: pub 1's TWO authors first (unsuffixed + '|1'), then one
		// pair per remaining publication — exactly the frozen 0e375416 layout.
		const authorCol = (
			i: number,
			pubIndex: number,
			leafSeg: string,
			leafLabel: string,
		): Record<string, unknown> =>
			col(
				i,
				K(pubSeg(pubIndex), SEG_AUTH, leafSeg),
				`zzbib bibliography | ${pubLabel(pubIndex)} | zzbib authorship | ${leafLabel}`,
				[pubLabel(pubIndex), 'zzbib publications', 'zzbib authorship', 'zzbib persons', leafLabel],
				'component_input_text',
			);
		const authorCols = [
			authorCol(6, 0, SEG_SURNAME, 'zzbib surname'),
			authorCol(7, 0, SEG_NAME, 'zzbib name'),
			authorCol(8, 0, `${SEG_SURNAME}|1`, 'zzbib surname 2'),
			authorCol(9, 0, `${SEG_NAME}|1`, 'zzbib name 2'),
			authorCol(10, 1, SEG_SURNAME, 'zzbib surname'),
			authorCol(11, 1, SEG_NAME, 'zzbib name'),
			authorCol(12, 2, SEG_SURNAME, 'zzbib surname'),
			authorCol(13, 2, SEG_NAME, 'zzbib name'),
		];
		assertGrid(grid, {
			columns: [...titleCols, ...dateCols, ...authorCols],
			rows: [
				row(0, {
					0: 'zzbib title one',
					1: 'zzbib title two',
					2: 'zzbib title three',
					3: '2004',
					4: '2012',
					5: '2015',
					6: 'zzbib surname A',
					7: 'zzbib name A',
					8: 'zzbib surname B',
					9: 'zzbib name B',
					10: 'zzbib surname C',
					11: 'zzbib name C',
					12: 'zzbib surname D',
					13: 'zzbib name D',
				}),
			],
			end: end([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], 1),
		});
	}, 60000);

	// Frozen f67ce127: value format dedupes the three same-top ddos into ONE
	// column keyed by the top component; the LAST non-empty flat wins the cell
	// (authors only — no titles), refs join with the level-0 ' | ' and the
	// authorship parts with its DECLARED ', ' separator.
	test('value format: same-top-component dedupe into ONE column, declared separators', async () => {
		const grid = await gridOf(buildOptions('value', 'default', true));
		expect((grid.columns ?? []).map(colProjection)).toEqual([
			{
				i: 0,
				key: BASE,
				group: BASE,
				// Label registers from the FIRST ddo (the title path) — frozen rule.
				label: 'zzbib bibliography | zzbib publication | zzbib title',
				ar_labels: [...ARL_HEAD, 'zzbib publication', 'zzbib publications', 'zzbib title'],
				cell_type: 'text',
				model: 'component_portal',
				after: null,
			},
		]);
		expect((grid.rows ?? []).map(rowProjection)).toEqual([
			row(0, {
				0: 'zzbib surname A, zzbib name A, zzbib surname B, zzbib name B | zzbib surname C, zzbib name C | zzbib surname D, zzbib name D',
			}),
		]);
		expect(grid.end ?? null).toEqual(end([0], 1));
	}, 60000);

	// Frozen 63735ea3: dedalo_raw dedupes the same way and ships the STORED
	// bytes under the {"dedalo_data": …} wrapper, cell_type json.
	test('dedalo_raw: stored locators under the dedalo_data wrapper, ONE json column', async () => {
		const grid = await gridOf(buildOptions('dedalo_raw', 'default', true));
		expect((grid.columns ?? []).length).toBe(1);
		expect(grid.columns?.[0]?.key).toBe(BASE);
		expect(grid.columns?.[0]?.cell_type).toBe('json');
		expect(grid.columns?.[0]?.model).toBe('component_portal');
		const cell = String((grid.rows?.[0]?.c as Record<string, unknown>)?.[0]);
		const parsed = JSON.parse(cell) as { dedalo_data: Record<string, unknown>[] };
		expect(parsed.dedalo_data).toEqual(
			[960101, 960102, 960103].map((id, index) => ({
				id: index + 1,
				type: 'dd151',
				section_id: id,
				section_tipo: ZZBIB_REF_SECTION,
				from_component_tipo: ZZBIB_PORTAL,
			})),
		);
	}, 60000);

	// WC-008 (deliberate divergence, DEC-02/DEC-15): a SINGLE-step [portal] ddo
	// exports COMPACT per-reference cells — one base column, each reference's
	// FULL flat info in ONE cell (pages + title + every author), exploded by row
	// (default/rows) or by '|n' column (columns). The PHP fan-out side of the
	// pin stays in the parity gate's frozen bodies.
	const COMPACT_CELLS = [
		'zzbib pages 1 | zzbib title one | zzbib surname A, zzbib name A, zzbib surname B, zzbib name B',
		'zzbib pages 2 | zzbib title two | zzbib surname C, zzbib name C',
		'zzbib pages 3 | zzbib title three | zzbib surname D, zzbib name D',
	];
	for (const breakdown of ['default', 'rows']) {
		test(`WC-008 single-step portal COMPACT grid_value/${breakdown}`, async () => {
			const grid = await gridOf(
				buildOptions('grid_value', breakdown, true, [{ path: [PORTAL_STEP] }]),
			);
			expect((grid.columns ?? []).map(colProjection)).toEqual([
				{
					i: 0,
					key: BASE,
					group: BASE,
					label: 'zzbib bibliography',
					ar_labels: ['zzbib main', 'zzbib bibliography'],
					cell_type: 'text',
					model: 'component_portal',
					after: null,
				},
			]);
			expect((grid.rows ?? []).map(rowProjection)).toEqual(
				COMPACT_CELLS.map((cell, index) => row(index, { 0: cell })),
			);
			expect(grid.end ?? null).toEqual(end([0], 3));
		}, 60000);
	}
	test('WC-008 single-step portal COMPACT grid_value/columns', async () => {
		const grid = await gridOf(
			buildOptions('grid_value', 'columns', true, [{ path: [PORTAL_STEP] }]),
		);
		expect((grid.columns ?? []).map((column) => [column.i, column.key, column.label])).toEqual([
			[0, BASE, 'zzbib bibliography'],
			[1, `${BASE}|1`, 'zzbib bibliography 2'],
			[2, `${BASE}|2`, 'zzbib bibliography 3'],
		]);
		expect((grid.rows ?? []).map(rowProjection)).toEqual([
			row(0, {
				0: COMPACT_CELLS[0] as string,
				1: COMPACT_CELLS[1] as string,
				2: COMPACT_CELLS[2] as string,
			}),
		]);
		expect(grid.end ?? null).toEqual(end([0, 1, 2], 1));
	}, 60000);
});
