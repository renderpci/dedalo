/**
 * TM timestamps are DEDALO_TIMEZONE wall-clock time (S1-03), TS-NATIVE half —
 * the DEC-14b survival twin of test/parity/tm_wallclock_differential.test.ts's
 * first test (that gate's cross-engine agreement half retires with the PHP
 * oracle; THIS single-engine wall-clock assertion is the contract that must
 * outlive it).
 *
 * matrix_time_machine.timestamp is text-sorted; the engine stamps local
 * wall-clock time in DEDALO_TIMEZONE via the ONE shared helper (dbTimestamp).
 * A UTC-stamped row misses by the full zone offset (2h in Madrid summer) and
 * mis-sorts every restore timeline in the skew window.
 *
 * BINDS NO INSTALL TLD (AGENTS.md hard rules 2026-08-19). The structure is the
 * SEEDED GENERIC `test` TLD, present on every install and frozen node-for-node
 * in src/core/test_data/test_tld_ontology.json (gate:
 * test/unit/test_tld_ontology_gate.test.ts): the playground section `test3`
 * (→ matrix_test via the test24 matrix_table relation) and its
 * component_input_text child `test52` — the same model, and therefore the same
 * `string` matrix column, that the retired numisdata16 binding carried. No
 * situation() is needed: the generic TLD already expresses exactly what this
 * gate needs (a real section on the scratch table + a real input_text child).
 *
 * Scratch hygiene: disposable test3 twin at the reserved-high id 900321
 * (900000+, clear of the canonical playground ids 1/2/27/10/11/12 and of the
 * sibling gates' 9003xx twins — 900311 has_dataframe, 900312 iri,
 * 900313/900314 info_widget); the row is materialised by direct upsert (no
 * counter bump), and the twin + its TM rows are deleted before AND after.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dbTimestamp } from '../../src/core/db/db_timestamp.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { cleanScratchRecord, createScratchRecord } from '../helpers/test_data.ts';

const SECTION = 'test3'; // generic playground section → matrix_test
const COMPONENT = 'test52'; // input_text → 'string' column
const RECORD_ID = 900321; // reserved-high scratch twin

/** Allowed |stamp − wall clock| in ms (the guarded corruption class is a
 * whole timezone offset ≥ 1h; 120s absorbs runtime + clock drift). */
const TOLERANCE_MS = 120_000;

/** Uniform wall-clock epoch for 'YYYY-MM-DD HH:MM:SS' strings — both sides
 * parsed with the SAME (UTC) rule so the diff measures wall-clock skew. */
function wallClockEpoch(stamp: string): number {
	return Date.parse(`${stamp.replace(' ', 'T')}Z`);
}

beforeAll(async () => {
	await cleanScratchRecord(SECTION, RECORD_ID);
	await createScratchRecord(SECTION, RECORD_ID);
});

afterAll(async () => {
	await cleanScratchRecord(SECTION, RECORD_ID);
});

describe('TM timestamp wall-clock (S1-03, TS-native)', () => {
	test('the save path stamps DEDALO_TIMEZONE wall-clock time', async () => {
		const outcome = await saveComponentData({
			componentTipo: COMPONENT,
			sectionTipo: SECTION,
			sectionId: RECORD_ID,
			lang: 'lg-spa',
			changedData: [
				{ action: 'update', id: null, value: { lang: 'lg-spa', value: 'reloj de pared' } },
			],
			userId: -1,
		});
		expect(outcome.ok).toBe(true);

		const rows = (await sql`
			SELECT timestamp FROM matrix_time_machine
			WHERE section_tipo = ${SECTION} AND section_id = ${RECORD_ID} AND tipo = ${COMPONENT}
			ORDER BY id DESC LIMIT 1
		`) as { timestamp: string | Date }[];
		const raw = rows[0]?.timestamp ?? null;
		expect(raw).not.toBeNull();
		const stamp =
			raw instanceof Date
				? raw.toISOString().slice(0, 19).replace('T', ' ')
				: String(raw).slice(0, 19).replace('T', ' ');

		const skew = Math.abs(wallClockEpoch(stamp) - wallClockEpoch(dbTimestamp()));
		expect(skew).toBeLessThan(TOLERANCE_MS);
	}, 60000);
});
