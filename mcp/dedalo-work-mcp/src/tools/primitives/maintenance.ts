import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../_shared/register.js';
import { rqo } from '../_shared/rqo.js';
import { TipoSchema } from '../_shared/schemas.js';

/**
 * Maintenance area tools (`dd_area_maintenance_api`).
 *
 * Dédalo enforces `permissions >= 2` on the maintenance area before
 * dispatch — only users with maintenance access succeed.
 */
export function registerMaintenanceTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_maintenance_widget_run',
		description: 'Execute a maintenance widget action (statistics, cleanup, recalculation, ...).',
		annotations: { tier: 'primitive', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Maintenance widget run' },
		inputSchema: z.object({
			widget_name: z.string().min(1),
			options: z.record(z.string(), z.unknown()).optional(),
		}),
		handler: async ({ widget_name, options }) =>
			client.call(rqo({ action: 'widget_request', dd_api: 'dd_area_maintenance_api', source: { tipo: widget_name }, options, prevent_lock: false })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_maintenance_class_run',
		description:
			'Execute a maintenance class request (advanced). Class names: `area_thesaurus`, `tool_update_data`, etc. Requires global-admin profile in Dédalo.',
		annotations: { tier: 'primitive', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Maintenance class run' },
		inputSchema: z.object({
			class_name: z.string().min(1).describe('Maintenance class identifier.'),
			options: z.record(z.string(), z.unknown()).optional(),
		}),
		handler: async ({ class_name, options }) =>
			client.call(rqo({ action: 'class_request', dd_api: 'dd_area_maintenance_api', source: { tipo: class_name }, options, prevent_lock: false })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_maintenance_modify_counter',
		description: 'Modify a section counter (auto-increment for new section_ids). Use with care.',
		annotations: { tier: 'primitive', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Modify counter' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			counter: z.number().int().min(0).describe('New counter value.'),
			counter_action: z.enum(['reset', 'fix']).default('fix'),
		}),
		handler: async ({ section_tipo, counter, counter_action }) =>
			client.call(
				rqo({
					action: 'modify_counter',
					dd_api: 'dd_area_maintenance_api',
					source: { tipo: section_tipo, section_tipo },
					options: { section_tipo, counter, counter_action },
					prevent_lock: false,
				})
			),
	}, ctx);

}
