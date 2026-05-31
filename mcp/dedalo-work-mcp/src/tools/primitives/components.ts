import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../_shared/register.js';
import { rqo } from '../_shared/rqo.js';
import { TipoSchema, OptionalLangSchema, SectionIdSchema, LocatorSchema } from '../_shared/schemas.js';

/**
 * Per-component-type operations (portal, text_area, av, 3d).
 *
 * All actions are profile-gated by Dédalo. Annotations advertise
 * destructiveness so MCP clients can surface confirmation prompts.
 */
export function registerComponentTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	const baseRecord = {
		tipo: TipoSchema.describe('Component tipo to operate on. Resolve via `dedalo_get_section_map`.'),
		section_tipo: TipoSchema,
		section_id: SectionIdSchema,
		lang: OptionalLangSchema,
	} as const;

	// ── Portal ───────────────────────────────────────────────────────────
	registerTool(server, {
		name: 'dedalo_portal_delete_locator',
		description: 'Remove a locator from a portal component, detaching the linked record.\n' +
			'Use `dedalo_get_section_map` to identify portal components (link-type fields) and their target sections.',
		annotations: { tier: 'primitive', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Portal: delete locator' },
		inputSchema: z.object({ ...baseRecord, locator: LocatorSchema }),
		handler: async ({ tipo, section_tipo, section_id, lang, locator }) =>
			client.call(rqo({ action: 'delete_locator', dd_api: 'dd_component_portal_api', source: { tipo, section_tipo, section_id, lang }, options: { locator }, prevent_lock: false })),
	}, ctx);

}
