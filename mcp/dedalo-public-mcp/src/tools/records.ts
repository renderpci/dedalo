import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PublicClient } from '@dedalo/mcp-common';
import { TokenBucketRateLimiter } from '@dedalo/mcp-common';
import type { Logger } from 'pino';
import { reg, so } from './helpers.js';

const L = z.string().optional().describe('Language code, e.g. lg-eng, lg-spa');
const N = z.number().min(1).max(500).optional().describe('Maximum number of records to return');
const O = z.number().min(0).optional().describe('Number of records to skip for pagination');

export function registerRecordsTools(server: McpServer, client: PublicClient, limiter: TokenBucketRateLimiter | null, logger: Logger): void {
	reg(server,
		'records',
		'Fetch published records from a specific table. Supports pagination, SQL filters, field selection, and ordering. Use this as the primary tool for querying published content.',
		z.object({
			table: z.string().describe('Publication table name to query'),
			lang: L,
			limit: N,
			offset: O,
			order: z.string().optional().describe('SQL ORDER BY clause'),
			fields: z.array(z.string()).optional().describe('Specific fields to return, defaults to all'),
			sql_filter: z.string().optional().describe('SQL WHERE clause for filtering'),
		}),
		async (a) => client.call(so(a, 'records')),
		limiter, logger
	),

	reg(server,
		'bibliography_rows',
		'Fetch bibliography records with author-based sorting. Returns formatted bibliography entries suitable for citation display. Use this for academic reference lists.',
		z.object({
			table: z.string().describe('Bibliography table name'),
			lang: L,
			limit: N,
			offset: O,
		}),
		async (a) => client.call(so(a, 'bibliography_rows')),
		limiter, logger
	);
}