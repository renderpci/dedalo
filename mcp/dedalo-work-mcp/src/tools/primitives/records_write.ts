import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../_shared/register.js';
import { rqo } from '../_shared/rqo.js';
import { TipoSchema, OptionalLangSchema, SectionIdSchema } from '../_shared/schemas.js';

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
			'Create a new record in the given `section_tipo`. Returns the new section_id.\n' +
			'**Resolve `section_tipo` first** via `dedalo_ontology_glossary` (e.g. "Mint"→numisdata6) or `dedalo_resolve_ontology`.',
		annotations: { tier: 'primitive', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, title: 'Create record' },
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
			'Create a copy of an existing record including all component values. Returns the new section_id.\n' +
			'**Resolve `section_tipo` first** via `dedalo_ontology_glossary` or `dedalo_resolve_ontology`.',
		annotations: { tier: 'primitive', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, title: 'Duplicate record' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			section_id: SectionIdSchema,
			lang: OptionalLangSchema,
		}),
		handler: async ({ section_tipo, section_id, lang }) =>
			client.call(rqo({ action: 'duplicate', source: { tipo: section_tipo, section_tipo, section_id, lang }, prevent_lock: false })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_delete_record',
		description:
			'Permanently delete a record. This action cannot be undone. The Dédalo user profile must allow delete on the target section.\n' +
			'**Resolve `section_tipo` first** via `dedalo_ontology_glossary` or `dedalo_resolve_ontology`.',
		annotations: { tier: 'primitive', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, title: 'Delete record' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			section_id: SectionIdSchema,
			lang: OptionalLangSchema,
		}),
		handler: async ({ section_tipo, section_id, lang }) =>
			client.call(rqo({ action: 'delete', source: { tipo: section_tipo, section_tipo, section_id, lang }, prevent_lock: false })),
	}, ctx);
}
