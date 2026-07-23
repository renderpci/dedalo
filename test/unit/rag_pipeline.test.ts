/**
 * Phase 8 gate: the TS RAG seam — index → hybrid retrieve → ACL.
 *
 * Runs fully OFFLINE via the deterministic hash embedder (no API keys): two
 * real records are created in the disposable test section, their texts
 * indexed into the pgvector store, then retrieved with the hybrid
 * (dense+lexical, RRF) search. The ACL gate is the DoD assertion: a user the
 * human API denies gets NOTHING from the same query. Everything created is
 * removed afterwards.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { type OntologyPort, RagConfig } from '../../src/ai/rag/config.ts';
import { resolveEmbedDocs } from '../../src/ai/rag/embed_source.ts';
import { getEmbeddingProvider } from '../../src/ai/rag/embedding_provider.ts';
import { RagIndexer, defaultRagStore } from '../../src/ai/rag/indexer.ts';
import { indexComponentText, semanticSearch } from '../../src/ai/rag/retrieval.ts';
import { deleteRecordChunks, ragSql } from '../../src/ai/rag/vector_store.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const SECTION_TIPO = 'test2';
const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

const createdIds: number[] = [];

beforeAll(async () => {
	// Two records with clearly different vocabularies.
	const coinId = await createSectionRecord(SECTION_TIPO, -1);
	const shipId = await createSectionRecord(SECTION_TIPO, -1);
	createdIds.push(coinId, shipId);

	await indexComponentText({
		section_tipo: SECTION_TIPO,
		section_id: coinId,
		component_tipo: 'numisdata16',
		lang: 'lg-spa',
		text: 'Moneda ibérica de bronce acuñada en la ceca de Abariltur, con jinete y leyenda ibérica.',
	});
	await indexComponentText({
		section_tipo: SECTION_TIPO,
		section_id: shipId,
		component_tipo: 'numisdata16',
		lang: 'lg-spa',
		text: 'Naufragio de un barco fenicio con ánforas de aceite frente a la costa de Cartagena.',
	});
});

afterAll(async () => {
	for (const id of createdIds) {
		await deleteRecordChunks(SECTION_TIPO, id);
		await cleanScratchRecord(SECTION_TIPO, id);
	}
	// Do NOT close the shared module-level ragSql pool here: other rag test files
	// in the same Bun process use it. Like the matrix `sql` pool, it is left to
	// process teardown. (Closing it mid-suite broke concurrently-running files.)
});

describe('RAG pipeline (Phase 8 gate — offline deterministic provider)', () => {
	test('hybrid retrieval ranks the vocabulary-matching record first', async () => {
		const coinHits = await semanticSearch(SUPERUSER, 'moneda de bronce con jinete ceca', 5);
		expect(coinHits.length).toBeGreaterThan(0);
		expect(coinHits[0]?.section_id).toBe(createdIds[0] as number);
		expect(coinHits[0]?.snippet).toContain('Abariltur');

		const shipHits = await semanticSearch(SUPERUSER, 'barco fenicio ánforas naufragio', 5);
		expect(shipHits.length).toBeGreaterThan(0);
		expect(shipHits[0]?.section_id).toBe(createdIds[1] as number);
	});

	test('a user the human API denies gets NOTHING from the same query (DoD)', async () => {
		const denied = await semanticSearch(NO_ACCESS, 'moneda de bronce con jinete ceca', 5);
		expect(denied).toEqual([]);
	});

	test('re-indexing a record replaces its chunks (no duplicates)', async () => {
		await indexComponentText({
			section_tipo: SECTION_TIPO,
			section_id: createdIds[0] as number,
			component_tipo: 'numisdata16',
			lang: 'lg-spa',
			text: 'Moneda ibérica de bronce acuñada en la ceca de Abariltur, con jinete y leyenda ibérica.',
		});
		const rows = (await ragSql.unsafe(
			'SELECT count(*)::int AS c FROM rag_embeddings WHERE section_tipo = $1 AND section_id = $2',
			[SECTION_TIPO, createdIds[0]],
		)) as { c: number }[];
		expect(rows[0]?.c).toBe(1); // one short text → one chunk, replaced not appended
	});
});

// ────────────────── embed-group pipeline (2026-07-22 descriptor) ──────────────────
//
// The FULL group path over REAL data: the canonical test3 playground record 1
// (matrix_test — test17 text_area + test52 input_text carry lorem-ipsum text) is
// indexed through the descriptor → resolveEmbedDocs (the REAL emitDdoData
// request_config resolution — the seam the virtual-section fix rides on) → the
// live store, then retrieved group-filtered and ACL-gated. This pins the bug the
// redesign fixed: the boolean-era selection indexed ZERO text for descriptor-
// driven sections. (Virtual-tipo keying itself is covered by getSectionMap's
// fallback + the live rsc205 e2e — no scratch dd_ontology writes from tests.)
//
// The SAME getEmbeddingProvider() drives index and search so both live in one
// model partition whichever provider the env selects (deterministic or sidecar).

const T3_SECTION = 'test3';
const T3_RECORD = 1;
const T3_GROUPS_RAW = {
	embed: [
		{
			id: 'card',
			ddo_map: [
				{ tipo: 'test52', section_tipo: 'self', mode: 'list' },
				{ tipo: 'test17', section_tipo: 'self', mode: 'list' },
			],
		},
	],
};

function t3Ontology(): OntologyPort {
	return {
		getProperties: async () => null,
		getModelByTipo: async () => null, // unused by the group path
		getTranslatable: async () => false, // unused (entryUsesLangs is embed_source's)
		getSectionMapRag: async (tipo: string) => (tipo === T3_SECTION ? T3_GROUPS_RAW : null),
	};
}

describe('RAG embed-group pipeline (descriptor → real ddo_map resolution → group retrieval)', () => {
	const ontology = t3Ontology();
	const indexer = new RagIndexer({
		ontology,
		config: new RagConfig(ontology),
		store: defaultRagStore(),
		provider: getEmbeddingProvider(),
		langs: ['lg-eng'],
		nolan: 'lg-nolan',
		resolveDocs: resolveEmbedDocs,
		recordTitle: async () => 'Test record',
	});

	afterAll(async () => {
		await deleteRecordChunks(T3_SECTION, T3_RECORD);
	});

	test('a descriptor-driven record indexes NON-ZERO group chunks (the boolean era indexed zero)', async () => {
		const ok = await indexer.indexRecord({ sectionTipo: T3_SECTION, sectionId: T3_RECORD });
		expect(ok).toBe(true);
		const rows = (await ragSql.unsafe(
			`SELECT component_tipo, count(*)::int AS c FROM rag_embeddings
			 WHERE section_tipo = $1 AND section_id = $2 GROUP BY 1`,
			[T3_SECTION, T3_RECORD],
		)) as { component_tipo: string; c: number }[];
		const card = rows.find((r) => r.component_tipo === 'rag:card');
		expect(card).toBeDefined();
		expect(card!.c).toBeGreaterThan(0);
	});

	test('group-filtered retrieval finds the record; a non-existent group finds nothing', async () => {
		const hits = await semanticSearch(
			SUPERUSER,
			'Lorem ipsum dolor sit amet',
			5,
			[T3_SECTION],
			'card',
		);
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0]?.section_id).toBe(T3_RECORD);
		expect(hits[0]?.component_tipo).toBe('rag:card');

		const none = await semanticSearch(
			SUPERUSER,
			'Lorem ipsum dolor sit amet',
			5,
			[T3_SECTION],
			'nope',
		);
		expect(none).toEqual([]);
	});

	test('DoD holds for group chunks: a denied user gets NOTHING (record-level gate)', async () => {
		const denied = await semanticSearch(
			NO_ACCESS,
			'Lorem ipsum dolor sit amet',
			5,
			[T3_SECTION],
			'card',
		);
		expect(denied).toEqual([]);
	});
});
