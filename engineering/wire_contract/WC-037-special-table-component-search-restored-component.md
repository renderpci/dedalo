# WC-037 — special-table component search restored: component_json searchable + dd15 Time Machine component search

- **Date:** 2026-07-17 (audit: "check every component in Activity (dd542) and
  Time Machine (dd15) is search-capable, including operators").
- **Context:** two special tables broke component search. (1) `component_json`
  had NO TS search builder — `conform` threw "declares no searchBuilder family",
  so Activity's *Data* (dd551) and every JSON component were unsearchable.
  (2) `matrix_time_machine` (dd15) stores each component in a flat PHYSICAL
  COLUMN (id/section_id/bulk_process_id/`timestamp`/user_id/tipo/section_tipo/
  data), not a tipo-keyed jsonb column; `buildTmWhere` ignored every component
  clause and returned ALL rows. PHP has the twins (`search_component_json` +
  the five `search_*_tm` traits); this ports them.
- **Shape before (PHP):** json search navigates `$.<tipo>[*].value.**` with a
  `like_regex` (case-insensitive, accent-SENSITIVE); the `_tm` traits emit
  column-direct SQL (LIKE case-SENSITIVE for string/data, exact for scalar
  tipo/section_tipo, integer comparisons for number, `user_id` scalar equality
  for relation, `timestamp` ranges for date).
- **Shape after (TS):** `component_json` gains `searchBuilder:'json'`
  (`builders/builder_json.ts`) over the `misc` column — the recursive `.value.**`
  is expressed as `f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)` (value stays
  a BOUND param, never embedded in the jsonpath). dd15 gains a component
  conformer (`resolve/tm_filter.ts`, wired into `buildTmWhere`) emitting
  physical-column `$N` SQL per kind. TWO deliberate divergences: (a) text
  matching is accent-insensitive (`f_unaccent`) and case-insensitive (`ILIKE`) —
  a safe superset of PHP's case-only fold that never HIDES a match; (b) date
  columns use the WC-036 whole-period operator span (PHP `_tm` left directional
  operators unimplemented).
- **Why:** functionality — a component whose search silently returns everything
  (or throws) is a defect. Same posture as WC-012 / WC-014 / WC-036.
- **Gate reconciliation:** no differential reds — no parity gate exercises a
  json/TM component search. `descriptor_completeness_tripwire` updated in this
  commit (component_json removed from LEDGERED_UNSEARCHABLE; the `json → misc`
  family-column mapping added). TS ground truth pinned in
  `test/unit/search_json_builder.test.ts` (json envelope + operator grammar) and
  `test/unit/tm_filter.test.ts` (per-kind physical-column SQL, operators,
  AND-combination, unmapped-tipo throws). No re-harvest needed.
