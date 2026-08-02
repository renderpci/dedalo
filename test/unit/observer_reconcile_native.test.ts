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
 *   bypass-inserted) proves the Phase-0 fail-safe is MEMBERSHIP-based and
 *   GROW-ONLY (2026-08-02): the addition persists, the stale entry is NOT
 *   dropped (the old length-only guard let an equal-length swap commit the
 *   drop) → a pure bypass DELETE makes the recompute a shrink, which the law
 *   withholds by default (an omitted option can never mean "allow") and
 *   applies ONLY on an explicit allowShrink:true opt-in → duplicating the
 *   term proves covered-observer mirror slots are STRIPPED at copy (empty by
 *   construction — never the source's byte-copied referencer bag).
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
	type TermSeedHandle,
	seedTermChainIfAbsent,
	sweepSeedTermReferencerResidue,
	sweepTermChain,
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

	test('a MASKED SWAP (1 stale drop + 1 new add) keeps the stale entry AND applies the addition', async () => {
		if (!planted) return;
		// Bypass-delete referencer 1 (its mirror entry goes stale) and
		// bypass-insert referencer 2: the full law now wants to drop one entry
		// and add one — EQUAL length before/after. The old length-only guard let
		// the drop COMMIT; the membership guard must not (review 2026-08-02).
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
		expect(outcome.skippedShrink).toBe(true); // the drop half was withheld
		expect((getCounters().observers_shrink_refused ?? 0) - refusedBefore).toBe(1);
		// GROW-ONLY merge persisted: stale entry kept IN PLACE, addition
		// appended with the next item id.
		expect(await mirrorBag()).toEqual([
			mirrorEntry(1, REFERENCER_ID),
			mirrorEntry(2, REFERENCER_ID2),
		]);
		// Explicit opt-in applies the FULL law: the stale entry drops, the
		// surviving entry keeps its stored id and position.
		const applied = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{ allowShrink: true },
		);
		expect(applied.changed).toBe(true);
		expect(applied.skippedShrink).toBeUndefined();
		expect(await mirrorBag()).toEqual([mirrorEntry(2, REFERENCER_ID2)]);
	});

	test('a bypass DELETE makes the recompute a pure shrink: WITHHELD by default, applied ONLY on explicit opt-in', async () => {
		if (!planted) return;
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
		expect(diff.after).toBe(0); // the shrink signal allowShrink adjudicates
		// Phase-0 fail-safe (2026-08-02): with NO explicit opt-in the drop is
		// WITHHELD inside the lock — reported as skippedShrink, nothing persisted
		// (no additions here, so the grow-only merge equals the stored bag).
		const refused = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{},
		);
		expect(refused.skippedShrink).toBe(true);
		expect((await mirrorBag())?.length).toBe(1); // stored bag untouched
		// Explicit opt-in is the ONLY door that applies a shrink.
		const applied = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
			{ allowShrink: true },
		);
		expect(applied.changed).toBe(true);
		expect(applied.skippedShrink).toBeUndefined();
		expect(await mirrorBag()).toEqual([]);
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
