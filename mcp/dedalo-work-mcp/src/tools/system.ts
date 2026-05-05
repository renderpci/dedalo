import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';
import { TipoSchema } from './_shared/schemas.js';

/**
 * System / diagnostics tools.
 */
export function registerSystemTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_get_system_info',
		description: 'Get system diagnostics: PHP version, upload limits, OCR engine availability, etc.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'System info' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo('get_system_info', 'dd_utils_api')),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_server_ready_status',
		description: 'Check whether the Dédalo server is ready to accept requests. Returns subsystem readiness.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Server ready status' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo('get_server_ready_status', 'dd_utils_api')),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_ontology_update_info',
		description: 'Information about available ontology updates: versions, changelog, status.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Ontology update info' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo('get_ontology_update_info', 'dd_utils_api')),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_code_update_info',
		description: 'Information about available code updates: versions, changelog, status.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Code update info' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo('get_code_update_info', 'dd_utils_api')),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_convert_sqo_to_sql',
		description:
			'Convert a SQO filter into raw SQL for debugging. Returns the generated query without executing it. Requires global-admin profile in Dédalo.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Convert SQO to SQL' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			sqo: z.record(z.unknown()).describe('Raw SQO object to translate.'),
		}),
		handler: async ({ section_tipo, sqo }) =>
			client.call(rqo('convert_search_object_to_sql_query', 'dd_utils_api', { tipo: section_tipo, section_tipo }, undefined, sqo)),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_update_lock_state',
		description:
			'Update the lock state of components during editing. Use to release stale locks or to lock components during maintenance.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: 'Update lock state' },
		inputSchema: z.object({
			options: z.record(z.unknown()).describe('Lock options including action lock|unlock and the target component locator.'),
		}),
		handler: async ({ options }) =>
			client.call(rqo('update_lock_components_state', 'dd_utils_api', undefined, undefined, options, false)),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_login_context',
		description: 'Get the login page context: configured authentication methods and labels. Pre-auth call.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get login context' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo('get_login_context', 'dd_utils_api')),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_install_context',
		description: 'Get the installation page context: DB status, system requirements. Pre-auth call.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get install context' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo('get_install_context', 'dd_utils_api')),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_list_user_tools',
		description: 'List user tools available to the current logged user. Output reflects the user profile.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List user tools' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo('user_tools', 'dd_tools_api')),
	}, ctx);
}
