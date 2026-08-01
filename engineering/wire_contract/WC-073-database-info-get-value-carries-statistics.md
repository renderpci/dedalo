# WC-073 — `database_info.get_value` carries a `statistics` health verdict (2026-07-29)

- **Date:** 2026-07-29.
- **What changed.** `database_info.get_value` result gains one additive,
  engine-native key: `statistics: StatisticsHealth | null` — `{status:
  'ok'|'degraded', tables, never_analyzed, counters_reset, worst[], detail}`.
  `info` / `tables` / `indexes` are untouched, so the PHP-parity fields and the
  `widget_request` denial of `get_value` are unaffected. Computation is
  fail-soft (`null` on error): a statistics readout must never take the catalog
  panel down with it.
- **Why.** A stats-collector reset is dangerous precisely because it is SILENT.
  Found by accident on 2026-07-29 while chasing an unrelated slow query:
  dedalo7_mdcat had 38 of 43 tables with `last_analyze` AND `last_autoanalyze`
  NULL while `autovacuum` read `on`, and `n_live_tup` was fiction
  (`matrix_time_machine` 91 against a real 50,993,786). `pg_stats` still held
  rows — `pg_statistic` survived while the CUMULATIVE counters were wiped
  (crash restart or restore). Autovacuum and autoanalyze fire on
  `n_mod_since_analyze` / `n_dead_tup`, which restart from zero, so a 44 GB
  table would never be auto-maintained again and nothing anywhere said so.
- **Detection.** Two signals, thresholds in
  `summarizeStatisticsHealth` (PURE — the verdict is testable without a DB):
  never-analyzed tables at or above `STATS_SIGNIFICANT_BYTES` (64 MB; smaller
  tables are counted but not alarming — a 50-row lookup plans fine on
  defaults), and the RESET signature `reltuples >= 1000 && n_live_tup*100 <
  reltuples` — the planner believing in a big table while the counters believe
  it is empty. `detail` states the CONSEQUENCE ("they will NOT fire"), not just
  the fact, and points at the panel's own "Analyze database" button.
- **Client.** Renders FIRST in the panel (`.dd_note.state_warning` + a
  `.version_info` block listing the offenders), above the catalog dump — the
  one place this is surfaced, so it must not sit under the index listing.
  Table names go in via `textContent` (DB-sourced).
- **Measured, both branches, live.** `dedalo7_mdcat` after the 2026-07-29
  DB-wide ANALYZE: `ok`, 43 tables, 0 never-analyzed — the alarm clears when
  the problem is fixed. `dedalo7ts` untouched: `degraded`, 39 tables, **37
  never analyzed, 8 counters-reset**, worst = matrix_hierarchy (398 MB,
  n_live_tup=0 vs reltuples=185,612), matrix_relation_index (191 MB, 0 vs
  1,512,310), matrix_ontology, matrix_string_search, … So the condition is
  present across the local dev databases, not an mdcat quirk.
- **Not a tripwire.** This is a runtime health READOUT, not a mechanical
  invariant — its truth depends on the database, so it cannot live in
  `engineering/TRIPWIRES.md`. The pure verdict is pinned by
  `test/unit/database_statistics_health.test.ts` (thresholds, the reset
  signature, alarm-clears-after-ANALYZE, dedup/cap of `worst`).
