import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../_shared/register.js';
import { rqo } from '../_shared/rqo.js';

/**
 * System / diagnostics tools.
 */
export function registerSystemTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_get_system_info',
		description: 'Get system diagnostics: PHP version, upload limits, OCR engine availability, etc.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'System info' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo({ action: 'get_system_info', dd_api: 'dd_utils_api' })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_server_ready_status',
		description: 'Check whether the Dédalo server is ready to accept requests. Returns subsystem readiness.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Server ready status' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo({ action: 'get_server_ready_status', dd_api: 'dd_utils_api' })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_list_user_tools',
		description: 'List user tools available to the current logged user. Output reflects the user profile.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List user tools' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo({ action: 'user_tools', dd_api: 'dd_tools_api' })),
	}, ctx);
}
