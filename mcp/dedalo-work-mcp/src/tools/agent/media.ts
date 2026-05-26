import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../_shared/register.js';
import { rqo } from '../_shared/rqo.js';
import { AgentSectionSchema, OptionalLangSchema, SectionIdSchema } from '../_shared/schemas.js';

/**
 * Agent-tier media URL resolver.
 *
 * Returns the public URL of a media component (image / av / pdf / 3d) for a
 * given record without forcing a full record-view payload. Designed for
 * batch pipelines such as the assistant's bulk image analysis.
 */
export function registerMediaAgentTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_get_media_url',
		description:
			'Resolve the public URL of a media component (image, av, pdf, 3d) on a record. ' +
			'Use this in batch pipelines instead of dedalo_get_record when you only need the file URL ' +
			'(e.g. to send an image to a vision model). ' +
			'`component_tipo` accepts a tipo (e.g. "numisdata18") or a human label (e.g. "Stamp").',
		annotations: {
			tier: 'agent',
			readOnlyHint: true,
			idempotentHint: true,
			openWorldHint: true,
			title: 'Get media URL (agent view)',
		},
		inputSchema: z.object({
			section_tipo: AgentSectionSchema,
			section_id: SectionIdSchema,
			component_tipo: z.string().describe('Tipo or human label of the media component.'),
			quality: z.string().optional().describe('Quality key (e.g. "1.5MB", "original", "thumb"). Defaults to component default.'),
			absolute: z.boolean().default(true).describe('Return an absolute URL with host. Defaults to true.'),
			lang: OptionalLangSchema,
		}),
		handler: async ({ section_tipo, section_id, component_tipo, quality, absolute, lang }) =>
			client.call(
				rqo({
					action: 'get_media_url',
					dd_api: 'dd_agent_api',
					source: { section_tipo, section_id, component_tipo, quality, absolute, lang },
				})
			),
	}, ctx);
}
