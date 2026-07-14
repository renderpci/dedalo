import { readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import type { Candidate } from './types.ts';

/** RRF constant k (PHP DEDALO_RAG_RRF_K, default 60). */
const RRF_K = (() => {
	const parsed = Number(readString('DEDALO_RAG_RRF_K'));
	return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 60;
})();

/**
 * Reciprocal Rank Fusion (RRF) for hybrid retrieval. Combines several ranked
 * candidate lists (dense ANN, lexical) without normalising their incomparable
 * scores: each item's fused score is the sum over lists of 1/(k + rank), rank
 * being 1-based position in that list. Pure and fully unit-testable.
 *
 * Ported from the reference implementation `src/ai/rag2/src/fusion.ts`
 * (Brick 1). Replaces the inline RRF that used to live in retrieval.ts.
 */

/** The chunk-identity keys that together uniquely name a candidate. */
export const DEFAULT_ID_KEYS: ReadonlyArray<keyof Candidate> = [
	'sectionTipo',
	'sectionId',
	'componentTipo',
	'lang',
	'chunkIndex',
];

/**
 * Fuse ranked lists with RRF. Returns candidates with an added rrfScore, sorted
 * descending by it. The first-seen full row for each id is preserved (so
 * source_text/chunk_meta survive). Default k = DEDALO_RAG_RRF_K (60).
 */
export function fuse(
	rankedLists: Candidate[][],
	idKeys: ReadonlyArray<keyof Candidate> = DEFAULT_ID_KEYS,
	k = RRF_K,
): Candidate[] {
	const scores = new Map<string, number>();
	const rows = new Map<string, Candidate>();

	for (const list of rankedLists) {
		let rank = 0;
		for (const item of list) {
			rank++;
			const id = identity(item, idKeys);
			if (!scores.has(id)) {
				scores.set(id, 0);
				rows.set(id, item);
			}
			scores.set(id, (scores.get(id) as number) + 1 / (k + rank));
		}
	}

	const out: Candidate[] = [];
	for (const [id, score] of scores) {
		out.push({ ...(rows.get(id) as Candidate), rrfScore: score });
	}
	out.sort((a, b) => (b.rrfScore ?? 0) - (a.rrfScore ?? 0));
	return out;
}

function identity(item: Candidate, idKeys: ReadonlyArray<keyof Candidate>): string {
	return idKeys.map((key) => String(item[key] ?? '')).join('|');
}

/**
 * Reduce chunk candidates to best-scored-per-record entries, preserving the
 * winning chunk's provenance. Used by semantic_search / similar_to (which return
 * records, not passages). scoreKey defaults to 'rrfScore'.
 */
export function collapseToRecords(
	candidates: Candidate[],
	scoreKey: 'rrfScore' | 'score' = 'rrfScore',
): Candidate[] {
	const best = new Map<string, Candidate>();
	for (const c of candidates) {
		const key = `${c.sectionTipo}|${c.sectionId}`;
		const score = c[scoreKey] ?? 0;
		const existing = best.get(key);
		if (!existing || score > (existing[scoreKey] ?? Number.NEGATIVE_INFINITY)) {
			best.set(key, c);
		}
	}
	const out = [...best.values()];
	out.sort((a, b) => (b[scoreKey] ?? 0) - (a[scoreKey] ?? 0));
	return out;
}

/** Add a uniform score (1/(1+distance)) when not fusing (single-leg path). */
export function tagScore(rows: Candidate[]): Candidate[] {
	return rows.map((r) => ({
		...r,
		score: 1 / (1 + Math.max(0, r.distance ?? 1)),
	}));
}
