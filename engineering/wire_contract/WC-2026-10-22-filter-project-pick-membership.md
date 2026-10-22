# WC-2026-10-22-filter-project-pick-membership — a non-admin's NEW project assignment must name one of their own projects

- **Date:** 2026-10-22 (owner decision 2026-10-21, item 2 "dd153 pick", answer (a)). Amends
  `WC-2026-08-14-relation-insert-target-validation` (a fifth constraint, gate 2b).
- **Decision:** DEC-12 (gated: `test/unit/filter_project_pick_native.test.ts`).
- **Shape before (PHP and TS):** the projects-filter family — `component_filter` on a record,
  `component_filter_master` (`dd170`) on a user — offers the actor's OWN projects as its
  checkboxes (every `dd153` project for a global admin, the actor's `dd170` membership for anyone
  else), but the save accepted any `dd153` locator. A forged or stale request from a non-admin
  with write access to the filter could assign the record to a project they are not a member of
  (handing it to that project's members) or, on `dd170`, grant a user a project the editor cannot
  see. Answer: `200`, locator stored.
- **Shape after (TS):** the relation insert door (`relations/save.ts` refuseByPickerConstraint,
  gate 2b `refuseProjectOutsideMembership`) refuses a NET-NEW locator into the projects section
  (`DEDALO_FILTER_SECTION_TIPO_DEFAULT`, `dd153`) on a `resolveData: 'filter'` model when the
  project is outside the actor's scope (`filter_projects.ts resolveProjectsScope` — the same
  constructor the datalist uses). Wire: `400`, `error.code: 'relation.insert_refused'`,
  `error.details: {constraint: 'project_not_member', section_tipo: 'dd153'}`; the save rolls
  back whole (a `set_data` introducing one foreign project stores nothing; no Time Machine row).
  - **Exempt:** global admins (scope `all`); a locator the component ALREADY holds (gate 0 — a
    colleague's project on a shared record survives every save, including a `set_data` replay).
  - **The actor:** the threaded principal, else the request-context one, else the user the save
    is ATTRIBUTED to (`SaveRequest.userId`, threaded by `save_component` as
    `RelationInsertContext.attributedUserId` — gate 2b only). A credless in-repo door is judged
    as the user it records the write under: a non-admin is held to their projects, the superuser
    (imports, fixtures, maintenance) is a global admin. All four value doors carry it — insert,
    `set_data`, update, append import.
  - **Fail-closed:** no identity at all (nothing threaded, no request scope, no attributed user)
    refuses the new assignment.
  - **Not this gate:** removal of a project the actor cannot see (unchanged); any other `dd153`
    link (the project tree's `dd1593` parent, a portal into the catalog) — a relation, not an
    assignment.
- **Client:** no change needed. The checkbox list only ever offers the actor's own projects, so
  the refusal is reached only by a stale page (membership revoked mid-session) or a forged
  request; `component_common.save` routes the envelope through `handle_api_error` — the `'*'`
  policy, a toast labelled `error_relation_insert_refused` — and marks the field `error`/`modified`.
  Residual (generic, every component): after a refused save the local model keeps the change —
  the box stays ticked, marked `error`/`modified`, until the component is re-read.
- **Reason:** the projects filter IS the access-control boundary; an assignment the option set
  could never offer must not be persistable through the API.
- **Gate reconciliation:** TS-only (no oracle interaction asserts a non-member assignment; no
  re-harvest). `relation_insert_target_native`'s filter-editor case now picks between two
  projects the editor belongs to (its premise: "the datalist was built from THEIR OWN authorized
  projects").
