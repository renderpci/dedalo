/**
 * Client serving gate. SINCE THE 2026-07-11 CUTOVER (runbook §6) the client
 * tree `client/dedalo/` is the PRIMARY, TS-OWNED source — the PHP tree is
 * decommissioned dead code and `scripts/sync_client.sh` is retired. The
 * byte-identity contract therefore became SELF-CONSISTENCY: every asset is
 * served byte-identical to the client tree ON DISK at the SAME /dedalo/*
 * paths (no silent serving-layer rewrites), traversal fails closed, the
 * client's relative API path routes to the TS dispatch, and the validator/
 * gzip semantics hold.
 */

import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { handleRequest } from '../../src/server.ts';

const CLIENT_ROOT = resolve(import.meta.dir, '../../client/dedalo');

function requestFor(path: string, method = 'GET', body?: string): Request {
	return new Request(`http://localhost${path}`, {
		method,
		body,
		headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
	});
}

const context = { requestId: 'test', startedAt: 0 };

/** Serve a path through the TS server and compare bytes with the client tree on disk. */
async function expectByteIdentical(servedPath: string, clientRelativePath: string): Promise<void> {
	const response = await handleRequest(requestFor(servedPath), context);
	expect(response.status).toBe(200);
	const served = new Uint8Array(await response.arrayBuffer());
	const original = new Uint8Array(
		await Bun.file(resolve(CLIENT_ROOT, clientRelativePath)).arrayBuffer(),
	);
	expect(served.length).toBe(original.length);
	expect(Buffer.from(served).equals(Buffer.from(original))).toBe(true);
}

describe('copied client serving (Phase 7 gate, first slice)', () => {
	test('the page shell serves byte-identical (directory → index.html)', async () => {
		await expectByteIdentical('/dedalo/core/page/', 'core/page/index.html');
		await expectByteIdentical('/dedalo/core/page/index.html', 'core/page/index.html');
	});

	test('client JS modules and CSS serve byte-identical with correct types', async () => {
		await expectByteIdentical('/dedalo/core/page/js/index.js', 'core/page/js/index.js');
		await expectByteIdentical(
			'/dedalo/core/common/js/data_manager.js',
			'core/common/js/data_manager.js',
		);

		// main.css is TS-owned since the cutover — a plain disk compare; the
		// WC-018 error_reports block must still be present exactly once (it is
		// part of the owned file now, not a re-applied append).
		await expectByteIdentical('/dedalo/core/page/css/main.css', 'core/page/css/main.css');
		const cssText = await Bun.file(resolve(CLIENT_ROOT, 'core/page/css/main.css')).text();
		const marker = '/* === error_reports widget (WC-018';
		const first = cssText.indexOf(marker);
		expect(first).toBeGreaterThan(0);
		expect(cssText.indexOf(marker, first + 1)).toBe(-1);

		const jsResponse = await handleRequest(requestFor('/dedalo/core/page/js/index.js'), context);
		expect(jsResponse.headers.get('content-type')).toContain('javascript');
		const cssResponse = await handleRequest(requestFor('/dedalo/core/page/css/main.css'), context);
		expect(cssResponse.headers.get('content-type')).toContain('css');
	});

	test('entry points redirect to the app instead of 404ing', async () => {
		// The client tree has no index.html above core/page/: a user who types the
		// mount point must be carried into the app, as the PHP index.php shims did.
		for (const entry of ['/', '/dedalo', '/dedalo/', '/dedalo/core', '/dedalo/core/']) {
			const response = await handleRequest(requestFor(entry), context);
			expect(response.status).toBe(302);
			expect(response.headers.get('location')).toBe('/dedalo/core/page/');
		}
	});

	test('a directory URL without its trailing slash redirects (relative assets)', async () => {
		// index.html asks for "js/index.js" RELATIVELY — served at /dedalo/core/page
		// that resolves to /dedalo/core/js/index.js and the client boots blank.
		const response = await handleRequest(requestFor('/dedalo/core/page/js'), context);
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/dedalo/core/page/js/');

		// The query string survives the normalization.
		const withQuery = await handleRequest(requestFor('/dedalo/core/page?tipo=x'), context);
		expect(withQuery.status).toBe(302);
		expect(withQuery.headers.get('location')).toBe('/dedalo/core/page/?tipo=x');
	});

	test('path traversal outside the client root fails closed (404)', async () => {
		for (const attempt of [
			'/dedalo/../private/.env',
			'/dedalo/..%2f..%2fprivate/.env',
			'/dedalo/core/../../../../etc/passwd',
		]) {
			const response = await handleRequest(requestFor(attempt), context);
			expect(response.status).toBe(404);
		}
	});

	test("the client's relative API path routes to the TS dispatch", async () => {
		// From /dedalo/core/page/ the data_manager fallback '../api/v1/json/'
		// resolves to /dedalo/core/api/v1/json/ — a malformed body must reach the
		// API handler (400 Invalid JSON), not the static 404.
		const response = await handleRequest(
			requestFor('/dedalo/core/api/v1/json/', 'POST', 'not-json'),
			context,
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { msg: string };
		expect(body.msg).toContain('Invalid JSON');
	});

	test('assets carry validators and answer conditional requests with 304', async () => {
		// The client's service worker replays If-None-Match/If-Modified-Since
		// (worker_cache.js) — a re-synced-in-place tree needs revalidation, so
		// text assets must expose validators and honour them (boot-probe gap:
		// TS served 0/25 with validators vs the PHP oracle's 25/25).
		const first = await handleRequest(requestFor('/dedalo/core/page/js/index.js'), context);
		expect(first.status).toBe(200);
		const etag = first.headers.get('etag');
		expect(etag).not.toBeNull();
		expect(first.headers.get('last-modified')).not.toBeNull();
		expect(first.headers.get('cache-control')).toBe('no-cache');

		const conditional = new Request('http://localhost/dedalo/core/page/js/index.js', {
			headers: { 'If-None-Match': etag as string },
		});
		const revalidated = await handleRequest(conditional, context);
		expect(revalidated.status).toBe(304);
		expect(revalidated.headers.get('etag')).toBe(etag);
		expect(await revalidated.arrayBuffer()).toHaveLength(0);
	});

	test('negotiated gzip round-trips byte-identical and varies by encoding', async () => {
		const identity = await handleRequest(requestFor('/dedalo/core/page/css/main.css'), context);
		const original = new Uint8Array(await identity.arrayBuffer());
		expect(identity.headers.get('content-encoding')).toBeNull();

		const gzipped = await handleRequest(
			new Request('http://localhost/dedalo/core/page/css/main.css', {
				headers: { 'Accept-Encoding': 'gzip, br' },
			}),
			context,
		);
		expect(gzipped.status).toBe(200);
		expect(gzipped.headers.get('content-encoding')).toBe('gzip');
		expect(gzipped.headers.get('vary')).toBe('Accept-Encoding');
		// fetch/Request in Bun does NOT auto-decompress handleRequest's in-process
		// Response — the body is the raw gzip stream; inflate and compare bytes.
		const inflated = Bun.gunzipSync(new Uint8Array(await gzipped.arrayBuffer()));
		expect(inflated.length).toBe(original.length);
		expect(Buffer.from(inflated).equals(Buffer.from(original))).toBe(true);
	});

	test('tool assets gain the security headers + validators (fixed gap)', async () => {
		// tools/serving.ts used to return bare Bun.file responses with no
		// X-Content-Type-Options and no validators — the shared static helper
		// adds both.
		const response = await handleRequest(
			requestFor('/dedalo/tools/tool_export/register.json'),
			context,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
		expect(response.headers.get('etag')).not.toBeNull();
	});
});
