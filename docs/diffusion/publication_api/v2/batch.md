# Batch queries

Run up to 20 read-only GET queries in a single `POST /batch` request, each with its own per-query HTTP status, so one failing query never breaks the rest.

## Overview

`POST /batch` lets a client collapse several round trips into one. The server resolves each query against the same internal router used for normal HTTP requests, runs them **in parallel**, and returns one result per query. Every result carries the HTTP status the equivalent standalone GET would have produced, alongside either the route's `data` envelope or an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) `problem` body.

Batch is the v2 replacement for the v1 `combi` endpoint.

!!! info "Why batch"
    A batch is dispatched internally — it does not re-enter the public HTTP layer. Use it to fetch heterogeneous resources together (for example a record list plus a thesaurus list plus a table schema) without paying multiple network round trips. The endpoint is read-only: only GET data routes are allowed.

## Request

| Property | Type | Description |
|----------|------|-------------|
| `Content-Type` (header) | string | Must be `application/json`, otherwise the request fails with `400`. |
| `queries` | array | 1–20 query objects (`MAX_BATCH_QUERIES = 20`). |

Each entry in `queries` is an object:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Non-empty, **unique** within the batch; echoed back on the matching result. |
| `path` | string | yes | A GET data route of this API, starting with `/`. Must **not** contain a query string — use `params` instead. |
| `params` | object | no | Query parameters. Values may be `string`, `number`, `boolean`, or an array of those. Arrays become repeated keys (`key=a&key=b`), which is what makes bracketed filters work. |

### Validation rules

The body is validated by `batchRequestSchema` (Zod). The request is rejected with a `400` validation problem when:

- `Content-Type` is not `application/json`.
- The body is not valid JSON.
- `queries` is empty or has more than 20 entries.
- Any `id` is empty, or two queries share the same `id` (`"Batch query IDs must be unique"`).
- Any `path` is empty or does not start with `/`.
- A `params` value is not a string, number, boolean, or array of those.

In addition, two per-query path checks run at dispatch time. Instead of failing the whole batch, these surface as an inline `problem` on the offending query (status `400`):

- The `path` contains a `?` (query string). Use `params` instead.
- The `path` targets a forbidden meta/streaming endpoint. The forbidden prefixes are `/batch`, `/mcp`, `/docs`, `/openapi.yaml`, `/health`, and `/favicon.ico` (matched case-insensitively, as an exact match or as a `prefix/...` parent).

!!! warning "Params, not query strings"
    `path` is the bare route only. Put everything else in `params`. Because array values expand to repeated keys, you can express the bracketed filter DSL directly, e.g. `"filter[code][like]": "OH-%"` or `"filter[lang][in]": ["lg-eng", "lg-spa"]`.

### Request example

```bash
curl -X POST http://localhost:3100/publication/server_api/v2/batch \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      {
        "id": "interviews",
        "path": "/dedalo_web/tables/interview/records",
        "params": {
          "filter[code][like]": "OH-%",
          "sort": "-section_id",
          "fields": "section_id,code,title",
          "limit": 5
        }
      },
      {
        "id": "themes",
        "path": "/dedalo_web/tables/ts_themes/records",
        "params": { "limit": 10 }
      },
      {
        "id": "schema",
        "path": "/dedalo_web/tables/interview"
      }
    ]
  }'
```

```json
{
  "queries": [
    {
      "id": "interviews",
      "path": "/dedalo_web/tables/interview/records",
      "params": {
        "filter[code][like]": "OH-%",
        "sort": "-section_id",
        "fields": "section_id,code,title",
        "limit": 5
      }
    },
    {
      "id": "themes",
      "path": "/dedalo_web/tables/ts_themes/records",
      "params": { "limit": 10 }
    },
    {
      "id": "schema",
      "path": "/dedalo_web/tables/interview"
    }
  ]
}
```

## Response

The top-level response is always `200 OK` with `{ "results": [ … ] }`. Results are returned in the same order as the input `queries` array (`Promise.all` preserves index order even though queries run concurrently); you can also correlate them by the echoed `id`.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | The `id` from the originating query. |
| `status` | integer | The HTTP status the equivalent standalone GET produced. |
| `data` | any | Present when `status` is 2xx — the full route envelope (e.g. `{ data, pagination }`). |
| `problem` | object | Present when `status` is not 2xx — an RFC 9457 problem body. |

Exactly one of `data` or `problem` is present per result.

!!! note "Per-query isolation"
    Queries run with `Promise.all`, but a non-2xx response from any single query is captured as that query's `problem` and never aborts the others. A failed lookup (e.g. an unknown table) returns a `404` problem for that one entry while sibling queries still return their `data`.

### Response example

For the request above, where `ts_themes` does not exist in this database:

```json
{
  "results": [
    {
      "id": "interviews",
      "status": 200,
      "data": {
        "data": [
          { "section_id": 142, "code": "OH-142", "title": "..." }
        ],
        "pagination": { "limit": 5, "offset": 0 }
      }
    },
    {
      "id": "themes",
      "status": 404,
      "problem": {
        "type": "https://dedalo.dev/api/problems/not-found",
        "title": "Not Found",
        "status": 404,
        "detail": "Unknown table: ts_themes"
      }
    },
    {
      "id": "schema",
      "status": 200,
      "data": {
        "data": {
          "name": "interview",
          "row_count": 142,
          "columns": [
            { "name": "section_id", "type": "int" },
            { "name": "code", "type": "varchar" }
          ]
        }
      }
    }
  ]
}
```

## Notes and limits

- **GET data routes only.** Meta and streaming endpoints (`/batch`, `/mcp`, `/docs`, `/openapi.yaml`, `/health`, `/favicon.ico`) are rejected per query with a `400` problem.
- **Max 20 queries** per batch (`MAX_BATCH_QUERIES`). More than 20 is a `400` validation error.
- **Unique, non-empty `id`s** are required; results are correlated by `id`.
- **`data` envelopes are nested.** Each successful result's `data` is the complete envelope of the inner route, so a record list shows up as `data.data` with its own `pagination`.
- **Per-result caching does not apply.** ETag/`304` validation and `Cache-Control` are HTTP-surface concerns; the batch response itself is a single JSON success body. Pagination `Link` headers from inner queries are not propagated — read `pagination` from each result's `data` instead.

!!! tip "Count-only inside a batch"
    The same querying options apply to each inner route. To get totals without rows, pass `"limit": 0` and `"count": true` in a query's `params`, exactly as you would on the standalone records endpoint.

## Related

- [Endpoints](endpoints.md) — the full route catalog the batch `path` values draw from.
- [Querying records](querying.md) — filters, sort, field selection, pagination and the bracketed filter DSL used in `params`.
- [HTTP semantics](http_semantics.md) — RFC 9457 problem details, status codes, caching and rate limiting.
- [Publication API v2](../index.md) — version landing page.
