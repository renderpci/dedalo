import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ragApiActions } from '../../src/ai/rag/api.ts';
import { type AskDeps, RESTRICTED_MSG, fitTokenBudget, runAsk } from '../../src/ai/rag/ask.ts';
import { StubLlmProvider } from '../../src/ai/rag/llm_provider.ts';
import { PassThroughReranker } from '../../src/ai/rag/reranker.ts';
import { type RagPassageHit, indexComponentText } from '../../src/ai/rag/retrieval.ts';
import { deleteRecordChunks } from '../../src/ai/rag/vector_store.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

/**
 * ask grounded-Q&A pipeline (Brick 5). Runs offline via the deterministic embedder
 * + stub LLM against the live DBs. Asserts the load-bearing invariants: grounded
 * answer + citations; the grounding gate refuses with NO model call; token-budget
 * keeps ≥1 passage; an LLM transport failure maps to generation_failed.
 */

process.env.DEDALO_RAG_ENABLED = 'true';

const SECTION_TIPO = 'test2';
const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };
const createdIds: number[] = [];

type Ctx = { session: { userId: number } | null; principal?: Principal };
const askRqo = (options: Record<string, unknown>) => ({ options }) as never;

const passage = (over: Partial<RagPassageHit> = {}): RagPassageHit => ({
	section_tipo: 'test2',
	section_id: 1,
	component_tipo: 'numisdata16',
	lang: 'lg-spa',
	chunk_index: 0,
	snippet: 'x'.repeat(40),
	score: 1,
	...over,
});

const baseDeps = (llm: AskDeps['llm']): AskDeps => ({
	llm,
	reranker: new PassThroughReranker(),
	egress: async () => 'restricted' as const,
	systemPrompt: async () => 'system prompt',
});

beforeAll(async () => {
	const coinId = await createSectionRecord(SECTION_TIPO, -1);
	createdIds.push(coinId);
	await indexComponentText({
		section_tipo: SECTION_TIPO,
		section_id: coinId,
		component_tipo: 'numisdata16',
		lang: 'lg-spa',
		text: 'Moneda ibérica de bronce acuñada en la ceca de Abariltur, con jinete y leyenda ibérica.',
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

describe('fitTokenBudget', () => {
	test('keeps at least the top passage even when it exceeds the budget', () => {
		const kept = fitTokenBudget([passage(), passage({ chunk_index: 1 })], 'sys', 'q', 0);
		expect(kept.length).toBe(1);
	});
	test('empty passages → empty', () => {
		expect(fitTokenBudget([], 'sys', 'q', 100)).toEqual([]);
	});
});

describe('runAsk grounding gate', () => {
	test('a denied principal refuses WITHOUT calling the LLM', async () => {
		const stub = new StubLlmProvider();
		const result = await runAsk(
			{ principal: NO_ACCESS, query: 'moneda de bronce', sectionTipos: [SECTION_TIPO], topK: 5 },
			baseDeps(stub),
		);
		expect(result.grounded).toBe(false);
		expect(result.answer).toBe('');
		expect(stub.calls.length).toBe(0); // NO model call on refusal
	});

	test('an LLM transport failure propagates (caller maps to generation_failed)', async () => {
		const throwing: AskDeps['llm'] = {
			model: () => 'boom',
			generate: async () => {
				throw new Error('boom');
			},
		};
		await expect(
			runAsk(
				{ principal: SUPERUSER, query: 'moneda de bronce', sectionTipos: [SECTION_TIPO], topK: 5 },
				baseDeps(throwing),
			),
		).rejects.toThrow();
	});
});

describe('runAsk egress gate', () => {
	test('a restricted passage BLOCKS an external provider (no generate call, restricted refusal)', async () => {
		const external = new StubLlmProvider(); // stands in for the off-box provider
		const result = await runAsk(
			{ principal: SUPERUSER, query: 'moneda de bronce', sectionTipos: [SECTION_TIPO], topK: 5 },
			{ ...baseDeps(external), llmIsExternal: true }, // egress:'restricted' from baseDeps
		);
		expect(external.calls.length).toBe(0); // restricted content never egressed
		expect(result.grounded).toBe(false);
		expect(result.restricted).toBe(true);
		expect(result.answer).toBe('');
		expect(result.provenance.length).toBeGreaterThan(0); // sources still surfaced
	});

	test('a restricted passage falls back to the injected local provider', async () => {
		const external = new StubLlmProvider({ model: 'external' });
		const local = new StubLlmProvider({ model: 'local' });
		const result = await runAsk(
			{ principal: SUPERUSER, query: 'moneda de bronce', sectionTipos: [SECTION_TIPO], topK: 5 },
			{ ...baseDeps(external), llmIsExternal: true, localLlm: local },
		);
		expect(external.calls.length).toBe(0); // external still not called
		expect(local.calls.length).toBe(1); // local served it instead
		expect(result.grounded).toBe(true);
		expect(result.restricted).toBeUndefined();
	});

	test('a local (non-external) provider generates even when restricted', async () => {
		const local = new StubLlmProvider();
		const result = await runAsk(
			{ principal: SUPERUSER, query: 'moneda de bronce', sectionTipos: [SECTION_TIPO], topK: 5 },
			baseDeps(local), // llmIsExternal defaults false; egress:'restricted'
		);
		expect(local.calls.length).toBe(1);
		expect(result.grounded).toBe(true);
	});
});

describe('dd_rag_api ask', () => {
	test('superuser gets a grounded answer with citations', async () => {
		const res = await ragApiActions.ask(
			askRqo({ query: 'moneda de bronce con jinete', limit: 5 }),
			{
				principal: SUPERUSER,
			} as Ctx,
		);
		expect(res.body.msg).toBe('ok');
		const result = res.body.result as {
			grounded: boolean;
			answer: string;
			citations: unknown[];
		};
		expect(result.grounded).toBe(true);
		expect(result.answer.length).toBeGreaterThan(0);
		expect(result.citations.length).toBeGreaterThan(0);
	});

	test('a denied user gets a NORMAL refusal envelope (no_grounded_context)', async () => {
		const res = await ragApiActions.ask(
			askRqo({ query: 'moneda de bronce con jinete', limit: 5 }),
			{
				principal: NO_ACCESS,
			} as Ctx,
		);
		expect(res.body.msg).toBe('no_grounded_context');
		expect((res.body.result as { grounded: boolean }).grounded).toBe(false);
	});

	test('a dead LLM endpoint maps to generation_failed', async () => {
		process.env.DEDALO_RAG_LLM_ENDPOINT = 'http://127.0.0.1:1/nope'; // connection refused
		// Permit external egress so the (dead) endpoint is actually reached — the
		// egress gate otherwise blocks the external provider before any transport.
		process.env.DEDALO_RAG_ALLOW_EXTERNAL_PROVIDER_DEFAULT = 'true';
		try {
			const res = await ragApiActions.ask(askRqo({ query: 'moneda de bronce', limit: 5 }), {
				principal: SUPERUSER,
			} as Ctx);
			expect(res.body.result).toBe(false);
			expect(res.body.errors).toContain('generation_failed');
		} finally {
			// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
			delete process.env.DEDALO_RAG_LLM_ENDPOINT;
			// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
			delete process.env.DEDALO_RAG_ALLOW_EXTERNAL_PROVIDER_DEFAULT;
		}
	});

	test('an external endpoint is NOT reached for restricted content (egress gate)', async () => {
		// Endpoint configured (external) but external egress NOT permitted by default
		// ⇒ every passage is restricted ⇒ the gate must refuse WITHOUT transport, so
		// a connection-refused endpoint never produces generation_failed.
		process.env.DEDALO_RAG_LLM_ENDPOINT = 'http://127.0.0.1:1/nope';
		try {
			const res = await ragApiActions.ask(askRqo({ query: 'moneda de bronce', limit: 5 }), {
				principal: SUPERUSER,
			} as Ctx);
			expect(res.body.msg).toBe(RESTRICTED_MSG);
			expect(res.body.errors ?? []).not.toContain('generation_failed');
			expect((res.body.result as { restricted?: boolean }).restricted).toBe(true);
		} finally {
			// biome-ignore lint/performance/noDelete: assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
			delete process.env.DEDALO_RAG_LLM_ENDPOINT;
		}
	});
});
