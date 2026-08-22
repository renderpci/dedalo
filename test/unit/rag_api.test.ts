// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule). The tipos
// here are OPAQUE IDENTIFIERS — this gate builds and inspects a descriptor, it never
// reads a record — so the migration is a rename.

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

type Ctx = { requestId: string; session: { userId: number } | null; principal?: Principal };
const rqo = (options: Record<string, unknown>): Rqo => ({ options }) as unknown as Rqo;

beforeAll(async () => {
	const coinId = await createSectionRecord(SECTION_TIPO, -1);
	const shipId = await createSectionRecord(SECTION_TIPO, -1);
	createdIds.push(coinId, shipId);
	await indexComponentText({
		section_tipo: SECTION_TIPO,
		section_id: coinId,
		component_tipo: 'testmint1002',
		lang: 'lg-spa',
		text: 'Moneda ibérica de bronce acuñada en la ceca de Abariltur, con jinete y leyenda ibérica.',
	});
	await indexComponentText({
		section_tipo: SECTION_TIPO,
		section_id: shipId,
		component_tipo: 'testmint1002',
		lang: 'lg-spa',
		text: 'Naufragio de un barco fenicio con ánforas de aceite frente a la costa de Cartagena.',
	});
});

afterAll(async () => {
	for (const id of createdIds) {
		await deleteRecordChunks(SECTION_TIPO, id);
		await cleanScratchRecord(SECTION_TIPO, id);
	}
	// assigning undefined coerces to the STRING 'undefined' — only delete truly unsets the key
	delete process.env.DEDALO_RAG_ENABLED;
});

describe('dd_rag_api semantic_search', () => {
	test('superuser gets the vocabulary-matching record first', async () => {
		const res = await ragApiActions.semantic_search(
			rqo({ query: 'moneda de bronce con jinete ceca', limit: 5 }),
			{ principal: SUPERUSER } as Ctx,
		);
		expect(res.body.msg).toBe('ok');
		const hits = res.body.data as { section_id: number; snippet: string }[];
		expect(hits.length).toBeGreaterThan(0);
		expect(hits[0]!.section_id).toBe(createdIds[0]!);
		expect(hits[0]!.snippet).toContain('Abariltur');
	});

	test('a denied user gets NOTHING (DoD)', async () => {
		const res = await ragApiActions.semantic_search(
			rqo({ query: 'moneda de bronce con jinete ceca', limit: 5 }),
			{ principal: NO_ACCESS } as Ctx,
		);
		expect(res.body.data).toEqual([]);
	});

	test('missing query is rejected', async () => {
		// a refusal is a THROW (the dispatch catch converts it): request.invalid_options
		await expect(
			ragApiActions.semantic_search(rqo({}), { principal: SUPERUSER } as Ctx),
		).rejects.toMatchObject({ code: 'request.invalid_options' });
	});
});

describe('dd_rag_api retrieve / get_agent_context', () => {
	test('retrieve returns passages with chunk_index', async () => {
		const res = await ragApiActions.retrieve(rqo({ query: 'barco fenicio ánforas', limit: 5 }), {
			principal: SUPERUSER,
		} as Ctx);
		expect(res.body.msg).toBe('ok');
		const passages = res.body.data as { section_id: number; chunk_index: number }[];
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
		expect(res.body.data).toEqual([]);
	});
});

describe('dd_rag_api similar_to', () => {
	test('finds the other record and excludes the seed', async () => {
		const res = await ragApiActions.similar_to(
			rqo({ section_tipo: SECTION_TIPO, section_id: createdIds[0], limit: 5 }),
			{ principal: SUPERUSER } as Ctx,
		);
		const hits = res.body.data as { section_id: number }[];
		expect(hits.every((h) => h.section_id !== createdIds[0])).toBe(true);
		expect(hits.some((h) => h.section_id === createdIds[1])).toBe(true);
	});

	test('a denied user gets NOTHING from similar_to (DoD)', async () => {
		const res = await ragApiActions.similar_to(
			rqo({ section_tipo: SECTION_TIPO, section_id: createdIds[0], limit: 5 }),
			{ principal: NO_ACCESS } as Ctx,
		);
		expect(res.body.data).toEqual([]);
	});

	test('missing seed is rejected', async () => {
		await expect(
			ragApiActions.similar_to(rqo({ section_tipo: SECTION_TIPO }), {
				principal: SUPERUSER,
			} as Ctx),
		).rejects.toMatchObject({ code: 'request.invalid_options' });
	});
});

describe('dd_rag_api kill-switch', () => {
	test('declines every ACTION when DEDALO_RAG_ENABLED is off', async () => {
		process.env.DEDALO_RAG_ENABLED = '';
		try {
			await expect(
				ragApiActions.semantic_search(rqo({ query: 'x' }), { principal: SUPERUSER } as Ctx),
			).rejects.toMatchObject({ code: 'rag.disabled' });
		} finally {
			process.env.DEDALO_RAG_ENABLED = 'true';
		}
	});

	// The one exception, and the reason for it: embed_groups is the client's
	// CAPABILITY PROBE, fired on every section list render with no user act
	// behind it. A decline there is a red per-navigation alert on an install
	// that deliberately never implemented RAG, so the switch ANSWERS instead.
	//
	// The context carries NO principal and NO session ON PURPOSE — that is what
	// makes this gate see the kill-switch branch and nothing else. Any other
	// empty answer (malformed tipo, denied caller, not opted in) is produced
	// AFTER resolveCaller, so with the switch on this same call throws
	// auth.not_logged; before this change it threw rag.disabled. Only the
	// switch answering FIRST can make it resolve.
	test('embed_groups ANSWERS empty when off, before any caller resolves', async () => {
		const bare = { requestId: 'rag-api-test', session: null } as Ctx;

		await expect(
			ragApiActions.embed_groups(rqo({ section_tipo: 'test6099' }), bare),
		).rejects.toMatchObject({ code: 'auth.not_logged' });

		process.env.DEDALO_RAG_ENABLED = '';
		try {
			const res = await ragApiActions.embed_groups(rqo({ section_tipo: 'test6099' }), bare);
			expect(res.status).toBe(200);
			expect(res.body.ok).toBe(true);
			expect(res.body.data).toEqual({ groups: [] });
		} finally {
			process.env.DEDALO_RAG_ENABLED = 'true';
		}
	});
});

describe('dd_rag_api embed_groups', () => {
	const ctx = (principal: Principal): Ctx => ({
		requestId: 'rag-api-test',
		session: { userId: principal.userId },
		principal,
	});

	// SHAPE ONLY, and the name says so: no repo-owned `test` TLD section_map
	// declares an `rag.embed` group today, so the group-LISTING path (a
	// descriptor resolving to ids) is not covered by this suite. Naming it
	// "opted-in section returns its group ids" claimed coverage that never
	// existed — the fix is a test fixture with a descriptor, not a rename.
	test('a readable section answers the SHAPE (array of slugs) — no descriptor in the test TLD', async () => {
		const res = await ragApiActions.embed_groups(rqo({ section_tipo: 'test6099' }), ctx(SUPERUSER));
		const result = res.body.data as { groups: string[] };
		expect(Array.isArray(result.groups)).toBe(true);
	});

	test('RAG off, not-opted-in, malformed tipo, and DENIED caller are byte-identical empty (no oracle)', async () => {
		const notOpted = await ragApiActions.embed_groups(
			rqo({ section_tipo: 'test2' }),
			ctx(SUPERUSER),
		);
		const malformed = await ragApiActions.embed_groups(
			rqo({ section_tipo: 'x; DROP TABLE--' }),
			ctx(SUPERUSER),
		);
		const denied = await ragApiActions.embed_groups(
			rqo({ section_tipo: 'test6099' }),
			ctx(NO_ACCESS),
		);
		process.env.DEDALO_RAG_ENABLED = '';
		let ragOff: Awaited<ReturnType<typeof ragApiActions.embed_groups>>;
		try {
			ragOff = await ragApiActions.embed_groups(rqo({ section_tipo: 'test6099' }), ctx(SUPERUSER));
		} finally {
			process.env.DEDALO_RAG_ENABLED = 'true';
		}
		expect(notOpted.body.data).toEqual({ groups: [] });
		expect(JSON.stringify(malformed.body)).toBe(JSON.stringify(notOpted.body));
		expect(JSON.stringify(denied.body)).toBe(JSON.stringify(notOpted.body));
		expect(JSON.stringify(ragOff.body)).toBe(JSON.stringify(notOpted.body));
	});
});
