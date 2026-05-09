import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';
import { LangSchema } from './_shared/schemas.js';

/**
 * Administrative tools that change global Dédalo state.
 *
 * `login` and `quit` are intentionally NOT exposed: the MCP's session
 * user is fixed at startup; allowing the agent to switch users would
 * defeat the profile-based authorisation model.
 */
export function registerAdminTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_admin_install',
		description:
			'Run the Dédalo installation process. Creates database tables, ontology structures, and default configuration. Requires a Dédalo user with install privileges.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Install' },
		inputSchema: z.object({ options: z.record(z.string(), z.unknown()).optional() }),
		handler: async ({ options }) =>
			client.call(rqo({ action: 'install', dd_api: 'dd_utils_api', options, prevent_lock: false })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_admin_change_lang',
		description:
			'Switch the UI language for the current Dédalo session. Affects subsequent calls that respect `lang`.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true, title: 'Change language' },
		inputSchema: z.object({ lang: LangSchema }),
		handler: async ({ lang }) =>
			client.call(rqo({ action: 'change_lang', dd_api: 'dd_utils_api', source: { lang }, prevent_lock: false })),
	}, ctx);
}
