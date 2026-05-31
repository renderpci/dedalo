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

	// ── Static resource: sections index ────────────────────────────────
	// Compact {tipo, label} list for every section the user can read.
	// URI: dedalo://ontology/sections
	server.registerResource(
		'ontology-sections',
		'dedalo://ontology/sections',
		{
			description:
				'Compact index of all Dédalo sections accessible to the current user: ' +
				'tipo identifiers with multilingual labels. ' +
				'Fetch this once per session to know what record types exist.',
			mimeType: 'application/json',
		},
		(async () => {
			const result = await client.call(rqo({
				action: 'list_sections_index',
				dd_api: 'dd_agent_api',
				source: {},
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

	// ── Template resource: per-section field map ────────────────────────
	// Returns one section's full flat field map with multilingual labels,
	// simplified types, and portal targets.
	// URI pattern: dedalo://ontology/sections/{section_tipo}
	server.registerResource(
		'ontology-section-detail',
		new ResourceTemplate('dedalo://ontology/sections/{section_tipo}', {
			list: async () => {
				const result = await client.call(rqo({
					action: 'list_sections_index',
					dd_api: 'dd_agent_api',
					source: {},
				})) as Record<string, unknown>;

				const sections = (result as any)?.result ?? [];
				return {
					resources: sections.map((s: any) => ({
						uri: `dedalo://ontology/sections/${s.tipo}`,
						name: s.tipo,
						description: typeof s.label === 'object'
							? Object.values(s.label as Record<string, string>).join(' / ')
							: String(s.label ?? s.tipo),
						mimeType: 'application/json',
					})),
				};
			},
			complete: {
				section_tipo: async (value: string) => {
					const result = await client.call(rqo({
						action: 'list_sections_index',
						dd_api: 'dd_agent_api',
						source: {},
					})) as Record<string, unknown>;

					const sections = (result as any)?.result ?? [];
					return sections
						.map((s: any) => s.tipo as string)
						.filter((t: string) => t.startsWith(value));
				},
			},
		}),
		{
			description:
				'Full field map for a specific Dédalo section: tipo, multilingual labels, ' +
				'simplified types (text/html/date/number/link/media), and portal targets. ' +
				'Use this before reading or writing records to understand the available fields.',
			mimeType: 'application/json',
		},
		(async (uri: { href: string }, variables: Record<string, string>) => {
			const section_tipo = variables.section_tipo;
			const result = await client.call(rqo({
				action: 'get_section_map',
				dd_api: 'dd_agent_api',
				source: { section: section_tipo } as Record<string, unknown>,
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
