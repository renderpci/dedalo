/**
 * ORIGINAL-LANGUAGE GATE (the v6 get_original_lang mechanism, ported 2026-07-28).
 *
 * Interviews in one installation are recorded in different languages, so the AV
 * section carries a component_select_lang ("Original language", rsc263) beside
 * the transcription text_area (rsc36). The engine must force the text_area to
 * that per-record language in TWO places:
 *
 *   1. the EDIT context carries `options.related_component_lang` — the (until
 *      now dead) client code in tool_transcription/tool_indexation/tool_lang
 *      reads it to open the component in the interview's own language and to
 *      hint the speech recogniser;
 *   2. the LIST emission reads the value in the original language, so a list of
 *      interviews shows each transcript in its own language instead of an empty
 *      current-lang slice.
 *
 * The load-bearing negative: a record WITHOUT an original language must behave
 * exactly as before — no `options` key, request-lang slice — in whatever order
 * the two records are read (the cache-poisoning guard: contexts are built from
 * a shared structural core, and a per-record stamp must never leak across).
 *
 * Uses the REAL ontology triple rsc36/rsc167/rsc263 and the real lg1 records in
 * the suite DB; the matrix rows are scratch (created and deleted here).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { getOriginalLang } from '../../src/core/components/component_text_area/original_lang.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import {
	deleteMatrixRecord,
	insertMatrixRecordWithCounter,
} from '../../src/core/db/matrix_write.ts';
import {
	clearSelectLangCache,
	getLangCodeBySectionId,
	getLangSectionIdByCode,
} from '../../src/core/relations/select_lang.ts';
import { buildGetDataContext, readSection } from '../../src/core/section/read.ts';

const TABLE = 'matrix'; // rsc167 lives in the main matrix table
const SECTION = 'rsc167';
const TEXT_AREA = 'rsc36';
const SELECT_LANG = 'rsc263';

/** lg1 ids resolved from the REAL langs table at setup. */
let spaLg1Id = 0;
/** Scratch records: with and without an original language. */
let withLangId = 0;
let withoutLangId = 0;

/** The stored transcript, deliberately ONLY in lg-spa. */
const SPA_TEXT = '<p>Transcripción original en español.</p>';

beforeAll(async () => {
	spaLg1Id = (await getLangSectionIdByCode('lg-spa')) ?? 0;
	expect(spaLg1Id).toBeGreaterThan(0); // the suite DB carries real lg1 data

	withLangId = await insertMatrixRecordWithCounter(TABLE, SECTION, {
		relation: {
			[SELECT_LANG]: [
				{
					id: 1,
					type: 'dd151',
					section_tipo: 'lg1',
					section_id: String(spaLg1Id),
					from_component_tipo: SELECT_LANG,
				},
			],
		},
		string: { [TEXT_AREA]: [{ id: 1, value: SPA_TEXT, lang: 'lg-spa' }] },
	});
	withoutLangId = await insertMatrixRecordWithCounter(TABLE, SECTION, {
		string: { [TEXT_AREA]: [{ id: 1, value: SPA_TEXT, lang: 'lg-spa' }] },
	});
});

afterAll(async () => {
	if (withLangId > 0) await deleteMatrixRecord(TABLE, SECTION, withLangId);
	if (withoutLangId > 0) await deleteMatrixRecord(TABLE, SECTION, withoutLangId);
});

describe('getLangCodeBySectionId (lg1 → lg-tag)', () => {
	test('round-trips with getLangSectionIdByCode', async () => {
		expect(await getLangCodeBySectionId(spaLg1Id)).toBe('lg-spa');
	});

	test('an unknown lg1 record is null, never lg-undefined', async () => {
		expect(await getLangCodeBySectionId(999999999)).toBeNull();
		expect(await getLangCodeBySectionId(0)).toBeNull();
		expect(await getLangCodeBySectionId(-1)).toBeNull();
	});

	test('survives a cache clear (the save-event invalidation path)', async () => {
		clearSelectLangCache();
		expect(await getLangCodeBySectionId(spaLg1Id)).toBe('lg-spa');
	});
});

describe('getOriginalLang', () => {
	test('resolves the record-declared original language', async () => {
		expect(await getOriginalLang(TEXT_AREA, SECTION, withLangId)).toBe('lg-spa');
	});

	test('a record without the select_lang value is null (no forcing)', async () => {
		expect(await getOriginalLang(TEXT_AREA, SECTION, withoutLangId)).toBeNull();
	});

	test('a tipo whose ontology relates no select_lang is null', async () => {
		// test52 is a test3-playground component with no related component_select_lang.
		expect(await getOriginalLang('test52', 'test3', 1)).toBeNull();
	});
});

describe('edit context carries options.related_component_lang', () => {
	function editRqo(sectionId: number): Rqo {
		return {
			action: 'read',
			source: {
				action: 'read',
				model: 'component_text_area',
				tipo: TEXT_AREA,
				section_tipo: SECTION,
				section_id: sectionId,
				mode: 'edit',
				lang: 'lg-eng', // the menu is on English; the record is Spanish
			},
		} as unknown as Rqo;
	}

	test('stamped for the record WITH an original language', async () => {
		const context = await buildGetDataContext(editRqo(withLangId), []);
		const main = context.find((entry) => entry.tipo === TEXT_AREA);
		expect(main).toBeDefined();
		expect(main?.options).toEqual({ related_component_lang: 'lg-spa' });
	});

	test('ABSENT for the record without one — read AFTER the stamped one (cache-poisoning guard)', async () => {
		// Order matters: the previous test stamped a context built from the same
		// structural core. If the stamp leaked into the shared core, this record
		// would now claim an original language it does not have.
		const context = await buildGetDataContext(editRqo(withoutLangId), []);
		const main = context.find((entry) => entry.tipo === TEXT_AREA);
		expect(main).toBeDefined();
		expect(main?.options).toBeUndefined();
		expect('options' in (main ?? {})).toBe(false); // key absent, not null — the PHP wire shape
	});

	test('and the stamped record still resolves after the bare one (both orders)', async () => {
		const context = await buildGetDataContext(editRqo(withLangId), []);
		expect(context.find((entry) => entry.tipo === TEXT_AREA)?.options).toEqual({
			related_component_lang: 'lg-spa',
		});
	});
});

describe('tag rendering survives the forcing (the lost-tags regression)', () => {
	const TAGGED = '<p>[TC_00:00:01.000_TC]Text en català</p>';
	let vlcaCatId = 0; // rsc263=vlca, transcript typed under lg-cat (equivalence sibling)
	let fraCatId = 0; // rsc263=fra (no equivalence), transcript under lg-cat → fallback path

	beforeAll(async () => {
		const vlca = (await getLangSectionIdByCode('lg-vlca')) ?? 0;
		const fra = (await getLangSectionIdByCode('lg-fra')) ?? 0;
		expect(vlca).toBeGreaterThan(0);
		expect(fra).toBeGreaterThan(0);

		vlcaCatId = await insertMatrixRecordWithCounter(TABLE, SECTION, {
			relation: {
				[SELECT_LANG]: [
					{
						id: 1,
						type: 'dd151',
						section_tipo: 'lg1',
						section_id: String(vlca),
						from_component_tipo: SELECT_LANG,
					},
				],
			},
			string: {
				[TEXT_AREA]: [
					{ id: 1, value: null, lang: 'lg-spa' },
					{ id: 1, value: TAGGED, lang: 'lg-cat' },
				],
			},
		});
		fraCatId = await insertMatrixRecordWithCounter(TABLE, SECTION, {
			relation: {
				[SELECT_LANG]: [
					{
						id: 1,
						type: 'dd151',
						section_tipo: 'lg1',
						section_id: String(fra),
						from_component_tipo: SELECT_LANG,
					},
				],
			},
			string: { [TEXT_AREA]: [{ id: 1, value: TAGGED, lang: 'lg-cat' }] },
		});
	});

	afterAll(async () => {
		if (vlcaCatId > 0) await deleteMatrixRecord(TABLE, SECTION, vlcaCatId);
		if (fraCatId > 0) await deleteMatrixRecord(TABLE, SECTION, fraCatId);
	});

	async function listItem(sectionId: number) {
		const rqo = {
			action: 'read',
			source: { tipo: SECTION, section_tipo: SECTION, mode: 'list', lang: 'lg-spa' },
			sqo: {
				section_tipo: [SECTION],
				filter_by_locators: [{ section_tipo: SECTION, section_id: String(sectionId) }],
				limit: 1,
				offset: 0,
			},
		} as unknown as Rqo;
		const { data } = await readSection(rqo);
		return data.find(
			(entry) =>
				(entry as { tipo?: string }).tipo === TEXT_AREA &&
				(entry as { section_id?: unknown }).section_id === sectionId,
		) as
			| { lang?: string; entries?: { value?: unknown }[]; fallback_value?: { value?: unknown }[] }
			| undefined;
	}

	test('the forcing follows the EQUIVALENCE sibling that holds the text (506 shape)', async () => {
		// rsc263 says Valencian; the transcript was typed under Catalan — the same
		// language. Forcing the literal vlca slice (empty) stranded the text in the
		// UNRENDERED fallback: visible, but with raw [TC_…] literals. The forced
		// lang must be the sibling that actually holds the text.
		const item = await listItem(vlcaCatId);
		expect(item?.lang).toBe('lg-cat');
		const value = String(item?.entries?.find((entry) => entry?.value)?.value ?? '');
		expect(value).toContain('<img');
		expect(value).not.toContain('[TC_00:00:01.000_TC]Text'); // rendered, not raw
	});

	test('a genuine cross-lang FALLBACK is tag-rendered too', async () => {
		// Original is French (no equivalence with Catalan): the cat text correctly
		// stays a fallback — but a LIST fallback must carry the same tag rendering
		// as a list value, never raw [TC_…] literals.
		const item = await listItem(fraCatId);
		expect(item?.lang).toBe('lg-fra');
		expect(item?.entries ?? []).toEqual([]);
		const fallback = String(item?.fallback_value?.find((entry) => entry?.value)?.value ?? '');
		expect(fallback).toContain('<img');
	});
});

describe('list emission forces the original language', () => {
	async function listRead(sectionId: number) {
		const rqo = {
			action: 'read',
			source: {
				tipo: SECTION,
				section_tipo: SECTION,
				mode: 'list',
				lang: 'lg-eng', // the menu is on English
			},
			sqo: {
				section_tipo: [SECTION],
				filter_by_locators: [{ section_tipo: SECTION, section_id: String(sectionId) }],
				limit: 1,
				offset: 0,
			},
		} as unknown as Rqo;
		return readSection(rqo);
	}

	test("the transcript emits in the record's own language, menu notwithstanding", async () => {
		const { data } = await listRead(withLangId);
		const item = data.find(
			(entry) =>
				(entry as { tipo?: string }).tipo === TEXT_AREA &&
				(entry as { section_id?: unknown }).section_id === withLangId,
		) as { lang?: string; entries?: unknown[] } | undefined;
		expect(item).toBeDefined();
		// PHP $this->lang switch: the item's lang AND slice follow the original.
		// (`entries` is the wire name of the value array — WC-001.)
		expect(item?.lang).toBe('lg-spa');
		expect(Array.isArray(item?.entries)).toBe(true);
		expect(String((item?.entries?.[0] as { value?: unknown })?.value ?? '')).toContain(
			'Transcripción',
		);
	});

	test('a record WITHOUT an original language keeps request-lang behaviour', async () => {
		const { data } = await listRead(withoutLangId);
		const item = data.find(
			(entry) =>
				(entry as { tipo?: string }).tipo === TEXT_AREA &&
				(entry as { section_id?: unknown }).section_id === withoutLangId,
		) as { lang?: string; entries?: unknown[] | null; fallback_value?: unknown } | undefined;
		expect(item).toBeDefined();
		expect(item?.lang).toBe('lg-eng'); // the request lang, unforced
		// The lg-eng slice is empty; the GLOBAL fallback machinery still applies —
		// the spa text surfaces only as the read-only fallback_value, exactly as
		// before this feature.
		expect(item?.entries).toEqual([]);
		expect(JSON.stringify(item?.fallback_value ?? '')).toContain('Transcripción');
	});
});
