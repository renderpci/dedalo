/**
 * RAG vector store — greenfield TS access to the SEPARATE pgvector database
 * (spec §8; plan Phase 8). The store uses the SAME schema the PHP rag
 * subsystem installed (rag_embeddings, LIST-partitioned by model, pgvector +
 * unaccent + a lexical GIN index) so the two servers could share an index —
 * but the TS pipeline is a fresh implementation, not a port.
 *
 * Design:
 * - one row per CHUNK of one component's text on one record, keyed
 *   (section_tipo, section_id, component_tipo, lang, chunk_index, model,
 *   dimension) — re-indexing a record replaces its chunks;
 * - DENSE search: pgvector cosine distance over the query embedding;
 * - LEXICAL search: Postgres full-text (simple config + unaccent) over
 *   source_text via the GIN index;
 * - HYBRID: both run and merge via Reciprocal Rank Fusion in retrieval.ts.
 *
 * The store holds NO ACL logic — retrieval.ts gates every hit through the
 * same permission machinery as human reads (never expose the store directly).
 */

import { SQL } from 'bun';
import { config } from '../../config/config.ts';
import { readEnv } from '../../config/env.ts';
import { readString } from '../../config/readers.ts';
import type { Candidate, EmbeddingRow, RecordLocator } from './types.ts';

/**
 * Separate RAG database (never the matrix DB — vectors are rebuildable).
 * Connection facts default to the matrix DB server; the PHP rag-catalog keys
 * (DEDALO_RAG_DB_HOSTNAME_CONN / PORT / USERNAME / PASSWORD / SOCKET_CONN)
 * override them when the pgvector database lives on a DIFFERENT server.
 */
function buildRagSqlOptions(): ConstructorParameters<typeof SQL>[0] {
	const database = (readEnv('DEDALO_RAG_DB_NAME') ?? readString('RAG_DB_NAME')) as string;
	const socket = readString('DEDALO_RAG_DB_SOCKET_CONN');
	const host = (readEnv('DEDALO_RAG_DB_HOSTNAME_CONN') ?? config.db.host) as string;
	const portRaw = Number(readString('DEDALO_RAG_DB_PORT_CONN'));
	const port = Number.isFinite(portRaw) && portRaw > 0 ? Math.trunc(portRaw) : config.db.port;
	const user = (readEnv('DEDALO_RAG_DB_USERNAME_CONN') ?? config.db.user) as string;
	const password = (readEnv('DEDALO_RAG_DB_PASSWORD_CONN') ?? config.db.password) as string;
	const commonOptions = { database, username: user, password: password || undefined, max: 4 };
	if (socket !== '') {
		return { ...commonOptions, path: socket };
	}
	if (host.startsWith('/')) {
		return { ...commonOptions, path: `${host}/.s.PGSQL.${port}` };
	}
	return { ...commonOptions, hostname: host, port };
}

/** The RAG pool (module-level like the matrix pool — holds no request state). */
export const ragSql = new SQL(buildRagSqlOptions());

/** One chunk to store. */
export interface RagChunk {
	section_tipo: string;
	section_id: number;
	component_tipo: string;
	lang: string;
	chunk_index: number;
	source_text: string;
	source_hash: string;
	embedding: number[];
}

/** A retrieval hit before ACL gating. */
export interface RagHit {
	section_tipo: string;
	section_id: number;
	component_tipo: string;
	lang: string;
	chunk_index: number;
	source_text: string | null;
	/** Raw chunk_meta (jsonb) — carries `contributors` for group docs. */
	chunk_meta?: unknown;
	score: number;
}

/** Identifier grammar for the partition name derived from the model. */
function partitionNameFor(model: string): string {
	const slug = model.toLowerCase().replace(/[^a-z0-9]+/g, '_');
	return `rag_embeddings_${slug}`;
}

/**
 * Ensure the per-model LIST partition exists (the parent is partitioned BY
 * LIST (model); a new embedding model gets its own partition).
 */
export async function ensureModelPartition(model: string): Promise<void> {
	// INJ-05 guard: the partition-value literal is single-quote-escaped, but the
	// model must stay server/config-derived. Assert a safe grammar so a future
	// client-influenced model can never carry SQL into the DDL (which cannot take
	// a bind parameter). Embedding model ids are plain slugs (e.g. 'text-embedding-3-small').
	if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(model)) {
		throw new Error(`rag: refusing unsafe embedding model id '${model}' (partition DDL guard)`);
	}
	const partition = partitionNameFor(model);
	await ragSql.unsafe(
		`CREATE TABLE IF NOT EXISTS "${partition}" PARTITION OF rag_embeddings FOR VALUES IN ('${model.replace(/'/g, "''")}')`,
	);
}

/**
 * Replace one record's chunks for a provider/model (delete + insert — the
 * chunk set is derived state, atomically rebuilt per record).
 */
export async function replaceRecordChunks(
	provider: string,
	model: string,
	dimension: number,
	chunks: RagChunk[],
): Promise<void> {
	if (chunks.length === 0) return;
	await ensureModelPartition(model);
	const first = chunks[0] as RagChunk;
	await ragSql.begin(async (transaction) => {
		await transaction.unsafe(
			`DELETE FROM rag_embeddings
			 WHERE section_tipo = $1 AND section_id = $2 AND component_tipo = $3 AND model = $4`,
			[first.section_tipo, first.section_id, first.component_tipo, model],
		);
		for (const chunk of chunks) {
			await transaction.unsafe(
				`INSERT INTO rag_embeddings
					(section_tipo, section_id, component_tipo, lang, chunk_index,
					 provider, model, dimension, embedding, source_hash, source_text, token_count)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::vector,$10,$11,$12)`,
				[
					chunk.section_tipo,
					chunk.section_id,
					chunk.component_tipo,
					chunk.lang,
					chunk.chunk_index,
					provider,
					model,
					dimension,
					JSON.stringify(chunk.embedding),
					chunk.source_hash,
					chunk.source_text,
					chunk.source_text.split(/\s+/).length,
				],
			);
		}
	});
}

/** Remove every chunk of one record (record deletion hook). */
export async function deleteRecordChunks(sectionTipo: string, sectionId: number): Promise<void> {
	await ragSql.unsafe('DELETE FROM rag_embeddings WHERE section_tipo = $1 AND section_id = $2', [
		sectionTipo,
		sectionId,
	]);
}

/** DENSE search: cosine distance KNN for one model. Score = 1 - distance.
 * `componentTipo` narrows to one stored key (the `rag:<group>` facet filter);
 * `sectionTipos` is the SCOPE PUSHDOWN (2026-07-22) — without it scope was a
 * post-filter over a global top-K, and a section dominating the embedding
 * space starved scoped searches into false-empty results. */
export async function denseSearch(
	model: string,
	queryEmbedding: number[],
	limit: number,
	componentTipo?: string,
	sectionTipos?: readonly string[],
): Promise<RagHit[]> {
	const params: (string | number)[] = [JSON.stringify(queryEmbedding), model];
	let where = 'model = $2';
	if (componentTipo !== undefined) {
		params.push(componentTipo);
		where += ` AND component_tipo = $${params.length}`;
	}
	if (sectionTipos !== undefined && sectionTipos.length > 0) {
		// per-element placeholders — the queryDense idiom in this file
		const placeholders = sectionTipos.map((_, i) => `$${params.length + 1 + i}`).join(',');
		params.push(...sectionTipos);
		where += ` AND section_tipo IN (${placeholders})`;
	}
	params.push(limit);
	const rows = (await ragSql.unsafe(
		`SELECT section_tipo, section_id, component_tipo, lang, chunk_index, source_text, chunk_meta,
			1 - (embedding <=> $1::vector) AS score
		 FROM rag_embeddings
		 WHERE ${where}
		 ORDER BY embedding <=> $1::vector
		 LIMIT $${params.length}`,
		params,
	)) as RagHit[];
	return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

/** LEXICAL search over source_text (simple + unaccent, the installed GIN index).
 * `componentTipo` narrows to one stored key (the `rag:<group>` facet filter);
 * `sectionTipos` is the scope pushdown (see denseSearch). */
export async function lexicalSearch(
	query: string,
	limit: number,
	componentTipo?: string,
	sectionTipos?: readonly string[],
): Promise<RagHit[]> {
	const params: (string | number)[] = [query];
	let where = `to_tsvector('simple', f_unaccent(COALESCE(source_text, '')))
			@@ plainto_tsquery('simple', f_unaccent($1))`;
	if (componentTipo !== undefined) {
		params.push(componentTipo);
		where += ` AND component_tipo = $${params.length}`;
	}
	if (sectionTipos !== undefined && sectionTipos.length > 0) {
		// per-element placeholders — the queryDense idiom in this file
		const placeholders = sectionTipos.map((_, i) => `$${params.length + 1 + i}`).join(',');
		params.push(...sectionTipos);
		where += ` AND section_tipo IN (${placeholders})`;
	}
	params.push(limit);
	const rows = (await ragSql.unsafe(
		`SELECT section_tipo, section_id, component_tipo, lang, chunk_index, source_text, chunk_meta,
			ts_rank(
				to_tsvector('simple', f_unaccent(COALESCE(source_text, ''))),
				plainto_tsquery('simple', f_unaccent($1))
			) AS score
		 FROM rag_embeddings
		 WHERE ${where}
		 ORDER BY score DESC
		 LIMIT $${params.length}`,
		params,
	)) as RagHit[];
	return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

// ─────────────────────────── full-record indexer surface ───────────────────────────
// The richer EmbeddingRow-based methods used by the full-record RagIndexer
// (Brick 2). They write the full column set (modality, source_kind, egress_class,
// parent_key, chunk_meta) and diff by source_hash so unchanged chunks are never
// re-embedded. Vectors are bound as parameters, cast `::vector` — never
// interpolated. chunk_meta binds `$17::text::jsonb` (S1-08): a bare jsonb-typed
// param makes Bun 1.3.9 JSON-encode the already-stringified value AGAIN, landing
// a jsonb STRING scalar — PHP readers of the shared store then json_decode to a
// string and `$meta['view']`/`chunk_meta['thumb_url']` silently null. The
// parseChunkMeta string-tolerance branch below stays: it shields reads of any
// rows written before this fix (re-index repairs them). No ACL here — retrieval
// gates every read.

const UPSERT_ROW_SQL = `INSERT INTO rag_embeddings (
		section_tipo, section_id, component_tipo, lang, chunk_index,
		provider, model, dimension, embedding, source_hash, source_text,
		token_count, modality, source_kind, egress_class, parent_key, chunk_meta, updated_at
	) VALUES (
		$1,$2,$3,$4,$5,$6,$7,$8,$9::vector,$10,$11,$12,$13,$14,$15,$16,$17::text::jsonb,now()
	)
	ON CONFLICT (section_tipo, section_id, component_tipo, lang, chunk_index, model, dimension)
	DO UPDATE SET
		provider = EXCLUDED.provider,
		embedding = EXCLUDED.embedding,
		source_hash = EXCLUDED.source_hash,
		source_text = EXCLUDED.source_text,
		token_count = EXCLUDED.token_count,
		modality = EXCLUDED.modality,
		source_kind = EXCLUDED.source_kind,
		egress_class = EXCLUDED.egress_class,
		parent_key = EXCLUDED.parent_key,
		chunk_meta = EXCLUDED.chunk_meta,
		updated_at = now()`;

function upsertRowParams(row: EmbeddingRow): (string | number | null)[] {
	return [
		row.sectionTipo,
		row.sectionId,
		row.componentTipo,
		row.lang,
		row.chunkIndex,
		row.provider,
		row.model,
		row.dimension,
		JSON.stringify(row.embedding),
		row.sourceHash,
		row.sourceText,
		row.tokenCount,
		row.modality ?? 'text',
		row.sourceKind ?? 'text',
		row.egressClass ?? 'public',
		row.parentKey,
		row.chunkMeta !== null ? JSON.stringify(row.chunkMeta) : null,
	];
}

/** Idempotently provision a per-model partition + its typed column & HNSW index. */
export async function ensureModelPartitionTyped(model: string, dimension: number): Promise<void> {
	await ragSql.unsafe('SELECT rag_create_model_partition($1, $2)', [model, dimension]);
}

/**
 * Atomic flush: upsert every chunk of a record under ONE transaction — either
 * all rows land or none do. Ensures each row's model partition first. A failure
 * here never touches the matrix (separate DB/pool).
 */
export async function upsertEmbeddingRows(rows: EmbeddingRow[]): Promise<void> {
	if (rows.length === 0) return;
	const ensured = new Set<string>();
	await ragSql.begin(async (transaction) => {
		for (const row of rows) {
			const key = `${row.model}|${row.dimension}`;
			if (!ensured.has(key)) {
				await transaction.unsafe('SELECT rag_create_model_partition($1, $2)', [
					row.model,
					row.dimension,
				]);
				ensured.add(key);
			}
			await transaction.unsafe(UPSERT_ROW_SQL, upsertRowParams(row));
		}
	});
}

/**
 * Stored source_hash per chunk for a record under one model, keyed
 * "componentTipo|lang|chunkIndex". Drives the indexer's hash-diff (skip a chunk
 * whose recomputed hash matches). Model-scoped.
 */
export async function diffHashes(
	locator: RecordLocator,
	model: string,
): Promise<Map<string, string>> {
	const rows = (await ragSql.unsafe(
		`SELECT component_tipo, lang, chunk_index, source_hash
		 FROM rag_embeddings
		 WHERE section_tipo = $1 AND section_id = $2 AND model = $3`,
		[locator.sectionTipo, locator.sectionId, model],
	)) as {
		component_tipo: string;
		lang: string;
		chunk_index: number | string;
		source_hash: string | null;
	}[];
	const out = new Map<string, string>();
	for (const row of rows) {
		// source_hash is char(64) (fixed-length) — trim the space padding so the
		// stored value compares equal to a freshly computed hash of any length.
		out.set(
			`${row.component_tipo}|${row.lang}|${Number(row.chunk_index)}`,
			(row.source_hash ?? '').trimEnd(),
		);
	}
	return out;
}

/**
 * Prune chunks for one (component, lang, model) whose chunk_index >= validCount —
 * the tail left when a value shrank (validCount=0 removes all). Returns rows removed.
 */
export async function deleteStale(
	locator: RecordLocator,
	componentTipo: string,
	lang: string,
	model: string,
	validCount: number,
): Promise<number> {
	const rows = (await ragSql.unsafe(
		`DELETE FROM rag_embeddings
		 WHERE section_tipo = $1 AND section_id = $2 AND component_tipo = $3 AND lang = $4
		   AND model = $5 AND chunk_index >= $6
		 RETURNING section_id`,
		[locator.sectionTipo, locator.sectionId, componentTipo, lang, model, Math.max(0, validCount)],
	)) as unknown[];
	return rows.length;
}

/** Remove a record's chunks for one modality (e.g. clear 'text' when no text components remain). */
export async function deleteRecordModality(
	locator: RecordLocator,
	modality: string,
): Promise<void> {
	await ragSql.unsafe(
		'DELETE FROM rag_embeddings WHERE section_tipo = $1 AND section_id = $2 AND modality = $3',
		[locator.sectionTipo, locator.sectionId, modality],
	);
}

/** Remove every vector for a record (all models/modalities). */
export async function deleteRecord(locator: RecordLocator): Promise<void> {
	await deleteRecordChunks(locator.sectionTipo, locator.sectionId);
}

/** One stored raw vector of a record (used by similar_to / object retrieval). */
export interface StoredRecordVector {
	chunkIndex: number;
	view: string | null;
	sourceText: string;
	embedding: number[];
}

/**
 * A record's stored raw vectors for a model + modality — used by similar_to and
 * object retrieval to find neighbours WITHOUT re-embedding the seed. Ordered by
 * chunk_index; carries the chunk_meta.view + source_text (image context summary).
 * `componentTipo` narrows the SEED to one facet (`rag:<group>`).
 */
export async function getRecordVectors(
	locator: RecordLocator,
	model: string,
	modality = 'text',
	componentTipo?: string,
): Promise<StoredRecordVector[]> {
	const params: (string | number)[] = [locator.sectionTipo, locator.sectionId, model, modality];
	let where = 'section_tipo = $1 AND section_id = $2 AND model = $3 AND modality = $4';
	if (componentTipo !== undefined) {
		params.push(componentTipo);
		where += ` AND component_tipo = $${params.length}`;
	}
	const rows = (await ragSql.unsafe(
		`SELECT chunk_index, chunk_meta, source_text, embedding::text AS emb
		 FROM rag_embeddings
		 WHERE ${where}
		 ORDER BY chunk_index`,
		params,
	)) as {
		chunk_index: number | string;
		chunk_meta: unknown;
		source_text: string | null;
		emb: string | null;
	}[];
	return rows.map((row) => {
		const meta = parseChunkMeta(row.chunk_meta);
		return {
			chunkIndex: Number(row.chunk_index),
			view: meta && typeof meta.view === 'string' ? meta.view : null,
			sourceText: row.source_text ?? '',
			embedding: parseVectorText(row.emb ?? ''),
		};
	});
}

/** postgres jsonb arrives as an object; tolerate a string too. */
export function parseChunkMeta(raw: unknown): Record<string, unknown> | null {
	if (raw === null || raw === undefined) return null;
	if (typeof raw === 'object') return raw as Record<string, unknown>;
	if (typeof raw === 'string') {
		try {
			return JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * Cosine ANN over one model's partition returning rich Candidates (with modality +
 * chunk_meta + distance), optionally filtered by modality / section scope /
 * max-distance. The image path uses modality:'image'; text uses 'text'. No ACL
 * here — retrieval gates every hit.
 */
export async function queryDense(
	model: string,
	queryVector: number[],
	limit: number,
	filters: { sectionTipos?: string[]; modality?: string; maxDistance?: number | null } = {},
): Promise<Candidate[]> {
	const params: (string | number | null)[] = [JSON.stringify(queryVector), model];
	let where = 'model = $2';
	let next = 3;
	const modality = filters.modality ?? 'text';
	where += ` AND modality = $${next}`;
	params.push(modality);
	next++;
	if (filters.sectionTipos && filters.sectionTipos.length > 0) {
		const placeholders = filters.sectionTipos.map((_, i) => `$${next + i}`).join(',');
		where += ` AND section_tipo IN (${placeholders})`;
		params.push(...filters.sectionTipos);
		next += filters.sectionTipos.length;
	}
	let having = '';
	if (filters.maxDistance !== undefined && filters.maxDistance !== null) {
		having = ` AND (embedding <=> $1::vector) <= $${next}`;
		params.push(filters.maxDistance);
		next++;
	}
	params.push(Math.max(1, limit));
	const rows = (await ragSql.unsafe(
		`SELECT section_tipo, section_id, component_tipo, lang, chunk_index,
			source_text, source_kind, modality, egress_class, parent_key, chunk_meta,
			(embedding <=> $1::vector) AS distance
		 FROM rag_embeddings
		 WHERE ${where}${having}
		 ORDER BY embedding <=> $1::vector
		 LIMIT $${next}`,
		params,
	)) as RawCandidateRow[];
	return rows.map(toCandidate);
}

/** Lexical FTS over source_text returning rich Candidates, filterable by section/modality. */
export async function lexicalQuery(
	query: string,
	limit: number,
	filters: { sectionTipos?: string[]; modality?: string } = {},
): Promise<Candidate[]> {
	const params: (string | number)[] = [query];
	let where = `to_tsvector('simple', f_unaccent(COALESCE(source_text, ''))) @@ plainto_tsquery('simple', f_unaccent($1))`;
	let next = 2;
	if (filters.modality) {
		where += ` AND modality = $${next}`;
		params.push(filters.modality);
		next++;
	}
	if (filters.sectionTipos && filters.sectionTipos.length > 0) {
		const placeholders = filters.sectionTipos.map((_, i) => `$${next + i}`).join(',');
		where += ` AND section_tipo IN (${placeholders})`;
		params.push(...filters.sectionTipos);
		next += filters.sectionTipos.length;
	}
	params.push(Math.max(1, limit));
	const rows = (await ragSql.unsafe(
		`SELECT section_tipo, section_id, component_tipo, lang, chunk_index,
			source_text, source_kind, modality, egress_class, parent_key, chunk_meta,
			ts_rank(to_tsvector('simple', f_unaccent(COALESCE(source_text, ''))),
				plainto_tsquery('simple', f_unaccent($1))) AS lex_rank
		 FROM rag_embeddings
		 WHERE ${where}
		 ORDER BY lex_rank DESC
		 LIMIT $${next}`,
		params,
	)) as RawCandidateRow[];
	return rows.map(toCandidate);
}

interface RawCandidateRow {
	section_tipo: string;
	section_id: number | string;
	component_tipo: string;
	lang: string;
	chunk_index: number | string;
	source_text: string | null;
	source_kind: string | null;
	modality: string | null;
	egress_class: string | null;
	parent_key: string | null;
	chunk_meta: unknown;
	distance?: number | string;
	lex_rank?: number | string;
}

/** Map a raw DB row to a Candidate (shared by dense + lexical). */
function toCandidate(row: RawCandidateRow): Candidate {
	const candidate: Candidate = {
		sectionTipo: row.section_tipo,
		sectionId: Number(row.section_id),
		componentTipo: row.component_tipo,
		lang: row.lang,
		chunkIndex: Number(row.chunk_index),
		sourceText: row.source_text,
		sourceKind: row.source_kind,
		modality: row.modality,
		egressClass: row.egress_class,
		parentKey: row.parent_key,
		chunkMeta: parseChunkMeta(row.chunk_meta),
	};
	if (row.distance !== undefined) candidate.distance = Number(row.distance);
	if (row.lex_rank !== undefined) candidate.lexRank = Number(row.lex_rank);
	return candidate;
}

/** Parse a pgvector text literal '[a,b,c]' into a number[]. */
function parseVectorText(text: string): number[] {
	const trimmed = text.trim().replace(/^\[/, '').replace(/\]$/, '');
	if (trimmed === '') return [];
	return trimmed.split(',').map((value) => Number(value));
}

/** Distinct section_ids with at least one vector in a section (reconcile drift). */
export async function listSectionIds(sectionTipo: string): Promise<number[]> {
	const rows = (await ragSql.unsafe(
		'SELECT DISTINCT section_id FROM rag_embeddings WHERE section_tipo = $1',
		[sectionTipo],
	)) as { section_id: number | string }[];
	return rows.map((row) => Number(row.section_id));
}

/** Close the RAG pool (tests/shutdown). */
export async function closeRagPool(): Promise<void> {
	await ragSql.end();
}
