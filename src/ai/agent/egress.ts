/**
 * The agent EGRESS gate — record content must never reach an EXTERNAL model
 * provider when the deployment restricts it ("Memory projects": some Dédalo
 * installations hold private data that may not leave the institution).
 *
 * WHERE it lives: the agent LOOP, not runTool/RegistryGates. The loop is
 * exactly the boundary where tool results enter a model context; the stdio
 * MCP server and the mcp_proxy bridge are unaffected by construction (their
 * callers receive data they are already ACL-cleared for — no model is
 * involved), and the loop also owns the registry-external
 * dedalo_semantic_search, which a registry-level gate would miss.
 *
 * Policy (reuses the RAG machinery — ONE data classification, two surfaces):
 *  - the forbidden-sections list is SHARED with RAG
 *    (DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS) — a section restricted
 *    for RAG egress is restricted for the agent too;
 *  - the allow-default is the agent's OWN opt-in
 *    (DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT, default FALSE): until a
 *    deployer opts in, an external-model conversation may use the ontology
 *    STRUCTURE tools (discovery) but gets NO record content at all;
 *  - local-model conversations are never gated;
 *  - classification failures are fail-closed (restricted), per
 *    rag/ask_config.buildEgressPolicy.
 *
 * The user's own question/images are NOT gated: user-provided input egresses
 * by the user's own act of picking an external model for the conversation.
 * The gate protects REPOSITORY content, not the user's words.
 *
 * Both ends of a gated read tool are classified, because a section can be
 * named without being the addressed one:
 *  - IN  (`gateAgentToolCall` → `collectSectionTipos`): a `filter.path` step or
 *    a `raw_sqo` tree may traverse a restricted section — the rows come from
 *    the public one, but the filter is an inference oracle over the
 *    restricted values;
 *  - OUT (`gateAgentToolResult`): `readSectionRecord` resolves portal/relation
 *    components to the LABELS of linked records in other sections.
 * Both refuse the whole call fail-closed. Over-refusal is the correct privacy
 * semantic here — the hint steers the user to the (never-gated) local model.
 */

import { readEnv } from '../../config/env.ts';
import { type StructuredErr, err } from '../mcp/envelope.ts';
import type { RecordEgressClass } from '../rag/ask.ts';
import { askRuntimeConfigFromEnv, buildEgressPolicy } from '../rag/ask_config.ts';

/** The egress posture of one agent conversation. */
export interface AgentEgressOptions {
	/** True when the conversation's model has catalog egress 'external'. */
	external: boolean;
	/** Live per-record classifier (fail-closed, RAG shape). */
	policy: RecordEgressClass;
}

/**
 * Read tools whose results carry RECORD CONTENT — gated by the addressed
 * section when the conversation egresses externally. Every non-write registry
 * tool MUST appear in exactly one of these two sets (agent_egress_tripwire).
 */
export const EGRESS_GATED_READ_TOOLS: ReadonlySet<string> = new Set([
	'dedalo_search_section',
	'dedalo_read_record',
	'dedalo_search_records',
	'dedalo_count_records', // counts are content-derived — fail-closed
	'dedalo_get_media_info',
]);

/**
 * Read tools exempt from the gate, each with the REASON it is safe: they
 * return ontology STRUCTURE (labels of sections/fields, portal targets, path
 * validation), never record data.
 */
export const EGRESS_STRUCTURE_EXEMPT: Readonly<Record<string, string>> = {
	dedalo_list_sections: 'section tipos + labels — ontology structure, no record data',
	dedalo_describe_section: 'field map of a section — ontology structure, no record data',
	dedalo_resolve: 'name→tipo resolution (its section_tipo scopes FIELD names) — structure',
	dedalo_resolve_path: 'relational path validation over portal targets — structure',
	dedalo_describe_node: 'tipo→runtime model primitive — structure',
};

/**
 * Assemble the agent egress policy from env. The publishable hook is accepted
 * but unwired in v1 (mirrors rag/api.ts — section-level classification only).
 */
export function buildAgentEgressPolicy(
	env?: Record<string, string | undefined>,
	publishable?: (sectionTipo: string, sectionId: number) => Promise<boolean> | boolean,
): RecordEgressClass {
	const resolved = env ?? defaultAgentEgressEnv();
	const cfg = askRuntimeConfigFromEnv({
		DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS:
			resolved.DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS,
		// The agent's OWN opt-in feeds the shared policy builder's allow-default.
		DEDALO_RAG_ALLOW_EXTERNAL_PROVIDER_DEFAULT:
			resolved.DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT,
	});
	return buildEgressPolicy(cfg, publishable);
}

/** The env slice the agent egress policy reads (readEnv only). */
export function defaultAgentEgressEnv(): Record<string, string | undefined> {
	return {
		DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS: readEnv(
			'DEDALO_RAG_EXTERNAL_PROVIDER_FORBIDDEN_SECTIONS',
		),
		DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT: readEnv(
			'DEDALO_AGENT_ALLOW_EXTERNAL_PROVIDER_DEFAULT',
		),
	};
}

/**
 * Collect EVERY section_tipo named anywhere in a tool input (deep walk).
 *
 * Load-bearing: `dedalo_search_records` filter rules carry multi-hop
 * `path:[{section_tipo, component_tipo}]` steps, and `raw_sqo` carries a whole
 * SQO tree — either can reference a DIFFERENT section than the top-level
 * `section_tipo`. Rows come back from the main section, but a filter over a
 * restricted section is still an inference oracle ("does a record in the
 * restricted section match X?"). Classifying only the addressed section would
 * leak exactly that. Every named section is classified instead.
 */
export function collectSectionTipos(input: unknown, out: Set<string> = new Set()): Set<string> {
	if (Array.isArray(input)) {
		for (const item of input) collectSectionTipos(item, out);
		return out;
	}
	if (typeof input === 'object' && input !== null) {
		for (const [key, value] of Object.entries(input)) {
			if (key === 'section_tipo' && typeof value === 'string' && value !== '') {
				out.add(value);
			} else {
				collectSectionTipos(value, out);
			}
		}
	}
	return out;
}

/**
 * Pre-execution gate for a registry tool call. Returns null (allowed) or the
 * coded refusal envelope that becomes the tool's is_error result — the
 * handler NEVER runs on a refusal. Fail-closed: a gated tool that names NO
 * section, or names ANY restricted section (at any depth — see
 * collectSectionTipos), is refused.
 */
export async function gateAgentToolCall(
	egress: AgentEgressOptions,
	toolName: string,
	input: Record<string, unknown>,
): Promise<StructuredErr | null> {
	if (!egress.external) return null;
	if (!EGRESS_GATED_READ_TOOLS.has(toolName)) return null;

	const sectionTipos = collectSectionTipos(input);
	if (sectionTipos.size === 0) {
		return err(
			'egress_restricted',
			`${toolName}: cannot classify the addressed section for external egress`,
		);
	}
	const sectionId = Number(input.section_id ?? 0);
	const addressedId = Number.isFinite(sectionId) ? sectionId : 0;
	for (const sectionTipo of sectionTipos) {
		// Only the addressed section carries a concrete id; a section named in a
		// filter path is classified at the section level (id 0).
		const id = sectionTipo === input.section_tipo ? addressedId : 0;
		const klass = await egress.policy(sectionTipo, id);
		if (klass === 'restricted') {
			return err(
				'egress_restricted',
				`${toolName}: section ${sectionTipo} is restricted from external model providers`,
			);
		}
	}
	return null;
}

/**
 * POST-execution scrub of a gated read tool's envelope. The pre-execution gate
 * classifies the sections the CALL names; a result can still surface content
 * from another section — `readSectionRecord` resolves portal/relation
 * components to the LABELS of linked records (e.g. a protected informant's
 * name reached through a public record). Classifying only the addressed
 * section would route around the forbidden-sections list.
 *
 * So: walk the result for every section named anywhere in it and refuse the
 * WHOLE envelope (fail-closed) if any is restricted. Over-refusal is the
 * correct privacy semantic — the hint tells the user to switch to the local
 * model, which is never gated.
 */
export async function gateAgentToolResult(
	egress: AgentEgressOptions,
	toolName: string,
	envelope: unknown,
): Promise<StructuredErr | null> {
	if (!egress.external) return null;
	if (!EGRESS_GATED_READ_TOOLS.has(toolName)) return null;

	for (const sectionTipo of collectSectionTipos(envelope)) {
		const klass = await egress.policy(sectionTipo, 0);
		if (klass === 'restricted') {
			return err(
				'egress_restricted',
				`${toolName}: the result references section ${sectionTipo}, which is restricted from external model providers`,
			);
		}
	}
	return null;
}

/**
 * Post-execution per-hit filter for search-hit-shaped results (semantic
 * search): restricted hits are dropped BEFORE they enter the model context.
 */
export async function filterEgressHits<T extends { section_tipo: string; section_id: number }>(
	egress: AgentEgressOptions,
	hits: T[],
): Promise<{ allowed: T[]; removed: number }> {
	if (!egress.external) return { allowed: hits, removed: 0 };
	const allowed: T[] = [];
	for (const hit of hits) {
		const klass = await egress.policy(hit.section_tipo, hit.section_id);
		if (klass === 'public') allowed.push(hit);
	}
	return { allowed, removed: hits.length - allowed.length };
}
