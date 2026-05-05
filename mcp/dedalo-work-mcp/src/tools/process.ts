import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';

/**
 * Async background-process tools.
 */
export function registerProcessTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_get_process_status',
		description: 'Get the status of an asynchronous background process by `process_id`. Returns progress, state and messages.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get process status' },
		inputSchema: z.object({ process_id: z.string().min(1) }),
		handler: async ({ process_id }) => client.call(rqo('get_process_status', 'dd_utils_api', { process_id })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_process_status_poll',
		description: 'Long-poll variant of get_process_status. Blocks until status changes or the server-side timeout fires.',
		annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true, title: 'Poll process status' },
		inputSchema: z.object({ process_id: z.string().min(1) }),
		handler: async ({ process_id }) => client.call(rqo('get_process_status_poll', 'dd_utils_api', { process_id })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_stop_process',
		description: 'Cancel a running asynchronous process by `process_id`.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Stop process' },
		inputSchema: z.object({ process_id: z.string().min(1) }),
		handler: async ({ process_id }) => client.call(rqo('stop_process', 'dd_utils_api', { process_id }, undefined, undefined, false)),
	}, ctx);
}
