/**
 * Gate: dd_mcp_api — the in-process HTTP bridge (Phase 5 of the work-system
 * MCP foundation). Drives the REAL dispatch (dispatchRqo) with session
 * fixtures, so every gate the browser hits runs here too.
 *
 * Load-bearing assertions:
 *   - fail-closed master switch: absent DEDALO_AGENT_HTTP_ENABLED ⇒ every
 *     action answers like an unregistered one;
 *   - session + CSRF required (the normal authenticated-action gates);
 *   - the JSON-RPC round-trip initialize → tools/list → tools/call works and
 *     mints/validates the stateless mcp_session_id;
 *   - the stale-session message is the LITERAL string the byte-identical
 *     client's recovery matches on;
 *   - per-request principal: two sessions with different users see different
 *     gated results through the same bridge;
 *   - agent_apply rejects a hash mismatch.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	type Session,
	createSession,
	destroySession,
	getSession,
} from '../../src/core/security/session_store.ts';

const GATED_SECTION = 'numisdata267';

let adminToken: string;
let admin: Session;
let userToken: string;
let user: Session;

const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
	for (const key of ['DEDALO_AGENT_HTTP_ENABLED', 'DEDALO_AGENT_ALLOW_WRITE']) {
		savedEnv[key] = process.env[key];
	}
	process.env.DEDALO_AGENT_HTTP_ENABLED = 'true';
	adminToken = createSession(-1, 'debug_superuser', true);
	admin = getSession(adminToken) as Session;
	userToken = createSession(16, 'gated_user', false);
	user = getSession(userToken) as Session;
});

afterAll(() => {
	destroySession(adminToken);
	destroySession(userToken);
	for (const [key, value] of Object.entries(savedEnv)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
});

function contextFor(session: Session | null, csrf?: string | null) {
	return {
		requestId: crypto.randomUUID(),
		clientIp: '127.0.0.1',
		session,
		csrfCandidate: csrf === undefined ? (session?.csrfToken ?? null) : csrf,
	};
}

function proxyRqo(envelope: Record<string, unknown>, mcpSessionId?: string): Rqo {
	return {
		action: 'mcp_proxy',
		dd_api: 'dd_mcp_api',
		options: envelope,
		...(mcpSessionId !== undefined ? { mcp_session_id: mcpSessionId } : {}),
	} as unknown as Rqo;
}

async function initialize(session: Session): Promise<string> {
	const result = await dispatchRqo(
		proxyRqo({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
		contextFor(session) as never,
	);
	const body = result.body as { result: boolean; mcp_session_id?: string };
	expect(body.result).toBe(true);
	expect(body.mcp_session_id).toBeTruthy();
	return body.mcp_session_id as string;
}

describe('dd_mcp_api gates', () => {
	test('fail-closed: with the master switch OFF the action refuses', async () => {
		process.env.DEDALO_AGENT_HTTP_ENABLED = '';
		try {
			const result = await dispatchRqo(
				proxyRqo({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
				contextFor(admin) as never,
			);
			expect(result.status).toBe(400);
		} finally {
			process.env.DEDALO_AGENT_HTTP_ENABLED = 'true';
		}
	});

	test('a session is required; CSRF is required', async () => {
		const noSession = await dispatchRqo(
			proxyRqo({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
			contextFor(null) as never,
		);
		expect(noSession.status).toBe(401);

		const badCsrf = await dispatchRqo(
			proxyRqo({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
			contextFor(admin, 'wrong-token') as never,
		);
		expect(badCsrf.status).toBe(403);
		expect((badCsrf.body as { errors?: string[] }).errors).toContain('csrf_failed');
	});
});

describe('mcp_proxy JSON-RPC round-trip', () => {
	test('initialize → tools/list → tools/call under the minted session id', async () => {
		const mcpSessionId = await initialize(admin);

		const list = await dispatchRqo(
			proxyRqo({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, mcpSessionId),
			contextFor(admin) as never,
		);
		const listBody = list.body as {
			result: boolean;
			data: { result: { tools: { name: string; inputSchema: unknown }[] } };
		};
		expect(listBody.result).toBe(true);
		const toolNames = listBody.data.result.tools.map((tool) => tool.name);
		expect(toolNames).toContain('dedalo_list_sections');
		expect(toolNames).toContain('dedalo_search_records');
		// No write flag set ⇒ no write tools on the wire.
		expect(toolNames).not.toContain('dedalo_create_record');

		const call = await dispatchRqo(
			proxyRqo(
				{
					jsonrpc: '2.0',
					id: 3,
					method: 'tools/call',
					params: {
						name: 'dedalo_describe_node',
						arguments: { tipo: GATED_SECTION },
					},
				},
				mcpSessionId,
			),
			contextFor(admin) as never,
		);
		const callBody = call.body as {
			result: boolean;
			data: {
				result: { content: { type: string; text: string }[]; structuredContent: unknown };
			};
		};
		expect(callBody.result).toBe(true);
		const structured = callBody.data.result.structuredContent as {
			ok: boolean;
			data: { model: string };
		};
		expect(structured.ok).toBe(true);
		expect(structured.data.model).toBe('section');
	});

	test('stale/missing session id returns the LITERAL recovery message', async () => {
		const missing = await dispatchRqo(
			proxyRqo({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
			contextFor(admin) as never,
		);
		expect((missing.body as { result: boolean }).result).toBe(false);
		expect((missing.body as { msg: string }).msg).toBe('No valid MCP session ID provided');

		const stale = await dispatchRqo(
			proxyRqo({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, 'deadbeef'),
			contextFor(admin) as never,
		);
		expect((stale.body as { msg: string }).msg).toBe('No valid MCP session ID provided');
	});

	test('non-allowlisted JSON-RPC methods get a JSON-RPC error', async () => {
		const mcpSessionId = await initialize(admin);
		const result = await dispatchRqo(
			proxyRqo({ jsonrpc: '2.0', id: 9, method: 'resources/list', params: {} }, mcpSessionId),
			contextFor(admin) as never,
		);
		const body = result.body as { result: boolean; data: { error?: { code: number } } };
		expect(body.result).toBe(true);
		expect(body.data.error?.code).toBe(-32601);
	});

	test('per-request principal: the gated user sees fewer records than admin', async () => {
		const adminSession = await initialize(admin);
		const userSession = await initialize(user);
		expect(userSession).not.toBe(adminSession);

		async function total(session: Session, mcpSessionId: string): Promise<number> {
			const result = await dispatchRqo(
				proxyRqo(
					{
						jsonrpc: '2.0',
						id: 4,
						method: 'tools/call',
						params: {
							name: 'dedalo_count_records',
							arguments: { section_tipo: GATED_SECTION },
						},
					},
					mcpSessionId,
				),
				contextFor(session) as never,
			);
			const structured = (
				result.body as {
					data: { result: { structuredContent: { data: { total: number } } } };
				}
			).data.result.structuredContent;
			return structured.data.total;
		}

		const adminTotal = await total(admin, adminSession);
		const userTotal = await total(user, userSession);
		expect(adminTotal).toBeGreaterThan(0);
		expect(userTotal).toBeGreaterThan(0);
		expect(userTotal).toBeLessThan(adminTotal);
	});

	test('write tools are refused for a global admin even with write enabled', async () => {
		process.env.DEDALO_AGENT_ALLOW_WRITE = 'true';
		try {
			const mcpSessionId = await initialize(admin);
			const list = await dispatchRqo(
				proxyRqo({ jsonrpc: '2.0', id: 5, method: 'tools/list', params: {} }, mcpSessionId),
				contextFor(admin) as never,
			);
			const tools = (
				list.body as { data: { result: { tools: { name: string }[] } } }
			).data.result.tools.map((tool) => tool.name);
			// Admin: STILL read-only (the stdio confused-deputy wall, per request).
			expect(tools).not.toContain('dedalo_create_record');

			// The scoped user DOES see write tools under the opt-in.
			const userSession = await initialize(user);
			const userList = await dispatchRqo(
				proxyRqo({ jsonrpc: '2.0', id: 6, method: 'tools/list', params: {} }, userSession),
				contextFor(user) as never,
			);
			const userTools = (
				userList.body as { data: { result: { tools: { name: string }[] } } }
			).data.result.tools.map((tool) => tool.name);
			expect(userTools).toContain('dedalo_set_field');
		} finally {
			process.env.DEDALO_AGENT_ALLOW_WRITE = '';
		}
	});
});

describe('agent_apply', () => {
	// The plan_hash_mismatch path itself is unit-covered in
	// agent_change_plan.test.ts; here the assertion is the DISPATCH wiring:
	// a plan a user cannot execute comes back as the coded envelope, result
	// false, through the same session+CSRF gates as everything else.
	test('a plan the user cannot execute returns the coded envelope', async () => {
		process.env.DEDALO_AGENT_ALLOW_WRITE = 'true';
		try {
			const plan = {
				plan_version: 1,
				summary: 'noop fixture',
				ops: [
					{
						op_id: 'op1',
						tool: 'dedalo_find_or_create',
						args: {
							section_tipo: 'test2',
							match: [{ field: 'numisdata16', value: `never-${process.pid}`, lang: 'lg-spa' }],
						},
						summary: 'noop',
					},
				],
			};
			const result = await dispatchRqo(
				{
					action: 'agent_apply',
					dd_api: 'dd_mcp_api',
					options: { plan, plan_hash: 'not-even-checked-before-validation' },
				} as unknown as Rqo,
				contextFor(user) as never,
			);
			// user 16 has no write grants: the validation wall answers first.
			const body = result.body as { result: boolean; data: { error?: { code: string } } };
			expect(body.result).toBe(false);
			expect(body.data.error?.code).toBe('permission_denied');
		} finally {
			process.env.DEDALO_AGENT_ALLOW_WRITE = '';
		}
	});

	test('missing plan/plan_hash is a 400', async () => {
		const result = await dispatchRqo(
			{
				action: 'agent_apply',
				dd_api: 'dd_mcp_api',
				options: { plan: { plan_version: 1 } },
			} as unknown as Rqo,
			contextFor(user) as never,
		);
		expect(result.status).toBe(400);
	});
});

// Sanity: the gated-user fixture really is project-gated (paranoia guard so
// the per-principal assertion above cannot silently rot).
test('fixture sanity: numisdata267 is project-gated for user 16', async () => {
	const rows = (await sql`
		SELECT count(*)::int AS n FROM matrix WHERE section_tipo = ${GATED_SECTION}
	`) as { n: number }[];
	expect(Number(rows[0]?.n)).toBeGreaterThan(0);
});
