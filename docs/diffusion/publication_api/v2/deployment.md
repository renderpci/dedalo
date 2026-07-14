# Deployment &amp; Configuration

How to configure, deploy and tune the Dédalo Publication API v2 — the read-only TypeScript/Bun service in front of the published MariaDB databases.

The API is configured entirely through environment variables (loaded from a `.env` file in the service directory), validated at startup by a Zod schema in `src/config.ts`. If any value fails validation the process logs the offending fields and exits with a non-zero status, so a misconfigured deployment fails fast rather than starting in a bad state.

```bash
cd publication/server_api/v2
bun install
cp .env.example .env
# edit .env, then:
bun run start
```

The startup banner prints the bound address, the active deployment mode and the docs URL:

```text
Dédalo Publication API v2 running at http://127.0.0.1:3100/publication/server_api/v2
Deployment mode: apache
Documentation: http://127.0.0.1:3100/publication/server_api/v2/docs
```

!!! info "Prerequisites"
    - [Bun](https://bun.sh/) v1.1+
    - MariaDB 11+ holding published data (created by the Dédalo diffusion process)
    - A **read-only** MariaDB user. The API never writes; granting only `SELECT` is the simplest way to enforce that at the database layer.

## Environment reference

Every variable below is read by `src/config.ts`. The **Default** column is the value applied when the variable is absent or empty. Numeric and boolean values are coerced (`z.coerce.*`), so `TRUST_PROXY=true`, `PORT=3100` etc. are passed as plain strings in `.env`.

### Deployment / server

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `DEPLOYMENT_MODE` | enum | `apache` | One of `apache`, `nginx`, `standalone`. Used in logging and to signal the intended fronting layer; an invalid value aborts startup. |
| `PORT` | int | `3100` | TCP port the Bun server binds to. |
| `HOST` | string | `127.0.0.1` | Bind address. Use `127.0.0.1` behind a reverse proxy; `0.0.0.0` to expose directly. |
| `BASE_PATH` | string | `/publication/server_api/v2` | Path prefix the router serves under. Set to an empty string when a proxy strips the prefix, or for standalone root-mounted serving. |
| `TRUST_PROXY` | bool | `true` | When `true`, the client IP for rate limiting is taken from `X-Forwarded-For` (first hop) or `X-Real-IP`. Set to `false` when the API is internet-facing with no trusted proxy, so spoofed forwarding headers cannot bypass the limiter. |
| `NODE_ENV` | enum | `production` | One of `development`, `production`, `test`. |

### MariaDB connection

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `DB_SOCKET` | string | _(empty)_ | Unix socket path (e.g. `/tmp/mysql.sock`). When set it takes precedence over `DB_HOST`/`DB_PORT`. |
| `DB_HOST` | string | `localhost` | MariaDB host (used when `DB_SOCKET` is empty). |
| `DB_PORT` | int | `3306` | MariaDB port. |
| `DB_USER` | string | `readonly_user` | Database user (should have only `SELECT`). |
| `DB_PASSWORD` | string | _(empty)_ | Database password. |
| `DB_NAMES` | string | `dedalo_web` | **Comma-separated allowlist** of public databases the API exposes. Every data route is scoped by a `{db}` path segment that must appear here; an unknown `{db}` returns `404`. At least one name is required — an empty list aborts startup. |
| `DB_POOL_MAX` | int | `10` | Maximum connections **per database** pool. |

!!! note "One pool per database"
    The API opens **one connection pool per entry in `DB_NAMES`** (`src/db/pool.ts`), because a MariaDB session binds the `database` at connect time and schema queries rely on `DATABASE()`. The worst-case number of open connections is therefore `DB_NAMES.length × DB_POOL_MAX`. Size `DB_POOL_MAX` and your MariaDB `max_connections` accordingly.

!!! note "Driver"
    The API talks to MariaDB through Bun's native `Bun.sql` (`mariadb` adapter) — the same driver the Dédalo engine uses for its diffusion targets. There is no third-party database client to install. A request is bounded end to end by `REQUEST_TIMEOUT_MS` (a slow query answers `504`), which is what caps a runaway statement.

### HTTP caching &amp; timeouts

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `CACHE_MAX_AGE` | int (s) | `60` | `max-age` for cacheable responses. `0` emits `Cache-Control: no-cache`. Must be ≥ 0. |
| `REQUEST_TIMEOUT_MS` | int (ms) | `10000` | Request-level timeout; a request exceeding it returns `504`. Must be ≥ 0. |

### Security

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `API_KEYS` | string | _(empty)_ | Comma-separated API keys. **Empty = open access.** When set, requests must present a matching `X-API-Key` (timing-safe comparison); otherwise `401`. |
| `RATE_LIMIT_RPM` | int | `100` | Token-bucket requests-per-minute per client IP. Exceeding it returns `429`. |
| `CORS_ORIGIN` | string | `*` | Value sent in `Access-Control-Allow-Origin`. |
| `MAX_BODY_SIZE` | int (bytes) | `65536` | Maximum request body size accepted by the server (`Bun.serve` `maxRequestBodySize`). Caps `POST /batch` payloads. |

### Media

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `MEDIA_BASE_URL` | string | `/dedalo/media` | Prefix prepended to media paths in AV-fragment and indexation responses, e.g. `${MEDIA_BASE_URL}/<video>?vbegin=120&vend=180`. |

### AV / indexation schema

The AV endpoints (`/{db}/av-indexation-fragment` and `/{db}/tables/{table}/records/{id}/av-fragments`)
join a specific published shape: a record, its media, its speakers, and the thesauri that index it.
The rest of the API is schema-agnostic; these routes cannot be, because the join *is* the feature.

The defaults are the Dédalo oral-history ontology, so a standard publication needs **no configuration
here**. A project that published under other names points these at its own tables.

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `AV_TABLE` | string | `interview` | The record table the fragment belongs to. |
| `AV_MEDIA_TABLE` | string | `audiovisual` | Table holding the media (video/image) for the record. |
| `AV_SPEAKER_TABLE` | string | `informant` | Table holding the speakers. |
| `AV_TRANSCRIPTION_COLUMN` | string | `rsc36` | Transcription column on `AV_TABLE`. |
| `AV_VIDEO_COLUMN` | string | `rsc35` | Video column on `AV_MEDIA_TABLE`. |
| `AV_THESAURUS_TABLES` | string | `ts_themes,ts_onomastic,ts_chronological` | Comma-separated thesaurus tables searched for the terms indexing a locator. |

!!! warning "These are SQL identifiers"
    A table name cannot be sent as a bound parameter, so these values are interpolated into the
    query. Each is therefore validated **at boot** against `^[A-Za-z_][A-Za-z0-9_]*$` — a malformed
    value aborts startup rather than reaching a statement.

### MCP (Model Context Protocol)

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `MCP_ENABLED` | bool | `true` | Enables the MCP endpoint for AI agents. |
| `MCP_PATH` | string | `/mcp` | Path (under `BASE_PATH`) where the MCP endpoint is served. |

### Logging

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `LOG_LEVEL` | enum | `info` | One of `debug`, `info`, `warn`, `error`. |

### Example `.env`

This mirrors `publication/server_api/v2/.env.example`:

```env
# Deployment
DEPLOYMENT_MODE=apache
PORT=3100
HOST=127.0.0.1
BASE_PATH=/publication/server_api/v2
TRUST_PROXY=true
NODE_ENV=production

# MariaDB (the diffusion-published database — always a READ-ONLY user)
# Transport: set DB_SOCKET for a unix socket; otherwise DB_HOST:DB_PORT is used.
DB_SOCKET=
DB_HOST=localhost
DB_PORT=3306
DB_USER=readonly_user
DB_PASSWORD=secret
# Comma-separated allowlist of public databases exposed by the API.
# Each database gets its own connection pool (max connections = N x DB_POOL_MAX).
DB_NAMES=dedalo_web
DB_POOL_MAX=10

# HTTP caching and timeouts
CACHE_MAX_AGE=60
# Bounds a request end to end (a slow query answers 504 rather than hanging).
REQUEST_TIMEOUT_MS=10000

# Security
API_KEYS=
# Per-IP requests/minute. A /batch request costs one token per sub-query.
RATE_LIMIT_RPM=100
CORS_ORIGIN=*
MAX_BODY_SIZE=65536

# Media
MEDIA_BASE_URL=/dedalo/media

# AV / indexation endpoints. Defaults are the Dédalo oral-history ontology, so a
# standard publication needs no configuration here. Values must be plain SQL
# identifiers (validated at boot: they are interpolated into SQL, not bound).
AV_TABLE=interview
AV_MEDIA_TABLE=audiovisual
AV_SPEAKER_TABLE=informant
AV_TRANSCRIPTION_COLUMN=rsc36
AV_VIDEO_COLUMN=rsc35
AV_THESAURUS_TABLES=ts_themes,ts_onomastic,ts_chronological

# MCP
MCP_ENABLED=true
MCP_PATH=/mcp

# Logging
LOG_LEVEL=info
```

## Deployment modes

The service is a single long-running Bun process. How it is exposed to the public is the role of `DEPLOYMENT_MODE`. The three supported topologies share the same binary and only differ in fronting layer and a handful of env values.

### Mode A — Apache reverse proxy (default)

The default. Bun binds to `127.0.0.1:3100` and Apache proxies the public path to it, terminating TLS and adding security headers. Ready-made config lives at `publication/server_api/v2/apache/dedalo_api.conf`.

```bash
# Required modules
sudo a2enmod proxy proxy_http rewrite headers

sudo cp apache/dedalo_api.conf /etc/apache2/conf-available/
sudo a2enconf dedalo_api
sudo systemctl reload apache2

bun run start
```

The supplied config proxies `/publication/server_api/v2/` to `http://127.0.0.1:3100/`, sets `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection` and `Referrer-Policy`, and gives the `/mcp` endpoint a long (`ProxyTimeout 3600`) timeout with chunked, non-buffered transfer for Server-Sent Events. The `/health` block can optionally be restricted to localhost.

Relevant `.env`:

```env
DEPLOYMENT_MODE=apache
HOST=127.0.0.1
PORT=3100
BASE_PATH=/publication/server_api/v2
TRUST_PROXY=true
```

### Mode B — Nginx reverse proxy

Same shape as Apache, fronted by Nginx. Config at `publication/server_api/v2/nginx/dedalo_api.conf`.

```bash
sudo cp nginx/dedalo_api.conf /etc/nginx/conf.d/
sudo nginx -t && sudo nginx -s reload

bun run start
```

Set the mode and start the Bun service:

```env
DEPLOYMENT_MODE=nginx
HOST=127.0.0.1
PORT=3100
BASE_PATH=/publication/server_api/v2
TRUST_PROXY=true
```

The supplied config defines an `upstream dedalo_api_v2` (with `keepalive 32`), forwards `Host`, `X-Real-IP`, `X-Forwarded-For` and `X-Forwarded-Proto`, applies the same four security headers, and disables buffering plus extends `proxy_read_timeout` to `3600s` on the `/mcp` SSE block. A commented HTTPS server block is included as a starting point for TLS.

!!! tip "Forwarded headers and `TRUST_PROXY`"
    Both proxy configs pass `X-Forwarded-For`/`X-Real-IP`. Keep `TRUST_PROXY=true` so the rate limiter attributes requests to the real client IP rather than the proxy's. If you expose Bun directly to the internet (no proxy), set `TRUST_PROXY=false`.

### Mode C — Standalone

Bun serves the public directly, with no reverse proxy. Useful for development, containers and internal tools.

```env
DEPLOYMENT_MODE=standalone
HOST=0.0.0.0
PORT=80
BASE_PATH=
TRUST_PROXY=false
```

```bash
sudo bun run start   # root needed to bind port 80
```

With `BASE_PATH=` the API is served at the root (`GET /`, `GET /databases`, …). Because there is no trusted proxy, leave `TRUST_PROXY=false` so forwarding headers are ignored for rate limiting.

!!! warning
    In standalone mode the Bun process is internet-facing. Prefer setting `API_KEYS`, a sensible `RATE_LIMIT_RPM`, and a non-wildcard `CORS_ORIGIN`, and terminate TLS in front of it (or run behind a load balancer) for production traffic.

### The database is always a real publication

There is no bundled sample database, and that is deliberate. The API's input is **always** a database
produced by the diffusion process: its tables are keyed by a composite `PRIMARY KEY (section_id, lang)`
with no surrogate `id` column, and their columns and types come from the ontology. A hand-written
sample schema would be a second, drifting copy of something the diffusion engine already owns — it
would teach a shape that no real publication has.

To try the API, run a diffusion publication to MariaDB and point `DB_NAMES` at the resulting database
with a read-only user.

## Performance notes

The API is designed so that most repeat traffic never touches MariaDB.

- **Connection pool per database.** One pool per `DB_NAMES` entry, capped at `DB_POOL_MAX` connections each (worst case `DB_NAMES.length × DB_POOL_MAX`). Keep-alive is enabled and the pool reuses connections across requests. Pools are closed cleanly on `SIGINT`/`SIGTERM`.
- **Schema cache (30 s).** Table listings, per-table schema and the inverse-relation map are held in a TTL cache for **30 seconds** (`src/services/schema.service.ts`, `resolve.service.ts`). Introspection (`/{db}/tables`, `/{db}/tables/{table}`) therefore hits the database at most twice per table per 30 s window.
- **COUNT only on demand.** Record listing and search skip the extra `COUNT(*)` query unless `count=true` is passed. `pagination.total` is present only when counted; use `limit=0&count=true` for a count-only request.
- **ETag / 304.** Cacheable JSON responses carry `Cache-Control: public, max-age=N` (from `CACHE_MAX_AGE`; `0` → `no-cache`) and a weak `ETag`. A matching `If-None-Match` short-circuits to `304 Not Modified` before compression, so unchanged data costs no body transfer. The `meta.response_time_ms` timing value is excluded from the ETag, so it never disturbs `304` validation.
- **Gzip ≥ 1 KB.** Responses of at least **1024 bytes** are gzip-compressed when the client sends `Accept-Encoding: gzip` (`src/middleware/compress.ts`). The ETag is computed on the uncompressed body.
- **Request timeout.** `REQUEST_TIMEOUT_MS` bounds the whole request, returning `504` on overrun. Every query runs inside a request, so this is what caps a runaway statement.

Verify caching from the command line:

```bash
# Weak ETag on a cacheable response
curl -sI http://localhost:3100/publication/server_api/v2/dedalo_web/tables | grep -i 'etag\|cache-control'
# ETag: W/"a1b2c3"
# Cache-Control: public, max-age=60

# Conditional request → 304 Not Modified (no body)
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'If-None-Match: W/"a1b2c3"' \
  http://localhost:3100/publication/server_api/v2/dedalo_web/tables
# 304
```

Confirm the timing header:

```bash
curl -sI "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?limit=1" | grep -i x-response-time
# X-Response-Time: 4.21
```

## Health checks

`GET /health` pings every configured database. It returns `200` when all are connected and `503` if any errors, and is **never cached** — suitable for load-balancer and container probes.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/publication/server_api/v2/health
# 200  (all DBs up)  /  503 (one or more down)
```

Both the Apache and Nginx configs expose `/health` and include a commented option to restrict it to localhost.

## Run &amp; build commands

All commands run from `publication/server_api/v2/` (scripts defined in `package.json`):

| Command | What it does |
| --- | --- |
| `bun install` | Install dependencies from `bun.lock`. |
| `bun run dev` | Development server with hot reload (`bun run --watch src/index.ts`). |
| `bun run start` | Production server (`bun run src/index.ts`). |
| `bun run typecheck` | Type-check only (`bunx tsc --noEmit`). |
| `bun test` | Run the `bun:test` suite (coverage on; 80% line/function threshold configured in `bunfig.toml`). |
| `bun run lint` | ESLint over `src/`. |

```bash
cd publication/server_api/v2
bun install
bun run typecheck
bun test
bun run start
```

## Graceful shutdown

The process traps `SIGINT` and `SIGTERM`: it stops accepting connections, halts the rate-limiter cleanup timer, drains and closes every database pool, then exits `0`. Container orchestrators and `systemctl stop` therefore get a clean teardown without leaking MariaDB connections.

## Troubleshooting

!!! warning "Common deployment issues"
    - **`connect ECONNREFUSED 127.0.0.1:3306`** — MariaDB is not reachable; check it is running and that `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD` are correct.
    - **`404 Unknown database`** — the `{db}` path segment is not in the `DB_NAMES` allowlist. Add it and restart.
    - **`Invalid environment variables`** at startup — a value failed Zod validation (e.g. a non-numeric `PORT`, a `DEPLOYMENT_MODE` outside `apache|nginx|standalone`, or an empty `DB_NAMES`). The log lists the offending fields.
    - **`429 Too Many Requests`** — the per-IP token bucket is empty; wait, or raise `RATE_LIMIT_RPM`. Behind a proxy, ensure `TRUST_PROXY=true` so limits track the real client IP.
    - **`401`** on every request — `API_KEYS` is set but the client is not sending a matching `X-API-Key`.
    - **MCP unreachable** — ensure `MCP_ENABLED=true`; the endpoint is served at `${BASE_PATH}${MCP_PATH}` (default `/publication/server_api/v2/mcp`), and proxies must not buffer its SSE stream.

## Related

- [v2 API overview](index.md) — the version landing page.
- [Endpoints](endpoints.md) — full route reference.
- [Querying](querying.md) — filters, sorting, pagination and relation resolution.
- [HTTP semantics](http_semantics.md) — error model, caching headers, batch and rate limiting.
