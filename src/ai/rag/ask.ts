/**
 * The `ask` grounded-Q&A pipeline (port of dd_rag_api::ask; reference
 * `src/ai/rag2/src/ask.ts`, Brick 5), adapted to this branch's functional
 * retrieval (ACL enforced inside retrievePassages) and RagPassageHit shape.
 *
 * Pipeline (load-bearing order — do NOT reorder):
 *   scope (optional) → retrievePassages (ACL enforced inside)
 *     → GROUNDING GATE: no passages ⇒ canned refusal + NO LlmProvider call
 *     → reranker (pass-through default)
 *     → context token-budget fit (keeps ≥1 passage even if over budget)
 *     → LIVE egress decision (recomputed from current config per record)
 *     → LlmProvider.generate → RAW answer (no escaping) + citations (the locators)
 *
 * INVARIANTS (must never regress):
 *   - grounding gate refuses with NO model call when no passages (no hallucination)
 *   - ACL enforced per-passage (inside retrievePassages) BEFORE generation
 *   - fitTokenBudget keeps ≥1 passage
 *   - egress recomputed live at generation, not from a stored class
 *   - raw answer in the result (the client escapes at render)
 *
 * LEDGERED SIMPLIFICATION vs rag2: small-to-big parent expansion is omitted — the
 * simple dense/lexical legs don't surface parent_key, so expansion would be a
 * no-op. It can be added when the retrieval legs project parent_key.
 *
 * All collaborators are INJECTED (no module-global state).
 */

import type { Principal } from '../../core/security/permissions.ts';
import { estimateTokens } from './chunker.ts';
import type { LlmCitation, LlmPassage, LlmProvider, LlmUsage } from './llm_provider.ts';
import { passageLocator } from './llm_provider.ts';
import type { Reranker } from './reranker.ts';
import { type RagPassageHit, retrievePassages } from './retrieval.ts';

/**
 * The live egress decision for ONE record, recomputed at generation time from the
 * CURRENT config. 'restricted' forbids external generation; 'public' permits it.
 */
export type RecordEgressClass = (
	sectionTipo: string,
	sectionId: number,
) => Promise<'restricted' | 'public'> | ('restricted' | 'public');

/** Resolve the system prompt for the scoped sections (per-section override → default). */
export type SystemPromptResolver = (sectionTipos: string[]) => Promise<string> | string;

export interface AskDeps {
	llm: LlmProvider;
	reranker: Reranker;
	/** Live egress recompute (default: external forbidden ⇒ everything 'restricted'). */
	egress: RecordEgressClass;
	/**
	 * Live egress for a CONTRIBUTING section tipo (deep-resolved group text — a
	 * passage's chunk may carry text from OTHER sections, e.g. a mint's term).
	 * Checked beside the host record so a forbidden section's text can never be
	 * promoted into external generation through a host it was embedded into.
	 */
	contributorEgress?: (
		sectionTipo: string,
	) => Promise<'restricted' | 'public'> | ('restricted' | 'public');
	systemPrompt: SystemPromptResolver;
	contextTokenBudget?: number;
	maxOutputTokens?: number;
	/**
	 * True when `llm` egresses off-box (a third-party / networked provider). When
	 * set, a restricted-egress passage BLOCKS that provider (falls back to
	 * `localLlm`, else a restricted refusal). Local/stub providers leave this
	 * false and always generate.
	 */
	llmIsExternal?: boolean;
	/** Optional non-egressing provider used when the egress gate blocks `llm`. */
	localLlm?: LlmProvider;
}

export interface AskRequest {
	principal: Principal;
	query: string;
	/** Optional section scope; empty ⇒ every section the principal can read. */
	sectionTipos: string[];
	topK: number;
}

export interface AskProvenance {
	section_tipo: string;
	section_id: number;
	component_tipo: string | null;
	lang: string | null;
	chunk_index: number | null;
	text: string | null;
	score: number | null;
}

export interface AskResult {
	answer: string;
	citations: LlmCitation[];
	provenance: AskProvenance[];
	grounded: boolean;
	used_provider: string;
	model?: string;
	usage?: LlmUsage;
	/** True when the egress gate withheld external generation (see restrictedResult). */
	restricted?: boolean;
}

const DEFAULT_CONTEXT_TOKEN_BUDGET = 12000;
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;

export const NO_CONTEXT_ANSWER = '';
export const NO_CONTEXT_MSG = 'no_grounded_context';

/** GROUNDING-GATE refusal: empty answer, ungrounded, NO provider used (no model call). */
export function refusalResult(): AskResult {
	return {
		answer: NO_CONTEXT_ANSWER,
		citations: [],
		provenance: [],
		grounded: false,
		used_provider: '',
	};
}

export const RESTRICTED_MSG = 'external_generation_restricted';

/**
 * EGRESS-GATE refusal: at least one grounding passage is a restricted-egress
 * record and no local (non-egressing) provider is wired, so NO external model
 * call is made — restricted content never leaves the box. The provenance is
 * still returned (the caller can show which sources were withheld); there is no
 * generated answer and `restricted` flags the reason.
 */
export function restrictedResult(passages: RagPassageHit[]): AskResult {
	return {
		answer: NO_CONTEXT_ANSWER,
		citations: [],
		provenance: shapeProvenance(passages),
		grounded: false,
		used_provider: '',
		restricted: true,
	};
}

/**
 * Token-budget fit: keep best-first passages until system + query + passages fit
 * the budget, ALWAYS keeping at least the top passage (so the answer stays grounded).
 */
export function fitTokenBudget(
	passages: RagPassageHit[],
	system: string,
	query: string,
	budget: number,
): RagPassageHit[] {
	if (passages.length === 0) return [];
	const overhead = estimateTokens(system) + estimateTokens(query);
	const kept: RagPassageHit[] = [];
	let used = overhead;
	for (const passage of passages) {
		const tokens = estimateTokens(passage.snippet ?? '');
		if (kept.length > 0 && used + tokens > budget) break;
		kept.push(passage);
		used += tokens;
	}
	return kept;
}

function toLlmPassages(passages: RagPassageHit[]): LlmPassage[] {
	return passages.map((p) => ({
		sectionTipo: p.section_tipo,
		sectionId: p.section_id,
		componentTipo: p.component_tipo,
		lang: p.lang,
		chunkIndex: p.chunk_index,
		sourceText: p.snippet ?? '',
	}));
}

function shapeProvenance(passages: RagPassageHit[]): AskProvenance[] {
	return passages.map((p) => ({
		section_tipo: p.section_tipo,
		section_id: p.section_id,
		component_tipo: p.component_tipo,
		lang: p.lang,
		chunk_index: p.chunk_index,
		text: p.snippet,
		score: p.score,
	}));
}

/** Flatten passages into the `[source_i]\n…` context block the HTTP provider expects. */
function buildContext(passages: RagPassageHit[]): string {
	return passages.map((p, i) => `\n[source_${i}]\n${p.snippet ?? ''}\n`).join('');
}

/**
 * Run the full ask pipeline. A throw is reserved for the LLM transport (the caller
 * maps it to a `generation_failed` envelope); the grounding refusal and every gate
 * before the model are NORMAL returns.
 */
export async function runAsk(req: AskRequest, deps: AskDeps): Promise<AskResult> {
	const budget = deps.contextTokenBudget ?? DEFAULT_CONTEXT_TOKEN_BUDGET;
	const scope = req.sectionTipos.length > 0 ? req.sectionTipos : undefined;

	// 1. retrieve passages (ACL enforced inside retrievePassages).
	const passages = await retrievePassages(req.principal, req.query, req.topK, scope);

	// 2. GROUNDING GATE — no context ⇒ canned refusal, NO model call.
	if (passages.length === 0) return refusalResult();

	// 3. reranker (pass-through default; reorder only, never drops).
	const reranked = await deps.reranker.rerank(req.query, passages);

	// 4. context token-budget fit (keeps ≥1 passage even if over budget).
	const system = await deps.systemPrompt(req.sectionTipos);
	const fitted = fitTokenBudget(reranked, system, req.query, budget);

	// 5. LIVE egress decision — recomputed per record from CURRENT config. Any
	//    restricted record forbids EXTERNAL generation (a forbidden section, or
	//    external generation globally disabled ⇒ 'restricted'). A group chunk's
	//    CONTRIBUTORS (sections whose deep-resolved text was embedded into it)
	//    are checked with the same live policy.
	let hasRestricted = false;
	for (const passage of fitted) {
		if ((await deps.egress(passage.section_tipo, passage.section_id)) === 'restricted') {
			hasRestricted = true;
			break;
		}
		if (deps.contributorEgress !== undefined) {
			for (const contributor of passage.contributors ?? []) {
				if (contributor === passage.section_tipo) continue; // host already checked
				if ((await deps.contributorEgress(contributor)) === 'restricted') {
					hasRestricted = true;
					break;
				}
			}
			if (hasRestricted) break;
		}
	}

	// 6. provider selection — ENFORCE the egress gate. Restricted content must
	//    never reach an off-box provider: when `llm` egresses externally and any
	//    fitted passage is restricted, fall back to an injected local provider,
	//    else FAIL CLOSED with a restricted refusal (no model call, no egress).
	//    Non-external providers (local/stub) always generate.
	let provider = deps.llm;
	if (hasRestricted && deps.llmIsExternal === true) {
		if (deps.localLlm === undefined) {
			return restrictedResult(fitted);
		}
		provider = deps.localLlm;
	}

	// 7. generate — RAW answer (no escaping; client escapes at render).
	const generated = await provider.generate({
		system,
		prompt: req.query,
		context: buildContext(fitted),
		passages: toLlmPassages(fitted),
		maxTokens: deps.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
	});

	const citations: LlmCitation[] =
		generated.citations.length > 0
			? generated.citations
			: fitted.map((p) => ({
					locator: passageLocator({ sectionTipo: p.section_tipo, sectionId: p.section_id }),
					sectionTipo: p.section_tipo,
					sectionId: p.section_id,
				}));

	return {
		answer: generated.answer,
		citations,
		provenance: shapeProvenance(fitted),
		grounded: true,
		used_provider: generated.usedProvider,
		model: generated.model,
		...(generated.usage ? { usage: generated.usage } : {}),
	};
}
