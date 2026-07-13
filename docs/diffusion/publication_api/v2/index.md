# Publication API v2 — Overview

Read-only REST API over the publication MariaDB databases produced by the Dédalo diffusion process.

The Publication API v2 is a standalone service that exposes **published** cultural heritage data as
addressable HTTP resources. It is the public, read-side counterpart of Dédalo: the back-end runs the
diffusion process that writes denormalized records into one or more publication databases, and this
API serves those databases to websites, integrations and AI agents — without ever touching the
editing back-end.

!!! info "What it is, in one sentence"
    A resource-oriented, multi-database, read-only REST API (OpenAPI 3.1, spec version **2.1.0**)
    over the diffusion-produced publication databases, built with **Bun + TypeScript**.

## What it is

- **Read-only.** No write endpoint exists. Connect it with a read-only database user.
- **Resource-oriented REST.** Databases, tables and records are addressable URLs
  (`/{db}/tables/{table}/records/{id}`).
- **Multi-database.** A single server exposes every database listed in the `DB_NAMES` allowlist.
  Every data route is scoped by a `{db}` path segment that must appear in that allowlist.
- **Diffusion-produced data.** Records originate from the Dédalo diffusion process, which flattens
  work data into the publication databases. Records are identified by `section_id`; multilingual
  values are stored one row per language in a `lang` column (`lg-xxx` format, e.g. `lg-eng`).
- **OpenAPI 3.1.** The full contract ships as a spec served by the API itself, with interactive
  documentation (Swagger UI + Scalar), all hosted offline (no CDN dependencies).
- **Standard HTTP semantics.** RFC 9457 Problem Details for errors, RFC 8288 `Link` headers for
  pagination, weak `ETag` / `304` caching, gzip compression.
- **Secure by design.** Parameterized queries, identifier validation, optional API key, per-IP rate
  limiting, bounded fragment extraction and request timeouts.

## Architecture

```text
Dédalo back-end ──(diffusion process)──▶ publication MariaDB databases
                                                  │
                                          ┌───────┴────────┐
                                          │  Bun runtime   │
                                          │  TypeScript    │  ← this service (v2)
                                          │  per-db pools  │
                                          └───────┬────────┘
                                                  │ REST / OpenAPI 3.1 / MCP
                                                  ▼
                            websites · integrations · AI agents
```

Requests pass through a middleware chain (defined in `src/index.ts`) before reaching the router:

```text
compression → timing → request-id → http-cache → CORS / timeout → router
```

- **Runtime:** [Bun](https://bun.sh/) (`Bun.serve`), TypeScript, MariaDB driver (`mysql2`).
- **Routing:** a path-parameter router (`src/router.ts`). Static routes are registered first, so a
  database name in the `{db}` segment can never shadow `/databases`, `/health`, `/docs`, etc.
- **Connection pooling:** one connection pool per database (`DB_POOL_MIN` / `DB_POOL_MAX` each).
- **Caching:** schema introspection is cached (~30 s); `COUNT` queries only run when `count=true`;
  HTTP `ETag` / `304` lets clients and proxies skip transfers entirely.
- **Validation:** environment config and every request are validated with Zod schemas.

!!! note "`meta.response_time_ms`"
    Every JSON success response carries the total server processing time under
    `meta.response_time_ms` (mirrored in the `X-Response-Time` header). It is injected by a
    middleware layer and is **excluded from the `ETag`**, so it never disturbs `304` validation.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.1+
- MariaDB 11+ with published data (created by the Dédalo diffusion process)

### Install

```bash
cd publication/server_api/v2
bun install
cp .env.example .env
```

### Configure

Edit `.env`. The most important variables (all read from the process environment and validated by
`src/config.ts`):

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_HOST` | `localhost` | MariaDB host |
| `DB_PORT` | `3306` | MariaDB port |
| `DB_USER` | `readonly_user` | Read-only DB user |
| `DB_PASSWORD` | _(empty)_ | DB password |
| `DB_NAMES` | `dedalo_web` | Comma-separated allowlist of public databases (must list at least one) |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `2` / `10` | Connection pool size, per database |
| `DB_QUERY_TIMEOUT` | `5000` | Per-query DB timeout (ms) |
| `DEPLOYMENT_MODE` | `apache` | `apache` \| `nginx` \| `standalone` |
| `PORT` | `3100` | Listen port |
| `HOST` | `127.0.0.1` | Listen host |
| `BASE_PATH` | `/publication/server_api/v2` | URL prefix the API is mounted under |
| `TRUST_PROXY` | `true` | Honor proxy headers (client IP for rate limiting) |
| `CACHE_MAX_AGE` | `60` | `Cache-Control: max-age` seconds (`0` → `no-cache`) |
| `REQUEST_TIMEOUT_MS` | `10000` | Request-level timeout (`0` disables) |
| `API_KEYS` | _(empty)_ | Comma-separated keys; empty = open access |
| `RATE_LIMIT_RPM` | `100` | Token-bucket rate limit per IP, per minute |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `MAX_BODY_SIZE` | `65536` | Max request body size in bytes |
| `MEDIA_BASE_URL` | `/dedalo/media` | Base URL prefix for media in AV fragment responses |
| `MCP_ENABLED` | `true` | Enable the Model Context Protocol endpoint |
| `MCP_PATH` | `/mcp` | MCP endpoint path |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

!!! warning "`DB_NAMES` must not be empty"
    The service refuses to start (exits non-zero) if environment validation fails or if `DB_NAMES`
    resolves to an empty list. Each `{db}` path segment is checked against this allowlist; an unknown
    database returns `404`.

### Run

```bash
bun run dev    # development (hot reload, --watch)
bun run start  # production
```

On start the service logs its base URL, deployment mode and docs URL. With the defaults above the
API is served at:

```text
http://127.0.0.1:3100/publication/server_api/v2/
```

### First requests

```bash
# API index — discover the entry-point links
curl http://localhost:3100/publication/server_api/v2/

# List the public databases
curl http://localhost:3100/publication/server_api/v2/databases

# List tables in a database, then inspect one table's schema
curl http://localhost:3100/publication/server_api/v2/dedalo_web/tables
curl http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview
```

The API index (`GET /`) returns the `BASE_PATH`-prefixed entry-point links:

```json
{
  "name": "Dédalo Publication API",
  "version": "2.1.0",
  "links": {
    "databases": "/publication/server_api/v2/databases",
    "docs": "/publication/server_api/v2/docs",
    "openapi": "/publication/server_api/v2/openapi.yaml",
    "health": "/publication/server_api/v2/health"
  }
}
```

!!! tip "Base URL"
    Every path in this documentation is relative to `BASE_PATH`. With the default deployment that is
    `http://<host>:<port>/publication/server_api/v2`. In `standalone` mode you can set
    `BASE_PATH=` (empty) to serve from the root.

## Interactive documentation

The OpenAPI 3.1 contract and two interactive explorers are served by the API itself — entirely
offline, with no CDN dependencies:

| Endpoint | What it serves |
|----------|----------------|
| `GET {BASE_PATH}/docs` | Interactive documentation landing |
| `GET {BASE_PATH}/docs/swagger` | Swagger UI (plus its asset subpaths) |
| `GET {BASE_PATH}/docs/scalar` | Scalar API reference (plus its asset subpaths) |
| `GET {BASE_PATH}/openapi.yaml` | The raw OpenAPI 3.1 spec (version 2.1.0) |

```bash
# Fetch the machine-readable contract
curl http://localhost:3100/publication/server_api/v2/openapi.yaml

# Open the interactive docs in a browser
open http://localhost:3100/publication/server_api/v2/docs
```

A liveness check is available separately and is **never cached**:

```bash
curl -i http://localhost:3100/publication/server_api/v2/health
# 200 when every configured database is connected; 503 if any database errors.
```

## Project structure

```text
publication/server_api/v2/
├── src/
│   ├── index.ts        # Entry point: Bun.serve + middleware chain
│   ├── config.ts       # Env config (Zod-validated) + derived lists (dbNames, apiKeys)
│   ├── constants.ts    # API_VERSION = "2.1.0"
│   ├── router.ts       # Path-parameter router; static routes first, then /:db/...
│   ├── routes/         # One handler per resource (discovery, tables, records,
│   │                   #   table-search, fragments, av-indexation-fragment, batch,
│   │                   #   docs, health)
│   ├── services/       # records, search, schema, relation resolve, batch, av-indexation
│   ├── db/             # Per-database pools, query builder, TTL schema cache
│   ├── security/       # API key auth, CORS, rate limiting
│   ├── middleware/     # error (problem+json), http-cache, timeout, compress, timing, logging
│   ├── utils/          # query-param parsing (filters/sort), fragments, response/Link helpers
│   ├── mcp/            # MCP server + tools
│   └── docs/           # OpenAPI 3.1 spec (openapi.yaml) + offline Swagger/Scalar assets
├── apache/  nginx/            # Deployment configs
└── tests/                     # bun:test suite
```

Common commands (`package.json`):

```bash
bun run dev        # development (hot reload)
bun run start      # production
bun run typecheck  # tsc --noEmit
bun test           # test suite
bun run lint       # eslint src/
```

## Where to next

This overview is the entry point. The rest of the v2 reference is split into focused pages:

- **[Endpoints](endpoints.md)** — every route, path parameters and response envelopes
  (databases, tables, records, search, text/AV fragments, indexation locator, batch, MCP).
- **[Querying](querying.md)** — the record listing model: bracketed `filter[field][op]=value`
  operators, `sort`, `fields`, pagination (`limit`/`offset`/`count`), `lang`, and relation
  resolution (`resolve_relations` / `resolve_inverse_relations`).
- **[HTTP semantics](http_semantics.md)** — RFC 9457 errors, RFC 8288 `Link` pagination,
  `ETag` / `304` caching, gzip, rate limiting and API-key auth.

## Related

- [Publication API — version landing](../index.md)
- [Publication API (v1)](../publication_api.md)
- [Public API configuration](../public_api_configuration.md)
- [Server config API](../server_config_api.md)
