# WC-2026-10-21-tm-section-restore-write-door — a whole-record time-machine restore asks the write door for every field it changes

- **Date:** 2026-10-21 (W4 cross-write:r3, review-diff finding "apply_value SECTION branch
  rewrites a whole record (incl. own dd128 profile/admin flags) without the dd128-aware write
  door"). Extends `WC-2026-10-21-tm-restore-component-write-doors` (the component branch) to
  the section branch.
- **Decision:** DEC-12 (gated: `tm_apply_value_section_write_door_native`).
- **Shape before (TS):** `tool_time_machine` `apply_value` with `tipo` = `section_tipo` (a
  whole-record TM row) was gated only by the declarative `tipo` gate on the raw
  (section, section) pair, which names no component. It then rewrote every column of the
  live record. On `dd128` the own-record downgrade never applied: a user-manager (level 2 on
  `dd128` and `dd1725`) restored a whole-record row of their OWN account and wrote its old
  profile (`dd1725`), admin flag (`dd244`) or username (`dd132`) back. On any section, a
  field the caller may only read was rewritten.
- **Shape after (TS):** behind the row lock, before anything is written, every component the
  restore CHANGES on the live record (each key of a written column bag whose stored value
  differs; `relation_search` / `data` / `meta` and the restore's own modified stamps are not
  the caller's) asks the write door (`authorizeRecordAccess`: write, level 2, section floor 1,
  the dd128-aware pair, the write scope — door `tool_time_machine.apply_value`). A refusal is
  the door's `perm.*` error (an `ok:false` envelope); nothing is written, no activity row is
  appended. A key the restore leaves as it is is never asked (the user-manager restoring their
  own record where only the self-editable name changed is served). An UNDELETE (no live row) is unchanged: a record
  lifecycle effect, authorized at the section like a create or a delete.
- **Reason:** a whole-record restore is a write of each field it changes; the single-field
  restore, the bulk revert and the human save door already ask each field's grant (SEC-03).
- **Gate reconciliation:** TS-only (the TM restore doors have no oracle shape; no fixture or
  re-harvest). The native gate builds its situation on the authorization-door fixture
  (the user-manager's own `dd128` record; engine-built `test3` records) with a served
  CONTROL for each refusal.
