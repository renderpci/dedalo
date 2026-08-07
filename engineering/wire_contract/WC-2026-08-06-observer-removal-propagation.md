# WC-2026-08-06-observer-removal-propagation — propagation visits the records a save STOPPED pointing at

- **Date:** 2026-08-06.
- **Decision:** — (write-cascade target rule; DEC-12 gates:
  `test/unit/observer_failsafe_native.test.ts` (static call-site scanner),
  `test/unit/observer_equivalence_native.test.ts` (end-to-end through the save
  door)).

### Shape before (PHP)

PHP's `propagate_to_observers` (v6 `class.component_common.php:1372`) runs
after the component's `Save()` and reads `$this->dato` — the value the
component now holds. The records the save REMOVED are gone from that value, so
PHP never visits them. Their mirrors keep a dead reference until something
else happens to recompute them.

### Shape before (TS, until 2026-08-06)

Identical, and for the same reason: `save_component.ts` passed
`result.data` — the post-save value — and `propagateToObservers` derived its
entire target set from that array.

One door was already correct: `deletePortalLocator`
(`src/core/relations/save.ts`) bypasses `saveComponentData`, so it fired
propagation itself and passed `outcome.removedLocators`. Those removals rode
the *saved* slot, which happened to work only because the two sets were then
handled identically.

### Shape after (TS)

`propagateToObservers` takes an **`ObservedChange`**:

```ts
propagateToObservers(observedTipo, sectionTipo, sectionId,
                     { saved: unknown[]; removed: unknown[] },
                     userId, now?, cascade?)
```

`removed` is a REQUIRED field, not a trailing optional parameter. A default
would make "nothing was removed" the silent fallback — which IS the bug — and
it is the same omitted-argument shape that armed the 2026-08-02 wipe. Every
door must state its removed set; `[]` is a fine answer, silence is not, and a
static gate scans `src/` + `scripts/` for call sites that don't.

Removed locators join the target set in the **`set_dato_external`** and
**relay** branches. They are deliberately excluded from the **info** branch:
its SQO targets come from a search whose every clause's `q` is the *saved*
record's locator, so a removed locator is not an input to it at all. The
analogous staleness there is unobservable (an info recompute writes only a
`matrix_time_machine` row and never the live misc column — live reads
compute), and inventing a second target source for it would be a guess.

The doors and what each now states:

| Door | `saved` | `removed` |
|---|---|---|
| `save_component.ts` (the chokepoint) | post-save value | `result.removedItems` |
| `relations/save.ts` `deletePortalLocator` | `[]` | `outcome.removedLocators` |
| `delete_record.ts` step 9 (NEW) | rewritten owner's remaining bag | the stripped locators |
| `duplicate_record.ts` | the copy's items | `[]` |
| internal cascade hop | the payload | `[]` (a hop is a current-state event) |

`SaveResult.removedItems` is computed at the chokepoint by diffing a pre-save
snapshot of the FULL relation slot against the post-save value, keyed on
`(section_tipo, section_id)` — never on the item id, because an `update` that
retargets a locator replaces the object in place and keeps its id, so an
id-keyed diff would see neither the old target leaving nor the new one
arriving. It is internal and never reaches the wire.

### Reason

The recompute is idempotent — it re-reads truth from `matrix_relation_index`
under the target's row lock — so visiting a removed target is safe, and it is
the ONLY way that target's mirror can drop the dead entry on the save that
caused it. Without this, a removal is repaired only by an operator sweep.

Measured on the reported case (`numisdata3/42396` ↔ `42397`, dd621
equivalents): removing the link recomputed `42397` (the saved record, reached
as `use_self_section`) but never `42396`, which appears in neither the
post-save value nor any search — only in the removed set.

### Gate reconciliation

No fixture re-harvest: the wire shape of a save response is unchanged
(`removedItems` is internal; `observersData` is emitted exactly as before).
This is a change in WHICH records get recomputed, not in what any of them
emit. The `observer_equivalence_native.test.ts` split gate drives the removal
through `saveComponentData` specifically — a direct `propagateToObservers`
call would bypass the pre-save snapshot and pass the gate vacuously.
