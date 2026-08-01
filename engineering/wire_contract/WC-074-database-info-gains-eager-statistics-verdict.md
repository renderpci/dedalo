# WC-074 — `database_info` gains an eager `statistics` verdict + `analyze_statistics` (2026-07-30)

- **Date:** 2026-07-30. Follow-on to WC-073, which added the verdict but left it
  reachable only by opening the panel, and pointed its fix at the wrong verb.
- **What changed.**
  1. `database_info` gains `eagerValue` returning `{statistics}` — and ONLY that
     key. The widget catalog's inline `value` for `database_info` therefore goes
     from `null` to `{statistics: {...}}`, so the FOLDED dashboard card can warn
     without anyone opening the panel. The heavy `tables`/`indexes` catalog stays
     on the panel-open path: `eagerValue` runs for every widget on every area
     read, so it must stay cheap (one catalog query, ~3–5 ms). Fail-soft `null`
     per the registry contract (`registry.ts` `?? null`).
  2. `apiActions` gains `analyze_statistics` — plain `ANALYZE`, scoped to the
     tables the verdict named, through `runWithoutStatementTimeout` (WC-055,
     since ANALYZE on a multi-million-row table can exceed the pool ceiling).
     Result `{analyzed: string[]}`; an empty list means the verdict was already
     `ok` and is a SUCCESS, not an error.
- **Why not reuse `analyze_db`.** It runs whole-database `VACUUM ANALYZE`.
  Reclaiming space is a different job from refreshing statistics and its cost is
  page-proportional, whereas plain `ANALYZE` samples a bounded page count and is
  near-flat in table size (~60 s for 141 GB, 4 s for 68 MB). WC-073 documented
  the near-flat figure while pointing the operator at the page-proportional
  button — that mismatch is fixed here, in the code AND in the two client/server
  doc comments that mis-described `analyze_db` as the lighter statement.
- **The scope is re-derived server-side, never taken from `options`.**
  `degradedTableNames()` (PURE, tripwire-tested) recomputes the offender list
  from the catalog, so the set analyzed is exactly the set the verdict showed the
  operator. Names are validated against `^[A-Za-z_][A-Za-z0-9_]*$` before being
  interpolated into the `ANALYZE` list even though they come from `pg_class` —
  provenance is not a substitute for validation. A rejected name is reported, not
  skipped silently.
- **Gate reconciliation.** No fixture moves: `widgets_differential.test.ts`
  EXCLUDES `value` from the catalog byte-compare (its `omit` array always
  contains `'value'`, because 11 widgets already embed a live payload), so adding
  an eager value cannot break the frozen catalog fixture, and no PHP-side eager
  value exists for `database_info` to diverge from. `analyze_statistics` needed a
  new ENGINE_NATIVE classification in `update_ownership_tripwire.test.ts` (an
  unclassified apiAction fails that tripwire). `test/unit/database_statistics_health.test.ts`
  gains the repair-scope cases: healthy → empty scope (the action must never
  silently widen into a whole-DB ANALYZE), offenders only and largest-first,
  degraded ⇒ non-empty scope (so a warning always has something to press), and
  every emitted name is a bare identifier.
- **Deliberately NOT built** (investigated 2026-07-30, rejected): no scheduler
  and no unattended auto-repair. Once the counters are correct, autoanalyze
  maintains statistics itself — its threshold `50 + 0.1*reltuples` is correctly
  sized because `reltuples` survives a reset — so a periodic engine-side ANALYZE
  would duplicate a correctly-configured mechanism with a worse (wall-clock)
  trigger. It would also cost a `module_state_tripwire` allowlist entry, a new
  config key across the catalog/`migration_map`/`sample.env`/docs chain, drain
  wiring, and a single-flight story for the documented multi-instance topology
  (`STAGING_VALIDATION.md`) where a rolling restart would fire N concurrent
  ANALYZEs. `/health` was excluded outright: the watchdog restarts the process on
  any non-2xx and a restart cannot repair `pg_statistic`.
