import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type TokenBucketRateLimiter, type WorkClient } from '@dedalo/mcp-common';
import type { Logger } from 'pino';
import { registerAllTools } from './tools/index.js';

export interface WorkServerConfig {
	client: WorkClient;
	logger: Logger;
	limiter?: TokenBucketRateLimiter | null;
}

/**
 * Create the dedalo-work-mcp server with every tool registered.
 *
 * Authorisation is delegated to Dédalo: the WorkClient logs in as the
 * configured user, and per-tool permissions follow that user's profile.
 */
export function createWorkServer(config: WorkServerConfig): McpServer {
	const { client, logger, limiter } = config;

	const server = new McpServer(
		{ name: 'dedalo-work-mcp', version: '1.0.0' },
		{ capabilities: { tools: {} } }
	);

	registerAllTools(server, client, { logger, limiter: limiter ?? null });

	return server;
}
