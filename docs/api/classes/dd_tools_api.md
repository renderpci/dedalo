# dd_tools_api

Overview

- API for user tools and tool requests.

How to call

- POST JSON with `dd_api: "dd_tools_api"` and `action` set to `user_tools` or `tool_request`.

Common fields

- `source` provides tool/context information (for `tool_request`).
- `options` holds tool-specific parameters; `options.ar_requested_tools` can filter `user_tools`.

Methods

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

- **Purpose:** Execute or request a tool action (used by section tools and custom tools). The tool class file must exist under `DEDALO_TOOLS_PATH/<tool>/class.<tool>.php` and the method must be a static method that accepts a single object.
- **Accepts:** `source.model` (string, tool class name), `source.action` (string, tool method name), `options` (object) with tool-specific parameters. Optional `options.background_running` (bool) to run in background.
- **Returns:** the object returned by the invoked tool method (conventionally `{ result: mixed, msg: string }`). On error, returns `{ result: false, msg: <error message> }`.

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
