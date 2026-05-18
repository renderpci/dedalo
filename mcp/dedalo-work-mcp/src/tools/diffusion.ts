import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';
import { TipoSchema } from './_shared/schemas.js';

/**
 * Diffusion (publication-export) tools.
 */
export function registerDiffusionTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_diffusion_info',
		description: 'Get diffusion targets, export rules, and current status.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Diffusion info' },
		inputSchema: z.object({ tipo: TipoSchema.optional() }),
		handler: async ({ tipo }) => client.call(rqo({ action: 'get_diffusion_info', dd_api: 'dd_diffusion_api', source: { tipo } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_diffusion_ontology_map',
		description: 'Return the mapping between Dédalo ontology properties and publication database fields.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Diffusion ontology map' },
		inputSchema: z.object({ section_tipo: TipoSchema.optional() }),
		handler: async ({ section_tipo }) =>
			client.call(rqo({ action: 'get_ontology_map', dd_api: 'dd_diffusion_api', source: { tipo: section_tipo } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_diffusion_run',
		description:
			'Execute the diffusion process for a section_tipo: publishes data from the work DB to the publication layer.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Diffusion run' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			options: z.record(z.string(), z.unknown()).optional().describe('Additional diffusion options (target db, scope, ...)'),
		}),
		handler: async ({ section_tipo, options }) =>
			client.call(rqo({ action: 'diffuse', dd_api: 'dd_diffusion_api', source: { tipo: section_tipo, section_tipo }, options, prevent_lock: false })),
	}, ctx);
}
