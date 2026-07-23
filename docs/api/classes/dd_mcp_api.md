# dd_mcp_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [The assistant](../../core/ai/assistant/index.md) · [dispatch](dispatch.md)

The in-process bridge between the web client's assistant (`tool_assistant`) and the shared MCP tool registry + agent loop. Unlike the previous engine's proxy to a separate MCP server process, this handler serves the JSON-RPC envelope in-process from the same tool registry the stdio server registers — no child process, no cookie forwarding.

Registered actions (`src/core/api/dispatch.ts`): `mcp_proxy`, `agent_models`, `agent_chat`, `agent_chat_stream`, `agent_apply`.

## How to call

- POST JSON to `/api/v1/json` (or the client-relative `/dedalo/core/api/v1/json`) with `dd_api: "dd_mcp_api"` and `action: "<method>"`.

## Notes

- Every action **fails closed** unless `DEDALO_AGENT_HTTP_ENABLED=true`; while off, each returns the generic `Undefined or unauthorized method (action)` denial (no existence leak).
- Every call runs under a **session** and passes the **CSRF** gate (none of these actions is login- or CSRF-exempt), as the logged-in user's principal — never a service principal.
- **Write capability** requires `DEDALO_AGENT_ALLOW_WRITE=true` and is **denied to global-admin principals** per request (the confused-deputy wall); `DEDALO_AGENT_WRITE_SECTIONS` narrows the writable sections. Write mode returns a change plan for confirmation — the loop never writes on its own.
- Egress: when the chosen catalog model's egress class is `external`, the loop gates every record-content tool call through the default-deny egress policy, so restricted repository content never reaches a third-party provider. Full config: [the assistant docs](../../core/ai/assistant/configuration.md).

## mcp_proxy

### Purpose

The JSON-RPC 2.0 bridge to the MCP tool registry (the legacy `mcp_client.js` contract).

### Accepts

- `options`: object (required) — the JSON-RPC envelope (`jsonrpc`, `method`, `params`, `id`). Allowlisted methods only: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`.
- `mcp_session_id`: string (required for every method except `initialize`) — the id `initialize` minted.

### Returns

The JSON-RPC result wrapped in the Dédalo envelope. `initialize` mints a stateless `mcp_session_id`; a stale/missing id on any other method returns the literal `{ result: false, msg: "No valid MCP session ID provided" }` the client's auto-recovery keys on. A disallowed method returns a JSON-RPC `-32601` error; an unknown tool a `-32602`.

### Example Request

```json
{
  "dd_api": "dd_mcp_api",
  "action": "mcp_proxy",
  "options": { "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} },
  "mcp_session_id": "…"
}
```

## agent_models

### Purpose

Return the client-safe model catalog and whether write mode is available to this principal.

### Accepts

- No arguments.

### Returns

`{ result: true, data: { models: [ { id, label, egress, vision } ], write_allowed: bool } }`. Endpoints, key names and provider-native model ids are never exposed. A broken catalog answers a `denied()` with a clear operator message.

### Example Request

```json
{
  "dd_api": "dd_mcp_api",
  "action": "agent_models"
}
```

## agent_chat

### Purpose

Run the agent loop as the logged-in user and return a single JSON response.

### Accepts

- `options`: object (required)
  - `question`: string (required, ≤ 32768 chars)
  - `images`: array (optional, ≤ 8) — `{ media_type: image/jpeg|png|webp|gif, data_base64 }`, size-capped
  - `history`: array (optional, ≤ 64 entries) — `{ role: user|assistant, text }`
  - `context`: object (optional) — UI context (`section_tipo`, `section_id`, `component_tipo`, `mode`, `summary`)
  - `mode`: string (optional) — `write` requests write mode (honored only when write is enabled and the caller is not a global admin)
  - `model`: string (optional) — a catalog model id

### Returns

`{ result: true, data: { answer, stop, change_plan, turns, model, usage, history } }`. In write mode `change_plan` carries a plan for confirmation (never written directly). A validation failure or catalog/config problem returns a 400 `denied()`.

### Example Request

```json
{
  "dd_api": "dd_mcp_api",
  "action": "agent_chat",
  "options": { "question": "Summarize this record", "context": { "section_tipo": "oh1", "section_id": "3" } }
}
```

## agent_chat_stream

### Purpose

The SSE twin of `agent_chat` — the new `tool_assistant` chat surface.

### Accepts

- Same `options` as `agent_chat`.

### Returns

An `text/event-stream` of `start` / `thinking` / `text` / `tool_use` / `tool_result` / `iteration` / `final` / `error` frames plus `: ping` heartbeats. Validation failures **before** the stream opens return the normal JSON `denied()` (the client branches on content-type). A client abort stops delivery, not the in-flight loop (documented v1 limitation).

### Example Request

```json
{
  "dd_api": "dd_mcp_api",
  "action": "agent_chat_stream",
  "options": { "question": "What changed in this section recently?" }
}
```

## agent_apply

### Purpose

Execute a human-confirmed change plan (the plan the confirm card commits into).

### Accepts

- `options`: object (required)
  - `plan`: object (required) — the change plan returned by a write-mode chat
  - `plan_hash`: string (required) — the plan's hash, re-checked before applying

### Returns

`{ result: bool, msg: string, data: <envelope> }`. The plan is hash-rechecked and every gate re-validated before any write; `plan` or `plan_hash` missing returns a 400 `denied()`.

### Example Request

```json
{
  "dd_api": "dd_mcp_api",
  "action": "agent_apply",
  "options": { "plan": { /* … */ }, "plan_hash": "…" }
}
```
