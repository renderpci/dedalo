import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PublicClient } from '@dedalo/mcp-common';
import { TokenBucketRateLimiter } from '@dedalo/mcp-common';
import type { Logger } from 'pino';
import { reg, so } from './helpers.js';

const L = z.string().optional().describe('Language code, e.g. lg-eng, lg-spa');
const N = z.number().min(1).max(500).optional().describe('Maximum number of results');
const O = z.number().min(0).optional().describe('Offset for pagination');

export function registerSearchTools(server: McpServer, client: PublicClient, limiter: TokenBucketRateLimiter | null, logger: Logger): void {
	reg(server,
		'free_search',
		'Perform free-text search on a specific publication table. Returns matching records with relevance ranking. Use this for targeted searches within a known table.',
		z.object({
			q: z.string().describe('Search query text'),
			table: z.string().optional().describe('Target table; searches all tables if omitted'),
			lang: L,
			limit: N,
			offset: O,
		}),
		async (a) => client.call(so(a, 'free_search')),
		limiter, logger
	),

	reg(server,
		'global_search',
		'Perform a global full-text search across all publication tables. Returns a summary of matches per table. Use this for broad discovery when you do not know which table contains the data.',
		z.object({
			q: z.string().describe('Search query text'),
			lang: L,
			limit: N,
			offset: O,
		}),
		async (a) => client.call(so(a, 'global_search')),
		limiter, logger
	),

	reg(server,
		'global_search_json',
		'Perform a global full-text search returning structured JSON results. Includes detailed record data for each match, not just summaries. Use this when you need full record details from a cross-table search.',
		z.object({
			q: z.string().describe('Search query text'),
			lang: L,
			limit: N,
			offset: O,
		}),
		async (a) => client.call(so(a, 'global_search_json')),
		limiter, logger
	),

	reg(server,
		'search_tipos',
		'Search for section tipos by model type or pattern matching. Returns matching tipo definitions. Use this to discover available data structures in the publication schema.',
		z.object({
			model: z.string().optional().describe('Filter by model type'),
			tipo: z.string().optional().describe('Pattern to match in tipo names'),
			table: z.string().optional().describe('Filter by publication table'),
		}),
		async (a) => client.call(so(a, 'search_tipos')),
		limiter, logger
	);
}