# Dédalo Publication API v2

Read-only REST API for accessing published cultural heritage data from Dédalo. Built with TypeScript and Bun.

## Features

- **Resource-oriented REST**: databases, tables and records are addressable URLs
- **Multi-database**: one server exposes every configured public database
- **OpenAPI 3.1** spec with interactive documentation (Swagger UI + Scalar, offline)
- **Standard HTTP semantics**: RFC 9457 Problem Details errors, RFC 8288 `Link` pagination headers, `ETag`/`304` caching
- **Search**: filtering DSL, MariaDB fulltext, text fragments, audiovisual fragments
- **MCP integration** for AI agents
- **Secure by design**: read-only, parameterized queries, rate limiting, bounded fragment extraction, request timeouts

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.1+
- MariaDB 11+ with published data (created by the Dédalo diffusion process)

### Installation

```bash
cd publication/server_api/v2
bun install
cp .env.example .env
```

Edit `.env`:

```env
# Databases (comma-separated allowlist of public databases)
DB_HOST=localhost
DB_PORT=3306
DB_USER=readonly_user
DB_PASSWORD=your_password
DB_NAMES=dedalo_web

# Server
DEPLOYMENT_MODE=apache  # apache | nginx | standalone
PORT=3100
HOST=127.0.0.1
BASE_PATH=/publication/server_api/v2

# Security (optional)
API_KEYS=  # Leave empty for open access, or set comma-separated keys
RATE_LIMIT_RPM=100

# Caching / timeouts
CACHE_MAX_AGE=60
REQUEST_TIMEOUT_MS=10000
```

### Run

```bash
bun run dev    # development (hot reload)
bun run start  # production
```

The API is served at `http://127.0.0.1:3100/publication/server_api/v2/`.

## API Overview

```
GET  /                                          API index (links)
GET  /databases                                 list public databases
GET  /{db}/tables                               list tables
GET  /{db}/tables/{table}                       table schema (columns, types, row count)
GET  /{db}/tables/{table}/records               list records (filter/sort/paginate)
GET  /{db}/tables/{table}/records/{id}          single record (language variants)
GET  /{db}/tables/{table}/search?q=...          fulltext search
GET  /{db}/tables/{table}/records/{id}/fragments     text fragments
GET  /{db}/tables/{table}/records/{id}/av-fragments  audiovisual fragments
GET  /{db}/av-indexation-fragment               locator → AV fragment
POST /batch                                     multiple GET queries in one request
GET  /health                                    health check (all databases)
GET  /docs                                      interactive documentation
GET  /openapi.yaml                              OpenAPI 3.1 spec
POST /mcp                                       Model Context Protocol endpoint
```

The full contract (parameters, schemas, examples) lives in the OpenAPI spec: visit `{BASE_PATH}/docs` for Swagger UI / Scalar, both served locally without CDN dependencies.

## Usage Examples

### Discover databases and tables

```bash
curl http://localhost:3100/publication/server_api/v2/databases
curl http://localhost:3100/publication/server_api/v2/dedalo_web/tables
curl http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview
```

### List and filter records

Filters use bracketed parameters `filter[field][operator]=value` (operator defaults to `eq`); repeated filters are ANDed. Operators: `eq, ne, gt, gte, lt, lte, like, in, not_in, is_null, is_not_null` (`in`/`not_in` take pipe-separated values). Sorting: `sort=title,-section_id` (`-` = descending).

```bash
# Filter + sort + field selection
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?filter%5Bcode%5D%5Blike%5D=OH-%25&sort=-section_id&fields=section_id,code,title&limit=10"

# Range query, with total count
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?filter%5Bdate%5D%5Bgte%5D=1936&filter%5Bdate%5D%5Blte%5D=1939&count=true"
```

**Response** (`Link` header carries `rel="next"` / `rel="prev"`):

```json
{
  "data": [
    { "section_id": 142, "lang": "lg-eng", "code": "OH-142", "title": "..." }
  ],
  "pagination": { "limit": 10, "offset": 0, "total": 142 }
}
```

`pagination.total` is only computed when `count=true`. Use `limit=0&count=true` for a count-only request.

### Get a single record

Records are identified by `section_id`; multilingual values are one row per language. Without `lang` all variants are returned.

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records/1"
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records/1?lang=lg-eng"
```

```json
{
  "data": [
    { "section_id": 1, "lang": "lg-eng", "code": "OH-001", "title": "Interview with María" },
    { "section_id": 1, "lang": "lg-spa", "code": "OH-001", "title": "Entrevista con María" }
  ],
  "meta": { "section_id": 1, "languages": ["lg-eng", "lg-spa"] }
}
```

A missing record returns `404` with an `application/problem+json` body.

### Fulltext search

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/search?q=guerra+civil&limit=20"
```

Each row includes a `relevance` score and highlighted `fragments`.

### Text and audiovisual fragments

```bash
# Excerpts with page references from large texts
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/publications/records/123/fragments?terms=economia&max_occurrences=3"

# Interview excerpts with video timecodes and media URLs
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records/46/av-fragments?terms=guerra&max_characters=500"

# Resolve a thesaurus indexation locator
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/av-indexation-fragment?section_id=1&tag_id=1&tc_in=120&tc_out=180"
```

### Relation resolution

`resolve_relations` replaces JSON arrays of section_ids with the full target rows; `resolve_inverse_relations` resolves the `dd_relations` column:

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?resolve_relations=%7B%22image%22%3A%22image%22%7D"
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?resolve_inverse_relations=true"
```

### Batch queries

Run up to 20 GET queries in parallel. Each query names a `path` (no query string) and optional `params`; array values become repeated keys so bracketed filters work:

```bash
curl -X POST http://localhost:3100/publication/server_api/v2/batch \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      { "id": "interviews", "path": "/dedalo_web/tables/interview/records",
        "params": { "filter[code][like]": "OH-%", "sort": "-section_id", "limit": 5 } },
      { "id": "tables", "path": "/dedalo_web/tables" }
    ]
  }'
```

Each result carries its own HTTP status with either `data` or a `problem` (RFC 9457 body), so one failing query never breaks the batch.

## HTTP Standards

### Errors — RFC 9457 Problem Details

All errors are `application/problem+json`:

```json
{
  "type": "https://dedalo.dev/api/problems/validation-error",
  "title": "Validation Error",
  "status": 400,
  "detail": "Invalid filter operator: \"lke\". Valid: eq, ne, gt, gte, lt, lte, like, in, not_in, is_null, is_not_null",
  "instance": "/dedalo_web/tables/interview/records?filter[code][lke]=OH-%",
  "errors": [{ "pointer": "limit", "message": "Number must be less than or equal to 1000" }]
}
```

Statuses: `400` validation, `401` missing/invalid API key, `404` unknown database/table/record/route, `405` wrong method (with `Allow` header), `429` rate limited, `500` internal, `504` request timeout.

### Caching — ETag / 304

Every cacheable response includes `Cache-Control: public, max-age=N` (configurable via `CACHE_MAX_AGE`, `0` → `no-cache`) and a weak `ETag`:

```bash
curl -sI .../dedalo_web/tables | grep -i etag        # ETag: W/"a1b2c3"
curl -s -H 'If-None-Match: W/"a1b2c3"' .../dedalo_web/tables  # → 304 Not Modified
```

### Pagination — Link headers

```
Link: </publication/server_api/v2/dedalo_web/tables/interview/records?offset=100&limit=100>; rel="next"
```

### Response timing

Every JSON success response includes the total server processing time under `meta.response_time_ms` (also exposed as the `X-Response-Time` header):

```json
{
  "data": [ ... ],
  "pagination": { "limit": 100, "offset": 0 },
  "meta": { "response_time_ms": 4.21 }
}
```

The timing value is excluded from `ETag` computation, so it never disturbs `304` cache validation.

## MCP Integration

The API includes a Model Context Protocol server for AI agents at `{BASE_PATH}/mcp`.

| Tool | Description |
|------|-------------|
| `list_databases` | List public databases |
| `get_schema` | Introspect tables and columns |
| `search_records` | Query records (structured `filters` array, `sort`) |
| `get_record` | Get a record by section_id with language variants |
| `count_records` | Count matching records (filters or fulltext) |
| `fulltext_search` | Fulltext search with highlighting |
| `get_text_fragment` | Extract publication text fragments |
| `get_av_fragment` | Extract audiovisual interview fragments |
| `get_av_indexation_fragment` | Resolve indexation locator to AV fragment |

All tools accept an optional `db` (defaults to the first configured database). Filters are structured objects instead of strings:

```typescript
const result = await client.callTool({
  name: 'search_records',
  arguments: {
    db: 'dedalo_web',
    table: 'interview',
    filters: [{ field: 'code', op: 'like', value: 'OH-%' }],
    sort: '-section_id',
    limit: 10,
  },
});
```

## Deployment Modes

### Mode A: Apache Reverse Proxy (Default)

```bash
sudo cp apache/dedalo_api.conf /etc/apache2/conf-available/
sudo a2enconf dedalo_api
sudo systemctl reload apache2
bun run start
```

### Mode B: Nginx Reverse Proxy

```bash
sudo cp nginx/dedalo_api.conf /etc/nginx/conf.d/
sudo nginx -s reload
```

Set `DEPLOYMENT_MODE=nginx` in `.env` and start the Bun service.

### Mode C: Standalone

```env
DEPLOYMENT_MODE=standalone
HOST=0.0.0.0
PORT=80
BASE_PATH=
TRUST_PROXY=false
```

```bash
sudo bun run start  # root needed for port 80
```

### Docker

```bash
cd docker
docker-compose up -d
```

## Security

- **Read-only**: no write endpoint exists; use a read-only DB user
- **SQL injection**: every value is a bound parameter; identifiers are validated against `^[A-Za-z_][A-Za-z0-9_]*$`
- **DoS bounds**: max 1000 rows per page, fragment extraction capped (10 terms, 64 chars/term, 1 MB scanned), per-query DB timeout, request-level timeout (`REQUEST_TIMEOUT_MS`)
- **Rate limiting**: token bucket per IP (`RATE_LIMIT_RPM`, default 100/min) → `429`
- **Optional API key**: set `API_KEYS=key1,key2` to require `X-API-Key` (timing-safe comparison); empty = open access
- **CORS**: configurable via `CORS_ORIGIN`

## Performance

- Connection pool per database (`DB_POOL_MAX` each; worst case = databases × pool size)
- Schema introspection cached 30 s; COUNT queries only run when `count=true`
- HTTP caching (`ETag`/`304`) lets clients and proxies skip transfers entirely
- Gzip compression for responses ≥ 1 KB

## Development

### Project Structure

```
publication/server_api/v2/
├── src/
│   ├── index.ts              # Entry point + middleware chain
│   ├── config.ts             # Env config (Zod-validated)
│   ├── router.ts             # Path-parameter router + batch dispatch
│   ├── routes/               # One handler per resource
│   ├── services/             # records, search, schema, resolve, batch, av-indexation
│   ├── db/                   # Pools (per database), query builder, TTL cache
│   ├── security/             # API key auth, CORS, rate limiting
│   ├── middleware/           # errors (problem+json), http-cache, timeout, compress, logging
│   ├── utils/                # filter/sort parsing, fragments, Link headers
│   ├── mcp/                  # MCP server + tools
│   └── docs/                 # OpenAPI 3.1 spec
├── apache/  nginx/  docker/  # Deployment configs
└── tests/                    # bun:test suite
```

### Commands

```bash
bun run dev        # development
bun run typecheck  # tsc --noEmit
bun test           # tests (80% coverage threshold)
bun run start      # production
```

### Adding New Endpoints

1. Create service in `src/services/`
2. Create route handler in `src/routes/`
3. Register the route pattern in `src/router.ts`
4. Update OpenAPI spec in `src/docs/openapi.yaml`
5. Add tests in `tests/`

## Migration from v1 (PHP)

| v1 Endpoint | v2 Equivalent |
|-------------|---------------|
| `tables_info`, `publication_schema`, `table_thesaurus` | `GET /{db}/tables`, `GET /{db}/tables/{table}` |
| `records` | `GET /{db}/tables/{table}/records` |
| `free_search`, `global_search` | `GET /{db}/tables/{table}/search?q=` |
| `text_fragment` | `GET /{db}/tables/{table}/records/{id}/fragments` |
| `fragment_from_index_locator` | `GET /{db}/av-indexation-fragment` |
| All `thesaurus_*` | `GET /{db}/tables/ts_*/records` |
| `combi` | `POST /batch` |

### Breaking changes vs. the previous v2 draft

- `GET /search?mode=...` and `GET /schema` were replaced by the resource routes above
- Filter DSL `field:op:value` → bracketed params `filter[field][op]=value`; `order=field:dir` → `sort=field,-field`
- Response envelope is `{ data, pagination }`; errors are `application/problem+json`
- `DB_NAME` env var → `DB_NAMES` (comma-separated)
- Batch queries use `path` + `params` instead of `endpoint` enums
- MCP tools take a `db` argument and structured `filters` (saved prompts using the old string DSL must be updated)

## Troubleshooting

**`connect ECONNREFUSED 127.0.0.1:3306`** — check MariaDB is running and `.env` credentials.

**`404 Unknown database`** — the `{db}` path segment must be listed in `DB_NAMES`.

**`429 Too Many Requests`** — wait, or raise `RATE_LIMIT_RPM`.

**MCP connection failed** — ensure `MCP_ENABLED=true` and the endpoint is reachable.

## License

GPL-3.0

## Support

- Documentation: `/docs` endpoint
- Issues: https://github.com/your-org/dedalo/issues
- Email: support@dedalo.dev
