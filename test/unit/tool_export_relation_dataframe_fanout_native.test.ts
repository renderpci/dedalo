/**
 * tool_export RELATION-MAIN dataframe FAN-OUT — the generic-TLD twin of the
 * retired test/parity/tool_export_dataframe_differential.test.ts.
 *
 * WHY IT REPLACES THE DIFFERENTIAL. That gate read ONE install's corpus
 * (numisdata3 §15657 / §1490 and its numisdata34 → numisdata1449 → rsc1242
 * chain) and byte-diffed it against a frozen PHP response, so it was
 * red-by-construction on every database that does not carry the monedaiberica
 * records: the PHP half is a fossil, the CONTRACT is the asset. Here the same
 * contract is asserted against the TS engine's own output over a situation
 * this file BUILDS (AGENTS.md 2026-08-19 — a test never names an install TLD,
 * it declares the shape it needs), which makes the assertions EXACT instead of
 * comparative.
 *
 * THE CONTRACT (1:1 with the retired gate):
 *  - a RELATION main whose STORED ontology model is component_autocomplete
 *    takes the FAN-OUT path, never the WC-008 compact-portal branch (that
 *    branch keys on the stored model being component_portal);
 *  - its component_dataframe child's frames live on the OWNER record's
 *    relation column under the FRAME tipo and pair to each main locator by
 *    (type dd490, main_component_tipo, id_key = the main locator's stored id)
 *    — src/core/concepts/subdatum.ts dataframeEntryMatches, honored in
 *    src/diffusion/export/atoms.ts fanOutRelation;
 *  - grid_value default/rows/columns mint a frame column (its key carries the
 *    frame tipo) and flow the frame VALUE (the frame target's label) into the
 *    framed record's cells; value/default folds the same frame value into its
 *    single joined cell;
 *  - a FRAMELESS twin record still gets that column (minted MID-STREAM, empty
 *    cell): the column set may not depend on which record came first;
 *  - `unresolved` never contains 'component_dataframe' for this shape (the old
 *    loud gap, closed 2026-07-10) — while a DECLARED dataframe path step stays
 *    LOUD ('component_dataframe:declared-path') and emits no cells, on BOTH
 *    code paths (grid_value → collectGridAtoms, value → resolveValueCell);
 *  - the FULL column projection {i,key,group,label,ar_labels,cell_type,model,
 *    after} is pinned field-by-field on EVERY combo — as the retired gate did
 *    against the oracle — together with the row projection {rec,sub,c},
 *    end.columns and meta.total;
 *  - dedalo_raw (TS contract, WC-2026-08-09-export-raw-dataframe-own-column):
 *    the frame slot is its OWN column `${section}_${frame}` right after the
 *    main, every cell a bare {"dedalo_data": <array>}, the frame cell carrying
 *    the dd490 locators with from_component_tipo = the frame tipo.
 *
 * THE SITUATION (`zzxd`, dropped in afterAll with residue asserted 0):
 *   zzxd1 section (matrix_test via test24)
 *     zzxd2 component_autocomplete  → sqo section zzxd3, show ddos zzxd4+zzxd5
 *       zzxd5 component_dataframe   → sqo section zzxd6, show ddo zzxd7
 *   zzxd3 section — zzxd4 input_text ('target A' / 'target B')
 *   zzxd6 section — zzxd7 input_text ('uncertain' / 'uncertain two' / orphan)
 *   records: zzxd1 §901001 = the frameless twin (main only),
 *            zzxd1 §901002 = 2 main locators + 2 paired frames + 1 ORPHAN
 *            frame (id_key 9, pairing nothing) that must never surface.
 * The frameless record has the LOWER id so it is exported FIRST and the frame
 * column is minted mid-stream — exactly the case §1490 pinned in the corpus.
 *
 * Sibling gate (literal main, dedalo_raw only, re-import round trip):
 * test/unit/tool_export_raw_dataframe_native.test.ts.
 *
 * @twin-of      test/parity/tool_export_dataframe_differential.test.ts
 * @twin-status  retired
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Principal } from '../../src/core/security/permissions.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { toolExportGetExportGrid } from '../../tools/tool_export/server/tool_export.ts';

const SECTION = 'zzxd1';
const MAIN = 'zzxd2'; // component_autocomplete — the relation main (fan-out path)
const TARGET_SECTION = 'zzxd3';
const TARGET_LABEL = 'zzxd4';
const FRAME = 'zzxd5'; // component_dataframe child of MAIN
const FRAME_SECTION = 'zzxd6';
const FRAME_LABEL = 'zzxd7';

const FRAMELESS_ID = 901001;
const FRAMED_ID = 901002;

/** The frame values that must reach the framed record's cells. */
const FRAME_VALUE = 'uncertain';
const FRAME_VALUE_TWO = 'uncertain two';
/** A frame whose id_key pairs NO main locator — it must never surface. */
const ORPHAN_FRAME_VALUE = 'orphan frame';

/** One request_config item: a target section + the child ddos to expand. */
const requestConfig = (targetSection: string, ddoTipos: string[]) => ({
	source: {
		request_config: [
			{
				sqo: { section_tipo: [{ value: [targetSection], source: 'section' }] },
				show: {
					ddo_map: ddoTipos.map((tipo) => ({ tipo, parent: 'self', section_tipo: 'self' })),
				},
			},
		],
	},
});

/** A locator of the MAIN autocomplete: its `id` is the frame pairing key. */
const mainLocator = (id: number, sectionId: number) => ({
	id,
	section_tipo: TARGET_SECTION,
	section_id: sectionId,
	from_component_tipo: MAIN,
});

/** A stored frame: dd490 + main_component_tipo + id_key → the main locator id. */
const frameLocator = (id: number, sectionId: number, idKey: number) => ({
	id,
	type: 'dd490',
	id_key: idKey,
	section_tipo: FRAME_SECTION,
	section_id: sectionId,
	from_component_tipo: FRAME,
	main_component_tipo: MAIN,
});

/** One translatable input_text slice on the export lang (lg-spa). */
const textSlice = (tipo: string, value: string) => ({ [tipo]: [{ id: 1, lang: 'lg-spa', value }] });

const S = situation({
	name: 'tool_export relation-main dataframe fan-out',
	tld: 'zzxd',
	nodes: [
		{
			tipo: SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'zz owner' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: MAIN,
			parent: SECTION,
			model: 'component_autocomplete',
			term: { 'lg-spa': 'zz main' },
			properties: requestConfig(TARGET_SECTION, [TARGET_LABEL, FRAME]),
		},
		{
			tipo: FRAME,
			parent: MAIN,
			model: 'component_dataframe',
			order_number: 2,
			term: { 'lg-spa': 'zz frame' },
			properties: requestConfig(FRAME_SECTION, [FRAME_LABEL]),
		},
		{
			tipo: TARGET_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'zz target' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: TARGET_LABEL,
			parent: TARGET_SECTION,
			model: 'component_input_text',
			term: { 'lg-spa': 'zz target label' },
			is_translatable: true,
		},
		{
			tipo: FRAME_SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'zz frame section' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: FRAME_LABEL,
			parent: FRAME_SECTION,
			model: 'component_input_text',
			term: { 'lg-spa': 'zz frame label' },
			is_translatable: true,
		},
	],
	records: [
		// The frameless twin: the main only, no frame slot at all.
		{
			section_tipo: SECTION,
			section_id: FRAMELESS_ID,
			columns: { relation: { [MAIN]: [mainLocator(1, 901101)] } },
		},
		// Two main locators, each paired to its own frame by id_key — plus an
		// orphan frame (id_key 9) that pairs nothing.
		{
			section_tipo: SECTION,
			section_id: FRAMED_ID,
			columns: {
				relation: {
					[MAIN]: [mainLocator(1, 901101), mainLocator(2, 901102)],
					[FRAME]: [
						frameLocator(1, 901201, 1),
						frameLocator(2, 901202, 2),
						frameLocator(3, 901203, 9),
					],
				},
			},
		},
		{
			section_tipo: TARGET_SECTION,
			section_id: 901101,
			columns: { string: textSlice(TARGET_LABEL, 'target A') },
		},
		{
			section_tipo: TARGET_SECTION,
			section_id: 901102,
			columns: { string: textSlice(TARGET_LABEL, 'target B') },
		},
		{
			section_tipo: FRAME_SECTION,
			section_id: 901201,
			columns: { string: textSlice(FRAME_LABEL, FRAME_VALUE) },
		},
		{
			section_tipo: FRAME_SECTION,
			section_id: 901202,
			columns: { string: textSlice(FRAME_LABEL, FRAME_VALUE_TWO) },
		},
		{
			section_tipo: FRAME_SECTION,
			section_id: 901203,
			columns: { string: textSlice(FRAME_LABEL, ORPHAN_FRAME_VALUE) },
		},
	],
});

interface Grid {
	columns?: Record<string, unknown>[];
	rows?: Record<string, unknown>[];
	end?: { columns?: unknown };
	meta?: { total?: unknown };
	/** Non-fatal "no atom for this cell model" notes (export/grid.ts). */
	unresolved?: string[];
}

let principal!: Principal;

const contextOf = (options: Record<string, unknown>): ToolActionContext =>
	({ principal, userId: -1, options, background: false }) as ToolActionContext;

/** The declared export path: the main alone, or main → frame (the loud shape). */
function exportPath(declaredFrameStep: boolean) {
	const step = {
		section_tipo: SECTION,
		component_tipo: MAIN,
		model: 'component_autocomplete',
		name: 'zz main',
	};
	return declaredFrameStep
		? [
				step,
				{
					section_tipo: SECTION,
					component_tipo: FRAME,
					model: 'component_dataframe',
					name: 'zz frame',
				},
			]
		: [step];
}

async function exportGrid(
	format: string,
	breakdown: string,
	declaredFrameStep = false,
): Promise<Grid> {
	const response: ToolResponse = await toolExportGetExportGrid(
		contextOf({
			section_tipo: SECTION,
			model: 'section',
			data_format: format,
			breakdown,
			fill_the_gaps: true,
			ar_ddo_to_export: [{ path: exportPath(declaredFrameStep) }],
			sqo: {
				section_tipo: [SECTION],
				limit: 0,
				offset: 0,
				filter_by_locators: [
					{ section_tipo: SECTION, section_id: String(FRAMELESS_ID) },
					{ section_tipo: SECTION, section_id: String(FRAMED_ID) },
				],
			},
		}),
	);
	return (response.data ?? {}) as Grid;
}

/** The retired gate's column projection, verbatim. */
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
/** The retired gate's row projection, verbatim. */
const rowProjection = (row: Record<string, unknown>): Record<string, unknown> => ({
	rec: String(row.rec),
	sub: row.sub,
	c: row.c,
});

const rowOf = (grid: Grid, recordId: number): Record<string, unknown> => {
	const row = (grid.rows ?? []).find((candidate) => String(candidate.rec) === String(recordId));
	expect(row, `no row for record ${recordId}`).toBeDefined();
	return row as Record<string, unknown>;
};

const cellsOf = (grid: Grid, recordId: number): Record<string, unknown>[] =>
	Object.values((rowOf(grid, recordId).c ?? {}) as Record<string, string>).map(
		(cell) => JSON.parse(cell) as Record<string, unknown>,
	);

const columnKeys = (grid: Grid): string[] =>
	(grid.columns ?? []).map((column) => String(column.key));

beforeAll(async () => {
	principal = await resolvePrincipal(-1);
	await ensureSituation(S);
});

afterAll(async () => {
	// Hermetic by ASSERTION, not by trust: no node, no record, no TM/counter row.
	expect(await dropSituation(S)).toBe(0);
});

/** The two grid_value breakdowns that share one indexed level (default ≡ rows). */
const ROW_BREAKDOWNS = ['default', 'rows'];

describe('relation main + component_dataframe: the fan-out mints and fills the frame column', () => {
	for (const breakdown of ROW_BREAKDOWNS) {
		test(`grid_value/${breakdown} — the frame column is minted and the frame VALUE flows`, async () => {
			const grid = await exportGrid('grid_value', breakdown);

			// The old loud gap must stay GONE (closed 2026-07-10).
			expect(
				(grid.unresolved ?? []).filter((note) => note.includes('component_dataframe')),
			).toEqual([]);
			// The frame chain minted a column of its OWN, keyed by the frame tipo,
			// ordered right after the main's own leaf column.
			expect((grid.columns ?? []).map(colProjection)).toEqual([
				{
					i: 0,
					key: `${SECTION}_${MAIN}.${TARGET_SECTION}_${TARGET_LABEL}`,
					group: `${SECTION}_${MAIN}`,
					label: 'zz main | zz target label',
					ar_labels: ['zz owner', 'zz main', 'zz target', 'zz target label'],
					cell_type: 'text',
					model: 'component_input_text',
					after: null,
				},
				{
					i: 1,
					// the frame segment is OWNED by the source record (zzxd1), not by
					// the locator target — the PHP $this->section_* pairing shape
					key: `${SECTION}_${MAIN}.${SECTION}_${FRAME}.${FRAME_SECTION}_${FRAME_LABEL}`,
					group: `${SECTION}_${MAIN}`,
					label: 'zz main | zz frame | zz frame label',
					ar_labels: [
						'zz owner',
						'zz main',
						'zz owner',
						'zz frame',
						'zz frame section',
						'zz frame label',
					],
					cell_type: 'text',
					model: 'component_input_text',
					after: 0,
				},
			]);
			// One row per main locator; the frameless twin FIRST (so the frame
			// column above was minted MID-STREAM) and with an EMPTY frame cell.
			expect((grid.rows ?? []).map(rowProjection)).toEqual([
				{ rec: String(FRAMELESS_ID), sub: 0, c: { '0': 'target A' } },
				{ rec: String(FRAMED_ID), sub: 0, c: { '0': 'target A', '1': FRAME_VALUE } },
				{ rec: String(FRAMED_ID), sub: 1, c: { '0': 'target B', '1': FRAME_VALUE_TWO } },
			]);
			expect(grid.end?.columns).toEqual([0, 1]);
			expect(grid.meta?.total).toBe(2);
			// The orphan frame (id_key 9) pairs no main locator: dataframeEntryMatches
			// is the pairing law, cell adjacency is not.
			expect(JSON.stringify(grid.rows)).not.toContain(ORPHAN_FRAME_VALUE);
		});
	}

	test('grid_value/columns — each main locator carries ITS OWN frame column', async () => {
		const grid = await exportGrid('grid_value', 'columns');
		expect((grid.unresolved ?? []).filter((note) => note.includes('component_dataframe'))).toEqual(
			[],
		);
		// Both indexed levels go to the column dimension: main item 0 and its
		// frame, then main item 1 ('|1') and its frame ('zzxd5|1'). The FULL
		// projection is pinned (the retired gate compared all 8 fields here):
		// note where the 1-based occurrence suffix lands — on the LEAF segment
		// for the main column ('zz target label 2'), on the FRAME segment for the
		// frame column ('zz frame 2'), because the repeated node is the frame
		// slot itself, not the frame's leaf.
		expect((grid.columns ?? []).map(colProjection)).toEqual([
			{
				i: 0,
				key: `${SECTION}_${MAIN}.${TARGET_SECTION}_${TARGET_LABEL}`,
				group: `${SECTION}_${MAIN}`,
				label: 'zz main | zz target label',
				ar_labels: ['zz owner', 'zz main', 'zz target', 'zz target label'],
				cell_type: 'text',
				model: 'component_input_text',
				after: null,
			},
			{
				i: 1,
				key: `${SECTION}_${MAIN}.${SECTION}_${FRAME}.${FRAME_SECTION}_${FRAME_LABEL}`,
				group: `${SECTION}_${MAIN}`,
				label: 'zz main | zz frame | zz frame label',
				ar_labels: [
					'zz owner',
					'zz main',
					'zz owner',
					'zz frame',
					'zz frame section',
					'zz frame label',
				],
				cell_type: 'text',
				model: 'component_input_text',
				after: 0,
			},
			{
				i: 2,
				key: `${SECTION}_${MAIN}.${TARGET_SECTION}_${TARGET_LABEL}|1`,
				group: `${SECTION}_${MAIN}`,
				label: 'zz main | zz target label 2',
				ar_labels: ['zz owner', 'zz main', 'zz target', 'zz target label 2'],
				cell_type: 'text',
				model: 'component_input_text',
				after: 1,
			},
			{
				i: 3,
				key: `${SECTION}_${MAIN}.${SECTION}_${FRAME}|1.${FRAME_SECTION}_${FRAME_LABEL}`,
				group: `${SECTION}_${MAIN}`,
				label: 'zz main | zz frame 2 | zz frame label',
				ar_labels: [
					'zz owner',
					'zz main',
					'zz owner',
					'zz frame 2',
					'zz frame section',
					'zz frame label',
				],
				cell_type: 'text',
				model: 'component_input_text',
				after: 2,
			},
		]);
		expect((grid.rows ?? []).map(rowProjection)).toEqual([
			{ rec: String(FRAMELESS_ID), sub: 0, c: { '0': 'target A' } },
			{
				rec: String(FRAMED_ID),
				sub: 0,
				c: { '0': 'target A', '1': FRAME_VALUE, '2': 'target B', '3': FRAME_VALUE_TWO },
			},
		]);
		expect(grid.end?.columns).toEqual([0, 1, 2, 3]);
		expect(grid.meta?.total).toBe(2);
		expect(JSON.stringify(grid.rows)).not.toContain(ORPHAN_FRAME_VALUE);
	});

	test('value/default — the frame value is folded into the single joined cell', async () => {
		const grid = await exportGrid('value', 'default');
		expect((grid.unresolved ?? []).filter((note) => note.includes('component_dataframe'))).toEqual(
			[],
		);
		// value format mints ONE column per top component (no frame column), and
		// the retired gate pinned all 8 of its fields: the label/ar_labels stop
		// at the MAIN's own leaf (the folded frame never widens the header), the
		// model is the runtime relation alias, not the stored autocomplete.
		expect((grid.columns ?? []).map(colProjection)).toEqual([
			{
				i: 0,
				key: `${SECTION}_${MAIN}`,
				group: `${SECTION}_${MAIN}`,
				label: 'zz main | zz target label',
				ar_labels: ['zz owner', 'zz main', 'zz target', 'zz target label'],
				cell_type: 'text',
				model: 'component_portal',
				after: null,
			},
		]);
		// Per-level joins: leaf fields ', ' inside a locator, ' | ' between
		// locators — with each frame value beside ITS main's label.
		expect((grid.rows ?? []).map(rowProjection)).toEqual([
			{ rec: String(FRAMELESS_ID), sub: 0, c: { '0': 'target A' } },
			{
				rec: String(FRAMED_ID),
				sub: 0,
				c: { '0': `target A, ${FRAME_VALUE} | target B, ${FRAME_VALUE_TWO}` },
			},
		]);
		expect(grid.end?.columns).toEqual([0]);
		expect(grid.meta?.total).toBe(2);
		expect(JSON.stringify(grid.rows)).not.toContain(ORPHAN_FRAME_VALUE);
	});

	test('the FRAMELESS record keeps its own main value and gets no frame cell', async () => {
		const grid = await exportGrid('grid_value', 'default');
		const frameColumns = (grid.columns ?? []).filter((column) =>
			String(column.key).includes(FRAME),
		);
		expect(frameColumns.length).toBeGreaterThan(0);
		const framelessCells = (rowOf(grid, FRAMELESS_ID).c ?? {}) as Record<string, string>;
		for (const column of frameColumns) {
			expect(framelessCells[String(column.i)]).toBeUndefined();
		}
		// An absent frame is an empty cell, never a dropped row or a dropped main.
		expect(Object.values(framelessCells)).toEqual(['target A']);
	});
});

describe('dedalo_raw: the frame slot is its OWN column (WC-2026-08-09)', () => {
	test('one column per component, every cell a bare {"dedalo_data": <array>}', async () => {
		const grid = await exportGrid('dedalo_raw', 'default');
		expect(columnKeys(grid)).toEqual([`${SECTION}_${MAIN}`, `${SECTION}_${FRAME}`]);
		const [mainColumn, frameColumn] = grid.columns ?? [];
		// dedalo_raw headers are RAW TIPOS (the import header grammar).
		expect(colProjection(frameColumn as Record<string, unknown>)).toEqual({
			i: 1,
			key: `${SECTION}_${FRAME}`,
			group: `${SECTION}_${FRAME}`,
			label: FRAME,
			ar_labels: [SECTION, FRAME],
			cell_type: 'text',
			model: 'component_dataframe',
			after: mainColumn?.i, // ordered immediately after its main
		});

		const framedCells = (rowOf(grid, FRAMED_ID).c ?? {}) as Record<string, string>;
		// The frames, in their own cell, WHOLE (the orphan included: dedalo_raw is
		// a lossless dump of the stored slice, not a resolution).
		expect(JSON.parse(framedCells[String(frameColumn?.i)] ?? 'null')).toEqual({
			dedalo_data: [
				frameLocator(1, 901201, 1),
				frameLocator(2, 901202, 2),
				frameLocator(3, 901203, 9),
			],
		});
		// EVERY raw cell of the framed record: the wrapper, an array under it,
		// nothing else — no {dato|data, dataframe} envelope, ever.
		for (const cell of cellsOf(grid, FRAMED_ID)) {
			expect(Object.keys(cell)).toEqual(['dedalo_data']);
			expect(Array.isArray(cell.dedalo_data)).toBe(true);
		}
		expect(JSON.stringify(framedCells)).not.toContain('"dato"');
		expect(JSON.stringify(framedCells)).not.toContain('"dataframe"');
		// The frameless record: its main cell only, the frame column empty — the
		// column set is ONTOLOGY-driven, so it does not depend on the data.
		expect((rowOf(grid, FRAMELESS_ID).c as Record<string, string>)[String(frameColumn?.i)]).toBe(
			undefined,
		);
		expect((grid.rows ?? []).map((row) => String(row.rec))).toEqual([
			String(FRAMELESS_ID),
			String(FRAMED_ID),
		]);
		expect(grid.meta?.total).toBe(2);
	});
});

describe('a DECLARED dataframe path step stays LOUD', () => {
	test("unresolved carries 'component_dataframe:declared-path' and no atoms are invented", async () => {
		const grid = await exportGrid('grid_value', 'default', true);
		expect(
			(grid.unresolved ?? []).some((note) => note.includes('component_dataframe:declared-path')),
		).toBe(true);
		// Loud, and EMPTY: never a silent mis-walk of the frames.
		expect(grid.columns ?? []).toEqual([]);
		expect((grid.rows ?? []).map(rowProjection)).toEqual([
			{ rec: String(FRAMELESS_ID), sub: 0, c: {} },
			{ rec: String(FRAMED_ID), sub: 0, c: {} },
		]);
		expect(grid.meta?.total).toBe(2);
	});

	test('the value format refuses the same declared step, on its OWN code path', async () => {
		// grid_value walks collectGridAtoms, value walks resolveValueCell: the
		// loudness is a contract of BOTH, so both are gated.
		const grid = await exportGrid('value', 'default', true);
		expect(
			(grid.unresolved ?? []).some((note) => note.includes('component_dataframe:declared-path')),
		).toBe(true);
		// The header still describes the declared path (the column is minted from
		// the ddo, not from the data) but EVERY cell is empty: refusing to walk a
		// declared frame step may never degrade into inventing a value.
		expect((grid.columns ?? []).map(colProjection)).toEqual([
			{
				i: 0,
				key: `${SECTION}_${MAIN}`,
				group: `${SECTION}_${MAIN}`,
				label: 'zz main | zz frame',
				ar_labels: ['zz owner', 'zz main', 'zz owner', 'zz frame'],
				cell_type: 'text',
				model: 'component_portal',
				after: null,
			},
		]);
		expect((grid.rows ?? []).map(rowProjection)).toEqual([
			{ rec: String(FRAMELESS_ID), sub: 0, c: {} },
			{ rec: String(FRAMED_ID), sub: 0, c: {} },
		]);
		expect(grid.meta?.total).toBe(2);
	});
});
