/**
 * SAVE echo page after an add/link on a PAGINATED portal (PHP dd_core_api::save
 * :1453-1479, the `add_new_element`/`insert` branch).
 *
 * Reported live 2026-07-31: adding an image to the oh1 "Identifying image"
 * portal (oh17, `sqo.limit: 1`) opened the FIRST linked record instead of the
 * one just created. The client's add button takes the new record from
 * `self.data.entries[self.data.entries.length-1]` (component_portal/js/
 * buttons.js) — the save echo IS its next `self.data`. The echo re-reads
 * through readComponentData with the SAVE rqo, which carries no sqo, so the
 * read paged at the component's config limit with offset 0: on a limit-1
 * portal `entries` was page ONE and "the last entry" resolved to the first
 * record.
 *
 * PHP recomputed the pagination after these two actions and answered with the
 * LAST page — where the appended element lives. That is the contract this gate
 * pins: total/limit/offset land on the last page, and the echoed entry IS the
 * record the save created.
 *
 * Scratch surfaces only: host + targets are matrix_test rows under the real
 * test3 playground ontology (portal test80 → target section test3), and the
 * record `add_new_element` creates is deleted in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/dispatch.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const SECTION = 'test3'; // playground section → matrix_test
const PORTAL = 'test80'; // component_portal, target section test3
const HOST_ID = 900211;
const TARGET_IDS = [900212, 900213];

let ctx: ApiRequestContext;
/** Ids the save path created — removed in afterAll. */
const created: number[] = [];

function locator(sectionId: number, id: number) {
	return {
		id,
		type: 'dd151',
		section_id: String(sectionId),
		section_tipo: SECTION,
		from_component_tipo: PORTAL,
	};
}

/** The client's add-button save: current data + the add_new_element delta. */
function addRqo(clientLimit: number, total: number): Rqo {
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_portal',
			tipo: PORTAL,
			section_tipo: SECTION,
			section_id: HOST_ID,
			mode: 'edit',
			lang: 'lg-nolan',
			action: null,
		},
		data: {
			section_id: HOST_ID,
			section_tipo: SECTION,
			tipo: PORTAL,
			lang: 'lg-nolan',
			// clone(self.data) carries the portal's CURRENT pagination — PHP honours
			// its limit (the 'Show all' case), so the client's page size rides along.
			pagination: { total, limit: clientLimit, offset: 0 },
			changed_data: [{ action: 'add_new_element', id: null, value: SECTION }],
		},
	} as unknown as Rqo;
}

/** WC-081: the address of the record the save created (absent when none was). */
function createdSectionIdOf(body: unknown): unknown {
	const envelope = body as { ok?: boolean; data?: { created_section_id?: unknown } };
	return envelope.ok === false ? undefined : envelope.data?.created_section_id;
}

function mainItemOf(body: unknown) {
	const envelope = body as { ok?: boolean; data?: { data?: Record<string, unknown>[] } };
	expect(envelope.ok).toBe(true);
	return (envelope.data as { data: Record<string, unknown>[] }).data.find(
		(item) => item.tipo === PORTAL && String(item.section_id) === String(HOST_ID),
	) as
		| {
				entries?: { section_id?: unknown }[];
				pagination?: { total?: number; limit?: number; offset?: number };
		  }
		| undefined;
}

/** Locators stored in the host portal right now (the write-side truth). */
async function storedLocators(): Promise<{ section_id?: string }[]> {
	const record = await readMatrixRecord('matrix_test', SECTION, HOST_ID);
	return ((record?.columns.relation as Record<string, unknown[]> | null)?.[PORTAL] ?? []) as {
		section_id?: string;
	}[];
}

describe('save echo lands on the LAST page after add_new_element (paginated portal)', () => {
	beforeAll(async () => {
		const token = createSession(-1, 'root', true);
		registerSessionCleanup();
		const session = getSession(token);
		ctx = {
			requestId: 'save_add_new_element_page_test',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal: await resolvePrincipal(-1),
		} as ApiRequestContext;

		for (const id of TARGET_IDS) {
			await cleanScratchRecord(SECTION, id);
			await createScratchRecord(SECTION, id);
		}
		await cleanScratchRecord(SECTION, HOST_ID);
		await createScratchRecord(SECTION, HOST_ID, {
			relation: { [PORTAL]: TARGET_IDS.map((id, index) => locator(id, index + 1)) },
		});
	}, 60000);

	afterAll(async () => {
		for (const id of [...created, ...TARGET_IDS, HOST_ID]) {
			await cleanScratchRecord(SECTION, id);
		}
	});

	test('limit 1: the echo is the last page and carries the CREATED record', async () => {
		const { body } = await dispatchRqo(addRqo(1, TARGET_IDS.length), ctx);

		// The write side: the new locator is appended last (applyAddNewElement).
		const stored = await storedLocators();
		expect(stored.length).toBe(3);
		const newSectionId = String(stored[2]?.section_id);
		created.push(Number(newSectionId));

		// WC-081: the client opens the record by ADDRESS, not by echoed position.
		expect(String(createdSectionIdOf(body))).toBe(newSectionId);

		const mainItem = mainItemOf(body);
		expect(mainItem).toBeDefined();
		// total 3, limit 1 → 3 pages → last page offset 2 (PHP :1466-1472).
		expect(mainItem?.pagination).toEqual({ total: 3, limit: 1, offset: 2 });
		// …and THE bug: the client reads entries[entries.length-1] as the new record.
		expect(mainItem?.entries?.length).toBe(1);
		const entries = mainItem?.entries ?? [];
		expect(String(entries[entries.length - 1]?.section_id)).toBe(newSectionId);
	}, 60000);

	test('limit >= total: the echo stays on page one (offset 0)', async () => {
		const before = (await storedLocators()).length;
		const { body } = await dispatchRqo(addRqo(50, before), ctx);

		const stored = await storedLocators();
		expect(stored.length).toBe(before + 1);
		const newSectionId = String(stored[stored.length - 1]?.section_id);
		created.push(Number(newSectionId));

		expect(String(createdSectionIdOf(body))).toBe(newSectionId);

		const mainItem = mainItemOf(body);
		expect(mainItem?.pagination?.offset).toBe(0);
		expect(mainItem?.pagination?.total).toBe(before + 1);
		// The single page holds everything, so "last entry" is still the new record.
		const entries = mainItem?.entries ?? [];
		expect(String(entries[entries.length - 1]?.section_id)).toBe(newSectionId);
	}, 60000);

	test('a save that creates nothing carries NO created_section_id (WC-081)', async () => {
		// A plain link of an EXISTING record: same last-page rule, no creation.
		const rqo = addRqo(1, (await storedLocators()).length) as unknown as {
			data: { changed_data: Record<string, unknown>[] };
		};
		rqo.data.changed_data = [
			{
				action: 'insert',
				id: null,
				value: {
					type: 'dd151',
					section_id: String(TARGET_IDS[0]),
					section_tipo: SECTION,
					from_component_tipo: PORTAL,
				},
			},
		];
		const { body } = await dispatchRqo(rqo as unknown as Rqo, ctx);
		expect(createdSectionIdOf(body)).toBeUndefined();
	}, 60000);
});
