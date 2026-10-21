# WC-2026-10-21-ontology-recovery-deadline — the recovery-file build and restore fail at a deadline instead of holding the single-flight lock forever

- **Date:** 2026-10-21 (W4 cross-write:r3, review-diff finding "pg_dump spawned with no
  timeout while holding the recovery single-flight advisory lock"). Amends
  `WC-2026-10-21-ontology-recovery-single-flight`.
- **Decision:** DEC-12 (gated: `ontology_recovery_file_deadline_native`).
- **Shape before (TS):** `build_recovery_version_file` spawned pg_dump, and
  `restore_dd_ontology_recovery_from_file` psql, with no bound while holding the
  single-flight lock: a child blocked on a table lock or a stalled server kept every later
  build and restore refused "already running" until the engine process died.
- **Shape after (TS):** each child runs under a 10-minute deadline (pg_dump also with
  `--lock-wait-timeout=60s`). Past it the child is killed and the call answers `ok:false`,
  `msg` unchanged (`'Error. pg_dump failed building the recovery file'` /
  `'Error. Request failed [restore_dd_ontology_recovery_from_file]'`), `errors[]` gains
  `'pg_dump exceeded its <ms> ms deadline and was killed'` / `'psql exceeded …'`; the slot's
  previous dump stays, the lock is released.
- **Reason:** the recovery file is the ontology update's safety net; a stuck build must
  never lock it away from the operator.
- **Gate reconciliation:** TS-only (maintenance widget, no oracle shape; no fixture or
  re-harvest).
