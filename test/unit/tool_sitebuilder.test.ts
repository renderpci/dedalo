/**
 * tool_sitebuilder proxy — unit tests against a mock daemon.
 *
 * The engine config is frozen at import, so we mock.module the config module to point the
 * tool at a real in-test Bun.serve standing in for the Site Builder daemon. That mock
 * server records every request, so we can assert the proxy attaches the bearer token and
 * the acting-user identity, maps daemon errors onto stable codes, enforces the publish
 * gate, and forwards the SSE stream byte-for-byte with the anti-buffering header.
 *
 * config.siteBuilder is a MUTABLE object here on purpose: daemon_client reads it per call,
 * so a test can flip the URL (to a dead port, or undefined) to exercise the unreachable
 * and unconfigured paths.
 */

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import * as realConfigModule from '../../src/config/config.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { ToolActionContext, ToolServerModule } from '../../src/core/tools/module.ts';

// SNAPSHOT the real exports by spread BEFORE any mock.module runs (the code_update.test.ts
// convention). The namespace object itself is a LIVE view: once the module is mocked it
// reflects the mock, so re-installing the bare namespace in afterAll would re-install the
// mock and leak it into every later test file in a full-suite run.
const REAL_CONFIG_MODULE = { ...realConfigModule };

interface RecordedRequest {
	method: string;
	path: string;
	auth: string | null;
	userId: string | null;
	username: string | null;
	body: unknown;
}

const requests: RecordedRequest[] = [];
let server: ReturnType<typeof Bun.serve>;
// Mutable so tests can point it at a dead port / undefined.
const siteBuilder = { url: '', token: 'test-token-abc', timeoutMs: 3000 } as {
	url: string | undefined;
	token: string | undefined;
	timeoutMs: number;
};

let tool: ToolServerModule;

function ctx(principal: Principal, options: Record<string, unknown>): ToolActionContext {
	return { principal, userId: principal.userId, options, background: false };
}

const DEV: Principal = { userId: 7, isGlobalAdmin: false, isDeveloper: true };
const ADMIN: Principal = { userId: 8, isGlobalAdmin: true, isDeveloper: false };
const PLAIN: Principal = { userId: 9, isGlobalAdmin: false, isDeveloper: false };

beforeAll(async () => {
	server = Bun.serve({
		port: 0,
		async fetch(req) {
			const url = new URL(req.url);
			let body: unknown = undefined;
			if (req.method !== 'GET') {
				const text = await req.text();
				body = text ? JSON.parse(text) : undefined;
			}
			requests.push({
				method: req.method,
				path: url.pathname + url.search,
				auth: req.headers.get('authorization'),
				userId: req.headers.get('x-dedalo-user-id'),
				username: req.headers.get('x-dedalo-username'),
				body,
			});

			// Canned responses keyed by path.
			if (url.pathname === '/health') {
				return Response.json({ service: 'dedalo-site-builder', drivers: [] });
			}
			if (url.pathname === '/v1/sites' && req.method === 'GET') {
				return Response.json({ data: [{ manifest: { slug: 'demo' } }] });
			}
			if (url.pathname === '/v1/sites' && req.method === 'POST') {
				return Response.json(
					{ manifest: { slug: (body as { slug: string }).slug } },
					{ status: 201 },
				);
			}
			if (url.pathname === '/v1/sites/demo/publish') {
				return Response.json({ release: 'r1', url: 'http://prod/demo/' });
			}
			if (url.pathname === '/v1/audit') {
				return Response.json({ data: [{ action: 'publish', site: 'demo' }] });
			}
			if (url.pathname === '/force-403') {
				return Response.json({ title: 'Unauthorized' }, { status: 403 });
			}
			if (url.pathname === '/v1/sites/rejectme/sessions') {
				return Response.json({ detail: 'A session is already running' }, { status: 409 });
			}
			if (url.pathname.endsWith('/events')) {
				const sse =
					'id: 0\ndata: {"seq":0,"body":{"type":"turn_start"}}\n\nid: 1\ndata: {"seq":1,"body":{"type":"turn_end","state":"idle"}}\n\n';
				return new Response(sse, { headers: { 'Content-Type': 'text/event-stream' } });
			}
			return Response.json({ detail: 'not found' }, { status: 404 });
		},
	});
	siteBuilder.url = `http://127.0.0.1:${server.port}`;

	mock.module('../../src/config/config.ts', () => ({
		...REAL_CONFIG_MODULE,
		config: { ...REAL_CONFIG_MODULE.config, siteBuilder },
	}));

	// Import AFTER the mock so daemon_client/index bind to the mocked config.
	({ tool } = await import('../../tools/tool_sitebuilder/server/index.ts'));
});

afterAll(() => {
	server.stop(true);
	mock.module('../../src/config/config.ts', () => REAL_CONFIG_MODULE);
	mock.restore();
});

function lastRequest(): RecordedRequest {
	return requests[requests.length - 1]!;
}

describe('tool_sitebuilder proxy', () => {
	test('isAvailable reflects configuration', () => {
		expect(
			tool.isAvailable?.({
				callerModel: 'section',
				tipo: '',
				sectionTipo: '',
				isComponent: false,
				mode: 'list',
			}),
		).toBe(true);
	});

	test('list_sites forwards with bearer token and acting-user headers', async () => {
		const res = await tool.apiActions.list_sites!.handler(ctx(DEV, {}));
		expect(res.result).toEqual({ data: [{ manifest: { slug: 'demo' } }] });
		const req = lastRequest();
		expect(req.auth).toBe('Bearer test-token-abc');
		expect(req.userId).toBe('7');
		expect(req.username).toBe('user_7');
	});

	test('the token never appears in a serialized ToolResponse', async () => {
		const res = await tool.apiActions.list_sites!.handler(ctx(DEV, {}));
		expect(JSON.stringify(res)).not.toContain('test-token-abc');
	});

	test('create_site validates the slug before proxying and sends the actor in the body', async () => {
		const bad = await tool.apiActions.create_site!.handler(
			ctx(DEV, { slug: 'Bad Slug', name: 'x' }),
		);
		expect(bad.result).toBe(false);
		expect(bad.errors).toContain('site_builder_rejected');

		const good = await tool.apiActions.create_site!.handler(
			ctx(DEV, { slug: 'demo', name: 'Demo' }),
		);
		expect(good.result).toEqual({ manifest: { slug: 'demo' } });
		const req = lastRequest();
		expect(req.body).toMatchObject({
			slug: 'demo',
			name: 'Demo',
			actor: { user_id: 7, username: 'user_7' },
		});
	});

	test('publish is denied to a plain user, allowed to a developer and a global admin', async () => {
		const denied = await tool.apiActions.publish!.handler(
			ctx(PLAIN, { slug: 'demo', confirm: true }),
		);
		expect(denied.result).toBe(false);
		expect(denied.errors).toContain('site_builder_rejected');

		// Developer, but no confirm → rejected before proxying.
		const noConfirm = await tool.apiActions.publish!.handler(ctx(DEV, { slug: 'demo' }));
		expect(noConfirm.result).toBe(false);

		const dev = await tool.apiActions.publish!.handler(ctx(DEV, { slug: 'demo', confirm: true }));
		expect(dev.result).toMatchObject({ release: 'r1' });

		const admin = await tool.apiActions.publish!.handler(
			ctx(ADMIN, { slug: 'demo', confirm: true }),
		);
		expect(admin.result).toMatchObject({ release: 'r1' });
	});

	test('get_audit is developer/admin-gated', async () => {
		const denied = await tool.apiActions.get_audit!.handler(ctx(PLAIN, {}));
		expect(denied.result).toBe(false);
		const allowed = await tool.apiActions.get_audit!.handler(ctx(ADMIN, {}));
		expect(allowed.result).toMatchObject({ data: [{ action: 'publish' }] });
	});

	test('a daemon 4xx with a reason maps to site_builder_rejected with the detail', async () => {
		const res = await tool.apiActions.session_start!.handler(
			ctx(DEV, { slug: 'rejectme', prompt: 'go' }),
		);
		expect(res.result).toBe(false);
		expect(res.errors).toContain('site_builder_rejected');
		expect(res.msg).toContain('already running');
	});

	test('get_status reports reachable true, and false when the daemon is down', async () => {
		const up = await tool.apiActions.get_status!.handler(ctx(DEV, {}));
		expect(up.result).toMatchObject({ configured: true, reachable: true, can_publish: true });

		const savedUrl = siteBuilder.url;
		siteBuilder.url = 'http://127.0.0.1:1'; // nothing listening
		const down = await tool.apiActions.get_status!.handler(ctx(PLAIN, {}));
		expect(down.result).toMatchObject({ configured: true, reachable: false, can_publish: false });
		siteBuilder.url = savedUrl;
	});

	test('unconfigured install: every action fails closed and isAvailable is false', async () => {
		const savedUrl = siteBuilder.url;
		siteBuilder.url = undefined;
		expect(
			tool.isAvailable?.({
				callerModel: 'section',
				tipo: '',
				sectionTipo: '',
				isComponent: false,
				mode: 'list',
			}),
		).toBe(false);
		const res = await tool.apiActions.list_sites!.handler(ctx(DEV, {}));
		expect(res.errors).toContain('site_builder_unconfigured');
		siteBuilder.url = savedUrl;
	});

	test('session_stream forwards the SSE bytes and sets the anti-buffering header', async () => {
		const res = await tool.apiActions.session_stream!.handler(
			ctx(DEV, { session_id: 'abc', after: -1 }),
		);
		expect(res.result).toBe(true);
		expect(res.streamContentType).toContain('text/event-stream');
		expect((res.streamHeaders as Record<string, string>)['X-Accel-Buffering']).toBe('no');

		const stream = res.stream as ReadableStream<Uint8Array>;
		const text = await new Response(stream).text();
		expect(text).toContain('"type":"turn_start"');
		expect(text).toContain('"type":"turn_end"');
	});
});
