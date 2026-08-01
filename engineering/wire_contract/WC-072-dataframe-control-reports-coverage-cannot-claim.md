# WC-072 — `dataframe_control` reports COVERAGE, and cannot claim a completeness it did not earn (2026-07-29)

- **Date:** 2026-07-29 (same-day follow-on to WC-071).
- **What changed.** `run_check` / `run_fix` gain three result fields:
  `complete: boolean`, `coverage: TableCoverage[]` (one entry per discovered
  table: `status` ∈ complete | exempt | no_relation_column | budget_exhausted
  | error, plus `reason`, `rows_scanned`, `last_id`, `batches`), and
  `uncovered: string[]` (the human-readable "table [status]: reason" lines).
  `msg` now opens `OK.` or `PARTIAL.` and appends the uncovered count. Existing
  fields are untouched, so a client that ignores the new ones behaves as before
  — except that it will now GET a report where it used to get `{result:false}`.
- **Why.** Before this, a batch that exceeded `DB_STATEMENT_TIMEOUT_MS` threw
  out of the whole scan: the operator got no report at all, and the 21 tables
  after the failing one were never examined with nothing saying so. The
  failure was total and silent about its own extent.
- **Budgets.** `DATAFRAME_TABLE_BUDGET_MS` 45 s, `DATAFRAME_TOTAL_BUDGET_MS`
  180 s, checked BEFORE issuing each batch so the recorded `last_id` is exactly
  the last row examined. Basis: a warm full walk of `matrix` (the largest table
  that actually holds frames) measures 18–24 s over its ~100 batches on
  dedalo7_mdcat. A per-batch `try/catch` converts a cancelled statement into a
  truncated table plus a reason, never an aborted scan.
- **The exemption is NAMED and it costs completeness.**
  `DATAFRAME_SCAN_EXEMPT_TABLES` skips `matrix_activity` and
  `matrix_activity_diffusion`, each carrying the reason the report prints
  verbatim. An exemption sets `complete:false` — the scan does not claim those
  tables are clean, only that it chose not to look. Their zero-frame property
  is EMPIRICAL (measured three ways), not structural: same 15-column jsonb
  layout, and dd560 proves the ontology cannot answer the question (hard-coded
  in `component_iri/descriptor.ts`, unreachable by recursion). An explicit
  `scopedTables` argument overrides the exemptions — naming a table is a
  deliberate choice and wins.
- **`matrix_time_machine` is NOT exempt — the old `NOT IN` was dead code.**
  That table has no `relation` column at all (its jsonb payload is `data`), so
  the relation-column discovery query never could return it. Listing it would
  document a decision nobody is making. Do not re-add it.
- **Fail closed.** `summarizeCoverage([])` returns `complete:false`: empty
  coverage means the discovery query is broken, and `uncovered.length===0`
  would otherwise make the emptiest possible scan the most confident one.
- **Client.** The INCOMPLETE banner renders ABOVE the counts (`.dd_note
  .state_warning`), not below — "Orphan frames: 0" under a partial scan means
  "none where we looked", so the caveat must reach the eye before the number.
  The `uncovered` lines render in the existing `.orphan_items` console block.
- **Measured effect (dedalo7_mdcat, 24 discovered tables).** Before: threw at
  ~80 s having examined 2 tables, no report. After: **19–47 s, 22 tables walked
  to exhaustion, 2 exempt**, `complete:false`, and it surfaces what the tool
  exists to surface — **36,219 legacy pre-migration frames, 0 orphans**,
  including `matrix_hierarchy` (51 rows), a table the old scan never reached.
- **Gate.** `test/unit/dataframe_scan_coverage_tripwire.test.ts` (registered in
  `engineering/TRIPWIRES.md` + `scripts/verify.ts` in this change, as the index
  contract requires): every exemption carries a real reason; exempt / budget /
  error each force `complete:false`; `no_relation_column` does not (structural,
  proven by the column check); empty coverage fails closed.
