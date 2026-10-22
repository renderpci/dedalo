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

> **SUPERSEDED** by the *owner decision* addendum below (same day): the projects confinement this
> addendum describes was removed. Kept as history.

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

## Addendum 2026-10-22 (review r2) — a replayed component is judged on its own pair

- **Shape before (TS):** the dd15 floor (`security/permissions.ts` `ruleOrderGrant` →
  `timeMachineReadFloor`) answered read for EVERY dd15 coordinate once the §7.4 grant on the
  caller section held, before any component lookup. Every dd15 column — including the ones that
  REPLAY a caller-section component — inherited the section-wide grant: the component surface's
  value column (tipo from `filter_by_locators[0].tipo`, client-chosen), the snapshot list's
  `section_list` columns, a client-sent `show.ddo_map` column, and the inspector record block's raw
  `dd1574` cells. A grant holder at level 0 on component C of X got every past value of C (`200`).
- **Shape after (TS):** the floor takes the tipo. For a non-admin inside a §7.4-admitted scope, a
  Time Machine OWN column (`isTimeMachineOwnColumn`: a dd15 node by ontology ancestry, or the
  `rsc329` annotation) is read; any other tipo is a replayed component of the caller section and
  is read only when `canReadTimeMachineValue` holds — `getPermissions(principal, X, C) ≥ 1`, the
  pair the live record read asks. A failing column is dropped from the data AND the dd15 context
  (`buildTmContext` runs the same gate). The `dd1574` column stays (a dd15 node), but each CELL is
  judged on the pair of the component its row recorded (`row.section_tipo`, `row.tipo`): an
  unreadable one is emitted empty — the row keeps who/when/what. Global admins and principal-less
  internal resolutions are unchanged.
- **Reason:** the read-door law — a value is served on section grant AND component grant on its
  real coordinates; the §7.4 grant authorises the history, never a field the profile withholds.
  A 'rule' basis is never extended to other coordinates (`GrantBasis`).
- **Gate reconciliation:** TS-only. `tm_inspector_access_native` "the component pair" legs (a
  level-0 component on the component, client-sent column, inspector record and snapshot surfaces;
  admin controls read it; readable controls still serve; context never advertises it). No fixture.

## Addendum 2026-10-22 (owner decision) — the §7.4 grant, not the projects filter, scopes the history

Supersedes the r0 addendum. Binding owner decision: *if the user has access to the Time Machine
tool, the user can read the history of the record, the same way they see the Time Machine; the
history is the changes of the record, so filtering it by the user's projects makes no sense.* The
inspector sends `skip_projects_filter: true` by design.

- **Shape before (TS, r0):** a non-admin's TM where was confined through `record_scope.scopedRows`
  (`scopeTmWhere`, `resolve/read_tm.ts`): a grant holder whose projects excluded record R got no
  rows and `count` 0 for R's pins and R's snapshot; a DEAD record's history and its snapshot (the
  undelete surface) were global-admin only.
- **Shape after (TS):** no record-scope confinement of TM rows or counts. A §7.4 grant holder reads
  the history of every record of the scoped section — outside their projects and deleted alike —
  and the whole snapshot (undelete) list (`200`); `count` equals the rows served (read and count
  build the same where). No grant → `403 perm.denied`. KEPT: the bare dd15 browse and an unscoped or
  mixed-section TM read stay global-admin only (`gateTimeMachineRead` + the unscoped dd15 floor);
  the r2 per-(section, component) column check (a level-0 component is withheld in the history as in
  the TM tool's field permissions; raw `dd1574` cells emptied per row); Gate A/count judged in the
  TM scope; embedded refusals panel-local.
- **Reason:** the history is the record's changes; the §7.4 grant is the Time Machine permission,
  and the inspector history and the tool must answer the same rows.
- **Gate reconciliation:** TS-only. `tm_inspector_access_native` "the owner rule" legs: grant holder
  reads + counts (== rows, == admin) an out-of-project record, a pin list naming both records, the
  snapshot list (deleted included), a deleted record; no grant → `perm.denied` on all of them;
  unscoped browse and mixed pins → `perm.denied` for a non-admin (admin control served). No fixture.

## Addendum 2026-10-23 (review r1) — the session never widens the admitted scope

- **Shape before (TS):** the §7.4 gate and the TM scope judged the SQO the client SENT; then
  `readSectionRows` ran the session read-back (`mergeSessionSqo`), which fills `filter_by_locators`
  / `filter` the client omitted from `sqoSession[source.tipo]`. A non-admin sending a snapshot-list
  read (`tipo` filter = A, granted) with no `filter_by_locators` inherited stored pins of section B
  (stored by an earlier read under the same `source.tipo` — `dd15`, or a plain read of any section
  used as `source.tipo`) and got B's history rows (`200`) under A's admission; `count` (no merge)
  answered A's total.
- **Shape after (TS):** a `sqo.mode:'tm'` read inherits NO scope-bearing key from the session
  (`filter`, `filter_by_locators`); order/limit/offset still ride it, and persist + the
  `sqo_session` stamp are unchanged. Backstop: inside a scope opened for section S, the TM row query
  and count refuse (`403 perm.denied`) a WHERE whose SQO does not address exactly S (another
  section, mixed pins, the bare browse) — principal-agnostic, fail-closed.
- **Reason:** admission and the WHERE must judge the same SQO; the TM scope is server-owned
  (`WC-2026-08-14-tm-scope-server-owned`).
- **Gate reconciliation:** TS-only (PHP merged every key). `tm_inspector_access_native` "the
  session never widens" legs: stored foreign pins under `dd15` and under a section `source.tipo`
  serve only the admitted section, count == rows; direct read-source backstop leg (foreign pins,
  bare, mixed → `perm.denied`; own pins/snapshot list served). No fixture.

## Addendum 2026-10-23 (review r2) — the unscoped admin browse keeps its saved search

- **Shape before (TS, r1):** the strip applied to EVERY `sqo.mode:'tm'` read. The global admin's
  standalone `dd15` browse (session navigation on; first autoload sends no `filter`) lost its saved
  TM search on reload, and the persist then overwrote `sqoSession.dd15` with the bare SQO.
- **Shape after (TS):** the strip applies only when a PER-SECTION TM scope is open (the client named
  a section) — for every principal, admin included. An UNSCOPED read (scope open, no section; the
  gate admits the global admin only) inherits the stored SQO whole (filter included), so the read
  answers the saved search and `sqo_session`/the stored session keep it. A non-admin (or no TM
  scope) keeps the strip; the bare browse stays `perm.denied` for a non-admin whatever was stored.
- **Reason:** the session must never widen past the admitted scope; an unscoped admin browse has no
  per-section scope to widen, so its saved search is its own navigation.
- **Gate reconciliation:** TS-only. `tm_inspector_access_native`: admin bare browse + stored filter
  → only the saved section's rows, stored filter not overwritten (unfiltered control spans more);
  non-admin bare browse + stored filter → `perm.denied`; admin per-section read + stored foreign
  pins → the admitted section only. No fixture.
