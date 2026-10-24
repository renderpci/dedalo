/**
 * tool_ontology::set_records_in_dd_ontology — THE SCOPE IS THE REQUEST (WC-043).
 *
 * PHP list mode rebuilt the SQO from the session
 * (`$_SESSION['dedalo']['config']['sqo'][$sqo_id]`) and, when it was absent,
 * FAILED CLOSED: `'Not sqo_session found from id: …'`, writing nothing
 * (class.tool_ontology.php:186-200). TS has no session-SQO twin, and the port
 * filled the gap with `SELECT section_id FROM "<table>" WHERE section_tipo = $1`
 * — i.e. it wrote EVERY record of the section. That is fail-OPEN where PHP was
 * fail-CLOSED, and it is the same shape as the 2026-07-19 runaway that WC-043
 * closed for tool_update_cache. Live blast radius when found: 12,172 records
 * across mdcat0/dmm0/dd0/rsc0, foreground, no progress, no abort — behind a
 * client that gives up at 60s while the server keeps writing.
 *
 * The rule these tests pin: a batch tool action takes its scope from the
 * REQUEST or refuses. Nothing in this file writes — every case is a refusal or
 * a zero-match resolve, and the dd_ontology row count is asserted unchanged.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { setRecordsInDdOntology } from '../../src/core/ontology/ontology_write.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { toolOntologySetRecords } from '../../tools/tool_ontology/server/tool_ontology.ts';
import { refusalOf } from '../helpers/refusal.ts';

/** An ontology section with real rows in the suite DB: a sweep would resolve 216. */
const POPULATED_SECTION = 'test0';

/**
 * This file's OWN governed scratch section (tld `zzqw`, owned here alone —
 * scratch_tld_uniqueness_tripwire). Nothing ever writes to it: every case that
 * names it asserts it EMPTY first, so "absent record / nothing written" is
 * measured, never assumed from the ambient DB.
 */
const EMPTY_GOVERNED_SECTION = 'zzqw0';

async function scratchSectionRecords(): Promise<number> {
	const rows = (await sql.unsafe(
		'SELECT count(*)::int AS c FROM matrix_ontology WHERE section_tipo = $1',
		[EMPTY_GOVERNED_SECTION],
	)) as { c: number }[];
	return rows[0]?.c ?? 0;
}

const DEVELOPER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const PLAIN_USER: Principal = { userId: 7, isGlobalAdmin: false, isDeveloper: false };

function ctx(principal: Principal, options: Record<string, unknown>) {
	return { principal, userId: principal.userId, options } as never;
}

async function ontologyRowCount(): Promise<number> {
	const rows = (await sql.unsafe('SELECT count(*)::int AS c FROM dd_ontology')) as { c: number }[];
	return rows[0]?.c ?? 0;
}

let rowsBefore = 0;
let populatedTotal = 0;

beforeAll(async () => {
	rowsBefore = await ontologyRowCount();
	const rows = (await sql.unsafe(
		'SELECT count(*)::int AS c FROM matrix_ontology WHERE section_tipo = $1',
		[POPULATED_SECTION],
	)) as { c: number }[];
	populatedTotal = rows[0]?.c ?? 0;
});

afterAll(async () => {
	// Non-negotiable: this file must not have written a single dd_ontology row.
	expect(await ontologyRowCount()).toBe(rowsBefore);
});

describe('the populated fixture makes these assertions non-vacuous', () => {
	test('the section really does hold records a sweep would have swept', () => {
		expect(populatedTotal).toBeGreaterThan(100);
	});
});

describe('setRecordsInDdOntology — no whole-section default', () => {
	test('list mode with NO explicit scope is REFUSED, not swept', async () => {
		const response = await setRecordsInDdOntology({
			sectionTipo: POPULATED_SECTION,
			userId: -1,
		});
		expect(response.ok).toBe(false);
		expect(response.total).toBe(0);
		expect(response.processed_count).toBe(0);
		expect(response.errors.join(' ')).toMatch(/scope|sqo|section_id/i);
		// The proof it did not fall back: it never even counted the 216 rows.
		expect(response.total).not.toBe(populatedTotal);
	});

	test('an EMPTY explicit id list means NOTHING, never "everything"', async () => {
		// An empty scope is not the dangerous case — an ABSENT one is. What must
		// never happen is an empty list widening into the section's whole set.
		const response = await setRecordsInDdOntology({
			sectionTipo: POPULATED_SECTION,
			sectionIds: [],
			userId: -1,
		});
		expect(response.total).toBe(0);
		expect(response.processed_count).toBe(0);
		expect(response.total).not.toBe(populatedTotal);
	});

	test('there is no whole-section scope: a retired `wholeSection` flag is UNSCOPED, refused', async () => {
		// The flag's last caller (the installer's upsert-only re-derive) is retired — a whole tld
		// is ontology_state.rebuildOntology's. A caller still sending it (stale code, a JS
		// object built by hand) reaches the no-scope refusal, never the unbounded scan: measured
		// on the POPULATED section, where a sweep would have counted every record.
		const response = await setRecordsInDdOntology({
			sectionTipo: POPULATED_SECTION,
			wholeSection: true,
			userId: -1,
		} as never);
		expect(response.ok).toBe(false);
		expect(response.total).toBe(0);
		expect(response.processed_count).toBe(0);
		expect(response.errors.join(' ')).toMatch(/no scope/i);
	});

	test('a section no ontology tld governs is refused before any scope work (ONT-2)', async () => {
		const response = await setRecordsInDdOntology({
			sectionTipo: 'zzz999',
			sectionIds: [1],
			userId: -1,
		});
		expect(response.ok).toBe(false);
		expect(response.errors.join(' ')).toMatch(/not governed/i);
	});
});

describe('the handler takes its scope from the request', () => {
	test('a non-developer is refused before any scope work', async () => {
		const refusal = await refusalOf(
			toolOntologySetRecords(ctx(PLAIN_USER, { section_tipo: POPULATED_SECTION })),
		);
		expect(refusal.code).toBe('perm.developer_required');
	});

	test('LIST mode without an sqo FAILS CLOSED (PHP wrote nothing here too)', async () => {
		const refusal = await refusalOf(
			toolOntologySetRecords(ctx(DEVELOPER, { section_tipo: POPULATED_SECTION })),
		);
		expect(refusal.code).toBe('request.invalid_options');
		expect(String(refusal.publicMessage)).toMatch(/sqo/i);
	});

	test('a non-object sqo is refused, not coerced into a whole-section run', async () => {
		for (const bad of ['all', 42, [], null]) {
			const refusal = await refusalOf(
				toolOntologySetRecords(ctx(DEVELOPER, { section_tipo: POPULATED_SECTION, sqo: bad })),
			);
			expect(refusal.code).toBe('request.invalid_options');
			expect(String(refusal.publicMessage)).toMatch(/sqo/i);
		}
	});

	test('an sqo matching NOTHING processes nothing — the scope is honoured', async () => {
		// If the whole-section fallback were still reachable this would resolve the
		// section's 216 records instead of 0.
		const response = await toolOntologySetRecords(
			ctx(DEVELOPER, {
				section_tipo: POPULATED_SECTION,
				sqo: {
					section_tipo: [POPULATED_SECTION],
					filter_by_locators: [{ section_tipo: POPULATED_SECTION, section_id: '999999901' }],
				},
			}),
		);
		expect(response.ok).toBe(true);
		expect(String((response.data as { summary?: unknown }).summary)).toMatch(/no records/i);
	});

	test('EDIT mode (an explicit section_id) still passes the scope guard', async () => {
		// A governed section whose record is absent stops the run harmlessly AFTER the
		// scope check, proving the guard does not block the single-record path.
		expect(await scratchSectionRecords()).toBe(0);
		const refusal = await refusalOf(
			toolOntologySetRecords(
				ctx(DEVELOPER, { section_tipo: EMPTY_GOVERNED_SECTION, section_id: 1 }),
			),
		);
		expect(refusal.code).toBe('tool.action_failed');
		// The write's per-check detail joins the LOG-only message. POSITIVE proof the run got
		// PAST the scope guard: the per-record step (the absent record projects nothing) ran …
		expect(refusal.message).toContain(
			`Failed to process dd_ontology record for section_tipo: ${EMPTY_GOVERNED_SECTION}, section_id: 1`,
		);
		// … and neither the guard's refusal nor a request-sqo path is what stopped it.
		expect(refusal.message).not.toMatch(/no scope/i);
		expect(refusal.message).not.toMatch(/sqo/i);
	});

	test('a section that is not an ontology node section is refused as invalid options (ONT-2)', async () => {
		const refusal = await refusalOf(
			toolOntologySetRecords(ctx(DEVELOPER, { section_tipo: 'zzz999', section_id: 1 })),
		);
		expect(refusal.code).toBe('request.invalid_options');
		expect(String(refusal.publicMessage)).toContain('is not an ontology node section');
	});
});
