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
