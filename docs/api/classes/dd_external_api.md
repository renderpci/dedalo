# dd_external_api

> See also: [JSON API v1](../dedalo_api_v1.md) · [component_external](../../core/components/component_external.md) · [dispatch](dispatch.md)

Search a third-party catalogue **through the engine**: one action, `search`, backing the autocomplete of an external component.

Registered action (`src/core/api/handlers/dd_external_api.ts`): `search`.

## How to call

- POST JSON to `/api/v1/json` with `dd_api: "dd_external_api"` and `action: "search"`.
- `rqo.source` names the **calling component**; `rqo.options` carries the query and the page.

## Why the server makes the call

The browser used to POST at the remote service directly. That request went round every control the external subsystem has — the kill switches, the host allowlist, the SSRF guard and socket pin, the circuit breaker, the concurrency ceiling, the byte cap, the egress classification — because a request the server never makes cannot be gated by the server. It also stopped working outright once the app's CSP dropped third-party origins from `connect-src`.

So the request goes through the engine's one outbound door, and **the client may not name the target**:

| the client sends | the server resolves |
| --- | --- |
| `source.tipo`, `source.section_tipo` (the caller component), `options.q`, paging | the target section (from the component's `request_config`), the bound service (from the **target section's** `api_config`), and the remote field list (from each external node's own `properties.fields_map`) |

No URL, no host, no field list and no service name travels from the browser. A client that could name the URL would be the browser-direct call again, wearing the engine's socket.

## Notes

- The action requires a **session** and is **CSRF-gated**. Neither is conventional here: it makes the *server* open an outbound socket on the caller's behalf, so an anonymous visitor must never be able to drive it.
- The caller component must **exist** and the actor must hold **read** permission on it — otherwise an authenticated actor could name any node in the ontology and drive the outbound socket through a binding they may not see. Existence is decided *before* permission, so a 403 on an unknown tipo never answers "does this node exist?".
- The target is resolved by asking the request-config builder in **every** render mode (`edit`, `search`, `list`) and requiring the answers to agree — a component declares its external item in one mode and not another, and the client is deliberately unable to say which mode it is in. Two disagreeing target sections are refused, never resolved by picking the first: two services behind one component is a wrong answer that looks right.
- An **empty query** is answered with no hits and no socket.
- `limit` is capped at **100** and defaults to **20**; `offset` defaults to 0. A caller asking for more than the cap is **refused**, never silently clamped — a clamped page is indistinguishable from "the service has no more", and a paginator built on that lies about the end of the result set.
- A present-but-unreadable paging value (`"limit": "twenty"`) is refused for the same reason: quietly answering 20 rows is scope narrowed in silence, with a friendly face.
- There is **no per-principal rate limiter** on this path. What bounds it, install-wide, is the transport's per-(service, origin) concurrency ceiling, the circuit breaker, the request timeout, the byte cap, the retry policy and the in-flight coalescing of identical queries.
- Envelope: **v2**.

## search

### Accepts

- `source`: object (required)
    - `tipo`: string (required) — the calling component.
    - `section_tipo`: string (required) — the section it is rendered in.
- `options`: object
    - `q`: string — the terms a cataloguer typed. `terms` (an array of strings) is the explicit spelling of the same thing.
    - `limit`: int (optional, `1..100`, default 20).
    - `offset`: int (optional, `>= 0`, default 0).

### Returns

`{ ok: true, data: { context, data }, total, limit, offset }` — the shape the client's own formatter used to fabricate, now produced server-side so the rendering path downstream is untouched:

- `data.data[0]` — the **locator set**: `{ section_tipo, tipo, entries: [locator…], typo: "sections" }`. `tipo` is the **caller's** tipo (how the client routes the answer back to the widget that asked), emphatically not the service name.
- `data.data[1…]` — one `record_data` per record × display field: `{ section_tipo, section_id, type: "dd687", tipo, mode: "list", value/… }`, the values produced by the subsystem's one emission function, so a search cell obeys the same formats and the same per-entry ceilings as the record path.
- `data.context` — the ddo echo naming the columns, **index-paired** with the display fields. Column *i* of the data is column *i* of the context.
- `total`, `limit`, `offset` — extension keys carrying the provenance the browser could not report. `dropped_unaddressable` rides along when the service returned hits with no usable remote id.

!!! warning
    A remote `section_id` is the remote id in **storage form** — the zero-padded string (`"001338683"`), never a number. It is not a Dédalo record address, and `"001338683"` and `1338683` address different records. This is the documented exception to the int-canonical rule for record addresses.

### Degradation is a success with a notice

The service down, the circuit open, the target misconfigured: none of those is a failure of the *request* — the request was well-formed and authorized, the **source** is what is degraded. So the answer is `ok: true` with an empty result (`data.data: []`, `data.context: []`) and exactly one coded notice:

```json
{
  "ok": true,
  "request_id": "c0ffee02",
  "data": { "context": [], "data": [] },
  "notices": [
    {
      "code": "external.circuit_open",
      "label_key": "external_source_circuit_open",
      "retryable": true,
      "details": { "service": "zenon" }
    }
  ],
  "source_status": {
    "service": "zenon",
    "state": "circuit_open",
    "label_key": "external_source_circuit_open",
    "retryable": true
  }
}
```

The notice code is `external.<kind>`, one of `disabled`, `not_registered`, `bad_config`, `circuit_open`, `blocked_host`, `timeout`, `transport`, `http_status`, `too_large`, `protocol`, `not_found`. A search refused because the bound service cannot search at all adds `details.reason` (`service`, `engine` or `config`).

`source_status` is an extension key carrying the same fact in the shape the record path emits, so the autocomplete renders its status chip from one contract: `state` is `disabled`, `misconfigured` (`not_registered` / `bad_config` / `blocked_host`), `circuit_open`, `timeout`, `not_found`, or `unavailable` for everything else.

!!! danger
    An empty success with **no** notice would read as "no matches", and a cataloguer acts on that: "this catalogue has nothing about Ripollès". The notice is what makes the two distinguishable. A 4xx would not have helped — the widget discards a non-`ok` body before rendering.

### Errors

| code | when |
| --- | --- |
| `request.invalid_source` | `source.tipo` / `source.section_tipo` missing, or the tipo names no ontology node. |
| `request.invalid_options` | `limit` / `offset` present but unreadable, non-positive, or negative. |
| `perm.denied` | the actor has no read grant on the caller component. |

### Example request

```json
{
  "dd_api": "dd_external_api",
  "action": "search",
  "source": { "tipo": "numisdata162", "section_tipo": "numisdata4" },
  "options": { "q": "Ripollès", "limit": 20, "offset": 0 }
}
```

!!! note
    `numisdata162` is a `component_autocomplete_hi` of the `monedaiberica` install whose external item resolves to the `zenon1` target section; `numisdata4` is the section it is rendered in. Another install's tipos differ — the point of the example is that the request names **only** these two ids plus the query.
