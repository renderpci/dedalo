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

/** An ontology section with real rows in the suite DB: a sweep would resolve 216. */
const POPULATED_SECTION = 'test0';

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
		expect(response.result).toBe(false);
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

	test('wholeSection:true is still available to internal rebuild callers', async () => {
		// The ontology-file import re-derives a whole TLD deliberately. A tipo with
		// no matrix table stops it harmlessly while proving the guard lets it past.
		const response = await setRecordsInDdOntology({
			sectionTipo: 'zzz999',
			wholeSection: true,
			userId: -1,
		});
		expect(response.errors.join(' ')).toMatch(/matrix table/i);
		expect(response.errors.join(' ')).not.toMatch(/no scope/i);
	});
});

describe('the handler takes its scope from the request', () => {
	test('a non-developer is refused before any scope work', async () => {
		const response = await toolOntologySetRecords(
			ctx(PLAIN_USER, { section_tipo: POPULATED_SECTION }),
		);
		expect(response.result).toBe(false);
		expect(response.errors).toContain('unauthorized');
	});

	test('LIST mode without an sqo FAILS CLOSED (PHP wrote nothing here too)', async () => {
		const response = await toolOntologySetRecords(
			ctx(DEVELOPER, { section_tipo: POPULATED_SECTION }),
		);
		expect(response.result).toBe(false);
		expect(String(response.msg)).toMatch(/sqo/i);
	});

	test('a non-object sqo is refused, not coerced into a whole-section run', async () => {
		for (const bad of ['all', 42, [], null]) {
			const response = await toolOntologySetRecords(
				ctx(DEVELOPER, { section_tipo: POPULATED_SECTION, sqo: bad }),
			);
			expect(response.result).toBe(false);
			expect(String(response.msg)).toMatch(/sqo/i);
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
		expect(String(response.msg)).toMatch(/no records/i);
		expect(response.result).toBe(true);
	});

	test('EDIT mode (an explicit section_id) still passes the scope guard', async () => {
		// A tipo with no matrix table stops the run harmlessly AFTER the scope
		// check, proving the guard does not block the single-record path.
		const response = await toolOntologySetRecords(
			ctx(DEVELOPER, { section_tipo: 'zzz999', section_id: 1 }),
		);
		expect(response.result).toBe(false);
		expect((response.errors ?? []).join(' ')).toMatch(/matrix table/i);
		expect(String(response.msg)).not.toMatch(/sqo/i);
	});
});
