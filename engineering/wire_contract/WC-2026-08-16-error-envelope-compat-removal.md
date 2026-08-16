# WC-2026-08-16-error-envelope-compat-removal — the `result`/`msg`/`errors` mirror is gone from every envelope

- **Date:** 2026-08-16 (P4 contraction of the error series; the client sweeps
  `2f8ad44f03` core + `505ad279de` tools brought the compat-read census to 0,
  this entry's commit deletes the server block).
- **Decision:** DEC-15 (deliberate divergence), DEC-12 (gates in the same
  change). Normative source: `engineering/ERRORS_SPEC.md` §3 (§3.1 now records
  the removal). This entry CLOSES the compat window that
  `WC-2026-08-15-error-envelope-v2` opened — read that entry for the v2 shape;
  this one is only the subtraction.
- **Re-harvest: NO — impossible by definition.** The frozen store is untouched;
  the fixture-side transform stays and is now pinned as fixture-side ONLY.

## What this covers

Every JSON API body: `src/core/api/dispatch.ts`, `src/server.ts`,
`src/core/tools/dispatch.ts`, every handler under `src/core/api/handlers/**`
and `tools/*/server/**` — everything `ok()` / `toErrorEnvelope()` in
`src/core/errors/convert.ts` produce.

## Shape before (TS during the compat window, 2026-08-15 → 2026-08-16)

The v2 envelope PLUS a mirror of the PHP-era trio, emitted by the one named
export `ERROR_ENVELOPE_COMPAT`:

```json
{ "ok": true,  "request_id": "…", "data": {…}, "result": {…} }
{ "ok": false, "request_id": "…", "error": { "code": "perm.denied", … },
  "result": false, "msg": "Insufficient permissions", "errors": ["perm.denied"] }
```

(The PHP fossil itself — `{result, msg, errors}` with no `ok` — is documented
in `WC-2026-08-15-error-envelope-v2`.)

## Shape after (TS)

The v2 envelope and nothing else:

```json
{ "ok": true,  "request_id": "…", "data": {…}, "notices": [ … ]?, "…extension keys": …, "csrf_token": "…" }
{ "ok": false, "request_id": "…", "error": { "code": "perm.denied", "category": "permission",
  "message": "Insufficient permissions", "label_key": "error_perm_denied", "retryable": false },
  "…extension keys": …, "csrf_token": "…" }
```

- `result` is now a FORBIDDEN top-level name on both shapes:
  `ENVELOPE_FORBIDDEN_KEYS = ['result']` in `src/core/errors/schema.ts`, refused
  by a `superRefine` on `okEnvelopeSchema` / `errEnvelopeSchema` (and so on the
  discriminated union). It is not an envelope key and not an extension key — a
  handler that put `result` in `extend` would fail every schema-parsing gate,
  and none does (a tree-wide scan of `extend` objects found no `result` key).
- `msg` and `errors` are NOT forbidden and NOT reserved: they are
  handler-owned EXTENSION KEYS (ERRORS_SPEC §3.0) that a handler writes on
  purpose — the maintenance widgets (`msg` / `errors` beside `data:true`), the
  install probes, the lock surface, and the two named FAILURE extensions
  (`tool_hierarchy` `extend:{state, errors}`, `tool_ontology_parser`
  `extend:{errors, ar_msg}`). The converter never writes them; the client core
  reads them ONLY on success through `response_extension(api_response, key)`
  (`client/dedalo/core/common/js/api_error.js`), and the two failure readers
  read `api_response.errors` by name, deliberately, on the failure branch.
  `ENVELOPE_RESERVED_KEYS` is therefore exactly `ok`, `request_id`, `data`,
  `notices`, `error`.
- The client side has no v1 tolerance left: `error_policy.js` carries no bare
  `not_logged` / `csrf_failed` / `not_authorized` rows (they fall to `*`),
  `render_api_error.js` / `render_common.js` / `page.js` key on `auth.*` /
  `perm.*` only, `normalize_api_error` classifies on `ok:false + error.code`
  only (unchanged since P1), and no `?? result` fallback exists.

## Reason

The mirror existed for exactly one consumer: a client file that still read
`.result` / `.msg` / `.errors` off a body. That census (one counter,
`scripts/lib/client_compat_census.ts`, over `client/dedalo/**/*.js` +
`tools/*/js/**/*.js`, comments and strings blanked, the named non-envelope
shapes excused one expression at a time WITH a reason) reached **0 of 648
files** on 2026-08-16 — the removal condition ERRORS_SPEC §3.1 and
`WC-2026-08-15-error-envelope-v2` set. Keeping the mirror after that is not
compatibility, it is a second, untyped copy of the payload on every response
(the payload of a large `read` was serialised TWICE) and a standing invitation
to write a new v1 read. Deleting it also makes the schema honest: `result` is
refused, so a converter regression back to the PHP prose can never pass a
gate.

## Gate reconciliation

- `test/unit/client_error_contract_tripwire.test.ts` — rule 3 is no longer a
  ratchet: the census must be ZERO (there is no baseline file any more —
  `engineering/client_compat_read_baseline.json` and its generator were
  deleted; a ratchet frozen at 0 is a second copy of a constant), and
  `convert.ts` must carry no `ERROR_ENVELOPE_COMPAT` and write no `result:`
  key; `schema.ts` must name `result` in `ENVELOPE_FORBIDDEN_KEYS`. Rule 4
  keeps `NON_ENVELOPE_READS` live (a stale exemption is red). Report:
  `bun run scripts/client_compat_census.ts`.
- `test/unit/error_envelope_native.test.ts` — a failure body is exactly
  `{ok, request_id, error}`; `result` refused on both shapes; a `msg`/`errors`
  extension on success still parses; `extend:{result}` cannot smuggle it in.
- `test/unit/error_taxonomy_tripwire.test.ts` A2 — `result: false` is zero
  everywhere INCLUDING `src/core/errors/`, and `convert.ts` writes no
  `result` key (`countResultKeys`).
- `test/unit/error_converter_native.test.ts`, `dispatch_error_native.test.ts`
  — the compat asserts became absence asserts.
- Parity: `test/parity/normalize.ts adoptErrorEnvelopeV2` is FIXTURE-SIDE ONLY
  — a body carrying `ok` is refused (`kind:'ts_body_refused'`, `matched:false`),
  so a TS body can never be projected and a server regression that put
  `result:false` back on a TS body reddens the gate that fed it;
  `test/parity/error_envelope_transform.test.ts` pins that. Every parity gate
  that read `ts.body.result` now reads `ts.body.data` (the PHP/fixture side
  keeps `.result` — it is the frozen shape). **Re-harvest: NOT NEEDED.**
- Client suite (`bun run test:client`): `test_error_policy` asserts the bare
  tokens fall to `*`, `test_render_api_error` asserts a bare token gets no
  auth affordance, `test_api_error` asserts a `result:false` body without
  `ok:false` is never a failure.

## Addendum, 2026-08-16 — the census corpus was one root short

The census as cut for this entry scanned `client/dedalo/**` and
`tools/*/js/**`. Browser JS that lives under `src/` because it is SERVED with
the tool subsystem — `src/core/tools/client/js/*.js` — was in NEITHER root, so
its two envelope reads survived the sweep that this removal's condition was
measured against:

- `tool_common.js` `build()`: `self.context = api_response.result?.[0]` →
  after the mirror's deletion this is `undefined` for EVERY tool, so
  `self.context` was null, and `ui.tool.build_wrapper_edit` rendered every tool
  header with an empty label (`context.label || ''`) — the visible symptom, on
  all 36 tools, plus a console `Error. Tool context not loaded from API
  response`.
- `tool_common.js` `open_tool()`: the same `.result` read on the path that
  resolves a tool context from a NAME string.

Both now read through `response_data()`. The corpus is client code by
DESTINATION, not by directory: `SCAN_ROOTS` gained
`{root:'src', glob:'**/client/js/**/*.js'}`, and
`client_error_contract_tripwire` pins `tool_common.js` /
`render_tool_common.js` as present in the census, so the root cannot go quiet
again. Reverting the fix with the widened root in place reddens rule 3 (4
`result` tokens in one file) — the gate that should have caught it, now does.

Server side unchanged: no re-cut, no re-harvest, no shape change.
