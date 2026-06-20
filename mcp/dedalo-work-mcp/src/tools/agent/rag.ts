import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WorkClient } from '@dedalo/mcp-common';
import { registerTool, type ToolContext } from '../_shared/register.js';
import { rqo } from '../_shared/rqo.js';
import { TipoSchema, SectionIdSchema } from '../_shared/schemas.js';

/**
 * Agent-tier RAG / semantic-search tools.
 *
 * Thin wrappers over `dd_rag_api`: semantic search, grounded Q&A, agent context,
 * and (for object collections) image similarity + neighbour-aggregated object
 * characterization. Every action enforces Dédalo's per-record ACL server-side
 * for the authenticated MCP user, so results never include records the user
 * cannot read.
 *
 * NOTE: unlike the dd_agent_api tools, `dd_rag_api` does NOT resolve human
 * section names — pass an ontology **tipo** (resolve a name first via
 * `dedalo_list_sections` → `dedalo_get_section_map`). All actions are read-only.
 */
export function registerRagAgentTools(server: McpServer, client: WorkClient, ctx: ToolContext): void {

	// ── text: semantic search ────────────────────────────────────────────────
	registerTool(server, {
		name: 'dedalo_semantic_search',
		description:
			'Semantic search: find records by MEANING (not keywords) over the vectorized archive. ' +
			'Describe the idea; the system finds conceptually similar records across languages. ' +
			'Returns ranked records (best first), ACL-filtered.\n\n' +
			'`section_tipos` are ontology tipos (e.g. ["oh1"]); a scope is required.',
		annotations: { tier: 'agent', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Semantic search' },
		inputSchema: z.object({
			query: z.string().min(1).describe('Natural-language description of what to find.'),
			section_tipos: z.array(TipoSchema).min(1).describe('Sections (tipos) to search.'),
			top_k: z.number().int().min(1).max(50).default(8).describe('Max records to return.'),
		}),
		handler: async ({ query, section_tipos, top_k }) =>
			client.call(rqo({ action: 'semantic_search', dd_api: 'dd_rag_api', source: { query, section_tipos, top_k } })),
	}, ctx);

	// ── text: grounded Q&A ───────────────────────────────────────────────────
	registerTool(server, {
		name: 'dedalo_ask',
		description:
			'Ask a question and get a GROUNDED answer with citations, synthesized only from the archive. ' +
			'If no relevant permitted context exists, it refuses (grounded:false) rather than inventing. ' +
			'Returns { answer, citations, provenance, grounded }. Treat it as a finding aid; verify via the citations.\n\n' +
			'`section_tipos` are ontology tipos; a scope is required.',
		annotations: { tier: 'agent', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Ask (grounded Q&A)' },
		inputSchema: z.object({
			query: z.string().min(1).describe('The question to answer from the archive.'),
			section_tipos: z.array(TipoSchema).min(1).describe('Sections (tipos) to ground the answer in.'),
			top_k: z.number().int().min(1).max(50).default(8).describe('Max context passages.'),
		}),
		handler: async ({ query, section_tipos, top_k }) =>
			client.call(rqo({ action: 'ask', dd_api: 'dd_rag_api', source: { query, section_tipos, top_k } })),
	}, ctx);

	// ── text: passages for the agent to ground its own reasoning ─────────────
	registerTool(server, {
		name: 'dedalo_get_relevant_context',
		description:
			'Retrieve the most relevant PASSAGES (not a generated answer) for a query, so YOU can ground your ' +
			'own reasoning in the archive. Returns ACL-filtered passages with their source record and provenance. ' +
			'Prefer this when you want to read and reason over the evidence yourself.',
		annotations: { tier: 'agent', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Get relevant context' },
		inputSchema: z.object({
			query: z.string().min(1).describe('What you need context about.'),
			section_tipos: z.array(TipoSchema).min(1).describe('Sections (tipos) to retrieve from.'),
			top_k: z.number().int().min(1).max(50).default(8).describe('Max passages.'),
		}),
		handler: async ({ query, section_tipos, top_k }) =>
			client.call(rqo({ action: 'get_agent_context', dd_api: 'dd_rag_api', source: { query, section_tipos, top_k } })),
	}, ctx);

	// ── images: objects similar to a given object ────────────────────────────
	registerTool(server, {
		name: 'dedalo_similar_objects',
		description:
			'Find objects VISUALLY similar to a given object record (coins, ceramics, …), using its images. ' +
			'For a multi-image object (e.g. a coin obverse + reverse) both faces are considered. ' +
			'Set `near_duplicate` for "the same object in the collection". Returns objects with score, view and `thumb_url`.\n\n' +
			'Requires the object\'s section to declare images in `properties.rag.context` and image vectorization enabled.',
		annotations: { tier: 'agent', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Similar objects (image)' },
		inputSchema: z.object({
			section_tipo: TipoSchema.describe('The seed object\'s section tipo.'),
			section_id: SectionIdSchema.describe('The seed object\'s record id.'),
			mode: z.enum(['visual', 'hybrid']).default('hybrid').describe('"hybrid" blends image with catalog context (recommended); "visual" is image-only.'),
			view: z.string().optional().describe('Restrict to one image role (e.g. "obverse").'),
			near_duplicate: z.boolean().default(false).describe('If true, return only near-identical matches.'),
			min_similarity: z.number().min(0).max(1).optional().describe('Explicit similarity floor (0–1).'),
			section_tipos: z.array(TipoSchema).optional().describe('Sections to compare against; omit to use the section\'s configured scope.'),
			top_k: z.number().int().min(1).max(50).default(8).describe('Max objects to return.'),
		}),
		handler: async ({ section_tipo, section_id, mode, view, near_duplicate, min_similarity, section_tipos, top_k }) =>
			client.call(rqo({
				action: 'similar_objects', dd_api: 'dd_rag_api',
				// `similarity_mode` (not `mode`, which is the reserved Dédalo render mode)
				source: { section_tipo, section_id, similarity_mode: mode, view, near_duplicate, min_similarity, section_tipos, top_k },
			})),
	}, ctx);

	// ── images: propose attributes from visual neighbours ────────────────────
	registerTool(server, {
		name: 'dedalo_characterize_object',
		description:
			'Propose an object\'s attributes (typology, period, material, …) by AGGREGATING its visually-similar ' +
			'neighbours\' cataloged metadata — a similarity-weighted vote for categorical fields and an earliest…latest ' +
			'range for dates. Each proposal carries a confidence and the cited supporting objects (with thumbnails). ' +
			'This is a grounded proposal from real records, NOT a generative guess — present it for human confirmation.\n\n' +
			'`fields` are ontology role keys from `properties.rag.context.metadata` (e.g. ["typology","period","material"]); omit for all.',
		annotations: { tier: 'agent', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Characterize object' },
		inputSchema: z.object({
			section_tipo: TipoSchema.describe('The object\'s section tipo.'),
			section_id: SectionIdSchema.describe('The object\'s record id.'),
			fields: z.array(z.string()).optional().describe('Role keys to propose (e.g. ["typology","period"]). Omit for all declared.'),
			top_k: z.number().int().min(1).max(100).default(20).describe('Neighbours to aggregate.'),
		}),
		handler: async ({ section_tipo, section_id, fields, top_k }) =>
			client.call(rqo({ action: 'characterize_object', dd_api: 'dd_rag_api', source: { section_tipo, section_id, fields, top_k } })),
	}, ctx);

	// ── images: text → object images ─────────────────────────────────────────
	registerTool(server, {
		name: 'dedalo_search_by_text_image',
		description:
			'Find OBJECT IMAGES matching a textual description (e.g. "blue-and-white ceramic jar with handles"). ' +
			'The description is matched against objects\' visual features via a joint image+text model. ' +
			'Returns objects with `thumb_url`, ACL-filtered.\n\n' +
			'`section_tipos` are ontology tipos; a scope is required.',
		annotations: { tier: 'agent', readOnlyHint: true, idempotentHint: true, openWorldHint: true, title: 'Search objects by description' },
		inputSchema: z.object({
			query: z.string().min(1).describe('Visual description of the object(s) to find.'),
			section_tipos: z.array(TipoSchema).min(1).describe('Object sections (tipos) to search.'),
			top_k: z.number().int().min(1).max(50).default(8).describe('Max objects to return.'),
		}),
		handler: async ({ query, section_tipos, top_k }) =>
			client.call(rqo({ action: 'search_by_text_image', dd_api: 'dd_rag_api', source: { query, section_tipos, top_k } })),
	}, ctx);
}
