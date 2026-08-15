# ERRORS_SPEC — the closed error taxonomy and envelope v2

Status: **P0 landed** (foundation, no wire change; `src/core/errors/` exists,
nothing under `src/core/api` or `src/server.ts` imports it yet). §4-8 are headed
stubs filled by P1/P2. Gates: `test/unit/error_registry_native.test.ts`,
`error_envelope_native.test.ts`, `error_converter_native.test.ts`.

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
  `z.discriminatedUnion('ok', …)`, `error.code = z.enum(ERROR_CODES)`).
- Builders: `ok(data, {requestId, notices?})`, `toErrorEnvelope(error, {requestId})`
  → `{status, body, retryAfterMs?}`, `toStructuredErr` (MCP
  `{ok:false, error:{code,message,hint?,details?}}`), `toStreamFrame`
  (`{is_running:false, error:{…}}` — a frame, not an envelope).

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

## 4. Converter law & chokepoints (P1)

(P1) — dispatch / response.ts / server.ts / tools dispatch rewire; `denied()`
deleted; `ApiResult.body` typed as `ApiEnvelope`; `rqo.ts apiResponseSchema`
re-exports `errors/schema.ts`.

## 5. Non-envelope surfaces (P2)

(P2) — MCP (`wrapError` → `toStructuredErr`, HINTS → registry), agent stream,
job_status frames, diffusion SSE frames, install wizard, error-report receiver,
`ExternalServiceError` re-home, identify `decline` → throws.

## 6. Compat window & fixture reconciliation (P1/P4)

(P1) — `test/parity/normalize.ts adoptErrorEnvelopeV2` total table; (P4) compat
removal.

## 7. Write-path propagation (P3)

(P3) — `matrix_write.ts`, `section/record/**`, `relations/save.ts` +
`*_write_failure_native` gates; CONVENTIONS §1 amendment.

## 8. Add-a-code checklist (P1)

(P1) — the checklist once the tripwires (`error_taxonomy_tripwire`,
`error_throw_ratchet`, `client_error_contract_tripwire`) exist.
