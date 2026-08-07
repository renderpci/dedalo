# WC-2026-08-06-observer-degraded-seed-refuses-shrink — a recompute that could not build its seed keeps its drops

- **Date:** 2026-08-06. Landed WITH, and is the precondition for,
  `WC-2026-08-06-observer-grow-only-failsafe-retired`.
- **Decision:** — (write-path value rule; DEC-12 gate:
  `test/unit/observer_failsafe_native.test.ts`, describe "degraded seed
  refuses the drop half (behavioral)").

### Shape before (PHP)

None. PHP has no diagnostic here: `collectExternalSeed`'s equivalent walks
`data_from_field`, instantiates each peer, and works with whatever it gets. A
peer whose ontology node is missing yields an empty closure, PHP recomputes a
smaller reference set, and PHP saves it. There is no signal and no refusal.

### Shape after (TS)

`collectExternalSeed` and `buildExternalSeed` take a **defect sink**
(`defects?: string[]`). Every never-narrow escape already logged and counted
also records itself into that per-call list:

| Escape | Sink entry | Counter |
|---|---|---|
| `data_from_field` peer has no ontology node | `peer_node_missing:<tipo>` | `observers_seed_peer_node_missing` |
| non-string / empty `data_from_field` entry | `invalid_data_from_field` | `observers_seed_invalid_data_from_field` |
| peer locator with no `section_tipo`/`section_id` | `malformed_peer_locator` | `observers_seed_malformed_peer_locator` |

`recomputeExternalRelation` threads the sink out of its `compute()` and, when
`defects.length > 0 && dropped > 0`, applies the ADDITIONS and withholds the
DROPS — reporting `skippedShrink: true` plus `seedDefects: [...]`, naming the
ontology to fix. The dry run reports the identical refusal, so an operator
sees it before applying. A pure withheld shrink writes nothing at all: no live
change, no TM row, and therefore no cascade hop.

### Reason

This is precisely why retiring the blanket grow-only fail-safe was safe.

A process-wide counter cannot answer the question the drop decision turns on:
*was THIS record's seed complete?* Under grow-only that did not matter — no
drop ever persisted, so a degraded seed cost nothing. Under the full law it
would be a **mass delete**: a partially-installed or half-migrated ontology
where one `data_from_field` peer node is absent degrades the seed to
stored-bag-only, which is the measured 247,933-locator-loss shape (self + peer
stored bag = 11,953 exact of 19,908 records, versus 19,885 with the closure).
Every affected record's next save would then delete the difference.

The refusal is strictly STRONGER than what it replaced, on the axis that
matters: it is precise (per record, per cause), it names the fix, and it
cannot be turned off — there is no caller-supplied shrink switch any more, by
design.

### Gate reconciliation

No fixture re-harvest — TS emits an outcome flag PHP has no equivalent of, on
a path where PHP simply writes the wrong value. The gate seeds a scratch
observer (`test99904`) whose `data_from_field` names a node that does not
exist, plants a stale mirror entry, and asserts: `skippedShrink`,
`seedDefects: ['peer_node_missing:test99999_no_such_node']`, both counters
+1, `wrote` absent, and the stored bag byte-untouched. A second case pins that
the dry run reports the same refusal with the same FULL-LAW `before`/`after`
numbers.

`exceedsShrinkBudget` (`observer_reconcile.ts`) treats ANY degraded-seed
record as over budget regardless of drop volume: an ontology that cannot
answer the value law is not a "small enough" problem to wave through.
