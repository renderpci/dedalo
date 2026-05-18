import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpServer, ReadResourceCallback, ReadResourceTemplateCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { rqo } from '../tools/_shared/rqo.js';

/**
 * Ontology resources — expose Dédalo's ontology as MCP resources.
 *
 * Resources let the LLM proactively fetch the ontology map at session
 * start, without needing explicit tool calls. This builds the mental
 * map of sections, components, and portal relationships upfront.
 */
export function registerOntologyResources(server: McpServer, client: WorkClient): void {

	// ── Static resource: sections glossary ─────────────────────────────
	// Returns all sections with multilingual terms in one call.
	// URI: dedalo://ontology/sections
	server.registerResource(
		'ontology-sections',
		'dedalo://ontology/sections',
		{
			description:
				'Complete glossary of all Dédalo sections: human-readable names mapped to tipo identifiers. ' +
				'Terms in all available languages. Fetch this at session start to build your ontology map.',
			mimeType: 'application/json',
		},
		(async () => {
			const result = await client.call(rqo({
				action: 'get_glossary',
				dd_api: 'dd_ontology_api',
				source: { mode: 'sections' } as Record<string, unknown> as any,
			}));
			return {
				contents: [{
					uri: 'dedalo://ontology/sections',
					text: JSON.stringify(result, null, 2),
					mimeType: 'application/json',
				}],
			};
		}) as ReadResourceCallback,
	);

	// ── Template resource: per-section component detail ────────────────
	// Returns one section's component tree with portal metadata.
	// URI pattern: dedalo://ontology/sections/{section_tipo}
	server.registerResource(
		'ontology-section-detail',
		new ResourceTemplate('dedalo://ontology/sections/{section_tipo}', {
			list: async () => {
				const result = await client.call(rqo({
					action: 'get_glossary',
					dd_api: 'dd_ontology_api',
					source: { mode: 'sections' } as Record<string, unknown> as any,
				})) as Record<string, unknown>;

				const sections = (result as any)?.result ?? [];
				return {
					resources: sections.map((s: any) => ({
						uri: `dedalo://ontology/sections/${s.section_tipo}`,
						name: s.section_tipo,
						description: typeof s.term === 'object'
							? Object.values(s.term).join(' / ')
							: s.term,
						mimeType: 'application/json',
					})),
				};
			},
			complete: {
				section_tipo: async (value: string) => {
					const result = await client.call(rqo({
						action: 'resolve_term',
						dd_api: 'dd_ontology_api',
						source: { text: value, mode: 'fuzzy', model: 'section', limit: 20 } as Record<string, unknown> as any,
					})) as Record<string, unknown>;

					const nodes = (result as any)?.result ?? [];
					return nodes.map((n: any) => n.tipo);
				},
			},
		}),
		{
			description:
				'Full component tree for a specific Dédalo section, including portal metadata (is_portal, target_section_tipo). ' +
				'Use this to discover which components a section has and which portals link to other sections.',
			mimeType: 'application/json',
		},
		(async (uri: { href: string }, variables: Record<string, string>) => {
			const section_tipo = variables.section_tipo;
			const result = await client.call(rqo({
				action: 'get_glossary',
				dd_api: 'dd_ontology_api',
				source: { mode: 'section', section_tipo } as Record<string, unknown> as any,
			}));
			return {
				contents: [{
					uri: uri.href,
					text: JSON.stringify(result, null, 2),
					mimeType: 'application/json',
				}],
			};
		}) as ReadResourceTemplateCallback,
	);
}
