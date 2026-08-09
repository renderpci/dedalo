# WC-2026-08-09-indexation-grid-read-grant-scope — the thesaurus indexation grid also requires the SECTION READ GRANT (PHP filters by user projects only)

- **Date:** 2026-08-09 (audits/2026-08_oh1_beta REPORT §5.4, WS-G1).
- **Decision:** DEC-15 (deliberate divergence). Same strictly-safer class as
  WC-010 and WC-011.

## Context

The indexation grid (`dd_core_api` → `src/core/section/indexation_grid.ts`) is a
USER-FACING door over `findInverseReferenceLocators`, a scan that runs unscoped
by design. The audit found the grid re-implementing the AUTHZ-05 boundary
privately, with `isRecordInScope` alone. The fix routes it through the one
shared implementation, `scopeInverseReferenceHits`
(`src/core/security/record_scope.ts`).

That helper checks BOTH halves of the rule — the section READ GRANT
(`getPermissions(principal, section_tipo, section_tipo) >= 1`) and the per-record
PROJECTS filter (`isRecordInScope`). The PHP grid checks only the second. The
wave-1 note that called this "a parity restoration" was wrong on this half, and
this entry replaces it.

- **Shape before (PHP):** `core/dd_grid/class.indexation_grid.php`
  `get_ar_section_top_tipo()` groups every inverse locator by
  `section_top_tipo` / `section_top_id`, then — for a non-global-admin only —
  drops a `section_top_id` whose `component_filter` data shares no project with
  `component_filter_master::get_user_projects($user_id)`
  (`locator::in_array_locator` on `section_id` + `section_tipo`). There is NO
  read-grant check anywhere in the class. Two consequences on live data:
  - a section_top whose real section has NO `component_filter` child is
    `continue`d — the whole group survives UNFILTERED;
  - a user with permission level 0 on `oh1` (or on any projects-exempt section:
    `matrix_hierarchy`, `matrix_dd`, `matrix_list`, `matrix_langs`) still gets
    the group's caption, its `indexation_list` columns and its resolved cell
    values, because being inside the projects is the only question asked.
- **Shape after (TS):** `scopeIndexationGroups` calls
  `scopeInverseReferenceHits(hits, principal)`. A `section_top` group survives
  only when the caller holds read level >= 1 on that section AND the record is
  inside their projects filter. A group emptied by the filter is dropped
  entirely rather than emitted as a captioned husk (a husk is an existence
  oracle for a section the caller cannot read). Global admins are unscoped,
  exactly as in PHP.
- **Reason:** on the projects-EXEMPT tables the projects filter answers "yes"
  for every authenticated user by construction, so the read grant is the only
  defence that exists there and PHP never asked for it — a level-0 user read
  row content off a thesaurus term's grid. Restoring parity here would mean
  porting that read leak into the engine that is now the only writer and reader
  of this archive. The boundary must also be decided in ONE place: a grid that
  re-derives "may this caller see this record hit" is the failure mode the
  audit found, and the shared helper is the answer to it — accepting the helper
  means accepting both of its halves.
- **Blast radius:** only a NON-ADMIN loses rows, and only rows in a section
  they hold no read grant on. A non-admin who holds the grant sees exactly what
  PHP served them (the projects half is unchanged). Admins are unaffected.

## Gate reconciliation

- `test/unit/indexation_grid_tc_native.test.ts` — the `AUTHZ-05` describe block
  pins the divergence behaviourally against real principals of the test DB:
  the premise test asserts the exploit shape still exists (read grant 0 on
  `ad1` + `isRecordInScope` true), and the next test asserts the row is gone.
- `test/unit/security_audit_2026_07_23_tripwire.test.ts` — the AUTHZ-05 door
  REGISTRY: every caller of the unscoped inverse scan is classified, and a new
  caller fails the gate until it is. The grid is registered as a scoped door
  there.
- **No parity red, and NO re-harvest.** `test/parity/
  indexation_grid_differential.test.ts` runs its grid comparisons as
  `userId -1, isGlobalAdmin true`, which both engines leave unscoped; its one
  non-admin case asserts the pre-grid `permissions_denied` envelope, which this
  change does not touch. The frozen oracle store carries no non-admin grid
  fixture, and there is no live oracle left to diff against.
