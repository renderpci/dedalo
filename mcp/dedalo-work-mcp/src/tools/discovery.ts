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
		name: 'dedalo_get_ontology_info',
		description:
			'Query ontology metadata for a specific tipo or model. Returns structure, relationships and configuration. Provide `tipo` for a specific element or `model` to query all elements of that model.',
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get ontology info' },
		inputSchema: z.object({
			tipo: TipoSchema.optional().describe('Specific tipo to query.'),
			model: z.string().optional().describe('Model name (e.g. `section`, `component_text_area`, `component_portal`).'),
			lang: OptionalLangSchema,
		}),
		handler: async (a) => client.call(rqo({ action: 'get_ontology_info', source: a })),
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
}
