/**
 * Shared types for the RAG retrieval pipeline.
 *
 * Ported from the reference implementation `src/ai/rag2/src/types.ts` (Brick 1).
 * These are the richer chunk/candidate/embedding shapes the whole pipeline
 * converges on as later bricks land (indexer, fusion, ask, multimodal). The
 * initial `vector_store.ts` still uses its own snake-cased `RagChunk`/`RagHit`;
 * Brick 2 migrates the store onto `EmbeddingRow`/`Candidate`.
 */

/** The natural-key identity of a stored chunk. */
export interface ChunkLocator {
	sectionTipo: string;
	sectionId: number;
	componentTipo: string;
	lang: string;
	chunkIndex: number;
}

/** A record-level locator (section_tipo + section_id). */
export interface RecordLocator {
	sectionTipo: string;
	sectionId: number;
}

/** A row to upsert into rag_embeddings. */
export interface EmbeddingRow {
	sectionTipo: string;
	sectionId: number;
	componentTipo: string;
	lang: string;
	chunkIndex: number;
	provider: string;
	model: string;
	dimension: number;
	embedding: number[];
	sourceHash: string;
	sourceText: string | null;
	tokenCount: number | null;
	modality?: string; // default 'text'
	sourceKind?: string; // default 'text'
	egressClass?: string; // default 'public'
	parentKey: string | null;
	chunkMeta: Record<string, unknown> | null;
}

/**
 * A retrieval candidate chunk (dense ANN or lexical). Carries provenance + the
 * leg-specific score. RRF/collapse add rrfScore/score downstream.
 */
export interface Candidate {
	sectionTipo: string;
	sectionId: number;
	componentTipo: string;
	lang: string;
	chunkIndex: number;
	sourceText: string | null;
	sourceKind: string | null;
	modality: string | null;
	egressClass: string | null;
	parentKey: string | null;
	chunkMeta: Record<string, unknown> | null;
	/** Cosine distance (dense leg). */
	distance?: number;
	/** ts_rank (lexical leg). */
	lexRank?: number;
	/** Fused RRF score (after fusion.fuse). */
	rrfScore?: number;
	/** Uniform score when not fusing (1/(1+distance)). */
	score?: number;
}

/** Stored raw vectors for a record (used by similar_to / get_record_vectors). */
export interface RecordVector {
	chunkIndex: number;
	view: string | null;
	sourceText: string;
	embedding: number[];
}

/** Filters narrowing the candidate set in a vector/lexical query. */
export interface QueryFilters {
	sectionTipos?: string[];
	modality?: string; // default 'text'
	maxDistance?: number | null; // dense only
}
