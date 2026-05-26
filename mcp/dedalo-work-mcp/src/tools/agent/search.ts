import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../_shared/register.js';
import { rqo } from '../_shared/rqo.js';
import { AgentSectionSchema, OptionalLangSchema } from '../_shared/schemas.js';

/**
 * Agent-tier search.
 *
 * Searches records using human-label filters and returns results in agent-view
 * shape. The server resolves labels to tipos automatically.
 */
export function registerSearchAgentTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_search_records_view',
		description:
			'Search records in a section and return them as agent-view shapes. ' +
			'Use human field labels in filters (e.g. "Title contains Picasso"); ' +
			'the server resolves labels to tipos automatically. ' +
			'Portal fields are expanded one hop deep.\n\n' +
			'`section_tipo` accepts a section name (e.g. "Cecas") or tipo (e.g. "oh1").',
		annotations: {
			tier: 'agent',
			readOnlyHint: true,
			idempotentHint: true,
			openWorldHint: true,
			title: 'Search records (agent view)',
		},
		inputSchema: z.object({
			section_tipo: AgentSectionSchema,
			lang: OptionalLangSchema,
			limit: z.number().int().min(1).max(100).default(10).describe('Max records to return.'),
			offset: z.number().int().min(0).default(0).describe('Records to skip.'),
			full_count: z.boolean().default(false).describe('If true, request total matching count (may be slower).'),
			include_tipos: z.boolean().default(false).describe('If true, expose raw tipo identifiers in `_meta`.'),
			filter: z.object({
				operator: z.enum(['AND', 'OR']).default('AND'),
				rules: z.array(z.object({
					field: z.string().describe('Human label of the field to filter on (e.g. "Title").'),
					operator: z.enum(['contains', 'eq', 'starts_with', 'ends_with', 'gt', 'gte', 'lt', 'lte']).default('contains'),
					value: z.string().describe('Value to match.'),
				})).min(1),
			}).optional().describe('Label-based filter rules. Omit to list all records.'),
		}),
		handler: async ({ section_tipo, lang, limit, offset, full_count, include_tipos, filter }) =>
			client.call(
				rqo({
					action: 'search_records_view',
					dd_api: 'dd_agent_api',
					source: { section_tipo, lang, limit, offset, full_count, include_tipos, filter },
				})
			),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_count_records_view',
		description:
			'Count records in a section. Returns the total number of matching records. ' +
			'Supports the same human-label filters as search_records_view. ' +
			'Use this when the user asks "how many records" or wants a count — ' +
			'prefer this over search_records_view for count-only questions (cheaper, no payload).\n\n' +
			'`section_tipo` accepts a section name (e.g. "Cecas") or tipo (e.g. "oh1").',
		annotations: {
			tier: 'agent',
			readOnlyHint: true,
			idempotentHint: true,
			openWorldHint: true,
			title: 'Count records',
		},
		inputSchema: z.object({
			section_tipo: AgentSectionSchema,
			lang: OptionalLangSchema,
			filter: z.object({
				operator: z.enum(['AND', 'OR']).default('AND'),
				rules: z.array(z.object({
					field: z.string().describe('Human label of the field to filter on (e.g. "Title").'),
					operator: z.enum(['contains', 'eq', 'starts_with', 'ends_with', 'gt', 'gte', 'lt', 'lte']).default('contains'),
					value: z.string().describe('Value to match.'),
				})).min(1),
			}).optional().describe('Label-based filter rules. Omit to count all records.'),
		}),
		handler: async ({ section_tipo, lang, filter }) =>
			client.call(
				rqo({
					action: 'count_records',
					dd_api: 'dd_agent_api',
					source: { section_tipo, lang, filter },
				})
			),
	}, ctx);
}
