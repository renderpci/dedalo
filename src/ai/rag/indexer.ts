/**
 * Full-record RAG indexer — TS port of core/rag/class.rag_indexer.php (TEXT path).
 * Reference: `src/ai/rag2/src/rag_indexer.ts`, adapted to this branch's core
 * (Brick 2). The IMAGE/multimodal path is a later brick and is not built here.
 *
 * indexRecord(locator) orchestrates one record's text ingestion:
 *   1. gate on the section's ontology opt-in (RagConfig.sectionIsRagEnabled),
 *   2. resolve the embeddable component tipos (RagConfig, from the ontology),
 *   3. EXTRACT clean text per (component, lang) READ-ONLY over the matrix
 *      (readComponentText),
 *   4. chunk (structure-aware semantic; chunker.ts),
 *   5. hash-diff against the stored source_hash — skip unchanged chunks,
 *   6. embed only the changed chunks (injected provider; skip on failure),
 *   7. atomic upsert (store.upsertEmbeddingRows), then prune stale tail chunks.
 *
 * All failures are SOFT: a read/embed/store error returns false so the queue
 * retries; nothing throws into the caller. No module-global mutable state — every
 * dependency is injected; `buildRagIndexer()` wires the production defaults.
 */

import { readEnv } from '../../config/env.ts';
import { getMatrixTableFromTipo, getTermByTipo } from '../../core/ontology/resolver.ts';
import { type Chunk, chunk } from './chunker.ts';
import { readComponentText } from './component_text.ts';
import { type OntologyPort, RagConfig, defaultOntologyPort } from './config.ts';
import { type EmbeddingProvider, getEmbeddingProvider } from './embedding_provider.ts';
import type { EmbeddingRow, RecordLocator } from './types.ts';
import {
	deleteRecordModality,
	deleteStale,
	diffHashes,
	listSectionIds,
	deleteRecord as storeDeleteRecord,
	upsertEmbeddingRows,
} from './vector_store.ts';

/** The vector-store surface the indexer needs (injectable for unit tests). */
export interface RagStore {
	diffHashes(locator: RecordLocator, model: string): Promise<Map<string, string>>;
	upsertEmbeddingRows(rows: EmbeddingRow[]): Promise<void>;
	deleteStale(
		locator: RecordLocator,
		componentTipo: string,
		lang: string,
		model: string,
		validCount: number,
	): Promise<number>;
	deleteRecordModality(locator: RecordLocator, modality: string): Promise<void>;
	deleteRecord(locator: RecordLocator): Promise<void>;
	listSectionIds(sectionTipo: string): Promise<number[]>;
}

export interface RagIndexerDeps {
	config: RagConfig;
	provider: EmbeddingProvider;
	ontology: OntologyPort;
	store: RagStore;
	/** Data langs to extract for a translatable text component. */
	langs: readonly string[];
	/** No-lang code for non-translatable components (DEDALO_DATA_NOLAN). */
	nolan: string;
	/** Resolve a section's matrix table (defaults to 'matrix' when null). */
	resolveMatrixTable: (sectionTipo: string) => Promise<string | null>;
	/** Read one component's clean text (READ-ONLY over the matrix). */
	readText: (input: {
		matrixTable: string;
		componentTipo: string;
		model: string;
		sectionTipo: string;
		sectionId: number;
		lang: string;
	}) => Promise<string>;
	/** Best-effort record display label for the chunker's contextual header. */
	recordTitle: (sectionTipo: string, lang: string) => Promise<string>;
}

/** One extracted unit: a component's clean text in one lang. */
interface ExtractedUnit {
	componentTipo: string;
	lang: string;
	text: string;
}

export class RagIndexer {
	constructor(private readonly deps: RagIndexerDeps) {}

	/** Index one record (TEXT). Alias kept parallel to the eventual text+image split. */
	async indexRecord(locator: RecordLocator): Promise<boolean> {
		return this.indexRecordText(locator);
	}

	/**
	 * Index one record's text. Returns true on success (or a clean no-op when the
	 * section is not RAG-enabled), false on a RETRYABLE failure.
	 */
	async indexRecordText(locator: RecordLocator): Promise<boolean> {
		if (locator.sectionId < 1 || locator.sectionTipo === '') return false;

		if (!(await this.deps.config.sectionIsRagEnabled(locator.sectionTipo))) {
			return true; // nothing to do — not opted in
		}

		const componentTipos = await this.deps.config.getEmbeddableComponentTipos(locator.sectionTipo);
		if (componentTipos.length === 0) {
			try {
				await this.deps.store.deleteRecordModality(locator, 'text');
				return true;
			} catch {
				return false;
			}
		}

		const model = this.deps.provider.model;

		let extracted: ExtractedUnit[];
		let existingHashes: Map<string, string>;
		try {
			extracted = await this.extract(locator, componentTipos);
			existingHashes = await this.deps.store.diffHashes(locator, model);
		} catch {
			return false; // retryable: matrix/store read failed
		}

		const documentTitle = await this.recordTitle(locator);

		// Phase 1: chunk + hash-diff + embed (slow) OUTSIDE any transaction.
		const pendingUpserts: EmbeddingRow[] = [];
		const pendingStale: Array<[string, string, number]> = []; // [componentTipo, lang, validCount]
		let embedFailure = false;

		for (const unit of extracted) {
			const ragCfg = await this.deps.config.getComponentRagConfig(unit.componentTipo);
			const chunks = chunk(unit.text, {
				...(ragCfg.chunk?.maxTokens !== undefined ? { maxTokens: ragCfg.chunk.maxTokens } : {}),
				...(ragCfg.chunk?.minTokens !== undefined ? { minTokens: ragCfg.chunk.minTokens } : {}),
				documentTitle,
			});

			if (chunks.length === 0) {
				// value became empty → prune all chunks for this component/lang
				pendingStale.push([unit.componentTipo, unit.lang, 0]);
				continue;
			}

			// determine which chunks changed (hash differs from stored)
			const toEmbedIdx: number[] = [];
			for (let i = 0; i < chunks.length; i++) {
				const c = chunks[i] as Chunk;
				const key = `${unit.componentTipo}|${unit.lang}|${c.chunkIndex}`;
				if (existingHashes.get(key) === c.sourceHash) continue; // unchanged: skip
				toEmbedIdx.push(i);
			}

			if (toEmbedIdx.length > 0) {
				const embedTexts = toEmbedIdx.map((i) => (chunks[i] as Chunk).embedText);
				const vectors = await this.deps.provider.embed(embedTexts);
				if (vectors.length !== toEmbedIdx.length) {
					embedFailure = true; // do not write garbage; queue retries the record
					continue;
				}
				const dimension = vectors[0]?.length ?? 0;
				for (let v = 0; v < toEmbedIdx.length; v++) {
					const c = chunks[toEmbedIdx[v] as number] as Chunk;
					pendingUpserts.push({
						sectionTipo: locator.sectionTipo,
						sectionId: locator.sectionId,
						componentTipo: unit.componentTipo,
						lang: unit.lang,
						chunkIndex: c.chunkIndex,
						provider: this.deps.provider.name,
						model,
						dimension,
						embedding: vectors[v] as number[],
						sourceHash: c.sourceHash,
						sourceText: c.text,
						tokenCount: c.tokenCount,
						modality: 'text',
						sourceKind: c.sourceKind,
						egressClass: 'public',
						parentKey: c.parentKey,
						chunkMeta: c.chunkMeta as Record<string, unknown>,
					});
				}
			}

			pendingStale.push([unit.componentTipo, unit.lang, chunks.length]);
		}

		if (pendingUpserts.length === 0 && pendingStale.length === 0) {
			return !embedFailure;
		}

		// Phase 2: flush all writes for this record ATOMICALLY (embedding already done).
		try {
			if (pendingUpserts.length > 0) {
				await this.deps.store.upsertEmbeddingRows(pendingUpserts);
			}
			for (const [ct, lg, cnt] of pendingStale) {
				await this.deps.store.deleteStale(locator, ct, lg, model, cnt);
			}
		} catch {
			return false; // retryable: the vector store write failed
		}

		return !embedFailure;
	}

	/** Remove every vector for a record. Returns false on a retryable failure. */
	async deleteRecord(locator: RecordLocator): Promise<boolean> {
		try {
			await this.deps.store.deleteRecord(locator);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Reconcile a section: detect record-id PRESENCE drift between the matrix and
	 * the vector store and enqueue corrections. matrix-only ids → index; vector-only
	 * ids → delete. The matrix id source is injected (no @dedalo/search coupling).
	 */
	async reconcileSection(
		sectionTipo: string,
		matrixIds: () => Promise<number[]>,
		enqueue: (locator: RecordLocator, op: 'index' | 'delete') => Promise<void>,
	): Promise<{ missing: number; orphan: number }> {
		const out = { missing: 0, orphan: 0 };
		if (!(await this.deps.config.sectionIsRagEnabled(sectionTipo))) return out;

		const matrixSet = new Set(await matrixIds());
		const vectorRows = await this.deps.store
			.listSectionIds(sectionTipo)
			.catch(() => [] as number[]);
		const vectorSet = new Set(vectorRows);

		for (const id of matrixSet) {
			if (!vectorSet.has(id)) {
				await enqueue({ sectionTipo, sectionId: id }, 'index');
				out.missing++;
			}
		}
		for (const id of vectorSet) {
			if (!matrixSet.has(id)) {
				await enqueue({ sectionTipo, sectionId: id }, 'delete');
				out.orphan++;
			}
		}
		return out;
	}

	/**
	 * Extract clean text per (component, lang). A translatable text component is
	 * extracted in each configured data lang; a non-translatable one only in nolan.
	 * Empty values are dropped (so an empty component prunes upstream).
	 */
	private async extract(
		locator: RecordLocator,
		componentTipos: readonly string[],
	): Promise<ExtractedUnit[]> {
		const matrixTable = (await this.deps.resolveMatrixTable(locator.sectionTipo)) ?? 'matrix';
		const out: ExtractedUnit[] = [];
		for (const componentTipo of componentTipos) {
			const model = await this.deps.ontology.getModelByTipo(componentTipo);
			if (model === null) continue;
			const translatable = await this.deps.ontology.getTranslatable(componentTipo);
			const langs =
				translatable && this.deps.langs.length > 0 ? this.deps.langs : [this.deps.nolan];
			for (const lang of langs) {
				const text = await this.deps
					.readText({
						matrixTable,
						componentTipo,
						model,
						sectionTipo: locator.sectionTipo,
						sectionId: locator.sectionId,
						lang,
					})
					.catch(() => '');
				if (text !== '') out.push({ componentTipo, lang, text });
			}
		}
		return out;
	}

	/** Best-effort record display label for the chunker's contextual header. */
	private async recordTitle(locator: RecordLocator): Promise<string> {
		try {
			return await this.deps.recordTitle(
				locator.sectionTipo,
				this.deps.langs[0] ?? this.deps.nolan,
			);
		} catch {
			return '';
		}
	}
}

/** The production vector-store bundle (functional exports as one object). */
export function defaultRagStore(): RagStore {
	return {
		diffHashes,
		upsertEmbeddingRows,
		deleteStale,
		deleteRecordModality,
		deleteRecord: storeDeleteRecord,
		listSectionIds,
	};
}

/**
 * Wire the production RagIndexer: ontology port + config over the resolver,
 * matrix-read text extraction, the deterministic/env-selected embedder, and the
 * live vector store. Data langs and nolan come from config (env-overridable).
 */
export function buildRagIndexer(): RagIndexer {
	const ontology = defaultOntologyPort();
	const langs = (readEnv('APPLICATION_LANGS', 'lg-spa,lg-cat,lg-eng') as string).split(',');
	const nolan = readEnv('DATA_NOLAN', 'lg-nolan') as string;
	return new RagIndexer({
		config: new RagConfig(ontology),
		provider: getEmbeddingProvider(),
		ontology,
		store: defaultRagStore(),
		langs,
		nolan,
		resolveMatrixTable: getMatrixTableFromTipo,
		readText: readComponentText,
		recordTitle: async (sectionTipo, lang) => (await getTermByTipo(sectionTipo, lang)) ?? '',
	});
}
