/**
 * WC-2026-08-09-export-raw-dataframe-own-column gate — a dataframe slot is its
 * OWN raw-export column.
 *
 * Contract under test (src/diffusion/export/grid.ts buildRawCell + the
 * dedalo_raw branch of buildEntries):
 *  - EVERY dedalo_raw cell is `{"dedalo_data": <the component's stored slice>}`
 *    and nothing else: no {data|dato, dataframe} envelope, ever;
 *  - a component with dataframe children mints ONE EXTRA column per slot,
 *    keyed/headed by the FRAME tipo and carrying the slot's own stored data,
 *    ordered immediately after its main;
 *  - the extra column is ontology-driven, so it mints for a frameless record
 *    too (empty cell) — the column set of a run does not depend on the data;
 *  - and it RE-IMPORTS: the frame cell unwraps + conforms back to the stored
 *    locators, id_key intact (that key, not cell adjacency, is the pairing).
 *
 * Fixture (portable — the numisdata corpus is NOT in the test DB): the
 * canonical test3 playground plus ONE synthetic dd_ontology node, 'zzdf1'
 * (tld 'zzdf' — no real install uses it), a component_dataframe child of the
 * literal main test52. test3's own test60 dataframe hangs off the test45
 * GROUP, not off a component, so it can never be a slot of anything. Scratch
 * records live in the test3 916000-916099 id namespace on matrix_test; both
 * the node and the rows are swept in afterAll and the ontology caches cleared
 * on the way in and out.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { conformImportData, unwrapDedaloData } from '../../src/core/tools/import_data.ts';
import type { ToolActionContext, ToolResponse } from '../../src/core/tools/module.ts';
import { toolExportGetExportGrid } from '../../tools/tool_export/server/tool_export.ts';

const SECTION = 'test3';
const MAIN = 'test52'; // component_input_text — the framed main
const FRAME = 'zzdf1'; // the synthetic component_dataframe slot of MAIN
const FRAME_TLD = 'zzdf';
const FRAMED_ID = 916000; // the record with a frame
const FRAMELESS_ID = 916001; // its frameless twin (column-minting pin)

let principal!: Principal;

const contextOf = (options: Record<string, unknown>): ToolActionContext =>
	({ principal, userId: -1, options, background: false }) as ToolActionContext;

/** The stored slice of MAIN on the scratch rows. */
const mainItems = [{ id: 1, lang: 'lg-spa', value: 'framed main value' }];

/** The stored frame: a dd490 locator paired to main item id 1 by id_key. */
const frameItems = [
	{
		id: 1,
		type: 'dd490',
		id_key: 1,
		section_id: '27',
		section_tipo: SECTION,
		from_component_tipo: FRAME,
		main_component_tipo: MAIN,
	},
];

async function insertScratchRecord(
	sectionId: number,
	relation: Record<string, unknown>,
): Promise<void> {
	// $N::text::jsonb — bind as TEXT so postgres parses it (a bare ::jsonb bind
	// stores a jsonb STRING scalar — the ledgered Bun.sql trap, json_codec.ts).
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, string, relation)
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[sectionId, SECTION, JSON.stringify({ [MAIN]: mainItems }), JSON.stringify(relation)],
	);
}

beforeAll(async () => {
	principal = await resolvePrincipal(-1);
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1', [FRAME_TLD]); // crashed prior run
	await sql.unsafe(
		`INSERT INTO dd_ontology (tipo, parent, model, tld, term, is_model, is_translatable, is_main)
		 VALUES ($1, $2, 'component_dataframe', $3, $4::text::jsonb, false, false, false)`,
		[FRAME, MAIN, FRAME_TLD, JSON.stringify({ 'lg-eng': 'zz scratch frame' })],
	);
	clearOntologyDerivedCaches();
	for (const id of [FRAMED_ID, FRAMELESS_ID]) {
		await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
			SECTION,
			id,
		]);
	}
	await insertScratchRecord(FRAMED_ID, { [FRAME]: frameItems });
	await insertScratchRecord(FRAMELESS_ID, {});
});

afterAll(async () => {
	for (const id of [FRAMED_ID, FRAMELESS_ID]) {
		await sql.unsafe('DELETE FROM matrix_test WHERE section_tipo = $1 AND section_id = $2', [
			SECTION,
			id,
		]);
	}
	await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1', [FRAME_TLD]);
	clearOntologyDerivedCaches();
});

type ProtocolLine = { t: string; i?: number; key?: string; ar_labels?: string[] } & Record<
	string,
	unknown
>;

const rawExport = async (
	ids: number[],
): Promise<{ columns: ProtocolLine[]; rows: ProtocolLine[] }> => {
	const response: ToolResponse = await toolExportGetExportGrid(
		contextOf({
			section_tipo: SECTION,
			model: 'section',
			data_format: 'dedalo_raw',
			breakdown: 'default',
			ar_ddo_to_export: [{ path: [{ section_tipo: SECTION, component_tipo: MAIN, name: MAIN }] }],
			sqo: {
				section_tipo: [SECTION],
				limit: 0,
				offset: 0,
				filter_by_locators: ids.map((id) => ({
					section_tipo: SECTION,
					section_id: String(id),
				})),
			},
		}),
	);
	const result = response.result as { columns: ProtocolLine[]; rows: ProtocolLine[] };
	expect(Array.isArray(result?.columns)).toBe(true);
	return result;
};

const columnOf = (columns: ProtocolLine[], key: string): ProtocolLine => {
	const column = columns.find((candidate) => candidate.key === key);
	expect(column, `column '${key}' was not minted`).toBeDefined();
	return column as ProtocolLine;
};

const cellOf = (rows: ProtocolLine[], recordId: number, ordinal: unknown): string | undefined => {
	const row = rows.find((candidate) => String(candidate.rec) === String(recordId));
	return (row?.c as Record<string, string> | undefined)?.[String(ordinal)];
};

describe('dedalo_raw: the dataframe slot is its own column', () => {
	test('the MAIN cell is the bare {"dedalo_data": …} — no envelope, no `dato` key', async () => {
		const { columns, rows } = await rawExport([FRAMED_ID]);
		const main = columnOf(columns, `${SECTION}_${MAIN}`);
		const cell = cellOf(rows, FRAMED_ID, main.i);
		expect(cell).toBeDefined();
		// The exact bytes: the stored slice, wrapped once.
		expect(JSON.parse(cell as string)).toEqual({ dedalo_data: mainItems });
		// The retired shape, spelled out so it cannot come back unnoticed.
		expect(cell).not.toContain('"dato"');
		expect(cell).not.toContain('"dataframe"');
	});

	test('the frame slot mints its OWN column, headed by the FRAME tipo, right after its main', async () => {
		const { columns, rows } = await rawExport([FRAMED_ID]);
		const main = columnOf(columns, `${SECTION}_${MAIN}`);
		const frame = columnOf(columns, `${SECTION}_${FRAME}`);
		// dedalo_raw headers are RAW TIPOS (the import header grammar): the
		// column re-imports by name, like any other component.
		expect(frame.label).toBe(FRAME);
		expect(frame.ar_labels).toEqual([SECTION, FRAME]);
		expect(frame.model).toBe('component_dataframe');
		expect(frame.after).toBe(main.i); // ordered immediately after its main
		expect(JSON.parse(cellOf(rows, FRAMED_ID, frame.i) as string)).toEqual({
			dedalo_data: frameItems,
		});
	});

	test('the frame column is ONTOLOGY-driven: it mints for a frameless record too', async () => {
		const { columns, rows } = await rawExport([FRAMELESS_ID]);
		const frame = columnOf(columns, `${SECTION}_${FRAME}`);
		// minted, but empty — a column set that depended on the data would make
		// two runs of the same export produce different files.
		expect(cellOf(rows, FRAMELESS_ID, frame.i)).toBeUndefined();
	});

	test('the frame cell RE-IMPORTS: unwrap + conform reproduce the stored locators', async () => {
		const { columns, rows } = await rawExport([FRAMED_ID]);
		const frame = columnOf(columns, `${SECTION}_${FRAME}`);
		const unwrapped = unwrapDedaloData(cellOf(rows, FRAMED_ID, frame.i) as string);
		expect(unwrapped.wrapped).toBe(true);
		expect(unwrapped.dataframe).toBeNull(); // no legacy envelope in play
		const conformed = await conformImportData({
			model: 'component_dataframe',
			importValue: unwrapped.value,
			columnName: FRAME,
			sectionTipo: SECTION,
			sectionId: FRAMED_ID,
			componentTipo: FRAME,
			lang: 'lg-nolan',
			wrapped: unwrapped.wrapped,
		});
		expect(conformed.errors).toEqual([]);
		// id_key survives the round trip — it, and not the cell it travelled in,
		// is what re-pairs the frame with the main's item.
		// WC-2026-08-10-section-id-int-canonical: the EXPORT cell is the stored
		// bytes verbatim (legacy string '27', asserted above), but the IMPORT
		// conform canonicalizes the address — so the re-imported frame is int.
		expect(conformed.result).toEqual(frameItems.map((f) => ({ ...f, section_id: 27 })));
	});
});

describe('the LEGACY {data|dato, dataframe} envelope stays IMPORTABLE', () => {
	// Files exported before 2026-08-09 (and v6/PHP-era files, which spelled the
	// key `dato`) carry the frames inside their main's cell. Nothing writes that
	// shape any more; reading it must never regress.
	for (const key of ['data', 'dato']) {
		test(`'${key}' envelope: the frames split out and the value survives`, () => {
			const out = unwrapDedaloData(
				JSON.stringify({ dedalo_data: { [key]: mainItems, dataframe: frameItems } }),
			);
			expect(out.wrapped).toBe(true);
			expect(JSON.parse(out.value)).toEqual(mainItems);
			expect(out.dataframe).toEqual(frameItems);
			expect(out.hasData).toBe(true);
		});
	}
});
