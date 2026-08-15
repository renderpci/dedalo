# WC-2026-08-15-tool-response-envelope-v2 — a tool's response IS the envelope; `failed()` and the "Error. Request failed." prefix are gone

- **Date:** 2026-08-15 (P1 sweeps `00ebfd9d9e` install/update/tools,
  `8b71ab3cc4` tools-servers-diffusion).
- **Decision:** DEC-15. Normative source: `engineering/ERRORS_SPEC.md` §4.
  Envelope half: `WC-2026-08-15-error-envelope-v2`; status half:
  `WC-2026-08-15-error-status-is-a-channel`.
- **Re-harvest: NO — impossible by definition.** The oracle is frozen.

## What this covers

Every `tool_request` body: `src/core/tools/dispatch.ts` and the ~36 tool server
modules under `tools/*/server/*.ts`. A tool action's return value REPLACES the
API envelope wholesale (that was true in PHP and is still true), so changing
the envelope changes every tool at once.

## Shape before (PHP, and TS until today)

```json
{ "result": false, "msg": "Error. Request failed. Tool is not authorized for this user", "errors": [] }
{ "result": false, "msg": "Error. Request failed", "errors": ["some tool token"] }
```

Two habits, both harmful:

- **`failed(msg)`** — a per-tool constructor that built a `result:false` body
  with the string prefix `'Error. Request failed.'` glued in front of whatever
  the tool wanted to say. Every tool owned its own copy of the failure shape,
  which is exactly the "one producer" law's opposite, and the client's only
  handle on any of it was the prose.
- **Batch results reported as whole-request failures.** A tool that processed
  120 records and could not process 3 answered `result:false` with the three
  reasons concatenated into `msg`, so the 117 successes were invisible and the
  client rendered "the request failed".

## Shape after (TS)

`ToolResponse` IS `ApiEnvelope` (`src/core/tools/module.ts`):

```ts
// success — payload in `data`, the tool's own top-level keys as extension keys
return ok({ processed, skipped }, { requestId, extend: { job_id, pid } });
// failure — THROW; the tools dispatch chokepoint converts (status from the registry)
throw new DedaloError('tool.not_authorized', { coordinates: { tool: name } });
```

- **`failed()` is deleted**, and with it the `'Error. Request failed.'` prefix.
  A failure is a thrown `DedaloError` converted by the single converter.
- **The dispatch gates throw registered codes**: `request.invalid_options`,
  `tool.invalid_name`, `tool.not_authorized`, `tool.no_server_module`,
  `tool.method_not_allowed` (+`details.method`), plus the security layer's
  permission token mapped through `LEGACY_TOKEN_MAP`. The tool-domain codes
  that name what a tool refused are registered too: `tool.invalid_target`,
  `tool.unsupported_target`, `tool.target_not_found`,
  `tool.background_not_allowed`, `tool.job_not_found`,
  `tool.dependency_unavailable`, `tool.action_failed`.
- **Per-item batch failures live INSIDE `data`.** A run that partially
  succeeded is a SUCCESS with a report: the envelope is `ok:true`, and the
  per-item outcomes are the tool's own payload shape inside `data`. The
  request-level `error` is reserved for "this run did not happen". (The same
  reasoning as `WC-2026-08-15-external-degradation-is-a-notice`: `ok` describes
  the request, not the quality of every row it touched.)
- **Named extension keys survive**, because the client reads them by name:
  `tool_hierarchy`'s `state` + `errors` (`extend: {state, errors}` —
  `tools/tool_hierarchy/server/tool_hierarchy.ts`) and
  `tool_ontology_parser`'s `errors` + `ar_msg`
  (`tools/tool_ontology_parser/server/tool_ontology_parser.ts`), alongside the
  process/stream keys (`pid`, `pfile`, `job_id`, `background_job_id`). These are
  PER-ITEM diagnostic arrays on a SUCCESSFUL run — they are not the envelope's
  `errors` compat key, and the converter's reserved-key rule
  (`ENVELOPE_RESERVED_KEYS`, spread first) is what keeps the two from ever
  colliding.
- Background start is unchanged in substance: `ok`-shaped, with the job id as
  an extension key, and the captured outcome on the job record.

## Reason

A tool response is an API response — it always was, since it replaces the
envelope wholesale — so it had no business having a second failure grammar. The
concrete costs: `tool.not_authorized` was indistinguishable from
`tool.no_server_module` without reading English; a tool that threw got the
dispatch catch-all's `200 + "Error. Request failed"`, so a crashed tool and a
refused tool looked identical to the client AND to the operator's counters; and
36 tools each owning a `failed()` call meant 36 places to fix the day the shape
moved.

Folding batch outcomes into `data` is the same correction one level down: a
partial run has information in it, and `result:false` destroyed all of it.

## Gate reconciliation

`test/unit/tools_dispatch.test.ts` (each gate code + its registry status; the
envelope shape of a tool body) · `error_throw_ratchet.test.ts` (no new untyped
`throw new Error` on the tool paths) · `error_converter_native.test.ts` ·
the per-tool native gates (`tool_hierarchy` / `tool_ontology_parser` extension
keys, `tool_error_report.test.ts`, `job_status` gates).

Transitional: `LegacyToolResponse` and `src/core/api/legacy_body_adapter.ts`
still accept an unswept `{result, msg, errors}` tool body and bring it onto the
envelope (a legacy `result:false` becomes a THROW of
`LEGACY_TOKEN_MAP[errors[0]]`, logged as `sweep pending`). Both are DELETED at
P1 exit, together with the `denied` / `notAuthorized` / `notLogged` throwing
shells in `response.ts`, whose call-site count
`authorization_denial_native.test.ts` freezes shrink-only.

**Re-harvest: NOT NEEDED.** No tool body is in the frozen store's root
`result:false` set — `FROZEN_ERROR_BODIES` in `test/parity/normalize.ts` holds
the eight oracle-era bodies listed in `WC-2026-08-15-error-envelope-v2`, and
`adoptErrorEnvelopeV2` is what reconciles those. Tool fixtures that carry a
SUCCESS body are projected by the same transform's `ok` branch
(`result` → `data`), so they diff unchanged.
