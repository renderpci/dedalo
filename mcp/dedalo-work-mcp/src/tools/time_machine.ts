import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';
import { TipoSchema, OptionalLangSchema, SectionIdSchema } from './_shared/schemas.js';

/**
 * Time Machine (versioning) read-only tools.
 */
export function registerTimeMachineTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_tm_get_node_data',
		description: 'Get node data for a Time Machine entry. Returns the historical version data for a specific node.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Time machine: node data' },
		inputSchema: z.object({
			tipo: TipoSchema,
			section_id: SectionIdSchema.describe('Time Machine node identifier.'),
			lang: OptionalLangSchema,
		}),
		handler: async ({ tipo, section_id, lang }) =>
			client.call(rqo('get_node_data', 'dd_ts_api', { tipo, section_tipo: tipo, section_id, lang })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_tm_get_children_data',
		description: 'Get children data for a Time Machine entry: all child nodes in the version tree.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Time machine: children data' },
		inputSchema: z.object({
			tipo: TipoSchema,
			section_id: SectionIdSchema.describe('Parent Time Machine node identifier.'),
			lang: OptionalLangSchema,
		}),
		handler: async ({ tipo, section_id, lang }) =>
			client.call(rqo('get_children_data', 'dd_ts_api', { tipo, section_tipo: tipo, section_id, lang })),
	}, ctx);
}
