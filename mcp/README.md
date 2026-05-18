# Dédalo MCP Servers

Two [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers for Dédalo v7:

- **`dedalo-public-mcp`** — read-only access to the Publication API (`/publication/server_api/v1/json/`).
- **`dedalo-work-mcp`** — full access to the internal Work API (`/core/api/v1/json/`), gated by Dédalo's user/profile permissions.

```
┌─────────────┐  MCP (stdio / Streamable HTTP)  ┌──────────────────┐
│  AI Agent   │◄───────────────────────────────►│ dedalo-work-mcp  │
│  (IDE/CLI)  │                                 │  (Bun/TypeScript)│
└─────────────┘                                 └────────┬─────────┘
                                                          │ HTTP POST
                                                          │ session cookie
                                                          │ + CSRF token
                                                          ▼
                                               ┌─────────────────────┐
                                               │  Dédalo Work API    │
                                               │  /core/api/v1/json/ │
                                               └─────────────────────┘
```

## Authorisation model

`dedalo-work-mcp` does **not** define its own permission flags. The server logs in to Dédalo as a configured user (`DEDALO_WORK_USERNAME` / `DEDALO_WORK_PASSWORD`) and inherits that user's profile. Authorisation is enforced server-side by Dédalo:

- `security::is_global_admin()`, `security::is_developer()` — global role checks.
- `common::get_permissions($section_tipo, $area_tipo)` — per-section permission level (0..3).
- `permission_exception` thrown by `security::assert_*` gates → returned as `errors: ['permissions_denied']`.

Recommended deployment pattern — create one Dédalo user per agent role:

| Agent role | Dédalo user | Profile |
|---|---|---|
| Read-only | `mcp_reader` | Read access on target sections only |
| Editor | `mcp_editor` | Read + write on specific sections |
| Ontology editor | `mcp_ontology_editor` | Read + write on ontology sections |
| Admin | `mcp_admin` | Global admin (maintenance, counters, schema changes) |

Switch agent capabilities by switching which Dédalo user the MCP runs as. Permission changes in the Dédalo UI take effect on the next call — no MCP restart needed.

When a tool fails with `permissions_denied` the MCP returns an actionable hint: *"The logged Dédalo user does not have permission for this action. Switch to a user whose profile grants it, or ask an administrator."*

## Quick start

```bash
# Install workspace dependencies
bun install

# Build all packages
bun run build

# Typecheck everything
bun run check

# Run unit tests
bun test
```

### Run the work MCP

```bash
DEDALO_WORK_API_URL=http://localhost \
DEDALO_WORK_USERNAME=mcp_reader \
DEDALO_WORK_PASSWORD=secret \
bun run ./dedalo-work-mcp/dist/index.js          # stdio

# Or HTTP transport (Streamable HTTP)
bun run ./dedalo-work-mcp/dist/index.js --http
```

### Run the public MCP

```bash
DEDALO_PUBLIC_API_URL=http://localhost \
DEDALO_PUBLIC_API_CODE=your-shared-code-min-16-chars \
bun run ./dedalo-public-mcp/dist/index.js
```

## Environment variables

### `dedalo-work-mcp`

| Variable | Required | Default | Description |
|---|---|---|---|
| `DEDALO_WORK_API_URL` | yes | — | Base URL of the Dédalo instance |
| `DEDALO_WORK_USERNAME` | yes | — | Dédalo user name (decides authorisation via profile) |
| `DEDALO_WORK_PASSWORD` | yes | — | Dédalo password |
| `LOG_LEVEL` | no | `info` | pino level (`debug` / `info` / `warn` / `error`) |
| `RATE_LIMIT_CAPACITY` | no | `0` (off) | Token-bucket capacity per session |
| `RATE_LIMIT_REFILL_MS` | no | `60000` | Token refill window (ms) |
| `DEDALO_MCP_HTTP_PORT` | no | `3001` | HTTP transport port |
| `DEDALO_MCP_HTTP_HOST` | no | `127.0.0.1` | HTTP bind host (loopback by default) |
| `DEDALO_MCP_ALLOWED_ORIGINS` | no | empty | Comma-separated CORS Origin allowlist |

### `dedalo-public-mcp`

| Variable | Required | Default | Description |
|---|---|---|---|
| `DEDALO_PUBLIC_API_URL` | yes | — | Base URL of the Dédalo instance |
| `DEDALO_PUBLIC_API_CODE` | yes | — | `API_WEB_USER_CODE` from `server_config_api.php` (min 16 chars) |
| `LOG_LEVEL` | no | `info` | pino level |
| `RATE_LIMIT_CAPACITY` | no | `0` | Token-bucket capacity |
| `RATE_LIMIT_REFILL_MS` | no | `60000` | Refill window (ms) |

## Tool catalogue (`dedalo-work-mcp`, ~35 tools)

All tools are prefixed `dedalo_*` so they can coexist with other MCP servers. Annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) describe semantics; **authorisation is decided by Dédalo, not by the annotation**.

### Discovery (read)
`dedalo_get_environment`, `dedalo_list_sections`, `dedalo_get_ontology_info`, `dedalo_get_section_elements_context`, `dedalo_get_element_context`, `dedalo_start`

### Records read (read)
`dedalo_read_record`, `dedalo_search_records`, `dedalo_read_raw`, `dedalo_count_records`, `dedalo_get_indexation_grid`

### Records write (mutating)
`dedalo_create_record`, `dedalo_duplicate_record`, `dedalo_save_component`, `dedalo_delete_record`

### Components (mostly mutating)
`dedalo_portal_delete_locator`

### Diffusion
`dedalo_diffusion_info`, `dedalo_diffusion_ontology_map`, `dedalo_diffusion_run`

### Time Machine (read)
`dedalo_tm_get_node_data`

### Files
_none_

### Async processes
_none_

### System / diagnostics
`dedalo_get_system_info`, `dedalo_get_server_ready_status`, `dedalo_list_user_tools`

### Maintenance area
`dedalo_maintenance_widget_run`, `dedalo_maintenance_class_run`, `dedalo_maintenance_modify_counter`

### Admin
`dedalo_admin_change_lang`

> `login` and `quit` are **not** registered as tools. The MCP's user is fixed at startup; allowing the agent to switch users would defeat profile-based authorisation. Use distinct MCP instances with distinct users instead.

## Response shape

Every tool returns a structured envelope on the MCP `structuredContent` channel and a JSON-stringified copy as `text` content (for clients without structured-content support).

Success:

```json
{
  "ok": true,
  "data": { "...": "..." },
  "pagination": { "total": 100, "offset": 0, "count": 50, "has_more": true, "next_offset": 50 }
}
```

Pagination is included only on list/search tools.

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "permissions_denied",
    "message": "Error. user has not permissions [permissions_denied]",
    "hint": "The logged Dédalo user does not have permission for this action. Switch to a user whose profile grants it, or ask an administrator."
  }
}
```

Common error codes: `permissions_denied`, `not_logged`, `csrf_failed`, `invalid_action`, `invalid_request`, `login_failed`, `maintenance_mode`, `update_lock`, `db_connection_failed`, `rate_limited`, `unknown`.

## Search Query Object (SQO)

`dedalo_search_records` and `dedalo_read_raw` accept either a typed `filter` (recursive AND/OR) or a `raw_sqo` escape hatch.

```json
{
  "section_tipo": "oh1",
  "limit": 20,
  "filter": {
    "operator": "AND",
    "rules": [
      { "path": "oh14", "operator": "contains", "value": "Picasso" },
      {
        "operator": "OR",
        "rules": [
          { "path": "oh15", "operator": "=", "value": "lg-eng" },
          { "path": "oh15", "operator": "=", "value": "lg-spa" }
        ]
      }
    ]
  },
  "order": [{ "path": "oh14", "direction": "ASC" }],
  "full_count": true
}
```

## Security

- **Cookies and CSRF tokens** are kept in-memory in the MCP process; nothing on disk.
- **Responses are redacted** before reaching MCP clients: `csrf_token`, cookies, `dedalo_last_error`, `debug`, and any key matching `password` / `secret` are replaced with `[REDACTED]`.
- **HTTP transport defaults to `127.0.0.1`** with no CORS by default. Set `DEDALO_MCP_ALLOWED_ORIGINS` to a comma-separated list to allow specific origins; missing-Origin requests (typical for non-browser clients) are accepted.
- **Rate limiting** is keyed on the MCP session id when available; otherwise a single shared bucket is used (stdio).
- **HTTPS in production** is mandatory — credentials and session cookies travel in cleartext on plain HTTP.

## Development

```bash
bun run check          # typecheck all packages
bun test               # run all unit tests
bun run build          # compile all packages
bun run inspect:work   # MCP Inspector against work-mcp
bun run inspect:public # MCP Inspector against public-mcp
```

## Project layout

```
mcp/
├── common/              shared library (@dedalo/mcp-common)
├── dedalo-public-mcp/   read-only publication-api MCP server
└── dedalo-work-mcp/     work-api MCP server (this rewrite)
    ├── src/
    │   ├── config.ts            env parsing + deprecation warnings
    │   ├── server.ts            createWorkServer()
    │   ├── index.ts             stdio / HTTP entrypoint
    │   └── tools/
    │       ├── _shared/         schemas, register, rqo, output, errors
    │       ├── discovery.ts
    │       ├── records_read.ts
    │       ├── records_write.ts
    │       ├── components.ts
    │       ├── diffusion.ts
    │       ├── time_machine.ts
    │       ├── files.ts
    │       ├── process.ts
    │       ├── system.ts
    │       ├── maintenance.ts
    │       ├── admin.ts
    │       └── index.ts         registerAllTools()
    └── test/                    unit tests
```
