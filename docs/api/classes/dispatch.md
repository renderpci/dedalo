# dispatch (dispatchRqo)

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_core_api](dd_core_api.md)

`dispatchRqo` is the server's request router: it receives the decoded RQO, runs it through the security gates, and calls the registered handler. It is an internal entry point — clients never address it directly, they POST an RQO to the JSON endpoint (see [JSON API v1](../dedalo_api_v1.md)).

Routing is table-driven, not reflective. The **`ACTION_REGISTRY`** map in `src/core/api/dispatch.ts` explicitly binds every `(dd_api, action)` pair to a handler function; a pair that is not in the map does not exist and is refused at the first gate. There is no dynamic method lookup and no autoloader fallback, so the registry is the single source of truth for what the API can do.

## How it works

- `src/server.ts` receives the POST, parses it, and validates the body against the RQO Zod schema (`src/core/concepts/rqo.ts`).
- It calls `dispatchRqo(rqo, context)`, which looks the handler up in `ACTION_REGISTRY[dd_api][action]` and runs the security gates in order — allowlist → authentication → CSRF → request-scoped language → per-action permission checks. See [Security gates](../dedalo_api_v1.md#security-gates).
- The handler bodies live in `src/core/api/handlers/<dd_api>.ts`, one module per API class. `dispatch.ts` itself holds only the registry, the gates, and the response envelope.
- Any handler exception is caught and degraded to the client envelope (HTTP 200 with `result: false`) rather than a raw 500, because the client decides failure by reading `result` from a parsed JSON body.

## Notes for integrators

- A new action becomes callable only by registering a handler in `ACTION_REGISTRY`. Adding a method to a module is not enough.
- The `ApiRequestContext` (request id, client IP, session, CSRF candidate, resolved principal) is created by the HTTP layer and threaded **explicitly** into every handler. There are no request-scoped globals, so one caller's identity or language cannot bleed into another's request in the long-lived server process.

## Contract

- **Purpose:** validate the request, enforce the security gates, and call the target handler. Wraps exceptions and returns a normalized response.
- **Accepts:** the decoded RQO (`dd_api`, `action`, `source`, `options`, `sqo`, `data`, …) plus the `ApiRequestContext`.
- **Returns:** the handler's `ApiResult` (`{ status, body }`), or on error `{ result: false, msg, errors }` inside an HTTP 200 body.

### Example request

```json
{
  "dd_api": "dd_core_api",
  "action": "read",
  "source": { "section_tipo": "rsc167", "mode": "list" },
  "sqo": { "limit": 10 }
}
```

### Example response

```json
{
  "result": { "context": [ /* structure contexts */ ], "data": [ /* records */ ] },
  "msg": "OK"
}
```

## Registered API classes

Each `(dd_api, action)` pair the registry binds lives in one of these class pages (the full index is on [JSON API v1](../dedalo_api_v1.md#class-reference)):

- [dd_core_api](dd_core_api.md) — section/record lifecycle and page context.
- [dd_utils_api](dd_utils_api.md) — system and utility helpers.
- [dd_tools_api](dd_tools_api.md) · [dd_ts_api](dd_ts_api.md) · [dd_area_maintenance_api](dd_area_maintenance_api.md).
- [dd_diffusion_api](dd_diffusion_api.md) — publication / diffusion process control.
- [dd_rag_api](dd_rag_api.md) — semantic retrieval (RAG) and image similarity.
- [dd_component_portal_api](dd_component_portal_api.md) · [dd_component_av_api](dd_component_av_api.md) · [dd_component_3d_api](dd_component_3d_api.md) · [dd_component_info](dd_component_info.md).
- [dd_mcp_api](dd_mcp_api.md) — the in-process assistant / MCP bridge.
- [dd_error_report_api](dd_error_report_api.md) — machine-to-machine error-report intake.
