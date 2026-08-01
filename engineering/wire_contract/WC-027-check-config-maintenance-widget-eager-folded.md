# WC-027 — `check_config` maintenance widget: eager folded status + TS-native details/mode readouts

- **Date:** 2026-07-10.
- **Symptom fixed:** the `check_config` card painted danger-red while FOLDED on
  a perfectly healthy install. `check_config` is not a `background` widget, so
  its data loads lazily on open — but the client still `render()`s the card at
  page build (folded) with `self.value` unset. `render_check_config.js` reads
  the empty `db_status`, sees `global_status===undefined` (`!== true`), and adds
  the `danger` class. Opening the panel loaded real data and cleared it → the
  "red only while folded" report.
- **Shape after (TS):**
  - `check_config.get_value` now has a twin `eagerValue`; the catalog
    (`get_ar_widgets` / `getMaintenanceWidgets`) PRE-LOADS the payload onto the
    widget descriptor's `value`, so the folded card paints from REAL status
    (green when healthy, honestly red only on a genuine probe failure). Same
    computation as the panel-open probe (`computeCheckConfig`) → folded and
    opened renders are byte-identical.
  - The `result` payload gains two TS-native, PHP-absent blocks:
    `db_info` = `{ identity (name@host:port), server (PostgreSQL version),
    schema_ok, ontology_rows, matrix_tables, migration_level, migration_latest,
    pool:{in_use,max,waiters} }`; `runtime_mode` = `{ maintenance, recovery,
    notification, diffusion_native, dev_mode }`. New read-only accessors feed
    them: `getPoolStats()` (`db/postgres.ts`), `statePath()`
    (`resolve/server_state.ts`), `SESSION_DB_PATH` (`security/session_store.ts`).
  - `config_sources` now reports the session store at its REAL filename
    (`dedalo_ts_sessions.sqlite`, honoring `DEDALO_SESSION_DB_PATH`) — the old
    hardcoded `sessions.sqlite` never existed, so the row was always "absent".
  - Client `render_check_config.js` renders "Database details" + "Runtime mode"
    sections, each GUARDED on `value.db_info` / `value.runtime_mode` — so the
    PHP server (which emits neither) renders the ORIGINAL card unchanged. This
    is a ONE-FILE TS-owned divergence (the widget's other client files stay
    byte-identical), excluded from `scripts/sync_client.sh` (see its
    `TS_OWNED_EXCLUDES`, alongside WC-005/WC-018).
- **Gate reconciliation:** none needed on the catalog — `widgets_differential`
  already strips every widget's `value` before the byte-compare (the 11
  PHP-value widgets ship TS-null there; check_config now ships a value the PHP
  side lacks, still stripped). `test/unit/server_state.test.ts` pins the
  `eagerValue` payload (db_status object shape, `db_info` identity/server/
  schema/migration/pool, the five `runtime_mode` booleans) and the corrected
  session-store reporting.
