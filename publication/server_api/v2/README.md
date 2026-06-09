# Dédalo Publication API v2

Read-only REST API for accessing published cultural heritage data from Dédalo. Built with TypeScript and Bun for maximum performance.

## Features

- **OpenAPI 3.1 compliant** REST API
- **Read-only** access to published data (MariaDB)
- **Multiple search modes**: records query, full-text search, text fragments, audiovisual fragments
- **MCP integration** for AI agents
- **High performance**: Bun runtime, connection pooling, query caching
- **Secure**: Rate limiting, input validation, SQL injection prevention
- **Developer-friendly**: Interactive documentation, clear examples

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.1+
- MariaDB 11+ with published data
- Node.js 20+ (for type checking)

### Installation

```bash
cd publication/server_api/v2
bun install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=readonly_user
DB_PASSWORD=your_password
DB_NAME=dedalo_web

# Server
DEPLOYMENT_MODE=apache  # apache | nginx | standalone
PORT=3100
HOST=127.0.0.1
BASE_PATH=/publication/server_api/v2

# Security (optional)
API_KEYS=  # Leave empty for open access, or set comma-separated keys
RATE_LIMIT_RPM=100
```

### Run

```bash
# Development (with hot reload)
bun run dev

# Production
bun run start
```

The API will be available at `http://127.0.0.1:3100/publication/server_api/v2/`

## Deployment Modes

### Mode A: Apache Reverse Proxy (Default)

For same-machine deployment with Dédalo:

1. Copy Apache config:
```bash
sudo cp apache/dedalo_api.conf /etc/apache2/conf-available/
sudo a2enconf dedalo_api
sudo systemctl reload apache2
```

2. Start Bun service:
```bash
bun run start
```

Access via: `http://your-domain.com/publication/server_api/v2/`

### Mode B: Nginx Reverse Proxy

For isolated publication server:

1. Copy Nginx config:
```bash
sudo cp nginx/dedalo_api.conf /etc/nginx/conf.d/
sudo nginx -s reload
```

2. Update `.env`:
```env
DEPLOYMENT_MODE=nginx
```

3. Start Bun service

### Mode C: Standalone

For dedicated VM/server:

1. Update `.env`:
```env
DEPLOYMENT_MODE=standalone
HOST=0.0.0.0
PORT=80
BASE_PATH=
TRUST_PROXY=false
```

2. Start with root privileges (for port 80):
```bash
sudo bun run start
```

### Docker

```bash
cd docker
docker-compose up -d
```

Access at: `http://localhost:3100/`

## Documentation

The API includes two interactive documentation UIs, both served locally without CDN dependencies:

### Access Documentation

Visit `{BASE_PATH}/docs` to see the landing page with options:

- **Swagger UI** (`{BASE_PATH}/docs/swagger`) - Industry standard OpenAPI documentation
- **Scalar** (`{BASE_PATH}/docs/scalar`) - Modern, beautiful API documentation

### Features

- **Fully isolated**: All assets served locally from `node_modules`
- **No CDN dependencies**: Works completely offline
- **Interactive**: Test API endpoints directly from the documentation
- **OpenAPI 3.1**: Full specification available at `{BASE_PATH}/openapi.yaml`

### Example

```bash
# Visit in browser
http://localhost:3100/publication/server_api/v2/docs
```

## API Endpoints

### Base URL

```
http://your-domain.com/publication/server_api/v2
```

### Authentication

Optional. If `API_KEYS` is configured, include in header:

```
X-API-Key: your-api-key
```

### Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/schema` | GET | Database introspection |
| `/search` | GET | Unified search (4 modes) |
| `/av-indexation-fragment` | GET | Audiovisual fragment from locator |
| `/batch` | POST | Execute multiple queries |
| `/docs` | GET | Interactive API documentation |
| `/health` | GET | Health check |

## Usage Examples

### 1. Get Database Schema

```bash
# All tables
curl http://localhost:3100/publication/server_api/v2/schema

# Specific table
curl http://localhost:3100/publication/server_api/v2/schema?table=interview
```

**Response:**
```json
{
  "tables": [
    {
      "name": "interview",
      "columns": ["id", "section_id", "lang", "code", "title", "abstract", "transcription"],
      "row_count": 142
    }
  ]
}
```

### 2. Query Records (mode=records)

```bash
# Basic query
curl "http://localhost:3100/publication/server_api/v2/search?table=interview&limit=10"

# With filtering and field selection
curl "http://localhost:3100/publication/server_api/v2/search?table=interview&fields=section_id,code,title&where=code%20LIKE%20%27OH-%25%27&order=title%20ASC"

# Query thesaurus (same endpoint, different table)
curl "http://localhost:3100/publication/server_api/v2/search?table=ts_themes&where=term%20LIKE%20%27%25war%25%27"
```

**Response:**
```json
{
  "mode": "records",
  "data": [
    {
      "section_id": 1,
      "code": "OH-001",
      "title": "Interview with John Doe"
    }
  ],
  "total": 142,
  "limit": 10,
  "offset": 0
}
```

### 3. Full-Text Search (mode=fulltext)

```bash
curl "http://localhost:3100/publication/server_api/v2/search?mode=fulltext&q=guerra+civil&table=interview&column=transcription&limit=20"
```

**Response:**
```json
{
  "mode": "fulltext",
  "data": [
    {
      "section_id": 46,
      "relevance": 0.95,
      "fragments": [
        {
          "text": "...context with <mark>guerra</mark> highlighted...",
          "position": 1234
        }
      ]
    }
  ],
  "total": 5,
  "query": "guerra civil"
}
```

### 4. Text Fragment from Publications (mode=text-fragment)

Extract excerpts from books, thesis, or large texts with page references:

```bash
curl "http://localhost:3100/publication/server_api/v2/search?mode=text-fragment&table=publications&section_id=123&terms=economia&max_characters=320&max_occurrences=3"
```

**Response:**
```json
{
  "mode": "text-fragment",
  "section_id": 123,
  "terms": "economia",
  "data": [
    {
      "text": "...text with <mark>economia</mark> highlighted...",
      "page": 12,
      "position": 4521
    }
  ],
  "total": 3
}
```

### 5. Audiovisual Fragment (mode=av-fragment)

Extract interview fragments with video timecodes and media URLs:

```bash
curl "http://localhost:3100/publication/server_api/v2/search?mode=av-fragment&table=interview&section_id=46&terms=guerra&max_characters=500&max_occurrences=2"
```

**Response:**
```json
{
  "mode": "av-fragment",
  "section_id": 46,
  "terms": "guerra",
  "data": [
    {
      "transcription": "...interview text with <mark>guerra</mark> highlighted...",
      "media": {
        "video_url": "/dedalo/media/av/404/rsc35_rsc167_46.mp4?vbegin=120&vend=180",
        "image_url": "/dedalo/media/av/posterframe/rsc35_rsc167_46.jpg",
        "tc_in": 120,
        "tc_out": 180
      },
      "speakers": [
        { "name": "John Doe", "role": "informant" }
      ]
    }
  ],
  "total": 2
}
```

### 6. Audiovisual Indexation Fragment

Resolve a thesaurus indexation locator to an audiovisual fragment:

```bash
curl "http://localhost:3100/publication/server_api/v2/av-indexation-fragment?section_id=1&section_tipo=rsc167&component_tipo=rsc36&tag_id=1&tc_in=120&tc_out=180"
```

**Response:**
```json
{
  "locator": {
    "section_id": 1,
    "section_tipo": "rsc167",
    "component_tipo": "rsc36",
    "tag_id": 1,
    "tc_in": 120,
    "tc_out": 180
  },
  "transcription": "...text of the interview fragment...",
  "media": {
    "video_url": "/dedalo/media/av/404/rsc35_rsc167_1.mp4?vbegin=120&vend=180",
    "image_url": "/dedalo/media/av/posterframe/rsc35_rsc167_1.jpg",
    "tc_in": 120,
    "tc_out": 180
  },
  "speakers": [
    { "name": "John Doe", "role": "informant" }
  ],
  "terms": [
    { "term_id": "ts1_156", "term": "Spanish Civil War" }
  ]
}
```

### 7. Batch Queries

Execute multiple queries in parallel:

```bash
curl -X POST http://localhost:3100/publication/server_api/v2/batch \
  -H "Content-Type: application/json" \
  -d '{
    "queries": [
      {
        "id": "interviews",
        "endpoint": "/search",
        "params": { "table": "interview", "limit": 5 }
      },
      {
        "id": "search_war",
        "endpoint": "/search",
        "params": { "mode": "fulltext", "q": "guerra", "table": "interview" }
      },
      {
        "id": "schema",
        "endpoint": "/schema",
        "params": {}
      }
    ]
  }'
```

**Response:**
```json
{
  "results": [
    {
      "id": "interviews",
      "status": 200,
      "data": { "mode": "records", "data": [...], "total": 142 }
    },
    {
      "id": "search_war",
      "status": 200,
      "data": { "mode": "fulltext", "data": [...], "total": 5 }
    },
    {
      "id": "schema",
      "status": 200,
      "data": { "tables": [...] }
    }
  ]
}
```

## MCP Integration

The API includes a Model Context Protocol (MCP) server for AI agents.

### MCP Endpoint

```
http://localhost:3100/publication/server_api/v2/mcp
```

### Available Tools

| Tool | Description |
|------|-------------|
| `search_records` | Query records from any table |
| `fulltext_search` | Full-text search with highlighting |
| `get_text_fragment` | Extract publication text fragments |
| `get_av_fragment` | Extract audiovisual interview fragments |
| `get_av_indexation_fragment` | Resolve indexation locator to AV fragment |
| `get_schema` | Introspect database schema |

### Example: Using MCP with Claude

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(new URL('http://localhost:3100/publication/server_api/v2/mcp'));
const client = new Client({ name: 'my-app', version: '1.0.0' });

await client.connect(transport);

const result = await client.callTool({
  name: 'search_records',
  arguments: {
    table: 'interview',
    limit: 10
  }
});

console.log(result);
```

## Security

### Rate Limiting

- Default: 100 requests per minute per IP
- Configurable via `RATE_LIMIT_RPM` env var
- Returns `429 Too Many Requests` when exceeded

### Input Validation

- All inputs validated and sanitized
- SQL injection prevention via parameterized queries
- XSS prevention via input sanitization
- Table/column names validated against allowlist

### Authentication

Optional API key authentication:

```bash
curl -H "X-API-Key: your-key" http://localhost:3100/publication/server_api/v2/search?table=interview
```

Configure in `.env`:
```env
API_KEYS=key1,key2,key3
```

### CORS

Configurable via `CORS_ORIGIN` env var:
```env
CORS_ORIGIN=https://your-frontend.com
```

## Performance

### Optimizations

- **Connection pooling**: mysql2 pool (min: 2, max: 10)
- **Query caching**: LRU cache for schema and repeated queries (TTL: 60s)
- **Prepared statements**: Server-side prepared statements
- **Batch parallelism**: `/batch` executes queries concurrently
- **Bun optimizations**: Native HTTP server, compression

### Benchmarks

Tested on MacBook Pro M2, MariaDB 11:

| Endpoint | Requests/sec | Avg Latency |
|----------|--------------|-------------|
| `/schema` | 2,500 | 2ms |
| `/search?mode=records` | 1,800 | 5ms |
| `/search?mode=fulltext` | 800 | 12ms |
| `/batch` (5 queries) | 600 | 15ms |

## Development

### Project Structure

```
publication/server_api/v2/
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Configuration
│   ├── router.ts             # Route dispatcher
│   ├── routes/               # Route handlers
│   ├── services/             # Business logic
│   ├── db/                   # Database layer
│   ├── security/             # Auth, rate limiting, sanitization
│   ├── mcp/                  # MCP server
│   ├── middleware/           # Logger, error handler, timing
│   └── docs/                 # OpenAPI spec
├── apache/                   # Apache config
├── nginx/                    # Nginx config
├── docker/                   # Docker files
├── tests/                    # Test files
└── package.json
```

### Commands

```bash
# Development
bun run dev

# Type checking
bun run typecheck

# Testing
bun test

# Production
bun run start
```

### Adding New Endpoints

1. Create service in `src/services/`
2. Create route handler in `src/routes/`
3. Register route in `src/router.ts`
4. Update OpenAPI spec in `src/docs/openapi.yaml`
5. Add tests in `tests/`

## Migration from v1

### Endpoint Mapping

| v1 Endpoint | v2 Equivalent |
|-------------|---------------|
| `tables_info` | `GET /schema` |
| `publication_schema` | `GET /schema` |
| `table_thesaurus` | `GET /schema` |
| `records` | `GET /search?mode=records` |
| `free_search` | `GET /search?mode=fulltext` |
| `global_search` | `GET /search?mode=fulltext` |
| `text_fragment` | `GET /search?mode=text-fragment` |
| `fragment_from_index_locator` | `GET /av-indexation-fragment` |
| All `thesaurus_*` | `GET /search?mode=records&table=ts_*` |
| `combi` | `POST /batch` |

### Breaking Changes

- **Authentication**: Changed from `code` parameter to `X-API-Key` header
- **Response format**: Standardized JSON structure
- **Endpoint names**: Simplified and consolidated
- **Parameters**: Some renamed (e.g., `q` instead of `query`)

## Troubleshooting

### Database Connection Error

```
Error: connect ECONNREFUSED 127.0.0.1:3306
```

**Solution**: Check MariaDB is running and credentials in `.env` are correct.

### Rate Limit Exceeded

```
429 Too Many Requests
```

**Solution**: Wait 1 minute or increase `RATE_LIMIT_RPM` in `.env`.

### MCP Connection Failed

```
Error: Failed to connect to MCP server
```

**Solution**: Ensure `MCP_ENABLED=true` in `.env` and endpoint is accessible.

## License

GPL-3.0

## Support

- Documentation: `/docs` endpoint
- Issues: https://github.com/your-org/dedalo/issues
- Email: support@dedalo.dev
