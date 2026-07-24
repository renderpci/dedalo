/**
 * ============================================================================
 * OBSERVER MIRROR RECONCILE SWEEP — CLI shell over
 * core/section/record/observer_reconcile.ts (the shared kernel; the v6→v7
 * data-update pipeline runs the same kernel automatically in its success
 * tail — update/engine.ts).
 * ============================================================================
 *
 * Observer mirrors (the hierarchy93 ← rsc387 family: a term record's
 * "who references me" slot, kept SEARCHABLE by persisting it) are maintained
 * by the save-chokepoint observer cascade. Writes that bypass every cascade
 * door leave them stale: v6→v7 migrated/updated data (the reported case —
 * dc1 §2 had 3 rsc387 referencers and a NULL hierarchy93 mirror, zero TM
 * rows), the delete_data wipe, tool_propagate_component_data, portalize.
 *
 * The kernel replays the ONE recompute law (recomputeExternalRelation —
 * row-locked, order-preserved keep, next-id append, TM audit pair) per
 * candidate: referenced targets from matrix_relation_index (trigger truth)
 * ∪ stored-mirror holders, host sections from spec ∪ index truth.
 *
 * USAGE (dry-run is the default and prints every drifted record):
 *
 *     bun scripts/observer_reconcile.ts
 *     bun scripts/observer_reconcile.ts --observer hierarchy93 --section dc1
 *     bun scripts/observer_reconcile.ts --id 2 --section dc1
 *     bun scripts/observer_reconcile.ts --apply [--allow-shrink]
 *
 * SHRINK PROTECTION: a recompute that would DROP entries (after < before)
 * is reported and SKIPPED unless --allow-shrink — a mirror whose stored
 * entries exceed the index truth may be legacy data the match law does not
 * cover (locators without from_component_tipo), and an unattended sweep must
 * never mass-delete on that ambiguity. The adjudication happens INSIDE the
 * row lock (no TOCTOU). Grows (the migration-backfill case) apply normally.
 */

import { reconcileObserverMirrors } from '../src/core/section/record/observer_reconcile.ts';

function argValue(flag: string): string | null {
	const index = process.argv.indexOf(flag);
	return index !== -1 ? (process.argv[index + 1] ?? null) : null;
}

const apply = process.argv.includes('--apply');
const allowShrink = process.argv.includes('--allow-shrink');
const onlyId = argValue('--id');

const summary = await reconcileObserverMirrors({
	apply,
	allowShrink,
	onlyObserver: argValue('--observer'),
	onlySection: argValue('--section'),
	onlyId: onlyId === null ? null : Number(onlyId),
	log: (line) => console.log(line),
});

console.log(
	`\nTOTAL: ${summary.tuples} tuple(s), ${summary.candidates} candidate(s), ${summary.drifted} drifted${
		apply
			? ` — ${summary.repaired} repaired, ${summary.shrinksSkipped} shrink(s) held`
			: ' — dry-run, pass --apply to repair'
	}`,
);
process.exit(0);
