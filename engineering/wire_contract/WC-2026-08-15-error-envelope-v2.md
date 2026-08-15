# WC-2026-08-15-error-envelope-v2 — every JSON API body becomes `{ok, request_id, data|error}`

- **Date:** 2026-08-15 (the P0→P2 error series: `8b5ab764e1` chokepoints +
  converter, `2ab3b1b55b` / `00ebfd9d9e` / `2fe4c51d55` / `8b71ab3cc4` the P1
  call-site sweeps, `4470734785` the client half, `6c43cb46e0` the P2 fold-in).
- **Decision:** DEC-15 (deliberate divergence), DEC-12 (gates in the same
  change). Normative source: `engineering/ERRORS_SPEC.md` §1-§4 — this entry is
  the WIRE half of it, nothing more.
- **Re-harvest: NO — impossible by definition.** The oracle is frozen; this is a
  deliberate contract edit, and the gate side absorbs it by TRANSFORM (below).

## What this covers

Every body served by the JSON API: `src/core/api/dispatch.ts`, `src/server.ts`,
`src/core/tools/dispatch.ts`, and every handler under
`src/core/api/handlers/**`. The non-envelope surfaces fed by the same converter
family are their own entries — `WC-2026-08-15-tool-response-envelope-v2`,
`WC-2026-08-15-http-layer-error-envelope`,
`WC-2026-08-15-mcp-error-code-alignment`,
`WC-2026-08-15-stream-error-frames` — and the status half is
`WC-2026-08-15-error-status-is-a-channel`.

## Shape before (PHP, and TS until today)

One shape for success and failure, discriminated by a field whose TYPE was the
discriminator:

```json
{ "result": { "context": [ … ], "data": [ … ] }, "msg": "OK. Request done", "errors": [] }
{ "result": false, "msg": "Error. Invalid or empty locators", "errors": ["bad_locators"] }
```

Three properties of that shape, each a defect:

1. **`result` is polymorphic.** It is the payload on success and the literal
   `false` on failure, so no consumer can type it and no schema can discriminate
   it. A handler that legitimately returns `false` as DATA (a boolean probe) is
   indistinguishable from a refusal — which is exactly why
   `test/parity/normalize.ts` has to special-case `result:false` bodies that
   carry no `errors` (the nested `connection_status` payload of WC-067).
2. **`errors` is an open string array**, sometimes machine tokens
   (`bad_locators`), sometimes the human sentence repeated
   (`['Insufficient permissions to read']`, the defect
   WC-2026-08-12-authorization-denial-token removed for 403 and WC-051 for
   401), sometimes `[]` with the whole diagnosis living in `msg` prose.
   Five disjoint vocabularies existed across the engine (HTTP tokens, MCP
   `error.code` + a regex table over engine prose, tool `failed()`,
   `ExternalErrorKind`, identify `decline()`), and none of them was closed.
3. **HTTP status carried no information** — the dispatch catch-all turned every
   throw into `200 + result:false + "Error. Request failed"`, so a caller had to
   parse prose to learn whether it had been refused, throttled, or crashed.

## Shape after (TS)

Two shapes, discriminated by a BOOLEAN:

```json
{ "ok": true,  "request_id": "…", "data": …, "notices": [ … ]?, "…extension keys": …, "csrf_token": "…" }
{ "ok": false, "request_id": "…",
  "error": { "code": "section.bad_locators", "category": "caller",
             "message": "Invalid or empty locators",
             "label_key": "error_section_bad_locators",
             "retryable": false,
             "details": { … }?, "debug": { … }? },
  "…extension keys": …, "csrf_token": "…" }
```

- `request_id` is TOP-LEVEL on both — the one join key to the access log, which
  now carries `error_code` / `error_category` on an `ok:false` outcome.
- `error.code` is a member of the CLOSED registry set: `ERROR_REGISTRY` in
  `src/core/errors/registry.ts` is the only place a code may be born, and
  `error.code` on the wire is literally `z.enum(ERROR_CODES)`
  (`src/core/errors/schema.ts`). Grammar: `<domain>.<condition>`,
  `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$` — `auth.not_logged`, `perm.denied`,
  `request.invalid_rqo`, `record.delete_children_refused`, `external.timeout`,
  `identify.empty_index`, `diffusion.run_failed`, `internal.unexpected`, …
  A code that needs a new HTTP status is a new code, not a new status.
- `error.message` is REGISTRY-owned English and never interpolates caller data;
  a vetted `publicMessage` replaces it only for `disclosure: 'public'` codes.
  `error.label_key` is what the browser actually renders (the labels catalog is
  the translation surface — WC-033/WC-034), so the sentence on the wire is for
  logs, curl and models, not for the curator's eyes.
- `error.details` carries ONLY the code's declared `details_keys`, scalars only.
  `coordinates` (tipo / section_id / job) and `cause` are LOG-ONLY.
  `error.debug` exists only under `DEDALO_DEBUG_API_ERRORS=true`, and the
  literal `debug` lives in exactly one file (`src/core/errors/convert.ts`).
- `notices[]` is the new non-fatal channel: `{code, label_key, retryable,
  details?}` on an `ok:true` body. Degradation is not an error —
  `WC-2026-08-15-external-degradation-is-a-notice`.
- **Extension keys** stay: `environment`, `in_use`, `total`, `pid`, `pfile`,
  `job_id`, `saml_redirect`, `dedalo_notification`, `dedalo_last_error`,
  `result_options`, `action`, `source_status`, … ride at top level beside the
  envelope keys, because the client already reads them by name. They are spread
  FIRST, so `ENVELOPE_RESERVED_KEYS` (`ok`, `request_id`, `data`, `notices`,
  `error`, and the compat trio) can never be overridden by one. Payload data
  belongs in `data`; the extension set is the closed legacy list.
- `csrf_token` is appended by the dispatch chokepoint to EVERY response of a
  session, success and failure alike (unchanged behaviour, now stated).

**One producer.** A failure body is built by exactly one function,
`toErrorEnvelope`, and a success body by exactly one, `ok` — both in
`src/core/errors/convert.ts`. Nothing else may write `ok:`, `error:`,
`result:false`, `msg:` or `errors:` into a body. Handlers THROW to fail and
`return ok(data, …)` to succeed; gates throw; a helper may exist only if its
return type is `never`.

## Reason

The consumer is the client, and the client could not act on any of it. `result`
polymorphism meant `data_manager` had to guess; open `errors` meant every
recovery branch (re-login, no-access page, retry) was matched against a literal
that the server had stopped emitting years earlier — WC-051 found the whole
401 re-login path was unreachable dead code for that reason, and
WC-2026-08-12 found the same for 403. Prose in the machine channel is also
untranslatable (a `label_key` is), uncountable (an operator cannot graph
`"Error. Request failed"`), and unsafe (the sentence is where engine internals
leak). A closed code set fixes all four at once: the client dispatches on
`error.code`, the browser renders `error.label_key`, the operator counts
`error_<code>` (`src/core/errors/log.ts` increments `errors_total` and
`error_<code>` per `logError`), and the disclosure ladder decides — per code,
authored, not inferred — what a sentence is allowed to say.

`ok` as a BOOLEAN discriminator is what makes the schema a
`z.discriminatedUnion`, i.e. what makes totality mechanical rather than
aspirational: every code has a `master.json` label, label placeholders ≡
`details_keys`, and the `external.<kind>` family is total over
`ExternalErrorKind`.

## The compat block (bounded, ratchet-removed)

During the compat window the converter ALSO emits the legacy trio, from ONE
named export `ERROR_ENVELOPE_COMPAT` in `convert.ts` and nowhere else:

- success: `result` = a mirror of `data`;
- failure: `result:false`, `msg` = `error.message`, `errors` = `[code]`
  (a ONE-element array — the machine token, never the sentence).

`okEnvelopeSchema` / `errEnvelopeSchema` tolerate the three keys as optional
passthrough. **Removal condition:** the `client_error_contract_tripwire` census
of client reads of `.result` / `.msg` / `.errors` reaches 0 → delete
`ERROR_ENVELOPE_COMPAT`, the schema passthrough and the client compat branches
in ONE commit (P4), with its own WC entry. Until then a v1 consumer that only
ever read `result`/`msg`/`errors` still works, and `errors:[code]` is strictly
better than what it read before.

## Gate reconciliation

Native gates (the write-path contracts of record):
`test/unit/error_registry_native.test.ts` (closed set, grammar, label/details
totality, former-HINT keys), `error_envelope_native.test.ts`,
`error_converter_native.test.ts` (the disclosure ladder, the debug block, the
compat trio), `dispatch_error_native.test.ts` (the chokepoint's gate codes and
statuses), `error_throw_ratchet.test.ts`, `tools_dispatch.test.ts`,
`session_not_logged_contract.test.ts`, `authorization_denial_native.test.ts`,
`csrf_handshake.test.ts`.

**Re-harvest: NOT NEEDED.** The frozen fixture store is untouched. The gate side
absorbs the divergence with a TRANSFORM, the WC-001 pattern:
`adoptErrorEnvelopeV2` in `test/parity/normalize.ts` projects a frozen PHP-era
body onto the v2 shape before any diff — `result:true|payload` →
`{ok:true, data}`, `result:false` → `{ok:false, error:{code, details?}}` — and
it is TOTAL by construction: the projection is looked up in
`FROZEN_ERROR_BODIES` by the EXACT `(msg, errors)` bytes, and an unlisted
`result:false` body THROWS rather than being classified from its text. Every
caller must assert `matched === true`, so a transform that quietly no-ops is a
red gate, not a silent pass. `test/parity/error_envelope_transform.test.ts`
pins the table against the store.

`FROZEN_ERROR_BODIES` — every root `result:false` body in
`test/parity/fixtures/oracle_harvest/` (8 bodies, 7 files):

| # | gate | frozen `msg` (abridged) | frozen `errors` | v2 code |
|---|---|---|---|---|
| 1 | `section_terms_differential` | `Error. Invalid or empty locators` | `["bad_locators"]` | `section.bad_locators` |
| 2 | `indexation_grid_differential` | `Error. Request failed Trigger Error: (get_indexation_grid) Empty source properties (section_tipo, section_id, tipo are mandatory)` | `["invalid rqo source"]` | `request.invalid_source` |
| 3 | `get_widget_data_differential` | `[" Empty widget_obj for widget no_such_widget"]` (a string ARRAY) | `[]` | `widget.not_defined` |
| 4 | `get_widget_data_differential` | `[" Empty defined widgets for dd_component_info : Nombre [rsc85] "]` | `[]` | `widget.empty` |
| 5 | `delete_children_guard_differential` | `Error. Request failed. [4] Some records were not deleted: […]` | `["Se ha omitido la eliminación…", "record not deleted: 1363"]` | `record.delete_children_refused` + `details.not_deleted:[1363]` |
| 6 | `relation_corpus_config` | `Throwable Exception… locator::set_section_id(): Argument #1 must be of type string\|int, null given` | `["An unexpected error occurred"]` | — (`php_fault_not_reproduced`) |
| 7 | `section_list_css_differential` | `Throwable Exception… Call to a member function get_json() on false` | `["An unexpected error occurred"]` | — (`php_fault_not_reproduced`) |
| 8 | `section_tool_start_differential` | `Throwable Exception… Call to a member function set_lang() on false` | `["An unexpected error occurred"]` | — (`php_fault_not_reproduced`) |

Rows 1-5 project to a code. Row 5's `details.not_deleted` is PARSED from the
frozen text (both the pretty-printed array in `msg` and the `record not
deleted: <id>` lines in `errors` must agree, or the table refuses to build) and
the ids are INTS, per `WC-2026-08-10-section-id-int-canonical` — the DETAILS
carry typed scalars, never the sentence they were derived from.

Rows 6-8 are PHP CRASHES surfaced through the old dd_manager `Throwable` catch.
TS does not reproduce PHP faults, so those gates assert nothing about the error
today: the transform reports `matched:true` (the totality assertion holds) with
`projection:null` (no equality can be built on it). The registry carries
`php_fault.not_reproduced` and `envelope.not_an_envelope` as NAMED rows with
their `reason` field, precisely so this exemption is written down rather than
implied.
