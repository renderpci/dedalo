/**
 * RAG indexing + ACL-GATED hybrid retrieval (spec §8; DoD: "AI tools denied
 * exactly where humans are denied").
 *
 * INDEX: a record's component text → chunks → embeddings → the vector store
 * (replace-per-record). Chunking is structure-aware and semantic (see
 * chunker.ts); the header-enriched embed text is embedded while the clean text
 * is stored for citation.
 *
 * RETRIEVE (hybrid): dense (pgvector cosine) + lexical (Postgres FTS) run in
 * parallel and merge via Reciprocal Rank Fusion; every merged hit then passes
 * the SAME authorization the human API applies before it is returned:
 * 1. schema ACL — getPermissions(principal, section_tipo, component_tipo) >= 1;
 * 2. per-record projects ACL — a principal-scoped existence search
 *    (buildSearchSql with filter_by_locators), so a non-admin outside the
 *    record's project scope never sees the hit — or even that it exists.
 */

import { sanitizeClientSqo } from '../../core/concepts/sqo.ts';
import { sql } from '../../core/db/postgres.ts';
import { assertValidTipo } from '../../core/search/identifier_gate.ts';
import { buildSearchSql } from '../../core/search/sql_assembler.ts';
import { type Principal, getPermissions } from '../../core/security/permissions.ts';
import { type ChunkOpts, chunk } from './chunker.ts';
import { RAG_GROUP_PREFIX } from './config.ts';
import { getEmbeddingProvider } from './embedding_provider.ts';
import { collapseToRecords, fuse } from './fusion.ts';
import type { Candidate } from './types.ts';
import {
	type RagChunk,
	type RagHit,
	denseSearch,
	getRecordVectors,
	lexicalSearch,
	parseChunkMeta,
	replaceRecordChunks,
} from './vector_store.ts';

/** A store hit → fusion Candidate (fills provenance the store doesn't carry). */
function hitToCandidate(hit: RagHit): Candidate {
	return {
		sectionTipo: hit.section_tipo,
		sectionId: hit.section_id,
		componentTipo: hit.component_tipo,
		lang: hit.lang,
		chunkIndex: hit.chunk_index,
		sourceText: hit.source_text,
		sourceKind: null,
		modality: null,
		egressClass: null,
		parentKey: null,
		chunkMeta: parseChunkMeta(hit.chunk_meta),
	};
}

/** The stored key of a group facet — `rag:<group>` (validated at the API layer). */
function groupStorageTipo(group: string | undefined): string | undefined {
	return group === undefined ? undefined : `${RAG_GROUP_PREFIX}${group}`;
}

/**
 * The distinct section tipos that CONTRIBUTED text to a group chunk (from
 * chunk_meta.contributors, written by the indexer). Empty for pre-group chunks.
 */
export function contributorSectionTipos(chunkMeta: Record<string, unknown> | null): string[] {
	const raw = chunkMeta?.contributors;
	if (!Array.isArray(raw)) return [];
	const out = new Set<string>();
	for (const entry of raw) {
		const tipos = (entry as { sectionTipos?: unknown } | null)?.sectionTipos;
		if (!Array.isArray(tipos)) continue;
		for (const tipo of tipos) {
			if (typeof tipo === 'string' && tipo !== '') out.add(tipo);
		}
	}
	return [...out];
}

/**
 * The host-section COMPONENT tipos that composed a group chunk (the top-level
 * ddo entries of the group, from chunk_meta.contributors). Each is a component
 * of the chunk's host section, so it gates via getPermissions(principal,
 * sectionTipo, componentTipo) — the per-ddo parity of the human read
 * (ddoIsAuthorized). Empty for pre-group / image-path chunks. RAG-01.
 */
export function contributorComponentTipos(chunkMeta: Record<string, unknown> | null): string[] {
	const raw = chunkMeta?.contributors;
	if (!Array.isArray(raw)) return [];
	const out = new Set<string>();
	for (const entry of raw) {
		const tipo = (entry as { componentTipo?: unknown } | null)?.componentTipo;
		if (typeof tipo === 'string' && tipo !== '') out.add(tipo);
	}
	return [...out];
}

/**
 * Index one component's text of one record: structure-aware chunk → embed →
 * replace in store. The header-enriched `embedText` is what gets embedded; the
 * clean `text` is stored for citation. Returns the number of chunks written.
 */
export async function indexComponentText(input: {
	section_tipo: string;
	section_id: number;
	component_tipo: string;
	lang: string;
	text: string;
	chunkOpts?: ChunkOpts;
}): Promise<number> {
	const sectionTipo = assertValidTipo(input.section_tipo, 'rag.index.section_tipo');
	const componentTipo = assertValidTipo(input.component_tipo, 'rag.index.component_tipo');
	const provider = getEmbeddingProvider();
	const pieces = chunk(input.text, input.chunkOpts);
	if (pieces.length === 0) return 0;
	const embeddings = await provider.embed(pieces.map((piece) => piece.embedText));
	const chunks: RagChunk[] = pieces.map((piece, index) => ({
		section_tipo: sectionTipo,
		section_id: input.section_id,
		component_tipo: componentTipo,
		lang: input.lang,
		chunk_index: piece.chunkIndex,
		source_text: piece.text,
		source_hash: piece.sourceHash,
		embedding: embeddings[index] as number[],
	}));
	await replaceRecordChunks(provider.name, provider.model, provider.dimension, chunks);
	return chunks.length;
}

export interface RagSearchHit {
	section_tipo: string;
	section_id: number;
	component_tipo: string;
	lang: string;
	snippet: string | null;
	score: number;
	/** Section tipos whose text CONTRIBUTED to this chunk (deep resolution).
	 * The agent egress gate checks these beside the host section — a group
	 * chunk's snippet carries deep-resolved text from OTHER sections, so the
	 * host-only check alone would leak a forbidden section's text through a
	 * public host record (sec review 4a, 2026-07-22). Empty for pre-group and
	 * image-path chunks. */
	contributors?: string[];
}

/** A passage-level hit (retrieve / get_agent_context) — carries the chunk index. */
export interface RagPassageHit extends RagSearchHit {
	chunk_index: number;
	/** Section tipos whose text CONTRIBUTED to this chunk (deep resolution) — the
	 * ask-path egress gate checks these beside the host section. Absent on
	 * pre-group chunks and test fakes. */
	contributors?: string[];
}

/**
 * The ACL gate — the single security chokepoint (module header). Filters ordered
 * candidates to those the principal may read, up to `limit`, memoising both the
 * schema ACL (per section|component) and the per-record projects ACL. Optionally
 * narrows to a `scope` of section tipos first (a relevance filter, not security).
 */
async function aclGate(
	principal: Principal,
	candidates: Candidate[],
	limit: number,
	scope?: string[],
): Promise<Candidate[]> {
	const scopeSet = scope && scope.length > 0 ? new Set(scope) : null;
	const out: Candidate[] = [];
	const schemaLevel = new Map<string, number>();
	const recordVisible = new Map<string, boolean>();
	for (const candidate of candidates) {
		if (out.length >= limit) break;
		if (scopeSet !== null && !scopeSet.has(candidate.sectionTipo)) continue;
		// 1. Schema ACL (RAG-01). A `rag:<group>` chunk is composed at INDEX time
		//    under the SYSTEM principal (embed_source.ts), so it embeds the text of
		//    EVERY component in the group's ddo_map — INCLUDING components this role
		//    holds level 0 on. A section-only gate (the pre-fix behavior) let a
		//    record-authorized user match, and receive the snippet of, a component
		//    hidden from their own edit form. So gate a group chunk at COMPONENT
		//    level, per contributing component — the exact parity of the human
		//    read's per-ddo ddoIsAuthorized: require the section read grant AND ≥1
		//    on every host-section component that fed the chunk; drop on any level
		//    0. Contributors are always written by the indexer for a stored group
		//    chunk (a doc with no harvested text is never indexed), so an empty set
		//    is anomalous → fail CLOSED. A per-component (image-path) chunk keeps
		//    its single component-level gate.
		const isGroupChunk = candidate.componentTipo.startsWith(RAG_GROUP_PREFIX);
		const gateTipos = isGroupChunk
			? contributorComponentTipos(candidate.chunkMeta)
			: [candidate.componentTipo];
		if (isGroupChunk && gateTipos.length === 0) continue; // fail closed
		// A group chunk additionally requires the section read grant beside its
		// components (the human read shows the record only when section ≥ 1).
		const requiredTipos = isGroupChunk ? [candidate.sectionTipo, ...gateTipos] : gateTipos;
		let blocked = false;
		for (const gateTipo of requiredTipos) {
			const schemaKey = `${candidate.sectionTipo}|${gateTipo}`;
			let level = schemaLevel.get(schemaKey);
			if (level === undefined) {
				level = await getPermissions(principal, candidate.sectionTipo, gateTipo);
				schemaLevel.set(schemaKey, level);
			}
			if (level < 1) {
				blocked = true;
				break;
			}
		}
		if (blocked) continue;
		// 2. Per-record projects ACL — principal-scoped existence check.
		const recordKey = `${candidate.sectionTipo}|${candidate.sectionId}`;
		let visible = recordVisible.get(recordKey);
		if (visible === undefined) {
			visible = await recordVisibleToPrincipal(
				principal,
				candidate.sectionTipo,
				candidate.sectionId,
			);
			recordVisible.set(recordKey, visible);
		}
		if (!visible) continue;
		out.push(candidate);
	}
	return out;
}

/**
 * Filter candidates to those the principal may read (schema ACL + per-record
 * projects ACL), preserving order and keeping ALL accessible ones (no cap). The
 * reusable chokepoint for the object-retrieval / characterizer paths.
 */
export async function aclFilterCandidates(
	principal: Principal,
	candidates: Candidate[],
	scope?: string[],
): Promise<Candidate[]> {
	return aclGate(principal, candidates, candidates.length, scope);
}

/** Per-record projects-ACL existence check (never an existence oracle). */
async function recordVisibleToPrincipal(
	principal: Principal,
	sectionTipo: string,
	sectionId: number,
): Promise<boolean> {
	const scopeSqo = sanitizeClientSqo({
		section_tipo: [sectionTipo],
		filter_by_locators: [{ section_tipo: sectionTipo, section_id: String(sectionId) }],
		limit: 1,
	});
	const scopeQuery = await buildSearchSql(scopeSqo, {
		principal: principal.isGlobalAdmin ? undefined : principal,
	});
	const rows = (await sql.unsafe(
		scopeQuery.sql,
		scopeQuery.params as (string | number | null)[],
	)) as unknown[];
	return rows.length > 0;
}

function toSearchHit(candidate: Candidate): RagSearchHit {
	return {
		section_tipo: candidate.sectionTipo,
		section_id: candidate.sectionId,
		component_tipo: candidate.componentTipo,
		lang: candidate.lang,
		snippet: candidate.sourceText,
		score: candidate.rrfScore ?? candidate.score ?? 0,
		contributors: contributorSectionTipos(candidate.chunkMeta),
	};
}

/** Run the hybrid (dense+lexical) legs and fuse them into ranked candidates.
 * `group` narrows both legs to one facet's chunks (`rag:<group>`); `scope` is
 * PUSHED DOWN into both store legs (2026-07-22) — as a post-filter only, a
 * dominant section starved scoped searches into false-empty results. The
 * aclGate still re-applies scope (harmless) and the full ACL. */
async function hybridCandidates(
	query: string,
	overFetch: number,
	group?: string,
	scope?: string[],
): Promise<Candidate[]> {
	const provider = getEmbeddingProvider();
	const [queryEmbedding] = await provider.embed([query]);
	const facetTipo = groupStorageTipo(group);
	const [dense, lexical] = await Promise.all([
		denseSearch(provider.model, queryEmbedding as number[], overFetch, facetTipo, scope),
		lexicalSearch(query, overFetch, facetTipo, scope),
	]);
	return fuse([dense.map(hitToCandidate), lexical.map(hitToCandidate)]);
}

/**
 * Hybrid semantic search, ACL-gated, returning the best RECORD per hit. `limit`
 * caps the returned records; both retrievers over-fetch to survive the ACL filter.
 * `group` scopes the search to one embed facet ("only transcriptions").
 */
export async function semanticSearch(
	principal: Principal,
	query: string,
	limit = 10,
	scope?: string[],
	group?: string,
): Promise<RagSearchHit[]> {
	const fused = await hybridCandidates(query, Math.max(limit * 4, 20), group, scope);
	const records = collapseToRecords(fused, 'rrfScore');
	const gated = await aclGate(principal, records, limit, scope);
	return gated.map(toSearchHit);
}

/**
 * Hybrid retrieval returning PASSAGES (chunks, not collapsed) — the grounding
 * context for retrieve / get_agent_context / ask. ACL-gated per passage.
 */
export async function retrievePassages(
	principal: Principal,
	query: string,
	limit = 10,
	scope?: string[],
	group?: string,
): Promise<RagPassageHit[]> {
	const fused = await hybridCandidates(query, Math.max(limit * 4, 20), group, scope);
	const gated = await aclGate(principal, fused, limit, scope);
	return gated.map((candidate) => ({
		...toSearchHit(candidate), // carries contributors
		chunk_index: candidate.chunkIndex,
	}));
}

/**
 * Records visually/semantically similar to a SEED record: fetch the seed's stored
 * vectors, ANN each (excluding the seed), fuse, collapse to records, ACL-gate.
 * No re-embedding — uses the stored vectors. `group` narrows BOTH the seed's
 * vectors and the neighbours to one facet ("similar by profession").
 */
export async function similarTo(
	principal: Principal,
	sectionTipo: string,
	sectionId: number,
	limit = 10,
	scope?: string[],
	group?: string,
): Promise<RagSearchHit[]> {
	const provider = getEmbeddingProvider();
	const facetTipo = groupStorageTipo(group);
	const seedVectors = await getRecordVectors(
		{ sectionTipo, sectionId },
		provider.model,
		'text',
		facetTipo,
	);
	if (seedVectors.length === 0) return [];
	const overFetch = Math.max(limit * 4, 20);
	// scope pushdown (devil #5): without it the neighbours are the GLOBAL
	// nearest and a dominant section starves the scoped ones out of the top-K.
	const perVector = await Promise.all(
		seedVectors.map((vector) =>
			denseSearch(provider.model, vector.embedding, overFetch + 1, facetTipo, scope),
		),
	);
	const lists = perVector.map((hits) =>
		hits
			.map(hitToCandidate)
			// exclude the seed record itself
			.filter((c) => !(c.sectionTipo === sectionTipo && c.sectionId === sectionId)),
	);
	const fused = fuse(lists);
	const records = collapseToRecords(fused, 'rrfScore');
	const gated = await aclGate(principal, records, limit, scope);
	return gated.map(toSearchHit);
}
