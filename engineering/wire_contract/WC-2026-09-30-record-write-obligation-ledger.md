# WC-2026-09-30-record-write-obligation-ledger — the record-write chokepoint owns the observer cascade and the relation_search index

- **Date:** 2026-09-30 (audit 2026-09-26, CLOSURE_PLAN Step 2: CORE-1, CORE-2 residual).
- **Decision:** CLOSURE_PLAN §Owner decisions (2026-09-30, all leanings accepted). Four
  points below are stated for owner review; the engine goes ahead on the recommendation.
- **Doors:** every writer that reaches `src/core/section_record/record_write.ts` — the
  component save (`saveComponentData`), the time machine's `apply_value` (component and
  section branches), the bulk revert (key units, composed units, the cascade undelete,
  the soft-cascade restore), the record delete and the data wipe, the portal
  `delete_locator`, the duplicate, the create, the observer recompute, the translation
  tools, the dataframe restore.
- **Shape before:**
  - The observer cascade (PHP `propagate_to_observers`) was a call each door made
    itself, post-commit. `restoreSectionRow`, `restoreAbsentSectionRow` and the bulk
    revert's `restoreDeletedRecord` made none: an undeleted referencer was missing from
    every mirror it feeds until `observer_reconcile`, and an undeleted TERM brought its
    mirror slot back verbatim (phantom referencers). A create with relation defaults
    propagated nothing.
  - Under an ambient transaction (the import doors' per-row wrap) propagation ran INSIDE
    it; a recompute failure was rethrown (`observers_propagation_failed_in_tx`) and rolled
    the imported row back.
  - `relation_search` (the `_hi` ancestor index) was written by separate raw calls a door
    had to remember (`maintainRelationSearchIndex`, `reindexRelationSearchLikeSave`,
    `reindexRelationColumnLikeSave`); the observer recompute wrote an `_hi` mirror with
    NO index, so a broader-term search missed it (CORE-2). A whole-record restore of a
    snapshot without the key left the key's index standing.
- **Shape after:**
  - Every chokepoint write declares its change to `afterRecordWrite` (`observed`,
    required: `keys` / `replace` / `birth` / `death` / `cascade-owned` / `none`); the
    OBLIGATION LEDGER (`section_record/obligation_ledger.ts`) records, per write, the
    before-image read under the row lock and the after-value, and drains the propagation
    **post-commit on every door**, the import transaction included: one entry and one
    `registerCommitAction` per write (a ROLLBACK discards it, a savepoint rollback
    discards exactly its own entries; entries are never coalesced), one `CascadeGuard`
    per transaction. With no transaction it drains inline. `propagateToObservers` refuses
    to run inside a transaction (`internal.invariant`).
  - A recompute failure is logged and counted (`observers_propagation_failed`) and
    repaired by `observer_reconcile` — it no longer rolls back the write it follows. The
    `observers_propagation_failed_in_tx` counter is retired.
  - Restore and undelete propagate: the restored value's targets list the record, the
    replaced value's targets drop it, and the recompute writes its mirror Time Machine
    row and the owner's modified stamps (`bulk_id` null — a mirror row is not a run's
    pair).
  - A COVERED OBSERVER slot and the frames its dataframe slots hold for it are ONE
    UNIT (addendum 2026-10-01): a frame pairs with a mirror ITEM by `id_key → id`, and
    the recompute keeps the id of every referencer still present but mints fresh ids
    1..N into an EMPTY mirror — so moving the main without its frames re-paired a
    curator's frame onto another referencer. Per door:
    - a whole-record REPLACE over a live row (`persistRecordColumns`) keeps the LIVE
      unit — the live mirror AND, in every slot of the unit, the main's live frames
      (other mains' frames of a shared slot stay as written) — and recomputes it;
    - a NEW record's birth (`prepareBirthColumns`: create, duplicate) stores no unit —
      mirror and frames dropped (`dropCoveredObserverUnits`; the duplicate drops them
      before its frame-target re-mint, so no target is deep-copied for a frame the
      clone never stores);
    - an UNDELETE (`persistRecordBirth`, and `persistRecordColumns` over an absent row)
      writes the snapshot's unit back as given — the record continues at its address,
      and its item ids are its frames' pairing keys — and every covered slot its section
      DECLARES is recomputed (not only those its snapshot carried: a referencer undeleted
      first carries a locator onto the missing record). The birth NEVER declares a
      covered slot as an edge (`obligation_ledger.ts` excludes every `selfRecompute`
      slot from a birth's changes): a phantom referencer in the snapshot must not reach
      the mirror's own observers;
    - the bulk revert's SOFT-cascade restore puts a covered slot back from the snapshot
      too (never judged a write since — the recompute writes it whenever a referencer
      moves), every key through the COMPONENT-RESTORE entry below, and queues the
      whole-section recompute.
    Because none of these doors declares the slot, the ledger's covered-slot recompute
    ALWAYS hops (`recomputeMirrorAndHop` with hop `'always'`, once per operation): an
    undeleted mirror whose snapshot is still truth writes nothing, and its own observers
    (whom the delete's death told the record was gone) learn it back only through that
    hop. Stated limit: under the >2000 freeze or a degraded-seed shrink the recompute
    keeps the stored value — after an undelete that is the snapshot's (a phantom stays
    until the reconcile; before this addendum the slot stayed EMPTY instead).
  - ONE SECTION CENSUS (`section/record/declared_components.ts`): the record wipe
    (`deleteSectionData`) and the whole-section covered-slot recompute walk the same set
    — own ∪ real (`getSectionRealTipo`) component subtree, crossing nested sections. The
    recompute used to walk the own subtree without crossing and fall back to the real
    section only when the own one held NO component, so a virtual section with a
    component of its own never recomputed its real section's mirrors, and a slot the
    wipe emptied could stay wiped-empty until a reconcile. The wipe used the same
    fallback and so never emptied them either.
  - A COMPONENT restore writes through its own chokepoint entry, `persistRestoredKeys`
    (`apply_value`, the bulk revert-undo's key write and its composed unit — enumerated
    by `write_obligations_tripwire` leg B4). For every key but a covered slot it IS
    `persistRecordKeys`; the soft-cascade restore's key write takes it too. A covered slot's past value (a mirror's history row, a run's
    image of it) lands as asked (the restored items' frames pair to them), is NEVER
    declared as a change — propagated, the transient value reached the slot's own
    observers as truth, and the per-operation recompute dedup kept the phantom in their
    values — and its recompute is queued (`requestCoveredSlotRecompute` with `only` =
    exactly the covered slots written — never narrowed by the section census, which a
    slot outside it would leave written and never recomputed; the write's stamp
    posture): after COMMIT the mirror converges on the records
    that reference it NOW. A history row that named a referencer since gone no longer
    leaves a phantom until the next reconcile; items that still reference keep their ids
    (the recompute's order-preserving merge) and their frames. The recompute entry is a
    `RECORD_WRITE_CHOKEPOINT` (it writes nothing itself; its drain lands the mirror
    through `persistObserverMirrorKeys`); its two callers (the soft-cascade restore and
    the restore entry) are enumerated by leg B4. Stated limit: a revert of such a revert
    meets the recomputed value, not the after-image its pair recorded, and refuses the
    key `changed_since_run` — correct for a derived slot (the value it would restore is
    a past derivation too), reported, never silent. Stated limit: an ordinary SAVE of a covered slot
    (a curator editing a mirror portal by hand, an import writing one) still stands until
    the next recompute or reconcile — whether every chokepoint write of a covered slot
    should recompute it is an owner decision (it would make hand edits of a mirror vanish
    at once, and the suite's portal fixtures use a mirror as a stand-in portal).
  - EVERY record birth stores by one law (`record_write.ts prepareBirthColumns`), the two
    INSERT doors that bypass the chokepoint included (create, duplicate): no covered
    slot, and the `_hi` ancestor index derived from the relation the row actually
    carries. The duplicate used to copy its source's `relation_search` verbatim while
    dropping the mirror it indexes — an index for a value the clone does not hold,
    matched by a broader-term search. A create's `_hi` relation default now gets its
    index in the insert.
  - A derived recompute takes the stamp posture of a VERBATIM birth: a record undeleted
    with its snapshot's own stamps (the bulk revert) is not re-stamped by the recompute
    of its covered slots in the same transaction's drain (limit: a later transaction's
    recompute stamps it like any record).
  - A mirror recompute that WRITES hops with what it DROPPED (`recomputeExternalRelation`
    `droppedLocators`, the ledger's one removal rule) as the hop's `removed` set: an
    observer OF a mirror (a depth-2 edge) re-derives the records that left it. The hop
    used to carry `removed: []`, so a record that left a mirror — in no current value —
    kept the mirror's host in its back-mirror until a reconcile.
  - The RECONCILE repairs an `_hi` mirror whose index disagrees with the value it keeps
    AS STORED (a mirror written before this change): the value agrees with the law, or
    the kernel refuses/withholds its write (the >2000 freeze, a pure degraded-seed
    shrink — a mirror no later write re-indexes). The index alone is rewritten,
    unstamped, no history row, no hop; `recomputeExternalRelation` reports `indexDrift`
    when called with `repairIndex: true` (only `observer_reconcile` passes it),
    `observer_reconcile` a distinct `reindexed` count (dry run: would; apply: did; the
    registry counts it as drift — a frozen or degraded mirror with a stale index is two
    findings, the value and the index), the counter `observers_index_repaired` ticks. The interactive cascade never
    compares the index: that walks every mirror item's thesaurus chain (one SELECT per
    ancestor level, uncached) under the row lock of every no-drift recompute, forever, for
    a condition only a pre-change mirror or a raw drift can be in.
  - `afterRecordWrite` refuses a call with no (or an unknown) `observed` declaration as a
    typed `internal.invariant` naming the door, before any fan-out — never a bare
    TypeError after the row landed. An obligation queued by a leaked continuation (its
    transaction already settled) is refused the same way, never dropped.
  - The observer subscription registry, rebuilt cold INSIDE a transaction (every
    chokepoint write asks it whether a key is observed; the cache is cold after every
    dd_ontology write), is warmed after that transaction's COMMIT on the commit lane —
    outside the transaction, on committed state, under the build-token guard — so a cold
    cache is paid once, not by every later save transaction.
  - `delete_locator` propagates `{saved: kept, removed}` (it was `{saved: [], removed}`) —
    PHP `delete_locator → Save()` propagated the kept value.
  - `relation_search` is written in the SAME UPDATE as the value, by the chokepoint:
    the SAVE law (only a node whose own model is `component_autocomplete_hi`) for every
    writer, the REMOVAL law (every relation key the door rewrites) for the three removal
    doors (`persistRelationRemovalKeys`: `delete_locator`, the delete's inverse-reference
    strip, the data wipe). A whole-record write re-derives every `_hi` key of the old
    relation, the new relation and the base index (before ∪ after), and leaves the column
    byte-untouched when no `_hi` key is involved. The observer recompute's `_hi` mirror is
    indexed from what is actually stored (a withheld shrink included).
  - `saveComponentData.observersData` (the same-record info items) is filled from the
    ledger's receipt after the save's COMMIT; it is `[]` when a caller's transaction
    defers the drain past the save's return.
  - A save that writes nothing (every change a no-op) propagates nothing.
  - Creating a record with relation defaults now propagates (its birth); so does a
    duplicate (its clone's birth) and a record delete (its death — queued inside the
    delete's transaction).
  - The data wipe's stripped dataframe slots are written through the removal-law door
    with the rest of the wipe (one write per slot, its final value).
- **Owner-visible decisions (recommendation adopted, for review):**
  1. **Post-commit recomputes under import transactions** — primary data must not roll
     back because a DERIVED recompute failed; the counter and the reconcile make a failure
     visible and repairable. This also closes the residual deadlock window two import rows
     editing each other's equivalence class used to open (`observers.ts`, 2026-08-06).
  2. **relation_search: one law or two.** Only `_hi` keys are ever read (`conform.ts`,
     `builder_relation.ts`), so the removal law writes index keys nothing reads. Kept as
     the separate `persistRelationRemovalKeys` entry, per the plan's wording, until the
     owner decides to retire it.
  3. **Archive restore door** (`src/core/archive/restore.ts writeRecordRow`) should route
     through `persistRecordColumns` / `persistRecordBirth`; until the owning step does it
     declares `observed: {kind: 'none', reason: 'PENDING: …'}` and is held by
     `write_obligations_tripwire`'s PENDING change detector.
  4. **Tree moves** (`relations/parent.ts`, `ts_api addChild`) still write raw (PENDING,
     Step 5): (a) route the moved record's own write through `persistRecordKeys` +
     `recordMainHistory`; (b) recommended: expand descendants at READ time in `conform.ts`
     (recursive CTE) and retire the stored `_hi` index — which would make the derivation
     above transitional. Fallback: a resumable, counted post-commit reindex job.
- **Stated limit:** the relay (D1) and info observers of a deleted record's edges are
  reached only through its death entry — the inverse-reference strip cleans locator
  mirrors, never an observer whose value names no locator.
- **Stated limit (measured 2026-10-01, owner decision open):** the per-transaction guard is
  EXECUTE-ONCE (the ledgered divergence WC-2026-08-02-observer-cascade-bounded-flag), so a
  mirror OF a mirror (a depth-2 back-mirror) is recomputed once per operation. When an
  EARLIER entry of one transaction reaches it (a save of a link queued before a
  soft-cascade restore of the hub it left) while a LATER entry's restored mirror still holds
  its snapshot — committed, not yet converged — it reads the snapshot's phantom, and the
  restored mirror's convergence hop is deduplicated away: the back-mirror lists the hub
  until `observer_reconcile`. First-order mirrors converge in any drain order. Closing it
  needs a generation-aware dedup (a recompute whose INPUT mirror wrote after it is redone)
  or a two-phase drain (every entry's covered-slot convergence before any propagation) —
  either revisits the execute-once decision.
- **Gate reconciliation:** no parity fixture recorded a restore's or an undelete's mirror
  side effects or a recompute's index; no fixture edit, no re-harvest. Gates:
  `test/unit/obligation_ledger_native.test.ts` (restore over a live row, the before ∪
  after index, true undelete, bulk undelete, undeleted term vs its phantom and its
  live referencer, the live slot inside a replace's transaction, the `_hi` recompute
  index incl. reconcile, dry run and the index-only repair — and its absence on the
  interactive path, the create / duplicate / delete declarations, the create's
  birth-column law (an `_hi` default indexed, a covered slot's default never stored),
  the duplicate's `_hi` index, the pure-insert (atomic-append) entry's mirror, history
  and index, the removal law at all three removal doors on a non-`_hi` key, the
  soft-cascade restore incl. a run that owns the stamps, the verbatim undelete (separate
  and in ONE transaction) and D2 over a mirror, `apply_value` of a mirror's history row,
  the bulk revert of a run that wrote a mirror key (and with the run owning the host's
  stamps), a depth-2 mirror (a referencer leaving, a restored mirror never propagated),
  the composed revert of a mirror with a dataframe slot, the covered UNIT through an
  undelete (frames keep their referencer, the phantom never propagated, the no-drift
  recompute hops), a soft-cascade restore, a replace and a duplicate, the census on a
  virtual section with a component of its own (restore entry, whole-section recompute,
  wipe), on a mirror declared under a nested section node, and on a record whose section
  does not declare the slot, a soft-cascade restore whose snapshot mirror is empty while
  truth has a referencer, a soft-cascade restore whose snapshot lists a referencer that
  left (never propagated), a mirror host undeleted with its referencer in one transaction
  (the no-drift recompute the referencer's propagation ran still lets the host's forced
  hop through),
  the degraded-seed `_hi` index repair, a replace whose live mirror differs from truth,
  rollback / ambient / savepoint / inline drains each against a planted drift only a
  stray recompute would repair, the receipt, the undeclared-hook and leaked-continuation
  refusals, the registry warm after COMMIT), `test/unit/write_obligations_tripwire.test.ts` (leg A reach-based,
  leg B derived: every chokepoint reaches the hook, the hook reaches the ledger, the
  ledger reaches the cascade, the chokepoint writers and the two INSERT doors reach the
  derivation, and the exclusivity — over-approximated, a namespace escape is a caller —
  of the cascade, the recompute unit and kernel, the per-key kernel `writeKeys` (its
  flag-value hatches — no ledger, the removal law, the covered-slot recompute — reachable
  only through the four named entries), the ledger's enqueue, the derivation,
  the birth-columns law, the removal-law, cascade-owned and covered-slot entries and the
  files_info writer; every afterRecordWrite caller outside the chokepoint pinned to its
  outcome case; PENDING tree-move / archive rows),
  `test/unit/write_obligations_native.test.ts`, the `observer_*_native` gates,
  `relation_search_coherence_native`, `bulk_revert_*_native`.
