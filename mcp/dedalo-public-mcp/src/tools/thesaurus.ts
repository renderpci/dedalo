import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PublicClient } from '@dedalo/mcp-common';
import { TokenBucketRateLimiter } from '@dedalo/mcp-common';
import type { Logger } from 'pino';
import { reg, so } from './helpers.js';

const L = z.string().optional().describe('Language code, e.g. lg-eng, lg-spa');
const N = z.number().min(1).max(500).optional().describe('Maximum number of results');
const O = z.number().min(0).optional().describe('Offset for pagination');

export function registerThesaurusTools(server: McpServer, client: PublicClient, limiter: TokenBucketRateLimiter | null, logger: Logger): void {
	reg(server,
		'thesaurus_root_list',
		'List root-level terms from a thesaurus table. Returns top-level terms without children. Use this to start browsing a controlled vocabulary from the top.',
		z.object({ table: z.string().describe('Thesaurus table name'), lang: L, limit: N, offset: O }),
		async (a) => client.call(so(a, 'thesaurus_root_list')),
		limiter, logger
	),

	reg(server,
		'thesaurus_random_term',
		'Get a random term from a thesaurus table. Useful for discovery and exploration. Use this to surface unexpected content.',
		z.object({ table: z.string().describe('Thesaurus table name'), lang: L }),
		async (a) => client.call(so(a, 'thesaurus_random_term')),
		limiter, logger
	),

	reg(server,
		'thesaurus_search',
		'Search the thesaurus for terms matching a query. Supports multiple search operators and can include children, parents, and related terms. Use this for finding controlled vocabulary terms.',
		z.object({
			q: z.string().describe('Search query'),
			q_operator: z.string().optional().describe('Search operator (AND, OR, phrase)'),
			limit: N, offset: O,
			terms: z.boolean().optional().describe('Include full term data'),
			children: z.boolean().optional().describe('Include child terms'),
			parents: z.boolean().optional().describe('Include parent terms'),
		}),
		async (a) => client.call(so(a, 'thesaurus_search')),
		limiter, logger
	),

	reg(server,
		'thesaurus_autocomplete',
		'Autocomplete thesaurus terms based on a partial query. Returns matching terms for type-ahead suggestions. Use this in search interfaces.',
		z.object({
			q: z.string().describe('Partial term text to autocomplete'),
			limit: N,
			table: z.string().optional().describe('Limit search to a specific thesaurus table'),
		}),
		async (a) => client.call(so(a, 'thesaurus_autocomplete')),
		limiter, logger
	),

	reg(server,
		'thesaurus_term',
		'Get detailed data for a single thesaurus term by its term_id. Includes label, definition, and metadata. Optionally include parent and child terms.',
		z.object({
			table: z.string().describe('Thesaurus table name'),
			term_id: z.string().describe('Unique term identifier'),
			lang: L,
			parents: z.boolean().optional().describe('Include parent terms in hierarchy'),
			children: z.boolean().optional().describe('Include child terms in hierarchy'),
		}),
		async (a) => client.call(so(a, 'thesaurus_term')),
		limiter, logger
	),

	reg(server,
		'thesaurus_indexation_node',
		'Get indexation node data for a thesaurus term. Returns records indexed under this term and related terms. Use this to find content classified under a specific vocabulary term.',
		z.object({
			table: z.string().describe('Thesaurus table name'),
			term_id: z.string().describe('Term identifier'),
			lang: L,
		}),
		async (a) => client.call(so(a, 'thesaurus_indexation_node')),
		limiter, logger
	),

	reg(server,
		'thesaurus_video_view_data',
		'Get video view data for a thesaurus term. Returns video fragments and segments associated with this term. Use this for video-based content linked to vocabulary terms.',
		z.object({
			table: z.string().describe('Thesaurus table name'),
			term_id: z.string().describe('Term identifier'),
			lang: L,
		}),
		async (a) => client.call(so(a, 'thesaurus_video_view_data')),
		limiter, logger
	),

	reg(server,
		'thesaurus_children',
		'Get child terms for a specific thesaurus term. Returns the next level of the hierarchy. Use this to navigate down the vocabulary tree.',
		z.object({
			table: z.string().describe('Thesaurus table name'),
			term_id: z.string().describe('Parent term identifier'),
			lang: L, limit: N, offset: O,
		}),
		async (a) => client.call(so(a, 'thesaurus_children')),
		limiter, logger
	),

	reg(server,
		'thesaurus_parents',
		'Get parent terms for a specific thesaurus term. Returns the broader terms in the hierarchy. Use this to navigate up the vocabulary tree.',
		z.object({
			table: z.string().describe('Thesaurus table name'),
			term_id: z.string().describe('Child term identifier'),
			lang: L,
		}),
		async (a) => client.call(so(a, 'thesaurus_parents')),
		limiter, logger
	);
}