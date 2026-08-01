# WC-071 — `dataframe_control` does not answer `get_widget_value` (2026-07-29)

- **Date:** 2026-07-29 (found by root-causing a `[db] slow query 2309ms`
  line naming `FROM "matrix"`; diagnosed and fixed the same day).
- **What changed.** The `dataframe_control` maintenance widget's module no
  longer exports `getValue`, so `dd_area_maintenance_api / get_widget_value`
  for `model:'dataframe_control'` now takes the no-handler branch in
  `registry.ts dispatchGetWidgetValue`. Its client peer dropped the matching
  `dataframe_control.prototype.get_value` assignment, so it never sends that
  RQO. `apiActions` is UNCHANGED — `get_value`, `run_check` and `run_fix` all
  still exist on `widget_request`, and `run_check` is byte-identical to what
  the panel load used to return.
- **Why.** The widget's "value" is a whole-database integrity scan
  (`dataframeControlScan`, every `matrix%` table with a jsonb `relation`
  column, end to end). It was NOT click-gated: the client claimed the lazy
  load synchronously and awaited its own `get_value()` inside the render
  spinner, so the scan ran **once per area_maintenance page load, per admin,
  in both Map and List views** — for the cosmetic gain of not flashing a `-`
  report before a second spinner. Measured on `dedalo7_mdcat` (24 tables,
  ~36.6M rows, ~92 GB) through the real config/pool: 75.2 s / 84.5 s / 79.2 s
  per invocation, **each ending in `canceling statement due to statement
  timeout`** (`DB_STATEMENT_TIMEOUT_MS=60000`). The scan aborts on table 3 of
  24 (`matrix_activity`, 32.9M rows / 81 GB, zero matching rows) and never
  reaches `matrix_hierarchy`. The only `try/catch` in the function is inside
  the `fix` branch, so it surfaced as `{result:false}` with no partial report.
  The panel could not produce a report on this install at all.
- **Divergence from PHP.** PHP's `class.dataframe_control.php` DID implement
  `get_value()`, and the frozen oracle harvest still censuses the widget's two
  client files (`dedalo_files_differential.json`). This is a deliberate
  removal of a PHP-parity entry point, not an unported one: the SAME work is
  reachable through `widget_request` (`run_check`), which is the route the UI
  now uses exclusively.
- **Not-run is not zero.** Per *never silently narrow scope*, the panel opens
  in an explicit not-run state (`render_not_run`, the kit's `.dd_note`) rather
  than `render_report(summary, {})` — five dashes read like a completed scan
  that found nothing, which would imply a clean database the widget has not
  looked at. Scan failures now paint through `render_error`
  (`.dd_note.state_danger`) instead of silently leaving the previous state on
  screen.
- **Gate reconciliation.** No fixture moves: no oracle fixture pins a
  `get_widget_value` response for this widget, and the catalog entry in
  `widgets_differential.json` is produced by `eagerValue`, which this widget
  has never had (its `value` stays `null`). `update_ownership_tripwire`'s
  ENGINE_NATIVE map is unchanged because it classifies `apiActions` entries,
  and all three remain registered.
- **Still open (not addressed here).** The scan itself remains uncompletable
  at this scale — no per-table budget, no partial report on timeout, no
  in-flight dedupe or abort propagation, and `matrix_activity` is still
  walked in full for zero matches. Those are separate changes; this one only
  stops the scan from running when nobody asked for it.
