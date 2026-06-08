import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../_shared/register.js';
import { rqo } from '../_shared/rqo.js';
import { TipoSchema, OptionalLangSchema, ModeSchema } from '../_shared/schemas.js';

/**
 * Discovery tools — read-only ontology and context introspection.
 */
export function registerDiscoveryTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_get_environment',
		description:
			'Get Dédalo server environment: version, languages, install status, logged user info. Safe pre-auth call. Use this first to verify connectivity.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get environment' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo({ action: 'get_environment' })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_list_sections',
		description:
			'Return a compact index of all Dédalo sections the current user can read: ' +
			'tipo identifiers with multilingual labels (all languages). ' +
			'Use this first to discover what record types exist, then call `dedalo_get_section_map` ' +
			'on any section to get its full field list.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List sections' },
		inputSchema: z.object({ lang: OptionalLangSchema }),
		handler: async ({ lang }) =>
			client.call(rqo({ action: 'list_sections_index', dd_api: 'dd_agent_api', source: { lang } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_section_map',
		description:
			'Get the full field map for a Dédalo section.\n\n' +
			'Accepts a section name in any language (e.g. "Oral History", "Historia oral") ' +
			'or a tipo identifier (e.g. "oh1").\n\n' +
			'Returns: section tipo, multilingual labels for the section and every field, ' +
			'simplified type (text/html/date/number/link/media), and portal target section for link fields.\n\n' +
			'Typical workflow:\n' +
			'1. `dedalo_list_sections` → pick the section.\n' +
			'2. `dedalo_get_section_map` → learn field names and tipos.\n' +
			'3. `dedalo_search_records_view` / `dedalo_get_record` → read data.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get section field map' },
		inputSchema: z.object({
			section: z.string().describe('Section name (any language) or tipo, e.g. "Oral History" or "oh1".'),
			lang: OptionalLangSchema,
		}),
		handler: async ({ section, lang }) =>
			client.call(rqo({
				action: 'get_section_map',
				dd_api: 'dd_agent_api',
				source: { section, lang },
			})),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_section_elements_context',
		description:
			'[Advanced] Get the raw UI context for all components within a section_tipo. ' +
			'Returns the complete element list with types, labels and configuration. ' +
			'Prefer `dedalo_get_section_map` for a lighter, LLM-friendly field map.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get section elements context' },
		inputSchema: z.object({
			section_tipo: TipoSchema,
			lang: OptionalLangSchema,
			mode: ModeSchema.default('edit'),
		}),
		handler: async ({ section_tipo, lang, mode }) =>
			client.call(rqo({ action: 'get_section_elements_context', source: { tipo: section_tipo, section_tipo, lang, mode } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_element_context',
		description:
			'[Advanced] Get raw UI context for a specific element (component or section). ' +
			'Returns structure, permissions, labels and metadata.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get element context' },
		inputSchema: z.object({
			tipo: TipoSchema,
			section_tipo: TipoSchema.optional().describe('Parent section tipo. Defaults to `tipo` for self-section lookups.'),
			lang: OptionalLangSchema,
			mode: ModeSchema.default('edit'),
		}),
		handler: async ({ tipo, section_tipo, lang, mode }) =>
			client.call(rqo({ action: 'get_element_context', source: { tipo, section_tipo: section_tipo ?? tipo, lang, mode } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_start',
		description:
			'Bootstrap the Dédalo application context. Returns the start page (menu + initial section) for the current user. Useful as a first call when discovering what is available to the configured user.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: false, openWorldHint: true, title: 'Application start' },
		inputSchema: z.object({
			tipo: TipoSchema.optional(),
			mode: ModeSchema.optional(),
			lang: OptionalLangSchema,
		}),
		handler: async (a) => client.call(rqo({ action: 'start', source: a })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_search_ontology',
		description:
			'[Advanced] Structured search of the Dédalo ontology by column values (model, parent, tld, etc.). ' +
			'Returns matching ontology nodes with their metadata. ' +
			'Use this to find components of a specific model or nodes within a TLD namespace.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Search ontology' },
		inputSchema: z.object({
			model: z.string().optional().describe('Filter by model name (e.g. "section", "component_text_area").'),
			parent: TipoSchema.optional().describe('Filter by parent tipo.'),
			tld: z.string().optional().describe('Filter by TLD/namespace (e.g. "oh", "dd", "tch").'),
			is_model: z.boolean().optional().describe('Filter by whether node is a model definition.'),
			is_translatable: z.boolean().optional().describe('Filter by whether node is translatable.'),
			limit: z.number().int().min(1).max(500).optional().describe('Max results to return (default 100).'),
		}),
		handler: async (a) =>
			client.call(rqo({
				action: 'search',
				dd_api: 'dd_ontology_api',
				source: a,
			})),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_resolve_path',
		description:
			'[Advanced] Resolve a relational path through the Dédalo ontology. ' +
			'Use this to understand cross-section relationships and navigate from a section ' +
			'through portal components to related sections.\n\n' +
			'Example: path=["oh1","oh24","rsc197","rsc85"] means:\n' +
			'  oh1 (Oral History) → oh24 (Informant portal) → rsc197 (Person) → rsc85 (Name)\n\n' +
			'Returns annotated metadata for each hop: tipo, model, term, is_portal, target_section_tipo. ' +
			'The leaf hop includes column_type so you know what data format to expect.',
		annotations: { tier: 'primitive', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Resolve relational path' },
		inputSchema: z.object({
			path: z.array(TipoSchema).min(2)
				.describe('Array of tipos forming the relational path. Must start with a section tipo, ' +
					'followed by portal components and their target sections, ending at the leaf component.'),
			lang: OptionalLangSchema,
		}),
		handler: async ({ path, lang }) =>
			client.call(rqo({
				action: 'resolve_path',
				dd_api: 'dd_ontology_api',
				source: { path, lang } as Record<string, unknown> as any,
			})),
	}, ctx);
}
