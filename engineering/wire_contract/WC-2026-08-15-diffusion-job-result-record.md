# WC-2026-08-15-diffusion-job-result-record — a diffusion job's persisted `result` is `{ok, error?}`, never `{result:false, msg}`

- **Date:** 2026-08-15 (P1 exit — adapter/shells deleted).
- **Decision:** DEC-15. Normative source: `engineering/ERRORS_SPEC.md` §4-5
  (`toFailureRecord` in `src/core/errors/convert.ts`). Frame half:
  `WC-2026-08-15-stream-error-frames`.
- **Re-harvest: NO — impossible by definition.** The oracle is frozen;
  `test/parity/fixtures/diffusion/pinned.ts` keeps the PHP-era chunk shapes as
  history, the projection tests read whatever the row stores.

## What this covers

The `result` jsonb of a `diffusion_jobs` row (`src/diffusion/jobs/queue.ts`
`finishJob`), which the follow stream copies verbatim onto the terminal SSE
chunk as `result` (`jobs/sse.ts progressDataFromJob`) and
`tools/tool_diffusion/js/report_model.js` reads. Writers: `runner.ts`
(completed / cancelled / failed), `jobs/scheduler.ts` (runner never spawned),
`queue.ts` (`requestCancel` on a queued job, `sweepStaleJobs` past the attempt
budget).

## Shape before

```json
{ "result": true,  "msg": "OK. Request done", "tables": [] }
{ "result": false, "msg": "Partial success: 3 error(s) — see errors", "tables": [...], "errors": [...] }
{ "result": false, "msg": "Process cancelled by user" }
{ "is_running": false, "error": {…}, "msg": "Error. Diffusion run failed: …" }
{ "result": false, "msg": "Interrupted after 3 attempts (runner lost)" }
```

## Shape after

```json
{ "ok": true,  "msg": "OK. Request done", "tables": [] }
{ "ok": true,  "msg": "Partial success: 3 error(s) — see errors", "tables": [...], "errors": [...] }
{ "ok": false, "error": { "code": "diffusion.cancelled", "category": "caller", "message": "Process cancelled by user", "label_key": "error_diffusion_cancelled", "retryable": false }, "msg": "Process cancelled by user", "tables"?: [...] }
{ "ok": false, "error": { "code": "diffusion.run_failed" | "diffusion.plan_compile_failed", … }, "msg": "Error. Diffusion run failed: <error.message>" }
{ "ok": false, "error": { "code": "diffusion.runner_spawn_failed", … }, "msg": "<error.message>" }
{ "ok": false, "error": { "code": "diffusion.runner_lost", … }, "msg": "Interrupted after N attempts (runner lost)" }
```

- A job that COMPLETED with per-record field errors is `ok:true` + a non-empty
  `errors` list (diagnostic lines, ≤ 50) — a completed job is not a failure;
  "partial" is `ok === true && errors.length > 0`.
- A failure record is `toFailureRecord(error, {msg, …})`: `error` is the
  envelope error body (registry code, category, message, label_key,
  retryable), `msg` keeps the report model's headline grammar. New codes:
  `diffusion.cancelled`, `diffusion.runner_lost`.
- `is_running` is gone from the persisted result (it is a RECORD; the SSE
  chunk carries its own `is_running`).
- The legacy `data.last_update_record_response.result` boolean on a
  file-producing run is `ok === true`.

## Client readers (owned by the client sweep)

`tools/tool_diffusion/js/report_model.js`: the `sse.result.result === false ?
'partial' : 'completed'` verdict re-keys to `sse.result.ok === false` ⇒
failed/cancelled (`sse.result.error.code`), `ok === true && errors.length > 0`
⇒ partial; `.msg`, `.errors`, `.tables`, `.consolidated_files`,
`.diffusion_data`, `.diffusion_class` keep their names.

## Gates

`test/unit/diffusion_jobs.test.ts`, `diffusion_sse.test.ts`,
`diffusion_actions.test.ts`; `error_taxonomy_tripwire` A2 (no `result:false`
literal in the tree).
