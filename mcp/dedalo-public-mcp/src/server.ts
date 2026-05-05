import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PublicClient } from '@dedalo/mcp-common';
import { TokenBucketRateLimiter } from '@dedalo/mcp-common';
import { registerTools } from './tools/index.js';
import type { Logger } from 'pino';

export interface PublicServerConfig {
  client: PublicClient;
  logger: Logger;
  rateLimit?: {
    capacity: number;
    refillRateMs: number;
  };
}

export function createPublicServer(config: PublicServerConfig): McpServer {
  const { client, logger, rateLimit } = config;

  const limiter = rateLimit
    ? new TokenBucketRateLimiter({ capacity: rateLimit.capacity, refillRateMs: rateLimit.refillRateMs })
    : null;

  const server = new McpServer(
    { name: 'dedalo-public-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  registerTools(server, client, logger, limiter);

  return server;
}