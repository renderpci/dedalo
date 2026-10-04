/**
 * THE READERS SPLIT A COMPOSED TM ROW (2026-09-27, WC …-bulk-revert-undo-log
 * §COMPOSED ROWS; PHP component_common::get_data data_source='tm').
 *
 * A main component's history row is COMPOSED: its own items followed by the
 * full frames of every dataframe slot (relations/dataframe_slots.ts). Every
 * reader that renders a snapshot must show the main from
 * the main half and each slot from the frame half — never a frame as a main
 * item, never today's frames as the snapshot's:
 *
 *   - the PREVIEW of the main (section/read.ts resolveTmPreview) serves the main
 *     items only;
 *   - the PREVIEW of a dataframe slot by the MAIN's row id (PHP reads the main's
 *     row for a component_dataframe) serves the frames that row recorded, not
 *     the live ones — it used to strip them all and answer EMPTY;
 *   - every row of a main is composed (decision 2026-09-28: PHP-era rows always
 *     were, TS-era beta rows are unsupported), so a row with no frame — written
 *     by the engine or PHP-shaped — previews the slot EMPTY, and a PHP-era row
 *     with frames previews them;
 *   - the dd15 LIST (tm_record.ts buildTmSectionRecord, via readTimeMachineData)
 *     renders the main's cell without frames, keeps the RAW row under dd1574,
 *     and puts the frames under the slot — scoped to the row's main (a shared
 *     slot's frames of ANOTHER main are not this main's history).
 *
 * Situation BUILT on the generic `test` TLD: host test6099 (matrix_test),
 * portal test6155 with its dataframe slot test6783 (the pair
 * dataframe_cascade_removal drives), frames targeting test6100. Scratch hosts
 * are created at runtime and removed with their TM rows afterwards.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { readTimeMachineRow } from '../../src/core/db/time_machine.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { resolveDataframeSlotTipos } from '../../src/core/relations/dataframe_slots.ts';
import { readTimeMachineData } from '../../src/core/resolve/read_tm.ts';
import { readComponentData } from '../../src/core/section/read.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { buildTmSectionRecord, snapshotSlotFrames } from '../../src/core/tm_record/tm_record.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const HOST = 'test6099';
const PORTAL = 'test6155';
const SLOT = 'test6783';
const OTHER_MAIN = 'test6154';
const USER_ID = 1;

let TABLE = '';
const hosts: number[] = [];

const portalItem = (id: number, target: number) => ({
	id,
	type: 'dd151',
	section_id: String(target),
	section_tipo: 'test2',
	from_component_tipo: PORTAL,
});

const frame = (idKey: number, target: number, main = PORTAL) => ({
	type: 'dd490',
	section_id: String(target),
	section_tipo: 'test6100',
	from_component_tipo: SLOT,
	main_component_tipo: main,
	id_key: idKey,
});

async function setRelation(hostId: number, relation: Record<string, unknown>): Promise<void> {
	await sql.unsafe(
		`UPDATE "${TABLE}" SET relation = COALESCE(relation, '{}'::jsonb) || $1::text::jsonb
		 WHERE section_tipo = $2 AND section_id = $3`,
		[JSON.stringify(relation), HOST, hostId],
	);
}

/**
 * A host whose portal holds items 1+2 with a frame each, then a REAL engine
 * save removing item 2 — its composed row records [item 1, frame(1 → 5)].
 * Returns the host and that row's id.
 */
async function hostWithComposedRow(): Promise<{ hostId: number; rowId: number }> {
	const hostId = await createSectionRecord(HOST, -1);
	hosts.push(hostId);
	await setRelation(hostId, {
		[PORTAL]: [portalItem(1, 1), portalItem(2, 2)],
		[SLOT]: [frame(1, 5), frame(2, 6)],
	});
	const saved = await saveComponentData({
		componentTipo: PORTAL,
		sectionTipo: HOST,
		sectionId: hostId,
		lang: 'lg-nolan',
		changedData: [{ action: 'remove', id: 2, value: null }],
		userId: USER_ID,
	});
	expect(saved.ok).toBe(true);
	const rows = (await sql.unsafe(
		`SELECT id, data FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ORDER BY id DESC LIMIT 1`,
		[HOST, hostId, PORTAL],
	)) as { id: number; data: unknown }[];
	// FLOOR: the situation is a composed row (its frame recorded after the main)
	expect((rows[0]?.data as { type?: string }[]).some((entry) => entry.type === 'dd490')).toBe(true);
	return { hostId, rowId: Number(rows[0]?.id) };
}

/** A raw history row of the portal (the PHP-era writer shape). */
async function insertRow(hostId: number, data: unknown): Promise<number> {
	const rows = (await sql.unsafe(
		`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
		 VALUES ($1, $2, $3, 'lg-nolan', '2026-07-01 10:00:00', $4, $5::text::jsonb)
		 RETURNING id`,
		[hostId, HOST, PORTAL, USER_ID, JSON.stringify(data)],
	)) as { id: number }[];
	return Number(rows[0]?.id);
}

type Item = { tipo: string; entries?: Record<string, unknown>[] };

/** The TM preview of `tipo` from row `matrixId` (the tool's preview pane request). */
async function preview(
	tipo: string,
	hostId: number,
	matrixId: number,
	idKey?: number,
): Promise<Item[]> {
	return (await readComponentData({
		source: {
			tipo,
			section_tipo: HOST,
			section_id: hostId,
			lang: 'lg-nolan',
			mode: 'edit',
			data_source: 'tm',
			matrix_id: matrixId,
			...(idKey === undefined
				? {}
				: {
						caller_dataframe: {
							main_component_tipo: PORTAL,
							id_key: idKey,
							section_tipo: HOST,
							section_id: hostId,
						},
					}),
		},
	} as never)) as Item[];
}

/** The target ids of the frames a slot preview serves for main item `idKey`. */
async function previewedFrameTargets(
	hostId: number,
	matrixId: number,
	idKey: number,
): Promise<string[]> {
	const items = await preview(SLOT, hostId, matrixId, idKey);
	return items
		.filter((item) => item.tipo === SLOT)
		.flatMap((item) => item.entries ?? [])
		.map((entry) => String(entry.section_id));
}

beforeAll(async () => {
	await assertTestDatabase('tm_composed_read_split_native');
	TABLE = (await getMatrixTableFromTipo(HOST)) ?? '';
	expect(TABLE).toBe('matrix_test');
	// The situation's slot wiring, asserted rather than assumed.
	expect(await resolveDataframeSlotTipos(PORTAL)).toContain(SLOT);
});

afterAll(async () => {
	for (const hostId of hosts) await cleanScratchRecord(HOST, hostId, TABLE);
});

describe('the TM preview splits a composed row', () => {
	test('the main previews its own items, no frame among them', async () => {
		const { hostId, rowId } = await hostWithComposedRow();
		const items = await preview(PORTAL, hostId, rowId);
		const main = items.filter((item) => item.tipo === PORTAL).flatMap((item) => item.entries ?? []);
		expect(main.map((entry) => entry.id)).toEqual([1]);
		expect(main.filter((entry) => entry.type === 'dd490')).toEqual([]);
	}, 30000);

	test('the slot previews the frames the MAIN row recorded, not the live ones', async () => {
		const { hostId, rowId } = await hostWithComposedRow();
		await setRelation(hostId, { [SLOT]: [frame(1, 99)] }); // a later, unrecorded edit
		expect(await previewedFrameTargets(hostId, rowId, 1)).toEqual(['5']);
	}, 30000);

	test('a FRAMELESS row previews the slot EMPTY, never today’s frames (no frames at that time)', async () => {
		const { hostId } = await hostWithComposedRow();
		await setRelation(hostId, { [SLOT]: [frame(1, 99)] });
		const frameless = await insertRow(hostId, [portalItem(1, 1)]);
		expect(await previewedFrameTargets(hostId, frameless, 1)).toEqual([]);
	}, 30000);

	// PHP-era (v6) rows recorded their frames and preview THOSE (the restore
	// half: tm_dataframe_restore_native "apply_value restores the paired
	// dataframe frames").
	test('a PHP-era row WITH frames previews its recorded frames, not the live ones', async () => {
		const { hostId } = await hostWithComposedRow();
		await setRelation(hostId, { [SLOT]: [frame(1, 99)] });
		const phpEra = await insertRow(hostId, [portalItem(1, 1), frame(1, 7)]);
		expect(await previewedFrameTargets(hostId, phpEra, 1)).toEqual(['7']);
	}, 30000);
});

describe('the dd15 list splits a composed row', () => {
	test('main cell without frames, the RAW row under dd1574, the frames under the slot', async () => {
		const { hostId, rowId } = await hostWithComposedRow();
		const { data } = await readTimeMachineData({
			sqo: {
				filter_by_locators: [{ section_tipo: HOST, section_id: hostId, tipo: PORTAL }],
				limit: 10,
			},
			source: { lang: 'lg-nolan' },
			show: {
				ddo_map: [
					{ tipo: PORTAL, section_tipo: 'dd15' },
					{ tipo: 'dd1574', section_tipo: 'dd15' },
				],
			},
		} as never);
		const cells = (data as (Item & { section_id?: unknown })[]).filter(
			(item) => Number(item.section_id) === rowId,
		);
		const cellOf = (tipo: string) =>
			cells.filter((item) => item.tipo === tipo).flatMap((item) => item.entries ?? []);
		// FLOOR: the row rendered both cells.
		expect(cellOf(PORTAL).map((entry) => entry.id)).toEqual([1]);
		expect(cellOf(PORTAL).filter((entry) => entry.type === 'dd490')).toEqual([]);
		expect(cellOf('dd1574').length).toBeGreaterThan(0);
		// The virtual dd15 record the cells resolve from: the frames under the
		// slot, the RAW composed row under dd1574.
		const row = await readTimeMachineRow(rowId);
		const record = await buildTmSectionRecord(
			{ ...(row as object), timestamp: null } as never, // the builder takes the list's ::text stamp
			'lg-nolan',
			[SLOT],
		);
		const relation = record.columns.relation as Record<string, Record<string, unknown>[]>;
		expect(relation[SLOT]).toStrictEqual([frame(1, 5)]);
		expect(relation[PORTAL]).toStrictEqual([portalItem(1, 1)]);
		expect(row?.data).toEqual([portalItem(1, 1), frame(1, 5)]);
	}, 30000);

	test('snapshotSlotFrames: per slot, scoped to the main, a legacy frame to the only slot', async () => {
		const legacy = { type: 'dd490', section_id: '7', section_tipo: 'test6100', id_key: 1 };
		const bySlot = await snapshotSlotFrames(
			PORTAL,
			[portalItem(1, 1), frame(1, 5), frame(1, 8, OTHER_MAIN), legacy],
			[SLOT],
		);
		expect([...bySlot.keys()]).toEqual([SLOT]);
		expect(bySlot.get(SLOT)?.map((entry) => entry.section_id)).toEqual(['5', '7']);
		// A frame naming a tipo that is no dataframe names no slot: inert.
		const inert = await snapshotSlotFrames(
			PORTAL,
			[{ ...frame(1, 5), from_component_tipo: 'test6100' }],
			[],
		);
		expect([...inert.keys()]).toEqual([]);
	});
});
