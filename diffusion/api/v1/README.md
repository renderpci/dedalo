# Diffusion API (v1)

Bun-based middleware that receives client RQO (Request Query Object) requests, forwards them to Dédalo's PHP `diffusion_api`, applies parsers to the agnostic response, and inserts the final data into MariaDB.

## Architecture

```
Client (tool_diffusion) → Apache ProxyPass → Bun (unix socket)
  → PHP diffusion_api (agnostic data + parser config)
  → Bun applies parsers (text_format, string_date, parser_helper)
  → MariaDB (INSERT/UPSERT with section_id + lang key)
```

## Setup

```bash
# Install dependencies
bun install

# Copy and configure environment
cp .env.example .env
# Edit .env with your database and PHP API settings

# Run in development mode (with auto-reload)
bun run dev

# Run in production mode
bun run start
```

## Configuration

The Diffusion API uses environment variables managed in a `.env` file. Copy the example to start:

```bash
cp .env.example .env
```

### Key Environment Variables

| Variable | Description |
| --- | --- |
| `SOCKET_PATH` | Path to the Unix socket (e.g., `/tmp/diffusion.sock`). **Apache must have write permissions to this file.** |
| `DEDALO_API_URL` | The internal URL of your Dédalo PHP API (e.g., `http://localhost:8080/dedalo/core/api/v1/json/`). |
| `DEDALO_MEDIA_PATH` | Filesystem path to the Dédalo media directory (e.g., `/var/www/html/dedalo/media/`). Bun writes merged RDF and ZIP files here. Must be writable by the Bun process. When set, the engine also maintains the **media publication markers** under `{DEDALO_MEDIA_PATH}/.publication/` (zero-byte files the web server stats to authorize anonymous media access when `DEDALO_MEDIA_ACCESS_MODE='publication'` — see `lib/media_index.ts`). Markers update on every publish/unpublish/delete; run `php diffusion/migration/helpers/rebuild_media_index.php` for a full resync. Leave unset to disable the markers. |
| `DEDALO_MEDIA_URL` | Public URL prefix for the media directory (e.g., `/dedalo/media/`). Used to build download URLs returned to the client. |
| `DB_*` | Standard credentials for the target MariaDB database where diffusion data should be inserted. |

### Unix Socket Permissions

Since Bun runs as a service and Apache (or Nginx) needs to connect to the socket, you must ensure either:
1.  **Group Ownership**: Run Bun and your web server under the same group (e.g., `www-data`).
2.  **Permission Tweak**: After starting the Bun server, you may need to ensure the socket file is accessible (e.g., `chmod 666 /tmp/diffusion.sock` or `chown www-data /tmp/diffusion.sock`).


## Apache ProxyPass Configuration

To ensure Apache doesn't close the connection during long PHP processing batches, it is recommended to add the `timeout` and `keepalive` parameters:

```apache
# In your Vhost configuration
ProxyPass /diffusion/api/v1/ unix:/tmp/diffusion.sock|http://localhost/ timeout=120 keepalive=On
ProxyPassReverse /diffusion/api/v1/ unix:/tmp/diffusion.sock|http://localhost/
```

## NGINX Proxy Configuration

```nginx
# In your server block
location /diffusion/api/v1/ {
    proxy_pass http://localhost/;  # Bun listens on the Unix socket via a separate upstream
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_read_timeout 120s;
    proxy_send_timeout 120s;
    keepalive_timeout 120s;
}

# Upstream using Unix socket
upstream diffusion {
    server unix:/tmp/diffusion.sock;
}
```

> [!TIP]
> While Bun's internal 120s timeout and the 2s heartbeat prevent most disconnects, setting an explicit `proxy_read_timeout 120s` in NGINX (or `timeout=120` in Apache) provides an additional layer of stability for massive datasets.


## High Availability & Timeouts

To support complex PHP processing that can take more than 10 seconds per batch, the following settings are pre-configured:

- **idleTimeout (120s)**: Bun's socket timeout is increased to 120 seconds (matching the PHP API timeout) to prevent Bun from closing and killing the process if the PHP bridge is busy.
- **SSE Heartbeat (2s)**: The Server-Sent Events (SSE) stream sends a heartbeat every 2 seconds to keep reverse proxies (Apache/Nginx) from dropping the "idle" connection.
- **Buffer Padding (16KB)**: Each SSE chunk includes 16KB of trailing spaces to force Apache/Nginx to flush their internal buffers immediately, ensuring the user sees "Fetching data..." in real-time.


## API Actions

All actions are routed by the `action` field of a JSON POST body and are
authenticated at the Bun side. Two auth mechanisms exist:

- **session** — the browser session cookie is validated against the PHP API.
- **session or internal token** — server-to-server actions additionally accept
  the `X-Diffusion-Internal-Token` header matching `DIFFUSION_INTERNAL_TOKEN`
  in `.env` (= `DEDALO_DIFFUSION_INTERNAL_TOKEN` in the PHP config).

| Action | Auth | Description |
|---|---|---|
| `diffuse` | session | Main publish action (SSE stream). Calls PHP per chunk, parses, writes MariaDB (sql) or generates files (rdf/xml). |
| `get_diffusion_info` | session | Section diffusion configuration, enriched with per-node readiness. |
| `get_diffusion_status` | session | Engine health (server, PHP bridge, SQL). |
| `get_process_status` | session | SSE polling of a running process by `process_id`. |
| `list_processes` | session | List active/finished processes. |
| `cancel_process` | session | Cancel a running process. |
| `validate` | session | Validates diffusion ontology configuration (PHP side, admin-gated). |
| `get_ontology_map` | session | Raw ddo_map/parser definitions (PHP side, admin-gated). |
| `retry_pending_deletions` | session | Retries pending delete propagation (PHP side, admin-gated). |
| `delete_record` | session or token | Deletes published records from target databases (delete propagation). |
| `check_database` | session or token | Checks MariaDB reachability + database existence. |
| `backup_database` | session or token | Dumps a database with mysqldump to a target file. |

### GET /api/v1/health
Simple health check (no auth).

## Tests

```bash
bun test
```

## Project Structure

```
api/v1/
├── index.ts                  # Main Bun server (unix socket)
├── lib/
│   ├── types.ts              # Shared TypeScript types
│   ├── php_client.ts         # HTTP bridge to PHP diffusion_api
│   ├── diffusion_processor.ts # Core parser pipeline
│   ├── sql_generator.ts      # SQL INSERT/UPSERT generation
│   ├── db.ts                 # MariaDB connection pool
│   ├── session.ts            # Cookie/CSRF header passthrough helpers
│   ├── auth.ts               # Server-to-server auth (session OR internal token)
│   ├── db_config.ts          # Shared MariaDB connection defaults
│   ├── db_admin.ts           # check_database / backup_database (mysqldump)
│   ├── delete_handler.ts     # delete_record execution
│   ├── status.ts             # Health and readiness checks
│   ├── progress_store.ts     # In-memory process tracking (SSE)
│   └── parsers/
│       ├── index.ts           # Parser registry & dispatcher
│       ├── parser_text.ts     # text_format, default_join
│       ├── parser_date.ts     # string_date
│       └── parser_helper.ts    # merge, replace (${a}), count, get_first
└── test/
    ├── parsers.test.ts       # Parser unit tests
    ├── sql_generation.test.ts
    ├── deletion.test.ts      # fields:'delete' separation
    ├── delete_record.test.ts # delete propagation validation/auth
    └── db_admin.test.ts      # backup request validation
```
