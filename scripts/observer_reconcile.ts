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
 * SHRINK PROTECTION (grow-only, membership-based — Phase-0 disarm
 * 2026-08-02): a recompute NEVER drops a stored entry without --allow-shrink
 * — a mirror whose stored entries exceed the index truth may be legacy data
 * the match law does not cover, and until the value law (D3) lands the
 * computed set is known too small, so every drop is suspect. Additions still
 * apply (the sweep stays convergent-upward); the drop half is held and
 * reported. The adjudication happens INSIDE the row lock (no TOCTOU).
 *
 * UNPORTED SUB-LAWS: observers whose source carries `set_observed_data` /
 * `source_overwrite` (PHP sub-laws a/b, not ported) are REFUSED wholesale
 * and reported as such — law (c) is provably the wrong law for them
 * (numisdata679/965 would wipe ~131,800 mirror locators).
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
	}${
		summary.sublawRefused > 0
			? `; ${summary.sublawRefused} tuple(s) REFUSED (unported sub-law — not swept)`
			: ''
	}${
		summary.bigResultRefused > 0
			? `; ${summary.bigResultRefused} record(s) at the >2000-reference FREEZE (computed, not written)`
			: ''
	}`,
);
process.exit(0);
