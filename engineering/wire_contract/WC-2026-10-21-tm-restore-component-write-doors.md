# WC-2026-10-21-tm-restore-component-write-doors — a bulk revert judges every re-linked cascade target on its OWN scope; apply_value asks the write door for the main and every slot it writes

- **Date:** 2026-10-21 (W4 cross-write:r2, review-diff findings "bulk revert undeletes a
  cascade target with no record-scope check when a referencing unit links it" and
  "apply_value writes or empties dataframe slot tipos on the main component's grant
  alone"). Amends `WC-2026-09-27-bulk-revert-undo-log` §2.5 ("a REFERENCING unit's scope
  gate stands for the target's" — withdrawn).
- **Decision:** DEC-12 (gated: `bulk_revert_cascade_target_scope_native`,
  `tm_apply_value_slot_grant_native`).
- **Shape before (TS):**
  - `bulk_revert_process`: a unit that re-linked a deleted cascade target undeleted it
    WITHOUT judging the target's record scope (the referrer's gate "stood for" it). A
    level-2 user scoped to project P1 brought back a P2 record by reverting a revert that
    touched an in-scope referrer; the unit answered done.
  - `apply_value` (component restore): gated only by the declarative `tipo` gate on the
    (section, MAIN) raw pair; every dataframe slot of the main was rewritten or emptied
    with no grant asked for it.
- **Shape after (TS):**
  - `bulk_revert_process`: EVERY undeleted record — a target a unit links directly, the
    unit's own record, a nested child — is judged on its own restored row inside the
    unit's transaction. Out of scope refuses the unit: one `skipped[]` entry
    `{reason: 'out_of_scope'}` (never located — SEC-16), the undelete and the re-link
    rolled back together, the target stays deleted.
  - `apply_value`: the main asks the write door (`authorizeRecordAccess`, write, level 2,
    section floor 1, dd128-aware pair, write scope — door `tool_time_machine.apply_value`)
    before the restore; every slot the restore actually WRITES asks the same door inside
    the transaction, before any slot is written. A refusal is the door's `perm.*` error
    (an `ok:false` envelope, code `perm.insufficient_level` / `perm.out_of_scope`); nothing
    is written. A slot the restore leaves as it is is never asked. A non-positive
    `section_id` is now refused by the door for every caller (before: skipped by the
    scope check, refused later as `request.invalid_options` only when no TM row matched).
- **Reason:** a locator in A says nothing about B's projects, and a dataframe slot is a
  component with its own grant: the single-row door was strictly weaker than the bulk
  door and the human save door for the same write.
- **Gate reconciliation:** TS-only (the TM restore doors have no oracle shape; no fixture
  or re-harvest). The two native gates above build their situations on scratch `zzbcs` /
  `zztav` TLDs with the ACL identity fixture, each with an in-scope / writable CONTROL.
