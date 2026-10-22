# WC-2026-10-22-tm-scope-whole-request — one Time Machine scope per request; principal-gated `config.time_machine_list`

- **Date:** 2026-10-22 (owner report: a regular user holding the §7.4 `time_machine_list` grant got
  `perm.denied` on the inspector *Latest changes* / *Component history*). Amends
  `WC-2026-08-14-tm-permission-floor` and `WC-2026-08-14-tm-scope-server-owned`.
- **Decision:** DEC-12 (gated: `test/unit/tm_inspector_access_native.test.ts`,
  client `test_inspector_tm_access`).
- **Shape before (TS):**
  - `read` with `sqo.mode:'tm'` — the TM scope (the caller section a dd15 read is FOR) was opened
    only inside `readSection`, AFTER the handler's Gate A. Gate A asks
    `getPermissions(principal,'dd15','dd15')`, the dd15 floor, which reads that scope: unscoped, it
    answers 0 for every non-admin. Every non-admin was refused (`403 perm.denied`) WITH the grant;
    the §7.4 admission gate (`gateTimeMachineRead`) was never reached.
  - `count` with `sqo.mode:'tm'` never ran the §7.4 gate: anyone with read on the caller section got
    the history row total (`200 {total}`) that the read refuses.
  - `getTimeMachineListTipo` saw only DIRECT section children, while the grant walk
    (`getGrantChildrenTipos`) is recursive: a `time_machine_list` under a `section_group` was granted
    in the profile and invisible to the gate.
  - Section context: `config` = `{relation_list_tipo}`; nothing told the client whether the user may
    read the history, so the inspector always drew both blocks and fired the dd15 read.
- **Shape after (TS):**
  - `read` and `count` open ONE TM scope around the whole handler body (`withTimeMachineReadScope`,
    `section/list_definitions/time_machine_list.ts`): Gate A's dd15 floor, Gate B, the §7.4 gate and
    the per-ddo floor judge the same caller section. A grant holder is served (`200`); a user without
    the grant gets `403 perm.denied`; a mixed-section SQO opens the scope with no section and stays
    admin-only (`403` for everyone else). No Gate A special case for dd15.
  - `count` runs `gateTimeMachineRead` — the same decision as `read`.
  - `getTimeMachineListTipo`: direct child first (a virtual section's own node), else the first
    `time_machine_list` the grant walk reaches under the real section.
  - Section context: `config` = `{relation_list_tipo, time_machine_list}`. `time_machine_list` is the
    section's `time_machine_list` tipo when `canAccessTimeMachineList(principal, section)` (the gate's
    own question), else `null`; a global admin on a section with no such node gets the section tipo
    (the gate admits an admin regardless — the value is a trigger, not a tipo the client resolves).
    No principal → `null`. Stamped per call, per principal (the stamp half; never cached).
- **Client:** `render_inspector.js` draws the two history blocks only on a non-null
  `config.time_machine_list` (no block, no dd15 request). A block whose dd15 instance fails to build
  renders one quiet muted line (`.inspector_block_failure`, request_id in the tooltip) and never
  `render()`s the failed instance — it used to paint the page-level no-access panel inside the block.
- **Reason:** the grant exists so non-admins can read a section's history; the handler refused what
  the gate admits, and the count answered what the read refuses.
- **Gate reconciliation:** TS-only. No oracle interaction asserts a non-admin TM read or a count
  refusal; `config` is compared field-wise (`relation_list_tipo`) by
  `section_context_extras_differential` / `start_differential`, so the added key needs no re-harvest.

## Addendum 2026-10-22 (review r0) — the rows are confined to the caller's record scope

- **Shape before (TS):** the §7.4 grant that admits a non-admin TM `read`/`count` is
  SECTION-wide, and the TM read source (`resolve/read_tm.ts`) ignored the principal. A grant
  holder whose projects exclude record R pinned R (`filter_by_locators`) or opened the snapshot
  list (`filter` `tipo` = section) and got R's past values and whole-record snapshots (`200`), and
  a `count` of them — while the ordinary read of R is hidden by the projects filter.
- **Shape after (TS):** for a non-admin, the TM where is confined through THE scope door
  (`security/record_scope.ts` `scopedRows`: the section read grant, then the assembler's own
  per-record predicate), the read and the count alike (`scopeTmWhere`). An out-of-scope pin answers
  no rows and `count` 0 (`200`, silent — the list rule: no "n hidden" existence oracle); the snapshot
  list holds only in-scope records. A DEAD record (deleted, no live row to judge) is outside every
  non-admin's scope: its history and its snapshot (the undelete surface) stay global-admin only. A
  where not confined to one section (bare browse, conformed dd15 filter) is refused (`perm.denied`)
  for a non-admin a second time, below the §7.4 gate. Global admins and principal-less system
  callers are unscoped.
- **Reason:** a door that reads a record holds the record scope as well as the pair; the projects
  filter is the read boundary every other record door applies (AUTHZ-01/02/05).
- **Gate reconciliation:** TS-only. `tm_inspector_access_native` legs 5–6 (out-of-project pin,
  mixed pin list, snapshot list count == rows, dead record; virtual section, no-node section,
  mixed-section count). No fixture or re-harvest.
