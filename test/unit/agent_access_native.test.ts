/**
 * THE AGENT DOOR — SEC-3 (closure Step 3). Every `dd_mcp_api` action requires
 * the HTTP master switch AND the caller's `tool_assistant` grant.
 *
 * WHAT WAS WRONG (measured at 45b8c45162): `requireAgentHttp` checked ONLY the
 * install-wide flag. With it on, EVERY logged-in user — whatever their profile
 * — could run the agent loop (model spend, record reads through the MCP tool
 * registry, change plans) and the raw MCP bridge; `tool_assistant` is not
 * `always_active`, so the tool ACL the toolbar honours was simply not asked.
 * Global admins were no exception to the tool ACL anywhere else
 * (`getUserTools` exempts only the superuser, -1), and were not asked here
 * either.
 *
 * THE DOOR LIST IS DERIVED: `Object.keys(mcpApiActions)`, asserted equal to the
 * dispatch registry's `dd_mcp_api` rows, so a new action cannot ship ungated.
 * Every door is driven through the REAL `dispatchRqo` (session + CSRF + the
 * handler), with a local `Bun.serve` stand-in for the model endpoint that
 * COUNTS calls — an ungranted caller must cost zero provider calls.
 *
 *   ungranted non-admin            → 403 tool.not_authorized, every door
 *   ungranted GLOBAL ADMIN         → 403 tool.not_authorized, every door
 *   granted twin (same grants + dd1067 → tool_assistant)
 *                                  → no tool.* and no request.unknown_action
 *   flag OFF, all three users      → request.unknown_action (nothing leaks)
 *   a refused stream               → a JSON body, never an SSE stream
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo, listRegisteredActions } from '../../src/core/api/dispatch.ts';
import { mcpApiActions } from '../../src/core/api/handlers/dd_mcp_api.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { createSession, getSession, type Session } from '../../src/core/security/session_store.ts';
import {
	AUTHZ_CONTROL_USER_ID,
	AUTHZ_DD128_ADMIN_USER_ID,
	AUTHZ_STUB_MODEL_ID,
	AUTHZ_TOOL_GRANTED_USER_ID,
	authzStubAgentModels,
	installAuthzDoorFixture,
	removeAuthzDoorFixture,
	resolveAuthzIdentities,
} from '../helpers/authz_door_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const DOORS = Object.keys(mcpApiActions);
if (DOORS.length === 0) throw new Error('mcpApiActions is EMPTY — the door derivation is broken');

/** A payload per door that WOULD run the action for an authorized caller. */
function optionsFor(action: string): Record<string, unknown> {
	switch (action) {
		case 'mcp_proxy':
			return { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} };
		case 'agent_chat':
		case 'agent_chat_stream':
			return { question: 'zzauthz hello', model: AUTHZ_STUB_MODEL_ID };
		case 'agent_apply':
			return { plan: { ops: [] }, plan_hash: 'zzauthz-not-a-hash' };
		default:
			return {};
	}
}

let providerCalls = 0;
let provider: ReturnType<typeof Bun.serve> | null = null;
const ENV_KEYS = [
	'DEDALO_AGENT_HTTP_ENABLED',
	'DEDALO_AGENT_ALLOW_WRITE',
	'DEDALO_AGENT_MODELS',
	'ANTHROPIC_API_KEY',
] as const;
const savedEnv: Record<string, string | undefined> = {};

const sessions: Record<string, Session> = {};

function contextFor(session: Session) {
	return {
		requestId: crypto.randomUUID(),
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: session.csrfToken,
	};
}

async function call(action: string, session: Session) {
	return dispatchRqo(
		{ action, dd_api: 'dd_mcp_api', options: optionsFor(action) } as unknown as Rqo,
		contextFor(session) as never,
	);
}

const errorCode = (body: unknown) => (body as { error?: { code?: string } }).error?.code;

describe.if(DB_READY)('SEC-3 — the agent door asks the flag AND the tool grant', () => {
	beforeAll(async () => {
		for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
		provider = Bun.serve({
			port: 0,
			hostname: '127.0.0.1',
			async fetch(request) {
				providerCalls++;
				const body = (await request.json().catch(() => ({}))) as { stream?: boolean };
				const message = { role: 'assistant', content: 'zzauthz stub answer' };
				const usage = { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 };
				if (body.stream === true) {
					const chunk = {
						choices: [
							{ index: 0, delta: { content: 'zzauthz stub answer' }, finish_reason: 'stop' },
						],
						usage,
					};
					return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, {
						headers: { 'Content-Type': 'text/event-stream' },
					});
				}
				return Response.json({
					choices: [{ index: 0, message, finish_reason: 'stop' }],
					usage,
				});
			},
		});
		process.env.DEDALO_AGENT_HTTP_ENABLED = 'true';
		delete process.env.DEDALO_AGENT_ALLOW_WRITE;
		delete process.env.ANTHROPIC_API_KEY;
		process.env.DEDALO_AGENT_MODELS = authzStubAgentModels(provider.port);
		await installAuthzDoorFixture();
		const ids = await resolveAuthzIdentities();
		for (const [label, principal] of [
			['ungranted', ids.control],
			['ungrantedAdmin', ids.dd128Admin],
			['granted', ids.toolGranted],
		] as const) {
			const token = createSession(principal.userId, `zzauthz_${label}`, principal.isGlobalAdmin);
			sessions[label] = getSession(token) as Session;
		}
	});

	afterAll(async () => {
		provider?.stop(true);
		for (const key of ENV_KEYS) {
			if (savedEnv[key] === undefined) delete process.env[key];
			else process.env[key] = savedEnv[key];
		}
		await removeAuthzDoorFixture();
	});

	test('the door list equals the dispatch registry rows of dd_mcp_api', () => {
		const registered = listRegisteredActions()
			.filter((row) => row.apiClass === 'dd_mcp_api')
			.map((row) => row.action)
			.sort();
		expect(registered.length).toBeGreaterThan(0);
		expect([...DOORS].sort()).toEqual(registered);
	});

	test('the identities are what they claim (non-vacuous contrast)', async () => {
		const { getUserTools } = await import('../../src/core/tools/registry.ts');
		const names = async (userId: number) => (await getUserTools(userId)).map((tool) => tool.name);
		expect(await names(AUTHZ_TOOL_GRANTED_USER_ID)).toContain('tool_assistant');
		expect(await names(AUTHZ_CONTROL_USER_ID)).not.toContain('tool_assistant');
		expect(await names(AUTHZ_DD128_ADMIN_USER_ID)).not.toContain('tool_assistant');
		expect(sessions.ungrantedAdmin?.isGlobalAdmin).toBe(true);
	});

	for (const action of DOORS) {
		describe(`dd_mcp_api:${action}`, () => {
			test('an UNGRANTED non-admin is refused tool.not_authorized (403), before any provider call', async () => {
				const before = providerCalls;
				const result = await call(action, sessions.ungranted as Session);
				expect({ status: result.status, code: errorCode(result.body) }).toEqual({
					status: 403,
					code: 'tool.not_authorized',
				});
				expect(providerCalls).toBe(before);
			});

			test('an UNGRANTED global admin is refused too — no admin bypass on the tool ACL', async () => {
				const result = await call(action, sessions.ungrantedAdmin as Session);
				expect({ status: result.status, code: errorCode(result.body) }).toEqual({
					status: 403,
					code: 'tool.not_authorized',
				});
			});

			test('the GRANTED twin passes the door (no tool.*, no request.unknown_action)', async () => {
				const result = await call(action, sessions.granted as Session);
				const code = errorCode(result.body) ?? '';
				expect(code.startsWith('tool.')).toBe(false);
				expect(code).not.toBe('request.unknown_action');
			});

			test('flag OFF: every user gets request.unknown_action — the flag answers FIRST', async () => {
				process.env.DEDALO_AGENT_HTTP_ENABLED = '';
				try {
					for (const label of ['ungranted', 'ungrantedAdmin', 'granted']) {
						const result = await call(action, sessions[label] as Session);
						expect({ label, code: errorCode(result.body) }).toEqual({
							label,
							code: 'request.unknown_action',
						});
					}
				} finally {
					process.env.DEDALO_AGENT_HTTP_ENABLED = 'true';
				}
			});
		});
	}

	test('a refused stream is a JSON body, never an opened SSE stream', async () => {
		const result = (await call('agent_chat_stream', sessions.ungranted as Session)) as {
			status: number;
			body: unknown;
			stream?: unknown;
		};
		const opened = result.stream !== undefined;
		await (result.stream as ReadableStream | undefined)?.cancel();
		expect(opened).toBe(false);
		expect(errorCode(result.body)).toBe('tool.not_authorized');
	});

	test('the granted stream DOES open (the refusal above is the grant, not a broken stream)', async () => {
		const result = (await call('agent_chat_stream', sessions.granted as Session)) as {
			status: number;
			stream?: ReadableStream<Uint8Array>;
		};
		expect(result.status).toBe(200);
		expect(result.stream).toBeDefined();
		await result.stream?.cancel();
	});
});
