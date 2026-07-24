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
 *   (idempotent) → deleting the referencer (raw, again bypassing) makes the
 *   recompute a SHRINK, which the law applies when asked (the CLI's
 *   --allow-shrink adjudication lives in the script, the law itself just
 *   reports before/after).
 *
 * Environment: suite DB — the on1 anchor + section node come from the shared
 * seed helper (observer_term_seed.ts); the referencer is a scratch matrix
 * row swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { recomputeExternalRelation } from '../../src/core/section/record/observers.ts';
import {
	SEED_TERM,
	type TermSeedHandle,
	seedTermChainIfAbsent,
	sweepTermChain,
} from '../helpers/observer_term_seed.ts';

const REFERENCER_ID = 91070; // scratch rsc205 row, clear of every other band

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
	await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = $1`, [
		REFERENCER_ID,
	]);
	await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE section_tipo = 'rsc205' AND section_id = $1`,
		[REFERENCER_ID],
	);
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
	await sweepScratch();
	// The bypass write: a raw referencer INSERT (import/migration shape) —
	// indexed by the matrix_relation_index trigger, invisible to the cascade.
	await sql.unsafe(
		`INSERT INTO matrix (section_id, section_tipo, relation) VALUES ($1, 'rsc205', $2::text::jsonb)`,
		[
			REFERENCER_ID,
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
		);
		expect(outcome.changed).toBe(true);
		expect(await mirrorBag()).toEqual([
			{
				id: 1,
				type: 'dd151',
				section_id: String(REFERENCER_ID),
				section_tipo: 'rsc205',
				from_component_tipo: 'hierarchy93',
			},
		]);
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
		);
		expect(again.changed).toBe(false);
	});

	test('a bypass DELETE makes the recompute a reported shrink, applied on demand', async () => {
		if (!planted) return;
		await sql.unsafe(`DELETE FROM matrix WHERE section_tipo = 'rsc205' AND section_id = $1`, [
			REFERENCER_ID,
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
		expect(diff.after).toBe(0); // the shrink signal --allow-shrink adjudicates
		const applied = await recomputeExternalRelation(
			'hierarchy93',
			SEED_TERM.section_tipo,
			SEED_TERM.section_id,
			-1,
			new Date(),
		);
		expect(applied.changed).toBe(true);
		expect(await mirrorBag()).toEqual([]);
	});
});
