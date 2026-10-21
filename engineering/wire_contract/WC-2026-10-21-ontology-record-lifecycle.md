# WC-2026-10-21-ontology-record-lifecycle — deleting or undeleting an ontology record moves its dd_ontology node with it

- **Date:** 2026-10-21 (audit 2026-09-26, Step 5 ONT-3).
- **Decision:** owner decision D3 (2026-09-30): delete_data removes the node too (PHP parity).
- **Shape before (TS):** every record delete door removed the `matrix_ontology` row and left
  its `dd_ontology` node behind (an `orphaned` node every resolver kept serving); the Time
  Machine undelete put the row back without its node (`missing` until someone ran
  "set records"); an override record (`localontology0`, ontology42) died or came back without
  the node it overrides being re-parsed.
- **Shape after (TS):** inside the record's own transaction (a rolled-back unit takes its
  projection with it):
  - **delete / delete_data** of a `<tld>0/<id>` record removes the node `<tld><id>`
    (PHP parity — PHP's delete removed it);
  - **undelete** (Time Machine restore of a deleted record, bulk revert) re-projects it —
    only into a tld whose root `<tld>0` is projected, never into another tld's namespace (a
    misfiled record's restore succeeds, its node is not written, and inspect keeps naming
    it `foreign`). Any OTHER failure of the re-projection (a grammar or constraint
    `ontology.invalid_node`, which no parse reaches today) aborts the undelete. TS-native:
    PHP's undelete did not re-project;
  - an **override**'s delete / delete_data / undelete re-parses each node it addresses that
    is already projected (the next-lowest override or the canonical record wins); it never
    deletes or creates a canonical node.
  - Not re-projected: create, duplicate, archive restore (PHP parity), and a Time Machine
    data-restore of a wiped record (a save, not a birth — saves stay explicit-project).
  Response shapes unchanged.
- **Reason:** `dd_ontology(tld)` equals the parse of `matrix_ontology(<tld>0)`; a node whose
  source record is gone (or a record with no node) is drift the runtime serves.
- **Gate reconciliation:** TS-native `test/unit/ontology_record_lifecycle_native.test.ts`
  (L1–L10: L1b/L9c/L4 prove the projection is inside the unit — visible in it, gone with
  its rollback; L9b the override wipe). No parity gate replays a delete of an ontology record; no re-harvest.
