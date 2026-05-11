import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PublicClient } from '@dedalo/mcp-common';
import { TokenBucketRateLimiter } from '@dedalo/mcp-common';
import type { Logger } from 'pino';
import { registerRecordsTools } from './records.js';
import { registerSearchTools } from './search.js';
import { registerThesaurusTools } from './thesaurus.js';
import { registerSchemaTools } from './schema.js';
import { registerMediaTools } from './media.js';

export function registerTools(server: McpServer, client: PublicClient, logger: Logger, limiter: TokenBucketRateLimiter | null): void {
	registerRecordsTools(server, client, limiter, logger);
	registerSearchTools(server, client, limiter, logger);
	registerThesaurusTools(server, client, limiter, logger);
	registerSchemaTools(server, client, limiter, logger);
	registerMediaTools(server, client, limiter, logger);
}