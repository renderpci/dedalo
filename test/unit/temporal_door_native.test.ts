/**
 * The TEMPORAL door's semantics (WC-059) — the halves the tripwire does not carry.
 *
 * The tripwire (test/unit/temporal_instance_tripwire.test.ts) proves the
 * INVARIANT: nothing is persisted. This file proves the door is also CORRECT —
 * that the value a temporal clone shows the user is the value the same edit
 * would have produced on a real record. That matters because
 * tool_propagate_component_data takes whatever the clone ends up holding and
 * writes it across every record the section's search matches: a clone that
 * applies `set_data` differently from the engine propagates the wrong value to
 * thousands of records, silently.
 *
 * Three parts:
 *  1. the pure applier (no DB) — every action, lang-sliced and not;
 *  2. the READ shell — a temporal read must not serve the real record's value;
 *  3. add_new_element — the one temporal action that legitimately WRITES, and
 *     only ever to the TARGET section.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { applyTemporalLiteralChanges } from '../../src/core/section/record/temporal.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const SECTION = 'test3';
const TABLE = 'matrix_test';
const SENTINEL_ID = 1;
const LITERAL = 'test52';
const CANONICAL_LITERAL_VALUE = 'input text content of one';
const PORTAL = 'test80';
/** component_select — a RELATION-column component, i.e. the datalist path. */
const SELECT = 'test91';

let tsContext: Record<string, unknown>;
const createdTargets: { sectionTipo: string; sectionId: number }[] = [];

const SLICED = { langSliced: true, effectiveLang: 'lg-eng', translatable: true, lang: 'lg-eng' };
const FLAT = {
	langSliced: false,
	effectiveLang: 'lg-nolan',
	translatable: false,
	lang: 'lg-nolan',
};

/** Unwrap, failing loudly rather than silently asserting on `undefined`. */
function applied(result: ReturnType<typeof applyTemporalLiteralChanges>): unknown[] {
	if (!result.ok) throw new Error(`expected ok, got: ${result.message}`);
	return result.items;
}

beforeAll(async () => {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	const principal = await resolvePrincipal(-1);
	tsContext = {
		requestId: 'temporal_door_native',
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session?.csrfToken ?? null,
		principal,
	};
});

afterAll(async () => {
	for (const target of createdTargets) {
		await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`, [
			target.sectionTipo,
			target.sectionId,
		]);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[target.sectionTipo, target.sectionId],
		);
	}
});

describe('WC-059 — the literal door NORMALIZES, it does not re-apply the delta', () => {
	// THE CONTRACT UNDER TEST. `data.entries` arrives POST-delta: change_value
	// (component_common.js:1272-1278) runs update_data_value over every
	// changed_data item, mutating self.data.entries, and only THEN calls
	// save(changed_data), which ships clone(self.data). So each case below sends
	// the entries the CLIENT would already hold, plus the delta that produced
	// them, and asserts the echo is that same value — normalized, not re-applied.
	//
	// Getting this wrong is invisible to a set_data-only gate, because set_data is
	// idempotent under re-application. That is exactly how the first version of
	// this door shipped looking correct.

	test('remove: the already-removed entry stays removed and does NOT fail the save', () => {
		// The client held ids 1 and 2 and spliced 2 out locally, so entries are [1]
		// while the delta still says "remove 2". Re-applying would find no id 2 and
		// fail — the user's deletion would surface as a red widget and never
		// round-trip.
		const result = applyTemporalLiteralChanges(
			[{ id: 1, lang: 'lg-eng', value: 'a' }],
			[{ action: 'remove', id: 2, value: null }],
			SLICED,
		);
		expect(result.ok).toBe(true);
		expect(applied(result)).toEqual([{ id: 1, lang: 'lg-eng', value: 'a' }]);
	});

	test('insert: the already-inserted entry is NOT duplicated', () => {
		const inserted = { value: 'b' };
		const items = applied(
			applyTemporalLiteralChanges(
				[{ id: 3, lang: 'lg-eng', value: 'a' }, inserted],
				[{ action: 'insert', id: null, value: inserted }],
				SLICED,
			),
		);
		expect(items).toEqual([
			{ id: 3, lang: 'lg-eng', value: 'a' },
			// minted id + lang stamp — the normalization that DOES still happen
			{ value: 'b', lang: 'lg-eng', id: 4 },
		]);
	});

	test('update: the already-updated entry is replaced in place, never appended', () => {
		const items = applied(
			applyTemporalLiteralChanges(
				[
					{ id: 1, lang: 'lg-spa', value: 'es' },
					{ id: 1, lang: 'lg-eng', value: 'en2' },
				],
				[{ action: 'update', id: 1, value: { id: 1, value: 'en2' } }],
				SLICED,
			),
		);
		expect(items).toEqual([
			{ id: 1, lang: 'lg-eng', value: 'es' },
			{ id: 1, lang: 'lg-eng', value: 'en2' },
		]);
	});

	test('set_data echoes the value the client already holds', () => {
		const items = applied(
			applyTemporalLiteralChanges(
				[{ id: 2, lang: 'lg-eng', value: 'replaced' }],
				[{ action: 'set_data', value: [{ id: 2, value: 'replaced' }] }],
				SLICED,
			),
		);
		expect(items).toEqual([{ id: 2, lang: 'lg-eng', value: 'replaced' }]);
	});

	test('EVERY id-less item is minted an id — not just the one named in the delta', () => {
		// The mint is what stops the array growing forever: an id-less item echoed
		// back id-less means the client's NEXT update sends id:null, which the
		// persisted engine appends rather than replaces. For
		// tool_propagate_component_data, that array is written across every matched
		// record.
		const items = applied(
			applyTemporalLiteralChanges(
				[{ id: 5, lang: 'lg-eng', value: 'a' }, { value: 'b' }, { value: 'c' }],
				[],
				SLICED,
			),
		) as Record<string, unknown>[];
		expect(items.every((item) => typeof item.id === 'number' && (item.id as number) > 0)).toBe(
			true,
		);
		expect(new Set(items.map((item) => item.id)).size).toBe(3);
	});

	test('a lang-sliced component FORCE-stamps the effective lang; a flat one leaves it alone', () => {
		expect(
			applied(applyTemporalLiteralChanges([{ id: 1, lang: 'lg-spa', value: 'x' }], [], SLICED)),
		).toEqual([{ id: 1, lang: 'lg-eng', value: 'x' }]);
		expect(applied(applyTemporalLiteralChanges([{ id: 1, value: 'x' }], [], FLAT))).toEqual([
			{ id: 1, value: 'x' },
		]);
	});

	test('the caller’s entries array is never mutated', () => {
		const entries = [{ value: 'a' }];
		applyTemporalLiteralChanges(entries, [], SLICED);
		expect(entries).toEqual([{ value: 'a' }]);
	});

	test('an action outside the allowlist is refused with the action NAMED', () => {
		const result = applyTemporalLiteralChanges([], [{ action: 'sort_data', value: null }], SLICED);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain('sort_data');
	});

	test('add_new_element is refused on a LITERAL component (relations only)', () => {
		const result = applyTemporalLiteralChanges(
			[],
			[{ action: 'add_new_element', value: 'test3' }],
			SLICED,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain('relation');
	});
});

describe('WC-059 — the temporal READ serves no record', () => {
	test("a temporal read does NOT leak record 1's stored value", async () => {
		// Control: the SAME read without the flag DOES serve the real value. Without
		// this half, an empty result could mean "temporal worked" or "the read is
		// broken for unrelated reasons", and the test would prove nothing.
		const realRead = await dispatchRqo(
			{
				action: 'read',
				dd_api: 'dd_core_api',
				source: {
					model: 'component_input_text',
					tipo: LITERAL,
					section_tipo: SECTION,
					section_id: SENTINEL_ID,
					mode: 'edit',
					lang: 'lg-eng',
					action: 'get_data',
				},
			} as unknown as Rqo,
			tsContext as never,
		);
		expect(JSON.stringify(realRead.body)).toContain(CANONICAL_LITERAL_VALUE);

		const temporalRead = await dispatchRqo(
			{
				action: 'read',
				dd_api: 'dd_core_api',
				source: {
					model: 'component_input_text',
					tipo: LITERAL,
					section_tipo: SECTION,
					section_id: SENTINEL_ID,
					mode: 'edit',
					lang: 'lg-eng',
					action: 'get_data',
					is_temporal: true,
				},
			} as unknown as Rqo,
			tsContext as never,
		);
		expect(temporalRead.status).toBe(200);
		// NOT-LEAKED is only half the contract, and the weaker half: returning
		// NOTHING would also satisfy it while breaking the widget. The clone is an
		// editable component — the client does `self.data = data || {}` and then
		// reads `data.entries` / `data.datalist`, so a missing item leaves it with
		// no entries array at all. Assert the item EXISTS, addressed at the
		// sentinel, with an empty value.
		const temporalBody = temporalRead.body as {
			result: { data: Record<string, unknown>[] };
		};
		const temporalItem = temporalBody.result.data.find((entry) => entry.tipo === LITERAL);
		expect(temporalItem).toBeDefined();
		expect(String(temporalItem?.section_id)).toBe(String(SENTINEL_ID));
		expect(temporalItem?.entries).toEqual([]);
		expect(JSON.stringify(temporalRead.body)).not.toContain(CANONICAL_LITERAL_VALUE);
	});

	test('a temporal SELECT read still serves its DATALIST (the staging-form case)', async () => {
		// service_tmp_section (tool_import_marc21 / zotero / files) builds its
		// staging form almost entirely from the select/filter/radio family, in mode
		// 'edit'. These resolve through the RELATION branch, whose no-record path
		// returns [] unless the temporal case is carved out — and a select with no
		// datalist renders ZERO options, which nothing can then repair: with nothing
		// pickable, no save echo ever arrives to fix it.
		const response = await dispatchRqo(
			{
				action: 'read',
				dd_api: 'dd_core_api',
				source: {
					model: 'component_select',
					tipo: SELECT,
					section_tipo: SECTION,
					section_id: SENTINEL_ID,
					mode: 'edit',
					lang: 'lg-nolan',
					action: 'get_data',
					is_temporal: true,
				},
			} as unknown as Rqo,
			tsContext as never,
		);
		expect(response.status).toBe(200);
		const body = response.body as { result: { data: Record<string, unknown>[] } };
		const item = body.result.data.find((entry) => entry.tipo === SELECT);
		expect(item).toBeDefined();
		expect(Array.isArray(item?.datalist)).toBe(true);
		expect((item?.datalist as unknown[]).length).toBeGreaterThan(0);
		// The value is the clone's own (empty), never record 1's.
		expect(item?.entries).toEqual([]);
	});
});

describe('WC-059 — the temporal SAVE echo carries the select datalist', () => {
	test('a temporal select save echoes a non-empty datalist', async () => {
		// Every SELECT_FAMILY_MODELS member is a RELATION-column component, so a
		// datalist attach placed on the literal branch can never run. The client's
		// post-save render reads data.datalist (component_radio_button
		// get_checked_value_label), and the persisted door attaches it — so this one
		// must too, on the branch that actually executes.
		const response = await dispatchRqo(
			{
				action: 'save',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					model: 'component_select',
					tipo: SELECT,
					section_tipo: SECTION,
					section_id: SENTINEL_ID,
					mode: 'edit',
					lang: 'lg-nolan',
					is_temporal: true,
				},
				data: {
					entries: [],
					changed_data: [{ action: 'set_data', value: [] }],
				},
			} as unknown as Rqo,
			tsContext as never,
		);
		expect(response.status).toBe(200);
		const body = response.body as { result: { data: Record<string, unknown>[] } };
		const item = body.result.data.find((entry) => entry.tipo === SELECT);
		expect(item).toBeDefined();
		expect(Array.isArray(item?.datalist)).toBe(true);
		expect((item?.datalist as unknown[]).length).toBeGreaterThan(0);
	});
});

describe('WC-059 — add_new_element creates the TARGET, never the host', () => {
	test('a consultation-only target is refused with 400, not a thrown 500', async () => {
		// add_new_element is the ONE action on this door that really writes, so it
		// carries the gates the door's read-level entry check deliberately skips.
		// Without this refusal the createSectionRecord engine THROWS on dd542/dd15
		// — a 500 where a 400 is the honest answer.
		const response = await dispatchRqo(
			{
				action: 'save',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					model: 'component_portal',
					tipo: PORTAL,
					section_tipo: SECTION,
					section_id: SENTINEL_ID,
					mode: 'edit',
					lang: 'lg-nolan',
					is_temporal: true,
				},
				data: { entries: [], changed_data: [{ action: 'add_new_element', value: 'dd542' }] },
			} as unknown as Rqo,
			tsContext as never,
		);
		expect(response.status).toBe(400);
		// Envelope v2: a caller refusal (request.invalid) — the temporal door's
		// named sentence is operator-disclosure until its sweep gives it a code.
		expect((response.body as { error: { code: string } }).error.code).toBe('request.invalid');
	});

	test('an empty target section is refused', async () => {
		const response = await dispatchRqo(
			{
				action: 'save',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					model: 'component_portal',
					tipo: PORTAL,
					section_tipo: SECTION,
					section_id: SENTINEL_ID,
					mode: 'edit',
					lang: 'lg-nolan',
					is_temporal: true,
				},
				data: { entries: [], changed_data: [{ action: 'add_new_element', value: '' }] },
			} as unknown as Rqo,
			tsContext as never,
		);
		expect(response.status).toBe(400);
	});

	test('the created record exists, the host is untouched, and the locator is echoed', async () => {
		const hostBefore = (await sql.unsafe(
			`SELECT to_jsonb(t)::text AS row_text FROM "${TABLE}" t
			 WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, SENTINEL_ID],
		)) as { row_text: string }[];

		const response = await dispatchRqo(
			{
				action: 'save',
				dd_api: 'dd_core_api',
				prevent_lock: true,
				source: {
					model: 'component_portal',
					tipo: PORTAL,
					section_tipo: SECTION,
					section_id: SENTINEL_ID,
					mode: 'edit',
					lang: 'lg-nolan',
					is_temporal: true,
				},
				data: {
					entries: [],
					changed_data: [{ action: 'add_new_element', value: SECTION }],
				},
			} as unknown as Rqo,
			tsContext as never,
		);
		expect(response.status).toBe(200);

		const body = response.body as {
			result: { data: Record<string, unknown>[]; created_section_id?: unknown };
		};
		const item = body.result.data.find((entry) => entry.tipo === PORTAL);
		const entries = (item?.entries ?? []) as Record<string, unknown>[];
		expect(entries.length).toBe(1);
		const created = Number(entries[0]?.section_id);
		expect(Number.isFinite(created)).toBe(true);
		createdTargets.push({ sectionTipo: SECTION, sectionId: created });

		// WC-081: this door stamps the created ADDRESS too — the add button is the
		// same button on a temporal portal, and it opens the record by address.
		expect(body.result.created_section_id).toBe(created);

		// The TARGET record really exists (this action is a genuine write — the
		// only one a temporal instance may cause).
		const target = (await sql.unsafe(
			`SELECT section_id FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, created],
		)) as { section_id: number }[];
		expect(target.length).toBe(1);
		// It is NOT the host, and NOT the sentinel.
		expect(created).not.toBe(SENTINEL_ID);

		// And the host — the sentinel address — is byte-identical.
		const hostAfter = (await sql.unsafe(
			`SELECT to_jsonb(t)::text AS row_text FROM "${TABLE}" t
			 WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, SENTINEL_ID],
		)) as { row_text: string }[];
		expect(hostAfter[0]?.row_text).toBe(hostBefore[0]?.row_text);
	});
});
