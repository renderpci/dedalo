# dd_tools_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [Tools reference](../../development/tools/reference/index.md) · [dispatch](dispatch.md)

The tools surface: list the tools a user may open, and invoke one tool method.

Registered actions (`src/core/api/handlers/dd_tools_api.ts`): `user_tools`, `tool_request`.

## How to call

- POST JSON to `/api/v1/json` with `dd_api: "dd_tools_api"` and `action` set to one of the two.
- Both require a session and pass the dispatcher's CSRF gate.
- Envelope: **v2** on both. Success is `{ ok: true, request_id, data, … }`; a refusal is `{ ok: false, request_id, error: { code, category, message, label_key, retryable } }` with the registry's HTTP status. There is no `result` key — the v1 `{ result, msg, errors }` shape was removed on 2026-08-16. `msg` and `errors` still exist as **handler-owned extension keys on success** for the few tools that emit them; they are never an error channel.

## user_tools

### Purpose

Return the tools the authenticated user is allowed to open — the toolbar's list.

### Accepts

- `options.ar_requested_tools`: array of string (optional) — filter the answer down to these tool names.

### Returns

`data` is an array of tool descriptors, each `{ typo: "ddo", type: "tool", name, label, model, section_tipo, mode: "edit", icon, css: { url }, show_in_inspector, show_in_component, properties? }`. `properties` is present only when the tool declares view / open_as properties.

A global admin receives every **active** tool; everyone else receives the set their profile grants plus the tools marked always-active.

### Example request

```json
{
  "dd_api": "dd_tools_api",
  "action": "user_tools",
  "options": { "ar_requested_tools": ["tool_time_machine"] }
}
```

### Example response (truncated)

```json
{
  "ok": true,
  "request_id": "c0ffee60",
  "data": [
    {
      "typo": "ddo",
      "type": "tool",
      "name": "tool_time_machine",
      "label": "Time Machine",
      "model": "tool_time_machine",
      "section_tipo": "dd1324",
      "mode": "edit",
      "icon": "…",
      "css": { "url": "…" },
      "show_in_inspector": true,
      "show_in_component": true
    }
  ]
}
```

## tool_request

### Purpose

Invoke one method of one tool. `source.model` names the tool, `source.action` the method, and `options` carries the method arguments.

### Accepts

- `source.model`: string (required) — the tool name; must match `tool_[a-z0-9_]+`.
- `source.action`: string (required) — the method, which must be in that tool's own action registry.
- `options`: object (optional) — the method arguments. A non-object is refused.

### Gates, in order

1. `options` must be an object.
2. The tool name must match the strict pattern — checked **before** any lookup.
3. The tool must be active and authorized for the caller. For a non-admin an unknown tool is refused as *not authorized* rather than *unknown*, so the answer leaks no existence.
4. Two reserved framework methods are served here for every tool that can run in the background: the job **status** poll and the caller's job **list**. They need no per-tool registration.
5. The tool must have a loaded server module.
6. The method must be in the tool's explicit action registry.
7. The method's declared permission (a section-level or `(section_tipo, tipo)` pair gate at its declared minimum level) must pass.

### Returns

The tool's own envelope-v2 body: `data` is the method's payload, and a tool may add its own top-level extension keys. A tool that streams (for example an export writing NDJSON) answers with a stream instead of a buffered body; the response's `Content-Type` is the tool's declared stream type, defaulting to `application/x-ndjson; charset=utf-8`.

### Errors

| code | when |
| --- | --- |
| `request.invalid_options` | `options` is present and is not an object. |
| `tool.invalid_name` | the name does not match `tool_[a-z0-9_]+` — or, for a global admin, names no active tool. |
| `tool.not_authorized` | a non-admin naming a tool their profile does not grant. |
| `tool.no_server_module` | the tool has no loaded server module. |
| `tool.method_not_allowed` | the method is not in the tool's action registry. |
| `perm.denied` | the method's declared permission gate refused. |

### Example request

```json
{
  "dd_api": "dd_tools_api",
  "action": "tool_request",
  "source": { "model": "tool_time_machine", "action": "apply_value" },
  "options": { "section_tipo": "oh1", "section_id": 368, "tipo": "oh16" }
}
```

!!! note
    `tool_time_machine` declares exactly two methods, `apply_value` (write, level ≥ 2 on the `(section_tipo, tipo)` pair plus the per-record projects scope) and `bulk_revert_process` (write, level ≥ 2 on the section). `oh1` is the **Oral History** section of the `monedaiberica` install and `oh16` its `component_input_text` "Title".

### Example response

```json
{
  "ok": true,
  "request_id": "c0ffee61",
  "data": true
}
```
