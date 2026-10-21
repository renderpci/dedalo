# WC-2026-10-21-ontology-recovery-single-flight — a concurrent recovery-file build/restore is refused "already running"; a landed ontology update is never rolled back by a tail failure

- **Date:** 2026-10-21 (W4 cross-write:r2, review-diff findings "recovery-file build: fixed
  shared .part path, no single-flight" and "new report-only dependency step can throw and
  roll back an update that already completed").
- **Decision:** DEC-12 (gated: `ontology_recovery_file_single_flight_native`,
  `ontology_update_landed_tail_native`).
- **Shape before (TS):**
  - `build_database_version` → `build_recovery_version_file` /
    `restore_dd_ontology_recovery_from_file`: no latch; two at once raced on one fixed
    `<slot>.part`, one fixed `<file minus .gz>` and the one `dd_ontology_recovery` table —
    a torn slot after an "OK", or a spurious failure.
  - `update_ontology`: any throw after the import COMPLETED (the dependency report) restored
    the Phase-B snapshots under the already re-derived dd_ontology and answered the
    restore message.
- **Shape after (TS):**
  - A second build or restore while one runs answers
    `{ok:false, msg:'Error. A recovery-file build or restore is already running',
    errors:['ontology recovery file: another build or restore holds the single-flight
    lock']}` and touches nothing (a Postgres session advisory lock per database, across
    engine processes). Temp files are per-session (`<path>.tmp-<id>`); the lock holder
    sweeps the slot's stale ones.
  - A throw after the import landed restores nothing: `msg: 'Error. The ontology update
    landed, but a final step failed (see the server log)'`, `errors[]` gains
    `'the ontology update landed; a final step failed (see the server log) — nothing was
    rolled back'` (the raw error goes to the server log).
- **Reason:** the recovery file is the ontology update's safety net; it must never be torn
  after an OK. A landed update rolled back under its own dd_ontology is a state neither
  version was ever in.
- **Gate reconciliation:** TS-only (maintenance widget / update panel, no oracle shape; no
  fixture or re-harvest).
