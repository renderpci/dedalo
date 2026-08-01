# WC-045 — Append-only log search-field restriction: section-info group (dd196) omitted for Activity (dd542) + Time Machine (dd15) (2026-07-21)

The edit-mode search "FIELDS" panel (`dd_core_api::get_section_elements_context`
→ `buildSectionElementsContext`, `src/core/resolve/section_elements_context.ts`)
appends the shared **section-info group `dd196`** (Created/Modified by user +
date, First/Last publication + user) to every section that has its own elements,
shown to global admins (PHP class.common.php:3870-3877). On an append-only log
that editorial metadata is meaningless as a search dimension, so TS omits the
`dd196` group (and its children) from the field list of two sections, both held
in the `dd542`-/`dd15`-scoped `SUPPRESS_SECTION_INFO` set:

- **Activity (`dd542`)** — DELIBERATE wire-shape divergence from PHP, which
  offers `dd196` to admins. Same policy family as WC-044 (dd542 list-sort
  restriction, same day).
- **Time Machine (`dd15`)** — PHP-PARITY RESTORATION, not a divergence: PHP
  explicitly empties `section_info_elements` for
  `DEDALO_TIME_MACHINE_SECTION_TIPO` (class.common.php:3759). The TS port's
  "appended to every non-TM section" comment always intended this, but the guard
  was never implemented — dd15 was wrongly getting `dd196` + children. Adding it
  to the set makes the code match its comment and PHP.

The section's existing exclusion knob is **model-keyed only** (`DEFAULT_EXCLUDE`
/ client `ar_components_exclude`) and cannot express this: `dd196`'s children are
date/relation models — the same models as legitimate fields (activity's When
`dd547` is a date, Who `dd543` a relation), so no model rule drops them without
collateral. Hence a section-tipo-scoped suppression of the group append,
server-side. The real fields and the section entry are unchanged; every other
section still gets `dd196`. (Neither `dd542` nor `dd15` is in
`section_elements_context_differential`'s `SECTIONS` corpus, so no oracle rows to
reconcile.)

### Gate

`test/unit/activity_search_fields.test.ts` — `dd542` and `dd15` field lists each
exclude `dd196` and every `parent==='dd196'` child while including the section's
real components; scope control asserts a second section (`dd128`) still carries
`dd196` for the same global-admin principal.
