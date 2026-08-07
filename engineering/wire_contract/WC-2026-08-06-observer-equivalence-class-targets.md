# WC-2026-08-06-observer-equivalence-class-targets — a class edge recomputes the whole class, not its endpoints

- **Date:** 2026-08-06.
- **Decision:** — (write-cascade target rule; DEC-12 gate:
  `test/unit/observer_equivalence_native.test.ts`).

### Shape before (PHP)

PHP propagates to the locators in the saved component's value (plus the saved
record itself when `use_self_section` is set). For an ordinary relation that
is complete. For a **`data_from_field` peer** it is not.

`set_dato_external` reads `properties.source.data_from_field` to widen its
SEED: the mirror lists records referencing this record *or any of its
equivalents*, where "equivalents" is the dd621 transitive closure (v6
`class.component_relation_common.php:1996-2022`). So when the observed
component IS that peer, a save on it does not change one link — it
**re-partitions an equivalence class**. PHP still propagates only to the
direct endpoints, which means PHP's own mirrors are wrong for any class with
three or more members: in `A—B—C`, changing the `B—C` edge also changes A's
class, and A is never visited.

### Shape before (TS, until 2026-08-06)

Same as PHP, inherited.

### Shape after (TS)

In the `set_dato_external` branch, when the observed tipo appears in the
observer's own `properties.source.data_from_field`, the target set is expanded
to the equivalence-class closure:

```
targets = closure(savedRecord) ∪ ⋃ closure(r) for r ∈ removedLocators
```

This one formula is complete in both directions, with no add/remove branching:

- **Removal (split).** Any node `n` whose mirror must change is either still
  connected to the saved record — so `n ∈ closure(saved)`, computed *after*
  the write — or every pre-removal path from `n` to the saved record crossed a
  removed edge; the prefix up to the FIRST such edge `saved—rᵢ` avoids all
  removed edges, so `n ∈ closure(rᵢ)`.
- **Addition (merge).** `closure(saved)` is already the merged class and
  contains every `closure(r)`. Redundant, deduped, free.

The walk uses **`getStoredWithReferences`** — the same primitive
`collectExternalSeed` uses — so the TARGET law and the VALUE law cannot drift
apart. Each root gets its own memo: `getReferencesRecursive`'s `expanded`
cache is per-call by contract, and sharing it across roots would suppress
re-expansion and truncate later roots.

Two things guard the cost and the concurrency:

- The expansion is gated on the CHEAPEST test first — `data_from_field`
  membership — then on the same dispatch `getStoredWithReferences` itself
  uses (`component_relation_related` AND dd467/dd621). An edge with no
  `data_from_field` (the live `hierarchy93 ← rsc387` family) short-circuits
  before any node resolution and pays nothing; a dd620 or non-related peer
  skips the walk rather than computing an empty one.
- The final target set is **sorted by `(section_tipo, section_id)`** before
  the recompute loop. Each recompute takes the target row's `FOR UPDATE` lock
  and `withTransaction` JOINS an ambient transaction (`import_csv` wraps whole
  rows), so with class expansion one save can lock every member and the locks
  accumulate to the outer COMMIT. Unordered acquisition across two concurrent
  imports touching one class would deadlock.

A class wider than 50 targets is logged and counted
(`observers_equivalence_class_wide`) but **never refused** — refusing would
re-create exactly the staleness the expansion exists to remove. The counter is
the signal that a class has degenerated and the ontology needs a look.

### Reason

TS is deliberately MORE correct than the oracle here. The live chain is
`numisdata161 → numisdata36 → numisdata77`: coin types linked as equivalents
share their coins in the public portal. With the endpoint-only target set, a
three-type equivalence group showed the wrong coin list on whichever member
the save did not mention — silently, and in the direction users actually see.

Measured cost: the closure walk is ~2 queries per node with the memo, classes
on this install are ≤10 members, roots are `1 + |bag| + |removed|` — single-
digit milliseconds, an order of magnitude below the recomputes themselves
(p50 1.3 ms each, worst real case 22 ms). The real cost driver is that the
NUMBER of recomputes rises from ~2 to the class size, which is the point.

### Gate reconciliation

No fixture re-harvest — no wire shape changes, only which records recompute.
The gate builds a deliberately ASYMMETRIC three-member chain (X stores Y, Y
stores Z, so X reaches Z only transitively) and asserts that changing the
`Y—Z` edge recomputes X, in both the split and merge directions. Verified
load-bearing: disabling the expansion turns both directions RED.
