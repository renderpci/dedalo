/**
 * delete_record inverse-reference SELECTIVE strip — TS-NATIVE half, the
 * DEC-14b survival twin of test/parity/delete_inverse_refs_differential.test.ts.
 * That gate carried two halves: (a) the TS-correct contract (strip ONLY the
 * locators pointing at the deleted record) and (b) a pin of the live PHP
 * DEFECT (whole test80 key wiped, keeper lost, mid-flight crash). The defect
 * pin dies with the oracle; the TS contract the differential documents
 * survives HERE, asserted against the TS engine alone.
 *
 * Contract (PHP section_record::remove_all_inverse_references as SPECIFIED,
 * delete step 3): deleting a record strips, from every referrer, exactly the
 * portal locators whose target is the deleted record —
 *   - ONLY the target's locator removed; co-resident locators survive
 *     byte-identical;
 *   - the referrer's dd197/dd201 modified stamps refresh;
 *   - the referrer gets a component TM pair: backfill with the OLD bag
 *     (lang lg-nolan — relation data), stamped exactly 60_000 ms before the
 *     save row holding the surviving bag (delta pinned by the differential).
 *
 * SOFTENED / TS-side notes:
 *  - the differential pinned dd197/dd201 only as DEFINED on the referrer;
 *    the verbatim dd197 locator shape asserted here is the engine's shared
 *    modified-stamp builder, oracle-anchored via the delete_data
 *    differential's full-row compare of the same builder's output.
 *
 * Driven at the ENGINE chokepoint (deleteSectionRecord). Fixture: the
 * differential's exact twin — a test3 TARGET and a test3 REFERRER whose
 * portal (test80) bag holds two locators: one at the target, one
 * self-reference keeper (direct-SQL seed). Both rows + TM swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const SECTION = 'test3';
const TABLE = 'matrix_test';
const PORTAL = 'test80'; // component_portal on the test bench
const USER_ID = -1; // root

let targetId = 0;
let referrerId = 0;
let referrerRow: { relation: Record<string, unknown>; date: Record<string, unknown> } | undefined;
let tmRows: Record<string, unknown>[] = [];
let targetGone = false;

/** The differential's exact seeded bag: target locator + self keeper. */
function seededBag(): Record<string, unknown>[] {
	return [
		{
			id: 1,
			type: 'dd151',
			section_id: String(targetId),
			section_tipo: SECTION,
			from_component_tipo: PORTAL,
		},
		{
			id: 2,
			type: 'dd151',
			section_id: String(referrerId), // self keeper
			section_tipo: SECTION,
			from_component_tipo: PORTAL,
		},
	];
}

beforeAll(async () => {
	targetId = await createSectionRecord(SECTION, USER_ID);
	referrerId = await createSectionRecord(SECTION, USER_ID);
	await sql.unsafe(
		`UPDATE ${TABLE}
		 SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($2::text, $3::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $4`,
		[SECTION, PORTAL, JSON.stringify(seededBag()), referrerId],
	);

	await deleteSectionRecord(SECTION, targetId, USER_ID);

	targetGone =
		(
			(await sql.unsafe(`SELECT 1 FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`, [
				SECTION,
				targetId,
			])) as unknown[]
		).length === 0;
	const rows = (await sql.unsafe(
		`SELECT relation, date FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, referrerId],
	)) as { relation: Record<string, unknown>; date: Record<string, unknown> }[];
	referrerRow = rows[0];
	tmRows = (await sql.unsafe(
		`SELECT tipo, lang, data, timestamp::text AS ts FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ORDER BY id`,
		[SECTION, referrerId, PORTAL],
	)) as Record<string, unknown>[];
}, 30000);

afterAll(async () => {
	for (const id of [targetId, referrerId]) {
		if (id > 0) await cleanScratchRecord(SECTION, id, TABLE);
	}
});

describe('delete_record inverse refs (TS-native selective strip)', () => {
	test('the target record is gone', () => {
		expect(targetGone).toBe(true);
	});

	test('ONLY the target locator is stripped; the keeper survives byte-identical', () => {
		expect(referrerRow).toBeDefined();
		const bag = referrerRow?.relation?.[PORTAL];
		expect(bag).toEqual([
			{
				id: 2,
				type: 'dd151',
				section_id: String(referrerId),
				section_tipo: SECTION,
				from_component_tipo: PORTAL,
			},
		]);
	});

	test('referrer dd197/dd201 modified stamps refreshed', () => {
		// dd197: the acting user's modified-by locator (shared builder shape —
		// oracle-anchored via the delete_data differential; see header).
		expect(referrerRow?.relation?.dd197).toEqual([
			{
				id: 1,
				type: 'dd151',
				section_id: String(USER_ID),
				section_tipo: 'dd128',
				from_component_tipo: 'dd197',
			},
		]);
		expect(referrerRow?.date?.dd201).toBeDefined();
	});

	test('referrer TM pair: backfill (old bag) then the surviving bag, −60s apart', () => {
		const shapes = tmRows.map((tm) => ({ lang: tm.lang, data: tm.data }));
		expect(shapes).toEqual([
			{ lang: 'lg-nolan', data: seededBag() },
			{
				lang: 'lg-nolan',
				data: [
					{
						id: 2,
						type: 'dd151',
						section_id: String(referrerId),
						section_tipo: SECTION,
						from_component_tipo: PORTAL,
					},
				],
			},
		]);
		const delta =
			new Date(String(tmRows[1]?.ts)).getTime() - new Date(String(tmRows[0]?.ts)).getTime();
		expect(delta).toBe(60_000);
	});
});
