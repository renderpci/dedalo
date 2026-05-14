import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from './_shared/register.js';
import { rqo } from './_shared/rqo.js';
import { TipoSchema, OptionalLangSchema, ModeSchema } from './_shared/schemas.js';

/**
 * Discovery tools — read-only ontology and context introspection.
 */
export function registerDiscoveryTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {
	registerTool(server, {
		name: 'dedalo_get_environment',
		description:
			'Get Dédalo server environment: version, languages, install status, logged user info. Safe pre-auth call. Use this first to verify connectivity.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get environment' },
		inputSchema: z.object({}),
		handler: async () => client.call(rqo({ action: 'get_environment' })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_list_sections',
		description:
			'List all section tipos defined in the ontology. Returns labels, models and configuration. Use this to discover what record types exist.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List sections' },
		inputSchema: z.object({ lang: OptionalLangSchema }),
		handler: async ({ lang }) => client.call(rqo({ action: 'get_ontology_info', source: { model: 'section', lang } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_section_elements_context',
		description:
			'Get the context for all components within a section_tipo. Returns the complete element list with types, labels and configuration.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get section elements context' },
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
			'Get UI context for a specific element (component or section). Returns structure, permissions, labels and metadata.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get element context' },
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
		name: 'dedalo_get_thesaurus_tree',
		description:
			'Get the hierarchical tree for a thesaurus tipo. Returns all terms with parent-child relationships.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get thesaurus tree' },
		inputSchema: z.object({ tipo: TipoSchema, lang: OptionalLangSchema }),
		handler: async ({ tipo, lang }) => client.call(rqo({ action: 'get_ontology_info', source: { tipo, lang } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_start',
		description:
			'Bootstrap the Dédalo application context. Returns the start page (menu + initial section) for the current user. Useful as a first call when discovering what is available to the configured user.',
		annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true, title: 'Application start' },
		inputSchema: z.object({
			tipo: TipoSchema.optional(),
			mode: ModeSchema.optional(),
			lang: OptionalLangSchema,
		}),
		handler: async (a) => client.call(rqo({ action: 'start', source: a })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_resolve_ontology',
		description:
			'Resolve an ontology term (e.g. "Oral History", "Interview") to its section structure with all components. ' +
			'Use `fuzzy` search_mode for natural-language input (default), or `exact` for precise JSONB term matches. ' +
			'Returns the section tipo, labels, model, and full component tree. ' +
			'This is the primary tool for discovering what fields/components a section contains from a human-readable name.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Resolve ontology term' },
		inputSchema: z.object({
			text: z.string().describe('Human-readable text to search for (e.g. "Oral History", "Interview").'),
			lang: OptionalLangSchema,
			search_mode: z.enum(['exact', 'fuzzy']).default('fuzzy').describe('Search mode: "fuzzy" for ILIKE pattern match (flexible), "exact" for JSONB containment (precise).'),
		}),
		handler: async ({ text, lang, search_mode }) =>
			client.call(rqo({
				action: 'resolve_section',
				dd_api: 'dd_ontology_api',
				source: { text, lang, mode: search_mode } as Record<string, unknown> as any,
			})),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_search_ontology',
		description:
			'Structured search of the Dédalo ontology by column values (model, parent, tld, etc.). ' +
			'Returns matching ontology nodes with their metadata. ' +
			'Use this to find all sections, components of a specific model, or nodes within a TLD namespace.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Search ontology' },
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
}
