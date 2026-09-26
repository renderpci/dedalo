/**
 * SELECT-FAMILY DATALIST — every door that hands a component its options
 * answers the SAME options the edit read does.
 *
 * WHY THIS FILE EXISTS. component_select_lang's options are the PROJECT
 * languages (PHP component_select_lang::get_list_of_values), but its node's sqo
 * names lg1 — every language record there is (~21.7k on the suite database).
 * The edit read knew (a model conditional in the select-family emitter); the
 * save echo, the temporal echo, filter_by_list and the state widget asked the
 * generic builder instead. So every select_lang SAVE read all ~21.7k lg1
 * records, labeled them, and shipped a 2.2 MB datalist back — 1.7 s cold in
 * process on a laptop, 8.7–10.3 s on a loaded CI runner, which is the
 * `component_select_lang (test89) save launched by deactivate did not settle`
 * flake of test_components_activate (gh runs 35843092386, 36262409411) — and
 * the echo then REPLACED the client's correct 12-option datalist with the
 * 21.7k-option one.
 *
 * The fix moved the rule to the ONE door (relations/datalist.ts getDatalist,
 * descriptor facet `datalistSource`). This gate measures the OUTCOME, per door,
 * for every select-family component of the test3 playground: the save echo's
 * and the temporal echo's datalist deep-equal the edit read's; select_lang's is
 * the project languages; the echo stays small.
 *
 * Situation: a scratch test3 record created here (never a canonical id),
 * removed with its TM and activity rows in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getDatalist, probeDatalistSize } from '../../src/core/relations/datalist.ts';
import { getSelectLangDatalist } from '../../src/core/relations/select_lang.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const SECTION = 'test3';
const SELECT_LANG = 'test89';
const LANG = 'lg-nolan';

/** Every select-family component of the test3 playground (SELECT_FAMILY_MODELS). */
const SELECT_FAMILY: readonly { model: string; tipo: string }[] = [
	{ model: 'component_check_box', tipo: 'test88' },
	{ model: 'component_radio_button', tipo: 'test87' },
	{ model: 'component_select', tipo: 'test91' },
	{ model: 'component_select_lang', tipo: SELECT_LANG },
	{ model: 'component_publication', tipo: 'test92' },
	{ model: 'component_relation_model', tipo: 'test169' },
];

/**
 * A select_lang echo carrying the project languages is a few KB. The defect
 * shipped 2.2 MB; 64 KiB is two orders of magnitude of headroom either way.
 */
const SELECT_LANG_ECHO_MAX_BYTES = 64 * 1024;

let tsContext: Record<string, unknown>;
let recordId = 0;

type Item = Record<string, unknown> & { tipo?: string; datalist?: unknown[] };

function mainItem(body: unknown, tipo: string): Item {
	const items = (body as { data?: { data?: Item[] } }).data?.data ?? [];
	const found = items.find((item) => item.tipo === tipo);
	if (found === undefined) throw new Error(`no data item for ${tipo} in the response`);
	return found;
}

async function readEdit(model: string, tipo: string, sectionId: number): Promise<Item> {
	const response = await dispatchRqo(
		{
			action: 'read',
			dd_api: 'dd_core_api',
			source: {
				model,
				tipo,
				section_tipo: SECTION,
				section_id: sectionId,
				mode: 'edit',
				lang: LANG,
				action: 'get_data',
			},
		} as unknown as Rqo,
		tsContext as never,
	);
	expect(response.status).toBe(200);
	return mainItem(response.body, tipo);
}

async function save(
	model: string,
	tipo: string,
	sectionId: number,
	changedData: unknown[],
	extraSource: Record<string, unknown> = {},
) {
	const response = await dispatchRqo(
		{
			action: 'save',
			dd_api: 'dd_core_api',
			prevent_lock: true,
			source: {
				model,
				tipo,
				section_tipo: SECTION,
				section_id: sectionId,
				mode: 'edit',
				lang: LANG,
				...extraSource,
			},
			data: { entries: [], changed_data: changedData },
		} as unknown as Rqo,
		tsContext as never,
	);
	expect(response.status).toBe(200);
	return response;
}

beforeAll(async () => {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	tsContext = {
		requestId: 'select_family_echo_datalist_native',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal: await resolvePrincipal(-1),
	};
	recordId = await createSectionRecord(SECTION, -1);
});

afterAll(async () => {
	if (recordId > 0) {
		await cleanScratchRecord(SECTION, recordId);
		// The dd542 activity rows the save chokepoint appended for OUR record.
		await sql.unsafe(
			`DELETE FROM matrix_activity
			 WHERE section_tipo = 'dd542'
			   AND misc->'dd551'->0->'value'->>'section_tipo' = $1
			   AND misc->'dd551'->0->'value'->>'section_id' = $2`,
			[SECTION, String(recordId)],
		);
	}
});

describe('the door — getDatalist applies the model option source', () => {
	test('component_select_lang options are the project languages, not the lg1 section', async () => {
		const options = await getDatalist(SELECT_LANG, null, SECTION, LANG);
		const projectLangs = await getSelectLangDatalist(LANG);
		// Floor: an empty list would make every equality below vacuous.
		expect(projectLangs.length).toBeGreaterThan(0);
		expect(options).toEqual(projectLangs);
		// The language token, not a record id — the select_lang option shape.
		for (const option of options) expect(String(option.section_id)).toMatch(/^lg-/);
		// The probe and the build agree about what the options ARE.
		expect(await probeDatalistSize(SELECT_LANG, null, SECTION, LANG, 100_000)).toBe(
			options.length,
		);
	});
});

describe('the save echo carries the edit read datalist', () => {
	for (const { model, tipo } of SELECT_FAMILY) {
		test(`${model} (${tipo})`, async () => {
			const read = await readEdit(model, tipo, recordId);
			expect(Array.isArray(read.datalist)).toBe(true);
			const response = await save(model, tipo, recordId, [{ action: 'set_data', value: [] }]);
			const echo = mainItem(response.body, tipo);
			expect(echo.datalist).toEqual(read.datalist);
		});
	}

	test('a select_lang save persists the picked language and echoes a small body', async () => {
		const options = await getSelectLangDatalist(LANG);
		const picked = options[options.length - 1];
		if (picked === undefined) throw new Error('no project language to pick');
		const response = await save('component_select_lang', SELECT_LANG, recordId, [
			{
				action: 'update',
				key: 0,
				value: { ...picked.value, type: 'dd151', from_component_tipo: SELECT_LANG },
			},
		]);
		const echo = mainItem(response.body, SELECT_LANG);
		expect(echo.datalist).toEqual(options);
		expect(echo.entries).toEqual([expect.objectContaining(picked.value)]);
		expect(JSON.stringify(response.body).length).toBeLessThan(SELECT_LANG_ECHO_MAX_BYTES);
		// And the read agrees with what the echo said was stored.
		const read = await readEdit('component_select_lang', SELECT_LANG, recordId);
		expect(read.entries).toEqual([expect.objectContaining(picked.value)]);
		expect(read.datalist).toEqual(options);
	});
});

describe('the temporal echo carries the edit read datalist', () => {
	test('component_select_lang (test89)', async () => {
		const read = await readEdit('component_select_lang', SELECT_LANG, recordId);
		const response = await save(
			'component_select_lang',
			SELECT_LANG,
			recordId,
			[{ action: 'set_data', value: [] }],
			{ is_temporal: true },
		);
		expect(mainItem(response.body, SELECT_LANG).datalist).toEqual(read.datalist);
	});
});
