# WC-2026-09-30-move-transform-execute-job — a move_* EXECUTE is a stoppable, single-flight maintenance job

- **Date:** 2026-09-30 (audit 2026-09-26, OPS-6/PERF-11 r3).
- **Decision:** none (a defect fix with a wire effect). Amends WC-025.
- **Door:** `dd_area_maintenance_api::widget_request` → `move_tld` / `move_locator` /
  `move_to_portal` / `move_to_table` / `move_lang` with `dry_run: false`
  (`src/core/area_maintenance/widgets/move_common.ts` → `src/core/update/transform/engine.ts`).
- **Shape before:** the execute ran INLINE in the HTTP request and answered the transform
  report `{result, msg, errors, dry_run, counts, sample}`. Each definition file was one
  maintenance transaction with the statement ceiling lifted and no abort: a dropped
  connection did not stop it, there was no operator stop, it held every rewritten row's lock
  until its COMMIT, and a resubmit queued behind those locks and reported a rollback while the
  first run went on unseen.
- **Shape after:**
  - `dry_run: false` answers at once `{result: true, msg: "OK. Running <widget> <pid>", pid,
    pfile, dry_run: false}` — the same `{pid, pfile}` pair `update_data_version`'s background
    branch returns, polled through `dd_utils_api::get_process_status`. The job's final frame
    `data` is the report `{result, msg, errors, dry_run, counts, sample}`. The job is owned by
    the submitting user (the status stream is owner-scoped: the samples name records), runs on
    the `maintenance` lane with NO deadline.
  - A stop (`stop_process`) or a shutdown cancels the running statement and rolls that file
    back: `<file>: aborted (<stop|shutdown|aborted>) — rolled back: nothing of this file was
    applied`; every later file: `<file>: not run — the transform was aborted (<cause>) before it
    started`. The job ends `stopped`, its `data` still the report.
  - Single-flight: a second execute while one is claimed is refused before any job exists —
    `resource.conflict` (409, "Another move_* transform is running"). A run from another
    process meets the per-file advisory try-lock: `<file>: refused — another move_* transform
    is running; nothing of this file was applied`, later files `not run — the transform was
    refused before it started`.
  - A dry run (`dry_run` anything but `false`) is unchanged: inline, the report as the response.
- **Reason:** a lock-holding bulk rewrite with its ceiling lifted must be endable and must not
  run twice at once. The vendored client already sends `background_running: true` and expects
  `{pid, pfile}` (it renders the job stream).
- **Gate reconciliation:** no parity gate covers the execute (no fixture: WC-025 has no byte
  oracle). Gates: `test/unit/transform_run_native.test.ts` (the door's job shape, refusal, stop
  mid-file, stop while queued, submit refusal, the run lock) and
  `test/unit/maintenance_door_unbounded_native.test.ts` (the move_to_table / move_tld legs
  poll the job). No re-harvest.
