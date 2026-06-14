# Migration from v1

How to move a client from the legacy **v1** Publication API (PHP) to the current **v2** API (Bun + TypeScript): the endpoint-by-endpoint mapping, the behavioural differences that affect callers, and a step-by-step migration plan.

The v1 and v2 Publication APIs are two independent services reading the **same** diffusion-published MariaDB. v1 is kept in Dédalo v7 for backward compatibility; v2 is the recommended API for all new work. You can run both side by side and migrate one client at a time.

!!! info "Both versions ship in Dédalo v7"
    v1 (`…/server_api/v1/json/{action}`) remains a shipped, **read-only legacy** service so existing public websites keep working unchanged — same stringified responses, same `code` auth, same `combi` / `resolve_portals_custom` semantics. It is maintained for compatibility only and receives **no new features**. v2 (`…/server_api/v2`) is a separate service (Bun, behind Apache/Nginx or standalone) and is the only one gaining new capabilities: resource-oriented routes, RFC 9457 errors, `ETag` / `Link` caching, the bracketed filter DSL, batch queries and MCP. Both read the same publication databases with a read-only DB user, so there is **no migration deadline** — migrate when ready.

## Why migrate

v1 is a single PHP front controller (`json/index.php`) that `switch`es one `dedalo_get` action over the monolithic `class.web_data.php`, returns bare arrays/objects in which **every value is itself a JSON-stringified string** (callers must double-parse), and accepts raw `sql_filter` strings. v2 is a resource-oriented REST service with parsed JSON envelopes, a bracketed filter DSL where every value is a bound parameter, RFC 9457 Problem Details for errors, conditional caching and per-IP rate limiting.

In short, v2 gives a client:

- **Parsed JSON** — no second `JSON.parse()` on every field.
- **Resource URLs** — `/{db}/tables/{table}/records/{id}` instead of one action verb plus flat query params.
- **A safe, explicit filter DSL** — `filter[field][op]=value` with bound values, instead of raw SQL fragments.
- **Standard HTTP** — RFC 9457 errors with real status codes, weak `ETag` / `304`, RFC 8288 `Link` pagination, gzip.
- **Multi-database in one server** — every route is scoped by a `{db}` path segment drawn from the `DB_NAMES` allowlist.
- **Batch and MCP** — `POST /batch` (up to 20 parallel GETs) and a Model Context Protocol endpoint for AI agents.

## Endpoint mapping

Every v1 action maps to a v2 route (or a v2 query parameter). Discovery/schema actions were `GET` in v1; data actions were `POST`. In v2 **all data routes are `GET`** (only `/batch` and `/mcp` are `POST`).

| v1 action | v2 equivalent |
| --- | --- |
| `tables_info`, `publication_schema`, `table_thesaurus`, `table_thesaurus_map` | `GET /{db}/tables`, `GET /{db}/tables/{table}` (table list, schema, columns, row count) |
| `records` | `GET /{db}/tables/{table}/records` (list) · `GET /{db}/tables/{table}/records/{id}` (single) |
| `free_search`, `global_search`, `global_search_json`, `global_search_mdcat`, `search_tipos` | `GET /{db}/tables/{table}/search?q=` (MariaDB FULLTEXT) |
| `text_fragment` | `GET /{db}/tables/{table}/records/{id}/fragments` |
| `reel_terms`, `reel_fragments_of_type`, `full_reel`, `full_interview` | `GET /{db}/tables/{table}/records/{id}/av-fragments` |
| `fragment_from_index_locator`, `thesaurus_indexation_node`, `thesaurus_video_view_data` | `GET /{db}/av-indexation-fragment` (locator → AV fragment) |
| `thesaurus_term`, `thesaurus_children`, `thesaurus_parents`, `thesaurus_root_list`, `thesaurus_search`, `thesaurus_random_term`, `thesaurus_autocomplete` | `GET /{db}/tables/ts_*/records` (+ `resolve_inverse_relations` for the hierarchy) |
| `resolve_portal` / `resolve_portals_custom` (options of `records`) | `resolve_relations` / `resolve_inverse_relations` query params |
| `bibliography_rows`, `image_data`, `menu_tree_plain` | `GET /{db}/tables/{table}/records` (generic record reads) |
| `combi` (`ar_calls`) | `POST /batch` (`queries[]` with `path` + `params`, max 20) |
| _n/a_ | `GET /databases`, `GET /health`, `GET /docs`, `GET /openapi.yaml`, `POST /mcp` |

See the full route catalogue, with parameters and response shapes, in [endpoints](endpoints.md).

!!! note "Thesaurus reads are plain table reads in v2"
    v1 had a dedicated verb per thesaurus operation (`thesaurus_term`, `thesaurus_children`, …). In v2 the thesaurus tables (`ts_*`) are ordinary tables: list and filter them through `GET /{db}/tables/ts_*/records`, and use `resolve_inverse_relations` to walk the parent/children hierarchy. There is no separate "thesaurus" endpoint family.

## Behavioural differences

These are the changes that actually break a naive copy of a v1 client. Read them before rewriting request code.

### Filter DSL: `sql_filter` → `filter[field][op]=value`

v1 accepted raw SQL fragments (`sql_filter` with `=`, `>`, `LIKE`, `IN`, `IS NULL`, …) and a free-text `order` such as `name ASC`. v2 replaces both with a structured, parameter-bound DSL. Every value is bound as a `?` placeholder and every identifier is regex-validated and back-tick quoted, so there is no SQL to assemble on the client.

| v1 | v2 |
| --- | --- |
| `sql_filter=code = 'OH-001'` | `filter[code]=OH-001` (operator defaults to `eq`) |
| `sql_filter=code LIKE 'OH-%'` | `filter[code][like]=OH-%` |
| `sql_filter=date >= '1936' AND date <= '1939'` | `filter[date][gte]=1936&filter[date][lte]=1939` (repeated filters are `AND`ed) |
| `sql_filter=section_id IN (1,2,3)` | `filter[section_id][in]=1\|2\|3` (pipe-separated) |
| `sql_filter=parent IS NULL` | `filter[parent][is_null]=` |
| `order=name ASC, section_id DESC` | `sort=name,-section_id` (leading `-` = descending) |

Valid operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `in`, `not_in`, `is_null`, `is_not_null`. There is **no `OR`** — repeated `filter[...]` params combine with `AND`. The full rules (URL-encoding the brackets, pipe lists for `in`/`not_in`, the value-less null operators) are in [querying](querying.md#filters).

!!! warning "Brackets must be URL-encoded"
    Filter parameter names contain `[` and `]`, which must be percent-encoded on the wire: `[` → `%5B`, `]` → `%5D`, and the pipe `|` in `in` lists → `%7C`. So `filter[code][like]=OH-%` is sent as `filter%5Bcode%5D%5Blike%5D=OH-%25`. Most HTTP clients encode these for you when you build the query from a params object.

### Response envelope: bare stringified arrays → `{ data, pagination, meta }`

v1 returned bare arrays/objects (or `{result, msg, total, debug}` for a `count` request), and **every value was a JSON-stringified string** — clients had to parse the response once and then parse each field again. v2 returns a single parsed JSON envelope:

```json
{
  "data": [
    { "section_id": 142, "lang": "lg-eng", "code": "OH-142", "title": "Interview with María" }
  ],
  "pagination": { "limit": 100, "offset": 0, "total": 142 },
  "meta": { "response_time_ms": 4.21 }
}
```

What changes for the caller:

- Records live under `data` (always an array for list/search/single — a single record returns one row per language variant).
- `pagination.total` appears **only** when you request `count=true` (it costs an extra `COUNT` query); never assume `total` exists.
- `meta.response_time_ms` is the server processing time (also in the `X-Response-Time` header).
- **No more double-parsing** — values are real JSON types, not nested strings.

Pagination moves from v1's flat `offset` / `count` query vars to v2's `limit` (default `100`, max `1000`) / `offset`, with an RFC 8288 `Link` header carrying `rel="next"` / `rel="prev"`. See [querying](querying.md#pagination).

### Errors: ad-hoc strings + `die()` → RFC 9457 Problem Details

v1 echoed ad-hoc JSON strings (e.g. `"Error. Invalid user code"`) and `die()`d, generally with a `200` status. v2 returns `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)) with a correct status code:

```json
{
  "type": "https://dedalo.dev/api/problems/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Record not found: interview/9999",
  "instance": "/dedalo_web/tables/interview/records/9999"
}
```

Statuses: `400` validation (with a per-field `errors` array), `401` missing/invalid API key, `404` unknown db/table/record/route, `405` wrong method (with an `Allow` header), `429` rate-limited, `500` internal, `504` timeout. Switch error handling from string-matching v1's messages to branching on `status`. Full error contract in [HTTP semantics](http_semantics.md#errors-rfc-9457-problem-details).

### Relation resolution: `resolve_portal` / `resolve_portals_custom` → `resolve_relations` / `resolve_inverse_relations`

v1 expanded relations with `resolve_portal` (using the ontology `publication_schema` map) or `resolve_portals_custom` (a caller-supplied `{column:table}` map, including `{"link":"auto"}`). v2 keeps the same two ideas as query parameters:

- **`resolve_relations`** — a JSON map of column → target table for **forward** resolution, e.g. `{"image":"image"}`; dot notation resolves nested relations (`{"eventos.documentos":"image"}`); `"auto"` resolves link columns dynamically (the v2 successor to `resolve_portals_custom`'s `{"link":"auto"}`).
- **`resolve_inverse_relations`** — resolves the inbound `dd_relations` column; pass `true` to use the `publication_schema` mapping (the v2 successor to `resolve_portal`), or a JSON object like `{"rsc170":"interview"}`.

Details and bounds (depth `3`, ≤50 ids per column) in [querying](querying.md#forward-relation-resolution).

### Configuration: PHP `define()`s → `.env`

v1 configuration lived in PHP constants and globals in `config_api/server_config_api.php` (DB connection, `API_WEB_USER_CODE`, `DEFAULT_LANG`, `DEFAULT_DDBB`, thesaurus maps, CORS, dozens of Oral-History field constants) plus `server_config_headers.php`. v2 configuration is environment variables validated by Zod at startup.

| v1 (PHP constant) | v2 (env var) | Notes |
| --- | --- | --- |
| `MYSQL_DEDALO_DATABASE_CONN`, `…HOSTNAME` / `…USERNAME` / `…PASSWORD` / `…PORT` | `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_PORT` | Read-only DB user. |
| `DEFAULT_DDBB` (single database) | `DB_NAMES` (comma-list) | Multi-database; each `{db}` segment must be in this allowlist. The name moves from config into the URL path. |
| `DEFAULT_LANG` | _none_ | Language is a per-request `lang` param (`lg-xxx`); there is no server-wide default variant. |
| `API_WEB_USER_CODE` | `API_KEYS` | Optional, timing-safe `X-API-Key`. Empty = open access. |
| `ACCESS_CONTROL_ALLOW_ORIGIN` | `CORS_ORIGIN` | |
| _none_ | `RATE_LIMIT_RPM`, `CACHE_MAX_AGE`, `REQUEST_TIMEOUT_MS`, `DEPLOYMENT_MODE` | New v2 controls (rate limit, caching, timeouts, apache/nginx/standalone). |

The most important shift is **`DEFAULT_DDBB` → `DB_NAMES`**: v1 served one configured database; v2 serves every database in `DB_NAMES`, selected by the `{db}` path segment. The full v2 env table is in the [v2 overview](index.md#configure).

### Auth: shared `code` → optional `X-API-Key`

v1 required an `code` query param on every call (a single shared secret, bypassable via `skip_api_web_user_code_verification`). v2 uses an **optional** `X-API-Key` header: enforced only when `API_KEYS` is configured, compared timing-safe, and backed by per-IP token-bucket rate limiting (`RATE_LIMIT_RPM`, default 100/min → `429`). Move the secret from the query string (`?code=XXXX`) to the header (`X-API-Key: XXXX`), or leave it open for public data behind your own gateway. See [HTTP semantics](http_semantics.md).

### `combi` → `POST /batch`

v1's `combi` action posted `ar_calls=[{ id, options: { dedalo_get, … } }]` and merged the results. v2's `POST /batch` posts `{ queries: [ { id, path, params } ] }`, runs up to **20** GET data routes in **parallel**, and returns each result with its own `status` plus either `data` or a `problem` — so one failing query never breaks the batch.

```jsonc
// v1 combi
{ "ar_calls": [
  { "id": "a", "options": { "dedalo_get": "records", "table": "interview", "count": 5 } }
] }

// v2 POST /batch
{ "queries": [
  { "id": "a", "path": "/dedalo_web/tables/interview/records",
    "params": { "filter[code][like]": "OH-%", "limit": 5 } }
] }
```

`path` must start with `/` and name a GET data route without a query string; `id`s must be unique; meta routes (`/docs`, `/health`, `/mcp`, `/openapi.yaml`, `/batch`) are disallowed. Array values in `params` become repeated keys, which is how bracketed filters work in a batch. See [endpoints — batch](endpoints.md#post-batch).

### At-a-glance summary

| Concern | v1 (PHP) | v2 (Bun/TS) |
| --- | --- | --- |
| URL shape | `/json/{action}?table=…&code=…` | `/{db}/tables/{table}/records/{id}` |
| Method | `GET` (discovery) / `POST` (data) | `GET` (data) · `POST` only for `/batch`, `/mcp` |
| Database | single (`DEFAULT_DDBB` in config) | many (`DB_NAMES`, chosen via `{db}` path segment) |
| Filtering | raw `sql_filter` strings | `filter[field][op]=value` (bound, validated) |
| Ordering | `order=name ASC` | `sort=name,-section_id` |
| Response | bare arrays; **every value JSON-stringified** | `{ data, pagination, meta }`, parsed JSON |
| Errors | ad-hoc strings + `die()` (often `200`) | RFC 9457 `application/problem+json` + real status |
| Pagination | `offset` / `count` vars | `limit` / `offset` + RFC 8288 `Link` header |
| Caching | none | `Cache-Control`, weak `ETag` / `304`, gzip |
| Auth | shared `?code=` (bypassable) | optional `X-API-Key` + per-IP rate limit |
| Relations | `resolve_portal` / `resolve_portals_custom` | `resolve_relations` / `resolve_inverse_relations` |
| Batch | `combi` (`ar_calls`) | `POST /batch` (`queries[]`, ≤20, parallel) |
| Config | PHP `define()`s | `.env` (Zod-validated) |

## How to migrate a client

A practical, incremental path. Because both APIs read the same database, you can do this per feature and keep v1 running until every client is moved.

### 1. Stand up v2 alongside v1

Deploy the v2 service (it is independent of the v1 PHP service) and point it at the same publication MariaDB with a read-only user. List your published database(s) in `DB_NAMES`. Confirm it is up:

```bash
curl -i http://localhost:3100/publication/server_api/v2/health
# 200 when every configured database is connected.
```

Full setup (prerequisites, `.env`, run commands) is on the [v2 overview](index.md#quick-start). v1 keeps serving its existing traffic throughout.

### 2. Inventory your v1 calls

List every distinct v1 action your client issues and map each through the [endpoint mapping](#endpoint-mapping) table. Most clients use a handful: `records`, one of the search actions, maybe `combi`, and some thesaurus reads. Note which calls rely on `resolve_portal` / `resolve_portals_custom`, raw `sql_filter`, or the double-parse behaviour — those need real rewrites, not just URL swaps.

### 3. Rewrite request construction

For each call:

- **URL** — replace `/json/{action}?table=T&…` with the resource path, e.g. `/{db}/tables/T/records`. Put your database name in the `{db}` segment.
- **Filters** — translate `sql_filter` fragments into `filter[field][op]=value` params (see the [filter table](#filter-dsl-sql_filter-filterfieldopvalue)). Translate `order` into `sort`.
- **Auth** — move `?code=XXXX` to an `X-API-Key: XXXX` header (or drop it if v2 runs open behind your gateway).
- **Method** — data reads are now `GET`, not `POST`.

```bash
# v1
curl -X POST "https://example.org/server_api/v1/json/records?code=XXXX" \
  --data-urlencode 'table=interview' \
  --data-urlencode "sql_filter=code LIKE 'OH-%'" \
  --data-urlencode 'order=section_id DESC' \
  --data-urlencode 'count=10'

# v2
curl -H "X-API-Key: XXXX" \
  "https://example.org/publication/server_api/v2/dedalo_web/tables/interview/records?filter%5Bcode%5D%5Blike%5D=OH-%25&sort=-section_id&limit=10"
```

### 4. Rewrite response handling

- **Drop the second parse.** v2 values are real JSON; read `response.data` directly — no per-field `JSON.parse()`.
- **Read from the envelope.** Records are under `data`; the applied window is in `pagination`; request `count=true` if you need `pagination.total`.
- **Follow `Link` for paging** (RFC 8288 `rel="next"` / `rel="prev"`) instead of computing offsets from a v1 `total`.
- **Branch on `status`.** Replace string-matching of v1 error messages with checks on the Problem Details `status` (`400` / `401` / `404` / `429` / `500` / `504`) and read `detail` / `errors` for specifics.

### 5. Port `combi` to `/batch`

Convert each `ar_calls` entry into a `queries[]` entry: keep the `id`, set `path` to the GET route, and move the action options into `params`. Keep batches at ≤20 queries and inspect each result's own `status` (a `404` on one query no longer fails the others). See [endpoints — batch](endpoints.md#post-batch).

### 6. Adopt caching and resolution where useful

- Send `If-None-Match` with the weak `ETag` you received to get cheap `304`s; honour `Cache-Control: max-age`.
- Replace `resolve_portal` with `resolve_inverse_relations` and `resolve_portals_custom` (`{"link":"auto"}`) with `resolve_relations` (`"auto"` / explicit maps). See [querying](querying.md#forward-relation-resolution).

### 7. Verify, cut over, retire later

Compare v2 output against v1 for the same records (allowing for the envelope and parsing changes), then switch the client's base URL to v2. Leave v1 running for any client you have not migrated yet — there is no need to decommission it. When **no** client depends on v1 any more, you can retire the PHP service; until then both coexist.

!!! tip "Explore before you rewrite"
    The v2 service ships its own interactive docs and machine-readable contract: `GET /docs` (Swagger UI + Scalar, offline) and `GET /openapi.yaml` (OpenAPI 3.1). Use them to confirm exact parameter names and response shapes while porting. For AI-driven clients, the `POST /mcp` endpoint exposes the same data as structured MCP tools.

## Related

- [Publication API v2](../index.md) — version landing page, configuration and quick start.
- [Endpoints](endpoints.md) — the full v2 route catalogue with parameters and response envelopes.
- [Querying records](querying.md) — the filter DSL, sorting, pagination, `lang` and relation resolution in depth.
- [HTTP semantics](http_semantics.md) — RFC 9457 errors, `ETag` / `304` caching, RFC 8288 `Link` pagination and auth.
- [Publication API (v1)](../publication_api.md) — the legacy PHP API this guide migrates away from.
