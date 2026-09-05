# WC-2026-09-05-diffusion-lease-epoch-fence — a job row's outcome belongs to the LIVE claim, never to a revoked runner

- **Date:** 2026-09-05, adopted with the change that closes audit row PUB-13
  (findings PUB-13 / P2-32, batch 11).
- **Decision:** DEC-12 (the invariant lands with its gates:
  `test/unit/queue_fence_native.test.ts` — the behaviour — and
  `test/unit/queue_fence_tripwire.test.ts` — the TOTAL census of every write to
  a job row).

## Shape before (PHP)

There is no PHP fossil for this seam. The old engine had no durable queue and
no runner process: `dd_diffusion_api::diffuse` published INSIDE the request and
kept progress in a per-process store (`progress_store`, 24 h, memory-backed).
A run that lost its process lost its progress; there was no row for a second
worker to take, so there was no way for two workers to disagree about one run's
ending. The wire shape this entry changes is therefore a TS-ERA one — the
`get_process_status` / follow-stream projection of `dedalo_ts_diffusion_jobs`
(WC-2026-08-01-queue-frame, WC-067) — and the divergence is from the TS engine's
own frozen behaviour, recorded here because the follow stream is a client
contract like any other.

## Shape before (TS, 2026-08-01 → 2026-09-04)

`claimNextQueuedJob` stamped `attempt = attempt + 1` and overwrote `runner`
wholesale, but nothing carried that number forward: the runner was spawned as
`--job <uuid>` alone, and `recordRunnerPid`, `heartbeatJob`, `updateJobProgress`,
`checkpointJob` and `finishJob` were each `WHERE job_id = $1`. `sweepStaleJobs`
requeues a run whose heartbeat is older than 20 s, and the next scheduler tick
claims it again — so a runner that was merely SLOW (a long target write, a
paused host, a GC stall) kept full write access to a row a SECOND runner now
owned. Observable consequences, all of them on the wire the client reads:

- the loser's `heartbeatJob` kept the row looking alive on ITS clock, so the
  sweeper could no longer heal the run the live attempt was doing;
- the loser's `updateJobProgress` moved `totals.counter`/`msg` backwards and
  appended its own lines to `errors`, which the follow stream renders verbatim;
- the loser's `checkpointJob` overwrote the live run's resume point, so a later
  crash resumed from the wrong cursor — a correctness fault in what gets
  published, not only in what is displayed;
- the loser's `finishJob` wrote `state`, `result` and `finished_at`: the follow
  stream's TERMINAL chunk reported the loser's outcome (often `completed`,
  `ok:true`) while the live attempt was still publishing. The run then looked
  finished, `list_processes` dropped it from the active set, and the second
  runner's own `finishJob` overwrote it again on a row already declared
  terminal.

The audit also observed that `sweepStaleJobs` never consulted the `pid`
`recordRunnerPid` had stored.

And `attempt` was not only un-carried, it was RESETTABLE: `requeueTerminalJob`
(the admin `requeue_job` widget action) set `attempt = 0`. That is the same
defect one level down — see the next section.

## The ABA the first fence attempt did not close

A predicate is worth exactly the uniqueness of the value it compares. The first
cut of this change fenced every mutator on `(job_id, attempt)` while the ADMIN
requeue still wrote `attempt = 0`, and the hole was measured on the suite DB:

1. runner A claims the row → epoch 1, and goes quiet without dying;
2. the sweeper exhausts the attempt budget and the row ends `failed`;
3. an admin presses requeue → `state = 'queued'`, `attempt = 0`;
4. the next claim issues epoch **1 again** to runner B;
5. runner A wakes and writes: both fence legs (`attempt = 1`,
   `state = 'running'`) match, and `heartbeatJob`, `updateJobProgress` and
   `finishJob` all land on B's live run — the exact wire corruption listed above,
   through a fully fenced mutator.

So the epoch must be STRICTLY MONOTONIC for the life of the row. The claim is
the only statement that assigns `attempt`, and only as `attempt + 1`; the retry
BUDGET is carried by `max_attempts`, which the admin requeue now grants forward
(`max_attempts = attempt + 3`, the schema default budget) instead of rewinding
the counter.

## Shape now (TS)

**The lease is `(job_id, attempt)`.** `attempt` is issued inside the claim
statement and is never lowered by anything — not by the sweeper's requeue (which
clears `runner` and `heartbeat_at` only) and not by the admin requeue (which
raises `max_attempts` instead) — so every claim of a row has a unique epoch for
the life of that row.

- the scheduler spawns `runner.ts --job <uuid> --epoch <attempt>` from the row
  it just claimed; the runner NEVER re-reads the epoch from the row (a re-read
  is a second race) and refuses to start without an integer `--epoch`;
- all five row mutators take that lease and are fenced with
  `AND attempt = $epoch AND state = 'running'`;
- zero rows affected throws the new registry code **`diffusion.lease_revoked`**
  (`conflict`/409, `severity: warn`, `disclosure: operator`, `retryable: false`,
  label `error_diffusion_lease_revoked`) and the caller writes nothing;
- the runner treats that code as an ABORT, not an outcome: it stops its
  heartbeat interval and exits WITHOUT `finishJob`, because the ending belongs
  to the live epoch. Every other failure still finishes the job as before.

**One projected value does change.** The admin queue stream (WC-067,
`listActiveJobs`) projects `attempt` and `max_attempts` verbatim. An
admin-requeued job used to come back reading `0 / 3`; it now reads
`<attempt kept> / <attempt + 3>` — e.g. `1 / 4`. Same keys, same types, same
meaning ("tries used / tries allowed"); only the numbers no longer restart,
which is what makes them a usable epoch. No client parses them for anything but
display.

So the job row and the follow stream now always report the LIVE claim's run.
A revoked runner contributes nothing: no progress, no error line, no checkpoint,
no terminal chunk. The wire VOCABULARY is unchanged — no frame, key or state
name is added or removed; what changes is WHOSE values a client can see in them.

The control plane's own writes are unfenced by construction and enumerated in
the census gate: the claim (which ISSUES the epoch), the sweep (which REVOKES
it), the owner-scoped cancel flag, the new `finalizeQueuedJob` (terminal
transition of a QUEUED row that no runner ever owned — split out of `finishJob`,
which is now lease-only) and the admin requeue.

**On the pid:** the sweeper still does not cross-check `runner.pid`, and that is
deliberate rather than dropped. A runner on another host has no pid on this one,
so pid liveness could at best cover the local deployment and would give a false
"it is still alive" for every remote runner. The epoch fence is the structural
closure the pid check was reaching for: the loser of a re-claim cannot write,
whether its process is alive, wedged or gone.

## Reason

A durable queue exists so a run survives its process. That guarantee is only
worth anything if the row has ONE owner at a time: otherwise crash recovery,
the feature that re-claims the row, is itself what produces two writers. Being
"lost" is a judgement made on a heartbeat, and a heartbeat is a guess — the
sweeper is RIGHT to requeue on it, and the requeued runner must therefore be
unable to act on its own stale belief that it still owns the run. Fencing on the
epoch makes that structural instead of probabilistic, and it is the only form
that also works for a runner on another machine, which the subsystem is designed
to allow (DEC-18b).

## Gate reconciliation

- New: `test/unit/queue_fence_native.test.ts` (DB tier) — builds the LIVE-runner
  case the three existing sweep gates never build: enqueue → real claim (epoch 1)
  → stale heartbeat → real `sweepStaleJobs` requeue → real re-claim (epoch 2),
  with the epoch-1 lease still in hand. It asserts the epoch survives the
  requeue, that all five mutators refuse it with `diffusion.lease_revoked` and
  leave the row BYTE-identical (`to_jsonb(row)` before/after), that the runner
  entrypoint refuses a revoked epoch, and — the positive control — that the
  identical calls under the epoch-2 lease all succeed and move the row. Its
  second half builds the ABA above end to end through the real functions
  (claim → budget exhaustion → sweep → `requeueTerminalJob` → re-claim) and
  asserts the post-revive epoch is strictly greater than the loser's, that the
  loser's five mutators are all still refused, and that the post-revive lease
  can write and end the run.
- New: `test/unit/queue_fence_tripwire.test.ts` (hermetic) — the TOTAL derived
  census: every DML statement addressed to the jobs table anywhere under `src/`
  or `tools/` must carry the epoch predicate or be a shrink-only exemption with
  a reason; the five mutators are pinned so no exemption can launder one; the
  checker is run against a planted unfenced mutator (and against an ALIASED
  table reference, `const T = DIFFUSION_JOBS_TABLE`, which must not escape the
  scan); a runner spawned without (or with a non-integer) `--epoch` must exit 2;
  and — the monotonicity leg — the SET clause of every job-row statement in the
  tree is read, `claimNextQueuedJob` must be the ONLY assigner of `attempt`, and
  its RHS must be a forward increment.
- Edited: `test/unit/diffusion_jobs.test.ts` (its mutator calls claim the row
  they write to; the admin-requeue gate now asserts the epoch is KEPT and the
  budget granted forward, where it asserted `attempt === 0`), `test/unit/diffusion_runner_native.test.ts` (`runJob(id, epoch)`),
  `test/unit/diffusion_dispatch_gate.test.ts` (the spawn argv is multi-line now).
- **No re-harvest is needed.** The frozen oracle store holds READ responses; the
  diffusion follow stream is a TS-era wire (WC-067 / WC-2026-08-01-queue-frame)
  with no harvested fixture, and no fixture bytes change.
