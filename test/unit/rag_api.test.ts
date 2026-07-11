import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ragApiActions } from '../../src/ai/rag/api.ts';
import { indexComponentText } from '../../src/ai/rag/retrieval.ts';
import { deleteRecordChunks } from '../../src/ai/rag/vector_store.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

/**
 * dd_rag_api handler tests (Brick 4). Exercises the four registered actions end
 * to end against the live pgvector + matrix DBs via the deterministic embedder,
 * and re-asserts the ACL DoD at the API layer: a denied principal gets NOTHING
 * from any action. RAG is enabled for this suite via process.env.
 */

// Enable the kill-switch BEFORE any handler runs (readEnv reads process.env).
process.env.DEDALO_RAG_ENABLED = 'true';

const SECTION_TIPO = 'test2';
const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };
const createdIds: number[] = [];

type Ctx = { session: { userId: number } | null; principal?: Principal };
const rqo = (options: Record<string, unknown>): Rqo => ({ options }) as unknown as Rqo;

beforeAll(async () => {
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
	// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
	delete process.env.DEDALO_RAG_ENABLED;
});

describe('dd_rag_api semantic_search', () => {
	test('superuser gets the vocabulary-matching record first', async () => {
		const res = await ragApiActions.semantic_search(
			rqo({ query: 'moneda de bronce con jinete ceca', limit: 5 }),
			{ principal: SUPERUSER } as Ctx,
		);
		expect(res.body.msg).toBe('ok');
		const hits = res.body.result as { section_id: number; snippet: string }[];
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0]!.section_id).toBe(createdIds[0]!);
		expect(hits[0]!.snippet).toContain('Abariltur');
	});

	test('a denied user gets NOTHING (DoD)', async () => {
		const res = await ragApiActions.semantic_search(
			rqo({ query: 'moneda de bronce con jinete ceca', limit: 5 }),
			{ principal: NO_ACCESS } as Ctx,
		);
		expect(res.body.result).toEqual([]);
	});

	test('missing query is rejected', async () => {
		const res = await ragApiActions.semantic_search(rqo({}), { principal: SUPERUSER } as Ctx);
		expect(res.body.result).toBe(false);
		expect(res.body.errors).toContain('missing_query');
	});
});

describe('dd_rag_api retrieve / get_agent_context', () => {
	test('retrieve returns passages with chunk_index', async () => {
		const res = await ragApiActions.retrieve(rqo({ query: 'barco fenicio ánforas', limit: 5 }), {
			principal: SUPERUSER,
		} as Ctx);
		expect(res.body.msg).toBe('ok');
		const passages = res.body.result as { section_id: number; chunk_index: number }[];
		expect(passages.length).toBeGreaterThan(0);
		expect(passages[0]!.chunk_index).toBe(0);
	});

	test('get_agent_context uses the agent_context message', async () => {
		const res = await ragApiActions.get_agent_context(
			rqo({ query: 'barco fenicio ánforas', limit: 5 }),
			{ principal: SUPERUSER } as Ctx,
		);
		expect(res.body.msg).toBe('agent_context');
	});

	test('a denied user gets NOTHING from retrieve (DoD)', async () => {
		const res = await ragApiActions.retrieve(rqo({ query: 'barco fenicio ánforas', limit: 5 }), {
			principal: NO_ACCESS,
		} as Ctx);
		expect(res.body.result).toEqual([]);
	});
});

describe('dd_rag_api similar_to', () => {
	test('finds the other record and excludes the seed', async () => {
		const res = await ragApiActions.similar_to(
			rqo({ section_tipo: SECTION_TIPO, section_id: createdIds[0], limit: 5 }),
			{ principal: SUPERUSER } as Ctx,
		);
		const hits = res.body.result as { section_id: number }[];
		expect(hits.every((h) => h.section_id !== createdIds[0])).toBe(true);
		expect(hits.some((h) => h.section_id === createdIds[1])).toBe(true);
	});

	test('a denied user gets NOTHING from similar_to (DoD)', async () => {
		const res = await ragApiActions.similar_to(
			rqo({ section_tipo: SECTION_TIPO, section_id: createdIds[0], limit: 5 }),
			{ principal: NO_ACCESS } as Ctx,
		);
		expect(res.body.result).toEqual([]);
	});

	test('missing seed is rejected', async () => {
		const res = await ragApiActions.similar_to(rqo({ section_tipo: SECTION_TIPO }), {
			principal: SUPERUSER,
		} as Ctx);
		expect(res.body.errors).toContain('missing_seed');
	});
});

describe('dd_rag_api kill-switch', () => {
	test('declines every action when DEDALO_RAG_ENABLED is off', async () => {
		process.env.DEDALO_RAG_ENABLED = '';
		try {
			const res = await ragApiActions.semantic_search(rqo({ query: 'x' }), {
				principal: SUPERUSER,
			} as Ctx);
			expect(res.body.result).toBe(false);
			expect(res.body.errors).toContain('rag_disabled');
		} finally {
			process.env.DEDALO_RAG_ENABLED = 'true';
		}
	});
});
