/**
 * Phase 5d gate: component save round-trip (real DB, matrix_test playground).
 *
 * Saves an 'update' through the full TS path (saveComponentData) and asserts:
 *  - the target item's value changed, id/lang preserved;
 *  - SIBLING component keys in the same column are untouched (the per-key
 *    jsonb_set contract — the two-server coexistence guarantee);
 *  - a matrix_time_machine audit row was appended with the NEW current-lang
 *    slice, correct coordinates and user;
 *  - permission gate: dispatch refuses save below level 2 and without CSRF.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). The gate
// used to CLONE the ambient install record `numisdata6/1` out of `matrix` and drive
// the save through the install components `numisdata16/17/18`. On any database
// without that install the clone was EMPTY, and two cases went red for the corpus
// rather than for the engine (measured before this change: 3 pass / 2 fail — the
// sibling probe read "" and `remove id 1` had no id 1 to remove). It now BUILDS its
// situation (`zzrt`: one section on matrix_test through the test24 matrix_table
// node, a translatable component_input_text target and two sibling components),
// with the four-language item the cross-language remove needs authored here.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { refusalOf } from '../helpers/refusal.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

/**
 * Where the section's records live. STATED here and PROVEN in beforeAll
 * against `getMatrixTableFromTipo` — the test24 relation is what puts them in
 * `matrix_test`, and a gate that only assumed it would write to `matrix`.
 */
const TEST_TABLE = 'matrix_test';
const TEST_SECTION_TIPO = 'zzrt1';
const TEST_SECTION_ID = 900002;
/** component_input_text, translatable → `string` column: the save target. */
const TARGET_TIPO = 'zzrt2';
/** Two more components in the SAME column — the per-key jsonb_set witnesses. */
const SIBLING_A_TIPO = 'zzrt3';
const SIBLING_B_TIPO = 'zzrt4';
/**
 * An anchor record: dropSituation scopes its sweep to the sections the
 * situation declares records for, so the section needs one to be torn down whole.
 */
const ANCHOR_ID = 900001;

const SITUATION = situation({
	tld: 'zzrt',
	name: 'save_roundtrip',
	nodes: [
		{
			tipo: TEST_SECTION_TIPO,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Ida y vuelta de guardado', 'lg-eng': 'Save round-trip' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: TARGET_TIPO,
			parent: TEST_SECTION_TIPO,
			model: 'component_input_text',
			is_translatable: true,
			term: { 'lg-spa': 'Ceca', 'lg-eng': 'Mint' },
		},
		{
			tipo: SIBLING_A_TIPO,
			parent: TEST_SECTION_TIPO,
			model: 'component_text_area',
			is_translatable: true,
			term: { 'lg-spa': 'Comentario interno', 'lg-eng': 'Comment internal' },
		},
		{
			tipo: SIBLING_B_TIPO,
			parent: TEST_SECTION_TIPO,
			model: 'component_html_text',
			is_translatable: true,
			term: { 'lg-spa': 'Comentario público', 'lg-eng': 'Comment public' },
		},
	],
	records: [{ section_tipo: TEST_SECTION_TIPO, section_id: ANCHOR_ID }],
});

/**
 * The seeded twin. The target carries item id 1 in FOUR languages — the shape
 * the cross-language `remove` contract is defined against — and the two
 * siblings share the `string` column, so a whole-column write would destroy
 * them where a per-key `jsonb_set` leaves them alone.
 */
const SEED_COLUMNS = {
	string: {
		[TARGET_TIPO]: [
			{ id: 1, lang: 'lg-eng', value: 'Arsa' },
			{ id: 1, lang: 'lg-fra', value: 'Arsa (fr)' },
			{ id: 1, lang: 'lg-ita', value: 'Arsa (it)' },
			{ id: 1, lang: 'lg-spa', value: 'Arsa (es)' },
		],
		[SIBLING_A_TIPO]: [{ id: 1, lang: 'lg-spa', value: 'comentario interno' }],
		[SIBLING_B_TIPO]: [{ id: 1, lang: 'lg-spa', value: '<p>comentario público</p>' }],
	},
};

function cleanup(): Promise<void> {
	return cleanScratchRecord(TEST_SECTION_TIPO, TEST_SECTION_ID, TEST_TABLE);
}

describe('component save round-trip (Phase 5d gate)', () => {
	beforeAll(async () => {
		await ensureSituation(SITUATION);
		expect(await getMatrixTableFromTipo(TEST_SECTION_TIPO)).toBe(TEST_TABLE);
		await cleanup();
		await createScratchRecord(TEST_SECTION_TIPO, TEST_SECTION_ID, SEED_COLUMNS, {
			table: TEST_TABLE,
		});
	});
	afterAll(async () => {
		await cleanup();
		expect(await dropSituation(SITUATION)).toBe(0);
	});

	test('update changes the target item, preserves siblings, and audits to TM', async () => {
		const before = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const siblingBefore = before?.rawText.string ?? '';
		expect(siblingBefore).toContain(SIBLING_A_TIPO); // sibling present pre-save

		// NOTE: the save resolves column/table from the ONTOLOGY of the component
		// tipo — TARGET_TIPO (input_text → string column).
		const outcome = await saveComponentData({
			componentTipo: TARGET_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: TEST_SECTION_ID,
			lang: 'lg-spa',
			changedData: [
				{ action: 'update', id: 1, value: { id: 1, lang: 'lg-spa', value: 'Arsa (TS-saved)' } },
			],
			userId: -1,
		});
		expect(outcome.ok).toBe(true);

		const after = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const items = (after?.columns.string as Record<string, { value: string }[]>)?.[TARGET_TIPO];
		expect(items?.some((item) => item.value === 'Arsa (TS-saved)')).toBe(true);
		// The updated item kept its id and lang.
		const updatedItem = items?.find((item) => item.value === 'Arsa (TS-saved)') as
			| { id: number; lang: string }
			| undefined;
		expect(updatedItem?.id).toBe(1);
		expect(updatedItem?.lang).toBe('lg-spa');
		// Sibling component keys in the same column untouched.
		expect(after?.rawText.string).toContain(SIBLING_A_TIPO);
		expect(after?.rawText.string).toContain(SIBLING_B_TIPO);

		// TM audit row: NEW current-lang slice, correct coordinates + user.
		const tmRows = (await sql`
			SELECT tipo, lang, user_id, data FROM matrix_time_machine
			WHERE section_tipo = ${TEST_SECTION_TIPO} AND section_id = ${TEST_SECTION_ID}
			ORDER BY id DESC LIMIT 1
		`) as { tipo: string; lang: string; user_id: number; data: { value: string }[] }[];
		expect(tmRows.length).toBe(1);
		expect(tmRows[0]?.tipo).toBe(TARGET_TIPO);
		expect(tmRows[0]?.lang).toBe('lg-spa');
		expect(Number(tmRows[0]?.user_id)).toBe(-1);
		expect(tmRows[0]?.data.some((item) => item.value === 'Arsa (TS-saved)')).toBe(true);
		// Snapshot is the lg-spa slice only (the seeded record has 4 langs on the target).
		expect(tmRows[0]?.data.every((item) => (item as { lang?: string }).lang === 'lg-spa')).toBe(
			true,
		);
	});

	test('dispatch save gate: below level 2 → 403; missing CSRF → 403', async () => {
		// Non-admin user 16 has no write grant on this section.
		const contextNoWrite: ApiRequestContext = {
			requestId: 'test',
			clientIp: '127.0.0.1',
			session: {
				userId: 16,
				username: 'user16',
				isGlobalAdmin: false,
				csrfToken: 'tok',
				applicationLang: null,
				dataLang: null,
			},
			csrfCandidate: 'tok',
			principal: { userId: 16, isGlobalAdmin: false, isDeveloper: false },
		};
		const deniedByLevel = await dispatchRqo(
			{
				action: 'save',
				dd_api: 'dd_core_api',
				source: {
					type: 'component',
					tipo: TARGET_TIPO,
					section_tipo: TEST_SECTION_TIPO,
					section_id: TEST_SECTION_ID,
					lang: 'lg-spa',
				},
				data: {
					changed_data: [{ action: 'update', id: 1, value: { id: 1, lang: 'lg-spa', value: 'x' } }],
				},
			} as unknown as Rqo,
			contextNoWrite,
		);
		expect(deniedByLevel.status).toBe(403);

		// Superuser but WRONG CSRF: save is not CSRF-exempt → 403 before the handler.
		const contextBadCsrf: ApiRequestContext = {
			requestId: 'test',
			clientIp: '127.0.0.1',
			session: {
				userId: -1,
				username: 'root',
				isGlobalAdmin: true,
				csrfToken: 'expected',
				applicationLang: null,
				dataLang: null,
			},
			csrfCandidate: 'wrong',
			principal: { userId: -1, isGlobalAdmin: true, isDeveloper: true },
		};
		const deniedByCsrf = await dispatchRqo(
			{
				action: 'save',
				dd_api: 'dd_core_api',
				source: {
					type: 'component',
					tipo: TARGET_TIPO,
					section_tipo: TEST_SECTION_TIPO,
					section_id: TEST_SECTION_ID,
					lang: 'lg-spa',
				},
				data: { changed_data: [] },
			} as unknown as Rqo,
			contextBadCsrf,
		);
		expect(deniedByCsrf.status).toBe(403);
		expect(deniedByCsrf.body.ok).toBe(false);
		expect((deniedByCsrf.body.error as { code: string }).code).toBe('auth.csrf_failed');
	});

	test('insert allocates fresh ids from the meta counter; concurrent inserts never collide', async () => {
		// Seed the counter at the max existing id so allocation continues cleanly
		// (PHP canonical array shape: {tipo: [{count: N}]}).
		await sql`
			UPDATE matrix_test SET meta = jsonb_set(COALESCE(meta,'{}'::jsonb), ARRAY[${TARGET_TIPO}], '[{"count": 10}]'::jsonb)
			WHERE section_tipo = ${TEST_SECTION_TIPO} AND section_id = ${TEST_SECTION_ID}
		`;

		// SIX concurrent inserts — atomic append + atomic counter: every item
		// must survive with a distinct id (the lost-update hazard this guards).
		const CONCURRENT = 6;
		const results = await Promise.all(
			Array.from({ length: CONCURRENT }, (_, index) =>
				saveComponentData({
					componentTipo: TARGET_TIPO,
					sectionTipo: TEST_SECTION_TIPO,
					sectionId: TEST_SECTION_ID,
					lang: 'lg-spa',
					changedData: [
						{ action: 'insert', value: { lang: 'lg-spa', value: `inserted ${index}` } },
					],
					userId: -1,
				}),
			),
		);
		expect(results.every((result) => result.ok)).toBe(true);

		const after = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const items = (after?.columns.string as Record<string, { id: number; value: string }[]>)?.[
			TARGET_TIPO
		];
		const inserted = (items ?? []).filter((item) => item.value.startsWith('inserted '));
		// ALL six landed (no lost updates) with DISTINCT freshly allocated ids 11-16.
		expect(inserted.length).toBe(CONCURRENT);
		const ids = inserted.map((item) => item.id);
		expect(new Set(ids).size).toBe(CONCURRENT);
		expect(Math.min(...ids)).toBe(11);
		expect(Math.max(...ids)).toBe(10 + CONCURRENT);

		// Meta counter advanced to the max allocated id (PHP array shape [{count:N}]).
		const meta = (await sql`
			SELECT (meta->${TARGET_TIPO}->0->>'count')::int AS count FROM matrix_test
			WHERE section_tipo = ${TEST_SECTION_TIPO} AND section_id = ${TEST_SECTION_ID}
		`) as { count: number }[];
		expect(meta[0]?.count).toBe(10 + CONCURRENT);
	});

	test('remove drops the id across ALL languages; unknown id fails cleanly', async () => {
		// The seeded target has id 1 in FOUR languages (eng/fra/ita/spa) —
		// removing id 1 must drop all four (the PHP cross-language contract).
		const removed = await saveComponentData({
			componentTipo: TARGET_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: TEST_SECTION_ID,
			lang: 'lg-spa',
			changedData: [{ action: 'remove', id: 1, value: null }],
			userId: -1,
		});
		expect(removed.ok).toBe(true);
		const after = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const items = (after?.columns.string as Record<string, { id: number }[]>)?.[TARGET_TIPO] ?? [];
		expect(items.some((item) => Number(item.id) === 1)).toBe(false);
		expect(items.length).toBeGreaterThan(0); // the inserted 11-16 items remain

		// Unknown id → clean failure, nothing changes.
		const missing = await saveComponentData({
			componentTipo: TARGET_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: TEST_SECTION_ID,
			lang: 'lg-spa',
			changedData: [{ action: 'remove', id: 424242, value: null }],
			userId: -1,
		});
		expect(missing.ok).toBe(false);

		// id null → clear everything.
		const cleared = await saveComponentData({
			componentTipo: TARGET_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: TEST_SECTION_ID,
			lang: 'lg-spa',
			changedData: [{ action: 'remove', id: null, value: null }],
			userId: -1,
		});
		expect(cleared.ok).toBe(true);
		const empty = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(((empty?.columns.string as Record<string, unknown[]>)?.[TARGET_TIPO] ?? []).length).toBe(
			0,
		);
	});

	test('unimplemented actions throw loudly (no silent narrowing)', async () => {
		// sort_data/sort_by_column/add_new_element are now IMPLEMENTED (portal
		// edit writes gate); the ledger guard keeps firing for anything else.
		await expect(
			saveComponentData({
				componentTipo: TARGET_TIPO,
				sectionTipo: TEST_SECTION_TIPO,
				sectionId: TEST_SECTION_ID,
				lang: 'lg-spa',
				changedData: [{ action: 'not_a_real_action', value: null }],
				userId: -1,
			}),
		).rejects.toThrow(/not implemented/);
		// …and it is the TYPED caller fault (the action string is the caller's).
		const refusal = await refusalOf(
			saveComponentData({
				componentTipo: TARGET_TIPO,
				sectionTipo: TEST_SECTION_TIPO,
				sectionId: TEST_SECTION_ID,
				lang: 'lg-spa',
				changedData: [{ action: 'not_a_real_action', value: null }],
				userId: -1,
			}),
		);
		expect(refusal.code).toBe('request.invalid_data');
	});
});
