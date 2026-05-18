import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../_shared/register.js';
import { rqo } from '../_shared/rqo.js';
import { AgentSectionSchema, OptionalLangSchema } from '../_shared/schemas.js';

/**
 * Agent-tier section introspection.
 *
 * These tools return the "agent view" — human-label schemas with simplified
 * types — so small LLMs do not need to learn tipos, RQO, or portal mechanics.
 */
export function registerSectionAgentTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_describe_section',
		description:
			'Get a human-friendly schema for a Dédalo section. ' +
			'Returns field labels (not tipos), simplified types (text|html|date|number|link|media), ' +
			'and portal target sections. Use this as the FIRST step before reading or writing any record.\n\n' +
			'When `include_tipos=true`, the response includes `_meta.field_tipos` with label→tipo ' +
			'mapping for round-trip writes.\n\n' +
			'`section_tipo` accepts a section name (e.g. "Cecas", "Oral History") or tipo (e.g. "oh1").',
		annotations: {
			tier: 'agent',
			readOnlyHint: true,
			idempotentHint: true,
			openWorldHint: true,
			title: 'Describe section (agent view)',
		},
		inputSchema: z.object({
			section_tipo: AgentSectionSchema,
			lang: OptionalLangSchema,
			include_tipos: z.boolean().default(false).describe('If true, expose raw tipo identifiers in `_meta` for power users.'),
		}),
		handler: async ({ section_tipo, lang, include_tipos }) =>
			client.call(
				rqo({
					action: 'describe_section',
					dd_api: 'dd_agent_api',
					source: { section_tipo, lang, include_tipos },
				})
			),
	}, ctx);
}
