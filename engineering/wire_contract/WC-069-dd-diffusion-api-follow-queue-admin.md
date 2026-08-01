# WC-069 — `dd_diffusion_api::follow_queue`, the admin queue stream (2026-07-29)

- **Date:** 2026-07-29.
- **Decision:** add an eighth `dd_diffusion_api` action — a global-admin SSE
  stream carrying the whole ACTIVE diffusion queue plus scheduler state, so the
  `diffusion_server_control` maintenance widget can show live publication
  progress instead of a snapshot behind a Refresh button.
- **No PHP oracle.** TS-only wire, like WC-064/065/066. The retired engine had
  no queue-wide observer at all: its `get_process_status` followed one process
  id out of an in-memory store, and the durable job queue this streams did not
  exist. There is nothing to be byte-compatible with, so nothing here is pinned
  against a fixture — the contract is the gate named below.
- **Why not the widget API.** The obvious home was a `widget_request` action on
  `diffusion_server_control`, and it cannot work:
  `dd_area_maintenance_api.ts` constructs its `ApiResult` as `{status:200, body}`
  from a `WidgetResponse` (`support.ts`), which has no `stream` slot, so
  `server.ts`'s `outcome.stream` branch can never fire for a widget action; and
  the widget transport is `data_manager.request` with `use_worker:true`, which
  never touches `response.body`. The widget therefore keeps `widget_request` for
  its mutations and opens this stream directly with
  `data_manager.request_stream` — the documented "shared/infra logic" exception
  to the widget-API policy.
- **Shape.** One frame per observable change, in the EXISTING padded SSE framing
  (`data:\n{json}` padded to 16384 then `\n\n`) so `data_manager.read_stream`
  parses it with zero client transport changes — `encodeSseChunk` and
  `encodeQueueSseChunk` share one private encoder precisely so the two wires
  cannot drift apart:

      { kind: 'diffusion_queue',            // discriminator; the client rejects
                                            // anything else, including
                                            // read_stream's synthetic first frame
        at: <epoch ms>,                     // VOLATILE — stripped from the change
                                            // signature, or a quiet queue would
                                            // emit a frame every poll
        scheduler: { running, queued, max_runners, paused, stale_after_seconds },
        jobs: [ { job_id, process_id, state, counter, total, msg,
                  cancel_requested, attempt, max_attempts } ],
        membership: '<sorted job_id join>', // the client's "set changed" test
        refresh:   <bool>,                  // membership moved since the last
                                            // frame → the client refetches the
                                            // 24h history ONCE
        reconnect?: true,                   // only on the max-lifetime frame
        errors: [] }

- **The job key set is the contract.** Nine keys, and deliberately NOT
  `mapJobToClient`'s: `spec` (the whole sanitized SQO), `checkpoint`, `result`,
  `runner`, `owner_user_id` and `errors[]` (unbounded, appended per failing
  field) are excluded. This frame is re-serialized once a second for every
  connected admin, so the narrow set is the cost bound; and because the frames
  name EVERY owner's jobs to a global admin, it is also the data-minimisation
  bound. Those fields remain available on the widget's `get_value`, which is
  read on open and on membership change — not per second.
- **Scope.** Global admin only, checked once at open, before any queue read.
  Strictly more sensitive than its owner-scoped siblings
  (`get_process_status` / `list_processes` / `cancel_process`), which is why it
  does not reuse `ownerScope()`.
- **The refusal is an SSE frame, not a JSON envelope** — a deliberate divergence
  from every other action on this class. `data_manager.request_stream` resolves
  `response.body` and discards the `Response`, so a stream client cannot observe
  a status code or a content-type; a JSON refusal yields no `data:\n…\n\n`
  framing, `read_stream` never fires `on_read`, and the caller hangs forever. A
  non-admin therefore receives one framed frame carrying
  `errors:['insufficient permissions']`, empty `jobs`, and a close. Same
  precedent as `getProcessStatusAction`'s missing-id refusal.
- **Cadence and lifetime.** 1000 ms poll (not the 500 ms diffuse cadence — the
  underlying counter moves once per `DEDALO_DIFFUSION_BATCH_RECORDS` batch, so
  polling faster only burns CPU), an UNCONDITIONAL 15 s comment heartbeat, and a
  15-minute hard lifetime whose final frame sets `reconnect:true`. The heartbeat
  is load-bearing rather than cosmetic: the only in-process signal that the peer
  is gone is the enqueue throw in `push()`, and on an idle queue the change
  signature suppresses every frame, so without it a closed browser tab would
  leave a poll loop running. The deadline bounds any leak without relying on
  Bun's `cancel()` firing on a dropped socket (untested in this codebase), and
  bounds the stale-authorization window. There is no client-settable
  `update_rate`: a queue-wide stream at the 250 ms floor `get_process_status`
  allows would be a self-inflicted DoS.
- **Reader.** The tick runs exactly one statement, `listActiveJobs`
  (`state IN ('queued','running')`, served by the partial index
  `<table>_state_idx`, jsonb projected to scalars in SQL, counts as window
  aggregates so `LIMIT 100` is an output cap and never a correctness cap). It
  must never call `listJobsForCaller` (24h/200 rows of whole jsonb columns) or
  `countPendingDiffusion` (a GIN containment COUNT over a multi-hundred-MB
  table).
- **`pg_notify` stays forward-compatibility.** `LISTEN` was evaluated and
  rejected for now: the poll is one indexed sub-millisecond statement per second
  per admin, and the runner is a separate process so the in-process fan-out
  pattern in `core/media/jobs.ts` has nothing local to observe. Recorded in
  `engineering/DIFFUSION_SPEC.md` §4.2 so it stops being re-litigated.
- **Gate reconciliation:** no fixture moves — the per-job framing bytes are
  unchanged (shared encoder, asserted by `test/unit/diffusion_sse.test.ts`), and
  `get_value`'s `mapJobToClient` shape is untouched. Held mechanically by
  `test/unit/diffusion_queue_stream_tripwire.test.ts` (key allowlist, forbidden
  fields, reader purity, query narrowness) and
  `test/unit/diffusion_queue_stream.test.ts` (quiet-when-unchanged, membership
  marker, heartbeat-on-idle, deadline, error frame, refusal frame).

### WC-069 addendum — the client consumer (2026-07-29)

Recorded with the frame because the consumer's constraints are what the frame
shape is FOR, and a future editor reading only the wire half would not see them.

- **Who reads it.** `diffusion_server_control`'s live layer
  (`client/dedalo/core/area_maintenance/widgets/diffusion_server_control/js/live_diffusion_server_control.js`),
  opened through `data_manager.request_stream` — never `widget_request`, which
  structurally cannot carry a stream (see the main entry).
- **A frame PATCHES, it never rebuilds.** The widget's own
  `refresh({destroy:true})` replaces the entire DOM; doing that once a second
  would destroy focus, the value being typed into the purge-hours input, and the
  scroll position. So a frame writes a fixed set of text nodes and one bar width.
  A ROW is rebuilt only when its structural signature changes (state /
  cancel_requested / bar shape — deliberately NOT the counter, or every frame
  would rebuild), and the 24h history is refetched only when the frame's
  `membership` marker moves. That is the whole reason `refresh` exists on the
  frame instead of the client diffing job lists itself.
- **`reconnect: true` is routine, not an error.** The 15-minute lifetime cap
  fires it; the client reopens and must not show a failure state.
- **Degradation is strictly additive.** Open failure, mid-stream drop, an
  `errors[]` frame or a non-admin refusal all leave exactly the widget that
  existed before — a static snapshot with a working Refresh button and working
  action buttons. The live layer never applies the `lock` class, never disables a
  control, and never blanks a number it can no longer refresh. A broken feed
  degrades to "not live", never to "not usable"; the state chip is the only
  place that says which.
- **The 24h `failed` count is NOT on this wire, on purpose.** The stream reads
  only ACTIVE rows, so the rollup band's failed count comes from `get_value` and
  refreshes on membership change. Its caption says "(24 h)" so a number that is
  minutes stale can never be read as a live alarm.
- **Percentages are estimates and say so.** Both the per-row bar and the band's
  aggregate derive from `total`, which is the client's enqueue-time estimate that
  the server never re-counts (`queue.ts` writes `totals.total` once). Hence the
  `(estimated)` suffix, the `Estimate exceeded` state instead of a >100% bar, and
  the aggregate being record-weighted `SUM(counter)/SUM(total)` over running jobs
  that HAVE an estimate — with the excluded count disclosed on screen rather than
  folded in silently. There is deliberately no time-remaining figure anywhere.
- Held mechanically by `test/unit/diffusion_queue_stream_tripwire.test.ts`
  (client + host + honesty + motion halves) and
  `test/unit/diffusion_queue_stream.test.ts` (the aggregate's three honesty
  rules, asserted on the pure model).
