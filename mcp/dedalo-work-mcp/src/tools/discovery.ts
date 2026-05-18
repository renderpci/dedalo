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
			'List all section tipos defined in the ontology. Returns labels, models and configuration. Use this to discover what record types exist.\n' +
			'For a compact multilingual glossary with portal metadata, prefer `dedalo_ontology_glossary` (mode="sections").',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'List sections' },
		inputSchema: z.object({ lang: OptionalLangSchema }),
		handler: async ({ lang }) => client.call(rqo({ action: 'get_ontology_info', source: { model: 'section', lang } })),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_get_section_elements_context',
		description:
			'Get the context for all components within a section_tipo. Returns the complete element list with types, labels and configuration.\n' +
			'For a lightweight component overview with portal metadata, prefer `dedalo_ontology_glossary` (mode="section").',
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

	registerTool(server, {
		name: 'dedalo_ontology_glossary',
		description:
			'Get the ontology glossary: a map of human-readable names to Dédalo tipo identifiers with portal relationship metadata. ' +
			'THIS IS THE PRIMARY TOOL for resolving natural language to Dédalo tipos.\n\n' +
			'mode="sections": Returns ALL sections as a compact name→tipo dictionary (e.g. "Mint"→numisdata6, "Oral History"→oh1). ' +
			'Call once per session to build your mental map.\n\n' +
			'mode="section": Returns one section\'s full component tree WITH portal metadata. ' +
			'Portal components include is_portal=true and target_section_tipo showing where they link. ' +
			'Example: oh1 "Oral History" has oh24 "Informant" (portal→rsc197 "Person").\n\n' +
			'mode="path": Resolves a relational path like ["oh1","oh24","rsc197","rsc85"] and returns ' +
			'annotated metadata for each hop: section→portal→target section→leaf component.\n\n' +
			'ALWAYS use this before any tool requiring section_tipo or tipo parameters. ' +
			'Terms are returned in all available languages.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Ontology glossary' },
		inputSchema: z.object({
			mode: z.enum(['sections', 'section', 'path']).default('sections')
				.describe('"sections" = all sections map. "section" = one section\'s components. "path" = resolve relational path.'),
			section_tipo: TipoSchema.optional()
				.describe('Required when mode="section". The section to inspect.'),
			path: z.array(TipoSchema).min(2).optional()
				.describe('Required when mode="path". Array of tipos forming the relational path (e.g. ["oh1","oh24","rsc197","rsc85"]).'),
			lang: OptionalLangSchema,
		}),
		handler: async ({ mode, section_tipo, path, lang }) =>
			client.call(rqo({
				action: 'get_glossary',
				dd_api: 'dd_ontology_api',
				source: { mode, section_tipo, path, lang } as Record<string, unknown> as any,
			})),
	}, ctx);

	registerTool(server, {
		name: 'dedalo_resolve_path',
		description:
			'Resolve a relational path through the Dédalo ontology. Use this to understand cross-section relationships ' +
			'and navigate from a section through portal components to related sections.\n\n' +
			'Example: path=["oh1","oh24","rsc197","rsc85"] means:\n' +
			'  oh1 (Oral History) → oh24 (Informant portal) → rsc197 (Person) → rsc85 (Name)\n\n' +
			'Returns annotated metadata for each hop: tipo, model, term, is_portal, target_section_tipo. ' +
			'The leaf hop includes column_type (string, relation, date, geo, number, media) so you know ' +
			'what data format to expect.\n\n' +
			'Use after `dedalo_ontology_glossary` to drill into portal relationships discovered in the component tree.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Resolve relational path' },
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
