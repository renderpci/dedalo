/**
 * Observer mirror RECONCILE law — TS-native gate for the exported
 * recomputeExternalRelation (the one law both the live save cascade and
 * scripts/observer_reconcile.ts replay).
 *
 * Scenario pinned = the reported production drift (dc1 §2, 2026-07-24): a
 * referencing record written WITHOUT the save chokepoint (raw INSERT — the
 * bulk-import/migration shape; the matrix_relation_index trigger still
 * indexes it) leaves the term's hierarchy93 mirror missing. The gate drives
 * the reconcile law through its full life cycle:
 *   dry-run detects the drift without writing → repair writes the exact
 *   mirror byte-shape + the TM audit pair → second run is a no-op
 *   (idempotent) → a masked swap (one referencer bypass-deleted, another
 *   bypass-inserted) proves the adjudication is MEMBERSHIP-based, not
 *   length-based, and that BOTH halves now persist → a pure bypass DELETE
 *   makes the recompute a shrink, and THE SHRINK APPLIES → duplicating the
 *   term proves covered-observer mirror slots are STRIPPED at copy (empty by
 *   construction — never the source's byte-copied referencer bag).
 *
 * 2026-08-06: the blanket GROW-ONLY fail-safe and its `allowShrink` opt-in are
 * RETIRED (see observer_failsafe_native.test.ts's header for why). The two
 * shrink tests here used to assert that a legitimate removal was WITHHELD;
 * they now assert it is applied, which is the regression guard for the
 * reported numisdata36 equivalence bug. The only remaining withholder is a
 * DEGRADED SEED, gated in the failsafe file.
 *
 * Environment: suite DB — the on1 anchor + section node come from the shared
 * seed helper (observer_term_seed.ts); referencers are scratch matrix rows
 * swept in afterAll, and crashed-run residue referencers are swept in
 * beforeAll (planted ⇒ suite DB ⇒ scratch by construction).
 */
// BINDS INSTALL TLDs: on, rsc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { getCounters } from '../../src/core/api/counters.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { recomputeExternalRelation } from '../../src/core/section/record/observers.ts';
import {
	SEED_TERM,
	seedTermChainIfAbsent,
	sweepSeedTermReferencerResidue,
	sweepTermChain,
	type TermSeedHandle,
} from '../helpers/observer_term_seed.ts';

const REFERENCER_ID = 91070; // scratch rsc205 rows, clear of every other band
const REFERENCER_ID2 = 91071;

let termSeed: TermSeedHandle = { seededChain: false, seededSectionNode: false };
/**
 * The whole suite runs ONLY when the seed was actually planted (suite DB).
 * On a restored live snapshot on1/58 is a REAL record — writing a recompute
 * there would silently drop legacy mirror entries (the exact --allow-shrink
 * ambiguity) with no restore. Tests early-return loudly instead.
 */
let planted = false;

/**
 * The early return of a behavioural case, made AUDIBLE (2026-08-08). A silently
 * returning test reads as a passing test: this file measured 0% coverage of the
 * reconcile kernel while showing green, and the wholesale skip was half the
 * reason. Every skipped case now names ITSELF on stderr, so a CI log makes the
 * difference between "8 gates ran" and "8 gates declined to run" visible.
 * The skip itself is NOT weakened — on a restored live snapshot on1/58 is a
 * real record and a repair write there is unrecoverable.
 */
function skipUnlessPlanted(caseName: string): boolean {
	if (planted) return false;
	console.warn(
		`observer_reconcile_native: NOT RUN — "${caseName}" (on1/58 pre-exists: live-snapshot DB, a repair write would mutate a real mirror)`,
	);
	return true;
}

async function mirrorBag(): Promise<unknown[] | null> {
	const rows = (await sql.unsafe(
		`SELECT relation->'hierarchy93' AS bag FROM matrix_hierarchy
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SEED_TERM.section_tipo, SEED_TERM.section_id],
	)) as { bag: unknown[] | null }[];
	return rows[0]?.bag ?? null;
}

async function sweepScratch(): Promise<void> {
	for (const id of [REFERENCER_ID, REFERENCER_ID2]) {
		await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = $1`, [id]);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'rsc205' AND section_id = $1`,
			[id],
		);
	}
}

/** The bypass write: a raw referencer INSERT (import/migration shape). */
async function insertReferencer(id: number): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix (section_id, section_tipo, relation) VALUES ($1, 'rsc205', $2::text::jsonb)`,
		[
			id,
			JSON.stringify({
				rsc387: [
					{
						id: 1,
						type: 'dd96',
						section_id: String(SEED_TERM.section_id),
						section_tipo: SEED_TERM.section_tipo,
						from_component_tipo: 'rsc387',
					},
				],
			}),
		],
	);
}

/** The exact mirror entry shape the law appends (PHP-oracle byte shape). */
// WC-2026-08-10-section-id-int-canonical: the mirror writer mints the
// referencer address as an INT (canonicalizeStoredSectionId), so every
// recomputed bag asserted below carries ints.
function mirrorEntry(itemId: number, referencerId: number): Record<string, unknown> {
	return {
		id: itemId,
		type: 'dd151',
		section_id: referencerId,
		section_tipo: 'rsc205',
		from_component_tipo: 'hierarchy93',
	};
}

beforeAll(async () => {
	termSeed = await seedTermChainIfAbsent();
	planted = termSeed.seededChain;
	if (!planted) {
		console.warn(
			'observer_reconcile_native: on1/58 pre-exists (live-snapshot DB) — suite SKIPPED, a repair write would mutate a real mirror',
		);
		return;
	}
	// Residue tolerance (review 2026-08-02): crashed observer-gate runs leave
	// scratch rsc205 referencers of on1/58 behind, inflating every recompute
	// on the next run (the observed first-run flake). planted ⇒ suite DB ⇒
	// they are scratch by construction.
	await sweepSeedTermReferencerResidue();
	await sweepScratch();
	// Bypass write: indexed by the matrix_relation_index trigger, invisible to
	// the cascade.
	await insertReferencer(REFERENCER_ID);
});

afterAll(async () => {
	if (!planted) return;
	await sweepScratch();
	await sweepTermChain(termSeed);
});

describe('observer mirror reconcile law (recomputeExternalRelation)', () => {
	test('dry-run detects the bypass drift WITHOUT writing', async () => {
		if (skipUnlessPlanted('dry-run detects the bypass drift WITHOUT writing')) return;
		const diff = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{ write: false },
		);
		expect(diff.changed).toBe(true);
		expect(diff.before).toBe(0);
		expect(diff.after).toBe(1);
		expect(await mirrorBag()).toBeNull(); // nothing persisted
	});

	test('repair writes the exact mirror shape + the TM audit pair, then converges', async () => {
		if (
			skipUnlessPlanted('repair writes the exact mirror shape + the TM audit pair, then converges')
		)
			return;
		const tmCountBefore = async (): Promise<number> => {
			const rows = (await sql.unsafe(
				`SELECT count(*)::int AS n FROM matrix_time_machine
				 WHERE section_tipo = $1 AND section_id = $2 AND tipo = 'hierarchy93'`,
				[SEED_TERM.section_tipo, SEED_TERM.section_id],
			)) as { n: number }[];
			return rows[0]?.n ?? 0;
		};
		const tmBefore = await tmCountBefore();
		const outcome = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{}, // grow — no shrink intent needed
		);
		expect(outcome.changed).toBe(true);
		expect(await mirrorBag()).toEqual([mirrorEntry(1, REFERENCER_ID)]);
		// The repair row, plus the history backfill when the slot had none
		// (leftover TM rows from prior runs make this a DELTA assertion).
		const tmDelta = (await tmCountBefore()) - tmBefore;
		expect(tmDelta === 1 || tmDelta === 2).toBe(true);

		// Idempotent: truth already mirrored → no further change, no TM noise.
		const again = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{},
		);
		expect(again.changed).toBe(false);
	});

	test('a MASKED SWAP (1 stale drop + 1 new add) applies BOTH halves — membership, not length', async () => {
		if (skipUnlessPlanted('a MASKED SWAP (1 stale drop + 1 new add) applies BOTH halves')) return;
		// Bypass-delete referencer 1 (its mirror entry goes stale) and
		// bypass-insert referencer 2: the law wants to drop one entry and add
		// one — EQUAL length before/after. The adjudication is MEMBERSHIP-based
		// (the historic length-only guard could not even see this), and since
		// 2026-08-06 the full law persists: BOTH halves land in one write.
		await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = $1`, [
			REFERENCER_ID,
		]);
		await insertReferencer(REFERENCER_ID2);
		const refusedBefore = getCounters().observers_shrink_refused ?? 0;
		const outcome = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{},
		);
		expect(outcome.changed).toBe(true);
		// No refusal: the seed was clean, so nothing withholds the drop.
		expect(outcome.skippedShrink).toBeUndefined();
		expect(outcome.seedDefects).toBeUndefined();
		expect((getCounters().observers_shrink_refused ?? 0) - refusedBefore).toBe(0);
		// The stale entry is GONE and the survivor keeps its stored id.
		expect(await mirrorBag()).toEqual([mirrorEntry(2, REFERENCER_ID2)]);
		// Idempotent: a second pass finds no drift.
		const again = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{},
		);
		expect(again.changed).toBe(false);
	});

	test('a bypass DELETE makes the recompute a pure shrink, and the shrink APPLIES', async () => {
		if (
			skipUnlessPlanted('a bypass DELETE makes the recompute a pure shrink, and the shrink APPLIES')
		)
			return;
		// THE REGRESSION GUARD for the reported bug. Until 2026-08-06 a pure
		// shrink was withheld unconditionally, so an unlinked reference stayed
		// mirrored forever and only an operator flag could clear it.
		await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = $1`, [
			REFERENCER_ID2,
		]);
		const diff = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{ write: false },
		);
		expect(diff.changed).toBe(true);
		expect(diff.before).toBe(1);
		expect(diff.after).toBe(0);
		// A clean seed means the dry run promises a real write, not a refusal.
		expect(diff.skippedShrink).toBeUndefined();

		const applied = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{},
		);
		expect(applied.changed).toBe(true);
		expect(applied.wrote).toBe(true);
		expect(applied.skippedShrink).toBeUndefined();
		expect(await mirrorBag()).toEqual([]);
	});

	test('the census reports drop volume and the budget predicate adjudicates it', async () => {
		// PURE — no DB. The budget turns "we eyeballed a dry run once" into a
		// re-runnable pre-deploy check: a future value-law change that would
		// mass-delete must fail HERE, not at the next save.
		const { exceedsShrinkBudget } = await import(
			'../../src/core/section/record/observer_reconcile.ts'
		);
		const base = {
			tuples: 1,
			candidates: 10,
			drifted: 3,
			repaired: 0,
			shrinksSkipped: 0,
			sublawRefused: 0,
			bigResultRefused: 0,
			droppedRecords: 3,
			droppedLocators: 1673,
			degradedSeedRecords: 0,
		};
		expect(exceedsShrinkBudget(base, { maxDroppedLocators: 2000, maxDroppedRecords: 40 })).toEqual(
			[],
		);
		expect(
			exceedsShrinkBudget(base, { maxDroppedLocators: 100, maxDroppedRecords: 40 }).length,
		).toBe(1);
		expect(
			exceedsShrinkBudget(base, { maxDroppedLocators: 2000, maxDroppedRecords: 2 }).length,
		).toBe(1);
		// A degraded seed is NEVER within budget — the ontology is broken in a way
		// that makes the value law unanswerable for that record.
		const degraded = { ...base, degradedSeedRecords: 1 };
		expect(
			exceedsShrinkBudget(degraded, { maxDroppedLocators: 2000, maxDroppedRecords: 40 }),
		).toHaveLength(1);
	});

	test('the drop census counts MEMBERSHIP, never a length delta (executed sweep)', async () => {
		if (skipUnlessPlanted('the drop census counts MEMBERSHIP, never a length delta')) return;
		// A regression that drops N genuine locators and appends N wrong ones has
		// an equal length. `before - after` reports 0 and sails through the
		// budget — which is the exact shape the budget exists to catch. The
		// kernel adjudicates membership (that is why a masked swap commits both
		// halves), so the census must read the kernel's own numbers.
		//
		// 2026-08-08: this used to be a SOURCE GREP for `outcome.dropped ??` —
		// it executed none of the census fold and would have stayed green against
		// a reconciler that returned an empty summary. It now DRIVES the sweep
		// over a planted masked swap and asserts the reported numbers.
		const { reconcileObserverMirrors } = await import(
			'../../src/core/section/record/observer_reconcile.ts'
		);
		const recompute = async (): Promise<void> => {
			await recomputeExternalRelation(
				'hierarchy93',
				SEED_TERM.section_tipo,
				SEED_TERM.section_id,
				-1,
				new Date(),
				{},
			);
		};
		try {
			// Rebuild a known one-entry mirror from scratch (the preceding tests
			// leave their own state; this case must not inherit it).
			await sweepScratch();
			await recompute();
			await insertReferencer(REFERENCER_ID);
			await recompute();
			expect((await mirrorBag())?.length).toBe(1);
			// THE MASKED SWAP: one referencer bypass-deleted, one bypass-inserted,
			// so the law drops exactly one entry and appends exactly one — before
			// === after, and a length-delta census would report ZERO drops.
			await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = $1`, [
				REFERENCER_ID,
			]);
			await insertReferencer(REFERENCER_ID2);

			const records: unknown[] = [];
			const summary = await reconcileObserverMirrors({
				// dry run (the default): the census must be readable WITHOUT writing.
				onlyObserver: 'hierarchy93',
				onlySection: SEED_TERM.section_tipo,
				onlyId: SEED_TERM.section_id,
				onRecord: (record) => records.push(record),
			});
			expect(summary.drifted).toBe(1);
			expect(records).toEqual([
				{
					observerTipo: 'hierarchy93',
					hostSection: SEED_TERM.section_tipo,
					sectionId: SEED_TERM.section_id,
					before: 1,
					after: 1, // ← the length delta is 0; membership says 1 out, 1 in
					dropped: 1,
					added: 1,
				},
			]);
			// The summary fold reads the same membership numbers, so the budget sees
			// the swap it exists to catch.
			expect(summary.droppedRecords).toBe(1);
			expect(summary.droppedLocators).toBe(1);
			// A dry run persisted nothing: the stale entry is still stored.
			expect(await mirrorBag()).toEqual([mirrorEntry(1, REFERENCER_ID)]);
			// …and the drop volume it reported busts a budget of zero — the
			// predicate and the census are wired to the same numbers.
			const { exceedsShrinkBudget } = await import(
				'../../src/core/section/record/observer_reconcile.ts'
			);
			expect(
				exceedsShrinkBudget(summary, { maxDroppedLocators: 0, maxDroppedRecords: 0 }),
			).toHaveLength(2);
		} finally {
			// Hand the next test the state the pure-shrink test left: no
			// referencers, empty mirror. In `finally` on purpose — this case plants
			// its own fixture, and a FAILING assertion must not cascade into a
			// duplicate-key crash in the duplicate-record gate below.
			await sweepScratch();
			await recompute();
		}
		expect(await mirrorBag()).toEqual([]);
	}, 30000);

	test('the committed shrink budget parses and the predicate ADJUDICATES with it', async () => {
		// The budget is a committed artefact the CLI reads at runtime; a typo or
		// a missing key would surface as a crash during an ops sweep, which is
		// the worst moment to find out. Executed, not grepped: the parsed values
		// are fed to the real predicate at both sides of their own boundary, so a
		// string-typed or absent ceiling fails here instead of at 3am.
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const root = join(import.meta.dir, '..', '..');
		const budget = JSON.parse(
			readFileSync(join(root, 'engineering/observer_shrink_budget.json'), 'utf-8'),
		) as Record<string, unknown>;
		expect(typeof budget.maxDroppedLocators).toBe('number');
		expect(typeof budget.maxDroppedRecords).toBe('number');
		// It must carry its own provenance — a bare number nobody can re-derive
		// is a number nobody dares change.
		expect(String(budget._ ?? '').length).toBeGreaterThan(120);

		const { exceedsShrinkBudget } = await import(
			'../../src/core/section/record/observer_reconcile.ts'
		);
		const limits = budget as unknown as {
			maxDroppedLocators: number;
			maxDroppedRecords: number;
		};
		const base: Parameters<typeof exceedsShrinkBudget>[0] = {
			tuples: 1,
			candidates: 1,
			drifted: 1,
			repaired: 0,
			shrinksSkipped: 0,
			sublawRefused: 0,
			bigResultRefused: 0,
			droppedRecords: limits.maxDroppedRecords,
			droppedLocators: limits.maxDroppedLocators,
			degradedSeedRecords: 0,
		};
		// Exactly AT the committed ceiling is within budget…
		expect(exceedsShrinkBudget(base, limits)).toEqual([]);
		// …one locator / one record over it is not.
		expect(
			exceedsShrinkBudget({ ...base, droppedLocators: limits.maxDroppedLocators + 1 }, limits),
		).toHaveLength(1);
		expect(
			exceedsShrinkBudget({ ...base, droppedRecords: limits.maxDroppedRecords + 1 }, limits),
		).toHaveLength(1);
	});

	test('SOURCE-SHAPE GUARD (executes nothing): the CLI consults the budget file', () => {
		// HONEST LABEL (2026-08-08). This is a TEXT SCAN of scripts/
		// observer_reconcile.ts, not a behaviour gate. It proves only that the
		// three tokens appear in the file; it proves NOTHING about whether the
		// CLI actually reads the budget, adjudicates it, or exits non-zero.
		// It cannot be executed here because the script is a top-level CLI (it
		// runs the whole sweep and calls process.exit on import). Replacing it
		// with a real gate needs a production seam — extracting the argv parse +
		// budget adjudication into an importable `runReconcileCli(argv)` — which
		// is a production change, out of scope for this repair. Scheduled as
		// such; until then, this guard is a typo tripwire and nothing more.
		const root = join(import.meta.dir, '..', '..');
		const cli = readFileSync(join(root, 'scripts/observer_reconcile.ts'), 'utf-8');
		expect(cli).toContain('observer_shrink_budget.json');
		expect(cli).toContain('exceedsShrinkBudget');
		expect(cli).toContain('process.exit(1)');
	});

	test('duplicate STRIPS the covered-observer mirror slot from the copy (empty by construction)', async () => {
		if (skipUnlessPlanted('duplicate STRIPS the covered-observer mirror slot from the copy'))
			return;
		// Re-grow the term's mirror so there is a non-empty bag to (not) copy —
		// the pre-fix byte-copy would have handed it to the duplicate wholesale
		// (for unported-sub-law nodes: ~1,000 phantom locators with no repair
		// path — review 2026-08-02).
		await insertReferencer(REFERENCER_ID2);
		await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{},
		);
		expect((await mirrorBag())?.length).toBe(1);
		const counterExisted =
			(
				(await sql.unsafe('SELECT 1 FROM matrix_counter WHERE tipo = $1', [
					SEED_TERM.section_tipo,
				])) as unknown[]
			).length > 0;
		const { duplicateSectionRecord } = await import(
			'../../src/core/section/record/duplicate_record.ts'
		);
		let copyId = 0;
		try {
			copyId = await duplicateSectionRecord(SEED_TERM.section_tipo, SEED_TERM.section_id, -1);
			const rows = (await sql.unsafe(
				`SELECT (relation ? 'hierarchy93') AS has_mirror FROM matrix_hierarchy
				 WHERE section_tipo = $1 AND section_id = $2`,
				[SEED_TERM.section_tipo, copyId],
			)) as { has_mirror: boolean }[];
			expect(rows.length).toBe(1);
			expect(rows[0]?.has_mirror).toBe(false); // the mirror slot was STRIPPED
			// the SOURCE's own bag is untouched by the duplication
			expect((await mirrorBag())?.length).toBe(1);
		} finally {
			if (copyId !== 0) {
				await sql.unsafe(
					'DELETE FROM matrix_hierarchy WHERE section_tipo = $1 AND section_id = $2',
					[SEED_TERM.section_tipo, copyId],
				);
				await sql.unsafe(
					'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
					[SEED_TERM.section_tipo, copyId],
				);
			}
			// the counter-allocating insert creates the section counter row when
			// absent — leave the DB as found (referencer 2 + the regrown mirror
			// are swept by afterAll).
			if (!counterExisted) {
				await sql.unsafe('DELETE FROM matrix_counter WHERE tipo = $1', [SEED_TERM.section_tipo]);
			}
		}
	}, 30000);
});

/**
 * THE SWEEP'S OWN NARROWING + CENSUS FOLD (2026-08-08 mutation-repair pass).
 *
 * The gates above drive the reconciler only through ONE fully-specified
 * (--observer + --section + --id) call, so three of its own laws were never
 * entered and survived mutation:
 *   1. `--section` narrowing (discoverTuples' LAST line — the filter whose
 *      comment records the tchi1 starvation bug from filtering too early);
 *   2. `--id` MEMBERSHIP (candidateIds: an id that is neither a referenced
 *      target nor a stored mirror holder must yield NO candidate — otherwise
 *      `--id N --apply` recomputes and WRITES an arbitrary record outside the
 *      tuple's candidate set);
 *   3. the degraded-seed census FOLD (`summary.degradedSeedRecords`) — the
 *      number the shrink budget adjudicates. It was only ever fed to
 *      exceedsShrinkBudget as a hand-built literal; nothing proved the sweep
 *      ever produces it.
 *
 * Fixture: a scratch REVERSE-ONLY observer edge (test999… namespace, the
 * registry's suite-DB diagnostics carve-out) whose `data_from_field` names a
 * peer with no ontology node — the measured degraded-seed shape — plus one
 * scratch rsc205 record holding a stale mirror entry nothing references. That
 * makes the sweep's answer deterministic (1 tuple, 1 candidate, 1 withheld
 * drop) instead of hostage to whatever the suite ontology happens to carry.
 * Every call here is a DRY RUN: the fold and the narrowing are readable
 * without writing, and a mutant that writes is the thing we are guarding.
 */
const SCRATCH_OBSERVER = 'test99930'; // own band — the failsafe gate owns test9990x
const SCRATCH_MISSING_PEER = 'test99939_no_such_node';
const SCRATCH_HOST = 'rsc205';
const SCRATCH_HOLDER_ID = 91098; // clear of REFERENCER_ID/2 above and of the failsafe band
/** The id the stale entry POINTS AT: a real-looking neighbour that is neither a
 * referenced target nor a mirror holder — exactly the record an `--id` filter
 * that skipped the membership check would go and recompute. */
const SCRATCH_NON_CANDIDATE_ID = 91099;

/** Suite DB only: this fixture writes dd_ontology, and `test` is a REAL tld in
 * production ontologies (the scratch-namespace carve-out is itself suite-DB
 * gated — observer_subscriptions.ts touchesScratchObserverNamespace). */
const onSuiteDb = config.db.database.endsWith('_test');

function skipUnlessSuiteDb(caseName: string): boolean {
	if (onSuiteDb) return false;
	console.warn(
		`observer_reconcile_native: NOT RUN — "${caseName}" (not the *_test suite DB: seeding a test999… ontology node would pollute a real ontology)`,
	);
	return true;
}

async function sweepScratchObserverFixture(): Promise<void> {
	await sql.unsafe(`DELETE FROM dd_ontology WHERE tipo = $1 AND tld = 'test'`, [SCRATCH_OBSERVER]);
	await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = $1 AND section_id = $2`, [
		SCRATCH_HOST,
		SCRATCH_HOLDER_ID,
	]);
	await sql.unsafe(`DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2`, [
		SCRATCH_HOST,
		SCRATCH_HOLDER_ID,
	]);
	const { clearOntologyDerivedCaches } = await import(
		'../../src/core/ontology/cache_invalidation.ts'
	);
	await clearOntologyDerivedCaches();
}

describe('reconcile sweep: --section / --id narrowing and the degraded-seed census', () => {
	beforeAll(async () => {
		if (!onSuiteDb) return;
		// Residue-tolerant (the observer suites' convention): sweep first, then
		// seed unconditionally — a crashed run's leftovers must never make these
		// gates vacuously green.
		await sweepScratchObserverFixture();
		await sql.unsafe(
			`INSERT INTO dd_ontology (id, tipo, parent, model, tld, properties)
			 VALUES ((SELECT COALESCE(MAX(id), 0) + 1300 FROM dd_ontology), $1, 'test3', 'component_autocomplete_hi', 'test', $2::text::jsonb)`,
			[
				SCRATCH_OBSERVER,
				JSON.stringify({
					// The reconciler's covered shape: use_observable_dato +
					// set_dato_external, host pinned by the observe entry's own scope
					// (resolution step 1), so the tuple is deterministic.
					observe: [
						{
							component_tipo: 'rsc387',
							section_tipo: SCRATCH_HOST,
							server: {
								config: { use_observable_dato: true },
								perform: { function: 'set_dato_external' },
							},
						},
					],
					source: {
						data_from_field: [SCRATCH_MISSING_PEER], // ← degrades the seed
						section_to_search: [SCRATCH_HOST],
						component_to_search: ['rsc387'],
					},
				}),
			],
		);
		const { clearOntologyDerivedCaches } = await import(
			'../../src/core/ontology/cache_invalidation.ts'
		);
		await clearOntologyDerivedCaches();
		// The holder: one stale mirror entry, nothing references it → the law
		// wants to drop it, and the degraded seed withholds exactly that drop.
		await sql.unsafe(
			`INSERT INTO matrix (section_id, section_tipo, relation) VALUES ($1, $2, $3::text::jsonb)`,
			[
				SCRATCH_HOLDER_ID,
				SCRATCH_HOST,
				JSON.stringify({
					[SCRATCH_OBSERVER]: [
						{
							id: 1,
							type: 'dd151',
							section_id: String(SCRATCH_NON_CANDIDATE_ID),
							section_tipo: SCRATCH_HOST,
							from_component_tipo: SCRATCH_OBSERVER,
						},
					],
				}),
			],
		);
	});

	afterAll(async () => {
		if (!onSuiteDb) return;
		await sweepScratchObserverFixture();
	});

	test('the degraded-seed census FOLD reports the number the budget adjudicates', async () => {
		if (
			skipUnlessSuiteDb('the degraded-seed census FOLD reports the number the budget adjudicates')
		)
			return;
		const { exceedsShrinkBudget, reconcileObserverMirrors } = await import(
			'../../src/core/section/record/observer_reconcile.ts'
		);
		const records: unknown[] = [];
		const lines: string[] = [];
		const summary = await reconcileObserverMirrors({
			onlyObserver: SCRATCH_OBSERVER,
			onlySection: SCRATCH_HOST,
			onlyId: SCRATCH_HOLDER_ID,
			onRecord: (record) => records.push(record),
			log: (line) => lines.push(line),
		});
		expect(summary.tuples).toBe(1);
		expect(summary.candidates).toBe(1);
		expect(summary.drifted).toBe(1);
		// THE FOLD: the withheld record is counted as degraded AND as a wanted
		// drop. Nothing was repaired (dry run) and no OTHER refusal fired.
		expect(summary.degradedSeedRecords).toBe(1);
		expect(summary.shrinksSkipped).toBe(1);
		expect(summary.droppedRecords).toBe(1);
		expect(summary.droppedLocators).toBe(1);
		expect(summary.repaired).toBe(0);
		expect(summary.bigResultRefused).toBe(0);
		expect(summary.sublawRefused).toBe(0);
		// The census channel names the cause, so a budget can be adjudicated by
		// cause instead of by one total.
		expect(records).toEqual([
			{
				observerTipo: SCRATCH_OBSERVER,
				hostSection: SCRATCH_HOST,
				sectionId: SCRATCH_HOLDER_ID,
				before: 1,
				after: 0,
				dropped: 1,
				added: 0,
				seedDefects: [`peer_node_missing:${SCRATCH_MISSING_PEER}`],
				refusal: 'degraded_seed',
			},
		]);
		// The operator line names the defect too — a held shrink an operator
		// cannot attribute is a held shrink nobody fixes.
		expect(lines.some((line) => line.includes('DEGRADED SEED'))).toBe(true);
		// …and the number the fold produced is the one the budget refuses: a
		// degraded seed is never within budget, however generous the ceilings.
		expect(
			exceedsShrinkBudget(summary, {
				maxDroppedLocators: 1_000_000,
				maxDroppedRecords: 1_000_000,
			}),
		).toHaveLength(1);
		// A dry run persisted nothing: the stale entry is still stored.
		const rows = (await sql.unsafe(
			`SELECT relation->$3 AS bag FROM matrix WHERE section_tipo = $1 AND section_id = $2`,
			[SCRATCH_HOST, SCRATCH_HOLDER_ID, SCRATCH_OBSERVER],
		)) as { bag: unknown[] | null }[];
		expect(rows[0]?.bag).toHaveLength(1);

		// HONEST GAP (do not delete): the kernel sets `seedDefects` and
		// `skippedShrink` together and only together (observers.ts — both return
		// sites spread the same `wouldWithhold`/`withheld` object), so a mutant
		// that folds on `outcome.skippedShrink === true` instead of
		// `outcome.seedDefects !== undefined` is EQUIVALENT against the real
		// kernel and cannot be turned red from here. Distinguishing them needs a
		// fake kernel outcome — an injection seam (or a mock.module of
		// observers.ts, which leaks process-wide across the observer suites).
		// What this case does prove: the fold RUNS, counts the right record, and
		// feeds the budget.
	}, 30000);

	test('--id NARROWS BY MEMBERSHIP: a non-candidate id yields no candidate at all', async () => {
		if (skipUnlessSuiteDb('--id NARROWS BY MEMBERSHIP: a non-candidate id yields no candidate'))
			return;
		const { reconcileObserverMirrors } = await import(
			'../../src/core/section/record/observer_reconcile.ts'
		);
		// SCRATCH_NON_CANDIDATE_ID is the id the stale mirror entry points at: it
		// holds no mirror and is referenced by nothing, so it is NOT in the
		// tuple's candidate set. An `--id` that trusted its argument would
		// recompute it — and under `--apply` WRITE it — from a candidate list it
		// was never in.
		const records: unknown[] = [];
		const summary = await reconcileObserverMirrors({
			onlyObserver: SCRATCH_OBSERVER,
			onlySection: SCRATCH_HOST,
			onlyId: SCRATCH_NON_CANDIDATE_ID,
			onRecord: (record) => records.push(record),
		});
		expect(summary.tuples).toBe(1); // the tuple IS discovered — not a vacuous pass
		expect(summary.candidates).toBe(0);
		expect(summary.drifted).toBe(0);
		expect(records).toEqual([]);
		// Positive control on the same tuple: the holder IS a member (its id
		// comes from the stored-mirror half of the union, not the index half).
		const hit = await reconcileObserverMirrors({
			onlyObserver: SCRATCH_OBSERVER,
			onlySection: SCRATCH_HOST,
			onlyId: SCRATCH_HOLDER_ID,
		});
		expect(hit.candidates).toBe(1);
	}, 30000);

	test('--section NARROWS the tuple set (filtered LAST, after the index fan-out)', async () => {
		if (skipUnlessSuiteDb('--section NARROWS the tuple set')) return;
		const { reconcileObserverMirrors } = await import(
			'../../src/core/section/record/observer_reconcile.ts'
		);
		// Every call passes a non-candidate --id so no candidate is ever swept:
		// this case is about DISCOVERY, and it must not cost a corpus recompute.
		const noSweep = 999_999_901;
		// The scratch edge is DECLARED at rsc205, and the index fan-out seeds it
		// at every section rsc387 actually points into (the sections the tests
		// above plant referencers for, on1 among them) — so unfiltered it is a
		// multi-tuple observer, and --section rsc205 must cut it to the declared
		// one. (Measured correction 2026-08-08: an earlier draft asserted
		// `--section on1` finds 0 tuples for this edge; it finds 1, because the
		// fan-out is the point — the filter narrows the UNION, it does not
		// replace it.)
		const unfiltered = await reconcileObserverMirrors({
			onlyObserver: SCRATCH_OBSERVER,
			onlyId: noSweep,
		});
		expect(unfiltered.tuples).toBeGreaterThan(1);
		const home = await reconcileObserverMirrors({
			onlyObserver: SCRATCH_OBSERVER,
			onlySection: SCRATCH_HOST,
			onlyId: noSweep,
		});
		expect(home.tuples).toBe(1);
		// A section NO tuple hosts at yields none — an operator's scope is a
		// scope, not a hint (a pass-through filter would return the whole union).
		const elsewhere = await reconcileObserverMirrors({
			onlyObserver: SCRATCH_OBSERVER,
			onlySection: 'zzz-no-such-section',
			onlyId: noSweep,
		});
		expect(elsewhere.tuples).toBe(0);

		// …and on a REAL multi-host observer (hierarchy93 is declared at on1/ts1/
		// dc1 — measured 3 tuples on the suite ontology), --section must cut the
		// set down, not pass it through. This is the shape the tchi1 starvation
		// bug lived in: the filter has to run AFTER the index fan-out, but it
		// does have to run.
		const allHosts = await reconcileObserverMirrors({
			onlyObserver: 'hierarchy93',
			onlyId: noSweep,
		});
		const oneHost = await reconcileObserverMirrors({
			onlyObserver: 'hierarchy93',
			onlySection: SEED_TERM.section_tipo,
			onlyId: noSweep,
		});
		expect(allHosts.tuples).toBeGreaterThan(1);
		expect(oneHost.tuples).toBe(1);
	}, 30000);
});
