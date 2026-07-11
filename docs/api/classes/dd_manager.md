# dd_manager (PHP router) → `dispatchRqo`

> See also: [JSON API v1](../dedalo_api_v1.md) · [dd_core_api](dd_core_api.md)

In the PHP server, `dd_manager` was the internal router that received the decoded RQO and reflected it onto `<dd_api>::<action>($rqo)`. In the TypeScript/Bun rewrite this role is filled by **`dispatchRqo`** plus the explicit **`ACTION_REGISTRY`** in `src/core/api/dispatch.ts`. There is no dynamic method lookup: an `(dd_api, action)` pair that is not registered does not exist.

Clients never call the router directly — they POST an RQO to the JSON entry point (see [JSON API v1](../dedalo_api_v1.md)).

## How it works

- `src/server.ts` receives the POST, parses and Zod-validates the body into an RQO (`src/core/concepts/rqo.ts`), and calls `dispatchRqo(rqo, context)`.
- `dispatchRqo` looks the handler up in `ACTION_REGISTRY[dd_api][action]` and runs it through the security gates (allowlist → auth → CSRF → request-scoped language → per-action permission checks). See [Security gates](../dedalo_api_v1.md#security-gates).
- Any handler exception is caught and degraded to the client envelope (HTTP 200, `result: false`) rather than a raw 500.

## Notes for integrators

- To add a new action, register a handler in `ACTION_REGISTRY` — the registry is the single source of truth. (This replaces PHP's autoloader + static-method convention.)
- The `ApiRequestContext` (request id, client IP, session, CSRF candidate, resolved principal) is created by the HTTP layer and threaded **explicitly** into every handler — there are no request-scoped globals, so the PHP static-cache bleed hazard is structurally gone.

## dispatch (the manage_request equivalent)

- Purpose: validate the request, enforce the six security gates, and call the target handler. Wraps exceptions and returns a normalized response.
- Accepts: the decoded RQO (`dd_api`, `action`, `source`, `options`, `sqo`, `data`, …) plus the `ApiRequestContext`.
- Returns: the handler's `ApiResult` (`{ status, body }`), or on error `{ result: false, msg, errors }` inside an HTTP 200 body.

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
