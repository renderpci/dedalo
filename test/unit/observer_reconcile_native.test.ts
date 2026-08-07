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

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
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
function mirrorEntry(itemId: number, referencerId: number): Record<string, unknown> {
	return {
		id: itemId,
		type: 'dd151',
		section_id: String(referencerId),
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
		if (!planted) return;
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
		if (!planted) return;
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
		if (!planted) return;
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
		if (!planted) return;
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

	test('the drop census counts MEMBERSHIP, never a length delta', async () => {
		// A regression that drops N genuine locators and appends N wrong ones has
		// an equal length. `before - after` reports 0 and sails through the
		// budget — which is the exact shape the budget exists to catch. The
		// kernel adjudicates membership (that is why a masked swap commits both
		// halves), so the census must read the kernel's own numbers.
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const root = join(import.meta.dir, '..', '..');
		const source = readFileSync(
			join(root, 'src/core/section/record/observer_reconcile.ts'),
			'utf-8',
		);
		expect(source).toContain('outcome.dropped ??');
		expect(source).toContain('outcome.added ??');
		// And the kernel must actually supply them.
		const kernel = readFileSync(join(root, 'src/core/section/record/observers.ts'), 'utf-8');
		expect(kernel).toContain('dropped: existing.length - kept.length');
		expect(kernel).toContain('added: additions.length');
	});

	test('the shrink budget file is present, parseable and complete', async () => {
		// The budget is a committed artefact the CLI reads at runtime; a typo or
		// a missing key would surface as a crash during an ops sweep, which is
		// the worst moment to find out.
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
		// And the CLI must actually consult it, or the file is decoration.
		const cli = readFileSync(join(root, 'scripts/observer_reconcile.ts'), 'utf-8');
		expect(cli).toContain('observer_shrink_budget.json');
		expect(cli).toContain('exceedsShrinkBudget');
		expect(cli).toContain('process.exit(1)');
	});

	test('duplicate STRIPS the covered-observer mirror slot from the copy (empty by construction)', async () => {
		if (!planted) return;
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
