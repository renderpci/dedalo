# WC-2026-08-15-mcp-error-code-alignment — the MCP structured error carries a registry code, and the prose-matching table is deleted

- **Date:** 2026-08-15 (P2 fold-in, `6c43cb46e0`).
- **Decision:** DEC-15. Normative source: `engineering/ERRORS_SPEC.md` §5.1/§5.2.
  Envelope: `WC-2026-08-15-error-envelope-v2`.
- **Re-harvest: NO — impossible by definition.** The MCP surface is TS-only; the
  oracle never had one, so no fixture exists to re-harvest.

## What this covers

`src/ai/mcp/**` (the tool registry, the envelope module, the identifier gate,
the agent loop) and `src/core/api/handlers/dd_mcp_api.ts` (the JSON-RPC bridge
and the agent HTTP/SSE surface).

## Shape before (TS until today)

```json
{ "ok": false, "error": { "code": "ambiguous_match", "message": "…", "hint": "Try …" } }
```

`code` came from a private MCP-only vocabulary — the fourth of the engine's
five disjoint failure vocabularies. Worse, it was DERIVED FROM PROSE: `ToolError`
+ a `wrapError` regex table in `envelope.ts` matched the TEXT of whatever the
engine threw and mapped it onto a code, with a `HINTS` table keyed by the same
private names. So a code depended on an English sentence somewhere else in the
engine continuing to be phrased the same way — a rename in a message string
silently reclassified a model-facing error.

## Shape after (TS)

```json
{ "ok": false,
  "error": { "code": "mcp.ambiguous_match", "message": "No section matches 'x'",
             "hint": "Call dd_list_sections and pick one", "details": { … }? },
  "candidates": [ … ] }
```

- **`error.code` is an `ErrorCode`** — the same closed registry set as the HTTP
  envelope, `z.enum(ERROR_CODES)` on every surface. `toStructuredErr`
  (`src/core/errors/convert.ts`) is the ONE producer.
- **`ToolError`, the `wrapError` regex table and the `HINTS` table are
  DELETED.** MCP tools throw `DedaloError`s, typed at the source
  (`identifier_gate.ts` throws `request.invalid_tipo` / `request.invalid`), and
  `hint` comes from the registry row (`spec.hint`). `MCP_HINT_CODES` freezes the
  former HINT keys → codes so nothing was lost in the move, and
  `error_registry_native` asserts every mapped code still carries a hint. No
  prose is matched anywhere.
- **The MCP-native codes are PUBLIC disclosure** — `mcp.*`
  (`label_ambiguous`, `ambiguous_match`, `media_too_large`,
  `media_path_disabled`, `plan_hash_mismatch`, `egress_restricted`,
  `write_disabled`, `session_invalid`), plus `request.invalid` and
  `resource.not_found`. The tool authors the sentence FOR the model as
  `publicMessage` and it IS the wire message, on the same reasoning as
  `resource.conflict`: echoing the caller's own input back is the whole value of
  a 400/404 to something that is going to retry. `perm.*` stay OPERATOR
  disclosure (registry message + hint) — a model must not learn what exists
  behind a refusal.
- **A non-scalar payload the model needs** (an ambiguous label's `candidates`)
  rides in the throw's `extend` and lands at TOP LEVEL beside `error`, spread
  first, so `ok`/`error` can never be overridden. Which plan op failed rides as
  `extend.op_id`.
- **`runTool` (`src/ai/mcp/registry.ts`) is the one catch**: input
  re-validation → `request.invalid`; a write on a read-only surface →
  `mcp.write_disabled`; an off-allowlist section → `perm.section_not_writable`;
  then the handler. The catch is `toStructuredErr`. The agent loop's `is_error`
  tool-result content and a change plan's `report.failed.error` are the SAME
  structured error object.
- **JSON-RPC keeps ITS numeric codes**, with our body carried in `error.data`:
  `-32601` method not found, `-32602` for a `caller`-category failure (an
  unknown tool), `-32603` otherwise. The HTTP envelope AROUND a JSON-RPC error
  is `ok:true` — the RPC frame is the payload, and the transport succeeded.
  `mcp_session_id` is the one extension key (`initialize`). The stale-session
  refusal is the typed `mcp.session_invalid`, whose registry message is the
  literal an MCP client's recovery matches on.
- **The agent SSE terminal frame** (`agent_chat_stream`, `event: error`) is the
  envelope error body PLUS the registry hint:
  `{code, category, message, label_key, retryable, details?, hint?}` — the event
  NAME already says terminal, so the frame carries no second failure marker.
  `tools/tool_assistant/js/agent_stream.js` normalises exactly that object.
  Master switch off ⇒ `request.unknown_action` + `details.action`, Gate 1's own
  shape, so a probe cannot learn the assistant exists.
- **Model catalog:** `ModelCatalogError` is a `DedaloError` subclass carrying
  public `ai.*` codes (`ai.model_catalog_invalid` 503,
  `ai.models_unconfigured` 503, `ai.model_unknown` 400, `ai.model_no_vision`
  400), so the operator's own sentence reaches the wire again — and nothing
  special-cases the class.

## Reason

An agent is the one consumer that CANNOT read prose reliably and must branch
without a human. Classifying its errors by regex over engine English was
therefore backwards twice: the least tolerant consumer got the least stable
signal. Unifying on the registry gives the model the same code the browser and
the operator see, gives the hint one home instead of two, and makes the
poison latch (`toDedaloError` → `markProcessPoisoned` on a TDZ-shaped
`ReferenceError` anywhere in the cause chain) fire on MCP paths too — it
previously only fired in the dispatch catch, so a module-poisoned agent run
kept serving a broken process.

JSON-RPC's numeric codes stay because they are ANOTHER protocol's contract, not
ours; wrapping our body in `error.data` is the standard's own extension point,
so an MCP client needs no Dédalo-specific knowledge to remain conformant.

## Gate reconciliation

`test/unit/mcp_registry.test.ts` · `mcp_fields_write.test.ts` ·
`dd_mcp_api.test.ts` (the JSON-RPC numeric mapping and `error.data`) ·
`agent_change_plan.test.ts` · `agent_egress_gate.test.ts` ·
`agent_stream_protocol.test.ts` (the terminal SSE frame's exact keys) ·
`error_registry_native.test.ts` (former-HINT-key totality: every code in
`MCP_HINT_CODES` carries a `hint`).

**Re-harvest: NOT NEEDED** — and impossible for this surface in a second sense:
the oracle had no MCP surface at all. `adoptErrorEnvelopeV2` /
`FROZEN_ERROR_BODIES` (`test/parity/normalize.ts`) classify only the eight
oracle-era root `result:false` bodies listed in
`WC-2026-08-15-error-envelope-v2`; none of them is from this path.
