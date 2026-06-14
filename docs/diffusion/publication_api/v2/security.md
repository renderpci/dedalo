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
| Per-query DB timeout | `DB_QUERY_TIMEOUT` ms, default `5000` | env var |
| Request timeout | `REQUEST_TIMEOUT_MS`, default `10000` | env var |

The two timeouts are layered. The per-query timeout (`DB_QUERY_TIMEOUT`) bounds a single runaway statement at the database driver. The request timeout (`REQUEST_TIMEOUT_MS`) races the whole handler: if a request is still running after the deadline it returns `504`. Setting `REQUEST_TIMEOUT_MS=0` disables the request race (the MCP streaming endpoint is always exempt so long-lived agent sessions are not cut off).

```env
DB_QUERY_TIMEOUT=5000      # ms, bounds one SQL statement
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

```json
{
  "type": "https://dedalo.dev/api/problems/rate-limit-exceeded",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Rate limit exceeded. Try again later.",
  "instance": "/dedalo_web/tables/interview/records"
}
```

Client IP resolution depends on `TRUST_PROXY` (default `true`). When enabled, the limiter reads the first address in `X-Forwarded-For`, falling back to `X-Real-IP`, so the real client is metered behind a reverse proxy.

!!! warning
    Only enable `TRUST_PROXY` when the API really sits behind a proxy you control (the Apache/Nginx modes set this for you). If it is `true` while the API is directly exposed, a client can spoof `X-Forwarded-For` to dodge the per-IP limit. In `standalone` mode with no proxy, set `TRUST_PROXY=false`.

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
- Keep `REQUEST_TIMEOUT_MS` and `DB_QUERY_TIMEOUT` at sane non-zero values.
- Tune `RATE_LIMIT_RPM` to your traffic; set `TRUST_PROXY` to match your topology.
- Set `API_KEYS` if the data must be gated, and pin `CORS_ORIGIN` to your front-end origin if you rely on credentialed/keyed browser requests.
- Terminate TLS at the reverse proxy (see the Apache/Nginx deployment modes).

## Related

- [Version landing](../index.md) — Publication API v2 overview and setup
- [Endpoints](endpoints.md) — full route list, methods and response envelopes
- [Querying](querying.md) — filters, sorting, pagination and relation resolution
- [HTTP semantics](http_semantics.md) — Problem Details errors, caching/ETag and rate-limit responses
