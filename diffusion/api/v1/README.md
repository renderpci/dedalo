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
# Edit .env with your database, Redis, and PHP API settings

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

> [!TIP]
> While Bun's internal 120s timeout and the 2s heartbeat prevent most disconnects, setting an explicit `timeout=120` in Apache provides an additional layer of stability for massive datasets.


## High Availability & Timeouts

To support complex PHP processing that can take more than 10 seconds per batch, the following settings are pre-configured:

- **idleTimeout (120s)**: Bun's socket timeout is increased to 120 seconds (matching the PHP API timeout) to prevent Bun from closing and killing the process if the PHP bridge is busy.
- **SSE Heartbeat (2s)**: The Server-Sent Events (SSE) stream sends a heartbeat every 2 seconds to keep reverse proxies (Apache/Nginx) from dropping the "idle" connection.
- **Buffer Padding (16KB)**: Each SSE chunk includes 16KB of trailing spaces to force Apache/Nginx to flush their internal buffers immediately, ensuring the user sees "Fetching data..." in real-time.


## API Endpoints

### POST /api/v1/diffuse
Main endpoint. Receives an RQO, calls PHP API, parses data, inserts into MariaDB.

### POST /api/v1/validate
Pass-through to PHP validation.

### POST /api/v1/get_ontology_map
Pass-through to PHP ontology map retrieval.

### GET /api/v1/health
Health check.

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
│   ├── session.ts            # Redis session validation
│   └── parsers/
│       ├── index.ts           # Parser registry & dispatcher
│       ├── parser_text.ts     # text_format, default_join
│       ├── parser_date.ts     # string_date
│       └── parser_helper.ts    # merge, replace (${a}), count, get_first
└── test/
    └── parsers.test.ts       # Parser unit tests
```
