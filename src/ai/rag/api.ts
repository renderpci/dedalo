/**
 * dd_rag_api — the native TS action handlers for the RAG retrieval API (Brick 4;
 * reference `src/ai/rag2/src/rag_api_handler.ts`). Registered in the static
 * ACTION_REGISTRY (core/api/dispatch.ts) as the `dd_rag_api` class, so the
 * class+action allowlist (spec §7.1) admits exactly these actions and no others.
 *
 * Actions (params in rqo.options):
 *   semantic_search { query, section_tipo?, limit? }   → best record per hit
 *   retrieve         { query, section_tipo?, limit? }   → passages (chunks)
 *   get_agent_context{ query, section_tipo?, limit? }   → passages (LLM context)
 *   similar_to       { section_tipo, section_id, limit? }→ records like a seed
 *
 * Security: every action requires a session (not in NO_LOGIN_ACTIONS) and is
 * CSRF-gated by the dispatcher; the RESULTS are ACL-gated inside retrieval.ts
 * (schema ACL + per-record projects filter — the DoD chokepoint). The global
 * DEDALO_RAG_ENABLED kill-switch declines every action when off.
 *
 * Types are imported from response.ts (not dispatch.ts) to avoid an import cycle
 * with the registry that mounts these handlers.
 */

import { readEnv } from '../../config/env.ts';
import type { ApiResult } from '../../core/api/response.ts';
import type { Rqo } from '../../core/concepts/rqo.ts';
import { type Principal, resolvePrincipal } from '../../core/security/permissions.ts';
import { RESTRICTED_MSG, runAsk } from './ask.ts';
import {
	askRuntimeConfigFromEnv,
	buildEgressPolicy,
	buildLlmProvider,
	buildSystemPromptResolver,
	defaultRagEnv,
} from './ask_config.ts';
import { RagCharacterizer } from './characterizer.ts';
import { RagConfig, defaultOntologyPort } from './config.ts';
import {
	type MultimodalRuntimeConfig,
	buildMultimodalProvider,
	isMediaEnabled,
	multimodalConfigFromEnv,
} from './multimodal_config.ts';
import { ObjectRetrieval, type SimilarityMode } from './object_retrieval.ts';
import { isRagEnabled } from './rag_enabled.ts';
import { PassThroughReranker } from './reranker.ts';
import { type RagSearchHit, retrievePassages, semanticSearch, similarTo } from './retrieval.ts';
import { buildRoleReader } from './role_reader.ts';
import type { Candidate } from './types.ts';

/** The slice of the request context the RAG handlers read (structural). */
interface RagApiContext {
	session: { userId: number } | null;
	principal?: Principal;
}

const MAX_TOP_K = 50;

/** Clamp a client-supplied limit to PHP's [1, 50] with a default of 10. */
function clampTopK(value: unknown): number {
	const n = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(n)) return 10;
	return Math.max(1, Math.min(MAX_TOP_K, Math.trunc(n)));
}

function optionString(options: Record<string, unknown> | undefined, key: string): string {
	const value = options?.[key];
	return typeof value === 'string' ? value.trim() : '';
}

/** Read an optional section-tipo scope (accepts a string or string[]). */
function optionScope(options: Record<string, unknown> | undefined): string[] | undefined {
	const value = options?.section_tipo;
	if (typeof value === 'string' && value !== '') return [value];
	if (Array.isArray(value)) {
		const out = value.filter((x): x is string => typeof x === 'string' && x !== '');
		if (out.length > 0) return out;
	}
	return undefined;
}

function envelope(result: unknown, msg: string, errors: string[] = []): ApiResult {
	return { status: 200, body: { result, msg, errors } };
}

const disabled = (): ApiResult => envelope(false, 'RAG is disabled', ['rag_disabled']);
const badRequest = (msg: string, code: string): ApiResult => envelope(false, msg, [code]);

/** Resolve the caller's authorization identity (session guaranteed by dispatch). */
async function resolveCaller(context: RagApiContext): Promise<Principal | null> {
	if (context.principal) return context.principal;
	if (context.session) return resolvePrincipal(context.session.userId);
	return null;
}

/** semantic_search / (shared record-shape response). */
async function recordSearch(rqo: Rqo, context: RagApiContext): Promise<ApiResult> {
	if (!isRagEnabled()) return disabled();
	const principal = await resolveCaller(context);
	if (principal === null) return badRequest('Authentication required', 'no_principal');
	const query = optionString(rqo.options, 'query');
	if (query === '') return badRequest('Missing query', 'missing_query');
	const hits = await semanticSearch(
		principal,
		query,
		clampTopK(rqo.options?.limit),
		optionScope(rqo.options),
	);
	return envelope(hits, 'ok');
}

/** retrieve / get_agent_context (shared passage-shape response). */
async function passageSearch(rqo: Rqo, context: RagApiContext, msg: string): Promise<ApiResult> {
	if (!isRagEnabled()) return disabled();
	const principal = await resolveCaller(context);
	if (principal === null) return badRequest('Authentication required', 'no_principal');
	const query = optionString(rqo.options, 'query');
	if (query === '') return badRequest('Missing query', 'missing_query');
	const passages = await retrievePassages(
		principal,
		query,
		clampTopK(rqo.options?.limit),
		optionScope(rqo.options),
	);
	return envelope(passages, msg);
}

/** similar_to (records similar to a seed). */
async function similarToAction(rqo: Rqo, context: RagApiContext): Promise<ApiResult> {
	if (!isRagEnabled()) return disabled();
	const principal = await resolveCaller(context);
	if (principal === null) return badRequest('Authentication required', 'no_principal');
	const sectionTipo = optionString(rqo.options, 'section_tipo');
	const sectionIdRaw = rqo.options?.section_id;
	const sectionId = typeof sectionIdRaw === 'number' ? sectionIdRaw : Number(sectionIdRaw);
	if (sectionTipo === '' || !Number.isFinite(sectionId) || sectionId < 1) {
		return badRequest('Missing or invalid seed (section_tipo, section_id)', 'missing_seed');
	}
	const hits: RagSearchHit[] = await similarTo(
		principal,
		sectionTipo,
		sectionId,
		clampTopK(rqo.options?.limit),
		optionScope(rqo.options),
	);
	return envelope(hits, 'ok');
}

/** ask — grounded Q&A with citations (or a refusal when no context is found). */
async function askAction(rqo: Rqo, context: RagApiContext): Promise<ApiResult> {
	if (!isRagEnabled()) return disabled();
	const principal = await resolveCaller(context);
	if (principal === null) return badRequest('Authentication required', 'no_principal');
	const query = optionString(rqo.options, 'query');
	if (query === '') return badRequest('Missing query', 'missing_query');

	const env = defaultRagEnv();
	const cfg = askRuntimeConfigFromEnv(env);
	const ragConfig = new RagConfig(defaultOntologyPort());
	try {
		const result = await runAsk(
			{
				principal,
				query,
				sectionTipos: optionScope(rqo.options) ?? [],
				topK: clampTopK(rqo.options?.limit),
			},
			{
				llm: buildLlmProvider(env),
				reranker: new PassThroughReranker(),
				egress: buildEgressPolicy(cfg),
				systemPrompt: buildSystemPromptResolver(ragConfig, env),
				contextTokenBudget: cfg.contextTokenBudget,
				maxOutputTokens: cfg.maxOutputTokens,
				// A configured HTTP endpoint egresses off-box; the egress gate blocks
				// it for restricted-section passages. The stub (no endpoint) is local.
				llmIsExternal: Boolean(env.DEDALO_RAG_LLM_ENDPOINT),
			},
		);
		// Both refusals are NORMAL envelopes (no external model was called): a
		// grounding miss vs. an egress-restricted record.
		const status = result.grounded
			? 'ok'
			: result.restricted
				? RESTRICTED_MSG
				: 'no_grounded_context';
		return envelope(result, status);
	} catch {
		// An LLM transport/protocol failure maps to generation_failed (never a
		// fabricated answer).
		return envelope(false, 'Generation failed', ['generation_failed']);
	}
}

// ─────────────────────────────── multimodal (images) ───────────────────────────────

const mediaDisabled = (): ApiResult => envelope(false, 'RAG media is disabled', ['media_disabled']);

/** Assemble the DEDALO_RAG_* image env from readEnv (process env > private .env). */
function mediaEnv(): Record<string, string | undefined> {
	const keys = [
		'DEDALO_RAG_MEDIA_ENABLED',
		'DEDALO_RAG_MULTIMODAL_PROVIDER',
		'DEDALO_RAG_MULTIMODAL_MODEL',
		'DEDALO_RAG_MULTIMODAL_ENDPOINT',
		'DEDALO_RAG_MULTIMODAL_API_KEY',
		'DEDALO_RAG_IMAGE_MAX_PX',
		'DEDALO_RAG_IMAGE_HYBRID',
		'DEDALO_RAG_NEAR_DUPLICATE_SIMILARITY',
		'DEDALO_RAG_CHARACTERIZE_TOP_K',
	];
	const env: Record<string, string | undefined> = {};
	for (const key of keys) env[key] = readEnv(key);
	return env;
}

function readSeed(options: Record<string, unknown> | undefined): {
	sectionTipo: string;
	sectionId: number;
} | null {
	const sectionTipo = optionString(options, 'section_tipo');
	const raw = options?.section_id;
	const sectionId = typeof raw === 'number' ? raw : Number(raw);
	if (sectionTipo === '' || !Number.isFinite(sectionId) || sectionId < 1) return null;
	return { sectionTipo, sectionId };
}

/** Candidate → API object shape (similarity = 1 - distance, view/thumb from chunk_meta). */
function shapeObject(candidate: Candidate): Record<string, unknown> {
	const meta = candidate.chunkMeta ?? {};
	const distance = candidate.distance;
	return {
		section_tipo: candidate.sectionTipo,
		section_id: candidate.sectionId,
		similarity: distance === undefined ? null : Math.round((1 - distance) * 10000) / 10000,
		score: candidate.rrfScore ?? candidate.score ?? null,
		view: typeof meta.view === 'string' ? meta.view : null,
		thumb_url: typeof meta.thumb_url === 'string' ? meta.thumb_url : null,
		context: candidate.sourceText,
	};
}

/** Build the multimodal stack (config + provider). Returns null when media is off. */
function buildMediaStack(): {
	cfg: MultimodalRuntimeConfig;
	objectRetrieval: ObjectRetrieval;
} | null {
	const env = mediaEnv();
	if (!isMediaEnabled(env)) return null;
	const cfg = multimodalConfigFromEnv(env);
	return { cfg, objectRetrieval: new ObjectRetrieval(buildMultimodalProvider(cfg)) };
}

/** similar_objects — visual object similarity by a seed record's stored image vectors. */
async function similarObjectsAction(rqo: Rqo, context: RagApiContext): Promise<ApiResult> {
	if (!isRagEnabled()) return disabled();
	const stack = buildMediaStack();
	if (stack === null) return mediaDisabled();
	const principal = await resolveCaller(context);
	if (principal === null) return badRequest('Authentication required', 'no_principal');
	const seed = readSeed(rqo.options);
	if (seed === null)
		return badRequest('Missing or invalid seed (section_tipo, section_id)', 'missing_seed');

	const ragConfig = new RagConfig(defaultOntologyPort());
	const scope = optionScope(rqo.options) ?? (await ragConfig.getCompareScope(seed.sectionTipo));
	const mode: SimilarityMode = rqo.options?.similarity_mode === 'visual' ? 'visual' : 'hybrid';
	const view = optionString(rqo.options, 'view') || null;
	const nearDup = rqo.options?.near_duplicate === true ? stack.cfg.nearDuplicateSimilarity : null;
	const hits = await stack.objectRetrieval.findSimilarObjects(principal, seed, {
		sectionTipos: scope,
		mode,
		view,
		topK: clampTopK(rqo.options?.limit),
		minSimilarity: nearDup,
	});
	return envelope(hits.map(shapeObject), 'ok');
}

/** search_by_text_image — a text query into the image space (joint tower). */
async function searchByTextImageAction(rqo: Rqo, context: RagApiContext): Promise<ApiResult> {
	if (!isRagEnabled()) return disabled();
	const stack = buildMediaStack();
	if (stack === null) return mediaDisabled();
	const principal = await resolveCaller(context);
	if (principal === null) return badRequest('Authentication required', 'no_principal');
	const query = optionString(rqo.options, 'query');
	if (query === '') return badRequest('Missing query', 'missing_query');
	const hits = await stack.objectRetrieval.searchByTextImage(principal, query, {
		sectionTipos: optionScope(rqo.options) ?? [],
		topK: clampTopK(rqo.options?.limit),
	});
	return envelope(hits.map(shapeObject), 'ok');
}

/** characterize_object — neighbour-aggregated typology/period proposals (no LLM). */
async function characterizeObjectAction(rqo: Rqo, context: RagApiContext): Promise<ApiResult> {
	if (!isRagEnabled()) return disabled();
	const stack = buildMediaStack();
	if (stack === null) return mediaDisabled();
	const principal = await resolveCaller(context);
	if (principal === null) return badRequest('Authentication required', 'no_principal');
	const seed = readSeed(rqo.options);
	if (seed === null)
		return badRequest('Missing or invalid seed (section_tipo, section_id)', 'missing_seed');

	const langs = (readEnv('APPLICATION_LANGS', 'lg-spa,lg-cat,lg-eng') as string).split(',');
	const nolan = readEnv('DATA_NOLAN', 'lg-nolan') as string;
	const characterizer = new RagCharacterizer({
		config: new RagConfig(defaultOntologyPort()),
		objectRetrieval: stack.objectRetrieval,
		roleReader: buildRoleReader(langs, nolan),
	});
	const result = await characterizer.characterize(principal, seed, {
		topK: stack.cfg.characterizeTopK,
	});
	return envelope(result, 'ok');
}

/**
 * The dd_rag_api action table, spread into the dispatch ACTION_REGISTRY. Each
 * handler matches the ActionHandler signature structurally (it reads only
 * session + principal from the context).
 */
export const ragApiActions = {
	semantic_search: recordSearch,
	retrieve: (rqo: Rqo, context: RagApiContext) => passageSearch(rqo, context, 'ok'),
	get_agent_context: (rqo: Rqo, context: RagApiContext) =>
		passageSearch(rqo, context, 'agent_context'),
	similar_to: similarToAction,
	ask: askAction,
	similar_objects: similarObjectsAction,
	search_by_text_image: searchByTextImageAction,
	characterize_object: characterizeObjectAction,
};
