import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ragApiActions } from '../../src/ai/rag/api.ts';
import {
	RagCharacterizer,
	aggregateCategorical,
	summarizeDates,
} from '../../src/ai/rag/characterizer.ts';
import { cosineDistance } from '../../src/ai/rag/chunker.ts';
import {
	DeterministicMultimodalProvider,
	extractVectors,
} from '../../src/ai/rag/multimodal_embedding_provider.ts';
import { ObjectRetrieval } from '../../src/ai/rag/object_retrieval.ts';
import type { Candidate, EmbeddingRow, RecordLocator } from '../../src/ai/rag/types.ts';
import { deleteRecordChunks, ragSql, upsertEmbeddingRows } from '../../src/ai/rag/vector_store.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

/**
 * Multimodal RAG (Brick 5): the deterministic joint provider, the pure
 * characterizer aggregators, and the object-retrieval + dd_rag_api image actions
 * against the live pgvector DB with directly-seeded image vectors (image INGEST
 * via the media extractor is the ledgered, separately-wired boundary).
 */

process.env.DEDALO_RAG_ENABLED = 'true';
process.env.DEDALO_RAG_MEDIA_ENABLED = 'true';

const SECTION_TIPO = 'test2';
const MODEL = 'deterministic-multimodal'; // buildMultimodalProvider default (no endpoint)
const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };
const provider = new DeterministicMultimodalProvider({ model: MODEL, dimension: 64 });
const createdIds: number[] = [];

type Ctx = { session: { userId: number } | null; principal?: Principal };
const rqo = (options: Record<string, unknown>) => ({ options }) as never;

async function seedImage(sectionId: number, caption: string, view: string): Promise<void> {
	const base64 = Buffer.from(caption).toString('base64');
	const [embedding] = await provider.embedImage([base64]);
	const row: EmbeddingRow = {
		sectionTipo: SECTION_TIPO,
		sectionId,
		componentTipo: 'rsc29',
		lang: 'lg-nolan',
		chunkIndex: 0,
		provider: 'local',
		model: MODEL,
		dimension: 64,
		embedding: embedding as number[],
		sourceHash: `img_${sectionId}`,
		sourceText: caption,
		tokenCount: null,
		modality: 'image',
		sourceKind: 'image_visual',
		egressClass: 'public',
		parentKey: `${SECTION_TIPO}_${sectionId}`,
		chunkMeta: { view, thumb_url: `/thumb/${sectionId}.jpg`, media_tipo: 'rsc29' },
	};
	await upsertEmbeddingRows([row]);
}

beforeAll(async () => {
	const a = await createSectionRecord(SECTION_TIPO, -1);
	const b = await createSectionRecord(SECTION_TIPO, -1);
	createdIds.push(a, b);
	// Overlapping captions ("roman bronze coin") → the two objects are neighbours.
	await seedImage(a, 'roman bronze coin obverse laureate head emperor', 'obverse');
	await seedImage(b, 'roman bronze coin reverse eagle standard legionary', 'reverse');
});

afterAll(async () => {
	for (const id of createdIds) {
		await deleteRecordChunks(SECTION_TIPO, id);
		await cleanScratchRecord(SECTION_TIPO, id);
	}
	await ragSql
		.unsafe(`DROP TABLE IF EXISTS "rag_embeddings_${MODEL.replace(/[^a-z0-9]+/g, '_')}"`)
		.catch(() => {});
	// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
	delete process.env.DEDALO_RAG_ENABLED;
	// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
	delete process.env.DEDALO_RAG_MEDIA_ENABLED;
});

describe('DeterministicMultimodalProvider (joint space)', () => {
	test('identical input → identical vector; shared tokens → high similarity', () => {
		expect(provider.vectorFor('roman bronze coin', 'img')).toEqual(
			provider.vectorFor('roman bronze coin', 'img'),
		);
		// text query through the joint tower is near an image sharing tokens.
		const imgVec = provider.vectorFor('roman bronze coin obverse', 'img');
		const txtVec = provider.vectorFor('roman bronze coin', 'txt');
		const distinct = provider.vectorFor('marble statue greek', 'txt');
		expect(cosineDistance(imgVec, txtVec)).toBeLessThan(cosineDistance(imgVec, distinct));
	});

	test('extractVectors normalises both response shapes; rejects malformed', () => {
		expect(
			extractVectors({
				embeddings: [
					[1, 2],
					[3, 4],
				],
			}),
		).toEqual([
			[1, 2],
			[3, 4],
		]);
		expect(extractVectors({ data: [{ embedding: [5, 6] }] })).toEqual([[5, 6]]);
		expect(extractVectors({ embeddings: [[1, 'x']] })).toEqual([]);
		expect(extractVectors({})).toEqual([]);
	});
});

describe('characterizer aggregators (pure)', () => {
	const cat = (value: string, weight: number) => ({
		value,
		weight,
		sectionTipo: 's',
		sectionId: 1,
		thumbUrl: null,
	});
	test('aggregateCategorical: similarity-weighted vote + confidence share', () => {
		const result = aggregateCategorical([
			cat('denarius', 0.9),
			cat('denarius', 0.6),
			cat('as', 0.3),
		]);
		expect(result.proposal).toBe('denarius');
		expect(result.confidence).toBeCloseTo(1.5 / 1.8, 4);
		expect(result.distribution[0]!.value).toBe('denarius');
	});
	test('summarizeDates: earliest…latest + confidence from midpoint spread', () => {
		const d = (from: number, to: number, label: string, weight: number) => ({
			from,
			to,
			label,
			weight,
			sectionTipo: 's',
			sectionId: 1,
			thumbUrl: null,
		});
		const result = summarizeDates([d(100, 100, '100 AD', 1), d(200, 200, '200 AD', 1)]);
		expect(result.proposal.earliest).toBe('100 AD');
		expect(result.proposal.latest).toBe('200 AD');
		expect(result.confidence).toBeGreaterThanOrEqual(0);
	});
});

describe('RagCharacterizer (injected fakes, no DB)', () => {
	test('aggregates neighbours via their own context metadata', async () => {
		const neighbours: Candidate[] = [
			{
				sectionTipo: SECTION_TIPO,
				sectionId: 2,
				componentTipo: 'rsc29',
				lang: 'lg-nolan',
				chunkIndex: 0,
				sourceText: null,
				sourceKind: 'image_visual',
				modality: 'image',
				egressClass: 'public',
				parentKey: null,
				chunkMeta: { thumb_url: '/t/2.jpg' },
				rrfScore: 0.9,
			},
		];
		const characterizer = new RagCharacterizer({
			config: {
				getCompareScope: async () => [SECTION_TIPO],
				getContextMetadata: async () => ({ typology: 'rsc40' }),
			},
			objectRetrieval: { findSimilarObjects: async () => neighbours },
			roleReader: async () => ({ kind: 'categorical', value: 'denarius' }),
		});
		const result = await characterizer.characterize(SUPERUSER, {
			sectionTipo: SECTION_TIPO,
			sectionId: 1,
		} as RecordLocator);
		expect(result.neighboursConsidered).toBe(1);
		const typology = result.proposals.typology;
		expect(typology?.kind).toBe('categorical');
		expect((typology as { proposal: string }).proposal).toBe('denarius');
	});

	test('M3: a role component the caller cannot read yields NO proposal (no cross-component leak)', async () => {
		const neighbours: Candidate[] = [
			{
				sectionTipo: SECTION_TIPO,
				sectionId: 2,
				componentTipo: 'rsc29',
				lang: 'lg-nolan',
				chunkIndex: 0,
				sourceText: null,
				sourceKind: 'image_visual',
				modality: 'image',
				egressClass: 'public',
				parentKey: null,
				chunkMeta: { thumb_url: '/t/2.jpg' },
				rrfScore: 0.9,
			},
		];
		const characterizer = new RagCharacterizer({
			config: {
				getCompareScope: async () => [SECTION_TIPO],
				getContextMetadata: async () => ({ typology: 'rsc40' }),
			},
			// The neighbour list is (in production) ACL-filtered on the image component;
			// the fake returns it regardless so we isolate the role-component gate.
			objectRetrieval: { findSimilarObjects: async () => neighbours },
			// The reader would happily return a value — the gate must stop us BEFORE it.
			roleReader: async () => ({ kind: 'categorical', value: 'denarius' }),
		});
		// NO_ACCESS (no profile) has level 0 on rsc40 in the non-public test section.
		const result = await characterizer.characterize(NO_ACCESS, {
			sectionTipo: SECTION_TIPO,
			sectionId: 1,
		} as RecordLocator);
		expect(result.neighboursConsidered).toBe(1); // neighbour retrieved…
		expect(result.proposals.typology).toBeUndefined(); // …but its restricted role is withheld
	});
});

describe('ObjectRetrieval (live pgvector, seeded image vectors)', () => {
	test('findSimilarObjects returns the other object, excluding the seed', async () => {
		const objectRetrieval = new ObjectRetrieval(provider);
		const hits = await objectRetrieval.findSimilarObjects(
			SUPERUSER,
			{ sectionTipo: SECTION_TIPO, sectionId: createdIds[0]! } as RecordLocator,
			{ sectionTipos: [SECTION_TIPO], mode: 'visual', topK: 5 },
		);
		expect(hits.every((h) => h.sectionId !== createdIds[0])).toBe(true);
		expect(hits.some((h) => h.sectionId === createdIds[1])).toBe(true);
	});

	test('a denied user gets NOTHING (DoD)', async () => {
		const objectRetrieval = new ObjectRetrieval(provider);
		const hits = await objectRetrieval.findSimilarObjects(
			NO_ACCESS,
			{ sectionTipo: SECTION_TIPO, sectionId: createdIds[0]! } as RecordLocator,
			{ sectionTipos: [SECTION_TIPO], mode: 'visual', topK: 5 },
		);
		expect(hits).toEqual([]);
	});
});

describe('dd_rag_api image actions', () => {
	test('similar_objects returns shaped objects with similarity + thumb_url', async () => {
		const res = await ragApiActions.similar_objects(
			rqo({
				section_tipo: SECTION_TIPO,
				section_id: createdIds[0],
				similarity_mode: 'visual',
				limit: 5,
			}),
			{ principal: SUPERUSER } as Ctx,
		);
		expect(res.body.msg).toBe('ok');
		const hits = res.body.result as { section_id: number; thumb_url: string | null }[];
		expect(hits.some((h) => h.section_id === createdIds[1])).toBe(true);
		expect(hits[0]!.thumb_url).toContain('/thumb/');
	});

	test('search_by_text_image finds objects whose caption shares tokens', async () => {
		const res = await ragApiActions.search_by_text_image(
			rqo({ query: 'roman bronze coin', section_tipo: [SECTION_TIPO], limit: 5 }),
			{ principal: SUPERUSER } as Ctx,
		);
		expect(res.body.msg).toBe('ok');
		const hits = res.body.result as { section_id: number }[];
		expect(hits.length).toBeGreaterThan(0);
	});

	test('characterize_object returns a proposals envelope', async () => {
		const res = await ragApiActions.characterize_object(
			rqo({ section_tipo: SECTION_TIPO, section_id: createdIds[0], limit: 5 }),
			{ principal: SUPERUSER } as Ctx,
		);
		expect(res.body.msg).toBe('ok');
		expect(res.body.result).toHaveProperty('neighboursConsidered');
	});

	test('image actions decline when media is disabled', async () => {
		process.env.DEDALO_RAG_MEDIA_ENABLED = '';
		try {
			const res = await ragApiActions.search_by_text_image(rqo({ query: 'x' }), {
				principal: SUPERUSER,
			} as Ctx);
			expect(res.body.errors).toContain('media_disabled');
		} finally {
			process.env.DEDALO_RAG_MEDIA_ENABLED = 'true';
		}
	});
});
