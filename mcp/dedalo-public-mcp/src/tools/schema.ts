import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PublicClient, PublicationOptions } from '@dedalo/mcp-common';
import { TokenBucketRateLimiter } from '@dedalo/mcp-common';
import type { Logger } from 'pino';
import { reg, so } from './helpers.js';

export function registerSchemaTools(server: McpServer, client: PublicClient, limiter: TokenBucketRateLimiter | null, logger: Logger): void {
	reg(server,
		'tables_info',
		'List all available publication database tables with their metadata. Returns table names, record counts, and configuration. Use this to discover what data is available for querying.',
		z.object({ full: z.boolean().optional().describe('Include detailed column information') }),
		async (a) => client.call(so(a, 'tables_info')),
		limiter, logger
	),

	reg(server,
		'publication_schema',
		'Get the complete publication schema including table definitions, field mappings, and portal relationships. Returns the full structure used by the publication API. Use this for understanding the data model.',
		z.object({}),
		async () => client.call({ dedalo_get: 'publication_schema' } as PublicationOptions),
		limiter, logger
	),

	reg(server,
		'table_thesaurus',
		'Get the thesaurus table name associated with the publication. Returns which thesaurus table is used for controlled vocabulary. Use this to find the correct table for thesaurus queries.',
		z.object({}),
		async () => client.call({ dedalo_get: 'table_thesaurus' } as PublicationOptions),
		limiter, logger
	),

	reg(server,
		'table_thesaurus_map',
		'Get the mapping between publication tables and their associated thesaurus tables. Returns a dictionary of table-to-thesaurus relationships. Use this to understand which vocabularies apply to which data.',
		z.object({}),
		async () => client.call({ dedalo_get: 'table_thesaurus_map' } as PublicationOptions),
		limiter, logger
	),

	reg(server,
		'combi',
		'Execute a combined multi-query request. Sends multiple queries in a single call and returns all results together. Use this for efficient batch operations.',
		z.object({ queries: z.array(z.any()).describe('Array of query objects to execute') }),
		async (a) => client.call(so(a, 'combi')),
		limiter, logger
	);
}