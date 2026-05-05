import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import pino from 'pino';
import { PublicClient, validatePublicAuthConfig } from '@dedalo/mcp-common';
import { createPublicServer } from './server.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

const PUBLIC_API_BASE_URL = process.env.DEDALO_PUBLIC_API_URL ?? 'http://localhost';
const PUBLIC_API_CODE = process.env.DEDALO_PUBLIC_API_CODE ?? '';

if (!PUBLIC_API_CODE) {
  logger.error('DEDALO_PUBLIC_API_CODE is required');
  process.exit(1);
}

validatePublicAuthConfig({ code: PUBLIC_API_CODE });

const RATE_LIMIT_CAPACITY = parseInt(process.env.RATE_LIMIT_CAPACITY ?? '0', 10);
const RATE_LIMIT_REFILL_MS = parseInt(process.env.RATE_LIMIT_REFILL_MS ?? '60000', 10);

const client = new PublicClient({
  baseUrl: PUBLIC_API_BASE_URL,
  code: PUBLIC_API_CODE,
});

const server = createPublicServer({
  client,
  logger,
  rateLimit: RATE_LIMIT_CAPACITY > 0
    ? { capacity: RATE_LIMIT_CAPACITY, refillRateMs: RATE_LIMIT_REFILL_MS }
    : undefined,
});

async function main() {
  const useHttp = process.argv.includes('--http');
  const portArg = process.argv.findIndex((a) => a === '--port');
  const port = portArg !== -1 && process.argv[portArg + 1] ? parseInt(process.argv[portArg + 1], 10) : 3002;

  if (useHttp) {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await server.connect(transport);

    Bun.serve({
      port,
      fetch: async (req) => {
        if (req.method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        }
        return transport.handleRequest(req);
      },
      websocket: { open: () => {}, close: () => {}, message: () => {} },
    });
    logger.info('dedalo-public-mcp started on HTTP port %d', port);
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info('dedalo-public-mcp started on stdio');
  }
}

// Graceful shutdown
function shutdown() {
  logger.info('Shutting down dedalo-public-mcp...');
  server.close().then(() => {
    logger.info('Server closed');
    process.exit(0);
  }).catch((err) => {
    logger.error(err, 'Error during shutdown');
    process.exit(1);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  logger.error(err, 'Fatal error');
  process.exit(1);
});