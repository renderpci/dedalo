# dd_tools_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [Tools reference](../../development/tools/reference/index.md)

API for user tools and tool requests.

## How to call

- POST JSON with `dd_api: "dd_tools_api"` and `action` set to `user_tools` or `tool_request`.

## Common fields

- `source` provides tool and context information (for `tool_request`, `source.model` is the tool name and `source.action` is the tool method).
- `options` holds tool-specific parameters; `options.ar_requested_tools` can filter `user_tools`.

## user_tools

- **Purpose:** Return the list of tools available to the authenticated user.
- **Accepts:** optional `options.ar_requested_tools` (array of tool names) and optional `source` context.
- **Returns:** array of tool descriptor objects (each object contains `name`, `label`, `url`, and other metadata).

### Example Request: user_tools

```json
{
  "dd_api": "dd_tools_api",
  "action": "user_tools",
  "options": {}
}

```

### Example Response (truncated)

```json
{
  "result": [ { "name": "tool_indexation", "label": "Indexation", "url": "/tools/indexation" } ],
  "msg": "OK. Request done successfully",
  "errors": []
}

```

## tool_request

- **Purpose:** Execute or request a tool action (used by section tools and custom tools). The tool must be authorized for the caller and its action must be in the tool's `API_ACTIONS` allowlist; dispatch is handled by `src/core/tools/dispatch.ts` (per-tool server modules live under `tools/<tool>/server/`).
- **Accepts:** `source.model` (string, tool name), `source.action` (string, tool method name), `options` (object) with tool-specific parameters.
- **Returns:** the object returned by the invoked tool method (conventionally `{ result, msg }`). On error, returns `{ result: false, msg: <error message> }`.

### Example Request: tool_request

```json
{
  "dd_api": "dd_tools_api",
  "action": "tool_request",
  "source": { "model": "tool_indexation", "action": "reindex" },
  "options": { "section_id": "1", "section_tipo": "rsc167" }
}

```

### Example Response (success)

```json
{
  "result": { "processed": 12 },
  "msg": "Reindex completed",
  "errors": []
}
```
