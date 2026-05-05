import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PublicClient } from '@dedalo/mcp-common';
import { TokenBucketRateLimiter } from '@dedalo/mcp-common';
import type { Logger } from 'pino';
import { reg, so } from './helpers.js';

const L = z.string().optional().describe('Language code, e.g. lg-eng, lg-spa');

export function registerMediaTools(server: McpServer, client: PublicClient, limiter: TokenBucketRateLimiter | null, logger: Logger): void {
	reg(server,
		'full_reel',
		'Get complete reel data including all fragments, metadata, and associated content. Returns the full reel structure with nested fragments. Use this to access complete video/audio reels.',
		z.object({
			table: z.string().describe('Reel table name'),
			id: z.union([z.string(), z.number()]).describe('Reel record identifier'),
			lang: L,
		}),
		async (a) => client.call(so(a, 'full_reel')),
		limiter, logger
	),

	reg(server,
		'full_interview',
		'Get complete interview data including all segments, transcripts, and metadata. Returns the full interview structure. Use this to access complete oral history interviews.',
		z.object({
			table: z.string().describe('Interview table name'),
			id: z.union([z.string(), z.number()]).describe('Interview record identifier'),
			lang: L,
		}),
		async (a) => client.call(so(a, 'full_interview')),
		limiter, logger
	),

	reg(server,
		'reel_terms',
		'Get thesaurus terms associated with a specific reel. Returns the vocabulary terms linked to the reel content. Use this to understand how a reel is classified.',
		z.object({
			table: z.string().describe('Reel table name'),
			id: z.union([z.string(), z.number()]).describe('Reel record identifier'),
			lang: L,
		}),
		async (a) => client.call(so(a, 'reel_terms')),
		limiter, logger
	),

	reg(server,
		'reel_fragments_of_type',
		'Get reel fragments filtered by fragment type. Returns only fragments matching the specified type (e.g., interview segment, b-roll). Use this to extract specific content types from a reel.',
		z.object({
			table: z.string().describe('Reel table name'),
			id: z.union([z.string(), z.number()]).describe('Reel record identifier'),
			type: z.string().describe('Fragment type to filter by'),
			lang: L,
		}),
		async (a) => client.call(so(a, 'reel_fragments_of_type')),
		limiter, logger
	),

	reg(server,
		'image_data',
		'Get image metadata and access URLs for a specific image record. Returns dimensions, format, and CDN URLs at various resolutions. Use this to display images in applications.',
		z.object({
			table: z.string().describe('Image table name'),
			id: z.union([z.string(), z.number()]).describe('Image record identifier'),
			lang: L,
			media: z.string().optional().describe('Specific media variant to retrieve'),
		}),
		async (a) => client.call(so(a, 'image_data')),
		limiter, logger
	),

	reg(server,
		'fragment_from_index_locator',
		'Get a specific fragment by its index locator. Returns the fragment data referenced by an index entry. Use this to retrieve fragments pointed to by thesaurus indexation.',
		z.object({
			table: z.string().describe('Fragment table name'),
			section_tipo: z.string().describe('Section tipo of the indexed record'),
			section_id: z.union([z.string(), z.number()]).describe('Record identifier'),
			lang: L,
		}),
		async (a) => client.call(so(a, 'fragment_from_index_locator')),
		limiter, logger
	),

	reg(server,
		'menu_tree_plain',
		'Get a flat representation of the publication menu tree. Returns all menu items with their hierarchy flattened. Use this to understand the site navigation structure.',
		z.object({
			table: z.string().describe('Menu table name'),
			lang: L,
		}),
		async (a) => client.call(so(a, 'menu_tree_plain')),
		limiter, logger
	);
}