import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';
import { TipoSchema } from './_shared/schemas.js';

/**
 * Maintenance area tools (`dd_area_maintenance_api`).
 *
 * Dédalo enforces `permissions >= 2` on the maintenance area before
 * dispatch — only users with maintenance access succeed.
 */
export function registerMaintenanceTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_maintenance_widget_value',
		description: 'Get the current value/state of a maintenance widget without executing anything.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Maintenance widget value' },
		inputSchema: z.object({ widget_name: z.string().min(1).describe('Maintenance widget name.') }),
		handler: async ({ widget_name }) =>
			client.call(rqo('get_widget_value', 'dd_area_maintenance_api', { tipo: widget_name })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_maintenance_widget_run',
		description: 'Execute a maintenance widget action (statistics, cleanup, recalculation, ...).',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Maintenance widget run' },
		inputSchema: z.object({
			widget_name: z.string().min(1),
			options: z.record(z.unknown()).optional(),
		}),
		handler: async ({ widget_name, options }) =>
			client.call(rqo('widget_request', 'dd_area_maintenance_api', { tipo: widget_name }, undefined, options, false)),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_maintenance_class_run',
		description:
			'Execute a maintenance class request (advanced). Class names: `area_thesaurus`, `tool_update_data`, etc. Requires global-admin profile in Dédalo.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Maintenance class run' },
		inputSchema: z.object({
			class_name: z.string().min(1).describe('Maintenance class identifier.'),
			options: z.record(z.unknown()).optional(),
		}),
		handler: async ({ class_name, options }) =>
			client.call(rqo('class_request', 'dd_area_maintenance_api', { tipo: class_name }, undefined, options, false)),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_maintenance_modify_counter',
		description: 'Modify a section counter (auto-increment for new section_ids). Use with care.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Modify counter' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			counter: z.number().int().min(0).describe('New counter value.'),
			counter_action: z.enum(['reset', 'fix']).default('fix'),
		}),
		handler: async ({ section_tipo, counter, counter_action }) =>
			client.call(
				rqo(
					'modify_counter',
					'dd_area_maintenance_api',
					{ tipo: section_tipo, section_tipo },
					undefined,
					{ section_tipo, counter, counter_action },
					false
				)
			),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_maintenance_list_schema_changes',
		description: 'List pending simple schema-change files awaiting application.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List schema changes' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo('get_simple_schema_changes_files', 'dd_area_maintenance_api')),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_maintenance_apply_schema_changes',
		description: 'Apply pending simple schema-change files. Highly destructive — review with `dedalo_maintenance_list_schema_changes` first.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Apply schema changes' },
		inputSchema: z.object({ options: z.record(z.unknown()).optional() }),
		handler: async ({ options }) =>
			client.call(rqo('parse_simple_schema_changes_files', 'dd_area_maintenance_api', undefined, undefined, options, false)),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_maintenance_lock_components_actions',
		description: 'Lock or unlock component actions globally during maintenance windows.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Lock component actions' },
		inputSchema: z.object({ options: z.record(z.unknown()).describe('{ action: lock|unlock, ... }') }),
		handler: async ({ options }) =>
			client.call(rqo('lock_components_actions', 'dd_area_maintenance_api', undefined, undefined, options, false)),
	}, ctx);
}
