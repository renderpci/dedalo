/**
 * Phase 5d gate: component save round-trip (real DB, matrix_test playground).
 *
 * Clones a real record into matrix_test, saves an 'update' through the full
 * TS path (saveComponentData), and asserts:
 *  - the target item's value changed, id/lang preserved;
 *  - SIBLING component keys in the same column are untouched (the per-key
 *    jsonb_set contract — the two-server coexistence guarantee);
 *  - a matrix_time_machine audit row was appended with the NEW current-lang
 *    slice, correct coordinates and user;
 *  - permission gate: dispatch refuses save below level 2 and without CSRF.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const TEST_TABLE = 'matrix_test';
// 'test2' is a REAL ontology section whose matrix_table relation resolves to
// matrix_test — the save path's ontology-driven table resolution runs for
// real. The high section_id keeps us clear of the genuine test records.
const TEST_SECTION_TIPO = 'test2';
const TEST_SECTION_ID = 900002;

function cleanup(): Promise<void> {
	return cleanScratchRecord(TEST_SECTION_TIPO, TEST_SECTION_ID);
}

describe('component save round-trip (Phase 5d gate)', () => {
	beforeAll(async () => {
		await cleanup();
		// Clone numisdata6 #1 (string column carries numisdata16/17/18) into the playground.
		const source = await readMatrixRecord('matrix', 'numisdata6', 1);
		await createScratchRecord(TEST_SECTION_TIPO, TEST_SECTION_ID, source?.rawText ?? {}, {
			rawText: true,
		});
	});
	afterAll(cleanup);

	test('update changes the target item, preserves siblings, and audits to TM', async () => {
		const before = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const siblingBefore = before?.rawText.string ?? '';
		expect(siblingBefore).toContain('numisdata17'); // sibling present pre-save

		// NOTE: the save resolves column/table from the ONTOLOGY of the
		// component tipo — numisdata16 (input_text → string column). The test
		// record lives in matrix_test under a test section tipo, so we call
		// saveComponentData directly with the playground coordinates.
		const outcome = await saveComponentData({
			componentTipo: 'numisdata16',
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
		const items = (after?.columns.string as Record<string, { value: string }[]>)?.numisdata16;
		expect(items?.some((item) => item.value === 'Arsa (TS-saved)')).toBe(true);
		// The updated item kept its id and lang.
		const updatedItem = items?.find((item) => item.value === 'Arsa (TS-saved)') as
			| { id: number; lang: string }
			| undefined;
		expect(updatedItem?.id).toBe(1);
		expect(updatedItem?.lang).toBe('lg-spa');
		// Sibling component keys in the same column untouched.
		expect(after?.rawText.string).toContain('numisdata17');
		expect(after?.rawText.string).toContain('numisdata18');

		// TM audit row: NEW current-lang slice, correct coordinates + user.
		const tmRows = (await sql`
			SELECT tipo, lang, user_id, data FROM matrix_time_machine
			WHERE section_tipo = ${TEST_SECTION_TIPO} AND section_id = ${TEST_SECTION_ID}
			ORDER BY id DESC LIMIT 1
		`) as { tipo: string; lang: string; user_id: number; data: { value: string }[] }[];
		expect(tmRows.length).toBe(1);
		expect(tmRows[0]?.tipo).toBe('numisdata16');
		expect(tmRows[0]?.lang).toBe('lg-spa');
		expect(Number(tmRows[0]?.user_id)).toBe(-1);
		expect(tmRows[0]?.data.some((item) => item.value === 'Arsa (TS-saved)')).toBe(true);
		// Snapshot is the lg-spa slice only (source record has 4 langs on numisdata16).
		expect(tmRows[0]?.data.every((item) => (item as { lang?: string }).lang === 'lg-spa')).toBe(
			true,
		);
	});

	test('dispatch save gate: below level 2 → 403; missing CSRF → 403', async () => {
		// Non-admin user 16 has no write grant on numisdata6.
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
					tipo: 'numisdata16',
					section_tipo: 'numisdata6',
					section_id: 1,
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
					tipo: 'numisdata16',
					section_tipo: 'numisdata6',
					section_id: 1,
					lang: 'lg-spa',
				},
				data: { changed_data: [] },
			} as unknown as Rqo,
			contextBadCsrf,
		);
		expect(deniedByCsrf.status).toBe(403);
		expect(deniedByCsrf.body.msg).toContain('CSRF');
	});

	test('insert allocates fresh ids from the meta counter; concurrent inserts never collide', async () => {
		// Seed the counter at the max existing id so allocation continues cleanly
		// (PHP canonical array shape: {tipo: [{count: N}]}).
		await sql`
			UPDATE matrix_test SET meta = jsonb_set(COALESCE(meta,'{}'::jsonb), '{numisdata16}', '[{"count": 10}]'::jsonb)
			WHERE section_tipo = ${TEST_SECTION_TIPO} AND section_id = ${TEST_SECTION_ID}
		`;

		// SIX concurrent inserts — atomic append + atomic counter: every item
		// must survive with a distinct id (the lost-update hazard this guards).
		const CONCURRENT = 6;
		const results = await Promise.all(
			Array.from({ length: CONCURRENT }, (_, index) =>
				saveComponentData({
					componentTipo: 'numisdata16',
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
		const items = (after?.columns.string as Record<string, { id: number; value: string }[]>)
			?.numisdata16;
		const inserted = (items ?? []).filter((item) => item.value.startsWith('inserted '));
		// ALL six landed (no lost updates) with DISTINCT freshly allocated ids 11-16.
		expect(inserted.length).toBe(CONCURRENT);
		const ids = inserted.map((item) => item.id);
		expect(new Set(ids).size).toBe(CONCURRENT);
		expect(Math.min(...ids)).toBe(11);
		expect(Math.max(...ids)).toBe(10 + CONCURRENT);

		// Meta counter advanced to the max allocated id (PHP array shape [{count:N}]).
		const meta = (await sql`
			SELECT (meta->'numisdata16'->0->>'count')::int AS count FROM matrix_test
			WHERE section_tipo = ${TEST_SECTION_TIPO} AND section_id = ${TEST_SECTION_ID}
		`) as { count: number }[];
		expect(meta[0]?.count).toBe(10 + CONCURRENT);
	});

	test('remove drops the id across ALL languages; unknown id fails cleanly', async () => {
		// The cloned numisdata16 has id 1 in FOUR languages (eng/fra/ita/spa) —
		// removing id 1 must drop all four (the PHP cross-language contract).
		const removed = await saveComponentData({
			componentTipo: 'numisdata16',
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: TEST_SECTION_ID,
			lang: 'lg-spa',
			changedData: [{ action: 'remove', id: 1, value: null }],
			userId: -1,
		});
		expect(removed.ok).toBe(true);
		const after = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		const items = (after?.columns.string as Record<string, { id: number }[]>)?.numisdata16 ?? [];
		expect(items.some((item) => Number(item.id) === 1)).toBe(false);
		expect(items.length).toBeGreaterThan(0); // the inserted 11-16 items remain

		// Unknown id → clean failure, nothing changes.
		const missing = await saveComponentData({
			componentTipo: 'numisdata16',
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: TEST_SECTION_ID,
			lang: 'lg-spa',
			changedData: [{ action: 'remove', id: 424242, value: null }],
			userId: -1,
		});
		expect(missing.ok).toBe(false);

		// id null → clear everything.
		const cleared = await saveComponentData({
			componentTipo: 'numisdata16',
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: TEST_SECTION_ID,
			lang: 'lg-spa',
			changedData: [{ action: 'remove', id: null, value: null }],
			userId: -1,
		});
		expect(cleared.ok).toBe(true);
		const empty = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(((empty?.columns.string as Record<string, unknown[]>)?.numisdata16 ?? []).length).toBe(
			0,
		);
	});

	test('unimplemented actions throw loudly (no silent narrowing)', async () => {
		// sort_data/sort_by_column/add_new_element are now IMPLEMENTED (portal
		// edit writes gate); the ledger guard keeps firing for anything else.
		await expect(
			saveComponentData({
				componentTipo: 'numisdata16',
				sectionTipo: 'numisdata6',
				sectionId: 1,
				lang: 'lg-spa',
				changedData: [{ action: 'not_a_real_action', value: null }],
				userId: -1,
			}),
		).rejects.toThrow(/not implemented/);
	});
});
