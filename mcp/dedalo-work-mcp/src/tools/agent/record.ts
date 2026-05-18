import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../_shared/register.js';
import { rqo } from '../_shared/rqo.js';
import { AgentSectionSchema, OptionalLangSchema, SectionIdSchema } from '../_shared/schemas.js';

/**
 * Agent-tier record reading.
 *
 * Returns one record as a flat { label: value } map with portals expanded
 * one hop to { ref, label, section_tipo, section_id } objects.
 */
export function registerRecordAgentTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_get_record',
		description:
			'Read a single record in agent-view format: flat { label: value } with human labels, ' +
			'portal fields expanded to { ref, label, section_tipo, section_id }. ' +
			'No tipos appear in the body unless `include_tipos=true`. ' +
			'`section_tipo` accepts a section name (e.g. "Cecas") or tipo (e.g. "oh1").',
		annotations: {
			tier: 'agent',
			readOnlyHint: true,
			idempotentHint: true,
			openWorldHint: true,
			title: 'Get record (agent view)',
		},
		inputSchema: z.object({
			section_tipo: AgentSectionSchema,
			section_id: SectionIdSchema,
			lang: OptionalLangSchema,
			include_tipos: z.boolean().default(false).describe('If true, expose raw tipo identifiers in `_meta` for power users.'),
		}),
		handler: async ({ section_tipo, section_id, lang, include_tipos }) =>
			client.call(
				rqo({
					action: 'read_record_view',
					dd_api: 'dd_agent_api',
					source: { section_tipo, section_id, lang, include_tipos },
				})
			),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_set_field',
		description:
			'Update one field on a record using its human label. ' +
			'The server resolves the label to the correct tipo internally; case and accents are ignored (e.g. "título", "Título", "titulo" all match). ' +
			'Returns the updated record in agent-view shape.\n\n' +
			'You do NOT need to call describe_section first — call set_field directly with the field label. ' +
			'`section_tipo` accepts a section name (e.g. "Cecas") or tipo (e.g. "oh1"). ' +
			'For portal/link fields, pass an array of { section_tipo, section_id } objects.',
		annotations: {
			tier: 'agent',
			readOnlyHint: false,
			destructiveHint: false,
			idempotentHint: true,
			openWorldHint: true,
			title: 'Set field by label (agent view)',
		},
		inputSchema: z.object({
			section_tipo: AgentSectionSchema,
			section_id: SectionIdSchema,
			field: z.string().describe('Human label of the field to update (e.g. "Title").'),
			value: z.any().describe('New value. For text fields: string. For portals: array of { section_tipo, section_id } objects.'),
			lang: OptionalLangSchema,
		}),
		handler: async ({ section_tipo, section_id, field, value, lang }) =>
			client.call(
				rqo({
					action: 'set_field_by_label',
					dd_api: 'dd_agent_api',
					source: { section_tipo, section_id, field, value, lang },
					prevent_lock: false,
				})
			),
	}, ctx);
}
