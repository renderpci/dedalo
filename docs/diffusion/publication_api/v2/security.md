# Security

How the Publication API v2 protects a public, read-only dataset: query-injection defenses, denial-of-service bounds, rate limiting, optional API-key authentication and CORS.

The API exposes published data that is meant to be public, so the threat model is not *who can read* but *how much load and how much malformed input* an anonymous client can throw at the server. Every defense below is enforced server-side and needs no per-request configuration; you tune it through environment variables.

## Read-only by design

There is no write endpoint. The router registers only `GET` data routes plus `POST /batch` (which itself can only dispatch GET data routes) and `POST /mcp`; any other method on a known path returns `405 Method Not Allowed` with an `Allow` header.

Defense in depth means the application code is read-only **and** the database account should be too. Point the API at a MariaDB user that has been granted `SELECT` only on the publication databases:

```sql
CREATE USER 'readonly_user'@'%' IDENTIFIED BY 'your_password';
GRANT SELECT ON dedalo_web.* TO 'readonly_user'@'%';
FLUSH PRIVILEGES;
```

```env
DB_USER=readonly_user
DB_PASSWORD=your_password
DB_NAMES=dedalo_web
```

!!! note
    `DB_USER` defaults to `readonly_user`. The name is a convention, not a guarantee — what matters is that the grant is `SELECT`-only, so an unexpected code path can never mutate data.

## SQL-injection defense

The query layer never interpolates client input into SQL text. There are exactly two kinds of client-supplied SQL input, and each has its own gate:

- **Values** (filter values, `q`, `terms`, `limit`, `offset`, pagination, `section_id`) are always bound as positional `?` parameters. They never touch the SQL string.
- **Identifiers** (database, table, column and sort field names) are validated against a strict regex and only then wrapped in backticks. The pattern is:

    ```text
    ^[A-Za-z_][A-Za-z0-9_]*$
    ```

    A name must start with a letter or underscore and contain only letters, digits and underscores — no spaces, dots, quotes, parentheses or SQL keywords survive. Tables additionally must appear in the per-request schema, and databases must be in the `DB_NAMES` allowlist (`assertKnownDb`); an unknown name is a `404`, never a query.

A malformed identifier is rejected before any query runs:

```bash
# Column name contains a quote → 400 validation error, no SQL executed
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?fields=title%27"
```

```json
{
  "type": "https://dedalo.dev/api/problems/validation-error",
  "title": "Validation Error",
  "status": 400,
  "detail": "Invalid field name",
  "instance": "/dedalo_web/tables/interview/records?fields=title'"
}
```

!!! warning
    Because values are bound, a `like` filter such as `filter[code][like]=OH-%` treats `%` as a SQL wildcard *inside the bound value* — that is matching behaviour, not injection. The value can never break out of the string literal.

## Denial-of-service bounds

Several independent caps keep a single request (or a flood of them) from monopolising CPU, memory or a database connection.

| Bound | Limit | Configurable via |
|-------|-------|------------------|
| Rows per page | `limit` max `1000` (`MAX_LIMIT`), default `100` | request `limit` param |
| Fragment search terms | `10` distinct terms (`MAX_FRAGMENT_TERMS`) | — |
| Fragment term length | `64` characters per term (`MAX_TERM_LENGTH`) | — |
| Text scanned per fragment | `1 MB` / `1_000_000` chars (`MAX_SCAN_LENGTH`) | — |
| Fragment excerpt length | `max_characters` 10–5000, default `320` | request param |
| Fragment occurrences | `max_occurrences` 1–10, default `1` | request param |
| Batch size | `20` queries (`MAX_BATCH_QUERIES`) | — |
| Relation depth | `3` nested levels (`MAX_RESOLVE_DEPTH`) | — |
| Related rows per cell | `50` ids (`MAX_RESOLVE_ROWS`, silently truncated) | — |
| Resolve-map keys | `10` columns per request (`MAX_RESOLVE_KEYS`) | request `resolve_*` param |
| Database statements per request | `500` (`MAX_QUERIES_PER_REQUEST`) → `429` | — |
| Request timeout | `REQUEST_TIMEOUT_MS`, default `10000` | env var |

Every one of these is declared **once**, in `src/validators.ts` / `src/constants.ts`, and parsed by
**both** entry layers — the REST routes and the MCP tools — then clamped again at the SQL boundary.
A bound that only one door imports is not a bound: until the 2026-08-26 audit the MCP tools declared
their own unbounded `limit`, so an agent could request an entire table.

Over a bound is a `400`, never a silent clamp (the one deliberate exception is the per-cell id list,
which is data the caller did not write). Asking for more work than one request may buy — page size ×
resolve keys × related rows × depth — is a `429` from the per-request query budget, which is counted
where statements are actually issued:

```json
{
  "type": "https://dedalo.dev/api/problems/request-budget-exceeded",
  "title": "Request Budget Exceeded",
  "status": 429,
  "detail": "This request exceeded its query budget of 500 database statements. Reduce the page size (limit), the number of resolve_relations keys, or split the work across requests."
}
```

A `POST /batch` envelope shares ONE budget with its sub-queries — re-entering the router does not
buy a fresh one.

`REQUEST_TIMEOUT_MS` races the whole handler: if a request is still running after the deadline it returns `504`. Every query runs inside a request, so this is the bound that caps a slow statement's blast radius. Setting `REQUEST_TIMEOUT_MS=0` disables the race (the MCP streaming endpoint is always exempt so long-lived agent sessions are not cut off).

```env
REQUEST_TIMEOUT_MS=10000   # ms, bounds the whole request; 0 = disabled
```

Requesting more than the page cap is a validation error, not a silent clamp:

```bash
curl "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records?limit=5000"
```

```json
{
  "type": "https://dedalo.dev/api/problems/validation-error",
  "title": "Validation Error",
  "status": 400,
  "detail": "Invalid query parameters",
  "instance": "/dedalo_web/tables/interview/records?limit=5000",
  "errors": [
    { "pointer": "limit", "message": "Number must be less than or equal to 1000" }
  ]
}
```

A timed-out request returns the standard problem body with status `504`:

```json
{
  "type": "https://dedalo.dev/api/problems/timeout",
  "title": "Request Timeout",
  "status": 504,
  "detail": "Request exceeded time limit",
  "instance": "/dedalo_web/tables/interview/records"
}
```

## Rate limiting

Every request is metered by a **token bucket per client IP**. Each bucket starts full with `RATE_LIMIT_RPM` tokens (default `100`); one token is spent per request and the bucket refills to its maximum every 60-second window. When a bucket is empty the request is rejected with `429 Too Many Requests`.

```env
RATE_LIMIT_RPM=100   # requests per minute per IP
```

!!! note "A batch costs one token per sub-query"
    `POST /batch` runs up to 20 queries in a single HTTP request, so it is charged for **all of
    them**, not once: a 10-query batch spends 10 tokens. If the bucket cannot afford the whole
    fan-out the batch is rejected as a unit with `429` and nothing is run — so batching is a way to
    save round trips, never a way to multiply your quota.

The client IP is taken from `X-Forwarded-For` only when a proxy is DECLARED (`TRUST_PROXY`), and
otherwise from the connection's own peer address — so the limiter buckets per caller in
`standalone` mode too. Behind a proxy the header is read from the RIGHT (see below), so a rotating
`X-Forwarded-For` cannot buy a fresh bucket in either mode.

```json
{
  "type": "https://dedalo.dev/api/problems/rate-limit-exceeded",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. Try again later.",
  "instance": "/dedalo_web/tables/interview/records"
}
```

Client IP resolution depends on `TRUST_PROXY`, which is **derived from `DEPLOYMENT_MODE` when it is
not set**: `apache` and `nginx` put a proxy in front, so the forwarding headers are believed;
`standalone` is directly exposed, so they are not. When it is on, the limiter reads
`X-Forwarded-For` **from the right**: both shipped proxy configs APPEND
(nginx `$proxy_add_x_forwarded_for`, Apache `mod_proxy_http`), so the header arrives as
`<whatever the client typed>, <the address your proxy actually saw>` and only the trailing entries
were written by your own chain. The caller is the entry at `length - TRUSTED_PROXY_HOPS`
(default 1 = a single Apache/nginx in front); a header shorter than that chain is not believed at
all, and the socket peer answers instead. `X-Real-IP` is never consulted: nginx sets it safely, but
Apache does not set it at all, so a client-supplied one would pass straight through.

!!! danger "Reading the FIRST hop is the bypass, not the fix"
    `X-Forwarded-For.split(',')[0]` is correct only under a proxy that OVERWRITES the header.
    Neither shipped config does, so the leftmost entry is attacker text: a caller that rotates it
    gets a fresh rate-limit bucket per request while honest callers are throttled — over an API that
    is unauthenticated by default, and where the rate limiter is the only meter. Set
    `TRUSTED_PROXY_HOPS` to the exact number of proxies **you operate**.

!!! warning "`standalone` + `TRUST_PROXY=true` does not boot"
    A directly exposed server that believes a client-supplied header has no rate limit at all — every
    request forges its own bucket. That combination is therefore refused at startup unless you also
    set `TRUST_PROXY_IN_STANDALONE=true`, which states that a proxy you control terminates every
    request (a standalone process behind someone else's load balancer). Leaving `TRUST_PROXY` unset
    is the right answer in every other case.

!!! note "`TRUST_PROXY=false` really means false"
    Both booleans (`TRUST_PROXY`, `MCP_ENABLED`) accept `true/1/yes/on` and `false/0/no/off`;
    anything else fails the boot. Until the 2026-08-26 audit they were coerced with
    `Boolean(<string>)`, which made every non-empty value — `false` included — true.

## Optional API key

Authentication is **off by default** — the dataset is public. When you do want to gate access, set `API_KEYS` to a comma-separated list; the presence of at least one key flips enforcement on for every route.

```env
# Empty (default) = open access
API_KEYS=

# One or more keys = X-API-Key required on every request
API_KEYS=key_live_abc123,key_live_def456
```

Once enabled, clients must send the key in the `X-API-Key` header:

```bash
curl -H "X-API-Key: key_live_abc123" \
  "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records"
```

A missing or wrong key returns `401`:

```json
{
  "type": "https://dedalo.dev/api/problems/unauthorized",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Missing API key. Provide X-API-Key header.",
  "instance": "/dedalo_web/tables/interview/records"
}
```

Key comparison is constant-time: each candidate key is matched with `crypto.timingSafeEqual` (after a length check), so the validation does not leak key contents through response timing.

!!! note
    The key set is process-wide, not per-database. An empty or whitespace-only entry in `API_KEYS` is dropped, so a trailing comma never creates an accidental empty (always-matching) key.

## CORS

Cross-origin access is controlled by a single variable, `CORS_ORIGIN` (default `*`). It is echoed into `Access-Control-Allow-Origin`; the API always advertises `GET, POST, OPTIONS` methods and `Content-Type, X-API-Key` request headers, with preflight cached for 24 hours (`Access-Control-Max-Age: 86400`). An `OPTIONS` preflight is answered with `204 No Content`.

```env
# Allow any origin (default — appropriate for a fully public dataset)
CORS_ORIGIN=*

# Restrict to one site
CORS_ORIGIN=https://www.example.org
```

Credentials handling is automatic and follows the spec: `Access-Control-Allow-Credentials: true` is sent **only** when `CORS_ORIGIN` is a specific origin. With the wildcard `*` no credentials header is emitted, because browsers forbid `*` together with credentialed requests.

```bash
curl -i -X OPTIONS \
  "http://localhost:3100/publication/server_api/v2/dedalo_web/tables/interview/records"
```

```text
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://www.example.org
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-API-Key
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

!!! warning
    If you set `API_KEYS` and want a browser to send `X-API-Key` cross-origin, you must also set a specific `CORS_ORIGIN` (not `*`). Only then does the API allow credentialed/keyed requests from that origin.

## Hardening checklist

A reasonable production posture for a public deployment:

- Use a `SELECT`-only MariaDB user (`DB_USER`) scoped to exactly the databases in `DB_NAMES`.
- Keep `REQUEST_TIMEOUT_MS` at a sane non-zero value.
- Tune `RATE_LIMIT_RPM` to your traffic; leave `TRUST_PROXY` unset unless your topology is not what `DEPLOYMENT_MODE` says it is.
- Set `API_KEYS` if the data must be gated, and pin `CORS_ORIGIN` to your front-end origin if you rely on credentialed/keyed browser requests.
- Terminate TLS at the reverse proxy (see the Apache/Nginx deployment modes).

## Related

- [Version landing](../index.md) — Publication API v2 overview and setup
- [Endpoints](endpoints.md) — full route list, methods and response envelopes
- [Querying](querying.md) — filters, sorting, pagination and relation resolution
- [HTTP semantics](http_semantics.md) — Problem Details errors, caching/ETag and rate-limit responses
