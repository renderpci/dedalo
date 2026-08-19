/**
 * The SAVE ECHO carries the CURRENT-LANG slice, like the read does.
 *
 * A translatable literal stores every language in ONE flat array; the edit read
 * emits only the request-lang slice (resolve/component_data.ts
 * resolveComponentValue). The save echo built the same DataItem envelope from
 * saveComponentData's `data` — documented as "the component's FULL item array
 * after the save" — so the client's post-save `self.data = result.data.find(…)`
 * replaced a one-language entries array with ALL languages.
 *
 * Live symptom (2026-08-03, ontology tree): inline-editing a term relabelled the
 * node with every translation concatenated ("فهرس Inventari Katalog … Inventario"),
 * because ts_object's save handler joins `component.data.entries` (ts_object.js
 * show_component_in_ts_object). Any consumer of the echoed entries had the same
 * bug — the tree just made it visible.
 *
 * Three cases, one per branch of the echo's effective-lang rule (the write
 * engine's own isLangSlicedModel + translatable-or-iri predicate):
 *  - translatable literal → the request-lang slice ONLY (and the sibling
 *    languages stay on disk: the slice is an echo rule, never a write);
 *  - ontology-NON-translatable literal → still lang-sliced, on the lg-nolan
 *    lang its items are stored under, whatever lang the request carries (a
 *    naive `filter by source.lang` would echo an empty array here);
 *  - a model whose class does not support translation → the FULL item array,
 *    untouched by the slice.
 *
 * Scratch surface only: 'test2' (→ matrix_test) at reserved high section_ids;
 * real ontology components supply the resolution — numisdata16 (input_text,
 * translatable, 'string'), test166 (input_text, NOT translatable, 'string'),
 * test51 (number, class has no translation, 'number'). Rows + TM audit rows
 * cleaned before AND after.
 */
// BINDS INSTALL TLDs: numisdata — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { MATRIX_JSONB_COLUMNS, readMatrixRecord } from '../../src/core/db/matrix.ts';
import { updateMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const TEST_TABLE = 'matrix_test';
const TEST_SECTION_TIPO = 'test2';
/** input_text, translatable → 'string' column, one item per language. */
const TRANSLATABLE_TIPO = 'numisdata16';
/** input_text, ontology-NON-translatable → 'string' column, items on lg-nolan. */
const NOLAN_TIPO = 'test166';
/** number — its class does not support translation → never sliced. */
const UNSLICED_TIPO = 'test51';

const TRANSLATABLE_ID = 917261;
const NOLAN_ID = 917262;
const UNSLICED_ID = 917263;
const SCRATCH_IDS = [TRANSLATABLE_ID, NOLAN_ID, UNSLICED_ID];

const context: ApiRequestContext = {
	requestId: 'test',
	clientIp: '127.0.0.1',
	session: {
		userId: -1,
		username: 'root',
		isGlobalAdmin: true,
		csrfToken: 'tok',
		applicationLang: null,
		dataLang: null,
	},
	csrfCandidate: 'tok',
	principal: { userId: -1, isGlobalAdmin: true, isDeveloper: true },
};

/** Seed one scratch record whose `column` carries `items` under `tipo`. */
async function seedRecord(
	sectionId: number,
	column: string,
	tipo: string,
	items: Record<string, unknown>[],
): Promise<void> {
	await cleanScratchRecord(TEST_SECTION_TIPO, sectionId, TEST_TABLE);
	const values: Record<string, unknown> = {};
	for (const name of MATRIX_JSONB_COLUMNS) values[name] = null;
	values[column] = { [tipo]: items };
	expect(await updateMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, sectionId, values)).toBe(
		'inserted',
	);
}

/** The echoed DataItem for a component, via the real save door. */
async function saveAndEcho(
	tipo: string,
	sectionId: number,
	lang: string,
	changedData: unknown[],
): Promise<{ lang: string; entries: Record<string, unknown>[] }> {
	const response = await dispatchRqo(
		{
			action: 'save',
			dd_api: 'dd_core_api',
			source: {
				type: 'component',
				tipo,
				section_tipo: TEST_SECTION_TIPO,
				section_id: sectionId,
				lang,
			},
			data: { changed_data: changedData },
		} as unknown as Rqo,
		context,
	);
	expect(response.status).toBe(200);
	const data = (response.body as { data: { data: unknown[] } }).data.data;
	const item = data.find(
		(el) =>
			(el as { tipo?: string }).tipo === tipo &&
			String((el as { section_id?: unknown }).section_id) === String(sectionId),
	) as { lang: string; entries: Record<string, unknown>[] } | undefined;
	expect(item).toBeDefined();
	return item as { lang: string; entries: Record<string, unknown>[] };
}

beforeAll(async () => {
	await seedRecord(TRANSLATABLE_ID, 'string', TRANSLATABLE_TIPO, [
		{ id: 1, lang: 'lg-eng', value: 'Inventory' },
		{ id: 1, lang: 'lg-spa', value: 'Inventario' },
		{ id: 1, lang: 'lg-fra', value: 'Inventaire' },
	]);
	await seedRecord(NOLAN_ID, 'string', NOLAN_TIPO, [
		{ id: 1, lang: 'lg-nolan', value: 'no language' },
	]);
	await seedRecord(UNSLICED_ID, 'number', UNSLICED_TIPO, [{ id: 1, value: 10 }]);
});

afterAll(async () => {
	for (const sectionId of SCRATCH_IDS) {
		await cleanScratchRecord(TEST_SECTION_TIPO, sectionId, TEST_TABLE);
	}
});

describe('save echo — current-lang slice (read-path twin)', () => {
	test('translatable literal: a lg-spa save echoes ONLY the lg-spa entry', async () => {
		const item = await saveAndEcho(TRANSLATABLE_TIPO, TRANSLATABLE_ID, 'lg-spa', [
			{ action: 'update', id: 1, value: { id: 1, lang: 'lg-spa', value: 'Inventario editado' } },
		]);
		expect(item.lang).toBe('lg-spa');
		// The echo is the request-lang slice — NOT the stored all-language array.
		// (Joining these entries is what relabelled the ontology tree node.)
		expect(item.entries.map((entry) => entry.lang)).toEqual(['lg-spa']);
		expect(item.entries[0]?.value).toBe('Inventario editado');
	}, 30000);

	test('the slice is an ECHO rule: every language survives on disk', async () => {
		const record = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TRANSLATABLE_ID);
		const stored = (record?.columns.string as Record<string, { lang: string; value: string }[]>)?.[
			TRANSLATABLE_TIPO
		];
		expect(stored?.map((entry) => entry.lang).sort()).toEqual(['lg-eng', 'lg-fra', 'lg-spa']);
		// Only the saved language changed value.
		expect(stored?.find((entry) => entry.lang === 'lg-eng')?.value).toBe('Inventory');
		expect(stored?.find((entry) => entry.lang === 'lg-fra')?.value).toBe('Inventaire');
	}, 30000);

	test('NON-translatable literal: sliced on lg-nolan, whatever lang the request carries', async () => {
		const item = await saveAndEcho(NOLAN_TIPO, NOLAN_ID, 'lg-spa', [
			{ action: 'update', id: 1, value: { id: 1, lang: 'lg-nolan', value: 'edited' } },
		]);
		// A naive `filter by source.lang` would echo [] here and blank the client.
		expect(item.entries.map((entry) => entry.lang)).toEqual(['lg-nolan']);
		expect(item.entries[0]?.value).toBe('edited');
	}, 30000);

	test('model without class translation support: the FULL item array is echoed', async () => {
		const item = await saveAndEcho(UNSLICED_TIPO, UNSLICED_ID, 'lg-spa', [
			{ action: 'insert', value: { value: 20 } },
		]);
		// Lang-less items: the slice must not touch them (it would echo nothing).
		expect(item.entries.length).toBe(2);
		expect(item.entries.map((entry) => entry.value)).toEqual([10, 20]);
	}, 30000);
});
