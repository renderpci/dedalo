/**
 * ONE DOOR-LANE LAW (WC-2026-09-27-bulk-revert-undo-log, addendum 2026-09-30
 * "one door-lane law: speaking doors vs doorless doors") — an OUTCOME gate
 * comparing two INDEPENDENT implementations of "which lane a history row goes
 * in":
 *   - the SAVE path files its row in `effectiveSaveLang(tipo, model, pageLang)`
 *     (bulk_capture.ts saveDoorLane, fed by save_component.ts);
 *   - the history identity (`mainIdentity`, dataframe_slots.ts) is what every
 *     other door (duplicate, wipe, undelete, observer, slot lane) files under.
 *
 * THE LAW: a door that SPEAKS a language (the save, the duplicate's re-save
 * row, translation) files in `effectiveSaveLang(tipo, model, pageLang)`; a
 * DOORLESS door (wipe, undelete, observer, slot/frame lane) files in lg-nolan,
 * except a translatable sliced main, which uses `currentDataLang()`.
 *
 * CELLS:
 *   1. SAVE LANE = DOOR IDENTITY: per component K and page lang L, the lang of
 *      the save's visible row equals `(await mainIdentity(K, L)).lang`.
 *   2. DUPLICATE = SAVE: the copy's save-stamped rows (the backfill is stamped
 *      60 s earlier and excluded) sit in the same lanes as the source's save.
 *   3. WIPE PAIRS WITH UNDELETE (a preservation cell, green pre- and post-fix):
 *      a lang-less orphan of a transliterable / iri main is filed by the
 *      soft-cascade wipe in a lane its bulk-revert undelete also files it in,
 *      and a timeline of a language the key does not hold lists both.
 *
 * Mutations that must turn it red (P5): slicedRowLang back to iri-only (cells
 * 1+2, K3); the duplicate's lg-nolan override restored (cell 2, K3+K4); the
 * wipe filed under mainIdentity(tipo, dataLang) (cell 3); the non-translatable
 * branch returning the request lang unconditionally (cell 1, K2).
 *
 * SITUATION: a `zzdla` scratch section on `test1` (→ matrix_test), five
 * mains + one soft-delete portal/slot pair; records created at runtime; every
 * row swept; the situation drop asserts zero residue. assertTestDatabase
 * before the first write.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import {
	mainIdentity,
	resolveDataframeSlotTipos,
} from '../../src/core/relations/dataframe_slots.ts';
import { currentDataLang, runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { duplicateSectionRecord } from '../../src/core/section/record/duplicate_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { toolTimeMachineBulkRevert } from '../../tools/tool_time_machine/server/bulk_revert.ts';

const TLD = 'zzdla';
const SECTION = `${TLD}1`;
const K1 = `${TLD}2`; // input_text, translatable
const K2 = `${TLD}3`; // input_text, plain (not translatable)
const K3 = `${TLD}4`; // input_text, with_lang_versions (transliterable)
const K4 = `${TLD}5`; // component_iri, not translatable
const K5 = `${TLD}6`; // component_portal (unsliced)
const SMAIN = `${TLD}7`; // portal → SSLOT (soft delete: delete_target)
const SSLOT = `${TLD}8`;
const TABLE = 'matrix_test';
const USER_ID = -1;
const NOLAN = 'lg-nolan';
const ENG = 'lg-eng';
const ELL = 'lg-ell';
const SPA = 'lg-spa';

const portal = (tipo: string, slot: string | null) => ({
	tipo,
	parent: SECTION,
	model: 'component_portal',
	term: { 'lg-eng': `Portal ${tipo}` },
	properties: {
		source: {
			request_config: [
				{
					sqo: { section_tipo: [{ value: [SECTION], source: 'section' }] },
					show: {
						ddo_map: slot === null ? [] : [{ tipo: slot, parent: 'self', section_tipo: SECTION }],
					},
				},
			],
		},
	},
});

const SITUATION = situation({
	tld: TLD,
	name: 'history_door_lane_agreement',
	nodes: [
		{ tipo: SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'Door lanes' } },
		{
			tipo: K1,
			parent: SECTION,
			model: 'component_input_text',
			term: { 'lg-eng': 'Translatable' },
			is_translatable: true,
		},
		{ tipo: K2, parent: SECTION, model: 'component_input_text', term: { 'lg-eng': 'Plain' } },
		{
			tipo: K3,
			parent: SECTION,
			model: 'component_input_text',
			term: { 'lg-eng': 'Transliterable' },
			properties: { with_lang_versions: true },
		},
		{ tipo: K4, parent: SECTION, model: 'component_iri', term: { 'lg-eng': 'Iri' } },
		portal(K5, null),
		portal(SMAIN, SSLOT),
		{
			tipo: SSLOT,
			parent: SMAIN,
			model: 'component_dataframe',
			term: { 'lg-eng': 'Soft slot' },
			properties: { dataframe: { delete_policy: 'delete_target' } },
		},
	],
});

type Item = Record<string, unknown>;

/** The column each K's value lives in. */
const COLUMN: Record<string, string> = {
	[K1]: 'string',
	[K2]: 'string',
	[K3]: 'string',
	[K4]: 'iri',
	[K5]: 'relation',
};

const minted: number[] = [];
let bulkTable = '';
/** A target record the portal value points at. */
let portalTarget = 0;

const rec = (): Promise<number> => createSectionRecord(SECTION, USER_ID);

async function mint(): Promise<number> {
	const id = await createSectionRecord('dd800', USER_ID);
	minted.push(id);
	return id;
}

const inLang = <T>(dataLang: string, fn: () => Promise<T>): Promise<T> =>
	runWithRequestLangs({ applicationLang: ENG, dataLang }, fn);

async function save(
	id: number,
	tipo: string,
	lang: string,
	changedData: unknown[],
	extra: { bulk?: number | null; callerDataframe?: unknown } = {},
): Promise<Item[]> {
	const saved = await inLang(lang === NOLAN ? ELL : lang, () =>
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
	return (saved.data ?? []) as Item[];
}

/** The value a page speaking `lang` saves into K (L items only; plain / a locator for K2 / K5). */
function valueFor(tipo: string, lang: string, tag: string): Item[] {
	switch (tipo) {
		case K2:
			return [{ id: 1, lang: NOLAN, value: `plain-${tag}` }];
		case K4:
			return [{ id: 1, lang, iri: `http://example.org/${tag}`, title: tag }];
		case K5:
			return [{ section_tipo: SECTION, section_id: String(portalTarget) }];
		default:
			return [{ id: 1, lang, value: `${tag}-${lang}` }];
	}
}

interface TmRow {
	id: number;
	lang: string;
	ts: string;
	data: unknown;
	bulk: number | null;
}

/** The VISIBLE rows of `tipo` at the address, id ASC. */
async function visibleRows(id: number, tipo: string): Promise<TmRow[]> {
	const rows = (await sql.unsafe(
		`SELECT id, lang, "timestamp"::text AS ts, data, bulk_process_id AS bulk
		   FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND tm_role IS NULL
		  ORDER BY id ASC`,
		[SECTION, id, tipo],
	)) as TmRow[];
	return rows.map((row) => ({ ...row, id: Number(row.id) }));
}

/** The rows stamped at the newest instant (a door's save rows; its backfill is 60 s earlier). */
function newestStamp(rows: readonly TmRow[]): TmRow[] {
	const newest = rows
		.map((row) => row.ts)
		.sort()
		.at(-1);
	return rows.filter((row) => row.ts === newest);
}

const langSet = (rows: readonly TmRow[]): string[] => [...new Set(rows.map((r) => r.lang))].sort();

async function seed(id: number, column: string, key: string, value: unknown): Promise<void> {
	await sql.unsafe(
		`UPDATE "${TABLE}" SET ${column} = COALESCE(${column}, '{}'::jsonb) || jsonb_build_object($3::text, $4::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, id, key, JSON.stringify(value)],
	);
}

async function stored(id: number, column: string, key: string): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT (${column} ? $3) AS present, ${column}->$3 AS v FROM "${TABLE}"
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, id, key],
	)) as { present: boolean | null; v: unknown }[];
	return rows[0]?.present === true ? rows[0]?.v : undefined;
}

// ---------------------------------------------------------------- lifecycle

beforeAll(async () => {
	await assertTestDatabase('history_door_lane_agreement_native');
	await ensureSituation(SITUATION);
	expect(await getMatrixTableFromTipo(SECTION)).toBe(TABLE);
	expect(await resolveDataframeSlotTipos(SMAIN)).toEqual([SSLOT]);
	bulkTable = (await getMatrixTableFromTipo('dd800')) as string;
	portalTarget = await rec();
}, 60_000);

afterAll(async () => {
	for (const id of minted) {
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

const ALL = [
	['K1 translatable', K1],
	['K2 plain', K2],
	['K3 transliterable', K3],
	['K4 iri', K4],
	['K5 portal', K5],
] as const;

// ---------------------------------------------------------------- 1

describe('(1) the SAVE lane equals the door identity mainIdentity(K, L)', () => {
	for (const [name, tipo] of ALL) {
		for (const lang of [ELL, SPA]) {
			test(`${name}, page ${lang}`, async () => {
				const id = await rec();
				await save(id, tipo, lang, [{ action: 'set_data', value: valueFor(tipo, lang, 's') }]);
				const rows = await visibleRows(id, tipo);
				expect(rows.length, 'the save wrote a visible row').toBeGreaterThan(0);
				const identity = await inLang(lang, () => mainIdentity(tipo, lang));
				expect(langSet(rows), `${name} save lanes vs door identity`).toEqual([identity.lang]);
			}, 30_000);
		}
	}
});

// ---------------------------------------------------------------- 2

describe('(2) the DUPLICATE’s save row sits in the lanes its source’s save used', () => {
	// This cell is ALSO the DATA-01 outcome twin (module_state_tripwire's
	// positive pin on duplicate_record.ts is only a pointer): the duplicate runs
	// under a request data lang that differs from every install-wide default, so
	// a door that reads config.menu.dataLang / config.lang.dataLangDefault, or
	// captures currentDataLang() at module level (outside a request scope it
	// falls back to the default), files K1/K3/K4 in the wrong lane and reds the
	// comparison below. Without this precondition the cell could not tell them
	// apart on an install whose default happened to be ${ELL}.
	test(`precondition: ${ELL} is none of the install-default data langs`, () => {
		const defaults = [config.menu.dataLang, config.lang.dataLangDefault, currentDataLang()];
		expect(defaults, 'cell (2) cannot discriminate DATA-01').not.toContain(ELL);
	});
	for (const [name, tipo] of ALL) {
		test(`${name}, duplicated under data lang ${ELL}`, async () => {
			const source = await rec();
			await save(source, tipo, ELL, [{ action: 'set_data', value: valueFor(tipo, ELL, 'd') }]);
			const sourceRows = newestStamp(await visibleRows(source, tipo));
			expect(sourceRows.length, 'the source save wrote a row').toBeGreaterThan(0);
			const copy = await inLang(ELL, () => duplicateSectionRecord(SECTION, source, USER_ID));
			const copyRows = newestStamp(await visibleRows(copy, tipo));
			expect(copyRows.length, 'the duplicate wrote its save row').toBeGreaterThan(0);
			expect(langSet(copyRows), `${name} copy save lanes vs source save lanes`).toEqual(
				langSet(sourceRows),
			);
		}, 30_000);
	}
});

// ---------------------------------------------------------------- 3

describe('(3) the WIPE and its UNDELETE file a lang-less orphan in ONE lane (doorless pair)', () => {
	const cases = [
		['K3 transliterable', K3],
		['K4 iri', K4],
	] as const;
	for (const [name, tipo] of cases) {
		test(`${name}: soft-cascade wipe in ${ELL}, then its bulk-revert undelete`, async () => {
			const marker = `orphan-${tipo}-${Date.now()}`;
			const host = await rec();
			const [t1, role] = [await rec(), await rec()];
			const column = COLUMN[tipo] as string;
			const langItem =
				tipo === K4
					? { id: 1, lang: ELL, iri: 'http://example.org/ell', title: 'ell' }
					: { id: 1, lang: ELL, value: 'ell' };
			const orphan =
				tipo === K4
					? { id: 2, iri: `http://example.org/${marker}`, title: marker }
					: { id: 2, value: marker };
			await seed(role, column, tipo, [langItem, orphan]);
			await seed(host, 'relation', SMAIN, [
				{ id: 1, type: 'dd151', section_tipo: SECTION, section_id: t1, from_component_tipo: SMAIN },
			]);
			await seed(host, 'relation', SSLOT, [
				{
					id: 1,
					type: 'dd490',
					id_key: 1,
					section_tipo: SECTION,
					section_id: role,
					from_component_tipo: SSLOT,
					main_component_tipo: SMAIN,
				},
			]);
			const run = await mint();
			// The frame removal soft-deletes its target: deleteSectionData → recordWipeHistory, page lg-ell.
			await save(host, SSLOT, NOLAN, [{ action: 'remove', id: 1, value: null }], { bulk: run });
			// FLOOR: the soft cascade wiped the key.
			expect(await stored(role, column, tipo), 'the wipe emptied the key').toBeUndefined();
			const back = await inLang(ELL, async () => {
				const response = await toolTimeMachineBulkRevert({
					principal: await resolvePrincipal(USER_ID),
					userId: USER_ID,
					options: { bulk_process_id: run },
					background: false,
				});
				expect(response.ok).toBe(true);
				return response.data as { bulk_process_id: number; skipped: unknown[] };
			});
			minted.push(back.bulk_process_id);
			expect(back.skipped).toEqual([]);
			// FLOOR: the undelete put the orphan back.
			expect(JSON.stringify(await stored(role, column, tipo))).toContain(marker);
			const rows = await visibleRows(role, tipo);
			const carrying = (row: TmRow) => JSON.stringify(row.data).includes(marker);
			const wipe = rows.filter((row) => row.bulk === null && carrying(row));
			const undelete = rows.filter((row) => row.bulk === back.bulk_process_id && carrying(row));
			expect(wipe.length, 'a wipe row carries the orphan').toBeGreaterThan(0);
			expect(undelete.length, 'an undelete row carries the orphan').toBeGreaterThan(0);
			// The wipe (visible law) files the orphan in its DOOR lane only; the
			// undelete (a bulk write: undo regions keep orphans in every lane it
			// writes) files it in its door lane AND in each language lane it puts
			// back. The pair holds when every lane the wipe filed it in is one the
			// undelete filed it in…
			for (const lane of langSet(wipe)) {
				expect(langSet(undelete), `${name}: the wipe's orphan lane ${lane}`).toContain(lane);
			}
			// …and when a timeline of a language the key does NOT hold (lang IN
			// (lg-spa, lg-nolan)) lists BOTH the orphan's wipe-era row and its
			// restore: a wipe filed in the page lang would hide the removal there
			// while the undelete (lg-nolan) still shows the orphan coming back.
			const spaTimeline = (row: TmRow) => row.lang === SPA || row.lang === NOLAN;
			expect(
				wipe.filter(spaTimeline).length,
				`${name}: wipe row in the ${SPA} timeline`,
			).toBeGreaterThan(0);
			expect(
				undelete.filter(spaTimeline).length,
				`${name}: undelete row in the ${SPA} timeline`,
			).toBeGreaterThan(0);
		}, 60_000);
	}
});
