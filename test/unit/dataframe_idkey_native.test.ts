/**
 * Dataframe id_key stamping on the FRAME SAVE path — TS-NATIVE half
 * (DEC-14b P1), the survival twin of the twin-round-trip test of
 * test/parity/dataframe_roundtrip_differential.test.ts (which compares end
 * states against the live PHP oracle and dies without it). ONLY the
 * uncovered part is re-expressed — the removal CASCADE (main item remove →
 * frame strip) is already covered by test/unit/dataframe_cascade_removal.test.ts
 * and is NOT duplicated here.
 *
 * The contract (PHP class.component_dataframe.php set_data :187-213 +
 * class.dataframe_caller.php; differential-pinned as data::text byte
 * equality vs live PHP): a frame save arriving with
 * source.caller_dataframe {section_tipo, section_id, main_component_tipo,
 * id_key} applies its changed_data to the CALLER's frame subset only and
 * merges back sibling-preserving:
 *
 *  1. UPDATE of an existing frame (id-matched) replaces it in place — and the
 *     merge re-orders the slot to [siblings..., caller entries...] (PHP
 *     set_data appends the caller subset after the untouched siblings);
 *  2. an ID-LESS INSERT gets the caller's id_key STAMPED (INT) and the next
 *     item id MINTED from the slot's meta counter (absorb-then-allocate —
 *     seeded ids 1,2 ⇒ the insert takes 3);
 *  3. REMOVE by id drops the frame from the caller subset; the sibling
 *     item's frames survive untouched;
 *  4. the MAIN component's data is NEVER touched by frame saves;
 *  5. the meta counter lands at the canonical PHP shape
 *     {<frame_tipo>: [{count: N}]} with N = the highest item id ever seen
 *     (differential pin: counters byte-equal ⇒ same item-id allocation).
 *
 * SOFTENED vs the differential (oracle-only by nature): the three READ-ONLY
 * parity tests (§15657 / §7 / §14073 item projections) assert REAL mutable
 * records against PHP and stay in the parity gate. The seed here is a
 * synthetic §15657-SHAPED fixture (two main items + two dd490 frames onto
 * rsc1242) rather than the live record's bytes — the frame save treats the
 * main data as opaque, so its exact target values are not load-bearing; the
 * frame/locator property set (id, type dd490, id_key, section_id,
 * section_tipo, from_component_tipo, main_component_tipo) is the
 * differential's pinned shape.
 *
 * Scratch hygiene: fresh numisdata3 twin via createSectionRecord (distinct
 * counter-minted id — no collision with sibling gates); twin + TM rows + the
 * dd542 activity rows the dispatch save chokepoint appends for OUR twin are
 * swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const HOST_SECTION = 'numisdata3';
const MAIN = 'numisdata34'; // component_autocomplete 'Denomination'
const FRAME = 'numisdata1449'; // its component_dataframe slot (rsc1242 targets)

/** §15657-shaped MAIN items (opaque to the frame save — asserted untouched). */
const MAIN_SEED = [
	{ id: 1, type: 'dd151', section_id: '1', section_tipo: 'numisdata87', from_component_tipo: MAIN },
	{ id: 2, type: 'dd151', section_id: '2', section_tipo: 'numisdata87', from_component_tipo: MAIN },
];

/** A frame locator in the differential's pinned property set. */
const frameOf = (id: number, idKey: number, targetId: string) => ({
	id,
	type: 'dd490',
	id_key: idKey,
	section_id: targetId,
	section_tipo: 'rsc1242',
	from_component_tipo: FRAME,
	main_component_tipo: MAIN,
});

const FRAMES_SEED = [frameOf(1, 1, '500'), frameOf(2, 2, '501')];

let twin = 0;
let tsContext: Record<string, unknown>;
let mainBefore: string | null = null;

/** A frame save RQO with the caller_dataframe pairing context (differential shape). */
function frameSaveRqo(
	hostId: number,
	idKey: number,
	changedData: Record<string, unknown>[],
): Record<string, unknown> {
	return {
		action: 'save',
		dd_api: 'dd_core_api',
		prevent_lock: true,
		source: {
			typo: 'source',
			type: 'component',
			model: 'component_dataframe',
			tipo: FRAME,
			section_tipo: HOST_SECTION,
			section_id: String(hostId),
			mode: 'edit',
			lang: 'lg-nolan',
			action: null,
			caller_dataframe: {
				section_tipo: HOST_SECTION,
				section_id: String(hostId),
				main_component_tipo: MAIN,
				id_key: idKey,
			},
		},
		data: {
			section_id: String(hostId),
			section_tipo: HOST_SECTION,
			tipo: FRAME,
			lang: 'lg-nolan',
			from_component_tipo: FRAME,
			changed_data: changedData,
		},
	};
}

async function twinState(): Promise<{ frames: unknown; main: string | null; counter: unknown }> {
	const rows = (await sql.unsafe(
		`SELECT relation->$1 AS frames_v, (relation->$2)::text AS main_v, meta->$1 AS counter_v
		 FROM matrix WHERE section_tipo = $3 AND section_id = $4`,
		[FRAME, MAIN, HOST_SECTION, twin],
	)) as { frames_v: unknown; main_v: string | null; counter_v: unknown }[];
	return {
		frames: rows[0]?.frames_v ?? null,
		main: rows[0]?.main_v ?? null,
		counter: rows[0]?.counter_v ?? null,
	};
}

beforeAll(async () => {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 'dataframe_idkey_native_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};

	twin = await createSectionRecord(HOST_SECTION, -1);
	await sql.unsafe(
		`UPDATE matrix SET relation = COALESCE(relation, '{}'::jsonb)
			|| jsonb_build_object($1::text, $2::text::jsonb)
			|| jsonb_build_object($3::text, $4::text::jsonb)
		 WHERE section_tipo = $5 AND section_id = $6`,
		[MAIN, JSON.stringify(MAIN_SEED), FRAME, JSON.stringify(FRAMES_SEED), HOST_SECTION, twin],
	);
	mainBefore = (await twinState()).main;

	// The differential's three logical operations, in order:
	// 1. UPDATE item-1's frame (id 1, id_key 1) to a different rsc1242 target;
	// 2. INSERT a second frame for item 2 WITHOUT id_key — the save must stamp
	//    the caller's id_key (PHP :205-213) and mint the next item id;
	// 3. REMOVE item-2's ORIGINAL frame (id 2) — its inserted sibling survives.
	const insertedFrame = {
		type: 'dd490',
		section_id: '502',
		section_tipo: 'rsc1242',
		from_component_tipo: FRAME,
		main_component_tipo: MAIN,
	};
	const operations: { idKey: number; changed: Record<string, unknown>[] }[] = [
		{ idKey: 1, changed: [{ action: 'update', id: 1, value: frameOf(1, 1, '579') }] },
		{ idKey: 2, changed: [{ action: 'insert', id: null, value: insertedFrame }] },
		{ idKey: 2, changed: [{ action: 'remove', id: 2, value: null }] },
	];
	for (const operation of operations) {
		const dispatched = await dispatchRqo(
			frameSaveRqo(twin, operation.idKey, operation.changed) as unknown as Rqo,
			tsContext as never,
		);
		if (dispatched.status !== 200 || (dispatched.body as { result?: unknown }).result === false) {
			throw new Error(`frame save failed: ${JSON.stringify(dispatched.body)}`);
		}
	}
}, 60000);

afterAll(async () => {
	if (twin === 0) return;
	await sql.unsafe('DELETE FROM matrix WHERE section_tipo = $1 AND section_id = $2', [
		HOST_SECTION,
		twin,
	]);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		HOST_SECTION,
		twin,
	]);
	await sql.unsafe(
		`DELETE FROM matrix_activity
		 WHERE section_tipo = 'dd542'
		   AND string->'dd546'->0->>'value' = $1
		   AND misc->'dd551'->0->'value'->>'section_id' = $2`,
		[FRAME, String(twin)],
	);
});

describe('dataframe frame saves by caller id_key (TS-native end state)', () => {
	test('update + id_key-stamped insert + remove land the pinned frames slot', async () => {
		const { frames } = await twinState();
		// end state: item-1's frame updated in place (target 579) and merged
		// sibling-first; item-2's original frame removed; the id-less insert
		// persisted with the MINTED id 3 and the CALLER's id_key 2 stamped as INT.
		expect(frames).toEqual([frameOf(1, 1, '579'), frameOf(3, 2, '502')]);
	});

	test('the main component data is untouched by frame saves (byte-equal)', async () => {
		const { main } = await twinState();
		expect(main).not.toBeNull();
		expect(main).toBe(mainBefore as string);
	});

	test('the frame slot meta counter holds the canonical PHP shape at the minted id', async () => {
		const { counter } = await twinState();
		// PHP stores the per-component item counter as [{count: N}] (canonical
		// shape on every real record); seeded ids 1,2 absorbed, insert minted 3.
		expect(counter).toEqual([{ count: 3 }]);
	});
});
