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
import { refusalOf } from '../helpers/refusal.ts';

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
			let body: unknown;
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
			if (url.pathname.startsWith('/v1/sites/') && req.method === 'DELETE') {
				return Response.json({
					deleted: url.pathname.split('/')[3],
					purged_prod: url.searchParams.get('purge_prod') === 'true',
				});
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
		expect(res.data).toEqual({ data: [{ manifest: { slug: 'demo' } }] });
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
		const bad = await refusalOf(
			tool.apiActions.create_site!.handler(ctx(DEV, { slug: 'Bad Slug', name: 'x' })),
		);
		expect(bad.code).toBe('site_builder.rejected');
		// Engine-authored prose, so it DOES reach the wire (public disclosure).
		expect(bad.publicMessage).toBe('Invalid site name.');

		const good = await tool.apiActions.create_site!.handler(
			ctx(DEV, { slug: 'demo', name: 'Demo' }),
		);
		expect(good.data).toEqual({ manifest: { slug: 'demo' } });
		const req = lastRequest();
		expect(req.body).toMatchObject({
			slug: 'demo',
			name: 'Demo',
			actor: { user_id: 7, username: 'user_7' },
		});
	});

	test('publish is denied to a plain user, allowed to a developer and a global admin', async () => {
		const denied = await refusalOf(
			tool.apiActions.publish!.handler(ctx(PLAIN, { slug: 'demo', confirm: true })),
		);
		expect(denied.code).toBe('site_builder.rejected');

		// Developer, but no confirm → rejected before proxying.
		const noConfirm = await refusalOf(tool.apiActions.publish!.handler(ctx(DEV, { slug: 'demo' })));
		expect(noConfirm.publicMessage).toBe('Publishing must be confirmed.');

		const dev = await tool.apiActions.publish!.handler(ctx(DEV, { slug: 'demo', confirm: true }));
		expect(dev.data).toMatchObject({ release: 'r1' });

		const admin = await tool.apiActions.publish!.handler(
			ctx(ADMIN, { slug: 'demo', confirm: true }),
		);
		expect(admin.data).toMatchObject({ release: 'r1' });
	});

	/**
	 * The delete_site gate (audit §4.3). The line is drawn where the daemon draws it:
	 * `deleteSite(slug, purgeProd)` (site_builder src/sites/workspace.ts) unconditionally
	 * removes the WORKSPACE + preprod copy — builder-owned state that create_site/build
	 * (ungated beyond the tool grant) produced, and whose prod release history survives, so
	 * re-creating the slug restores rollback. Only `purgeProd` touches config.PROD_ROOT: it
	 * deletes the LIVE copy and its .releases history. That is the destructive half of
	 * publish, so it takes publish's gate — publisher AND an explicit confirm — because a
	 * user who cannot take a site live must not be able to take it down, and an unconfirmed
	 * call must not be able to either.
	 */
	test('delete_site without purge_prod is ordinary tool work for any grantee', async () => {
		const res = await tool.apiActions.delete_site!.handler(ctx(PLAIN, { slug: 'demo' }));
		expect(res.data).toMatchObject({ deleted: 'demo', purged_prod: false });
		const req = lastRequest();
		expect(req.method).toBe('DELETE');
		expect(req.path).toBe('/v1/sites/demo');
		expect(req.body).toMatchObject({ actor: { user_id: 9 } });
	});

	test('delete_site --purge_prod is refused to a plain user and never reaches the daemon', async () => {
		const before = requests.length;
		const denied = await refusalOf(
			tool.apiActions.delete_site!.handler(
				ctx(PLAIN, { slug: 'demo', purge_prod: true, confirm: true }),
			),
		);
		expect(denied.code).toBe('site_builder.rejected');
		// Fails closed BEFORE the proxy call: the daemon trusts us entirely, so a refusal
		// that still sent the DELETE would have purged production anyway.
		expect(requests.length).toBe(before);
	});

	test('delete_site --purge_prod requires an explicit confirm, even for a developer', async () => {
		const before = requests.length;
		const refusal = await refusalOf(
			tool.apiActions.delete_site!.handler(ctx(DEV, { slug: 'demo', purge_prod: true })),
		);
		expect(refusal.code).toBe('site_builder.rejected');
		expect(refusal.publicMessage).toBe('Removing the published site must be confirmed.');
		expect(requests.length).toBe(before);
	});

	test('delete_site --purge_prod is allowed to a developer and a global admin, confirmed', async () => {
		const dev = await tool.apiActions.delete_site!.handler(
			ctx(DEV, { slug: 'demo', purge_prod: true, confirm: true }),
		);
		expect(dev.data).toMatchObject({ deleted: 'demo', purged_prod: true });
		expect(lastRequest().path).toBe('/v1/sites/demo?purge_prod=true');

		const admin = await tool.apiActions.delete_site!.handler(
			ctx(ADMIN, { slug: 'demo', purge_prod: true, confirm: true }),
		);
		expect(admin.data).toMatchObject({ purged_prod: true });
		expect(lastRequest().path).toBe('/v1/sites/demo?purge_prod=true');
	});

	test('get_audit is developer/admin-gated', async () => {
		const denied = await refusalOf(tool.apiActions.get_audit!.handler(ctx(PLAIN, {})));
		expect(denied.code).toBe('site_builder.rejected');
		const allowed = await tool.apiActions.get_audit!.handler(ctx(ADMIN, {}));
		expect(allowed.data).toMatchObject({ data: [{ action: 'publish' }] });
	});

	test('a daemon 4xx maps to site_builder.rejected, and its prose stays OFF the wire', async () => {
		const refusal = await refusalOf(
			tool.apiActions.session_start!.handler(ctx(DEV, { slug: 'rejectme', prompt: 'go' })),
		);
		expect(refusal.code).toBe('site_builder.rejected');
		// The daemon's own detail is LOG-only: it is on `message`…
		expect(refusal.message).toContain('already running');
		// …and NEVER offered as the vetted public sentence, so another service can
		// never write this install's browser-facing error text.
		expect(refusal.publicMessage).toBeUndefined();
	});

	test('get_status reports reachable true, and false when the daemon is down', async () => {
		const up = await tool.apiActions.get_status!.handler(ctx(DEV, {}));
		expect(up.data).toMatchObject({ configured: true, reachable: true, can_publish: true });

		const savedUrl = siteBuilder.url;
		siteBuilder.url = 'http://127.0.0.1:1'; // nothing listening
		const down = await tool.apiActions.get_status!.handler(ctx(PLAIN, {}));
		expect(down.data).toMatchObject({ configured: true, reachable: false, can_publish: false });
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
		const refusal = await refusalOf(tool.apiActions.list_sites!.handler(ctx(DEV, {})));
		expect(refusal.code).toBe('site_builder.unconfigured');
		siteBuilder.url = savedUrl;
	});

	test('an id carrying a dot-segment is refused before it can rewrite the daemon path', async () => {
		// `..` passes the character class but the URL parser resolves it away:
		// /v1/sessions/../stop → /v1/stop. Refuse it at the seam, and never reach the daemon.
		const before = requests.length;
		for (const id of ['..', 'a/../b', '..%2e', 'x..y']) {
			const stop = await refusalOf(
				tool.apiActions.session_stop!.handler(ctx(DEV, { session_id: id })),
			);
			expect(stop.code, id).toBe('site_builder.rejected');
		}
		const build = await refusalOf(
			tool.apiActions.get_build!.handler(ctx(DEV, { slug: 'demo', build_id: '..' })),
		);
		expect(build.code).toBe('site_builder.rejected');
		// The stream never opens: the refusal is a throw, so there is no body
		// carrying a half-open stream.
		const stream = await refusalOf(
			tool.apiActions.session_stream!.handler(ctx(DEV, { session_id: '..' })),
		);
		expect(stream.code).toBe('site_builder.rejected');
		// Nothing reached the daemon.
		expect(requests.length).toBe(before);
	});

	test('session_stream forwards the SSE bytes and sets the anti-buffering header', async () => {
		const res = await tool.apiActions.session_stream!.handler(
			ctx(DEV, { session_id: 'abc', after: -1 }),
		);
		expect(res.ok).toBe(true);
		expect(res.streamContentType).toContain('text/event-stream');
		expect((res.streamHeaders as Record<string, string>)['X-Accel-Buffering']).toBe('no');

		const stream = res.stream as ReadableStream<Uint8Array>;
		const text = await new Response(stream).text();
		expect(text).toContain('"type":"turn_start"');
		expect(text).toContain('"type":"turn_end"');
	});
});
