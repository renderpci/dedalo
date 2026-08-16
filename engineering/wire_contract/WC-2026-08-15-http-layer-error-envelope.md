# WC-2026-08-15-http-layer-error-envelope — the pre-dispatch refusals of `src/server.ts` are envelopes too

- **Date:** 2026-08-15 (P1 chokepoints, `8b5ab764e1`).
- **Decision:** DEC-15. Normative source: `engineering/ERRORS_SPEC.md` §4
  (`src/server.ts` bullet). Envelope: `WC-2026-08-15-error-envelope-v2`;
  status: `WC-2026-08-15-error-status-is-a-channel`.
- **Re-harvest: NO — impossible by definition.** The oracle is frozen.

## What this covers

The refusals that happen BEFORE `dispatchRqo` ever runs, i.e. the ones the
dispatch catch cannot see: a body that is not JSON, a body that is JSON but not
an RQO, a route that matches nothing, and the `Bun.serve` `error` catch-all of
last resort.

## Shape before (PHP, and TS until today)

Hand-built bodies, one per site, each with its own sentence and its own idea of
what a body even is:

```
400 { "result": false, "msg": "Invalid JSON body" }
400 { "result": false, "msg": "Invalid RQO", "errors": [ …raw zod issues… ] }
404 (empty body, text/plain)
500 (Bun's own default)
```

Three problems. The RQO failure echoed the raw zod issues, which include the
caller's own submitted values — an input-reflection surface on an
unauthenticated route. The 404 had no body at all, so a client that always
parses JSON got a parse failure instead of an answer. And none of the four
carried a `request_id`, so nothing here could be joined to the access log.

## Shape after (TS)

One door — `jsonFailureResponse(error, requestId)` — which is `toErrorEnvelope`
plus `Retry-After`, and therefore the same body every other failure has:

```json
400 { "ok": false, "request_id": "…", "error": { "code": "request.malformed_body", … } }
400 { "ok": false, "request_id": "…",
      "error": { "code": "request.invalid_rqo", "category": "caller",
                 "details": { "issue_paths": "action,source.tipo,options.limit" } } }
404 { "ok": false, "request_id": "…", "error": { "code": "resource.not_found", … } }
500 { "ok": false, "request_id": "unhandled", "error": { "code": "internal.unexpected", … } }
```

- `request.invalid_rqo` carries `details.issue_paths`: the zod issue PATHS
  only, comma-joined and clamped to 200 characters. Never the issue objects,
  never a value the caller sent. A path is enough to fix a request and carries
  nothing back.
- `resource.not_found` is ONE shape for every route miss — no existence leak
  and no per-route sentence.
- The `Bun.serve` catch-all uses the literal request id `"unhandled"`, because
  by definition no request context survived to that point. It is the honest
  value, not a fabricated uuid.
- Every failure `Response` is `application/json` and carries the baseline
  security headers, exactly like a success.
- Non-API routes (static files, the dev media route) keep their own semantics
  — Range handling, fail-closed media 404s. Only their 404 BODY is
  converter-made.

## Reason

A client that must parse two different failure formats depending on how far the
request got is a client that will get one of them wrong — and the ones it got
wrong were precisely the pre-dispatch refusals, which is why a malformed body
surfaced in the browser as a transport error rather than as the caller fault it
is. Giving these four sites the same envelope also gives them the same
observability (`request_id`, `errors_total`, `error_<code>`) and the same
disclosure ladder, which is what removed the zod-issue reflection: once the body
is built by the converter, only declared `details_keys` scalars can reach it.

## Gate reconciliation

`test/unit/dispatch_error_native.test.ts` (the four codes and statuses over
real HTTP) · `error_converter_native.test.ts` (the `issue_paths` clamp; no zod
issue object survives) · `error_envelope_native.test.ts` ·
`http_headers_tripwire`-family gates for the header baseline on a failure
response.

**Re-harvest: NOT NEEDED.** These are TS-only routes; the frozen store holds no
pre-dispatch refusal (the harvest sent well-formed RQOs to real actions), so
`adoptErrorEnvelopeV2` / `FROZEN_ERROR_BODIES` in `test/parity/normalize.ts`
classify nothing from this path — their eight rows are the oracle-era bodies
listed in `WC-2026-08-15-error-envelope-v2`.
