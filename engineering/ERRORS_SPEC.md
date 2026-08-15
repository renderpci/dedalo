# ERRORS_SPEC — the closed error taxonomy and envelope v2

Status: **P0 landed** (foundation) — **P1 chokepoints landed 2026-08-15**
(§4: dispatch / response.ts / server.ts / tools dispatch / rqo schema on
envelope v2; the call-site sweep and the client half land in the same series).
§5 landed with P2 (MCP / streams / external fold-in, 2026-08-15); §6-8 are
headed stubs filled by P1-exit/P3/P4. Gates: `test/unit/error_registry_native.test.ts`,
`error_envelope_native.test.ts`, `error_converter_native.test.ts`,
`dispatch_error_native.test.ts`, `authorization_denial_native.test.ts`,
`session_not_logged_contract.test.ts`, `csrf_handshake.test.ts`,
`tools_dispatch.test.ts`.

## 1. Taxonomy — and why it is closed

Before this spec the engine had five disjoint failure vocabularies (HTTP
`errors[]` tokens, MCP `error.code` + a regex table over engine prose, tool
`failed()`, `ExternalErrorKind`, identify `decline()`), one dispatch catch-all
that turned every throw into HTTP 200 + a constant string, and ~400 untyped
`throw new Error(` whose text sometimes reached the wire. A client cannot act
on prose, an operator cannot count it, and a translator cannot translate it.

The taxonomy is **closed**: every failure the engine reports carries exactly
one registered code, and the registry (`src/core/errors/registry.ts`,
`ERROR_REGISTRY`) is the ONLY place a code may be born. Closed means:

- **eight categories**, each bound to one HTTP status
  (`caller` 400 · `auth` 401 · `permission` 403 · `not_found` 404 ·
  `conflict` 409 · `limit` 429 · `unavailable` 503 · `internal` 500).
  A code needing another status is another code, or a named row in
  `STATUS_EXEMPTIONS` (empty today) with its reason next to it.
- **one code per failure** — never a token array, never prose in the machine
  channel. `errors:[…]` survives only as the compat mirror (§3).
- **totality is mechanical**: `error.code` on the wire is `z.enum(ERROR_CODES)`;
  every code has a `master.json` label; label placeholders ≡ `details_keys`;
  the `external.<kind>` family is total over `ExternalErrorKind` and agrees
  with the component_external state map; every former MCP HINT is mapped.
- **the old tokens are ledgered once**: `LEGACY_TOKEN_MAP` (old token → code)
  is the single translation source for the P1 call-site sweepers and the
  parity reconciler; `MCP_HINT_CODES` the same for the MCP hint table.

Category is a **wire fact** (what the caller may do next), not a blame label:
`internal` means "the engine could not honour a well-formed request" and is the
only category whose message never varies per throw.

## 2. Registry semantics

`ErrorSpec` fields (all authored explicitly per code, none derived at runtime):

| field | meaning |
|---|---|
| `category` | one of the eight; drives `status` and client policy |
| `status` | HTTP status; must equal `CATEGORY_STATUS[category]` unless exempted |
| `label_key` | the `master.json` key the browser renders (§2.3) |
| `message` | registry-owned English (logs, MCP, curl). NEVER interpolates caller data |
| `severity` | `info` / `warn` → console.info/warn, `error` / `fatal` → console.error (`logError`) |
| `disclosure` | `public`: a vetted `publicMessage` may replace `message` on the wire; `operator`: never |
| `retryable` | may a later attempt plausibly succeed (client retry policy; `Retry-After` for limit/unavailable) |
| `details_keys?` | the ONLY `details` keys the converter puts on the wire — scalars only |
| `hint?` | model-facing next move (MCP structured errors) |
| `reason?` | named exemption: why the code exists although no engine path throws it |

### 2.1 Code grammar

`<domain>.<condition>` — `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`. The domain is
the subsystem or concept that owns the refusal (`auth`, `perm`, `request`,
`section_id`, `tool`, `mcp`, `external`, `identify`, `site_builder`, `mailer`,
`password_reset`, `diffusion`, `install`, `maintenance`, `internal`, …); the
condition names the fact, not the sentence. `isErrorInDomain(e, 'section_id')`
replaces `instanceof TypeError` at the section_id catch sites.

### 2.2 The disclosure ladder (what reaches the wire)

1. `error.message` = `spec.message` — or `publicMessage` ONLY when
   `spec.disclosure === 'public'` (`site_builder.rejected`, the identify
   operator-authored refusals, `request.invalid_options`, …).
2. `error.details` = the throw's `details` filtered to `spec.details_keys`,
   scalars only (a non-scalar under a declared key is dropped, not stringified).
3. `coordinates` (tipo / section_id / job) are LOG-ONLY; `cause` is never
   serialized. `internal.*` never echoes the wrapped exception.
4. `DEDALO_DEBUG_API_ERRORS=true` (existing key, no new one) adds
   `error.debug = {exception, stack, coordinates, cause_chain}`. The literal
   `debug` exists in exactly one file: `src/core/errors/convert.ts`.

`toDedaloError` is where classification happens: a `DedaloError` passes
through; a TDZ-shaped `ReferenceError` (raw or anywhere in the `cause`
chain) flips the process poison latch (`markProcessPoisoned`) and becomes
`internal.module_poisoned`; anything else is `internal.unexpected` carrying
the original as `cause`. So the latch fires on tool, MCP and stream paths too,
not only the dispatch catch.

### 2.3 Label convention

`label_key` defaults to `error_<code with . → _>` (`perm.out_of_scope` →
`error_perm_out_of_scope`); an existing key is reused only when it already
says the same thing (`no_access_page`, the `external_source_*` family,
`fail_to_save`, `search_failed`, `external_search_failed`). A shared label key
must be a reused pre-existing key and its codes must agree on category. Label
`{param}` placeholders ≡ `details_keys`, both ways. Labels ship in
`src/core/labels/master.json` in the same commit as the code (labels_tripwire).
Client-side transport codes have their own keys (`error_client_network|timeout|
aborted|bad_response|http_status|worker|offline`, `awaiting_busy_server`).

## 3. Envelope v2 (normative)

Every JSON API body is one of:

```json
{ "ok": true,  "request_id": "…", "data": …, "notices": [ {"code","label_key","retryable","details"?} ]?, "csrf_token"?: "…" }
{ "ok": false, "request_id": "…", "error": { "code", "category", "message", "label_key", "retryable", "details"?, "debug"? }, "csrf_token"?: "…" }
```

- `request_id` is top-level on success and failure — the one join key to the
  access log.
- **HTTP status is an error channel**: `ok:false ⇒ status ∉ 2xx`, status =
  `CATEGORY_STATUS[category]`. `limit`/`unavailable` throws may carry
  `retryAfterMs` → `Retry-After` at the chokepoint.
- `notices[]` carries non-fatal coded facts (external `source_status`,
  identify warnings, truncation) — external-service degradation is
  `ok:true + notices`, not an error.
- Schema: `src/core/errors/schema.ts` (`apiEnvelopeSchema` =
  `z.discriminatedUnion('ok', …)`, `error.code = z.enum(ERROR_CODES)`; both
  shapes `.passthrough()` for the extension keys below).
  `src/core/concepts/rqo.ts` re-exports it as `apiResponseSchema` (live
  responses); `legacyApiResponseSchema` there is ONLY for the frozen PHP-era
  fixture store (`test/parity/replay.test.ts`).
- Builders: `ok(data, {requestId, notices?, extend?})`,
  `toErrorEnvelope(error, {requestId, extend?})` → `{status, body, error,
  retryAfterMs?}`, `toStructuredErr` (MCP `{ok:false, error:{code,message,
  hint?,details?}}`), `toStreamFrame` (`{is_running:false, error:{…}}` — a
  frame, not an envelope).

### 3.0 Extension keys

A handler may put fields it OWNS at top level beside the envelope keys —
`environment`, `in_use`, `total`, `pid`, `pfile`, `job_id`, `saml_redirect`,
`dedalo_notification`, `dedalo_last_error`, `result_options`, `action`, … —
the keys the client already reads by name (PHP parity). Rules:

- passed as `extend` (`ok(data, {…, extend})`; on a failure as the throw's
  `DedaloError.extend` or the chokepoint's `ctx.extend`); the converter spreads
  it FIRST, so a reserved key (`ENVELOPE_RESERVED_KEYS`: `ok`, `request_id`,
  `data`, `notices`, `error`, and the compat trio) can never be overridden;
- `csrf_token` is appended by the dispatch chokepoint to EVERY response of a
  session (success and failure) — a handler never sets it (login excepted:
  no session yet on the context);
- an extension key on a FAILURE is exceptional and named: `start`'s
  `environment` (the labels the refused client needs to render its no-access
  page — WC-2026-08-12-authorization-denial-token) and the CSRF gate's
  `action`. Everything else a failure has to say goes in `details`.
- payload data belongs in `data`, never in an extension key: the keys above
  are the closed legacy set, and the P1-exit gate freezes it.

### 3.1 The compat block (bounded, ratchet-removed)

During the compat window the converter ALSO emits, from ONE named export
`ERROR_ENVELOPE_COMPAT` in `convert.ts` and nowhere else:

- success: `result` = mirror of `data`;
- failure: `result:false`, `msg` = `error.message` (string), `errors:[code]`.

The schema tolerates these three keys as optional passthrough. **Removal
condition:** `client_error_contract_tripwire`'s census of client reads of
`.result` / `.msg` / `.errors` reaches 0 → delete `ERROR_ENVELOPE_COMPAT`, the
schema passthrough, and the client compat branches in the same commit (P4),
with a WC entry.

## 4. Converter law & chokepoints (P1 — landed 2026-08-15)

**The one-producer law.** A wire failure body is produced by exactly one
function, `toErrorEnvelope` (`src/core/errors/convert.ts`), and a wire success
body by exactly one, `ok`. Nothing else may write `ok:`, `error:`, `result:
false`, `msg:` or `errors:` into a body — not a handler, not a helper, not a
route. Consequences:

- **Handlers THROW to fail and return `ok(data, …)` to succeed.** Gates throw.
  A helper may exist only if it THROWS (`: never`); no helper may build a body.
- **`src/core/api/dispatch.ts` is THE catch** for the JSON API: `executeRqo`
  runs gates + handler inside one `try`; the `catch` calls
  `toErrorEnvelope(error, {requestId})` (registry status; `ok:false ⇒ status ∉
  2xx`; `Retry-After` threaded as `ApiResult.retryAfterMs`), then
  `logError(error, {subsystem: '<class>::<action>', requestId})`; `csrf_token`
  is appended after (session present). Gate codes: `request.unknown_action`
  (Gate 1 AND Gate 1c-disabled — the SAME body minus request_id, so a probe
  cannot learn the intake exists), `install.not_reachable` (404),
  `install.ip_denied` (403), `auth.not_logged` (401), `auth.maintenance` (401,
  the client relogin policy keys on both), `auth.csrf_failed` (403, extension
  `action` + the fresh `csrf_token`), `perm.denied` (report intake IP).
- **The poison latch lives in `toDedaloError`** (raw error or anywhere in the
  `cause` chain), not in the catch — tool/MCP/stream conversions latch too.
- **`src/server.ts`** has one failure door, `jsonFailureResponse(error,
  requestId)`: malformed JSON → `request.malformed_body`; a body failing
  `rqoSchema` → `request.invalid_rqo` with `details.issue_paths` (comma-joined
  zod paths, ≤ 200 chars — never the raw issues); route misses →
  `resource.not_found`; the Bun.serve `error` catch-all →
  `internal.unexpected`. Every failure Response is `application/json`;
  `Retry-After` is emitted from `retryAfterMs`. Non-API routes (static, media)
  keep their semantics; only their 404 body is converter-made.
- **`src/core/tools/dispatch.ts`** gates throw `request.invalid_options`,
  `tool.invalid_name`, `tool.not_authorized`, `tool.no_server_module`,
  `tool.method_not_allowed` (+`details.method`), and the security.ts
  permission token mapped through `LEGACY_TOKEN_MAP`; `ToolResponse` IS the
  envelope (`ApiEnvelope`, extension keys for `pid`/`job_id`/streams).
- **Access log** (`core/api/access_log.ts`) carries `error_code` /
  `error_category` on an ok:false outcome.
- **`logError` severity `info`** prints the line only (no stack): an expected
  refusal (expired session) is traffic, not a fault.

**The transitional adapter (DELETED at P1 exit).**
`src/core/api/legacy_body_adapter.ts` bridges the chokepoint and the handler
bodies the call-site sweep has not converted yet: a body carrying `ok` passes
through; a legacy `result === false` body becomes a THROW of
`LEGACY_TOKEN_MAP[errors[0]]` (a non-2xx legacy status that disagrees with
the token's status wins — `unauthorized`@401 is `auth.not_logged`; else the
status default; else `request.invalid`) with the legacy `msg` as
`publicMessage` (wire only for public-disclosure codes) and the rest of the
body as extension keys; a legacy success becomes `ok(result | data,
{extend})`. Every conversion is logged (`[dispatch] LEGACY … sweep pending`).
The three names in `response.ts` (`denied` / `notAuthorized` / `notLogged`)
are throwing shells (`: never`) kept only so unswept sites compile;
`authorization_denial_native.test.ts` freezes their call-site count
shrink-only, and the P1-exit gate (wire_envelope tripwire) sets it to 0 and
deletes shells + adapter + `LegacyApiBody` / `LegacyToolResponse` together.

**Pattern for a handler (the sweep target):**

```ts
// success — data in `data`, owned legacy top-level keys as extension keys
return { status: 200, body: ok({ context, data: rows }, { requestId: context.requestId, extend: { total } }) };
// failure — throw; the dispatch catch converts (status from the registry)
throw new DedaloError('perm.denied', { coordinates: { section_tipo, section_id } });
// caller fault with a vetted sentence (only public-disclosure codes echo it)
throw new DedaloError('request.invalid_options', { publicMessage: 'options.limit must be ≤ 100', details: {…} });
```

**Add-a-code, chokepoint side:** register in `ERROR_REGISTRY` (+ label in
`master.json`, sorted); if it replaces an old token, add the token to
`LEGACY_TOKEN_MAP`; throw it. Nothing in dispatch/server changes.

## 5. Non-envelope surfaces (P2 — MCP / streams / external landed 2026-08-15)

Surfaces whose wire is not the JSON envelope, all fed by the SAME converter
family — the one-producer law of §4 holds here too: nothing but
`toStructuredErr` / `toStreamFrame` / `toErrorBody` writes an `error` object.
Gates: `test/unit/mcp_registry.test.ts`, `mcp_fields_write.test.ts`,
`agent_change_plan.test.ts`, `agent_egress_gate.test.ts`, `dd_mcp_api.test.ts`,
`agent_stream_protocol.test.ts`, `external_search_native.test.ts`,
`external_search_action_native.test.ts`, `error_registry_native.test.ts`
(former-HINT-key totality), `diffusion_queue_stream_tripwire.test.ts`.

### 5.1 MCP structured errors (`src/ai/mcp/envelope.ts`)

- The MCP failure shape is `toStructuredErr(error)`:
  `{ ok:false, error:{ code, message, hint?, details? }, …extend }`.
  `code` is a registry ErrorCode (`error.code = z.enum(ERROR_CODES)` on every
  surface); `hint` is the registry `hint` (the former envelope.ts `HINTS`
  table is DELETED — the registry is the one home; `MCP_HINT_CODES` freezes
  the former keys → codes and `error_registry_native` asserts every mapped code
  carries a hint); `details` the code's declared scalars.
- **Tools THROW `DedaloError`s** (`ToolError` and the `wrapError` regex table
  over engine prose are DELETED). The MCP-native codes are **public
  disclosure**: `mcp.*` (`label_ambiguous`, `ambiguous_match`,
  `media_too_large`, `media_path_disabled`, `plan_hash_mismatch`,
  `egress_restricted`, `write_disabled`), `request.invalid`, `resource.not_found`
  — the tool authors the sentence FOR the model as `publicMessage` ("No section
  matches 'x'", "Filter op 'y' needs a non-empty value") and it IS the wire
  message; the same reasoning as `resource.conflict`: the caller's own input
  echoed back is the whole value of a 400/404. `perm.*` stay operator (registry
  message + hint); which plan op failed rides as `extend.op_id`.
- **A payload the model needs that is not a scalar** (`candidates` of an
  ambiguous label/match) goes in the throw's `extend` and lands at TOP LEVEL
  beside `error` (spread first — `ok`/`error` can never be overridden), the
  same rule as the HTTP failure envelope's extension keys.
- `runTool` (`src/ai/mcp/registry.ts`) is the one catch: input re-validation
  → `request.invalid`, write on a read-only surface → `mcp.write_disabled`,
  off-allowlist section → `perm.section_not_writable`, then the handler; the
  catch is `toStructuredErr`. `identifier_gate.ts` throws
  `request.invalid_tipo` / `request.invalid` (typed at the source — no prose
  matching anywhere).
- The agent loop's is_error tool result content and a change plan's
  `report.failed.error` are the same structured error.

### 5.2 `dd_mcp_api` — the JSON-RPC bridge and the agent surface

- Every action's body is `ok(data)` or a throw (the dispatch chokepoint
  converts). Master switch off ⇒ `request.unknown_action` + `details.action`
  (Gate 1's own shape — a probe cannot learn the assistant exists). Option
  validation ⇒ `request.invalid` (public; the sentence names the field).
- **JSON-RPC layer keeps ITS numeric codes** and carries the envelope error
  body in `error.data`: `-32601` method not allowed, `-32602` for a
  caller-category failure (unknown tool), `-32603` otherwise. The HTTP
  envelope around a JSON-RPC error is `ok:true` (the RPC frame is the payload).
  `mcp_session_id` is the one extension key (`initialize`). The stale-session
  refusal is the typed `mcp.session_invalid` — its registry message is the
  literal an MCP client's recovery matches on.
- **Model catalog:** `ModelCatalogError` is a `DedaloError` subclass with the
  public `ai.*` codes (`ai.model_catalog_invalid` 503, `ai.models_unconfigured`
  503, `ai.model_unknown` 400, `ai.model_no_vision` 400) — the operator's own
  sentence reaches the wire again; nothing special-cases the class.
- **`agent_apply`:** a plan refused as a WHOLE throws (`mcp.write_disabled`,
  `mcp.plan_hash_mismatch`, `request.invalid`, `perm.*`); a plan that ran and
  stopped on an op is a REPORT — `data` = the MCP structured envelope
  `{ok:true, data:{applied, skipped, created, failed?}}` the plan-confirm card
  reads.

### 5.3 Stream frames — a frame, not an envelope

- `toStreamFrame(error)` = `{ is_running:false, error:{…} }` (`error` = the
  envelope error body). Frames are never `result:false/msg/errors`.
- **Agent SSE** (`agent_chat_stream`): the terminal `event: error` DATA is the
  error body itself plus the registry `hint` (`{code, category, message,
  label_key, retryable, details?, hint?}`) — the event name already says
  terminal, and `tools/tool_assistant/js/agent_stream.js` normalises exactly
  that object. A provider/transport failure mid-run is `ai.provider_failed`
  (503, retryable, hint "Retry; …") with the raw error as log-only `cause`;
  a typed failure keeps its code. Logged with `logError` at the stream (there
  is no dispatch catch past the headers).
- **Diffusion** (`diffusion/runner.ts`, `jobs/scheduler.ts`): the persisted job
  `result` of a failed job IS the follow stream's terminal frame
  (`progressDataFromJob` copies it): `{...toStreamFrame(typed), msg}` where
  `msg` keeps the report model's `Error. Diffusion run failed: <wire message>`
  grammar (`tools/tool_diffusion/js/report_model.js` splits it into causes).
  A `PlanCompileError` is `diffusion.plan_compile_failed` (public — the
  compiler's `\n- ` cause list is the message, so the report's cause list
  survives); anything else the run did not type is `diffusion.run_failed`
  (internal; the cause is log-only, `debug.exception` under
  DEDALO_DEBUG_API_ERRORS); a runner that never spawned is
  `diffusion.runner_spawn_failed` (503, never re-queued). `tools/job_status.ts`
  is the remaining stream door (own sweep).

### 5.4 External services — degradation is `ok:true` + notices

- `ExternalServiceError` (`src/external/errors.ts`) is a `DedaloError`
  subclass, code `external.<kind>` (the registry is total over
  `ExternalErrorKind`; `retryable` and `label_key` are tripwired equal to the
  component_external state map). `kind`, `service`, `origin`, `status`,
  `sectionTipo`, `remoteId`, `retryAfterMs`, `detail` stay on the instance;
  `Error.message` keeps the log grammar (`formatExternalError`:
  `[external:<service>] <kind> origin=… status=… section=… id=… <detail>`);
  origin/status/section/id are the LOG-ONLY `coordinates`. The subclasses
  `ExternalServiceNotRegisteredError` (`external.not_registered`) and
  `ExternalSearchUnsupportedError` (`external.bad_config` + `reason`) stay —
  the totality tripwire asserts them as THROWS. `transport.ts` throws
  `external.too_large` at the byte ceiling directly.
- `logExternalError` = `logError(error, {subsystem: 'external:<service>'})`
  (registry severity: `warn` for the expected degradations, `error` for the
  contract/config faults).
- **`dd_external_api::search` degradation** (`searchDegraded`): `ok:true`,
  `data:{context:[], data:[]}`, ONE notice `{code:'external.<kind>', label_key,
  retryable, details:{service, reason?}}` — the source is degraded, the request
  was not wrong (§3: degradation is never an error). During the compat window
  the same `source_status` object the record path emits rides as an extension
  key (the autocomplete chip renders from it today); removal condition: the
  widget reads `notices[]`. Supersedes WC-2026-08-06's failure shape by WC
  entry.

## 6. Compat window & fixture reconciliation (P1/P4)

(P1) — `test/parity/normalize.ts adoptErrorEnvelopeV2` total table; (P4) compat
removal.

## 7. Write-path propagation (P3)

(P3) — `matrix_write.ts`, `section/record/**`, `relations/save.ts` +
`*_write_failure_native` gates; CONVENTIONS §1 amendment.

## 8. Add-a-code checklist (P1)

(P1) — the checklist once the tripwires (`error_taxonomy_tripwire`,
`error_throw_ratchet`, `client_error_contract_tripwire`) exist.
