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
  - **Who may trigger a projection (closure r0, 2026-10-21).** Writing a record's CONTENT into
    the live dd_ontology is developer-only, as the explicit door is (tool_ontology
    `set_records_in_dd_ontology`: declared `developer`, asserted in the handler). The
    lifecycle is reached by plain section grants (TM undelete `apply_value`, bulk revert
    `bulk_revert_process`, any delete door), so its CONTENT branches — a governed undelete's
    re-projection, an override's re-parse on delete / delete_data / undelete — run only for a
    developer principal. **No principal fails CLOSED (closure r1):** an event outside any
    request scope (the stdio MCP surface, a script) or in an unauthenticated one is not a
    developer — there is no implicit "system"; the system flows (installer, ontology update,
    seed compiler) re-derive whole tlds through rebuildOntology, which is not principal-gated.
    Anyone else's event commits the record change and writes no node
    content: the node stays as a developer last projected it, and inspectOntology reports
    the record as `missing` (governed undelete) or `stale` (override) drift for tool_ontology
    to resolve; the lifecycle answers `skipped` ("projection is developer-only") with a
    server warning. A governed **delete / delete_data** still removes the node for every
    principal: removing the node of a record that no longer exists is not content (D3).
  - **Concurrency.** Every door that derives a tld's nodes — rebuildOntology, retractOntology,
    the registry activation (syncOntologyActivation), the per-record projectOntologyNode /
    unprojectOntologyNode and this lifecycle — takes the tld's transaction advisory lock
    (`pg_advisory_xact_lock(17580003, hashtext(<tld>))`, dd_ontology.ts lockOntologyProjection)
    before its first read: a rebuild and a delete / undelete of the same `<tld>0` record are
    ordered, so node presence follows record presence. A door whose write depends on "is the
    tld active?" re-asks it under that lock, read live (closure r1): the activation decides
    active / in sync and re-plants `<tld>0` in ONE locked unit, and its re-derive of a drifted
    tld runs `onlyIfProjected` — so an activation racing the teardown (retract, then registry
    row, then records: separate units) never re-plants a torn-down tld. The rebuild heals a
    lagging id sequence in its own short transaction BEFORE taking the lock (a table lock held
    across the lock wait would deadlock against a lifecycle unit).
  Response shapes unchanged.
- **Reason:** `dd_ontology(tld)` equals the parse of `matrix_ontology(<tld>0)`; a node whose
  source record is gone (or a record with no node) is drift the runtime serves.
- **Gate reconciliation:** TS-native `test/unit/ontology_record_lifecycle_native.test.ts`
  (L1–L10: L1b/L9c/L4 prove the projection is inside the unit — visible in it, gone with
  its rollback; L9b the override wipe; L11 the developer-only content rule, with the
  developer control; L11f no principal — no scope / unauthenticated — writes no content) and
  `test/unit/ontology_projection_race_native.test.ts` (R1–R5: a rebuild / per-record
  projection / teardown interleaved with a delete or undelete; R6a/b the activation, in sync /
  drifted, and R7 `onlyIfProjected`, interleaved with the retract; R0 the lock's
  outside-transaction refusal). No parity gate replays a delete of an ontology record; no re-harvest.
