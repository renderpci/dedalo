# WC-2026-10-23-own-lock-cleanup-ungated — own-lock cleanup needs no section read; read-only Time Machine lists send no lock-state request

- **Date:** 2026-10-23 (owner report: a regular user holding a section's §7.4 `time_machine_list`
  grant paginated the inspector *Latest changes* list and got `403 perm.denied` from
  `dd_utils_api::update_lock_components_state`, `section_tipo: 'dd15'`). Follows
  `WC-2026-10-22-tm-scope-whole-request`.
- **Decision:** DEC-12 (gated: `test/unit/lock_cleanup_read_gate_native.test.ts`, client
  `test_section_lock_cleanup`).
- **Shape before (TS):**
  - Server: `update_lock_components_state` ran the section read gate
    (`getPermissions(principal, section_tipo, section_tipo) >= 1`) for EVERY action, including
    `delete_user_section_locks` — which only deletes the caller's own lock rows
    (`user_id = principal`). A bare `dd15` is admin-only, so a non-admin's cleanup for `dd15`
    answered `403 perm.denied`.
  - Client: `section.navigate()` sent `delete_user_section_locks` on every pagination, also from a
    read-only Time Machine list — the inspector's embedded dd15 lists and the tool_time_machine
    list (`tipo: 'dd15'`, `sqo.mode:'tm'`), which hold no lock.
- **Shape after (TS):**
  - Server: the read gate runs for every action EXCEPT `delete_user_section_locks` (named, so an
    unknown action stays gated, fail-closed). `focus` / `blur` are gated as before (`403
    perm.denied` without read). `section_tipo` is still required for every action (`400
    request.invalid_options`). Answer for the ungated cleanup: `200`, `data: true`, extension keys
    unchanged. It deletes only the caller's rows in that section, plus the global expired-row GC
    (not section-scoped, already run by any readable section's navigation; removes only locks
    every reader treats as released).
  - Client: `section.navigate()` sends no lock-state request when `holds_component_locks(self)` is
    false — `rqo.sqo.mode` / `request_config_object.sqo.mode` is `'tm'`, or the instance sits on a
    Time Machine surface (`is_time_machine_view`: a dd15 section or caller, `data_source:'tm'`, a
    `matrix_id`). `page.js` lock callers are unchanged: focus / heartbeat / beacon follow an EDIT
    component (a TM list renders none), and the page-level menu navigation is a page element, never
    an embedded list.
- **Reason:** the read gate exists so a user cannot fabricate lock state on records they cannot see
  (`focus` acquires, `blur` names a record). Deleting one's own rows creates nothing and cannot touch
  another user's live lock; gating it protected nobody and refused a surface that holds no lock.
- **Gate reconciliation:** TS-only (no oracle interaction asserts a refused cleanup; no re-harvest).
  `security_fail_closed` L4 (missing `section_tipo` → `400`) unchanged and green.
