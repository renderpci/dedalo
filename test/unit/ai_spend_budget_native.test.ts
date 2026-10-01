/**
 * TOOLS-4 (closure Step 3) — AI SPEND is GRANTED and METERED, per user, per UTC
 * day, in a DB-backed STANDARD-SCHEMA ledger (owner decision 2026-09-30: a grant
 * row + a DB-backed per-user quota + conservative budgets, stated in
 * WC-2026-10-01-ai-spend-budget for owner review).
 *
 * WHAT WAS WRONG (measured at 45b8c45162): every authenticated user could spend
 * without bound — the agent loop (`dd_mcp_api` agent_chat / agent_chat_stream: up
 * to MAX_ITERATIONS provider turns per call), the generative RAG `ask`, the
 * retrieval query embeddings and the identify vision calls. No grant on the
 * generative answer, no per-user budget, no ledger.
 *
 * WHAT THIS GATE PINS, by outcome:
 *   A. THE ENGINE ONTOLOGY (src/core/ontology/engine_ontology.ts) — the ledger's
 *      repo-owned definitions, materialized through the engine's own doors: the
 *      door writes, dd_ontology ≡ the JSON node for node (the engine's equality
 *      law) and `inspectOntology('ddengine')` is drift-free; a second run writes
 *      nothing; a damaged node is HEALED; a document naming a foreign TLD is
 *      refused before anything is written; the ledger section stores in `matrix`.
 *   B. THE LEDGER — a reservation BEFORE the provider (before an SSE stream
 *      opens); the reported usage REPLACES the token reservation; a missing usage
 *      keeps the FULL reservation; two concurrent reserves at budget 1 admit
 *      exactly one (node lock + FOR UPDATE); it is DB state (no cache clear
 *      resets it); a missing ledger ontology FAILS CLOSED (503
 *      ai.budget_unavailable); nobody is exempt (a global admin and root are
 *      refused at budget 0).
 *   C. THE DOORS — runs budget 1: the second agent_chat is 429 with ZERO provider
 *      calls; the stream variant refuses as JSON, never an opened stream; the
 *      generative `ask` without `tool_rag` is 403 before any provider call, and
 *      its granted twin is served (a grounding miss refunds the run, the query
 *      embedding stays charged); `embed_groups` spends nothing. THE dd_rag_api
 *      CENSUS (refuter-surviving S2, 2026-10-01): the door table equals
 *      `ragApiActions`; with both embedding sidecars at the counting stand-in,
 *      every action is driven once and a model call that moved no ledger is RED;
 *      every door MEASURED spending an embedding gets embed budget 1 — the
 *      second call is 429 with no embedding made.
 *
 * THE LEDGER IS THE SHIPPED ONE (`ddengine1`) — the gate materializes it through
 * the production door, sweeps the fixture users' rows before and after, and
 * builds the provider as a local `Bun.serve` stand-in that COUNTS calls; the RAG
 * embedding provider is the offline stub.
 *
 * RED AT HEAD (45b8c45162 / d724c8851d): src/core/security/ai_spend.ts and the
 * engine ontology do not exist (the module legs and A fail on import), and no
 * door meters or grants (C).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ragApiActions } from '../../src/ai/rag/api.ts';
import type { MultimodalEmbeddingProvider } from '../../src/ai/rag/multimodal_embedding_provider.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import {
	buildGetProposals,
	buildIdentifyByImage,
	defaultIdentifyByImageDeps,
	defaultIdentifyProposalsDeps,
} from '../../src/core/api/handlers/dd_identify_api.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { readDdOntologyRow, upsertDdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import { runDetachedFromTransaction, sql } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import {
	ENGINE_TLD,
	engineOntologyDrift,
	ensureEngineOntology,
	loadEngineOntologyDoc,
} from '../../src/core/ontology/engine_ontology.ts';
import { inspectOntology, nodeDiffColumns } from '../../src/core/ontology/ontology_state.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { persistRecordKeys } from '../../src/core/section_record/record_write.ts';
import {
	AI_SPEND_LEDGER,
	chargeAiSpend,
	readAiSpend,
	reserveAiSpend,
} from '../../src/core/security/ai_spend.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { createSession, getSession, type Session } from '../../src/core/security/session_store.ts';
import { sweepAiSpendLedger } from '../helpers/ai_spend_ledger.ts';
import {
	AUTHZ_COMPONENT_ONLY_USER_ID,
	AUTHZ_CONTROL_USER_ID,
	AUTHZ_DD128_ADMIN_USER_ID,
	AUTHZ_LEVEL_1_USER_ID,
	AUTHZ_PROJECT_P,
	AUTHZ_SECTION,
	AUTHZ_SECTION_ONLY_USER_ID,
	AUTHZ_TOOL_GRANTED_USER_ID,
	type AuthzIdentities,
	createDoorRecord,
	installAuthzDoorFixture,
	removeAuthzDoorFixture,
	resolveAuthzIdentities,
} from '../helpers/authz_door_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const ROOT_USER_ID = -1;
/** Every user whose ledger rows this gate may write — swept before and after. */
const SPENDERS = [
	AUTHZ_COMPONENT_ONLY_USER_ID,
	AUTHZ_CONTROL_USER_ID,
	AUTHZ_SECTION_ONLY_USER_ID,
	AUTHZ_TOOL_GRANTED_USER_ID,
	AUTHZ_LEVEL_1_USER_ID,
	AUTHZ_DD128_ADMIN_USER_ID,
	ROOT_USER_ID,
];

const BUDGET_KEYS = [
	'DEDALO_AI_USER_DAILY_RUNS',
	'DEDALO_AI_USER_DAILY_TOKENS',
	'DEDALO_AI_USER_DAILY_EMBED_QUERIES',
	'DEDALO_AI_USER_DAILY_VISION',
] as const;
const OTHER_KEYS = [
	'DEDALO_AGENT_HTTP_ENABLED',
	'DEDALO_AGENT_ALLOW_WRITE',
	'DEDALO_AGENT_MODELS',
	'ANTHROPIC_API_KEY',
	'DEDALO_RAG_ENABLED',
	'DEDALO_RAG_LLM_ENDPOINT',
	'DEDALO_RAG_LLM_MODEL',
	'DEDALO_RAG_LLM_API_KEY',
	'DEDALO_RAG_EMBEDDING_PROVIDER',
	// The C-census legs arm the embedding sidecars at the counting stand-in.
	'DEDALO_RAG_EMBEDDING_ENDPOINT',
	'DEDALO_RAG_EMBEDDING_MODEL',
	'DEDALO_RAG_MEDIA_ENABLED',
	'DEDALO_RAG_MULTIMODAL_ENDPOINT',
	'DEDALO_RAG_MULTIMODAL_PROVIDER',
	'DEDALO_RAG_MULTIMODAL_MODEL',
];

/** The provider stand-in reports this usage on every turn (3 in + 2 out). */
const TURN_TOKENS = 5;

let ids: AuthzIdentities;
let root: Principal;
let seedId = 0;
let provider: ReturnType<typeof Bun.serve> | null = null;
let providerCalls = 0;
/** Embedding calls the stand-in answered (text sidecar `/embed`, multimodal `/text` + `/image`). */
let embedCalls = 0;
/** The stand-in's embedding paths (sidecar contracts: embedding_provider.ts, multimodal_embedding_provider.ts). */
const EMBED_PATHS: Record<string, string> = {
	'/zzembed/embed': 'input',
	'/zzmm/text': 'input',
	'/zzmm/image': 'images',
};
const savedEnv: Record<string, string | undefined> = {};
const sessions = new Map<number, Session>();

/** Set the four budgets for one leg (read per reservation, so it takes effect at once). */
function budgets(values: { runs?: number; tokens?: number; embeds?: number; vision?: number }) {
	process.env.DEDALO_AI_USER_DAILY_RUNS = String(values.runs ?? 1000);
	process.env.DEDALO_AI_USER_DAILY_TOKENS = String(values.tokens ?? 100_000_000);
	process.env.DEDALO_AI_USER_DAILY_EMBED_QUERIES = String(values.embeds ?? 1000);
	process.env.DEDALO_AI_USER_DAILY_VISION = String(values.vision ?? 1000);
}

function contextFor(principal: Principal) {
	let session = sessions.get(principal.userId);
	if (session === undefined) {
		const token = createSession(
			principal.userId,
			`zzspend_${principal.userId}`,
			principal.isGlobalAdmin,
		);
		session = getSession(token) as Session;
		sessions.set(principal.userId, session);
	}
	return {
		requestId: crypto.randomUUID(),
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session.csrfToken,
	};
}

const call = (
	apiClass: string,
	action: string,
	options: Record<string, unknown>,
	principal: Principal,
) =>
	dispatchRqo(
		{ action, dd_api: apiClass, options } as unknown as Rqo,
		contextFor(principal) as never,
	) as Promise<{ status: number; body: unknown; stream?: unknown }>;

const errorCode = (body: unknown) => (body as { error?: { code?: string } }).error?.code;

async function refusalOf(promise: Promise<unknown>): Promise<string> {
	try {
		await promise;
		return 'admitted';
	} catch (error) {
		return error instanceof DedaloError ? error.code : `untyped: ${String(error)}`;
	}
}

describe.if(DB_READY)('TOOLS-4 — AI spend is granted and metered', () => {
	beforeAll(async () => {
		for (const key of [...BUDGET_KEYS, ...OTHER_KEYS]) savedEnv[key] = process.env[key];
		provider = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			async fetch(request) {
				const field = EMBED_PATHS[new URL(request.url).pathname];
				if (field !== undefined) {
					// An EMBEDDING model call: counted apart from the chat turns, so the
					// existing "zero provider calls" legs keep meaning chat turns.
					embedCalls++;
					const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
					const items = Array.isArray(body[field]) ? (body[field] as unknown[]) : [];
					return Response.json({ embeddings: items.map(() => [1, 0, 0, 0, 0, 0, 0, 0]) });
				}
				providerCalls++;
				const body = (await request.json().catch(() => ({}))) as { stream?: boolean };
				const usage = { prompt_tokens: 3, completion_tokens: 2, total_tokens: TURN_TOKENS };
				if (body.stream === true) {
					const chunk = {
						choices: [{ index: 0, delta: { content: 'zzspend' }, finish_reason: 'stop' }],
						usage,
					};
					return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
						headers: { 'Content-Type': 'text/event-stream' },
					});
				}
				return Response.json({
					choices: [
						{ index: 0, message: { role: 'assistant', content: 'zzspend' }, finish_reason: 'stop' },
					],
					usage,
				});
			},
		});
		budgets({});
		process.env.DEDALO_AGENT_HTTP_ENABLED = 'true';
		delete process.env.DEDALO_AGENT_ALLOW_WRITE;
		delete process.env.ANTHROPIC_API_KEY;
		process.env.DEDALO_AGENT_MODELS = JSON.stringify([
			{
				id: 'zzspendmodel',
				label: 'zzspend stub',
				provider: 'openai_compatible',
				model: 'zzspend-native',
				endpoint: `http://127.0.0.1:${provider.port}/v1/chat/completions`,
				egress: 'local',
				max_tokens: 1000,
			},
		]);
		process.env.DEDALO_RAG_ENABLED = 'true';
		process.env.DEDALO_RAG_LLM_ENDPOINT = `http://127.0.0.1:${provider.port}/v1/chat/completions`;
		process.env.DEDALO_RAG_LLM_MODEL = 'zzspend-native';
		delete process.env.DEDALO_RAG_LLM_API_KEY;
		process.env.DEDALO_RAG_EMBEDDING_PROVIDER = 'stub';

		await ensureEngineOntology();
		await installAuthzDoorFixture();
		ids = await resolveAuthzIdentities();
		root = await resolvePrincipal(ROOT_USER_ID);
		seedId = await createDoorRecord(AUTHZ_SECTION, AUTHZ_PROJECT_P);
		await sweepAiSpendLedger(SPENDERS);
	});

	afterAll(async () => {
		provider?.stop(true);
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		await sweepAiSpendLedger(SPENDERS);
		await removeAuthzDoorFixture();
	});

	// ── A. the engine ontology ─────────────────────────────────────────────────

	describe('A. the engine ontology (the ledger definitions)', () => {
		test('every definition sits under the engine TLD, and dd_ontology ≡ the JSON node for node', async () => {
			const doc = await loadEngineOntologyDoc();
			expect(doc.nodes.length).toBeGreaterThanOrEqual(10); // anti-vacuity
			const diffs: string[] = [];
			for (const node of doc.nodes) {
				expect(node.tld).toBe(ENGINE_TLD);
				const row = await readDdOntologyRow(node.tipo);
				if (row === null) diffs.push(`${node.tipo}: missing`);
				else if (nodeDiffColumns(node, row).length > 0) {
					diffs.push(`${node.tipo}: ${nodeDiffColumns(node, row).join(',')}`);
				}
			}
			expect(diffs).toEqual([]);
			const state = await inspectOntology(ENGINE_TLD);
			expect({ drift: state.drift, mainNodeOk: state.mainNodeOk }).toEqual({
				drift: [],
				mainNodeOk: true,
			});
		});

		test('a second run writes nothing', async () => {
			const again = await ensureEngineOntology();
			expect({ changed: again.changed, written: again.written, strays: again.strays }).toEqual({
				changed: false,
				written: 0,
				strays: [],
			});
		});

		test('a DAMAGED node (an edit made in the database) is healed from the JSON', async () => {
			const doc = await loadEngineOntologyDoc();
			const victim = doc.nodes.find((node) => node.tipo === AI_SPEND_LEDGER.vision);
			if (victim === undefined) throw new Error('the vision counter node is not in the JSON');
			await upsertDdOntologyNode({ ...victim, term: { 'lg-eng': 'zzspend damaged' } });
			await clearOntologyDerivedCaches();
			expect(await engineOntologyDrift()).toEqual([`${AI_SPEND_LEDGER.vision}: term`]);
			const healed = await ensureEngineOntology();
			expect(healed.changed).toBe(true);
			expect(await engineOntologyDrift()).toEqual([]);
		});

		test('a document naming another TLD is refused before anything is written', async () => {
			const doc = await loadEngineOntologyDoc();
			const foreign = { ...doc.nodes[1], tipo: 'test3', tld: 'test' } as (typeof doc.nodes)[number];
			const before = await readDdOntologyRow('test3');
			expect(
				await refusalOf(ensureEngineOntology({ doc: { ...doc, nodes: [...doc.nodes, foreign] } })),
			).toBe('internal.invariant');
			expect(await readDdOntologyRow('test3')).toEqual(before);
			// …and nothing of the engine's own was rewritten from it either.
			const drift = await engineOntologyDrift();
			if (drift.length > 0) await ensureEngineOntology(); // heal before reporting
			expect(drift).toEqual([]);
		});

		test('the ledger section stores in the standard `matrix` table', async () => {
			expect(await getMatrixTableFromTipo(AI_SPEND_LEDGER.section)).toBe('matrix');
		});
	});

	// ── B. the ledger ──────────────────────────────────────────────────────────

	describe('B. the ledger', () => {
		test('a missing or damaged ledger ontology FAILS CLOSED: ai.budget_unavailable, nothing admitted', async () => {
			budgets({});
			// Damage the shipped ledger the way a broken install would: its user
			// component no longer is the locator component the ledger writes.
			const doc = await loadEngineOntologyDoc();
			const user = doc.nodes.find((node) => node.tipo === AI_SPEND_LEDGER.user);
			if (user === undefined) throw new Error('the ledger user node is not in the JSON');
			await upsertDdOntologyNode({ ...user, model: 'component_input_text', model_tipo: 'dd9' });
			await clearOntologyDerivedCaches();
			try {
				expect(
					await refusalOf(reserveAiSpend(ids.level1, { door: 'zzspend.missing', runs: 1 })),
				).toBe('ai.budget_unavailable');
			} finally {
				expect((await ensureEngineOntology()).changed).toBe(true);
			}
			expect(
				await refusalOf(chargeAiSpend(ids.level1, { door: 'zzspend.healed', vision: 1 })),
			).toBe('admitted');
		});

		test('two CONCURRENT reserves at budget 1 admit exactly one (the node lock + FOR UPDATE)', async () => {
			budgets({ runs: 1 });
			let arrived = 0;
			let open: () => void = () => {};
			const barrier = new Promise<void>((resolve) => {
				open = resolve;
			});
			// Both reservations READ the ledger before either writes: without the lock
			// both see 0 used and both are admitted.
			const afterRead = async () => {
				arrived++;
				if (arrived >= 2) open();
				await Promise.race([barrier, new Promise((resolve) => setTimeout(resolve, 500))]);
			};
			const outcomes = await Promise.all([
				refusalOf(
					reserveAiSpend(ids.level1, { door: 'zzspend.concurrent', runs: 1 }, { afterRead }),
				),
				refusalOf(
					reserveAiSpend(ids.level1, { door: 'zzspend.concurrent', runs: 1 }, { afterRead }),
				),
			]);
			expect(outcomes.sort()).toEqual(['admitted', 'ai.budget_exhausted']);
			expect((await readAiSpend(ids.level1)).runs).toBe(1);
		});

		test('an ADMINISTRATOR correction racing a reservation is never lost (the row lock, FOR UPDATE)', async () => {
			// The ledger is a section an administrator may correct by hand (reset a
			// counter). That write does not take the (user, day) node lock — only the
			// ROW lock — so the reservation's read must hold the row: the correction
			// then lands AFTER the reservation commits. Without FOR UPDATE it lands in
			// the window, and the reservation's stale write erases it.
			budgets({});
			await sweepAiSpendLedger([AUTHZ_COMPONENT_ONLY_USER_ID]);
			await chargeAiSpend(ids.componentOnly, { door: 'zzspend.race.seed', runs: 1 });
			const rows = (await sql.unsafe(
				`SELECT section_id FROM matrix WHERE section_tipo = $1 AND relation @> $2::text::jsonb`,
				[
					AI_SPEND_LEDGER.section,
					JSON.stringify({
						[AI_SPEND_LEDGER.user]: [{ section_id: AUTHZ_COMPONENT_ONLY_USER_ID }],
					}),
				],
			)) as { section_id: number }[];
			expect(rows.length).toBe(1);
			const target = {
				table: 'matrix',
				sectionTipo: AI_SPEND_LEDGER.section,
				sectionId: Number(rows[0]?.section_id),
			};
			let correction: Promise<void> = Promise.resolve();
			await reserveAiSpend(
				ids.componentOnly,
				{ door: 'zzspend.race', runs: 1 },
				{
					afterRead: async () => {
						correction = runDetachedFromTransaction(() =>
							persistRecordKeys(
								target,
								[{ column: 'number', key: AI_SPEND_LEDGER.runs, value: [{ id: 1, value: 0 }] }],
								{ userId: ROOT_USER_ID },
								{ actor: ROOT_USER_ID },
							),
						);
						await Promise.race([correction, new Promise((resolve) => setTimeout(resolve, 400))]);
					},
				},
			);
			await correction;
			expect((await readAiSpend(ids.componentOnly)).runs).toBe(0);
		});

		test('a MISSING usage report keeps the full reservation charged (never settle-to-zero)', async () => {
			budgets({});
			const reservation = await reserveAiSpend(ids.sectionOnly, {
				door: 'zzspend.nousage',
				runs: 1,
				tokens: 4096,
			});
			await reservation.settle(null);
			expect(await readAiSpend(ids.sectionOnly)).toEqual({
				runs: 1,
				tokens: 4096,
				embeds: 0,
				vision: 0,
			});
		});

		test('a REPORTED usage replaces the reservation; release refunds only an unspent one', async () => {
			budgets({});
			await sweepAiSpendLedger([AUTHZ_SECTION_ONLY_USER_ID]);
			const used = await reserveAiSpend(ids.sectionOnly, { door: 'zzspend.used', tokens: 4096 });
			await used.settle({ tokens: 17 });
			const refunded = await reserveAiSpend(ids.sectionOnly, {
				door: 'zzspend.refunded',
				runs: 1,
				tokens: 4096,
			});
			await refunded.release();
			expect(await readAiSpend(ids.sectionOnly)).toEqual({
				runs: 0,
				tokens: 17,
				embeds: 0,
				vision: 0,
			});
		});

		test('NOBODY IS EXEMPT: a global admin and root are refused at budget 0', async () => {
			budgets({ vision: 0, embeds: 0 });
			expect(ids.dd128Admin.isGlobalAdmin).toBe(true);
			expect(
				await refusalOf(chargeAiSpend(ids.dd128Admin, { door: 'zzspend.admin', vision: 1 })),
			).toBe('ai.budget_exhausted');
			expect(await refusalOf(chargeAiSpend(root, { door: 'zzspend.root', embeds: 1 }))).toBe(
				'ai.budget_exhausted',
			);
		});

		test('the refusal names the budget and when it resets (429 details)', async () => {
			budgets({ vision: 0 });
			try {
				await chargeAiSpend(ids.level1, { door: 'zzspend.details', vision: 1 });
				throw new Error('admitted');
			} catch (error) {
				expect(error).toBeInstanceOf(DedaloError);
				const details = (error as DedaloError).details as Record<string, unknown>;
				expect(details.budget_kind).toBe('vision');
				expect(details.limit).toBe(0);
				expect(String(details.window_resets_at)).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
			}
		});
	});

	// ── C. the doors ───────────────────────────────────────────────────────────

	describe('C. the doors', () => {
		test('agent_chat charges the REPORTED usage, not the reservation', async () => {
			budgets({});
			await sweepAiSpendLedger([AUTHZ_TOOL_GRANTED_USER_ID]);
			const before = providerCalls;
			const first = await call(
				'dd_mcp_api',
				'agent_chat',
				{ question: 'zzspend one', model: 'zzspendmodel' },
				ids.toolGranted,
			);
			expect(first.status).toBe(200);
			expect(providerCalls).toBe(before + 1);
			expect(await readAiSpend(ids.toolGranted)).toEqual({
				runs: 1,
				tokens: TURN_TOKENS,
				embeds: 0,
				vision: 0,
			});
		});

		test('runs budget 1: the SECOND agent_chat is ai.budget_exhausted (429), with no provider call', async () => {
			budgets({ runs: 1 });
			const before = providerCalls;
			const second = await call(
				'dd_mcp_api',
				'agent_chat',
				{ question: 'zzspend two', model: 'zzspendmodel' },
				ids.toolGranted,
			);
			expect({ status: second.status, code: errorCode(second.body) }).toEqual({
				status: 429,
				code: 'ai.budget_exhausted',
			});
			expect(providerCalls).toBe(before);
		});

		test('the stream variant refuses with a JSON 429 — no SSE byte is ever sent', async () => {
			budgets({ runs: 1 });
			const before = providerCalls;
			const result = await call(
				'dd_mcp_api',
				'agent_chat_stream',
				{ question: 'zzspend stream', model: 'zzspendmodel' },
				ids.toolGranted,
			);
			const opened = result.stream !== undefined;
			// Never leave an opened stream (and its loop) running behind a red assertion.
			await (result.stream as ReadableStream | undefined)?.cancel();
			expect(opened).toBe(false);
			expect({ status: result.status, code: errorCode(result.body) }).toEqual({
				status: 429,
				code: 'ai.budget_exhausted',
			});
			expect(providerCalls).toBe(before);
		});

		test('the ledger is DB state: clearing the principal / permission caches resets nothing', async () => {
			budgets({ runs: 1 });
			clearPrincipalCache();
			clearPermissionsCache();
			const result = await call(
				'dd_mcp_api',
				'agent_chat',
				{ question: 'zzspend after clear', model: 'zzspendmodel' },
				ids.toolGranted,
			);
			expect(errorCode(result.body)).toBe('ai.budget_exhausted');
		});

		test('generative `ask` without the tool_rag grant is tool.not_authorized — before anything is spent', async () => {
			budgets({});
			await sweepAiSpendLedger([AUTHZ_CONTROL_USER_ID]);
			const before = providerCalls;
			const result = await call(
				'dd_rag_api',
				'ask',
				{ query: 'zzspend ask', section_tipo: AUTHZ_SECTION },
				ids.control,
			);
			expect({ status: result.status, code: errorCode(result.body) }).toEqual({
				status: 403,
				code: 'tool.not_authorized',
			});
			expect(providerCalls).toBe(before);
			expect(await readAiSpend(ids.control)).toEqual({ runs: 0, tokens: 0, embeds: 0, vision: 0 });
		});

		test('its GRANTED twin is served; a grounding miss refunds the run, the query embedding stays charged', async () => {
			budgets({});
			await sweepAiSpendLedger([AUTHZ_TOOL_GRANTED_USER_ID]);
			const before = providerCalls;
			const result = await call(
				'dd_rag_api',
				'ask',
				{ query: 'zzspend ask granted', section_tipo: AUTHZ_SECTION },
				ids.toolGranted,
			);
			expect(result.status).toBe(200);
			// The suite's vector store holds no passage for this query: the grounding
			// gate refuses BEFORE the model — no provider call, the run refunded.
			expect(providerCalls).toBe(before);
			expect(await readAiSpend(ids.toolGranted)).toEqual({
				runs: 0,
				tokens: 0,
				embeds: 1,
				vision: 0,
			});
		});

		test('embed_groups (the capability probe) spends nothing and needs no grant', async () => {
			budgets({ embeds: 0 });
			await sweepAiSpendLedger([AUTHZ_CONTROL_USER_ID]);
			const result = await call(
				'dd_rag_api',
				'embed_groups',
				{ section_tipo: AUTHZ_SECTION },
				ids.control,
			);
			expect(result.status).toBe(200);
			expect(await readAiSpend(ids.control)).toEqual({ runs: 0, tokens: 0, embeds: 0, vision: 0 });
		});

		// ── EVERY MODEL CALL A dd_rag_api DOOR MAKES IS METERED (refuter-surviving
		// S2, 2026-10-01). The census is OUTCOME-DERIVED and TOTAL over the action
		// table: both embedding sidecars point at the counting stand-in, every
		// action in ragApiActions is driven once, and a door that made a model
		// call (an embedding or a chat turn) without moving the caller's ledger is
		// RED. A new action without a row here is RED (the table must equal the
		// registry), and every door MEASURED to spend an embedding gets the
		// budget-1 leg below — derived from the census, never a hand list.
		const RAG_DOORS: Record<
			keyof typeof ragApiActions,
			{ options: () => Record<string, unknown>; who: () => Principal }
		> = {
			semantic_search: {
				options: () => ({ query: 'zzspend census', section_tipo: AUTHZ_SECTION }),
				who: () => ids.control,
			},
			retrieve: {
				options: () => ({ query: 'zzspend census', section_tipo: AUTHZ_SECTION }),
				who: () => ids.control,
			},
			get_agent_context: {
				options: () => ({ query: 'zzspend census', section_tipo: AUTHZ_SECTION }),
				who: () => ids.control,
			},
			search_by_text_image: {
				options: () => ({ query: 'zzspend census', section_tipo: [AUTHZ_SECTION] }),
				who: () => ids.control,
			},
			// `ask` is GRANTED (tool_rag): the census drives the granted principal.
			ask: {
				options: () => ({ query: 'zzspend census', section_tipo: AUTHZ_SECTION }),
				who: () => ids.toolGranted,
			},
			embed_groups: { options: () => ({ section_tipo: AUTHZ_SECTION }), who: () => ids.control },
			similar_to: {
				options: () => ({ section_tipo: AUTHZ_SECTION, section_id: seedId }),
				who: () => ids.control,
			},
			similar_objects: {
				options: () => ({ section_tipo: AUTHZ_SECTION, section_id: seedId }),
				who: () => ids.control,
			},
			characterize_object: {
				options: () => ({ section_tipo: AUTHZ_SECTION, section_id: seedId }),
				who: () => ids.control,
			},
		};
		/** The census result: per door, the model calls it made and the ledger it moved. */
		const measured = new Map<string, { modelCalls: number; embeds: number; spent: number }>();
		const armSidecars = () => {
			process.env.DEDALO_RAG_EMBEDDING_PROVIDER = 'sidecar';
			process.env.DEDALO_RAG_EMBEDDING_ENDPOINT = `http://127.0.0.1:${provider?.port}/zzembed`;
			process.env.DEDALO_RAG_EMBEDDING_MODEL = 'zzspend-embed';
			process.env.DEDALO_RAG_MEDIA_ENABLED = 'true';
			process.env.DEDALO_RAG_MULTIMODAL_ENDPOINT = `http://127.0.0.1:${provider?.port}/zzmm`;
			process.env.DEDALO_RAG_MULTIMODAL_PROVIDER = 'local';
			process.env.DEDALO_RAG_MULTIMODAL_MODEL = 'zzspend-mm';
		};
		const disarmSidecars = () => {
			process.env.DEDALO_RAG_EMBEDDING_PROVIDER = 'stub';
			for (const key of [
				'DEDALO_RAG_EMBEDDING_ENDPOINT',
				'DEDALO_RAG_EMBEDDING_MODEL',
				'DEDALO_RAG_MEDIA_ENABLED',
				'DEDALO_RAG_MULTIMODAL_ENDPOINT',
				'DEDALO_RAG_MULTIMODAL_PROVIDER',
				'DEDALO_RAG_MULTIMODAL_MODEL',
			]) {
				delete process.env[key];
			}
		};
		const ledgerTotal = (spend: Awaited<ReturnType<typeof readAiSpend>>) =>
			spend.runs + spend.tokens + spend.embeds + spend.vision;

		test('CENSUS: the door table is the dd_rag_api registry — a new action needs its row', () => {
			expect(Object.keys(RAG_DOORS).sort()).toEqual(Object.keys(ragApiActions).sort());
		});

		test("CENSUS: every dd_rag_api door that calls a model moves the caller's ledger", async () => {
			budgets({});
			armSidecars();
			try {
				for (const [action, door] of Object.entries(RAG_DOORS)) {
					const principal = door.who();
					await sweepAiSpendLedger([principal.userId]);
					const before = embedCalls + providerCalls;
					const result = await call('dd_rag_api', action, door.options(), principal);
					// Served — a door that answered with an error proved nothing about its spend.
					expect({ action, status: result.status }).toEqual({ action, status: 200 });
					const spend = await readAiSpend(principal);
					measured.set(action, {
						modelCalls: embedCalls + providerCalls - before,
						embeds: spend.embeds,
						spent: ledgerTotal(spend),
					});
				}
			} finally {
				disarmSidecars();
			}
			const unmetered = [...measured]
				.filter(([, row]) => row.modelCalls > 0 && row.spent === 0)
				.map(([action]) => action);
			expect(unmetered).toEqual([]);
			// Non-degeneracy: the census really saw the model doors call a model (a
			// stand-in nobody reached would make every row "no call, no spend").
			const calling = [...measured].filter(([, row]) => row.modelCalls > 0).map(([a]) => a);
			expect(calling).toEqual(
				expect.arrayContaining([
					'semantic_search',
					'retrieve',
					'get_agent_context',
					'search_by_text_image',
					'ask',
				]),
			);
		});

		test('embed budget 1: for EVERY door the census measured spending an embedding, the SECOND call is ai.budget_exhausted (429)', async () => {
			const embedDoors = [...measured].filter(([, row]) => row.embeds > 0).map(([a]) => a);
			// Derived, so it must not be empty (the census ran first, in file order).
			expect(embedDoors).toEqual(
				expect.arrayContaining([
					'semantic_search',
					'retrieve',
					'get_agent_context',
					'search_by_text_image',
				]),
			);
			armSidecars();
			try {
				for (const action of embedDoors) {
					const door = RAG_DOORS[action as keyof typeof RAG_DOORS];
					const principal = door.who();
					budgets({ embeds: 1 });
					await sweepAiSpendLedger([principal.userId]);
					const first = await call('dd_rag_api', action, door.options(), principal);
					const before = embedCalls;
					const second = await call('dd_rag_api', action, door.options(), principal);
					expect({
						action,
						first: first.status,
						second: second.status,
						code: errorCode(second.body),
						embedsAfterRefusal: embedCalls - before,
						ledger: (await readAiSpend(principal)).embeds,
					}).toEqual({
						action,
						first: 200,
						second: 429,
						code: 'ai.budget_exhausted',
						embedsAfterRefusal: 0,
						ledger: 1,
					});
				}
			} finally {
				disarmSidecars();
			}
		});

		// ── identify: the vision spend (granted by tool_identify — its own gate) ──
		const identifyCtx = (principal: Principal): ApiRequestContext =>
			({ requestId: 'zzspend-vision', clientIp: '127.0.0.1', principal }) as ApiRequestContext;

		test('vision budget 1: the SECOND get_proposals vision run is 429 and the model is NOT asked', async () => {
			budgets({ vision: 1 });
			await sweepAiSpendLedger([AUTHZ_TOOL_GRANTED_USER_ID]);
			const calls = { vision: 0 };
			const handler = buildGetProposals({
				...defaultIdentifyProposalsDeps(),
				loadProfile: async () =>
					({ id: 'zzspend', label: 'zzspend', criteria: [], previewComponent: null }) as never,
				runVision: async () => {
					calls.vision++;
					return { declined: { reason: 'no_model' }, proposals: [], model: null } as never;
				},
				runNeighbourVote: async () => ({ proposals: [], skipped: [] }) as never,
			});
			const rqo = {
				action: 'get_proposals',
				options: { section_tipo: AUTHZ_SECTION, section_id: seedId, source: 'vision' },
			} as unknown as Rqo;
			const first = await refusalOf(handler(rqo, identifyCtx(ids.toolGranted)));
			const second = await refusalOf(handler(rqo, identifyCtx(ids.toolGranted)));
			expect({ first, second, modelCalls: calls.vision }).toEqual({
				first: 'admitted',
				second: 'ai.budget_exhausted',
				modelCalls: 1,
			});
		});

		test('identify_by_image, EXTERNAL encoder at vision budget 0: 429 with ZERO embeds', async () => {
			budgets({ vision: 0 });
			const calls = { embed: 0 };
			const encoder: MultimodalEmbeddingProvider = {
				embedImage: async () => {
					calls.embed++;
					return [[1, 0, 0]];
				},
				embedTextForImageSearch: async () => [],
				dimension: () => 3,
				model: () => 'zzspend-encoder',
				provider: () => 'zzspend-cloud',
				isExternal: () => true,
			};
			const handler = buildIdentifyByImage({
				...defaultIdentifyByImageDeps(),
				ragEnabled: () => true,
				mediaEnabled: () => true,
				buildProvider: () => encoder,
				queryImagePartition: async () => [],
				filterAccessible: async (_principal, candidates) => candidates,
			});
			const png =
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
			const rqo = { action: 'identify_by_image', options: { image: png } } as unknown as Rqo;
			expect({
				code: await refusalOf(handler(rqo, identifyCtx(ids.toolGranted))),
				embeds: calls.embed,
			}).toEqual({ code: 'ai.budget_exhausted', embeds: 0 });
		});
	});
});
