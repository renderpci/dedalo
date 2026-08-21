/**
 * The reconcile SWEEP itself — `reconcileObserverMirrors` end to end.
 *
 * Sibling file, different subject: `observer_reconcile_native.test.ts` gates
 * the value law (`recomputeExternalRelation`) and the pure budget predicate;
 * THIS file drives the SWEEP — discovery → candidate narrowing → the per-record
 * census fold → the apply/dry-run split — because the sweep is the offline door
 * that repairs mirrors the bulk writers (v6→v7 update, tool_propagate, portalize)
 * bypass. A regression here is silent by construction: the CLI prints a clean
 * summary and the operator concludes the corpus is healthy.
 *
 * The three laws that only an EXECUTED sweep can gate:
 *   1. the dry-run / apply split — `apply:false` must report the drift and
 *      write NOTHING; `apply:true` must write the exact mirror bag and count it
 *      as repaired; a third run must converge to `drifted === 0`;
 *   2. `--id` narrows by MEMBERSHIP (candidateIds) — an id that is neither a
 *      referenced target nor a stored mirror holder yields NO candidate. A
 *      regression there lets `--id N --apply` recompute and WRITE a record that
 *      was never in the tuple's candidate set;
 *   3. `--section` narrows the DISCOVERED tuple set (discoverTuples' last line,
 *      applied AFTER the relation-index fan-out — filtering earlier starved the
 *      union, the recorded tchi1 bug).
 * Plus the degraded-seed census FOLD driven by a REAL degraded sweep (a
 * fabricated summary literal proves only the predicate), and the unported
 * sub-law wholesale REFUSAL — the branch that exists so a wipe-armed node is
 * never reported as clean.
 *
 * Environment: suite DB. The anchor term comes from the shared fixture helper
 * (observer_term_seed.ts, a BUILT scratch situation); everything else is scratch —
 * referencer rows 91070/91071
 * and two `test9995x` dd_ontology observer nodes, all swept fail-loud in
 * afterAll. Nothing here asserts a table-global count.
 */
// BINDS INSTALL TLDs: on, rsc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import {
	exceedsShrinkBudget,
	type ReconcileRecord,
	reconcileObserverMirrors,
} from '../../src/core/section/record/observer_reconcile.ts';
import {
	ensureObserverTerm,
	INDEXER,
	MIRROR,
	REF_SECTION,
	SEED_TERM,
	TERM_SECTION,
} from '../helpers/observer_term_seed.ts';

/** Scratch referencer rows — this item's whole namespace. */
const REFERENCER_ID = 91070; // references the anchor through INDEXER (the bypass write)
const DEGRADED_HOLDER_ID = 91071; // holds one stale mirror entry for the scratch observer
/** Ids nothing references and nothing mirrors — the non-candidate probes. They
 * are never written to; if the membership filter regressed they would be. */
const NON_CANDIDATE_ID = 999_999_701;
const NON_CANDIDATE_TARGET = 999_999_702;

/** Scratch observer nodes (own band: the other observer gates use 9990x/9992x/9994x). */
const DEGRADED_OBSERVER = 'test99950';
const MISSING_PEER = 'test99959_no_such_node';
const SUBLAW_OBSERVER = 'test99951';
const SCRATCH_HOST = REF_SECTION;

/** Resolved once the fixture exists — the scratch sections own their table. */
let TERM_TABLE = 'matrix_test';
let REF_TABLE = 'matrix_test';
let seedHelperRan = false;
let anchorRows = -1;

/** Suite DB only for the ontology fixture: `test` is a REAL tld in production. */
const onSuiteDb = config.db.database.endsWith('_test');

/**
 * The fixture is ASSERTED, never skipped around. The old `skipUnlessPlanted`
 * existed because the anchor might be a REAL install term whose mirror an apply
 * sweep would rewrite; the anchor is now a scratch term this file builds
 * (test/helpers/observer_term_seed.ts), so there is nothing to protect and no
 * case may opt out. A missing fixture is a failure, not a skip.
 */
function requireFixture(): void {
	expect(seedHelperRan).toBe(true);
	expect(anchorRows).toBe(1);
}

function skipUnlessSuiteDb(caseName: string): boolean {
	expect(seedHelperRan).toBe(true);
	if (onSuiteDb) return false;
	console.warn(
		`observer_reconcile_sweep_native: NOT RUN — "${caseName}" (not the *_test suite DB: seeding a test999… ontology node would pollute a real ontology)`,
	);
	return true;
}

async function mirrorBag(): Promise<unknown[] | null> {
	const rows = (await sql.unsafe(
		`SELECT relation->($3::text) AS bag FROM "${TERM_TABLE}"
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SEED_TERM.section_tipo, SEED_TERM.section_id, MIRROR],
	)) as { bag: unknown[] | null }[];
	return rows[0]?.bag ?? null;
}

/** The bypass write the sweep exists to heal: a raw referencer INSERT (the
 * import/migration shape — the relation-index trigger still indexes it, so the
 * reconciler's candidate query sees it while the save cascade never fired). */
async function insertReferencer(id: number): Promise<void> {
	await sql.unsafe(
		`INSERT INTO "${REF_TABLE}" (section_id, section_tipo, relation) VALUES ($1, $3, $2::text::jsonb)`,
		[
			id,
			JSON.stringify({
				[INDEXER]: [
					{
						id: 1,
						type: 'dd96',
						section_id: String(SEED_TERM.section_id),
						section_tipo: SEED_TERM.section_tipo,
						from_component_tipo: INDEXER,
					},
				],
			}),
			REF_SECTION,
		],
	);
}

async function sweepScratchRows(): Promise<void> {
	for (const id of [REFERENCER_ID, DEGRADED_HOLDER_ID]) {
		await sql.unsafe(`DELETE FROM "${REF_TABLE}" WHERE section_tipo = $2 AND section_id = $1`, [
			id,
			REF_SECTION,
		]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = $2 AND section_id = $1`,
			[id, REF_SECTION],
		);
	}
}

async function sweepScratchOntology(): Promise<void> {
	await sql.unsafe(`DELETE FROM dd_ontology WHERE tld = 'test' AND tipo = ANY($1::text[])`, [
		`{${DEGRADED_OBSERVER},${SUBLAW_OBSERVER}}`,
	]);
	const { clearOntologyDerivedCaches } = await import(
		'../../src/core/ontology/cache_invalidation.ts'
	);
	await clearOntologyDerivedCaches();
}

async function seedScratchOntology(): Promise<void> {
	// The covered reconcile shape: use_observable_dato + set_dato_external, host
	// pinned by the observe entry's OWN scope (resolution step 1) so the tuple is
	// deterministic. `data_from_field` names a peer with no ontology node — the
	// measured degraded-seed shape (`peer_node_missing:…`).
	await sql.unsafe(
		`INSERT INTO dd_ontology (id, tipo, parent, model, tld, properties)
		 VALUES ((SELECT COALESCE(MAX(id), 0) + 1400 FROM dd_ontology), $1, 'test3', 'component_autocomplete_hi', 'test', $2::text::jsonb)`,
		[
			DEGRADED_OBSERVER,
			JSON.stringify({
				observe: [
					{
						component_tipo: INDEXER,
						section_tipo: SCRATCH_HOST,
						server: {
							config: { use_observable_dato: true },
							perform: { function: 'set_dato_external' },
						},
					},
				],
				source: {
					data_from_field: [MISSING_PEER],
					section_to_search: [SCRATCH_HOST],
					component_to_search: [INDEXER],
				},
			}),
		],
	);
	// Same covered shape, but its source carries an UNPORTED PHP sub-law: the
	// tuple must be surfaced and REFUSED wholesale, never swept.
	await sql.unsafe(
		`INSERT INTO dd_ontology (id, tipo, parent, model, tld, properties)
		 VALUES ((SELECT COALESCE(MAX(id), 0) + 1400 FROM dd_ontology), $1, 'test3', 'component_autocomplete_hi', 'test', $2::text::jsonb)`,
		[
			SUBLAW_OBSERVER,
			JSON.stringify({
				observe: [
					{
						component_tipo: INDEXER,
						section_tipo: SCRATCH_HOST,
						server: {
							config: { use_observable_dato: true },
							perform: { function: 'set_dato_external' },
						},
					},
				],
				source: {
					set_observed_data: true,
					section_to_search: [SCRATCH_HOST],
					component_to_search: [INDEXER],
				},
			}),
		],
	);
	const { clearOntologyDerivedCaches } = await import(
		'../../src/core/ontology/cache_invalidation.ts'
	);
	await clearOntologyDerivedCaches();
}

/**
 * The degraded observer's holder: one stale mirror entry pointing at a record
 * nothing references → the law wants to drop exactly 1, and the degraded seed
 * withholds exactly that drop. Seeded LATE (the refusal block's own beforeAll)
 * because the sweep block above spends the same scratch id as a referencer.
 */
async function seedDegradedHolder(): Promise<void> {
	await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = $1 AND section_id = $2`, [
		SCRATCH_HOST,
		DEGRADED_HOLDER_ID,
	]);
	await sql.unsafe(`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2`, [
		SCRATCH_HOST,
		DEGRADED_HOLDER_ID,
	]);
	// Idempotent: the holder id is reused across cases, and a bare INSERT trips
	// the (section_id, section_tipo) unique key on a re-plant.
	await sql.unsafe(`DELETE FROM "${REF_TABLE}" WHERE section_tipo = $1 AND section_id = $2`, [
		SCRATCH_HOST,
		DEGRADED_HOLDER_ID,
	]);
	await sql.unsafe(
		`INSERT INTO "${REF_TABLE}" (section_id, section_tipo, relation) VALUES ($1, $2, $3::text::jsonb)`,
		[
			DEGRADED_HOLDER_ID,
			SCRATCH_HOST,
			JSON.stringify({
				[DEGRADED_OBSERVER]: [
					{
						id: 1,
						type: 'dd151',
						section_id: String(NON_CANDIDATE_TARGET),
						section_tipo: SCRATCH_HOST,
						from_component_tipo: DEGRADED_OBSERVER,
					},
				],
			}),
		],
	);
}

beforeAll(async () => {
	await ensureObserverTerm();
	seedHelperRan = true;
	TERM_TABLE = (await getMatrixTableFromTipo(TERM_SECTION)) ?? 'matrix_test';
	REF_TABLE = (await getMatrixTableFromTipo(REF_SECTION)) ?? 'matrix_test';
	const anchor = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${TERM_TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SEED_TERM.section_tipo, SEED_TERM.section_id],
	)) as { n: number }[];
	anchorRows = anchor[0]?.n ?? 0;
	// Residue tolerance: a crashed observer-gate run leaves scratch referencers
	// of the anchor behind and they inflate every recompute. The section is this
	// fixture's own, so every such row is scratch by construction.
	await sweepScratchRows();
	await insertReferencer(REFERENCER_ID);
	if (onSuiteDb) {
		await sweepScratchOntology();
		await seedScratchOntology();
	}
});

afterAll(async () => {
	await sweepScratchRows();
	if (onSuiteDb) await sweepScratchOntology();
	// FAIL LOUD: a cleanup that did not reach zero is a corrupted shared DB for
	// every other gate, and it must not be discovered by them.
	const leftMatrix = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM "${REF_TABLE}" WHERE section_tipo = $2 AND section_id = ANY(string_to_array($1, ',')::int[])`,
		[`${REFERENCER_ID},${DEGRADED_HOLDER_ID}`, REF_SECTION],
	)) as { n: number }[];
	const leftTm = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM matrix_time_machine WHERE section_tipo = $2 AND section_id = ANY(string_to_array($1, ',')::int[])`,
		[`${REFERENCER_ID},${DEGRADED_HOLDER_ID}`, REF_SECTION],
	)) as { n: number }[];
	const leftOntology = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM dd_ontology WHERE tipo = ANY($1::text[])`,
		[`{${DEGRADED_OBSERVER},${SUBLAW_OBSERVER}}`],
	)) as { n: number }[];
	if (
		(leftMatrix[0]?.n ?? 0) !== 0 ||
		(leftTm[0]?.n ?? 0) !== 0 ||
		(leftOntology[0]?.n ?? 0) !== 0
	) {
		throw new Error(
			`observer_reconcile_sweep_native: scratch cleanup INCOMPLETE — matrix=${leftMatrix[0]?.n}, time_machine=${leftTm[0]?.n}, dd_ontology=${leftOntology[0]?.n}`,
		);
	}
});

describe('reconcileObserverMirrors — the dry-run / apply / converge life cycle', () => {
	test('apply:false REPORTS the drift and writes NOTHING', async () => {
		requireFixture();
		const records: ReconcileRecord[] = [];
		const lines: string[] = [];
		const summary = await reconcileObserverMirrors({
			onlyObserver: MIRROR,
			onlySection: SEED_TERM.section_tipo,
			onlyId: SEED_TERM.section_id,
			apply: false,
			onRecord: (record) => records.push(record),
			log: (line) => lines.push(line),
		});
		expect(summary.tuples).toBeGreaterThanOrEqual(1);
		expect(summary.candidates).toBe(1);
		expect(summary.drifted).toBe(1);
		expect(summary.repaired).toBe(0);
		// A pure GROW: nothing is dropped, so no census/budget channel moves.
		expect(summary.droppedRecords).toBe(0);
		expect(summary.droppedLocators).toBe(0);
		expect(summary.degradedSeedRecords).toBe(0);
		expect(summary.shrinksSkipped).toBe(0);
		expect(summary.bigResultRefused).toBe(0);
		expect(summary.sublawRefused).toBe(0);
		expect(records).toEqual([
			{
				observerTipo: MIRROR,
				hostSection: SEED_TERM.section_tipo,
				sectionId: SEED_TERM.section_id,
				before: 0,
				after: 1,
				dropped: 0,
				added: 1,
			},
		]);
		// The operator lines carry the per-record diff and the per-tuple tail, and
		// a dry run must not claim a repair.
		expect(lines.some((line) => line.includes('0 → 1 entrie(s)'))).toBe(true);
		expect(lines.some((line) => line.includes('1 candidate(s), 1 drifted'))).toBe(true);
		expect(lines.some((line) => line.includes('repaired'))).toBe(false);
		// THE ASSERTION THE DRY RUN EXISTS FOR: nothing was persisted.
		expect(await mirrorBag()).toBeNull();
	}, 30000);

	test('apply:true REPAIRS the record and writes the exact mirror bag', async () => {
		requireFixture();
		const lines: string[] = [];
		const summary = await reconcileObserverMirrors({
			onlyObserver: MIRROR,
			onlySection: SEED_TERM.section_tipo,
			onlyId: SEED_TERM.section_id,
			apply: true,
			log: (line) => lines.push(line),
		});
		expect(summary.candidates).toBe(1);
		expect(summary.drifted).toBe(1);
		expect(summary.repaired).toBe(1);
		expect(summary.shrinksSkipped).toBe(0);
		expect(summary.bigResultRefused).toBe(0);
		expect(lines.some((line) => line.includes('[repaired]'))).toBe(true);
		// The byte shape stored — id/type/section_id/section_tipo/
		// from_component_tipo, in that content. WC-2026-08-10-section-id-int-canonical:
		// the address is an INT now (the PHP oracle's string form is repealed).
		expect(await mirrorBag()).toEqual([
			{
				id: 1,
				type: 'dd151',
				section_id: REFERENCER_ID,
				section_tipo: REF_SECTION,
				from_component_tipo: MIRROR,
			},
		]);
	}, 30000);

	test('a third run CONVERGES: drifted 0, repaired 0, the bag untouched', async () => {
		requireFixture();
		const bagBefore = await mirrorBag();
		const records: ReconcileRecord[] = [];
		const summary = await reconcileObserverMirrors({
			onlyObserver: MIRROR,
			onlySection: SEED_TERM.section_tipo,
			onlyId: SEED_TERM.section_id,
			apply: true,
			onRecord: (record) => records.push(record),
		});
		// The candidate is still found (this is convergence, not a lost candidate).
		expect(summary.candidates).toBe(1);
		expect(summary.drifted).toBe(0);
		expect(summary.repaired).toBe(0);
		expect(records).toEqual([]);
		expect(await mirrorBag()).toEqual(bagBefore);
	}, 30000);

	test('a MASKED SWAP is reported by MEMBERSHIP and both halves are applied', async () => {
		requireFixture();
		// One referencer bypass-deleted, one bypass-inserted: the law drops exactly
		// one entry and appends exactly one, so before === after and a census that
		// read `before - after` would report ZERO drops — the corpus drop budget
		// would then sail past the exact shape it exists to catch.
		await sql.unsafe(`DELETE FROM "${REF_TABLE}" WHERE section_tipo = $2 AND section_id = $1`, [
			REFERENCER_ID,
			REF_SECTION,
		]);
		await insertReferencer(DEGRADED_HOLDER_ID);
		const records: ReconcileRecord[] = [];
		const dry = await reconcileObserverMirrors({
			onlyObserver: MIRROR,
			onlySection: SEED_TERM.section_tipo,
			onlyId: SEED_TERM.section_id,
			onRecord: (record) => records.push(record),
		});
		expect(dry.drifted).toBe(1);
		expect(records).toEqual([
			{
				observerTipo: MIRROR,
				hostSection: SEED_TERM.section_tipo,
				sectionId: SEED_TERM.section_id,
				before: 1,
				after: 1, // ← length delta 0; membership says 1 out, 1 in
				dropped: 1,
				added: 1,
			},
		]);
		expect(dry.droppedRecords).toBe(1);
		expect(dry.droppedLocators).toBe(1);
		// The seed is clean, so nothing withholds the drop…
		expect(dry.degradedSeedRecords).toBe(0);
		expect(dry.shrinksSkipped).toBe(0);
		// …and the reported volume busts a zero budget on both axes.
		expect(exceedsShrinkBudget(dry, { maxDroppedLocators: 0, maxDroppedRecords: 0 })).toHaveLength(
			2,
		);
		const applied = await reconcileObserverMirrors({
			onlyObserver: MIRROR,
			onlySection: SEED_TERM.section_tipo,
			onlyId: SEED_TERM.section_id,
			apply: true,
		});
		expect(applied.repaired).toBe(1);
		expect(applied.shrinksSkipped).toBe(0);
		// BOTH halves committed in one write: the stale entry is gone, the new one
		// carries the next item id.
		expect(await mirrorBag()).toEqual([
			{
				id: 2,
				type: 'dd151',
				// WC-2026-08-10-section-id-int-canonical: int address.
				section_id: DEGRADED_HOLDER_ID,
				section_tipo: REF_SECTION,
				from_component_tipo: MIRROR,
			},
		]);
	}, 30000);
});

describe('reconcileObserverMirrors — candidate + tuple narrowing', () => {
	test('--id narrows by MEMBERSHIP: a non-candidate id yields no candidate at all', async () => {
		requireFixture();
		// NON_CANDIDATE_ID holds no mirror and is referenced by nothing, so it is
		// NOT in the tuple's candidate union. An --id that trusted its argument
		// would recompute it — and under --apply WRITE a record outside the set.
		const records: ReconcileRecord[] = [];
		const miss = await reconcileObserverMirrors({
			onlyObserver: MIRROR,
			onlySection: SEED_TERM.section_tipo,
			onlyId: NON_CANDIDATE_ID,
			apply: true,
			onRecord: (record) => records.push(record),
		});
		expect(miss.tuples).toBeGreaterThanOrEqual(1); // the tuple IS discovered — not a vacuous pass
		expect(miss.candidates).toBe(0);
		expect(miss.drifted).toBe(0);
		expect(miss.repaired).toBe(0);
		expect(records).toEqual([]);
		// …and no row was conjured for it.
		const conjured = (await sql.unsafe(
			'SELECT count(*)::int AS n FROM matrix_hierarchy WHERE section_tipo = $1 AND section_id = $2',
			[SEED_TERM.section_tipo, NON_CANDIDATE_ID],
		)) as { n: number }[];
		expect(conjured[0]?.n).toBe(0);
		// Positive control on the SAME tuple: the anchor is a member (through both
		// halves of the union by now — referenced target and mirror holder).
		const hit = await reconcileObserverMirrors({
			onlyObserver: MIRROR,
			onlySection: SEED_TERM.section_tipo,
			onlyId: SEED_TERM.section_id,
		});
		expect(hit.candidates).toBe(1);
	}, 30000);

	test('--section narrows the DISCOVERED tuple set (filtered after the index fan-out)', async () => {
		requireFixture();
		// Every call passes a non-candidate --id: this case is about DISCOVERY and
		// must not cost a corpus-wide recompute.
		const unfiltered = await reconcileObserverMirrors({
			onlyObserver: MIRROR,
			onlyId: NON_CANDIDATE_ID,
		});
		// MIRROR is declared on the term section and the relation-index fan-out
		// adds every section INDEXER actually points into.
		expect(unfiltered.tuples).toBeGreaterThan(1);
		const oneHost = await reconcileObserverMirrors({
			onlyObserver: MIRROR,
			onlySection: SEED_TERM.section_tipo,
			onlyId: NON_CANDIDATE_ID,
		});
		expect(oneHost.tuples).toBe(1);
		// A section no tuple hosts at yields none: an operator's scope is a scope,
		// not a hint (a pass-through filter would hand back the whole union).
		const elsewhere = await reconcileObserverMirrors({
			onlyObserver: MIRROR,
			onlySection: 'zzz-no-such-section',
			onlyId: NON_CANDIDATE_ID,
		});
		expect(elsewhere.tuples).toBe(0);
		expect(elsewhere.candidates).toBe(0);
	}, 30000);
});

describe('reconcileObserverMirrors — the refusal census (scratch ontology fixture)', () => {
	beforeAll(async () => {
		if (onSuiteDb) await seedDegradedHolder();
	});

	test('a REAL degraded seed feeds the degradedSeedRecords fold the budget reads', async () => {
		if (skipUnlessSuiteDb('a REAL degraded seed feeds the degradedSeedRecords fold')) return;
		const records: ReconcileRecord[] = [];
		const lines: string[] = [];
		const summary = await reconcileObserverMirrors({
			onlyObserver: DEGRADED_OBSERVER,
			onlySection: SCRATCH_HOST,
			onlyId: DEGRADED_HOLDER_ID,
			onRecord: (record) => records.push(record),
			log: (line) => lines.push(line),
		});
		expect(summary.tuples).toBe(1);
		expect(summary.candidates).toBe(1);
		expect(summary.drifted).toBe(1);
		// THE FOLD, produced by an EXECUTED sweep rather than a hand-built literal:
		// the withheld record is counted as degraded AND as a wanted drop.
		expect(summary.degradedSeedRecords).toBe(1);
		expect(summary.shrinksSkipped).toBe(1);
		expect(summary.droppedRecords).toBe(1);
		expect(summary.droppedLocators).toBe(1);
		expect(summary.repaired).toBe(0);
		expect(summary.bigResultRefused).toBe(0);
		expect(summary.sublawRefused).toBe(0);
		// The census channel names the CAUSE (a drop budget adjudicated by one
		// total cannot tell a genuine removal from a broken ontology).
		expect(records).toEqual([
			{
				observerTipo: DEGRADED_OBSERVER,
				hostSection: SCRATCH_HOST,
				sectionId: DEGRADED_HOLDER_ID,
				before: 1,
				after: 0,
				dropped: 1,
				added: 0,
				seedDefects: [`peer_node_missing:${MISSING_PEER}`],
				refusal: 'degraded_seed',
			},
		]);
		expect(lines.some((line) => line.includes('SHRINK held — DEGRADED SEED'))).toBe(true);
		// …and the number this sweep produced is the one the budget refuses,
		// however generous the ceilings.
		expect(
			exceedsShrinkBudget(summary, {
				maxDroppedLocators: 1_000_000,
				maxDroppedRecords: 1_000_000,
			}),
		).toHaveLength(1);
		// Withheld ⇒ still stored (and this was a dry run besides).
		const rows = (await sql.unsafe(
			`SELECT relation->($3::text) AS bag FROM "${REF_TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
			[SCRATCH_HOST, DEGRADED_HOLDER_ID, DEGRADED_OBSERVER],
		)) as { bag: unknown[] | null }[];
		expect(rows[0]?.bag).toHaveLength(1);
	}, 30000);

	test('an APPLY over a degraded seed still withholds the drop and repairs NOTHING', async () => {
		if (skipUnlessSuiteDb('an APPLY over a degraded seed still withholds the drop')) return;
		// The withholding is the KERNEL's, not the dry run's: apply mode must reach
		// the same refusal, count it, and leave the stored entry alone. A mutant
		// that counts a withheld record as repaired dies here.
		const summary = await reconcileObserverMirrors({
			onlyObserver: DEGRADED_OBSERVER,
			onlySection: SCRATCH_HOST,
			onlyId: DEGRADED_HOLDER_ID,
			apply: true,
		});
		expect(summary.drifted).toBe(1);
		expect(summary.shrinksSkipped).toBe(1);
		expect(summary.degradedSeedRecords).toBe(1);
		expect(summary.repaired).toBe(0);
		const rows = (await sql.unsafe(
			`SELECT relation->($3::text) AS bag FROM "${REF_TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
			[SCRATCH_HOST, DEGRADED_HOLDER_ID, DEGRADED_OBSERVER],
		)) as { bag: unknown[] | null }[];
		expect(rows[0]?.bag).toEqual([
			{
				id: 1,
				type: 'dd151',
				section_id: String(NON_CANDIDATE_TARGET),
				section_tipo: SCRATCH_HOST,
				from_component_tipo: DEGRADED_OBSERVER,
			},
		]);
	}, 30000);

	test('an UNPORTED sub-law tuple is REFUSED wholesale — never swept, never reported clean', async () => {
		if (skipUnlessSuiteDb('an UNPORTED sub-law tuple is REFUSED wholesale')) return;
		const records: ReconcileRecord[] = [];
		const lines: string[] = [];
		const summary = await reconcileObserverMirrors({
			onlyObserver: SUBLAW_OBSERVER,
			onlySection: SCRATCH_HOST,
			apply: true,
			onRecord: (record) => records.push(record),
			log: (line) => lines.push(line),
		});
		expect(summary.tuples).toBe(1); // surfaced…
		expect(summary.sublawRefused).toBe(1); // …and refused
		// Not swept at all: no candidate query, no recompute, no "0 drifted" that
		// an operator would read as clean.
		expect(summary.candidates).toBe(0);
		expect(summary.drifted).toBe(0);
		expect(summary.repaired).toBe(0);
		expect(records).toEqual([]);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('REFUSED');
		expect(lines[0]).toContain('set_observed_data');
	}, 30000);
});
