import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';
import { TipoSchema, OptionalLangSchema, SectionIdSchema } from './_shared/schemas.js';

/**
 * Record write tools. Always registered; Dédalo's user profile decides
 * whether each call succeeds or returns `permissions_denied`.
 *
 * `prevent_lock: false` is set on writes that touch component data so
 * Dédalo's locking machinery can serialise concurrent edits.
 */
export function registerRecordsWriteTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_create_record',
		description:
			'Create a new record in the given `section_tipo`. Returns the new section_id.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, title: 'Create record' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			lang: OptionalLangSchema,
		}),
		handler: async ({ section_tipo, lang }) =>
			client.call(rqo({ action: 'create', source: { tipo: section_tipo, section_tipo, lang }, prevent_lock: false })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_duplicate_record',
		description:
			'Create a copy of an existing record including all component values. Returns the new section_id.',
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, title: 'Duplicate record' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			section_id: SectionIdSchema,
			lang: OptionalLangSchema,
		}),
		handler: async ({ section_tipo, section_id, lang }) =>
			client.call(rqo({ action: 'duplicate', source: { tipo: section_tipo, section_tipo, section_id, lang }, prevent_lock: false })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_save_component',
		description:
			'Save a value to a specific component within a record. The `value` shape depends on the component type (text, locator, dato, ...). Inspect with `dedalo_get_element_context` first when in doubt.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, title: 'Save component' },
		inputSchema: z.object({
			tipo: TipoSchema.describe('Component tipo to save.'),
			section_tipo: TipoSchema,
			section_id: SectionIdSchema,
			lang: OptionalLangSchema,
			value: z.unknown().describe('Value to write. Format depends on the component model.'),
		}),
		handler: async ({ tipo, section_tipo, section_id, lang, value }) =>
			client.call(rqo({ action: 'save', source: { tipo, section_tipo, section_id, lang }, options: { value }, prevent_lock: false })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_delete_record',
		description:
			'Permanently delete a record. This action cannot be undone. The Dédalo user profile must allow delete on the target section.',
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Delete record' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			section_id: SectionIdSchema,
			lang: OptionalLangSchema,
		}),
		handler: async ({ section_tipo, section_id, lang }) =>
			client.call(rqo({ action: 'delete', source: { tipo: section_tipo, section_tipo, section_id, lang }, prevent_lock: false })),
	}, ctx);
}
