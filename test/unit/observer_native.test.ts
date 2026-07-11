/**
 * Server-side observer propagation — TS-NATIVE half (DEC-14b), the survival
 * twin of test/parity/observer_differential.test.ts (which needs the live PHP
 * oracle and dies without it). The contract re-expressed here is the
 * differential's PINNED shape (oracle-captured 2026-07-11), never "whatever
 * TS emits":
 *
 * 1. {use_observable_dato} + set_dato_external (the dominant server config,
 *    hierarchy93 ← rsc387): saving an rsc387 locator (indexer → term on1/58)
 *    on a scratch rsc205 twin recomputes the term's hierarchy93 "who indexes
 *    me" mirror — APPEND semantics: existing entries preserved in place, the
 *    twin appended as { id: <max existing item id + 1>, type 'dd151',
 *    section_id STRING, section_tipo, from_component_tipo 'hierarchy93' }
 *    (the differential pinned TS's id as PHP's + 1 — i.e. next-after-highest;
 *    PHP itself draws fresh ids from its own counter, which only ever grows,
 *    so next-after-highest is the shared law).
 * 2. The same save writes the twin's relation_search['rsc387'] ancestor
 *    index = the term's parent chain closest-first, tagged with the saved
 *    items' relation type — for on1/58 that is 8 → 2 → 1 (golden captured
 *    from the LIVE PHP oracle 2026-07-11; if the on1 demo hierarchy is ever
 *    reorganized, recapture — see the differential).
 * 3. Deleting the twins (delete pipeline → inverse cleanup) restores the
 *    term's original bag byte-identically.
 * 4. DEFAULT branch (server.filter === false, rsc36 → rsc860): PHP leaves the
 *    relation_search index UNTOUCHED in this flow (oracle finding pinned in
 *    the differential) — the TS branch must no-op identically.
 *
 * Scratch hygiene: rsc205 twins only; on1/58 is a REAL term record that the
 * observer propagation itself mutates — exactly like the differential we
 * capture its bag first, restore through the delete pipeline, and afterAll
 * ADDITIONALLY force-restores the bag unconditionally (belt-and-braces for
 * crashed runs) before sweeping the twins' matrix/TM rows.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const TERM = { section_tipo: 'on1', section_id: 58 };

/**
 * relation_search['rsc387'] after an rsc387 save targeting on1/58 — the
 * ancestor chain 8 → 2 → 1, closest-first, typed with the saved items'
 * relation type (dd96). CAPTURED FROM THE LIVE PHP ORACLE 2026-07-11 (the
 * differential pins TS === PHP byte-for-byte on this index).
 */
const RELATION_SEARCH_GOLDEN = [
	{ type: 'dd96', section_id: '8', section_tipo: 'on1', from_component_tipo: 'rsc387' },
	{ type: 'dd96', section_id: '2', section_tipo: 'on1', from_component_tipo: 'rsc387' },
	{ type: 'dd96', section_id: '1', section_tipo: 'on1', from_component_tipo: 'rsc387' },
];

let original: unknown[] = [];
let originalCaptured = false;
let afterFirst: unknown[] = [];
let afterSecond: unknown[] = [];
let afterCleanup: unknown[] = [];
let twinA = 0;
let twinB = 0;
let twinASearch: unknown = null;
let twinBSearch: unknown = null;

async function termBag(): Promise<unknown[]> {
	const rows = (await sql.unsafe(
		`SELECT relation->'hierarchy93' AS bag FROM matrix_hierarchy
		 WHERE section_tipo = $1 AND section_id = $2`,
		[TERM.section_tipo, TERM.section_id],
	)) as { bag: unknown[] | null }[];
	return rows[0]?.bag ?? [];
}

async function dispatchAsRoot(rqo: Record<string, unknown>): Promise<void> {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	await dispatchRqo(
		rqo as unknown as Rqo,
		{
			requestId: 'observer_native_test',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
}

/** The exact rqo the differential saves (client save of an rsc387 locator). */
function saveRqo(recordId: number): Record<string, unknown> {
	const item = {
		id: 1,
		type: 'dd96',
		section_id: String(TERM.section_id),
		section_tipo: TERM.section_tipo,
		from_component_tipo: 'rsc387',
	};
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_autocomplete_hi',
			tipo: 'rsc387',
			section_tipo: 'rsc205',
			section_id: String(recordId),
			mode: 'edit',
			lang: 'lg-nolan',
			action: null,
		},
		data: {
			section_id: String(recordId),
			section_tipo: 'rsc205',
			tipo: 'rsc387',
			lang: 'lg-nolan',
			from_component_tipo: 'rsc387',
			value: [item],
			changed_data: [{ action: 'set_data', key: null, value: [item] }],
		},
	};
}

async function relationSearchOf(id: number, key: string): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT relation_search->$2 AS rs FROM matrix
		 WHERE section_tipo = 'rsc205' AND section_id = $1`,
		[id, key],
	)) as { rs: unknown }[];
	return rows[0]?.rs ?? null;
}

beforeAll(async () => {
	original = await termBag();
	originalCaptured = true;
	twinA = await createSectionRecord('rsc205', -1);
	twinB = await createSectionRecord('rsc205', -1);

	await dispatchAsRoot(saveRqo(twinA));
	afterFirst = await termBag();
	await dispatchAsRoot(saveRqo(twinB));
	afterSecond = await termBag();

	twinASearch = await relationSearchOf(twinA, 'rsc387');
	twinBSearch = await relationSearchOf(twinB, 'rsc387');

	// Cleanup through the DELETE pipeline (inverse cleanup restores the term).
	await deleteSectionRecord('rsc205', twinA, -1);
	await deleteSectionRecord('rsc205', twinB, -1);
	afterCleanup = await termBag();
}, 60000);

afterAll(async () => {
	// UNCONDITIONAL term restore first (a crashed beforeAll may have left the
	// real on1/58 bag mutated even though the twins are gone).
	if (originalCaptured) {
		const current = await termBag();
		if (JSON.stringify(current) !== JSON.stringify(original)) {
			if (original.length > 0) {
				await sql.unsafe(
					`UPDATE matrix_hierarchy
					 SET relation = jsonb_set(COALESCE(relation, '{}'::jsonb), '{hierarchy93}', $3::text::jsonb)
					 WHERE section_tipo = $1 AND section_id = $2`,
					[TERM.section_tipo, TERM.section_id, JSON.stringify(original)],
				);
			} else {
				await sql.unsafe(
					`UPDATE matrix_hierarchy SET relation = relation - 'hierarchy93'
					 WHERE section_tipo = $1 AND section_id = $2`,
					[TERM.section_tipo, TERM.section_id],
				);
			}
		}
	}
	for (const id of [twinA, twinB]) {
		if (id === 0) continue;
		await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = $1`, [id]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'rsc205' AND section_id = $1`,
			[id],
		);
	}
});

describe('observer propagation TS-native (rsc387 → hierarchy93)', () => {
	test('first save APPENDS the mirror entry at the term: next id, dd151, string section_id', () => {
		expect(afterFirst.length).toBe(original.length + 1);
		// existing entries preserved byte-identically, in place
		expect(afterFirst.slice(0, -1)).toEqual(original);
		const maxExistingId = (original as { id?: number }[]).reduce(
			(max, entry) => Math.max(max, Number(entry?.id ?? 0)),
			0,
		);
		expect(afterFirst[afterFirst.length - 1]).toEqual({
			id: maxExistingId + 1,
			type: 'dd151',
			section_id: String(twinA),
			section_tipo: 'rsc205',
			from_component_tipo: 'hierarchy93',
		});
	});

	test('second save appends AFTER the first, id incremented again', () => {
		expect(afterSecond.length).toBe(original.length + 2);
		expect(afterSecond.slice(0, -1)).toEqual(afterFirst);
		const firstEntry = afterFirst[afterFirst.length - 1] as { id: number };
		expect(afterSecond[afterSecond.length - 1]).toEqual({
			id: firstEntry.id + 1,
			type: 'dd151',
			section_id: String(twinB),
			section_tipo: 'rsc205',
			from_component_tipo: 'hierarchy93',
		});
	});

	test('the save writes the relation_search ancestor index (oracle-captured golden)', () => {
		expect(twinASearch).toEqual(RELATION_SEARCH_GOLDEN);
		expect(twinBSearch).toEqual(RELATION_SEARCH_GOLDEN);
	});

	test('deleting the twins restores the term to its original bag', () => {
		expect(afterCleanup).toEqual(original);
	});
});

// DEFAULT branch (server.filter === false): saving rsc36 (tag text) triggers
// the rsc860 observer on the SAME record. ORACLE PIN (differential, live
// 2026-07-11): PHP leaves the relation_search index UNTOUCHED in this flow —
// the TS branch must no-op identically. If the TS branch ever starts writing
// it, this fails and the divergence needs a fresh oracle run + ledger line.
describe('observer DEFAULT self-refresh TS-native (rsc36 → rsc860 relation_search no-op)', () => {
	test('the rsc36 save leaves relation_search.rsc860 unwritten (null)', async () => {
		const id = await createSectionRecord('rsc205', -1);
		const bag = [
			{
				id: 1,
				type: 'dd96',
				section_id: String(TERM.section_id),
				section_tipo: TERM.section_tipo,
				from_component_tipo: 'rsc860',
			},
		];
		await sql.unsafe(
			`UPDATE matrix
			 SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object('rsc860', $2::text::jsonb)
			 WHERE section_tipo = 'rsc205' AND section_id = $1`,
			[id, JSON.stringify(bag)],
		);
		try {
			await dispatchAsRoot({
				action: 'save',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					typo: 'source',
					type: 'component',
					model: 'component_text_area',
					tipo: 'rsc36',
					section_tipo: 'rsc205',
					section_id: String(id),
					mode: 'edit',
					lang: 'lg-nolan',
					action: null,
				},
				data: {
					section_id: String(id),
					section_tipo: 'rsc205',
					tipo: 'rsc36',
					lang: 'lg-nolan',
					from_component_tipo: 'rsc36',
					value: [{ id: 1, lang: 'lg-nolan', value: 'OBSERVER_REFRESH_NATIVE_GATE' }],
					changed_data: [
						{
							action: 'set_data',
							key: null,
							value: [{ id: 1, lang: 'lg-nolan', value: 'OBSERVER_REFRESH_NATIVE_GATE' }],
						},
					],
				},
			});
			expect(await relationSearchOf(id, 'rsc860')).toBeNull();
		} finally {
			await deleteSectionRecord('rsc205', id, -1);
			await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = $1`, [
				id,
			]);
			await sql.unsafe(
				`DELETE FROM matrix_time_machine WHERE section_tipo = 'rsc205' AND section_id = $1`,
				[id],
			);
		}
	}, 60000);
});
