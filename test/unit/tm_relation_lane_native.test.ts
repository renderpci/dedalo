/**
 * A RELATION IS NEVER TRANSLATABLE — its history has ONE lane, lg-nolan
 * (decision 2026-09-29; WC-2026-09-27-bulk-revert-undo-log addendum
 * "2026-09-29 — the lane follows the data shape"; relations/main_lanes.ts
 * laneLaw).
 *
 * A relation component holds LOCATORS; "a translatable portal" is an ontology
 * accident, not a data shape. The TM lane of a main depends ONLY on its
 * model's data shape (isLangSlicedModel): an UNSLICED model writes ONE
 * lg-nolan row per change = its whole value + every frame of its slots,
 * whatever the ontology `translatable` flag and whatever the request
 * language. This gate builds relation mains whose ontology node SAYS
 * translatable and proves, for saves made under lg-spa AND lg-eng requests:
 *   1. every visible row is lg-nolan and composed (the whole value; a frame
 *      save's row carries the value AND the frames);
 *   2. the rows are listed (and counted) in EVERY language's history;
 *   3. restoring any row (asked in any language) puts back exactly that
 *      value and its frames, and the restore's own row is lg-nolan;
 *   4. a bulk run's pairs are lg-nolan only; its revert (from another data
 *      lang) is exact, and so is the revert of the revert;
 *   5. the preview of a row shows the row's value in any view language.
 * The same for a relation with no slot (component_select). And PHP-ERA rows
 * (PHP tagged a translatable-flagged relation's save with the data lang, the
 * row holding the WHOLE value) are that same one lane: listed in every
 * language, they answer a delete door's backfill probe (no redundant
 * lg-nolan backfill row), and they restore, preview, prove a frame-first
 * frame and legacy-revert as that lane (a v6 lg-spa row included).
 *
 * SITUATION: a `zzrln` scratch section on `test1` (→ matrix_test): a portal
 * flagged translatable with its declared slot, and a select flagged
 * translatable. Frame targets are runtime records. Everything is swept; the
 * situation drop asserts zero residue. assertTestDatabase first.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo, getTranslatableByTipo } from '../../src/core/ontology/resolver.ts';
import {
	resolveDataframeSlotTipos,
	splitComposed,
} from '../../src/core/relations/dataframe_slots.ts';
import { countTimeMachineData, tmReadSource } from '../../src/core/resolve/read_tm.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { readComponentData } from '../../src/core/section/read.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionData } from '../../src/core/section/record/delete_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { toolTimeMachineBulkRevert } from '../../tools/tool_time_machine/server/bulk_revert.ts';
import { toolTimeMachineApplyValue } from '../../tools/tool_time_machine/server/tool_time_machine.ts';
import { mustGet } from '../helpers/assert.ts';

const TLD = 'zzrln';
const SECTION = `${TLD}1`;
const PORTAL = `${TLD}2`; // component_portal, ontology says translatable, one declared slot
const PSLOT = `${TLD}3`;
const SELECT = `${TLD}4`; // component_select, ontology says translatable, no slot
const TEXT = `${TLD}5`; // component_input_text, translatable: a LANG-SLICED main (the contrast)
const TABLE = 'matrix_test';
const USER_ID = -1;
const NOLAN = 'lg-nolan';
const SPA = 'lg-spa';
const ENG = 'lg-eng';

const SITUATION = situation({
	tld: TLD,
	name: 'tm_relation_lane',
	nodes: [
		{ tipo: SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'Relation lane' } },
		{
			tipo: PORTAL,
			parent: SECTION,
			model: 'component_portal',
			term: { 'lg-eng': 'Translatable-flagged portal' },
			is_translatable: true,
			properties: {
				source: {
					request_config: [
						{
							sqo: { section_tipo: [{ value: [SECTION], source: 'section' }] },
							show: { ddo_map: [{ tipo: PSLOT, parent: 'self', section_tipo: SECTION }] },
						},
					],
				},
			},
		},
		{ tipo: PSLOT, parent: PORTAL, model: 'component_dataframe', term: { 'lg-eng': 'P slot' } },
		{
			tipo: SELECT,
			parent: SECTION,
			model: 'component_select',
			term: { 'lg-eng': 'Translatable-flagged select' },
			is_translatable: true,
		},
		{
			tipo: TEXT,
			parent: SECTION,
			model: 'component_input_text',
			term: { 'lg-eng': 'Translatable text' },
			is_translatable: true,
		},
	],
});

type Item = Record<string, unknown>;

interface TmRow {
	id: number;
	lang: string | null;
	data: unknown;
}

/** Runtime records a locator or a frame points at. */
const targets: number[] = [];
const target = (n: number): number => mustGet(targets[n], `target ${n}`);

beforeAll(async () => {
	await assertTestDatabase('tm_relation_lane_native');
	await ensureSituation(SITUATION);
	expect(await getMatrixTableFromTipo(SECTION)).toBe(TABLE);
	// FLOOR: the ontology really says translatable, and the portal really has its slot.
	expect(await getTranslatableByTipo(PORTAL)).toBe(true);
	expect(await getTranslatableByTipo(SELECT)).toBe(true);
	expect(await resolveDataframeSlotTipos(PORTAL)).toEqual([PSLOT]);
	for (let n = 0; n < 4; n += 1) targets.push(await createSectionRecord(SECTION, USER_ID));
}, 60_000);

const runs: number[] = [];
afterAll(async () => {
	const bulkTable = (await getMatrixTableFromTipo('dd800')) as string;
	for (const id of runs) {
		await sql.unsafe(
			`DELETE FROM "${bulkTable}" WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
	}
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1', [SECTION]);
	await sql.unsafe('DELETE FROM dedalo_ts_record_generation WHERE section_tipo = $1', [SECTION]);
	await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1`, [SECTION]);
	await sql.unsafe(`DELETE FROM matrix_activity WHERE data->>'section_tipo' = $1`, [SECTION]);
	expect(await dropSituation(SITUATION)).toBe(0);
}, 60_000);

// ---------------------------------------------------------------- doors

const rec = (): Promise<number> => createSectionRecord(SECTION, USER_ID);

async function mint(): Promise<number> {
	const id = await createSectionRecord('dd800', USER_ID);
	runs.push(id);
	return id;
}

/** A save made the way a page in `lang` makes it (request lang AND data lang). */
async function save(
	id: number,
	tipo: string,
	lang: string,
	changedData: unknown[],
	extra: { bulk?: number | null; callerDataframe?: unknown } = {},
): Promise<void> {
	const saved = await runWithRequestLangs({ applicationLang: lang, dataLang: lang }, () =>
		saveComponentData({
			componentTipo: tipo,
			sectionTipo: SECTION,
			sectionId: id,
			lang,
			changedData: changedData as never,
			userId: USER_ID,
			bulkProcessId: extra.bulk ?? null,
			callerDataframe: extra.callerDataframe as never,
		}),
	);
	expect(saved.ok).toBe(true);
}

const locator = (tipo: string, n: number): Item => ({
	type: 'dd151',
	section_tipo: SECTION,
	section_id: String(target(n)),
	from_component_tipo: tipo,
});

const setLocators = (
	id: number,
	tipo: string,
	lang: string,
	ns: number[],
	bulk: number | null = null,
) =>
	save(id, tipo, lang, [{ action: 'set_data', value: ns.map((n) => locator(tipo, n)) }], { bulk });

/** Append one locator, keeping the stored items (their ids — the frames pair them — stay). */
const addLocator = async (
	id: number,
	tipo: string,
	lang: string,
	n: number,
	bulk: number | null = null,
) =>
	save(
		id,
		tipo,
		lang,
		[{ action: 'set_data', value: [...asList(await stored(id, tipo)), locator(tipo, n)] }],
		{ bulk },
	);

async function stored(id: number, key: string): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT (relation ? $3) AS present, relation->$3 AS v FROM "${TABLE}"
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, id, key],
	)) as { present: boolean | null; v: unknown }[];
	return rows[0]?.present === true ? rows[0]?.v : undefined;
}

const asList = (value: unknown): Item[] => (Array.isArray(value) ? (value as Item[]) : []);

/** The targets a stored value (or a row's main part) points at, in order. */
const targetsOf = (value: unknown): number[] =>
	asList(value).map((item) => Number(item.section_id));

/** The portal's live frames, as `id_key→target`. */
async function liveFrames(id: number): Promise<string[]> {
	return frameKeys(await stored(id, PSLOT));
}

const frameKeys = (frames: unknown): string[] =>
	asList(frames)
		.filter((frame) => frame.main_component_tipo === PORTAL)
		.map((frame) => `${frame.id_key}→${frame.section_id}`)
		.sort();

/** Add (or move) the frame of the portal item `idKey` — a slot save paired with the portal. */
async function setFrame(
	id: number,
	idKey: number,
	n: number,
	lang: string,
	bulk: number | null = null,
) {
	const current = asList(await stored(id, PSLOT)).find((frame) => Number(frame.id_key) === idKey);
	const change =
		current === undefined
			? {
					action: 'insert',
					id: null,
					value: { section_tipo: SECTION, section_id: String(target(n)) },
				}
			: { action: 'update', id: current.id, value: { ...current, section_id: String(target(n)) } };
	await save(id, PSLOT, lang, [change], {
		bulk,
		callerDataframe: { main_component_tipo: PORTAL, id_key: idKey },
	});
}

/** The VISIBLE rows of `tipo` at the address above `after`, id ASC. */
async function visibleRows(tipo: string, id: number, after = 0): Promise<TmRow[]> {
	const rows = (await sql.unsafe(
		`SELECT id, lang, data FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND id > $4 AND tm_role IS NULL
		  ORDER BY id ASC`,
		[SECTION, id, tipo, after],
	)) as TmRow[];
	return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

/** Every row of a run (any role) under `tipo`: its tags. */
async function runTags(tipo: string, bulk: number): Promise<string[]> {
	const rows = (await sql.unsafe(
		'SELECT lang FROM matrix_time_machine WHERE bulk_process_id = $1 AND tipo = $2 ORDER BY id',
		[bulk, tipo],
	)) as { lang: string }[];
	return rows.map((row) => row.lang);
}

/** How many rows the tool lists in the history of `lang` (a locator carrying the lang). */
function listed(tipo: string, id: number, lang: string): Promise<number> {
	return runWithRequestLangs({ applicationLang: lang, dataLang: lang }, () =>
		countTimeMachineData({
			sqo: {
				filter_by_locators: [{ section_tipo: SECTION, section_id: id, tipo, lang }],
				limit: 100,
				offset: 0,
			},
		} as never),
	);
}

async function applyRow(tipo: string, id: number, rowId: number, lang: string): Promise<void> {
	const response = await runWithRequestLangs({ applicationLang: lang, dataLang: lang }, async () =>
		toolTimeMachineApplyValue({
			principal: await resolvePrincipal(USER_ID),
			userId: USER_ID,
			options: { section_tipo: SECTION, section_id: id, tipo, lang, matrix_id: rowId },
			background: false,
		}),
	);
	expect(response.ok).toBe(true);
}

interface RevertData {
	bulk_process_id: number;
	exact: 'full' | 'partial' | 'none';
	skipped: unknown[];
	counter?: number;
	inexact?: unknown[];
}

async function revert(bulk: number, lang: string): Promise<RevertData> {
	const response = await runWithRequestLangs({ applicationLang: lang, dataLang: lang }, async () =>
		toolTimeMachineBulkRevert({
			principal: await resolvePrincipal(USER_ID),
			userId: USER_ID,
			options: { bulk_process_id: bulk },
			background: false,
		}),
	);
	expect(response.ok).toBe(true);
	const data = response.data as RevertData;
	runs.push(data.bulk_process_id);
	return data;
}

/** The targets the TM preview of `rowId` shows for `tipo`, viewed in `lang`. */
async function preview(tipo: string, id: number, rowId: number, lang: string): Promise<number[]> {
	const items = (await runWithRequestLangs({ applicationLang: lang, dataLang: lang }, () =>
		readComponentData({
			source: {
				tipo,
				section_tipo: SECTION,
				section_id: id,
				lang,
				mode: 'edit',
				data_source: 'tm',
				matrix_id: rowId,
			},
		} as never),
	)) as { tipo?: string; entries?: Item[] }[];
	return items.filter((item) => item.tipo === tipo).flatMap((item) => targetsOf(item.entries));
}

/** Re-tag a row the way PHP stamped it: the save's data lang (the row holds the whole value). */
const retag = (rowId: number, lang: string) =>
	sql.unsafe('UPDATE matrix_time_machine SET lang = $2 WHERE id = $1', [rowId, lang]);

async function watermark(): Promise<number> {
	const rows = (await sql.unsafe('SELECT COALESCE(MAX(id), 0) AS m FROM matrix_time_machine')) as {
		m: number;
	}[];
	return Number(rows[0]?.m ?? 0);
}

// ---------------------------------------------------------------- the portal (with a slot)

describe('a TRANSLATABLE-flagged portal with a dataframe slot: ONE lg-nolan lane', () => {
	test('saves under lg-spa and lg-eng write composed lg-nolan rows only, listed in every language; any row restores exactly', async () => {
		const id = await rec();
		await setLocators(id, PORTAL, SPA, [0]); // row 1: [0]
		const firstItem = mustGet(asList(await stored(id, PORTAL))[0], 'the first item');
		await setFrame(id, Number(firstItem.id), 2, SPA); // row 2: [0] + frame→2
		await addLocator(id, PORTAL, ENG, 1); // row 3: [0, 1] + frame→2
		await setFrame(id, Number(firstItem.id), 3, ENG); // row 4: [0, 1] + frame→3
		const rows = await visibleRows(PORTAL, id);
		// 1. every row lg-nolan, composed: the whole value + the frames of that moment
		expect(rows.map((row) => row.lang)).toEqual([NOLAN, NOLAN, NOLAN, NOLAN]);
		const shape = rows.map((row) => {
			const { main, frames } = splitComposed(row.data);
			return { value: targetsOf(main), frames: frameKeys(frames) };
		});
		const fid = firstItem.id;
		expect(shape).toEqual([
			{ value: [target(0)], frames: [] },
			{ value: [target(0)], frames: [`${fid}→${target(2)}`] },
			{ value: [target(0), target(1)], frames: [`${fid}→${target(2)}`] },
			{ value: [target(0), target(1)], frames: [`${fid}→${target(3)}`] },
		]);
		// no row under the slot tipo, none in a language lane
		expect(await visibleRows(PSLOT, id)).toEqual([]);
		// 2. listed in every language's history
		for (const lang of [SPA, ENG, NOLAN]) expect(await listed(PORTAL, id, lang)).toBe(4);
		// 5. the preview of the eng-request row shows its value in any view language
		const engRow = mustGet(rows[2], 'the eng save row');
		for (const lang of [SPA, ENG]) {
			expect(await preview(PORTAL, id, engRow.id, lang)).toEqual([target(0), target(1)]);
		}
		// 3. restore the frame-add row (made under spa) from an eng page: value AND frames
		const mark = await watermark();
		await applyRow(PORTAL, id, mustGet(rows[1], 'the frame-add row').id, ENG);
		expect(targetsOf(await stored(id, PORTAL))).toEqual([target(0)]);
		expect(await liveFrames(id)).toEqual([`${fid}→${target(2)}`]);
		expect((await visibleRows(PORTAL, id, mark)).map((row) => row.lang)).toEqual([NOLAN]);
		// …and the newest row back again, from a spa page
		await applyRow(PORTAL, id, mustGet(rows[3], 'the newest row').id, SPA);
		expect(targetsOf(await stored(id, PORTAL))).toEqual([target(0), target(1)]);
		expect(await liveFrames(id)).toEqual([`${fid}→${target(3)}`]);
		expect((await visibleRows(PORTAL, id, mark)).map((row) => row.lang)).toEqual([NOLAN, NOLAN]);
	}, 60_000);

	test('a bulk run saving under lg-spa AND lg-eng (value + frame): lg-nolan pairs only; the revert is exact, so is its revert', async () => {
		const id = await rec();
		await setLocators(id, PORTAL, SPA, [0]);
		const firstItem = mustGet(asList(await stored(id, PORTAL))[0], 'the first item');
		await setFrame(id, Number(firstItem.id), 2, SPA);
		const pre = { value: await stored(id, PORTAL), frames: await liveFrames(id) };
		const run = await mint();
		await addLocator(id, PORTAL, SPA, 1, run);
		await addLocator(id, PORTAL, ENG, 3, run);
		await setFrame(id, Number(firstItem.id), 3, ENG, run);
		const post = { value: await stored(id, PORTAL), frames: await liveFrames(id) };
		expect(targetsOf(post.value)).toEqual([target(0), target(1), target(3)]); // FLOOR
		const tags = await runTags(PORTAL, run);
		expect(tags.length).toBe(6); // three pairs: BEFORE + visible after each
		expect(new Set(tags)).toEqual(new Set([NOLAN]));
		expect(await runTags(PSLOT, run)).toEqual([]);
		const back = await revert(run, ENG);
		expect(back.skipped).toEqual([]);
		expect(back.exact).toBe('full');
		expect({ value: await stored(id, PORTAL), frames: await liveFrames(id) }).toEqual(pre);
		expect(new Set(await runTags(PORTAL, back.bulk_process_id))).toEqual(new Set([NOLAN]));
		const again = await revert(back.bulk_process_id, SPA);
		expect(again.skipped).toEqual([]);
		expect(again.exact).toBe('full');
		expect({ value: await stored(id, PORTAL), frames: await liveFrames(id) }).toEqual(post);
	}, 60_000);
});

// ---------------------------------------------------------------- the select (no slot)

describe('a TRANSLATABLE-flagged select (no slot): ONE lg-nolan lane', () => {
	test('saves under lg-spa and lg-eng: lg-nolan rows, listed in every language; restore and bulk revert exact', async () => {
		const id = await rec();
		await setLocators(id, SELECT, SPA, [0]);
		await setLocators(id, SELECT, ENG, [1]);
		const rows = await visibleRows(SELECT, id);
		expect(rows.map((row) => row.lang)).toEqual([NOLAN, NOLAN]);
		expect(rows.map((row) => targetsOf(row.data))).toEqual([[target(0)], [target(1)]]);
		for (const lang of [SPA, ENG, NOLAN]) expect(await listed(SELECT, id, lang)).toBe(2);
		await applyRow(SELECT, id, mustGet(rows[0], 'the spa row').id, ENG);
		expect(targetsOf(await stored(id, SELECT))).toEqual([target(0)]);
		const pre = await stored(id, SELECT);
		const run = await mint();
		await setLocators(id, SELECT, ENG, [2], run);
		await setLocators(id, SELECT, SPA, [3], run);
		expect(new Set(await runTags(SELECT, run))).toEqual(new Set([NOLAN]));
		const back = await revert(run, SPA);
		expect(back.skipped).toEqual([]);
		expect(back.exact).toBe('full');
		expect(await stored(id, SELECT)).toEqual(pre);
	}, 60_000);
});

// ---------------------------------------------------------------- frame-first on a stamped portal

describe('a TRANSLATABLE-flagged portal: its items sit in the ONE lg-nolan lane whatever their `lang` stamp', () => {
	/** A locator the portal stores with a chosen item id (the id a frame-first frame named). */
	const withId = (n: number, itemId: number): Item => ({ ...locator(PORTAL, n), id: itemId });
	const ITEM = 7;

	test('restoring the FRAME-FIRST row of an empty portal (the item came later, stamped lg-spa) keeps the frame, as the row recorded it', async () => {
		const id = await rec();
		await setFrame(id, ITEM, 2, SPA); // R: empty value + the frame of an item not yet there
		const [frameFirst] = await visibleRows(PORTAL, id);
		const recorded = frameKeys(
			splitComposed(mustGet(frameFirst, 'the frame-first row').data).frames,
		);
		expect(recorded).toEqual([`${ITEM}→${target(2)}`]); // FLOOR: what the preview shows
		await save(id, PORTAL, SPA, [{ action: 'set_data', value: [withId(0, ITEM)] }]);
		// FLOOR: the save stamps the locator's lang (the data behaviour is unchanged)
		expect(asList(await stored(id, PORTAL)).map((item) => [item.id, item.lang])).toEqual([
			[ITEM, SPA],
		]);
		await setLocators(id, PORTAL, SPA, []);
		await applyRow(PORTAL, id, mustGet(frameFirst, 'the frame-first row').id, ENG);
		expect(targetsOf(await stored(id, PORTAL))).toEqual([]);
		expect(await liveFrames(id)).toEqual(recorded);
	}, 60_000);

	test('a PHP-era FRAME-FIRST row tagged lg-spa (empty value + frame) is the lg-nolan lane too: its restore keeps the frame', async () => {
		const id = await rec();
		await setFrame(id, ITEM, 2, SPA);
		const frameFirst = mustGet((await visibleRows(PORTAL, id))[0], 'the frame-first row');
		await retag(frameFirst.id, SPA); // PHP tagged the save with its data lang
		const recorded = frameKeys(splitComposed(frameFirst.data).frames);
		expect(recorded).toEqual([`${ITEM}→${target(2)}`]); // FLOOR
		await save(id, PORTAL, SPA, [{ action: 'set_data', value: [withId(0, ITEM)] }]);
		await setLocators(id, PORTAL, SPA, []);
		await applyRow(PORTAL, id, frameFirst.id, ENG);
		expect(targetsOf(await stored(id, PORTAL))).toEqual([]);
		expect(await liveFrames(id)).toEqual(recorded);
	}, 60_000);

	test('a run over a FRAME-FIRST pre-run state (adds the stamped item, moves its frame): the revert is exact, never refused', async () => {
		const id = await rec();
		await setFrame(id, ITEM, 2, SPA);
		const pre = { value: await stored(id, PORTAL), frames: await liveFrames(id) };
		expect(pre.frames).toEqual([`${ITEM}→${target(2)}`]); // FLOOR
		const run = await mint();
		await save(id, PORTAL, SPA, [{ action: 'set_data', value: [withId(0, ITEM)] }], { bulk: run });
		await setFrame(id, ITEM, 3, SPA, run);
		expect(await liveFrames(id)).toEqual([`${ITEM}→${target(3)}`]); // FLOOR
		const back = await revert(run, ENG);
		expect(back.skipped).toEqual([]);
		expect(back.exact).toBe('full');
		expect({ value: await stored(id, PORTAL), frames: await liveFrames(id) }).toEqual(pre);
	}, 60_000);
});

// ---------------------------------------------------------------- PHP-era rows tagged with the data lang

describe('PHP-era rows of a TRANSLATABLE-flagged relation, tagged lg-spa / lg-eng: the SAME one lane', () => {
	test('every tag is listed in every language, and a data wipe writes no backfill row over them', async () => {
		const id = await rec();
		await setLocators(id, SELECT, SPA, [0]);
		await setLocators(id, SELECT, ENG, [1]);
		const [spaRow, engRow] = await visibleRows(SELECT, id);
		await retag(mustGet(spaRow, 'the spa save').id, SPA);
		await retag(mustGet(engRow, 'the eng save').id, ENG);
		expect((await visibleRows(SELECT, id)).map((row) => row.lang)).toEqual([SPA, ENG]); // FLOOR
		for (const lang of [SPA, ENG, NOLAN]) expect(await listed(SELECT, id, lang)).toBe(2);
		// the wipe: its PHP rows answer the backfill probe → ONE new row, the wipe itself
		const mark = await watermark();
		await runWithRequestLangs({ applicationLang: ENG, dataLang: ENG }, () =>
			deleteSectionData(SECTION, id, USER_ID),
		);
		expect(await stored(id, SELECT)).toBeOneOf([undefined, null, []]); // FLOOR: wiped
		const written = await visibleRows(SELECT, id, mark);
		expect(written.map((row) => [row.lang, targetsOf(row.data)])).toEqual([[NOLAN, []]]);
	}, 60_000);

	test('a row tagged lg-spa restores (asked in lg-eng) and previews (in every language) its WHOLE value', async () => {
		const id = await rec();
		await setLocators(id, SELECT, SPA, [0]);
		await setLocators(id, SELECT, ENG, [1]);
		const [spaRow, engRow] = await visibleRows(SELECT, id);
		const spa = mustGet(spaRow, 'the spa save');
		await retag(spa.id, SPA);
		await retag(mustGet(engRow, 'the eng save').id, ENG);
		for (const lang of [ENG, SPA, NOLAN]) {
			expect(await preview(SELECT, id, spa.id, lang)).toEqual([target(0)]);
		}
		const mark = await watermark();
		await applyRow(SELECT, id, spa.id, ENG);
		expect(await stored(id, SELECT)).toEqual(spa.data);
		expect(targetsOf(await stored(id, SELECT))).toEqual([target(0)]);
		expect((await visibleRows(SELECT, id, mark)).map((row) => row.lang)).toEqual([NOLAN]);
	}, 60_000);

	test('a PORTAL row PHP tagged lg-spa, made while it had NO frame, restores with no frame (it IS the frame state, not an older lg-nolan one)', async () => {
		const id = await rec();
		await setLocators(id, PORTAL, SPA, [0]);
		const item = mustGet(asList(await stored(id, PORTAL))[0], 'the item');
		await setFrame(id, Number(item.id), 2, SPA); // an lg-nolan row carrying frame→2
		const frame = mustGet(asList(await stored(id, PSLOT))[0], 'the frame');
		await save(id, PSLOT, SPA, [{ action: 'remove', id: frame.id, value: null }], {
			callerDataframe: { main_component_tipo: PORTAL, id_key: Number(item.id) },
		});
		const rows = await visibleRows(PORTAL, id);
		const frameless = mustGet(rows[rows.length - 1], 'the frame-removal row');
		expect(frameKeys(splitComposed(frameless.data).frames)).toEqual([]); // FLOOR
		await retag(frameless.id, SPA); // PHP: the whole value, no frame, tagged with the data lang
		await setFrame(id, Number(item.id), 3, ENG);
		await applyRow(PORTAL, id, frameless.id, ENG);
		expect(targetsOf(await stored(id, PORTAL))).toEqual([target(0)]);
		expect(await liveFrames(id)).toEqual([]);
	}, 60_000);

	test('a legacy run (no undo log) whose rows PHP tagged lg-eng / lg-spa is ONE lg-nolan key: the revert is exact', async () => {
		const id = await rec();
		await setLocators(id, SELECT, SPA, [0]);
		await retag(mustGet((await visibleRows(SELECT, id))[0], 'the pre-run save').id, SPA);
		const pre = await stored(id, SELECT);
		const mark = await watermark();
		const run = await mint();
		await setLocators(id, SELECT, ENG, [2], run);
		await setLocators(id, SELECT, SPA, [3], run);
		// the legacy shape: no BEFORE rows, the after-rows tagged with the save's data lang
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE bulk_process_id = $1 AND tm_role IS NOT NULL',
			[run],
		);
		const [engAfter, spaAfter] = await visibleRows(SELECT, id, mark);
		await retag(mustGet(engAfter, 'the eng after-row').id, ENG);
		await retag(mustGet(spaAfter, 'the spa after-row').id, SPA);
		expect(await runTags(SELECT, run)).toEqual([ENG, SPA]); // FLOOR: legacy, PHP-tagged
		const back = await revert(run, ENG);
		expect(back.skipped).toEqual([]);
		// ONE key, inferred (no undo log → never 'exact' by the report's law), written once
		expect([back.exact, back.counter, back.inexact?.length]).toEqual(['none', 1, 1]);
		expect(await stored(id, SELECT)).toEqual(pre);
		expect(await runTags(SELECT, back.bulk_process_id)).toEqual([NOLAN, NOLAN]);
	}, 60_000);
});

// ---------------------------------------------------------------- the lane law on the wire

describe('the dd15 context of a one-component history states the lane law (tm_main)', () => {
	/** The dd15 section entry of the tool's history read of `tipo`, asked in lg-spa. */
	async function tmMain(tipo: string): Promise<unknown> {
		const buildContext = mustGet(tmReadSource.buildContext, 'the TM context builder');
		const context = await runWithRequestLangs({ applicationLang: SPA, dataLang: SPA }, async () =>
			buildContext(
				{
					action: 'read',
					source: { tipo: 'dd15', section_tipo: 'dd15', lang: SPA, mode: 'list' },
					sqo: {
						section_tipo: ['dd15'],
						filter_by_locators: [{ section_tipo: SECTION, section_id: 1, tipo, lang: SPA }],
					},
				} as never,
				await resolvePrincipal(USER_ID),
			),
		);
		return context.find((entry) => entry.tipo === 'dd15')?.tm_main;
	}

	test('a relation flagged translatable has ONE lane; a translatable input_text has language lanes', async () => {
		expect(await tmMain(PORTAL)).toEqual({ tipo: PORTAL, lang_sliced: false });
		expect(await tmMain(SELECT)).toEqual({ tipo: SELECT, lang_sliced: false });
		expect(await tmMain(TEXT)).toEqual({ tipo: TEXT, lang_sliced: true });
	}, 60_000);
});
