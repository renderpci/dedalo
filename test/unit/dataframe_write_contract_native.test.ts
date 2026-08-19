/**
 * THE DATAFRAME WRITE CONTRACT — what a frame locator looks like once it is
 * PERSISTED, and what the paired read hands back.
 *
 * This gate exists because of a live defect (2026-07-31, record oh1/368,
 * slot oh115): component_dataframe was the ONE relation column excluded from
 * validateRelationInsert (`!isDataframeSave` at all three save_component
 * branches), so the client's raw picker locator was stored verbatim. Three
 * frames reached the database shaped like
 *
 *   {"id":1,"id_key":1,"section_id":4,"paginated_key":0,
 *    "from_component_tipo":"oh115","main_component_tipo":"oh24"}
 *
 * — no `type`, numeric section_id, the read-time `paginated_key` echoed back
 * in, and two of the three byte-identical. Because isDataframeEntry demands
 * type === dd490, every one of them was invisible to the reader: the widget
 * showed nothing, and each retry appended another unreadable duplicate.
 * Across the whole matrix table, 9698 PHP-written frames were correct and
 * exactly those 3 were not.
 *
 * WHY THE OLD SUITE MISSED IT — and the rule this file follows.
 * Every pre-existing dataframe test constructs an ALREADY-NORMALIZED frame
 * (dd490, string section_id, no paginated_key) and asserts the engine gives
 * it back unchanged; the read gates seed their frames with raw SQL. That is a
 * passthrough assertion, not a normalization one, and the frozen oracle
 * fixtures are PHP-authored so they can never catch the TS WRITER diverging.
 * So: this file submits RAW CLIENT-SHAPED payloads only. If a test here ever
 * needs to spell `type: 'dd490'` in an input, it has stopped testing the
 * contract.
 *
 * Scratch hygiene: a fresh numisdata3 twin (counter-minted id), swept with
 * its TM + dd542 activity rows in afterAll.
 */
// BINDS INSTALL TLDs: numisdata, rsc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { routeSectionRead } from '../../src/core/section/read_facade.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const HOST_SECTION = 'numisdata3';
const MAIN = 'numisdata34'; // component_autocomplete 'Denomination'
const FRAME = 'numisdata1449'; // its component_dataframe slot (rsc1242 targets)

/** Two MAIN items, so the per-item pairing is actually exercised. */
const MAIN_SEED = [
	{ id: 1, type: 'dd151', section_id: '1', section_tipo: 'numisdata87', from_component_tipo: MAIN },
	{ id: 2, type: 'dd151', section_id: '2', section_tipo: 'numisdata87', from_component_tipo: MAIN },
];

/**
 * The RAW payload the client actually sends (component_portal link_record on
 * a service_autocomplete pick): the picked section-list row locator, which
 * already carries the read-time `paginated_key` and a NUMERIC section_id.
 * Deliberately carries NO `type`, `from_component_tipo` or
 * `main_component_tipo` — the server is the authority on all three.
 */
const rawClientLocator = (targetId: number) => ({
	section_id: targetId,
	section_tipo: 'rsc1242',
	paginated_key: 0,
});

let twin = 0;
let tsContext: Record<string, unknown>;
let principal: Awaited<ReturnType<typeof resolvePrincipal>>;

function frameSaveRqo(
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
			section_id: String(twin),
			mode: 'edit',
			lang: 'lg-nolan',
			action: null,
			caller_dataframe: {
				section_tipo: HOST_SECTION,
				section_id: String(twin),
				main_component_tipo: MAIN,
				id_key: idKey,
			},
		},
		data: {
			section_id: String(twin),
			section_tipo: HOST_SECTION,
			tipo: FRAME,
			lang: 'lg-nolan',
			from_component_tipo: FRAME,
			changed_data: changedData,
		},
	};
}

/** Insert one raw client locator against a main item; throws on save failure. */
async function insertRaw(idKey: number, targetId: number): Promise<void> {
	const dispatched = await dispatchRqo(
		frameSaveRqo(idKey, [
			{ action: 'insert', id: null, value: rawClientLocator(targetId) },
		]) as unknown as Rqo,
		tsContext as never,
	);
	if (dispatched.status !== 200 || dispatched.body.ok === false) {
		throw new Error(`frame save failed: ${JSON.stringify(dispatched.body)}`);
	}
}

async function storedFrames(): Promise<Record<string, unknown>[]> {
	const rows = (await sql.unsafe(
		'SELECT relation->$1 AS frames FROM matrix WHERE section_tipo = $2 AND section_id = $3',
		[FRAME, HOST_SECTION, twin],
	)) as { frames: Record<string, unknown>[] | null }[];
	return rows[0]?.frames ?? [];
}

beforeAll(async () => {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 'dataframe_write_contract_test',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};

	twin = await createSectionRecord(HOST_SECTION, -1);
	await sql.unsafe(
		`UPDATE matrix SET relation = COALESCE(relation, '{}'::jsonb)
			|| jsonb_build_object($1::text, $2::text::jsonb)
		 WHERE section_tipo = $3 AND section_id = $4`,
		[MAIN, JSON.stringify(MAIN_SEED), HOST_SECTION, twin],
	);

	// The exact sequence the user performed on oh1/368:
	//  1. frame target 500 onto main item 1;
	//  2. the SAME target again onto main item 1 (the retry that produced the
	//     duplicate, because nothing rejected it);
	//  3. the same target onto main item 2 — a DIFFERENT pairing, must be kept.
	await insertRaw(1, 500);
	await insertRaw(1, 500);
	await insertRaw(2, 500);
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

describe('dataframe WRITE contract — a raw client locator is normalized, never stored as sent', () => {
	test('the persisted frame is exactly the canonical shape (toEqual ⇒ no stray keys)', async () => {
		const frames = await storedFrames();
		// Selected by PAIRING, not by array position — the stored order is an
		// implementation detail of the merge (siblings first, then additions).
		const frame = frames.find((entry) => Number(entry.id_key) === 1);
		// toEqual, not toMatchObject: `paginated_key` must be ABSENT, and an
		// absence is only assertable by exact comparison. This is the assertion
		// the oh1/368 frames would have failed on all four counts.
		expect(frame).toEqual({
			id: expect.any(Number), // minted from the slot counter
			type: 'dd490', // FORCED by the server — the client sent none
			id_key: 1, // from source.caller_dataframe, not the payload
			// WC-2026-08-10-section-id-int-canonical: the client sent the number
			// 500 and it STAYS an int (repeals the "stored as string" pin).
			section_id: 500,
			section_tipo: 'rsc1242',
			from_component_tipo: FRAME, // forced to the slot tipo
			main_component_tipo: MAIN, // from the caller context
		});
	});

	test('a re-submitted identical frame is DROPPED (test_equal_properties dedup)', async () => {
		// Step 2 of the seed re-sent the same locator for the same main item.
		// Pre-fix this appended a second, byte-identical row differing only by
		// `id` — exactly the oh1/368 id 2 / id 3 pair — because the merge deduped
		// on a full JSON signature, which `id` always makes unique.
		const frames = await storedFrames();
		const forItemOne = frames.filter((frame) => Number(frame.id_key) === 1);
		expect(forItemOne.length).toBe(1);
	});

	test('the SAME target under a DIFFERENT main item is KEPT (id_key is part of identity)', async () => {
		// The dedup must not over-reject: framing record 500 from main item 1 and
		// from main item 2 are two legitimate, distinct statements. The generic
		// relation dedup key ([section_id, section_tipo, type, tag_id]) omits
		// id_key and would have collapsed them into one.
		const frames = await storedFrames();
		expect(frames.map((frame) => Number(frame.id_key)).sort((a, b) => a - b)).toEqual([1, 2]);
		expect(frames.every((frame) => String(frame.section_id) === '500')).toBe(true);
	});

	test('every persisted frame is READABLE — the write and read predicates agree', async () => {
		// The invariant the whole defect violated: something the writer produced
		// that the reader cannot see is corruption, whatever else is true of it.
		const { dataframeEntryMatches } = await import('../../src/core/concepts/subdatum.ts');
		const frames = await storedFrames();
		expect(frames.length).toBeGreaterThan(0);
		for (const frame of frames) {
			expect(dataframeEntryMatches(frame, MAIN, frame.id_key as number, FRAME)).toBe(true);
		}
	});
});

describe('dataframe READ contract — get_data is PAIRED, not the whole slot', () => {
	/** The get_data the client issues on widget refresh AND as the save echo. */
	async function pairedRead(idKey: number): Promise<Record<string, unknown>[]> {
		const rqo = {
			dd_api: 'dd_core_api',
			action: 'read',
			source: {
				action: 'get_data',
				model: 'component_dataframe',
				tipo: FRAME,
				section_tipo: HOST_SECTION,
				section_id: twin,
				mode: 'edit',
				lang: 'lg-nolan',
				caller_dataframe: {
					section_tipo: HOST_SECTION,
					section_id: String(twin),
					main_component_tipo: MAIN,
					id_key: idKey,
				},
			},
		} as unknown as Parameters<typeof routeSectionRead>[0];
		const result = await routeSectionRead(rqo, principal as never);
		return ((result.body as { data?: { data?: unknown[] } }).data?.data ?? []) as Record<
			string,
			unknown
		>[];
	}

	test('it serves ONLY the caller item’s frames, not every frame in the slot', async () => {
		// Pre-fix readComponentData ignored source.caller_dataframe entirely and
		// fell through to the generic portal expansion, so BOTH frames came back
		// for either main item — the "it shows the previous data" symptom.
		const forItemOne = await pairedRead(1);
		const own = forItemOne.find((item) => item.tipo === FRAME);
		expect(own).toBeDefined();
		const entries = (own?.entries ?? []) as Record<string, unknown>[];
		expect(entries.length).toBe(1);
		expect(Number(entries[0]?.id_key)).toBe(1);
	});

	test('the item carries id_key + main_component_tipo — the key the client echoes back', async () => {
		// This stamp is load-bearing, not cosmetic: the client assigns the
		// response onto self.data and sources the NEXT write's id_key from
		// self.data.id_key (common.js create_source). Without it the save echo
		// silently destroys the pairing key of every subsequent write.
		const own = (await pairedRead(2)).find((item) => item.tipo === FRAME);
		expect(own).toBeDefined();
		expect(Number(own?.id_key)).toBe(2);
		expect(own?.main_component_tipo).toBe(MAIN);
	});

	test('a frame that DECLARES a limit keeps it (numisdata1449 → 1)', async () => {
		const own = (await pairedRead(1)).find((item) => item.tipo === FRAME);
		expect((own?.pagination as { limit?: unknown })?.limit).toBe(1);
	});

	test('a main item with NO frames still answers an item (the empty-set trap)', async () => {
		// expandPortal emits nothing for an empty relation, and the client's
		// `self.data = data || {}` would leave the widget with no entries array
		// at all — so a fresh, unframed main item must still get an explicit
		// empty item carrying the pairing it echoes back.
		const own = (await pairedRead(99)).find((item) => item.tipo === FRAME);
		expect(own).toBeDefined();
		expect(own?.entries).toEqual([]);
		expect(Number(own?.id_key)).toBe(99);
		expect(own?.main_component_tipo).toBe(MAIN);
	});
});

describe('dataframe save REFUSES an unusable pairing instead of writing garbage', () => {
	// The client sends `main_component_tipo: self.caller?.tipo || null` whenever
	// the caller instance is not threaded. Pre-fix that produced a save with
	// isDataframeSave true but no pairing, which took the generic branch and
	// persisted an entry with no id_key and no main_component_tipo — stored,
	// invisible to the reader, undeletable through the UI. Exactly the oh1/368
	// failure mode, arriving through a different door.
	test.each([
		['a null main_component_tipo', { main_component_tipo: null, id_key: 1 }],
		['an id_key of 0', { main_component_tipo: MAIN, id_key: 0 }],
		['a non-numeric id_key', { main_component_tipo: MAIN, id_key: 'abc' }],
	])('refuses %s and leaves the slot untouched', async (_label, callerDataframe) => {
		const before = JSON.stringify(await storedFrames());
		const rqo = frameSaveRqo(1, [
			{ action: 'insert', id: null, value: rawClientLocator(777) },
		]) as Record<string, unknown>;
		(rqo.source as Record<string, unknown>).caller_dataframe = callerDataframe;

		const dispatched = await dispatchRqo(rqo as unknown as Rqo, tsContext as never);
		// Refused — never a 500, and never a silent success.
		expect(dispatched.body.ok).toBe(false);
		expect(JSON.stringify(await storedFrames())).toBe(before);
	});
});
