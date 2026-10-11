# WC-2026-10-11-parent-link-cycle-every-door — a parent link that closes a cycle answers `tree.cycle` from every door, racing or not

- **Date:** 2026-10-11 (audit 2026-09-26 closure plan, Step 5 — CORE-3 + ONT-5 tree half, lane 3).
- **Decision:** CORE-3 (tree writes are locked read-modify-writes), ONT-5 (no door may
  store a cycle in a hierarchy). The lock law lives at the head of the MUTATION HALF of
  `src/core/relations/parent.ts`.
- **Shape before:**
  - `dd_ts_api.update_parent_data` checked the cycle with an UNLOCKED ancestor walk BEFORE
    its transaction. Two moves that are each harmless (A under C while B goes under D, C
    below B and D below A) both passed and both committed: `A→C→B→D→A` was stored, and
    every ancestor walk afterwards recorded `Loop detected`.
  - Inside the transaction, `addParent` re-checked with the same unlocked walk and
    answered `{ok:false}`; `updateParentData` turned that into a plain `Error`, so a
    cycle caught there reached the client as `tree.node_write_failed` (500), not
    `tree.cycle`.
  - `add_child` whose new node would close a loop (a STALE link that already names the id
    the counter is about to mint, e.g. a link that outlived its record or an import that
    ran ahead of the counter) was refused as `tree.node_write_failed` (500).
  - `addParent` refused a self-reference with `{ok:false}` (no code), and answered
    `ok:true` on a MISSING child row (the UPDATE matched 0 rows).
  - Every other door that writes a `component_relation_parent` key — the save engine and
    the doors that ride it (`dd_core_api.save`, MCP `fields_write`, CSV import,
    `tool_propagate_component_data`), the Time Machine `apply_value` (of a component, of a
    whole record, of a deleted record — the undelete), the bulk revert, the archive
    restore and the record duplicate (`duplicateSectionRecord`: the clone copies the
    source's parent key, and a stale link naming the id the counter mints for the clone
    closes a loop through it) — performed no cycle check at all: the payload was stored.
  - The parent/order key rewrites read the key UNLOCKED and wrote the whole key back, so a
    concurrent commit on the same key (a second move of a multi-parent node, a curator's
    parent-field insert, the node's order under its OTHER parent) was silently reverted.
  - The tree doors (`add_child`, `update_parent_data`, `save_order`) wrote the parent
    link, the sibling order and `add_child`'s defaults RAW past the record-write
    chokepoint: no modified stamps (dd197/dd201), no Time Machine row, no derived index,
    no observer/ledger entry. PHP saved every one of these keys through
    `component->save()`.
- **Shape after — landed with this entry (lane 3):**
  - `update_parent_data`: the pre-transaction check stays as a fast refusal with the same
    answer. The authoritative check is `moveParent`'s LOCKED walk inside the transaction:
    the child row `FOR UPDATE`, the new parent and every ancestor of it `FOR SHARE`, so a
    racing move waits and walks the version the other committed. A race that would close
    a cycle answers **`tree.cycle` (409)** — directly, or after the deadlock victim
    (40P01) is re-run by the tree transaction (`src/core/ts_object/tree_locks.ts`). The
    in-transaction refusal is `tree.cycle` (409), never `tree.node_write_failed`.
  - `add_child`: a new node that would close a loop through a stale link answers
    **`tree.cycle` (409)** (was `tree.node_write_failed`); the creation rolls back.
  - Retries exhausted on a deadlock: `tree.node_write_failed` (500), the 40P01 kept as
    the logged cause (a dedicated retryable code is an open follow-up).
  - `addParent` (engine API, not a wire door) answers a boolean: a self-reference or a
    descendant parent THROWS `tree.cycle`; a missing row or a duplicate answers `false`.
  - Every parent.ts mutation, and its write `persistTreeKeys`, refuses outside a
    transaction (`internal.invariant`): `persistTreeKeys` whatever it is given (an
    empty write set too), every other mutation at its first locked read (the
    `matrix_write` lock primitives refuse there, an empty sibling batch included). The
    read half (`getParents`, `getParentsRecursive`, `isAncestor`, `getChildrenOfType`)
    runs anywhere.
  - A move whose `from` link is no longer stored (a concurrent move of the same node
    from the same parent committed first) is refused and rolled back whole
    (`tree.node_write_failed`, cause `Remove old parent locator failed`): it never turns
    into an add, so the node never ends up under both targets (the answer is unchanged;
    under the lock the second move now SEES the first one's commit).
  - Only links the write ADDS are checked: a curator can still cut an existing loop, and
    add links that do not touch it.
  - The record DUPLICATE (`dd_core_api.duplicate`, MCP, every caller of
    `duplicateSectionRecord`): the clone's insert and its cycle check (`birth` — every
    copied link counts as added) run in ONE short transaction; a clone that would close a
    loop answers **`tree.cycle` (409)** and is not stored (the row and the counter roll
    back; nothing addressed by the id exists yet — media and history follow the commit).
    Frame targets re-minted before the insert stay, unreferenced, as after any failure
    at that step.
  - THE TREE-MOVE OBLIGATION (converges on PHP, not a divergence): every tree key write
    goes through `parent.ts` `persistTreeKeys` → `persistRecordKeys` (value + dd197/dd201
    stamps + derived index in one UPDATE, the post-write hook, the observer ledger) and
    `recordKeyChangeRows` (one Time Machine row per changed key, lg-nolan door lane, cut
    from the key's before-image that `persistTreeKeys` reads itself under the row lock),
    in the tree transaction. `add_child`'s defaults (`is_descriptor`, `is_indexable`,
    `ontology7`) are one such write, stamped and historied by the actor. A move writes the child's parent key ONCE (`moveParent`: old link
    out, new link in — PHP's one `save()`), so its history never holds a parentless
    intermediate state. An unchanged sibling order writes nothing.
- **Shape after — the record-write hook (landed in the SAME commit as this entry):**
  - **Every other door** that writes a `component_relation_parent` key refuses a
    cycle-forming payload with `tree.cycle` and stores nothing, through ONE check at the
    record-write chokepoint: `assertParentLinkKeysAcyclic`, run by `record_write.ts`
    `writeKeys` / `persistAppendedKeyItems` (key writes) and `persistRecordColumns` /
    `persistRecordBirth` (whole-record writes; a birth checks every stored link as added)
    inside the writer's transaction, AFTER its row lock. A parent key on `writeKeys`'
    transaction-less fast path (no observed and no indexed key — `component_relation_parent`
    is neither) is checked too: the hook opens the transaction there, so a harmless link
    still lands and is never refused as `internal.invariant` (C8). Doors (= C6 `DOORS` + C3b `RACE_DOORS`): the save engine, the core API
    save, MCP `fields_write`, CSV import, `tool_propagate_component_data`, the children
    write-through (its own pre-check is an UNLOCKED memoized `isAncestor`; the hook is
    its locked check — C3b), and the Time Machine `apply_value` of a component, of a whole
    record and of a deleted record (the undelete).
  - **The bulk revert** is a PER-ROW door: a unit whose revert would close a cycle is
    refused by the same hook and rolled back alone, the run goes on, and the unit is
    reported in `skipped[]` as `{reason: 'failed', code: 'tree.cycle', section_tipo,
    tipo, section_id, lang?}`. NEW wire key: every LOCATED `failed` entry (one that passed
    the scope gate, so it already carries coordinates) carries `code` — the converter's
    wire code of the error that failed the unit (`toErrorBody(toDedaloError(e)).code`;
    `internal.unexpected` for an untyped throw). It rides both kinds of unit: a key
    revert (C6 `tm.bulk_revert`: `tree.cycle`) and the delete of a record the run
    created (`bulk_revert_undo_native` D2: a born record whose section the ontology no
    longer declares answers `section.no_matrix_table`). An unlocated `failed` entry stays
    `{reason}` alone (SEC-16, `WC-2026-09-03-bulk-revert-skipped-typed-entries`). The
    closed `reason` vocabulary is unchanged; the client still counts by `reason`.
  - The archive restore (`src/core/archive/restore.ts` `writeRecordRow`: raw
    `insertMatrixRecordWithExplicitId` + `updateMatrixRecord` past the chokepoint) is NOT
    closed by the hook: it refuses the same way once its PENDING owner step lands — the
    ARCHIVE obligation of `write_obligations_tripwire` (archive door →
    `persistRecordColumns`/`persistRecordBirth`), which routes it through the hook's
    `replace`/`birth` checks. Listed `KNOWN_OPEN` (`archive.restore`) until then; the census
    turns red the day it closes, so the entry cannot outlive the fix.
  - **Writers that store a parent link past every check, said out loud** (C9 `unchecked`,
    count pinned): the birth INSERT's `properties.dato_default` (no ontology declares one
    on a `component_relation_parent`), install-time hierarchy provisioning and ontology
    definition rows (`hierarchy_provision`, `ontology_write`), the release thesaurus and
    ontology imports by psql `\copy` (`hierarchy_import`, `data_io_import`) and the
    `portalize` update transform. "Every door" in the title means every curator door;
    these are not, and C9 keeps the list complete by derivation.
  - The integration condition (met): this entry, `parent.ts`, `ts_api.ts` and the
    changelog fragments landed in the SAME commit as the hook and the bulk revert `code`
    key.
- **Reason:** a stored cycle breaks every ancestor walk of the thesaurus (a node renders
  under itself, the diffusion of `parents` recurses into a loop). A heritage hierarchy must
  be acyclic whatever door a curator uses, and a lost broader term is silent data loss.
- **Gate reconciliation:** no parity gate or oracle fixture carries a racing move, an
  in-transaction cycle or a cycle-forming save, so no fixture edit and no re-harvest. The
  single-request `update_parent_data` cycle refusal is unchanged on the wire
  (`ts_mutations_differential` / `ts_mutations_hardening` stay green). Gates:
  `test/unit/tree_parent_lost_update_native.test.ts` (CORE-3: L1–L10),
  `test/unit/tree_cycle_race_native.test.ts` (ONT-5: C1, C3, C3b, C4–C8 + the door
  census C6; its shrink-only `KNOWN_OPEN` — pinned size, and every door declared either
  there or in `PROVEN_CLOSED` — lists the one door that waits on the archive owner step; C9 derives every matrix writer — each `matrix_write` DML call site
  and psql seed of the write-path corpus — and requires it classified: probed by a door,
  unable to add a parent link, or `unchecked`), `test/unit/tree_door_retry_native.test.ts` (the 40P01 retry of `add_child` and
  `save_order`), `test/unit/tree_obligations_native.test.ts` (the tree-move obligation),
  `test/unit/parent_hierarchy_write_native.test.ts`,
  `test/unit/ts_api_mutations_native.test.ts`,
  `test/unit/bulk_revert_undo_native.test.ts` (the born-record `code`) and the
  `tm_bulk_revert` / `bulk_operation_atomicity_native` exact `failed` entries.
