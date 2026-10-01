# WC-2026-09-30-diffusion-target-fence — the publication TARGET is written by one fenced unit at a time

- **Date:** 2026-09-30, adopted with the change that closes audit row DIFF-2
  (audit 2026-09-26, closure plan Step 6; owner decision: the exclusion unit is
  the TARGET).
- **Amends:** WC-2026-09-05-diffusion-lease-epoch-fence (the epoch fenced the
  job ROW; this fences the target).
- **Decision:** DEC-12 (gate: `test/unit/diffusion_target_fence_native.test.ts`
  — five outcome legs, the MariaDB ones on the suite MariaDB target).

## Shape before (TS, to 2026-09-29)

A runner checked its lease only when it wrote progress — AFTER a batch's rows
or files had landed. A runner the sweeper revoked while it was slow kept
publishing into the target the new epoch was publishing into; the sweeper could
revoke a runner in the middle of its batch; the record-delete executor, the
ghost unpublish and the lang sweep wrote the same targets with no exclusion;
the rdf/xml `abort()` deleted every `.tmp-*` in the shared target directory —
another session's in-flight temps included.

## Shape after

- Every durable effect of a run (schema step, each batch, close) is ONE
  Postgres transaction (`src/diffusion/jobs/target_fence.ts`): the target's
  advisory lock `pg_try_advisory_xact_lock(17580002, hashtext(<key>))`, keys
  `sql:<database>` / `files:<format>/<dir label>`; THEN the lease re-read
  `FOR KEY SHARE`; then target I/O + tail. The lock is a try-lock loop (250 ms
  doubling to 2 s) that holds no connection while busy.
- **Busy message:** while a unit waits, the job row's `totals.msg` reads
  `Waiting for the publication target (busy)…` (written once per wait).
- A runner revoked while it waited writes NOTHING (typed
  `diffusion.lease_revoked`, silent exit).
- The CLOSE is a unit like the batches (it does the run's longest target
  writes and, fenced, sweeps the directory's `.tmp-*`). Gate:
  diffusion_target_fence_native A3 — a target taken between the last batch
  and close(): the runner waits (busy) with the archive and a live holder's
  temp untouched; revoked meanwhile it renames no zip and sweeps no temp.
- The sweeper takes stale rows `FOR UPDATE SKIP LOCKED`: a runner inside a
  batch is skipped, never revoked mid-batch. Heartbeat, progress and the cancel
  flag are NO KEY UPDATE and never wait on a batch.
- **Liveness stamps are the wall clock.** `heartbeat_at` (heartbeat, progress,
  checkpoint) is `GREATEST(heartbeat_at, clock_timestamp())` and `finished_at`
  is `clock_timestamp()` — never `now()`, the TRANSACTION START: progress,
  checkpoint and finish ride the unit, and a `now()` there set the heartbeat
  BACK to the unit's start at commit (over the interval heartbeat's fresher
  stamp); with the KEY SHARE gone at commit, a sweeper tick then revoked a
  healthy runner whose unit had lasted past the stale bound, burning its
  attempts until the run failed `diffusion.runner_lost`. Gate:
  diffusion_target_fence_native H (a unit held past the stale bound, then
  committed: nothing revoked; `finished_at` is the completion) + H2 (the
  `GREATEST`: a heartbeat already ahead survives heartbeat, progress and
  checkpoint — a stamp never moves it backwards).
- A record deleted from the archive while its batch waited is revalidated
  under the lock and unpublished, never written.
- dd1758 failures are fatal inside the unit (see the run-ledger entry).
- Other doors take the same key: record delete executor, ghost unpublish,
  lang sweep (wait), and the media-index store's two apply doors, which live
  in `src/diffusion/targets/mediastore/media_index.ts` (core only forwards to
  them through the `registerNativeMediaIndex` seam):
  - `reconcileMediaIndex`, the ONLY exported pub/ apply (the boot registry
    definition, the media_control widget through the seam, the rebuild's
    closing step). It diffs under the fence of every database with a
    `dbs/<db>` subtree, then RE-LISTS `dbs/` under the locks and CHECKS BEFORE
    IT WRITES: a database it did not hold (a FIRST publication, whose writer
    was never held off) voids the round — nothing touched, nothing unlinked —
    and the next round holds that database too (bounded to 5 rounds, then
    typed `internal.invariant`). A writer creating its subtree after the
    re-list wrote nothing the diff read (its `pub/` marker follows its `dbs/`
    one), so the round that grows nothing is exact. No transient unlink: the
    earlier apply-then-re-run shape unlinked a first publication's `pub/`
    marker in round 1 and re-derived it in round 2 (a public 404 window); the
    ontology-named "best-effort" lock half that tried to hide it is deleted.
  - `rebuildMediaIndexStore` (the admin `rebuild_media_index`): each
    database's SELECT → readdir → marker diff-sync runs under that database's
    fence, one database at a time; the stale-table sweep of a database takes
    its fence too; the closing `pub/` derivation is the fenced reconcile. A
    runner row + marker landing after the SELECT can no longer be unlinked as
    "not published".
  Gates (DIFF-2): media_index_reconcile_fence_native — the writer modelled
  UNDER its lock (fence → `dbs/K` → yield → `pub/K` → release): its `pub/K` is
  NEVER unlinked at any instant (removals spied), and the apply's own write
  lands only after the writer released; the rebuild leg lands a row + marker
  between the SELECT and the sweep and asserts neither marker is ever removed
  and the writer could not land inside the window. media_index_store "the
  reconcile APPLY holds every marker database's publication-target fence" —
  exclusion for a database the store already holds.
  The DELETE-ONLY doors — the record delete executor and the ghost unpublish —
  take the key SHARED (`pg_try_advisory_xact_lock_shared`, same class and
  hash): unpublishers never exclude each other (two record deletes on one
  database both settle; a bulk delete does not leave a concurrent single
  delete pending), while each still excludes, and is excluded by, every
  EXCLUSIVE holder (a runner's unit, the lang sweep, the media-index
  rebuild/reconcile). Gates (diffusion_target_fence_native D3): with another
  unpublisher holding the database, a request-path delete and a ghost
  unpublish both settle at once; an exclusive writer is refused.
  The record delete executor on the REQUEST path (dd_core_api delete → settle,
  once per intent row) never waits for an EXCLUSIVE holder: a held target goes
  to `errors`, the dd1758 row stays pending for the retry queue. Only a retry DRAIN (the runner's
  opportunistic retry, `retry_pending_deletions`, the maintenance widget's
  retry — both explicit drains through the facade's
  `retryPendingDeletionsPatiently`) waits, inside
  `withPatientDeleteWait` — ONE 10 s budget for the whole drain, never per row.
  Gates (diffusion_target_fence_native D2): the three drains, through their real
  doors, wait for a held target and then delete; two held databases in one
  scope cost ~10 s, not 20 s.
- rdf/xml `abort()` sweeps no temps (it may run unfenced). A crashed holder's
  leftover `.tmp-*` is swept by the next FENCED close (the runner's close unit,
  `WriterCloseContext.fenced`): every temp in a target directory is a fence
  holder's, and that close IS the holder — every file writer (markdown, rdf,
  xml, csv, json; gated per writer). The session's OWN temps (a job-less
  csv/json session streams onto a `.tmp-*` partial) are never swept.
- A csv/json session OPENED on a resume never modifies its job-scoped partial
  (`.part-<jobId>` is shared by every epoch of the job, and the writer is
  opened outside the fence): the cut back to the checkpoint happens at the
  first append / checkpoint / finalize — calls the runner makes only inside a
  fenced unit. A revoked epoch that thaws cannot cut the live epoch's partial.
  Gate: diffusion_file_writers "stale epoch" (+ the deferred cut is never
  skipped: "nothing more to write").
- A runner refuses to start on a pool of fewer than 2 connections
  (`DB_POOL_MAX`; typed `internal.invariant`).
- THE RULE reconciling a transaction that spans target I/O: only a
  `target_fence.ts` unit may; it holds no matrix row locks and is bounded by
  `idle_in_transaction_session_timeout` = 300 s — a bound for a FROZEN holder
  only. Every unit that opens its transaction runs a timer keepalive (`SELECT
  1` on its own connection every 30 s) for as long as its work is in flight, so
  a LIVE unit whose target step outlasts the bound (an `ALTER` on a large
  published table, the lang sweep's chunk loop, a statement queued behind a
  MariaDB metadata lock) keeps its lock and commits; a frozen process sends
  nothing and is killed. Gate: diffusion_target_fence_native F.
- Exclusion is batch-granular: two runs on one target interleave batch by
  batch; consolidated artifacts come from each run's own ledger, so that is
  equivalent to running them one after the other.

## Residuals (ledgered, not closed)

- R1 — a thawed zombie whose fence session Postgres killed can finish at most
  its one in-flight target batch (a MariaDB `GET_LOCK` would close it for sql
  targets — owner call).
- R2 — the core files-unlink door (`src/core/diffusion_bridge/`) is not
  fenced yet. What it can do to a close, and what the close does — never a
  failed run:
  - a file removed before createZip OPENS it is skipped and named in the
    run's summary (`onMissing`); one removed AFTER the open is archived
    WHOLE — both passes of a stored entry read one open handle (core/files/
    zip.ts `addStoredFile`; gate: diffusion_file_writers "a file UNLINKED
    between the two passes is archived whole"). The archive is the snapshot
    as of each open: a record unpublished after its open stays in this run's
    archive until the next run.
  - every record file gone: markdown lands no archive and names each file
    (`createZip` `empty: 'none'`; gate: diffusion_file_writers "EVERY
    manifest record's file GONE").
  - one removed while an rdf/xml close MERGES it is a summary line, the rest
    merged (`readManifestPart`; gate: diffusion_rdfxml_writers "a part GONE
    between the manifest pass and the merge read"); one removed BETWEEN the
    merge and the zip pass is in the merged document and not in the archive —
    the two artifacts disagree, and the zip pass's summary line names it
    (gate: diffusion_rdfxml_writers "a record GONE between the merge pass and
    the zip pass"). Fencing the door (under `files:<format>/<label>`) closes
    all of it at the source. (The media-index
  rebuild and the widget's reconcile, once listed here, were never core's: the
  work runs in `media_index.ts`, and both are now fenced — see above.)
- R3 — a delete door that finds its target held by an EXCLUSIVE writer (a
  runner's unit, the lang sweep, the media rebuild — never another
  unpublisher, see D3) leaves the unpublish pending
  until the next patient drain (a run's start, `retry_pending_deletions`, the
  maintenance widget's retry — `core/area_maintenance/widgets/
  diffusion_server_control.ts` drains through the facade's
  `retryPendingDeletionsPatiently`, so it waits for a run's unit like the
  action does; gate D2's widget leg).
- R4 — a LIVE unit waiting on a target statement that never returns holds
  its target that long: a MariaDB lock wait (`lock_wait_timeout` defaults to a
  day), or a write on a half-open TCP connection (the target pool sets no
  statement or socket timeout on write paths — it never returns at all). The
  unit's keepalive refreshes the idle bound and the runner's heartbeat keeps
  the row fresh, while the row is held `FOR KEY SHARE`: the sweeper cannot
  revoke it, only a SIGTERM of the runner frees the target. Meanwhile every
  WAITING door on that target waits with it (other runs, the phantom-lang
  sweep, the ghost unpublish, the media-index rebuild/reconcile) and every
  request-path record delete on it goes pending. This is NEW with the fence:
  before it a hung runner blocked only itself. Mutual exclusion holds,
  liveness does not. The bound is an owner call, because each shape fails
  something legitimate: a socket/statement timeout on the target pool (fails
  a long schema evolution), or a wall-clock ceiling per unit that stops the
  keepalive and fails the unit loudly (the ceiling's size is the policy).

## Addendum 2026-10-01 — the lock lives in the bridge; R2 closed

- **The lock moved to `src/core/diffusion_bridge/target_lock.ts`** — the key
  grammar, `withTargetLock` / `withTargetLocks`, the unit bounds and keepalive,
  and the delete doors' patience (`withPatientDeleteWait`,
  `DELETE_TARGET_LOCK_BOUND_MS`, `withDeleteDoorLock`). It is a contract
  between core and the diffusion subsystem, and core never imports
  `src/diffusion` statically: in `jobs/target_fence.ts` core could not take it.
  `jobs/target_fence.ts` keeps what is the JOB's: the lease held
  `FOR KEY SHARE` under the lock (`withFencedBatch`), the pool precondition and
  `publicationTargetLockKey(plan)`. Same class, same keys, same behaviour.
- **R2 closed.** Core's files-unlink door (`diffusion_delete.ts`
  `unlinkPublishedFiles` — the record delete's settle and every retry drain) is
  a DELETE-ONLY door of `files:<type>/<service>`: SHARED, given up at once on
  the request path (the dd1758 row stays pending, R3), waited for inside a
  patient drain. Unfenced, it could unlink between a run's revalidation and its
  write (the batch then published the deleted record again) and remove files
  from under a close. A close now sees the engine change nothing in its
  directory; the missing-file tolerance stays for a hand outside the engine.
  The unlink is also DURABLE (directory fsynced): the dd1758 row flips to
  `unpublished` on its answer. Gate: diffusion_target_fence_native D4 (an
  exclusive holder leaves the file and the row pending at once; a patient drain
  waits, then unlinks; another unpublisher does not hold it off; the released
  unlink survives a power cut — `test/helpers/power_loss_model.ts`).
  Mutation-verified (unfenced, exclusive, never patient, no directory fsync:
  each red).

## Addendum 2026-10-01 (b) — the multi-target fence is all-or-none and bounded

- **Finding (closure review, S2):** `withTargetLocks` nested one `'wait'`
  try per key, in sorted order, inside the first key's transaction. The
  media-index reconcile (every `dbs/<db>`) took `sql:<A>`, then waited with no
  bound for `sql:<B>` while holding A EXCLUSIVELY — the unit keepalive kept the
  transaction under the idle bound, `lock_timeout` never applies to a
  `pg_try_*` loop. For as long as B's writer stayed busy, A's runner units
  stalled, every request-path unpublish on A went to dd1758 pending (R3), a
  pool connection stayed pinned, and `rebuild_media_index` hung.
- **Now:** `withTargetLocks(keys, work, options)` has `withTargetLock`'s modes
  and outcome, and `withTargetLock` is its one-key case. Each try takes EVERY
  key (sorted) in one transaction; a held key throws `TargetBusy` before
  `work`, the rollback releases what the try took, and the door backs off
  holding nothing. No door holds one target while waiting for another. The
  not-acquired outcome names the key that kept the door out (`busyKey`).
- **The media-index doors are bounded:** `MEDIA_INDEX_FENCE_BOUND_MS`
  (120 s) is ONE budget per reconcile, and one per rebuild with its closing
  reconcile included. A spent reconcile is DEFERRED
  (`{deferred: {busy_target}}`). Nothing is applied. The registry report
  is `drift` (a plain diff now), `applied: 0`, `detail.deferred`. A
  rebuild reports each database it could not take (`<db>: publication target
  busy …`, markers kept) and a deferred `pub/` derivation (`pub/: …`).
  `ok:false` then reaches the operator as `media.operation_failed`
  (partial failure) where it used to hang. R4 narrows accordingly: a hung
  unit no longer pins the media-index doors past their budget.
- Gate: `media_index_reconcile_fence_native` "no hold-and-wait across
  publication targets". With B held from another session for the whole leg,
  an exclusive unit and a shared (unpublish) door on A both get A within
  1.5 s while the reconcile waits. The reconcile applies nothing until B is
  free. A bounded reconcile, the registry run and a bounded rebuild each end
  and report B. Mutation-verified, 8/8 red: nested hold-and-wait restored;
  reconcile unbounded; busy target dropped; rebuild unbounded; deferral or
  per-database finding hidden; deferred counted as applied; closing
  reconcile given a fresh budget.
