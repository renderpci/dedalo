/**
 * A FRAME NAMING A MAIN THE ONTOLOGY NO LONGER HOLDS never blocks a door.
 *
 * A frame's `main_component_tipo` is DATA: on a long-lived install it outlives
 * the ontology edit that removed its main. History attribution of a slot change
 * (relations/dataframe_slots.ts attributeSlotMains) drops such a name and falls
 * through to the slot's declaring parent — it never refuses. Before the fix,
 * `mainIdentity` threw `engine.uncovered_scope` on the stale name, so:
 *   - deleting the record the frame targets failed the whole delete (the
 *     inverse-reference strip attributes the stripped frame);
 *   - a slot save removing the frame failed.
 *
 * OUTCOMES pinned: the delete succeeds, the stale frame is stripped, a live
 * frame of the same slot survives, and the change is recorded under the
 * declaring parent's composed row; the slot save likewise.
 *
 * AN ORPHAN — a stale or unstamped frame in a slot with NO declaring parent (a
 * slot only a main's request_config names, its ontology parent the section):
 * no main can own the change. The strip, wipe and delete doors remove it and
 * write no history for it (attributeSlotMains orphan 'skip'); before, each
 * refused `engine.uncovered_scope` inside its transaction and rolled back —
 * the record delete, Delete data and the portal locator removal.
 *
 * SITUATION: a `zzsdm` scratch section on `test1` (→ matrix_test): a portal
 * MAIN declaring SLOT (its child + request_config); a portal CMAIN naming
 * CSLOT only in its request_config (CSLOT's parent is the section). STALE is a
 * tipo with no ontology node. Records are created at runtime; the stale frame
 * is seeded by SQL (it is legacy data no current door would write). Records,
 * TM rows and activity rows are swept; the situation drop asserts zero residue.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	getMatrixTableFromTipo,
	getModelByTipo,
	getNode,
} from '../../src/core/ontology/resolver.ts';
import { resolveDataframeSlotTipos } from '../../src/core/relations/dataframe_slots.ts';
import { deletePortalLocator } from '../../src/core/relations/save.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import {
	deleteSectionData,
	deleteSectionRecord,
} from '../../src/core/section/record/delete_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const TLD = 'zzsdm';
const SECTION = `${TLD}1`;
const MAIN = `${TLD}2`; // portal declaring SLOT
const SLOT = `${TLD}3`; // component_dataframe, child of MAIN
const CMAIN = `${TLD}4`; // portal naming CSLOT only in its request_config
const CSLOT = `${TLD}5`; // component_dataframe whose parent is the SECTION: no declaring parent
const STALE = `${TLD}99`; // no ontology node: a removed main
const TABLE = 'matrix_test';
const USER_ID = -1;

const SITUATION = situation({
	tld: TLD,
	name: 'dataframe_stale_main',
	nodes: [
		{ tipo: SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'Stale main' } },
		{
			tipo: MAIN,
			parent: SECTION,
			model: 'component_portal',
			term: { 'lg-eng': 'Main' },
			properties: {
				source: {
					request_config: [
						{
							sqo: { section_tipo: [{ value: [SECTION], source: 'section' }] },
							show: { ddo_map: [{ tipo: SLOT, parent: 'self', section_tipo: SECTION }] },
						},
					],
				},
			},
		},
		{ tipo: SLOT, parent: MAIN, model: 'component_dataframe', term: { 'lg-eng': 'Slot' } },
		{
			tipo: CMAIN,
			parent: SECTION,
			model: 'component_portal',
			term: { 'lg-eng': 'Config main' },
			properties: {
				source: {
					request_config: [
						{
							sqo: { section_tipo: [{ value: [SECTION], source: 'section' }] },
							show: { ddo_map: [{ tipo: CSLOT, parent: 'self', section_tipo: SECTION }] },
						},
					],
				},
			},
		},
		{ tipo: CSLOT, parent: SECTION, model: 'component_dataframe', term: { 'lg-eng': 'C slot' } },
	],
});

type Item = Record<string, unknown>;

const frame = (
	id: number,
	idKey: number,
	target: number,
	main: string | null,
	slot = SLOT,
): Item => ({
	id,
	type: 'dd490',
	id_key: idKey,
	section_tipo: SECTION,
	section_id: target,
	from_component_tipo: slot,
	...(main === null ? {} : { main_component_tipo: main }),
});

async function rec(): Promise<number> {
	return createSectionRecord(SECTION, USER_ID);
}

async function seedRelation(sectionId: number, key: string, value: unknown): Promise<void> {
	await sql.unsafe(
		`UPDATE "${TABLE}" SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($3::text, $4::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId, key, JSON.stringify(value)],
	);
}

async function storedRelation(sectionId: number, key: string): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT relation->$3 AS v FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId, key],
	)) as { v: unknown }[];
	return rows[0]?.v;
}

async function exists(sectionId: number): Promise<boolean> {
	const rows = (await sql.unsafe(
		`SELECT 1 FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sectionId],
	)) as unknown[];
	return rows.length > 0;
}

/** The visible TM rows of (record, tipo) above a watermark. */
async function visibleRows(sectionId: number, tipo: string, afterId: number): Promise<Item[]> {
	return (await sql.unsafe(
		`SELECT tipo, lang, data FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND id > $4 AND tm_role IS NULL
		  ORDER BY id ASC`,
		[SECTION, sectionId, tipo, afterId],
	)) as Item[];
}

async function watermark(): Promise<number> {
	const rows = (await sql.unsafe('SELECT COALESCE(MAX(id), 0) AS m FROM matrix_time_machine')) as {
		m: number;
	}[];
	return Number(rows[0]?.m ?? 0);
}

const pairs = (value: unknown): string[] =>
	(Array.isArray(value) ? (value as Item[]) : [])
		.filter((entry) => entry.type === 'dd490')
		.map((entry) => `${String(entry.main_component_tipo)}->${Number(entry.section_id)}`)
		.sort();

beforeAll(async () => {
	await assertTestDatabase('dataframe_stale_main_native');
	await ensureSituation(SITUATION);
	// STRUCTURE FLOOR: the declared slot, and a main name that truly resolves to nothing.
	expect(await getMatrixTableFromTipo(SECTION)).toBe(TABLE);
	expect(await resolveDataframeSlotTipos(MAIN)).toEqual([SLOT]);
	expect(await resolveDataframeSlotTipos(CMAIN)).toEqual([CSLOT]);
	expect((await getNode(CSLOT))?.parent).toBe(SECTION); // no declaring parent
	expect(await getModelByTipo(STALE)).toBeNull();
}, 60_000);

afterAll(async () => {
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1', [SECTION]);
	await sql.unsafe('DELETE FROM dedalo_ts_record_generation WHERE section_tipo = $1', [SECTION]);
	await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1`, [SECTION]);
	await sql.unsafe(`DELETE FROM matrix_activity WHERE data->>'section_tipo' = $1`, [SECTION]);
	expect(await dropSituation(SITUATION)).toBe(0);
});

describe('a frame whose main_component_tipo no longer resolves', () => {
	test('deleting the record it targets succeeds: the frame is stripped, a live frame kept, history under the declaring main', async () => {
		const owner = await rec();
		const target = await rec();
		const keeper = await rec();
		await seedRelation(owner, MAIN, [
			{
				id: 1,
				type: 'dd151',
				section_tipo: SECTION,
				section_id: keeper,
				from_component_tipo: MAIN,
			},
		]);
		await seedRelation(owner, SLOT, [frame(1, 7, target, STALE), frame(2, 1, keeper, MAIN)]);
		const mark = await watermark();

		await deleteSectionRecord(SECTION, target, USER_ID);

		expect(await exists(target)).toBe(false);
		expect(pairs(await storedRelation(owner, SLOT))).toEqual([`${MAIN}->${keeper}`]);
		// Recorded under the declaring parent, composed with the frames after the strip.
		const rows = await visibleRows(owner, MAIN, mark);
		expect(rows.length).toBeGreaterThan(0);
		expect(pairs(rows.at(-1)?.data)).toEqual([`${MAIN}->${keeper}`]);
		expect(await visibleRows(owner, SLOT, mark)).toEqual([]);
		expect(await visibleRows(owner, STALE, mark)).toEqual([]);
	});

	test('a slot save removing it succeeds, recorded under the declaring main', async () => {
		const owner = await rec();
		const other = await rec();
		await seedRelation(owner, SLOT, [frame(1, 3, other, STALE)]);
		const mark = await watermark();

		const saved = await saveComponentData({
			componentTipo: SLOT,
			sectionTipo: SECTION,
			sectionId: owner,
			lang: 'lg-nolan',
			changedData: [{ action: 'remove', id: 1 }] as never,
			userId: USER_ID,
			bulkProcessId: null,
		});

		expect(saved.ok).toBe(true);
		expect(pairs(await storedRelation(owner, SLOT))).toEqual([]);
		const rows = await visibleRows(owner, MAIN, mark);
		expect(rows.length).toBe(1);
		expect(pairs(rows[0]?.data)).toEqual([]);
		expect(await visibleRows(owner, STALE, mark)).toEqual([]);
	});
});

describe('an ORPHAN frame (stale or unstamped main, slot with no declaring parent) never blocks a strip door', () => {
	/** Every history row of (record, tipo) above a watermark, any role. */
	async function anyRows(sectionId: number, tipo: string, afterId: number): Promise<number> {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix_time_machine
			  WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND id > $4`,
			[SECTION, sectionId, tipo, afterId],
		)) as { n: number }[];
		return rows[0]?.n ?? 0;
	}

	test('deleting the record the orphan frame targets succeeds; the frame leaves without history', async () => {
		const owner = await rec();
		const target = await rec();
		const keeper = await rec();
		await seedRelation(owner, CSLOT, [
			frame(1, 7, target, STALE, CSLOT),
			frame(2, 1, keeper, CMAIN, CSLOT),
		]);
		const mark = await watermark();

		await deleteSectionRecord(SECTION, target, USER_ID);

		expect(await exists(target)).toBe(false);
		expect(pairs(await storedRelation(owner, CSLOT))).toEqual([`${CMAIN}->${keeper}`]);
		for (const tipo of [CSLOT, STALE, CMAIN]) expect(await anyRows(owner, tipo, mark)).toBe(0);
	});

	test('Delete data of the record holding orphan frames succeeds and empties the slot', async () => {
		const owner = await rec();
		const other = await rec();
		await seedRelation(owner, CSLOT, [
			frame(1, 7, other, STALE, CSLOT),
			frame(2, 8, other, null, CSLOT),
		]);

		const result = await deleteSectionData(SECTION, owner, USER_ID);

		expect(result.deleted).toEqual([owner]);
		expect(await storedRelation(owner, CSLOT)).toBeNull();
		expect(await exists(owner)).toBe(true);
	});

	test('removing the orphan frame through delete_locator succeeds, without history', async () => {
		const owner = await rec();
		const other = await rec();
		const keeper = await rec();
		await seedRelation(owner, CSLOT, [
			frame(1, 7, other, STALE, CSLOT),
			frame(2, 1, keeper, CMAIN, CSLOT),
		]);
		const mark = await watermark();

		const response = await deletePortalLocator(
			{ isGlobalAdmin: true, userId: USER_ID },
			{ tipo: CSLOT, section_tipo: SECTION, section_id: owner },
			{
				locator: { section_tipo: SECTION, section_id: other, from_component_tipo: CSLOT },
				ar_properties: ['section_tipo', 'section_id', 'from_component_tipo'],
			},
		);

		expect(response.removed).toBe(1);
		expect(pairs(await storedRelation(owner, CSLOT))).toEqual([`${CMAIN}->${keeper}`]);
		for (const tipo of [CSLOT, STALE]) expect(await anyRows(owner, tipo, mark)).toBe(0);
	});
});
