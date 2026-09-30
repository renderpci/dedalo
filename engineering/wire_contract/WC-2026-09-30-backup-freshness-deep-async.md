# WC-2026-09-30-backup-freshness-deep-async — the backup verdict is the full read; HTTP surfaces may answer `verifying`

- **Date:** 2026-09-30 (audit 2026-09-26, OPS-1).
- **Decision:** none (a defect fix with a wire effect).
- **Doors:** `update_code.get_value` (`consumer.checks[id='backup_fresh']`),
  `update_code.update_code` (the background job's refusal),
  `update_data_version.update_data_version` (inline response `errors`), through
  `src/core/update/preconditions.ts` and `src/core/area_maintenance/backup.ts`.

## Shape before

- The backup freshness verdict asked the CHEAP question (`pg_restore --list`),
  which accepts an archive cut to 60%: such a dump read `ok` on the panel and
  satisfied the unwaived code update.
- A verification that outran its constant 120 s budget counted as a backup
  (`usable: true`) — fails OPEN above ~16 GB.
- Every verification was a synchronous spawn inside the HTTP request.

## Shape after

STATUS — `consumer.checks[id='backup_fresh']`
- New `detail: 'verifying'` (state `warn`, `scope: '<file> (verifying)'`) when the
  shared verification scan has not settled within the panel's bounded wait
  (`min(5 s, idleTimeout/2)`). Never `ok` while verifying. The client renders a
  non-numeric detail verbatim (`String(detail)`); no client change.
- `scope` may now read `<file> (truncated)` or `<file> (unverifiable_timeout)`
  where the same file used to be counted (`ok`, or an age).

`update_data_version` (inline) — `errors[]`
- The three existing warning sentences are byte-unchanged. A FOURTH may appear
  when the bounded wait loses: `Warning. The newest database backup ('<file>') is
  still being verified — retry shortly`. The background branch carries no
  warnings and no longer computes them.

`update_code` (the job's terminal frame, `update.refused`)
- The refusal now fires for a truncated dump (`did not verify (truncated)`) and
  for a read that ran out of budget (`did not verify (unverifiable_timeout)`), in
  the existing sentence. The timeout case appends one remedy clause:
  `; its verification ran out of time — on slow backup storage raise
  DEDALO_BACKUP_VERIFY_SECONDS_PER_GB`.
- The budget is `max(60 s, ceil(size / 1 GiB) × DEDALO_BACKUP_VERIFY_SECONDS_PER_GB
  (default 60) s)` per pg_restore stage.
- The refusal is computed inside the background job (after superuser and
  maintenance mode), so the submitting request answers `{pid, pfile}` as before.

Verification sidecars
- A legacy `<file>.verified` with reason `verified_toc` (written by engines
  before this entry) is ignored and the file is read again.

### Addendum (same day, OPS-2 review)

- `update_code` (the job): after the settled backup verdict the superuser and
  maintenance-mode checks run AGAIN, so a job whose install left maintenance mode
  during the (possibly long) verification ends `maintenance.mode_required`
  instead of swapping a live tree.
- The per-stage budget is capped at `2^31 - 1` ms (the longest delay a timer
  holds); an uncapped value used to fire after ~1 ms and time out every read.
- A `*.custom.backup` without the archive magic reads `not_an_archive` (refused,
  `scope: '<file> (not_an_archive)'`) where it used to count as a foreign format.

### Addendum (same day, second review round)

- **New verdict reason `unverifiable_read_failed`** (panel `scope`
  `'<file> (unverifiable_read_failed)'`; refusal sentence `… did not verify
  (unverifiable_read_failed) …`): pg_restore failed for a reason that is not the
  archive's bytes — killed by a signal the engine did not send, an I/O error on
  the backup storage, a pg_restore older than the archive's format, or a failure
  whose words are not recognized and that a second read did not repeat. Not a
  restore point, not a disproof: never cached in a sidecar, never a reason to
  retire a file. Those cases used to read `truncated` / `not_an_archive` and were
  CACHED — a good backup disqualified until the file changed. A failure is a
  disproof only when pg_restore's words say the archive is damaged (end of file,
  a bad header version, a missing block…) or when an unrecognized failure
  repeats word for word.
- **The update panel's `backup_fresh` line for a non-superuser** is
  `{state: 'unknown', detail: 'superuser_required'}` and no archive is read on
  their behalf (it used to start the full-read scan for any global admin, who
  cannot run the update).
- **A scan is shared only over the same artifacts**: an asker who arrives after
  a new dump was promoted gets a walk that sees it (it used to join a walk whose
  candidate list predated the dump, and be refused "no usable backup").
- The code update's waiver audit look uses the same verification seam as the
  refusal (no behaviour change in production).

### Addendum (same day, third review round)

- **Verification sidecars carry a classifier generation**: `<file>.verified`
  now holds `classifier: 2` next to `size` / `mtimeMs` / `reason` /
  `verifiedAt` / `detail`, and ONLY a record with `classifier: 2` is trusted.
  Every earlier sidecar — `verified_toc`, and the `truncated` / `not_an_archive`
  that engines before the second round cached for ANY failed read (a read
  killed from outside, an I/O error, an old pg_restore) — is ignored once and
  re-derived by the byte-only classifier. A good archive such a record declared
  bad used to stay refused (and retirable on a name collision) forever.
- **A verdict that came from READING the archive carries `budgetMs`** — the
  per-stage budget it ran under (the size-scaled `verifyBudgetMs` default, or a
  caller's override). Absent on a verdict decided without pg_restore or
  answered from a sidecar. Visible outside the engine only in the restore
  door's journal (`artifact.budgetMs`, additive); the panel and the refusal
  sentences are unchanged.
- **`update_code` (the job) honours a STOP**: the job's abort signal reaches
  the pipeline, which asks it after the settled backup verdict and again just
  before the swap. A job stopped (by the operator, or the lane deadline) in
  either window ends with `update.refused`: `Error. Code update stopped while
  the database backup was being verified — nothing was swapped and the live tree
  is untouched` / `Error. Code update stopped before the swap — …`. It used to
  carry on — download, swap, restart — under a job the panel already showed as
  stopped.

## Reason

A restore point that cannot be read back end to end is not a restore point, and
the code update's rollback contract leans on it. The deep question is only
affordable because it is async, single-flight, serialized, cached once per
artifact, capped at 3 candidates and bounded on every HTTP surface.

## Gate reconciliation

No re-harvest (DEC-14b): the update panel and the code updater are post-cutover
surface; `update_data_version`'s frozen bytes are the three sentences, which are
unchanged. Gates: `test/unit/backup_freshness_deep_native.test.ts` (legs A–J, J3, E2, O,
P1–P4, R, Panel, Warn path), `test/unit/update_code_widget_native.test.ts` (the
panel's bounded wait as production binds it — no seam), `test/unit/code_update.test.ts`
(a STOP during the verification and before the swap), `test/unit/update_engine.test.ts` (the inline
update_data_version run's bounded warning), `test/unit/backup_restorability_native.test.ts` (census:
`verified_toc` gone, `unverifiable_timeout` covered), `test/unit/update_status_native.test.ts`,
`test/unit/update_preconditions.test.ts`, and `bun run test:update` step 6d
(an unwaived update over a real 60% cut is refused end to end).

### Addendum (same day, OPS-6/PERF-11 review r2)

- `update_data_version` (inline) `errors[]`: a scan that REJECTS (a `pg_restore`
  that cannot be spawned, an unreadable backup directory) used to escape
  `backupWarningsWithin` and refuse the migration. It is now a FIFTH warning,
  byte-frozen: `Warning. The database backup could not be checked (see the server
  log) — make sure a restorable backup exists before updating`; the cause goes to
  the server log only. Gate: `test/unit/update_preconditions.test.ts`.
