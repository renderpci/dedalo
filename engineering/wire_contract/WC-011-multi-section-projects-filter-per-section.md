# WC-011 — multi-section projects filter is PER-SECTION (PHP filters by the first section only, fail-open)

- **Date:** 2026-07-09 (found while fixing BUG-0, the autocomplete picker
  routing; security review ran on the Opus pass).
- **Shape before (PHP):** `trait.where.php build_sql_projects_filter` scopes to
  `$this->main_section_tipo` — the FIRST entry of `sqo->section_tipo` — only
  (:743-744), resolves ONE `component_filter` tipo from that section
  (:849-866), and `build_union_query` (class.search.php:1048-1065) is a pure
  FROM-table `str_replace` that copies that single clause verbatim into every
  UNION branch. Consequences for a NON-ADMIN multi-section search:
  - first section UNGATED → the `return` at trait.where.php:857-864 emits NO
    filter at all → every gated non-first section returns UNFILTERED
    (**fail-open cross-project enumeration — a live PHP defect**);
  - filter tipos differ per section → non-first rows are checked against the
    first section's JSONB key → wrongly excluded (fail-closed functional bug).
- **Shape after (TS):** `buildMultiSectionProjectsFilter`
  (`src/core/search/sql_assembler.ts`) emits one disjunct per searched section
  — `(alias.section_tipo = $X AND EXISTS(<own filter tipo>…))` for gated
  sections, a bare `alias.section_tipo = $Y` guard for ungated ones — placed
  before the UNION rewrite so it self-selects per branch and per-row in
  same-table `section_tipo IN (…)` queries. Returns `''` when no searched
  section is gated (byte-identical to the ungated case). Single-section
  searches keep the byte-parity `buildProjectsFilter` clause. This replaces
  the Phase 5c fail-closed throw (which also broke non-admin multi-section
  `count`) — the autocomplete picker over multi-target portals now works for
  non-admins, correctly scoped.
- **Why:** restoring parity here would port a cross-project enumeration hole;
  the per-section form converges to the ACL PHP intends record-by-record.
  Same strictly-safer class as WC-010 / the AUTHZ-05 guard.
- **Gate reconciliation:** no differential reds — the pre-existing
  `projects_filter_differential` single-section cases assert TS-vs-DB ground
  truth (unchanged, byte-parity clause), and its NEW multi-section cases
  (incl. the fail-open guard: ungated section FIRST must still scope the gated
  one to 103 project-7 records, not 15k) deliberately assert TS ground truth,
  NOT PHP equality — running the ungated-first shape against live PHP would
  reproduce the leak. SQL-shape pins: `test/unit/
  search_projects_filter_multisection.test.ts`.
