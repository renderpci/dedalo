/**
 * Cross-encoder rerank seam for the `ask` / passage path (port of PHP rag_reranker;
 * reference `src/ai/rag2/src/reranker.ts`, Brick 5).
 *
 * The PHP default is PASS-THROUGH: with no reranker endpoint configured, the fused
 * order is returned unchanged. We mirror that — the `Reranker` interface is a clean
 * injectable seam so a future cross-encoder (bge-reranker, Cohere/Jina/TEI) can be
 * dropped in without touching the ask pipeline. Contract: rerank is a REORDERING
 * only — never drops or adds passages; on any failure it returns the original order.
 */

import type { RagPassageHit } from './retrieval.ts';

export interface Reranker {
	/** Reorder passages by (query, passage) relevance. Order-preserving on pass-through. */
	rerank(query: string, passages: RagPassageHit[]): Promise<RagPassageHit[]>;
}

/** The default reranker: pass-through (returns the fused order verbatim). */
export class PassThroughReranker implements Reranker {
	async rerank(_query: string, passages: RagPassageHit[]): Promise<RagPassageHit[]> {
		return passages;
	}
}
