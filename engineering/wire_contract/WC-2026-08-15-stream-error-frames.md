# WC-2026-08-15-stream-error-frames — a terminal stream frame is `{is_running:false, error:{…}}`, and the persisted job result IS that frame

- **Date:** 2026-08-15 (P2 fold-in `6c43cb46e0`; diffusion half `8b71ab3cc4`).
- **Decision:** DEC-15. Normative source: `engineering/ERRORS_SPEC.md` §5.3.
  Envelope: `WC-2026-08-15-error-envelope-v2`.
- **Re-harvest: NO — impossible by definition.** The oracle is frozen; the
  native diffusion runner is TS-only anyway.

## What this covers

The SSE / NDJSON progress streams and the job records behind them:
`src/diffusion/runner.ts`, `src/diffusion/jobs/scheduler.ts`,
`src/core/tools/job_status.ts`, and the agent stream's terminal event
(whose own shape is `WC-2026-08-15-mcp-error-code-alignment`).

## Shape before (PHP, and TS until today)

A stream frame that failed borrowed the ENVELOPE's failure shape:

```json
{ "is_running": false, "result": false, "msg": "Error. Diffusion run failed: …", "errors": [] }
```

so a reader had to know both that a frame is not an envelope AND that this
particular frame pretends to be one. The cause was prose only: whatever the run
threw was stringified into `msg`, and `errors` was empty, so
`tools/tool_diffusion/js/report_model.js` recovered the causes by SPLITTING the
sentence. A job that never spawned at all was indistinguishable from a job that
ran and failed.

## Shape after (TS)

`toStreamFrame(error)` (`src/core/errors/convert.ts`) is the one producer:

```json
{ "is_running": false,
  "error": { "code": "diffusion.plan_compile_failed", "category": "caller",
             "message": "…\n- missing target\n- …", "label_key": "…",
             "retryable": false, "details": { … }? } }
```

`error` is the SAME body the HTTP envelope carries — one error object, three
surfaces. A frame is NOT an envelope: it has no `ok`, no `request_id`, and it
never carries `result:false` / `msg` / `errors`.

**The persisted job result of a failed job IS that frame.** `finishJob(jobId,
'failed', …)` stores `{...toStreamFrame(typed), msg}`, and
`progressDataFromJob` copies it verbatim into the follow stream, so a client
that attaches late sees exactly what a client that watched live saw. The `msg`
line is kept for the compat window in the report model's grammar
(`Error. Diffusion run failed: <wire message>` for the runner; the bare wire
message for an unspawned job), because `report_model.js` still splits it into
causes; it goes when that reader moves to `error.code` + `error.message`.

The codes:

- `diffusion.plan_compile_failed` — a `PlanCompileError`. PUBLIC disclosure,
  because the compiler's own `\n- ` cause list IS the message, which is what
  keeps the report's cause list alive.
- `diffusion.run_failed` — anything the run did not type. INTERNAL: the cause is
  log-only, reaching the wire only as `debug.exception` under
  `DEDALO_DEBUG_API_ERRORS=true`.
- `diffusion.runner_spawn_failed` — 503, raised by the SCHEDULER, which is the
  one place that knows the runner never started. The job is failed, NOT
  requeued: a spawn failure is a deployment fault and requeueing hot-loops the
  whole queue against it.

Everything is logged at the stream with `logError` (there is no dispatch catch
past the headers), which is also what increments `errors_total` /
`error_<code>` for these paths.

## Reason

A stream has no status line and no envelope, so the frame is the ONLY channel;
making it carry prose meant the client's failure handling was a string split,
which breaks the first time a message is reworded or translated. Reusing the
envelope's `error` object costs nothing (it is the same converter) and buys the
same three things it buys everywhere: the client dispatches on `code`, the
browser renders `label_key`, the operator counts `error_<code>`.

Making the PERSISTED result identical to the live frame removes a whole class of
"it looked different after I refreshed" reports: there is one representation of
a failed job, not a live one and a stored one that drifted.

## Gate reconciliation

`test/unit/diffusion_queue_stream_tripwire.test.ts` (frames carry `error`, never
`result:false`/`msg`/`errors` as the failure marker) ·
`agent_stream_protocol.test.ts` (the agent terminal frame) ·
`error_converter_native.test.ts` (`toStreamFrame` is the one producer) ·
the diffusion runner/scheduler native gates for the three codes and the
never-requeue rule. `src/core/tools/job_status.ts` is the remaining stream door
and is swept on its own ticket.

**Re-harvest: NOT NEEDED.** Progress streams are not in the frozen store, and
`adoptErrorEnvelopeV2` / `FROZEN_ERROR_BODIES` (`test/parity/normalize.ts`)
classify only the eight oracle-era root `result:false` BODIES listed in
`WC-2026-08-15-error-envelope-v2` — a nested `result:false` payload inside a
fixture (the `connection_status` case of
`WC-2026-08-15-diffusion-connection-status-ok-message`) is deliberately
classified as DATA, not as an envelope, by the same transform.
