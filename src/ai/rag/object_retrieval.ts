/**
 * MULTIMODAL object-image retrieval (port of the image parts of
 * core/rag/class.retrieval.php; reference `src/ai/rag2/src/object_retrieval.ts`,
 * Brick 5), adapted to this branch's functional store + principal-based ACL.
 *
 *  findSimilarObjects — visual object similarity by the seed's STORED image vectors
 *    (no re-embedding): PER-VIEW RRF (each face is its own ranked list, so an object
 *    close on BOTH faces ranks higher), optional HYBRID lexical leg over the stored
 *    context summary, explicit ACL BEFORE any score is returned, near-dup floor, and
 *    best-per-object collapse.
 *  searchByTextImage — a TEXT query into the IMAGE space via the JOINT tower
 *    (embedTextForImageSearch → image ANN). No per-view, no hybrid.
 *
 * Dependencies are INJECTED (multimodal provider); the store + ACL are this branch's
 * functional modules. ACL is enforced per-record (a vector hit is never an oracle).
 */

import type { Principal } from '../../core/security/permissions.ts';
import { DEFAULT_ID_KEYS, collapseToRecords, fuse, tagScore } from './fusion.ts';
import type { MultimodalEmbeddingProvider } from './multimodal_embedding_provider.ts';
import { aclFilterCandidates } from './retrieval.ts';
import type { Candidate, RecordLocator } from './types.ts';
import { getRecordVectors, lexicalQuery, queryDense } from './vector_store.ts';

export type SimilarityMode = 'visual' | 'hybrid';

export interface ObjectSearchScope {
	/** Sections to compare against (the compare scope). */
	sectionTipos?: string[];
	/** 'visual' (image only) or 'hybrid' (image + lexical-over-context). Default hybrid. */
	mode?: SimilarityMode;
	/** Restrict the query side to a single face (e.g. 'obverse'); null = all faces. */
	view?: string | null;
	topK?: number; // default 8
	candidates?: number; // default max(40, topK*4)
	/** Near-dup floor on best visual similarity (1 - distance). null = no floor. */
	minSimilarity?: number | null;
	rrfK?: number; // default 60
}

const DEFAULT_TOP_K = 8;
const DEFAULT_RRF_K = 60;

export class ObjectRetrieval {
	constructor(private readonly multimodal: MultimodalEmbeddingProvider) {}

	/**
	 * Find objects visually similar to a seed record by its stored image vectors.
	 * Per-view RRF + optional hybrid lexical-over-context + ACL + near-dup collapse.
	 */
	async findSimilarObjects(
		principal: Principal,
		locator: RecordLocator,
		scope: ObjectSearchScope,
	): Promise<Candidate[]> {
		const model = this.multimodal.model();
		const selfVectors = await getRecordVectors(locator, model, 'image');
		if (selfVectors.length === 0) return [];

		const mode = scope.mode ?? 'hybrid';
		const viewFilter = scope.view ?? null;
		const sectionTipos = scope.sectionTipos ?? [];
		const topK = scope.topK ?? DEFAULT_TOP_K;
		const candidates = scope.candidates ?? Math.max(40, topK * 4);
		const minSimilarity = scope.minSimilarity ?? null;
		const rrfK = scope.rrfK ?? DEFAULT_RRF_K;
		const filters = { sectionTipos, modality: 'image', maxDistance: null };

		// PER-VIEW: one ranked list per self image (obverse+reverse both contribute).
		const rankedLists: Candidate[][] = [];
		let contextSummary = '';
		for (const selfVector of selfVectors) {
			if (contextSummary === '' && selfVector.sourceText) contextSummary = selfVector.sourceText;
			if (viewFilter !== null && selfVector.view !== viewFilter) continue;
			if (selfVector.embedding.length === 0) continue;
			const hits = await queryDense(model, selfVector.embedding, candidates, filters);
			const excludingSelf = hits.filter(
				(h) => !(h.sectionTipo === locator.sectionTipo && h.sectionId === locator.sectionId),
			);
			if (excludingSelf.length > 0) rankedLists.push(excludingSelf);
		}
		if (rankedLists.length === 0) return [];

		// HYBRID: a lexical leg over the stored context summary (typology/material/period).
		if (mode === 'hybrid' && contextSummary !== '') {
			const lex = await lexicalQuery(contextSummary, candidates, {
				sectionTipos,
				modality: 'image',
			});
			const lexExcludingSelf = lex.filter(
				(h) => !(h.sectionTipo === locator.sectionTipo && h.sectionId === locator.sectionId),
			);
			if (lexExcludingSelf.length > 0) rankedLists.push(lexExcludingSelf);
		}

		const fused =
			rankedLists.length > 1
				? fuse(rankedLists, DEFAULT_ID_KEYS, rrfK)
				: tagScore(rankedLists[0] as Candidate[]);

		const floored =
			minSimilarity !== null ? fused.filter((h) => 1 - (h.distance ?? 1) >= minSimilarity) : fused;

		const accessible = await aclFilterCandidates(principal, floored);
		const scoreKey = accessible.some((p) => p.rrfScore !== undefined) ? 'rrfScore' : 'score';
		return collapseToRecords(accessible, scoreKey).slice(0, topK);
	}

	/**
	 * Text → image search via the JOINT text tower: embed the query with
	 * embedTextForImageSearch, ANN over the image partition, ACL, collapse.
	 */
	async searchByTextImage(
		principal: Principal,
		query: string,
		scope: ObjectSearchScope,
	): Promise<Candidate[]> {
		const trimmed = query.trim();
		if (trimmed === '') return [];
		const model = this.multimodal.model();
		const [queryVector] = await this.multimodal.embedTextForImageSearch([trimmed]);
		if (!queryVector) return [];

		const topK = scope.topK ?? DEFAULT_TOP_K;
		const candidates = scope.candidates ?? Math.max(40, topK * 4);
		const hits = await queryDense(model, queryVector, candidates, {
			sectionTipos: scope.sectionTipos ?? [],
			modality: 'image',
			maxDistance: null,
		});
		const accessible = await aclFilterCandidates(principal, tagScore(hits));
		return collapseToRecords(accessible, 'score').slice(0, topK);
	}
}
