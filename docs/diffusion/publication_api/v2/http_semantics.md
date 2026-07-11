# HTTP semantics

How the Publication API v2 speaks HTTP: RFC 9457 error bodies, status codes, conditional caching, RFC 8288 pagination links, response timing, and gzip compression.

The API follows standard HTTP conventions so that ordinary clients, browsers, and caching proxies work without special handling. These behaviours are applied by a middleware chain that wraps every route handler — the handlers themselves return bare envelopes, and the middleware adds the headers, timing, ETag, and compression described below.

!!! info "Where these behaviours live"
    Errors come from `src/middleware/error-handler.ts` + `src/errors.ts` + `src/utils/response.ts`; caching from `src/middleware/http-cache.ts`; pagination links from `src/utils/links.ts`; timing from `src/middleware/timing.ts`; compression from `src/middleware/compress.ts`. Every example below is taken verbatim from those sources and from `src/docs/openapi.yaml`.

## Errors — RFC 9457 Problem Details

Every error response uses the `application/problem+json` media type and the [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details shape. The body always carries five members:

| Member | Type | Description |
|--------|------|-------------|
| `type` | URI | Stable problem identifier under `https://dedalo.dev/api/problems/`. |
| `title` | string | Short, human-readable summary of the problem class. |
| `status` | integer | HTTP status code, repeated in the body. |
| `detail` | string | Explanation specific to this occurrence. |
| `instance` | string | The request path + query string that produced the error. |

Validation errors add one extension member:

| Member | Type | Description |
|--------|------|-------------|
| `errors` | array | Per-field issues, each `{ "pointer": "...", "message": "..." }`. Present on `400` validation errors only. |

A malformed filter operator, for example, returns:

```json
{
  "type": "https://dedalo.dev/api/problems/validation-error",
  "title": "Validation Error",
  "status": 400,
  "detail": "Invalid filter operator: \"lke\". Valid: eq, ne, gt, gte, lt, lte, like, in, not_in, is_null, is_not_null",
  "instance": "/dedalo_web/tables/interview/records?filter[code][lke]=OH-%"
}
```

A request that fails Zod schema validation collects every issue into the `errors` array:

```json
{
  "type": "https://dedalo.dev/api/problems/validation-error",
  "title": "Validation Error",
  "status": 400,
  "detail": "One or more request parameters are invalid",
  "instance": "/dedalo_web/tables/interview/records?limit=5000",
  "errors": [
    { "pointer": "limit", "message": "Number must be less than or equal to 1000" }
  ]
}
```

The `pointer` is the dotted Zod path of the offending field (for example `limit`, `lang`, or `queries.0.id`), and `message` is the validator's message.

### Status code table

Each problem `type` maps to a fixed status and title:

| Status | `type` (suffix of `…/problems/`) | `title` | When |
|--------|----------------------------------|---------|------|
| `400` | `validation-error` | Validation Error | Invalid query/body parameters: bad operator, unknown sort field, out-of-range `limit`, malformed `resolve_relations` JSON, etc. |
| `401` | `unauthorized` | Unauthorized | Missing or invalid `X-API-Key` — only when `API_KEYS` is configured. |
| `404` | `not-found` | Not Found | Unknown database, table, record, or route. |
| `405` | `method-not-allowed` | Method Not Allowed | Wrong HTTP method for an existing path. Includes an `Allow` header. |
| `429` | `rate-limit-exceeded` | Too Many Requests | Per-IP rate limit exceeded. |
| `500` | `internal-error` | Internal Server Error | Unexpected server-side failure. |
| `504` | `timeout` | Gateway Timeout | Request exceeded `REQUEST_TIMEOUT_MS`. |

!!! note "401 only when keys are configured"
    Authentication is optional. When `API_KEYS` is empty the API is open and never returns `401`. When keys are set, a missing key yields `detail: "Missing API key. Provide X-API-Key header."` and a wrong key yields `detail: "Invalid API key"`.

A `404` for a missing record looks like:

```json
{
  "type": "https://dedalo.dev/api/problems/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Record not found: interview/9999",
  "instance": "/dedalo_web/tables/interview/records/9999"
}
```

A `500` never leaks internals in production — `detail` is the constant `"An unexpected error occurred"` unless the server runs in development mode:

```json
{
  "type": "https://dedalo.dev/api/problems/internal-error",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred",
  "instance": "/dedalo_web/tables/interview/records"
}
```

### 405 Method Not Allowed and the `Allow` header

When a path exists but the method does not, the response is `405` with an `Allow` header listing the permitted methods, sorted alphabetically. The same list appears in `detail`:

```bash
curl -s -i -X POST "http://localhost:3100/publication/server_api/v2/dedalo_web/tables"
```

```text
HTTP/1.1 405 Method Not Allowed
Allow: GET
Content-Type: application/problem+json
```

```json
{
  "type": "https://dedalo.dev/api/problems/method-not-allowed",
  "title": "Method Not Allowed",
  "status": 405,
  "detail": "Method POST is not allowed for this resource. Allowed: GET",
  "instance": "/dedalo_web/tables"
}
```

If no route matches the path at all, the API raises `404 Not Found` (`Route not found: <pathname>`) instead of `405`.

!!! warning "Rate-limit and auth responses carry no advisory headers"
    The `429` and `401` responses are plain Problem Details bodies. This API does **not** emit `Retry-After`, `X-RateLimit-*`, or `WWW-Authenticate` headers — only `405` adds a header (`Allow`). Clients should back off on `429` using their own policy (the default budget is `RATE_LIMIT_RPM`, 100 requests per minute per IP).

## Caching — `Cache-Control`, weak `ETag`, and `304`

Every cacheable response — a `GET` returning `200` with a JSON, YAML, or HTML body — receives three headers: `Cache-Control`, a weak `ETag`, and `Vary: Accept-Encoding`. The `/health` and MCP endpoints are explicitly excluded and never cached.

```bash
curl -s -i "http://localhost:3100/publication/server_api/v2/dedalo_web/tables" | grep -iE '^(cache-control|etag|vary):'
```

```text
Cache-Control: public, max-age=60
ETag: W/"a1b2c3d4e5f6"
Vary: Accept-Encoding
```

`Cache-Control` is driven by `CACHE_MAX_AGE` (default `60` seconds). Setting it to `0` switches the directive to `no-cache`:

| `CACHE_MAX_AGE` | `Cache-Control` value |
|-----------------|-----------------------|
| `> 0` | `public, max-age=<CACHE_MAX_AGE>` |
| `0` | `no-cache` |

The `ETag` is **weak** (`W/"…"`), a hash of the response body. It is weak by design because the outer compression layer changes the exact bytes per content-encoding while the resource stays semantically identical.

### Conditional requests

Send the ETag back in `If-None-Match` to revalidate. When it still matches, the server returns `304 Not Modified` with no body:

```bash
# 1. First request — capture the ETag
curl -s -i "http://localhost:3100/publication/server_api/v2/dedalo_web/tables" | grep -i '^etag:'
# ETag: W/"a1b2c3d4e5f6"

# 2. Revalidate — server confirms nothing changed
curl -s -i -H 'If-None-Match: W/"a1b2c3d4e5f6"' \
  "http://localhost:3100/publication/server_api/v2/dedalo_web/tables"
```

```text
HTTP/1.1 304 Not Modified
ETag: W/"a1b2c3d4e5f6"
Cache-Control: public, max-age=60
Vary: Accept-Encoding
```

Matching is tolerant: the `W/` prefix is ignored on both sides, a comma-separated list of tags is accepted, and `If-None-Match: *` always matches.

## Pagination — RFC 8288 `Link` header

List and search responses paginate by `offset`/`limit` (see [querying.md](querying.md)). When more pages are reachable, the response adds an [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288) `Link` header with `rel="next"` and/or `rel="prev"` URLs. The links preserve the original path, query string (filters, sort, `BASE_PATH`), and `limit`, advancing only `offset`.

```bash
curl -s -i "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?limit=100&offset=100" \
  | grep -i '^link:'
```

```text
Link: </publication/server_api/v2/dedalo_web/tables/interview/records?limit=100&offset=200>; rel="next", </publication/server_api/v2/dedalo_web/tables/interview/records?limit=100&offset=0>; rel="prev"
```

Link presence rules:

- **`rel="next"`** — included when there is another page. With `count=true` the server knows the total and emits `next` while `offset + limit < total`; without a count it emits `next` whenever the returned row count equals `limit` (a full page, so more may exist).
- **`rel="prev"`** — included whenever `offset > 0`; the previous `offset` is clamped at `0`.
- **No header** — when `limit <= 0` (for example a count-only `limit=0` request), or when neither a next nor a previous page applies.

!!! tip "Pair with `count=true` for exact navigation"
    Without `count=true` the `next` link is best-effort: a final page that happens to contain exactly `limit` rows still advertises a `next` link that resolves to an empty page. Request `count=true` when you need `pagination.total` and precise end-of-list detection.

## Response timing — `meta.response_time_ms` and `X-Response-Time`

Every JSON success response (`200` with `application/json`) reports the total server processing time, in milliseconds, in two places: the `X-Response-Time` header and a `response_time_ms` key merged into the body's `meta` object.

```bash
curl -s -i "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?limit=2" \
  | grep -i '^x-response-time:'
```

```text
X-Response-Time: 4.21ms
```

```json
{
  "data": [ { "section_id": 1, "lang": "lg-eng", "code": "OH-001" } ],
  "pagination": { "limit": 2, "offset": 0 },
  "meta": { "response_time_ms": 4.21 }
}
```

The value is rounded to two decimals. If the body already has a `meta` object its keys are preserved and `response_time_ms` is added alongside them; if there is no `meta` object one is created.

!!! note "Timing is excluded from the ETag"
    The timing middleware runs **outside** the caching layer, so the (necessarily varying) `response_time_ms` value is injected after the `ETag` is computed. The weak ETag therefore stays stable across identical requests and conditional revalidation (`If-None-Match` → `304`) keeps working even though the timing differs every time.

## Compression — gzip for bodies ≥ 1 KB

JSON and `text/*` responses are gzip-compressed when the client advertises support and the body is at least 1 KB (1024 bytes). Smaller bodies are sent uncompressed to avoid spending CPU on payloads where compression would not help.

```bash
curl -s -i --compressed \
  "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?limit=100" \
  | grep -iE '^(content-encoding|vary):'
```

```text
Content-Encoding: gzip
Vary: Accept-Encoding
```

Behaviour:

- Triggered only when the request's `Accept-Encoding` includes `gzip` (omit it, e.g. plain `curl` without `--compressed`, and the response stays uncompressed).
- Applies to `application/json` and `text/*` content types; other types pass through untouched.
- Bodies under 1024 bytes are returned as-is — no `Content-Encoding` header.
- `204 No Content` and `304 Not Modified` responses (which have no body) are never compressed.
- A `Vary: Accept-Encoding` header is set so shared caches keep gzip and identity variants separate.

## Related

- [Endpoints](endpoints.md) — the full route map and response envelopes.
- [Querying records](querying.md) — filters, sort, field selection, pagination, and relation resolution.
- [Publication API v2](../index.md) — version landing page and configuration.
