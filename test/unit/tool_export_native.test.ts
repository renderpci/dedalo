/**
 * tool_export flat grid — TS-NATIVE TWIN (DEC-14b) of
 * test/parity/tool_export_differential.test.ts.
 *
 * The parity gate replays frozen PHP bodies harvested against monedaiberica
 * records the derived corpus can never hold (a tool_export grid is DISPLAY
 * STRINGS — derive_test_corpus.ts refuses its records as `never_revealed`), so
 * it is red BY CONSTRUCTION on the suite database. This twin BUILDS its data
 * (test/helpers/zzbib_export_chain.ts) and pins, with exact expected cells,
 * the rules the frozen bodies state (fixture hashes noted per case; every rule
 * was transcribed from the frozen store, never from the TS implementation):
 *
 *   - data_format 'rows' NORMALIZES to 'value' (frozen 897c3d28 meta) — flat
 *     display strings, one row per record, column key '<section>_<component>';
 *   - multi-hop paths: the COLUMN is the first declared step; the VALUE walks
 *     each hop's locators to the leaf, multi-item joins use the level-0 ' | '
 *     separator (frozen 75221f1d);
 *   - dedalo_raw: the stored slice VERBATIM under the {"dedalo_data": …}
 *     wrapper, cell_type json — literal items and relation locators alike
 *     (frozen eeb6f489). The framed-main case of the parity gate is pinned
 *     natively by tool_export_raw_dataframe_native.test.ts
 *     (WC-2026-08-09-export-raw-dataframe-own-column — TS deliberately
 *     retired the {dato,dataframe} fold);
 *   - media cells: the export value of a component_image is the ABSOLUTE URL
 *     of its default quality — exportBase + stored files_info file_path,
 *     column cell_type 'img' (frozen a5a1a97e). Gated on
 *     DEDALO_MEDIA_EXPORT_BASE being configured: unset, the case SKIPS
 *     visibly (the URL builder refuses by contract; see
 *     tool_transcription.test.ts for the same seam).
 *
 * The NDJSON protocol + stream≡buffered duality and the per-column emission
 * floors live in test/unit/diffusion_export_unified.test.ts (built chain).
 * The multi-target autocomplete_hi thesaurus explosion (frozen 711fa556,
 * per-target-section term columns) remains pinned ONLY by the frozen record —
 * building it needs a hierarchical thesaurus situation; see the parity gate.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { dropSituation, ensureSituation } from '../../src/core/test_data/situations/situation.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { toolExportGetExportGrid } from '../../tools/tool_export/server/tool_export.ts';
import {
	ZZBIB_IMAGE,
	ZZBIB_IMAGE_FILE_PATH,
	ZZBIB_LITERAL,
	ZZBIB_MAIN_ID,
	ZZBIB_MAIN_SECTION,
	ZZBIB_MEDIA_ID,
	ZZBIB_MEDIA_NAME,
	ZZBIB_MEDIA_SECTION,
	ZZBIB_PAGES,
	ZZBIB_PORTAL,
	ZZBIB_REF_SECTION,
	ZZBIB_SITUATION,
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

const options = (
	sectionTipo: string,
	dataFormat: string,
	ddos: unknown[],
	ids: (string | number)[],
): Record<string, unknown> => ({
	section_tipo: sectionTipo,
	model: 'section',
	data_format: dataFormat,
	breakdown: 'default',
	ar_ddo_to_export: ddos,
	sqo: {
		section_tipo: [sectionTipo],
		limit: 0,
		offset: 0,
		filter_by_locators: ids.map((id) => ({ section_tipo: sectionTipo, section_id: String(id) })),
	},
});

const step = (section_tipo: string, component_tipo: string, model: string, name: string) => ({
	section_tipo,
	component_tipo,
	model,
	name,
});

/** The stable column identity the parity gate compared. */
const stableColumn = (column: Record<string, unknown>): Record<string, unknown> => ({
	t: column.t,
	i: column.i,
	key: column.key,
	cell_type: column.cell_type,
});
const stripRow = (row: Record<string, unknown>): Record<string, unknown> => ({
	rec: String(row.rec),
	sub: row.sub,
	c: row.c,
});

describe('tool_export flat grid native twin (frozen rules on a built chain)', () => {
	// Frozen 897c3d28: the legacy 'rows' request normalizes to data_format
	// 'value' — flat display strings, one row per record.
	test("data_format 'rows' normalizes to 'value' and emits flat display strings", async () => {
		const grid = await gridOf(
			options(
				ZZBIB_MAIN_SECTION,
				'rows',
				[
					{ path: [step(ZZBIB_MAIN_SECTION, ZZBIB_LITERAL, 'component_input_text', 'Ref')] },
					{ path: [step(ZZBIB_MAIN_SECTION, ZZBIB_PORTAL, 'component_portal', 'Bibliography')] },
				],
				[ZZBIB_MAIN_ID],
			),
		);
		expect(grid.meta?.data_format).toBe('value');
		expect(grid.meta?.total).toBe(1);
		expect((grid.columns ?? []).map(stableColumn)).toEqual([
			{ t: 'col', i: 0, key: `${ZZBIB_MAIN_SECTION}_${ZZBIB_LITERAL}`, cell_type: 'text' },
			{ t: 'col', i: 1, key: `${ZZBIB_MAIN_SECTION}_${ZZBIB_PORTAL}`, cell_type: 'text' },
		]);
		expect((grid.rows ?? []).map(stripRow)).toEqual([
			{
				rec: String(ZZBIB_MAIN_ID),
				sub: 0,
				c: {
					0: 'zzbib main one',
					// The portal flat: each reference's map children (pages | title +
					// authors), references joined by the level-0 ' | ' separator.
					1: 'zzbib pages 1 | zzbib title one | zzbib surname A, zzbib name A, zzbib surname B, zzbib name B | zzbib pages 2 | zzbib title two | zzbib surname C, zzbib name C | zzbib pages 3 | zzbib title three | zzbib surname D, zzbib name D',
				},
			},
		]);
	}, 60000);

	// Frozen 75221f1d: a 2-hop path — the column is the FIRST declared step,
	// the value walks the portal's locators and reads the leaf on each target.
	test('multi-hop value: column = first step, value = leaf on each hop target', async () => {
		const grid = await gridOf(
			options(
				ZZBIB_MAIN_SECTION,
				'value',
				[
					{
						path: [
							step(ZZBIB_MAIN_SECTION, ZZBIB_PORTAL, 'component_portal', 'Bibliography'),
							step(ZZBIB_REF_SECTION, ZZBIB_PAGES, 'component_input_text', 'Pages'),
						],
					},
				],
				[ZZBIB_MAIN_ID],
			),
		);
		expect((grid.columns ?? []).map(stableColumn)).toEqual([
			{ t: 'col', i: 0, key: `${ZZBIB_MAIN_SECTION}_${ZZBIB_PORTAL}`, cell_type: 'text' },
		]);
		// Column label extends the declared chain by the leaf (PHP atoms[0] path).
		expect(grid.columns?.[0]?.label).toBe('zzbib bibliography | zzbib pages');
		expect((grid.rows ?? []).map(stripRow)).toEqual([
			{
				rec: String(ZZBIB_MAIN_ID),
				sub: 0,
				c: { 0: 'zzbib pages 1 | zzbib pages 2 | zzbib pages 3' },
			},
		]);
	}, 60000);

	// Frozen eeb6f489: dedalo_raw ships the STORED slice verbatim under the
	// {"dedalo_data": …} wrapper — literal items and relation locators alike.
	test('dedalo_raw: literal items and relation locators under the dedalo_data wrapper', async () => {
		const grid = await gridOf(
			options(
				ZZBIB_MAIN_SECTION,
				'dedalo_raw',
				[
					{ path: [step(ZZBIB_MAIN_SECTION, ZZBIB_LITERAL, 'component_input_text', 'Ref')] },
					{ path: [step(ZZBIB_MAIN_SECTION, ZZBIB_PORTAL, 'component_portal', 'Bibliography')] },
				],
				[ZZBIB_MAIN_ID],
			),
		);
		expect((grid.columns ?? []).map(stableColumn)).toEqual([
			{ t: 'col', i: 0, key: `${ZZBIB_MAIN_SECTION}_${ZZBIB_LITERAL}`, cell_type: 'json' },
			{ t: 'col', i: 1, key: `${ZZBIB_MAIN_SECTION}_${ZZBIB_PORTAL}`, cell_type: 'json' },
		]);
		const cells = (grid.rows?.[0]?.c ?? {}) as Record<string, string>;
		expect(JSON.parse(String(cells[0]))).toEqual({
			dedalo_data: [{ id: 1, lang: 'lg-eng', value: 'zzbib main one' }],
		});
		expect(JSON.parse(String(cells[1]))).toEqual({
			dedalo_data: [960101, 960102, 960103].map((id, index) => ({
				id: index + 1,
				type: 'dd151',
				section_id: id,
				section_tipo: ZZBIB_REF_SECTION,
				from_component_tipo: ZZBIB_PORTAL,
			})),
		});
	}, 60000);

	// Frozen a5a1a97e: the image cell is the ABSOLUTE default-quality URL and
	// the column carries cell_type 'img'. Config-gated: without an export base
	// the URL builder refuses by contract, so the case SKIPS visibly.
	const hasExportBase = config.media.exportBase !== undefined && config.media.exportBase !== '';
	test.if(hasExportBase)(
		'media cells: img cell_type + absolute default-quality URL',
		async () => {
			const grid = await gridOf(
				options(
					ZZBIB_MEDIA_SECTION,
					'value',
					[
						{ path: [step(ZZBIB_MEDIA_SECTION, ZZBIB_IMAGE, 'component_image', 'Image')] },
						{ path: [step(ZZBIB_MEDIA_SECTION, ZZBIB_MEDIA_NAME, 'component_input_text', 'Name')] },
					],
					[ZZBIB_MEDIA_ID],
				),
			);
			expect((grid.columns ?? []).map(stableColumn)).toEqual([
				{ t: 'col', i: 0, key: `${ZZBIB_MEDIA_SECTION}_${ZZBIB_IMAGE}`, cell_type: 'img' },
				{ t: 'col', i: 1, key: `${ZZBIB_MEDIA_SECTION}_${ZZBIB_MEDIA_NAME}`, cell_type: 'text' },
			]);
			expect((grid.rows ?? []).map(stripRow)).toEqual([
				{
					rec: String(ZZBIB_MEDIA_ID),
					sub: 0,
					c: {
						0: `${config.media.exportBase}${ZZBIB_IMAGE_FILE_PATH}`,
						1: 'zzbib media one',
					},
				},
			]);
		},
		60000,
	);
});
