# WC-2026-09-30-update-engine-atomic — the data update runs as one atomic, single-flight unit

- **Date:** 2026-09-30 (audit 2026-09-26, OPS-6).
- **Decision:** none (a defect fix with a wire effect).
- **Door:** `dd_area_maintenance_api::widget_request` → `update_data_version.update_data_version`
  (inline, and the `background_running` job whose last frame's `data` is the engine
  response), through `src/core/update/engine.ts` `updateVersion`.
- **Shape before:** each checked step ran as its own pooled statement. A failing SQL
  step, a `stop_on_error` script, a server restart or a stopped job left every EARLIER
  step committed while the version row was never stamped; the rerun re-applied them. Two
  concurrent runs both applied. A partial checkbox selection stamped the version anyway.
  `components_update` was discovered (`engine.uncovered_scope`) only after the earlier
  steps had committed; `run_pre_scripts` was serialized to the panel and silently ignored.
- **Shape after:**
  - **Atomic.** One transaction on the maintenance pool: every step and the version
    row land together or not at all. A failed run's `msg` keeps its step lines and
    ENDS with the exact line `Rolled back: no statement of this run persisted`; a
    stopped/deadline/shutdown job's run STARTS with `Update aborted (<stop|deadline|shutdown|aborted>)`
    and cancels the running statement. A failure no step reported answers a deliberate
    sentence (`Error: a table lock stayed unavailable through every retry (see update log)`
    / `Error: the update failed before COMMIT (see update log)`), never raw driver text.
    A statement cancelled from OUTSIDE without the run's own abort (a shutdown's cancel of
    the maintenance pool, an operator's `pg_cancel_backend`) answers `Interrupted: a
    statement of the update was cancelled (a server shutdown or an operator cancel) —
    nothing is wrong with its SQL (see update log)` instead of `Error on SQL_update: …`.
    A restart is a rollback; the rerun is the resume. The abort's cancel is sent on a
    dedicated connection (it never queues behind a saturated request pool), and a run
    still waiting for its maintenance slot leaves the queue at once. Once aborted, the run
    sends no further statement (a script that never polls its signal is stopped at its
    next statement). A soft-failed script's savepoint rollback also drops the commit-only
    actions it queued.
  - **update.log** (not wire; operator file, ADVISORY): an attempt that won the
    single-flight claim opens with `BEGIN atomic run <from> -> <target> [xact <xid>] …`; a
    committed run gets an fsynced `COMMITTED <target> [xact <xid>]`; a rolled-back one
    `ROLLED BACK [xact <xid>] …`; an attempt refused inside the transaction writes one line,
    `REFUSED [xact <xid>] (<reason>) — nothing ran`, and no BEGIN. The verdict of record is
    the `matrix_updates` version row: a failed log write goes to the server log and never
    turns a committed run into an error (nor skips its reconcile).
  - **One verdict.** A failure the engine did not raise itself (a lost connection —
    possibly DURING COMMIT) is classified by PostgreSQL's record of THIS run's
    transaction (`pg_xact_status(<xid>)`), never by the installed version (another
    process may have stamped the same target; a COMMIT waiting on a synchronous standby
    still reads the old one): `committed` → `ok: true`, the line `The update was
    committed: the connection failed at the end of the run, and PostgreSQL reports its
    transaction committed` before the success tail; `aborted` → the rollback line; still
    `in progress` after a short poll, NULL, or unreadable → `ok: false` ending with
    `Outcome unknown: the run failed and its transaction's outcome could not be read back
    — reload the panel to see whether the update was applied` (never the rollback line on
    a guess). The status is read on a dedicated connection (≤ 2 s per read), never a
    pooled one, so a busy maintenance pool (a REINDEX queued behind the run) cannot delay
    the verdict.
  - **The unit cannot be ended from inside.** A step or script that issues transaction
    control (`COMMIT`, `BEGIN`, `ROLLBACK` — not `ROLLBACK TO` —, `END`, `ABORT`,
    `PREPARE TRANSACTION`) is refused before the statement is sent (`internal.invariant`
    inside the step: a script's failed outcome, a `stop_on_error` script rolls the run
    back). Should the between-steps checkpoint ever see the transaction id change anyway
    (defense in depth), the run answers `ok: false` ending with `Partially applied: a
    statement ended the update transaction mid-run — the steps before it persisted and the
    version was NOT stamped; inspect the data before rerunning (see update log)` — never
    the rollback line — and update.log gets `PARTIAL [xact <xid>] — the transaction ended
    mid-run (xact <before> → <now>): …`.
  - **No deadline.** The background job overrides the maintenance lane's deadline with
    `deadline_ms: 0` on its record — a clock would roll the whole atomic unit back on
    every attempt. Stop and shutdown still abort it.
  - **Single-flight.** A concurrent run, or a run whose pre-read version is stale (the
    version already moved), throws `update.refused` (409) before any step runs.
  - **Selection rule.** Every `SQL_update_i` and every `stop_on_error` script must be
    checked — otherwise `update.refused` (409), zero statements. An unchecked soft script
    is skipped with the msg line `Skipped script: <id> (not re-offered)`.
  - **Descriptor refusals, before any statement.** `componentsUpdate` / `runPreScripts`
    → `engine.uncovered_scope` (503); any other key outside the closed set, a
    multi-statement / transaction-control / session-SET / non-transactional
    (`CONCURRENTLY`, `VACUUM`, `REINDEX SCHEMA|DATABASE|SYSTEM`, a table-less `CLUSTER`,
    `ALTER DATABASE … SET TABLESPACE`, a `SUBSCRIPTION` command, …) `SQL_update` entry, one naming `statement_timeout` /
    `lock_timeout` anywhere (quoted or not), one using `set_config()` / `pg_settings` /
    a quoted setting name, an unknown
    script id, or a bad `execution_order` → `update.refused` (409). The live catalog is
    validated at module load, so a refused descriptor never reaches the panel;
    `toWireDescriptor` no longer emits `run_pre_scripts` / `components_update`.
  - **Order unchanged** on success: `[step lines…, reconcile line, 'Updated Dédalo data
    version: X', 'Updated version successfully']`. The mirror reconcile now runs strictly
    after COMMIT (never for a rolled-back run).
- **Live bytes:** unchanged today — the only shipped descriptor is the code-only 7.0.1
  release, so the panel still serves `updates: null` and the action still answers the
  nothing-to-update bytes.
- **Gate reconciliation:** no parity fixture covers a data-migration run (the frozen store
  holds none); no fixture edit. Gates: `test/unit/update_engine_atomic_native.test.ts`
  (atomic, crash, ceiling, single-flight, abort, lock retry, reconcile, selection rule,
  the verdict read under a busy maintenance pool, a script's refused COMMIT, the PARTIAL
  verdict),
  `test/unit/update_descriptor_tripwire.test.ts` (the validator truth table, zero
  statements for a refused descriptor, and the module-load check actually running),
  `test/unit/update_engine.test.ts` (PHP-parity step bytes + the rollback line, the job's
  `deadline_ms: 0`, the job's abort signal reaching the engine).
