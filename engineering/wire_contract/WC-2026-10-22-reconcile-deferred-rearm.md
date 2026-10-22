# WC-2026-10-22-reconcile-deferred-rearm — a deferred scheduled reconcile is re-armed until it completes; media_index runs at boot and every 10 min

- **Date:** 2026-10-22 (audit 2026-09-26 closure, W5 owner decision 5 of 2026-10-21:
  "boot media_index reconcile deferred → (b) boot + interval schedule, re-armed until
  done"). Amends `WC-2026-09-03-maintenance-reconcile-status-widget` (row, run record and
  message shapes) and `WC-2026-09-30-diffusion-target-fence` (what follows a DEFERRED
  media_index reconcile).
- **Decision:** DEC-12 (gated: `test/unit/reconcile_scheduler_native.test.ts`;
  `reconcile_registry_tripwire` pins the gauge keys against PRODUCTION.md §6.5).
- **Shape before (TS):** the scheduler fired each `boot` definition ONCE. The boot
  `media_index` apply waits at most `MEDIA_INDEX_FENCE_BOUND_MS` (120 s) for every marker
  database's publication-target fence; a runner batch holding one past it DEFERRED the
  apply (nothing written, `detail.deferred`), and nothing ran it again until the next
  restart — the crash drift the boot run exists to heal stayed. Interval definitions ran on
  `setInterval`: a run longer than its period overlapped the next.
- **Shape after (TS):**
  - **Registry.** `ReconcileReport` gains an optional `deferred: { reason }` — the apply
    could not happen now, nothing was applied, the repair is owed. media_index sets it with
    `publication target <lock key> held by a writer past the fence budget`
    (`detail.deferred` unchanged). `ReconcileRunRecord` (the widget's `last_run`, the
    `run_reconcile` `extend.record`) gains `deferred: string | null`; the `reconcile` gauge on
    `/api/v1/counters` gains `last_deferred` per name.
  - **Schedule shape.** `ReconcileSchedule`'s interval form is `{ everyMs, atBoot? }`.
    `media_index` changes from `'boot'` to `{ everyMs: 600000, atBoot: true }`: after the
    listen AND every 10 min, auto-apply as before. The widget row's `schedule` and the
    gauge's carry that object; the client renders it `boot + every 10 min`.
  - **Scheduler.** A deferred run is re-armed after 60 s (or its period, if shorter) until
    one completes; then a `boot` definition is done and an interval one returns to its
    period. A thrown run is not retried sooner than its period. One run per name in flight
    (timer chain, never `setInterval`; a run still in flight across a stop → start is
    waited out). Each run enters the scheduler's own scope (no principal, no session,
    request id `reconcile:<name>`, the install's default langs); arming inside a
    transaction is refused (`internal.invariant`). SIGTERM clears every pending run; one
    in flight finishes and never re-arms.
  - **`run_reconcile` message.** A deferred run answers
    `<name>: drift N, nothing applied — DEFERRED: <reason>. Run it again` (was
    `drift N, applied 0`). The CLI prints the same reason and keeps exit 2.
- **Reason:** a deferred apply is an owed repair, not a finished run; and a diffusion runner
  is a separate process, so a pair torn between `dbs/K` and `pub/K` by its death happens
  while the server lives — the boot run alone cannot see it.
- **Gate reconciliation:** TS-only (the registry, its widget and gauge have no oracle shape;
  no fixture, no re-harvest). `reconcile_scheduler_native`: a deferred boot run then a later
  run heals pub/ once the writer releases; the period heals later drift; max one run in
  flight under a 20 ms period and across stop → start; a stop clears the re-arm and an
  in-flight deferred run does not re-arm; a run started inside a request scope executes in
  the scheduler's scope; arming in a transaction is refused.

## Addendum 2026-10-22 (closure review r0) — the periodic fence and the delete path

- **Finding.** The `media_index` apply holds EVERY marker database's target fence
  EXCLUSIVELY across its directory walks. A record delete on the request path takes its
  target SHARED in `try` mode (residual R3 of `WC-2026-09-30-diffusion-target-fence`):
  during the hold it leaves the unpublish pending in dd1758. A runner's hold is followed
  by a publish run, whose start drains that queue; the new periodic run is followed by
  nothing on a quiet install — the deleted record stayed public until someone published
  or pressed the retry. Before D5 that hold happened once per boot.
- **Shape after (TS):**
  - **No drift, no fence.** The registry run (`runMediaIndexReconcile`, the scheduler's
    and the Reconcile widget's door) diffs UNFENCED first; a store in sync answers
    `{ drift: 0, applied: 0, detail: { enabled: true, added: 0, removed: 0 } }` (the shape a
    fenced apply with nothing to do already had) and holds no target. Sound: the probe only
    decides whether to fence and applies nothing — drift no writer is working on reads the
    same locked or not, and a key a live writer is moving is re-derived by that writer
    (applyTableState's union recompute) or the rebuild's closing reconcile. The store's
    apply door (`reconcileMediaIndex`, the media_control widget, the rebuild) is unchanged.
  - **A hold pays its debt.** After an apply that held the fence, the run drains the
    pending-unpublish queue through the runner's own opportunistic door
    (`retryPendingUnpublishOpportunistically`: single-flight, patient, never throws). The
    report's `detail` gains an optional `pending_unpublish: { log: string[], errors: string[] }`
    — present only when the drain had something to say; an `errors` line (debt still owed)
    is also logged. `ReconcileReport`/`ReconcileRunRecord` and the gauge are unchanged.
  - **Shutdown.** The SIGTERM drain now WAITS for a scheduled run in flight
    (`drainReconcileScheduler`), within `SERVER_SHUTDOWN_GRACE_MS`, before the pool closes;
    one still running at the deadline is named in the log and abandoned with the process.
    (Was: documented as "finishes" while the shutdown never waited for it.)
- **Residual (recorded).** A delete that lands in the hold of an apply that found drift is
  still pending for the length of that one run — milliseconds to seconds — and is settled
  by the same run before it returns. The rebuild and the media_control widget's reconcile
  are operator-driven exclusive holders and keep R3's posture (the operator's retry).
- **Gate reconciliation:** `media_index_reconcile_fence_native` "a store WITHOUT drift is
  not fenced" (a shared holder of `sql:<A>` — a delete door in flight — does not defer a
  clean run; red before: deferred); `unpublish_debt_native` LAW 5 (a record deleted through
  the REAL door at the fenced diff's pub/ read is held off — pending — and the same
  `runReconcile('media_index', {apply:true})` removes its MariaDB row and settles both
  ledger rows; red before: the row stayed); `reconcile_scheduler_native` 3b (the shutdown
  drain names a run past its deadline and waits for one within it), 3c/3d (a thrown run is
  re-armed at its period, a thrown `boot` run never again); `reconcile_status_client` (the
  DEFERRED and `boot + every 10 min` sentences); `reconcile_registry_tripwire` (the
  shutdown drains the scheduler before the pool closes).
