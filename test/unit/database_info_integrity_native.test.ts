/**
 * databaseInfoRelationIntegrityReport
 * (src/core/area_maintenance/widgets/database_info.ts:412) — the
 * matrix_relation_index audit exposed as the `relation_integrity_report`
 * maintenance action.
 *
 * WHAT THIS PINS, branch by branch, as the function actually reads today:
 *   1. Per DISTINCT target_section_tipo in the store, an anti-join against the
 *      tipo's OWN resolved matrix table → a DISTINCT-target dangling count.
 *      Only counts > 0 land in `dangling_by_target_section` (the `if (n > 0)`
 *      guard) and each one is added to `dangling_targets_total`.
 *   2. A reference whose target record EXISTS contributes nothing. The seed puts
 *      FOUR references in the rsc170 bucket — two distinct missing targets (one
 *      of them referenced twice, from two components) and one live target — so
 *      the bucket must read exactly 2. A reversed anti-join reads 1; no target
 *      check at all, or a dropped DISTINCT, reads 3. A FIFTH reference
 *      (test2/930904, whose id exists in matrix_test only under test3) pins the
 *      other half: the probe keys on (section_tipo, section_id), not the id.
 *   3. `getMatrixTableFromTipo(tipo) === null` (an unknown tipo, or a node whose
 *      model is not `section`) → the tipo is NOT probed at all; instead an
 *      `… resolves to no matrix table — its references are unverifiable` line is
 *      pushed onto `errors` and the loop `continue`s. This is the highest-value
 *      branch here: a silent skip would report a clean bill of health over
 *      references nobody checked.
 *   4. `errors.length > 0` → msg 'Warning. Request done with errors', else
 *      'OK. Request done successfully'.
 *   5. Per source table carrying a `%_relation_index_sync` trigger, the count of
 *      relation entries the trigger SKIPPED because `section_id` is absent or
 *      non-numeric — enumerated from the jsonb side, since by construction they
 *      are not in the index. Same `n > 0` omission rule.
 *
 * NOT COVERED, and why (stated rather than faked):
 *   - The `to_regclass('public.matrix_relation_index') IS NULL` early return.
 *     The probe is schema-qualified, so the only routes are dropping the store
 *     shared by the whole suite (destructive) or stubbing the probe — which
 *     would assert the mock, not the widget. Deliberately dropped.
 *   - The `catch { table = null }` around the resolver. It converges on exactly
 *     the same push+continue as the `table === null` branch case 3 exercises,
 *     and reaching the throw needs a broken ontology row.
 *   - The msg 'OK. Request done successfully' arm. `dedalo_mib_v7_test` carries
 *     ~14 unresolvable target sections of its own, so `errors` is NEVER empty on
 *     this corpus; the ternary's other arm is unreachable here. The msg
 *     assertion below is therefore weak on its own — the load-bearing pin for
 *     branch 3 is the exact error line, not the msg.
 *
 * CONCURRENCY — why the fixture looks the way it does. Every figure this report
 * emits is a whole-database aggregate, and other agents write matrix_test at the
 * same time, so NOTHING here asserts a total, and the delta assertions are made
 * attributable rather than merely differenced:
 *   - The dangling cases ride on `rsc170`, chosen because it resolves (to
 *     `matrix`, through the virtual-section fallback), has live records to point
 *     at, and has ZERO rows in the store as a target — asserted as a
 *     pre-condition. No other agent can move that bucket: it would take a write
 *     to `matrix`, which no test performs.
 *   - The non-numeric case cannot escape the shared `matrix_test` key, so its
 *     foreign contribution is measured directly, immediately after each report
 *     run (the non-numeric sweep is the report's LAST loop, so the two readings
 *     are milliseconds apart), and subtracted.
 * The report is run ONCE before the seed and ONCE after, both in `beforeAll`.
 *
 * SCRATCH SURFACE (this file owns it): matrix_test rows with section_id in
 * 930000-930999, tipos test3 / test2 / test38, plus the matrix_relation_index
 * rows the sync trigger derives from them and the matrix_time_machine tail (raw
 * SQL writes no TM row; the sweep asserts that stays true). Cleaned, fail-loud,
 * before AND after. No production record is written or read for mutation — the
 * live rsc170 target is a read-only lookup.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test';
import { widget } from '../../src/core/area_maintenance/widgets/database_info.ts';
import { sql } from '../../src/core/db/postgres.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

/** The handler ignores its principal; the maintenance area gates the call. */
const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

const ID_MIN = 930000;
const ID_MAX = 930999;
/** Every tipo this file may leave a row under, for the fail-loud sweep. */
const SCRATCH_TIPOS = ['test3', 'test2', 'test38'];

/** The source record carrying every probed relation entry. */
const SOURCE_TIPO = 'test3';
const SOURCE_ID = 930001;
/**
 * The target section for the dangling/live pair: resolves to `matrix` and, as
 * `beforeAll` asserts, is absent from the store — so its bucket is this file's
 * alone.
 */
const TARGET_TIPO = 'rsc170';
/**
 * TWO rsc170 records that do NOT exist — the dangling case. Two, not one,
 * because the seed also carries one LIVE rsc170 reference: with a 1/1 split the
 * bucket reads 1 whether the probe counts the missing target or the present one,
 * and a reversed anti-join would sail through. 2 ≠ 1 separates them.
 */
const DANGLING_TARGET_IDS = [930901, 930903];
/**
 * The first dangling target is referenced TWICE, from two different components,
 * so the count is over DISTINCT target ids: dropping the DISTINCT reads 3.
 */
const SECOND_SOURCE_COMPONENT = 'test71';
/**
 * The cross-tipo collision pair. `COLLISION_TIPO` resolves to matrix_test, the
 * same table as SOURCE_TIPO, and `COLLISION_ID` exists there under SOURCE_TIPO
 * but NOT under COLLISION_TIPO — so the reference is dangling only if the
 * anti-join keys on (section_tipo, section_id) rather than on the id alone.
 */
const COLLISION_TIPO = 'test2';
const COLLISION_ID = 930904;
/** A target section tipo with no dd_ontology node — the unverifiable case. */
const BOGUS_TIPO = 'zzdbinfo1';
const BOGUS_TARGET_ID = 930902;

const UNVERIFIABLE_LINE = `target section '${BOGUS_TIPO}' resolves to no matrix table — its references are unverifiable`;

interface IntegrityResult {
	store_rows: number;
	target_sections: number;
	dangling_targets_total: number;
	dangling_by_target_section: Record<string, number>;
	non_numeric_locators_by_table: Record<string, number>;
}

interface Report {
	result: IntegrityResult;
	msg: string;
	errors: string[];
}

async function runReport(): Promise<Report> {
	const action = widget.apiActions?.relation_integrity_report;
	if (action === undefined) {
		throw new Error('database_info widget exposes no relation_integrity_report action');
	}
	const response = (await action({}, ADMIN)) as unknown as Report;
	// The store-missing early return would land here with result === false; that
	// is a broken suite database, not a passing test.
	if (response.result === undefined || typeof response.result !== 'object') {
		throw new Error(`relation_integrity_report returned no result: ${JSON.stringify(response)}`);
	}
	return response;
}

/**
 * The non-numeric relation entries in matrix_test that do NOT belong to this
 * file — the report's own predicate, restricted to foreign rows. Read
 * immediately after a report run so it can be subtracted from it.
 */
async function foreignNonNumericInMatrixTest(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM matrix_test m, jsonb_each(m.relation) kv, jsonb_array_elements(kv.value) e
		 WHERE jsonb_typeof(m.relation) = 'object' AND jsonb_typeof(kv.value) = 'array'
		   AND (e->>'section_id' IS NULL OR e->>'section_id' !~ '^-?[0-9]+$')
		   AND NOT (m.section_tipo = $1 AND m.section_id = $2)`,
		[SOURCE_TIPO, SOURCE_ID] as unknown[],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

async function cleanScratch(): Promise<void> {
	for (const table of ['matrix_test', 'matrix_time_machine']) {
		for (const tipo of SCRATCH_TIPOS) {
			await sql.unsafe(
				`DELETE FROM "${table}" WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
				[tipo, ID_MIN, ID_MAX] as unknown[],
			);
		}
	}
}

/** Rows this file owns, across both ends plus the derived index. Must be zero. */
async function scratchResidue(): Promise<number> {
	let total = 0;
	for (const table of ['matrix_test', 'matrix_time_machine']) {
		for (const tipo of SCRATCH_TIPOS) {
			const rows = (await sql.unsafe(
				`SELECT count(*)::int AS count FROM "${table}"
				 WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
				[tipo, ID_MIN, ID_MAX] as unknown[],
			)) as { count: number }[];
			total += rows[0]?.count ?? 0;
		}
	}
	for (const tipo of SCRATCH_TIPOS) {
		const indexed = (await sql.unsafe(
			`SELECT count(*)::int AS count FROM matrix_relation_index
			 WHERE section_tipo = $1 AND section_id BETWEEN $2 AND $3`,
			[tipo, ID_MIN, ID_MAX] as unknown[],
		)) as { count: number }[];
		total += indexed[0]?.count ?? 0;
	}
	const foreignKeys = (await sql.unsafe(
		`SELECT count(*)::int AS count FROM matrix_relation_index
		 WHERE target_section_tipo = $1 OR target_section_tipo = $2`,
		[BOGUS_TIPO, TARGET_TIPO] as unknown[],
	)) as { count: number }[];
	return total + (foreignKeys[0]?.count ?? 0);
}

let before: Report;
let after: Report;
let foreignNonNumericBefore = 0;
let foreignNonNumericAfter = 0;

beforeAll(async () => {
	await cleanScratch();
	const residue = await scratchResidue();
	if (residue !== 0) {
		// Also fires if the corpus grew rsc170 references of its own — in which
		// case the dangling bucket is no longer this file's alone and the fixture
		// must be re-based, not silently weakened.
		throw new Error(`scratch surface not empty before seeding: ${residue} row(s)`);
	}
	// The live half of the dangling/live pair. A missing target section here is a
	// broken corpus: fail, never skip.
	const liveRows = (await sql.unsafe(
		`SELECT section_id FROM matrix WHERE section_tipo = $1 ORDER BY section_id LIMIT 1`,
		[TARGET_TIPO],
	)) as { section_id: number }[];
	const liveTargetId = liveRows[0]?.section_id;
	if (liveTargetId === undefined) {
		throw new Error(`no ${TARGET_TIPO} record in matrix — the live-target case has no fixture`);
	}
	// The cross-tipo collision fixture: a record that EXISTS in matrix_test under
	// `test3`, referenced below as `test2`/<same id>. Both tipos resolve to
	// matrix_test, so an anti-join that lost its `t.section_tipo = $1` half would
	// resolve the reference against the wrong section's record and lose the count.
	await sql.unsafe(`INSERT INTO matrix_test (section_id, section_tipo) VALUES ($1, $2)`, [
		COLLISION_ID,
		SOURCE_TIPO,
	] as unknown[]);

	// BASELINE — taken immediately before the write, in the same body.
	before = await runReport();
	foreignNonNumericBefore = await foreignNonNumericInMatrixTest();

	// The source record. Its four relation entries hit four different branches:
	// dangling / live / unverifiable / trigger-skipped.
	await sql.unsafe(
		`INSERT INTO matrix_test (section_id, section_tipo, relation) VALUES ($1, $2, $3::text::jsonb)`,
		[
			SOURCE_ID,
			SOURCE_TIPO,
			JSON.stringify({
				test52: [
					{ type: 'dd47', section_tipo: TARGET_TIPO, section_id: DANGLING_TARGET_IDS[0] },
					{ type: 'dd47', section_tipo: TARGET_TIPO, section_id: DANGLING_TARGET_IDS[1] },
					{ type: 'dd47', section_tipo: COLLISION_TIPO, section_id: COLLISION_ID },
					{ type: 'dd47', section_tipo: TARGET_TIPO, section_id: liveTargetId },
					{ type: 'dd47', section_tipo: BOGUS_TIPO, section_id: BOGUS_TARGET_ID },
					// section_id is not an integer → the sync trigger's
					// `~ '^-?[0-9]+$'` guard drops it; only the jsonb-side scan sees it.
					{ type: 'dd47', section_tipo: TARGET_TIPO, section_id: 'abc' },
				],
				// The same dangling target from a second component — the DISTINCT pin.
				[SECOND_SOURCE_COMPONENT]: [
					{ type: 'dd47', section_tipo: TARGET_TIPO, section_id: DANGLING_TARGET_IDS[0] },
				],
			}),
		] as unknown[],
	);

	// Pre-condition: the trigger really indexed the five numeric entries and
	// dropped the non-numeric one. Without this the cases below would measure an
	// empty seed and pass on nothing.
	const indexed = (await sql.unsafe(
		`SELECT target_section_tipo AS tipo, target_section_id AS id, from_component_tipo AS src
		 FROM matrix_relation_index WHERE section_tipo = $1 AND section_id = $2`,
		[SOURCE_TIPO, SOURCE_ID] as unknown[],
	)) as { tipo: string; id: number; src: string }[];
	const seen = indexed.map((row) => `${row.tipo}/${row.id}<-${row.src}`).sort();
	expect(seen).toEqual(
		[
			`${TARGET_TIPO}/${DANGLING_TARGET_IDS[0]}<-test52`,
			`${TARGET_TIPO}/${DANGLING_TARGET_IDS[1]}<-test52`,
			`${COLLISION_TIPO}/${COLLISION_ID}<-test52`,
			`${TARGET_TIPO}/${liveTargetId}<-test52`,
			`${TARGET_TIPO}/${DANGLING_TARGET_IDS[0]}<-${SECOND_SOURCE_COMPONENT}`,
			`${BOGUS_TIPO}/${BOGUS_TARGET_ID}<-test52`,
		].sort(),
	);

	after = await runReport();
	foreignNonNumericAfter = await foreignNonNumericInMatrixTest();
}, 300000);

afterAll(async () => {
	await cleanScratch();
	const residue = await scratchResidue();
	if (residue !== 0) {
		throw new Error(`scratch surface left ${residue} row(s) behind`);
	}
}, 120000);

test('a reference to a missing record is counted as dangling for its target section', () => {
	// The section was absent from the store before the seed (beforeAll asserts
	// zero index rows for it), so the bucket that appears is entirely this file's.
	expect(before.result.dangling_by_target_section[TARGET_TIPO]).toBeUndefined();
	expect(Object.hasOwn(after.result.dangling_by_target_section, TARGET_TIPO)).toBe(true);
	// Two distinct missing targets, referenced by three index rows: the count is
	// over DISTINCT target_section_id, so 2 — a dropped DISTINCT reads 3.
	expect(after.result.dangling_by_target_section[TARGET_TIPO]).toBe(2);
});

test('a reference to a live record is not counted, though it shares the target section', () => {
	// All four rsc170 references sit in one bucket; only the two missing targets
	// may be counted. Each wrong probe lands on a different number:
	//   1 → the anti-join was reversed (only the live target counted)
	//   3 → the target table stopped being consulted, or the DISTINCT was dropped
	expect(after.result.dangling_by_target_section[TARGET_TIPO]).not.toBe(1);
	expect(after.result.dangling_by_target_section[TARGET_TIPO]).not.toBe(3);
	expect(after.result.dangling_by_target_section[TARGET_TIPO]).toBe(2);
});

test('the dangling probe keys on (section_tipo, section_id), not on the id alone', () => {
	// test2/930904 is dangling ONLY because 930904 exists in matrix_test under
	// test3, not under test2. An anti-join that dropped its `t.section_tipo = $1`
	// half resolves it and the bucket never appears.
	const delta =
		(after.result.dangling_by_target_section[COLLISION_TIPO] ?? 0) -
		(before.result.dangling_by_target_section[COLLISION_TIPO] ?? 0);
	expect(delta).toBe(1);
	expect(Object.hasOwn(after.result.dangling_by_target_section, COLLISION_TIPO)).toBe(true);
});

test('the dangling total is exactly the sum of the reported per-section buckets', () => {
	// The total is a whole-database aggregate other agents move, so it is pinned
	// as an INVARIANT against the map rather than as a delta: a bucket that never
	// reached the total (or a total counting sections the map omits) reddens here.
	const sum = Object.values(after.result.dangling_by_target_section).reduce((a, b) => a + b, 0);
	expect(after.result.dangling_targets_total).toBe(sum);
	// Every reported bucket is positive — the `if (n > 0)` omission rule.
	for (const n of Object.values(after.result.dangling_by_target_section)) {
		expect(n).toBeGreaterThan(0);
	}
	expect(sum).toBeGreaterThanOrEqual(3);
});

test('a target section that resolves to no matrix table is reported unverifiable', () => {
	expect(before.errors).not.toContain(UNVERIFIABLE_LINE);
	expect(after.errors).toContain(UNVERIFIABLE_LINE);
	// Exactly ONE line for the tipo — the loop pushes once and `continue`s.
	expect(after.errors.filter((line) => line === UNVERIFIABLE_LINE)).toHaveLength(1);
	// …and it is never probed, so it can never appear as a dangling bucket.
	expect(Object.hasOwn(after.result.dangling_by_target_section, BOGUS_TIPO)).toBe(false);
	// Weak on its own (see the header: `errors` is never empty in
	// dedalo_mib_v7_test), but it is the envelope the panel reads.
	expect(after.msg).toBe('Warning. Request done with errors');
});

test('a non-numeric section_id is counted as a skipped locator for its source table', () => {
	// Attributed, not merely differenced: the foreign contribution is measured
	// immediately after each report run and subtracted.
	const mineBefore =
		(before.result.non_numeric_locators_by_table.matrix_test ?? 0) - foreignNonNumericBefore;
	const mineAfter =
		(after.result.non_numeric_locators_by_table.matrix_test ?? 0) - foreignNonNumericAfter;
	expect(mineBefore).toBe(0);
	expect(mineAfter).toBe(1);
	expect(Object.hasOwn(after.result.non_numeric_locators_by_table, 'matrix_test')).toBe(true);
	// `matrix` carries the corpus's real records and zero non-numeric locators,
	// so it pins the omission rule on this loop too.
	expect(Object.hasOwn(after.result.non_numeric_locators_by_table, 'matrix')).toBe(false);
});

test('the report keeps its wire shape and its aggregate keys', () => {
	expect(Object.keys(after.result).sort()).toEqual([
		'dangling_by_target_section',
		'dangling_targets_total',
		'non_numeric_locators_by_table',
		'store_rows',
		'target_sections',
	]);
	// store_rows / target_sections are whole-table aggregates every other agent
	// moves, so they are pinned as types and floors only, never as deltas.
	expect(typeof after.result.store_rows).toBe('number');
	expect(after.result.store_rows).toBeGreaterThan(0);
	expect(typeof after.result.target_sections).toBe('number');
	expect(after.result.target_sections).toBeGreaterThan(0);
	expect(Array.isArray(after.errors)).toBe(true);
});
