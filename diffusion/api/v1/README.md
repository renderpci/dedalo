# Diffusion API (v1)

Bun-based middleware that receives client RQO (Request Query Object) requests, forwards them to Dédalo's PHP `diffusion_api`, applies parsers to the agnostic response, and inserts the final data into MariaDB.

## Architecture

```
Client (tool_diffusion) → Apache ProxyPass → Bun (unix socket)
  → PHP diffusion_api (agnostic data + parser config)
  → Bun applies parsers (text_format, string_date, pattern_replacer)
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

## Apache ProxyPass Configuration

```apache
ProxyPass /diffusion/api/v1/ unix:/tmp/diffusion.sock|http://localhost/
ProxyPassReverse /diffusion/api/v1/ unix:/tmp/diffusion.sock|http://localhost/
```

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
│       └── pattern_replacer.ts # ${a} pattern replacement
└── test/
    └── parsers.test.ts       # Parser unit tests
```
