/**
 * PHP_CLIENT TESTS
 * Exercises the HTTP bridge to the PHP dd_diffusion_api with a mocked
 * globalThis.fetch: header forwarding, dd_api injection, error mapping
 * and the check_auth contract.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { call_dd_diffusion_api, check_auth } from '../lib/php_client';
import type { rqo } from '../lib/types';

const real_fetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = real_fetch; });

const sample_rqo: rqo = { action: 'diffuse', source: {} };

describe('call_dd_diffusion_api', () => {

	test('injects dd_api and forwards Cookie + CSRF headers', async () => {
		let captured_body: any = null;
		let captured_headers: any = null;

		globalThis.fetch = (async (_url: any, init?: any) => {
			captured_body = JSON.parse(init.body);
			captured_headers = init.headers;
			return Response.json({ result: true, msg: 'ok' });
		}) as unknown as typeof fetch;

		const res = await call_dd_diffusion_api(sample_rqo, 'dedalo_x=abc', 'csrf-123');

		expect(res.result).toBe(true);
		expect(captured_body.dd_api).toBe('dd_diffusion_api');
		expect(captured_body.action).toBe('diffuse');
		expect(captured_headers['Cookie']).toBe('dedalo_x=abc');
		expect(captured_headers['X-Dedalo-Csrf-Token']).toBe('csrf-123');
	});

	test('omits Cookie/CSRF headers when not provided', async () => {
		let captured_headers: any = null;
		globalThis.fetch = (async (_url: any, init?: any) => {
			captured_headers = init.headers;
			return Response.json({ result: true, msg: 'ok' });
		}) as unknown as typeof fetch;

		await call_dd_diffusion_api(sample_rqo);

		expect(captured_headers['Cookie']).toBeUndefined();
		expect(captured_headers['X-Dedalo-Csrf-Token']).toBeUndefined();
	});

	test('maps non-2xx responses to result:false with HTTP error', async () => {
		globalThis.fetch = (async () => new Response('oops', { status: 502, statusText: 'Bad Gateway' })) as unknown as typeof fetch;

		const res = await call_dd_diffusion_api(sample_rqo);

		expect(res.result).toBe(false);
		expect(res.msg).toContain('502');
		expect(res.errors).toContain('HTTP 502');
	});

	test('maps network errors to result:false', async () => {
		globalThis.fetch = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;

		const res = await call_dd_diffusion_api(sample_rqo);

		expect(res.result).toBe(false);
		expect(res.msg).toContain('ECONNREFUSED');
	});

	test('maps invalid JSON body to result:false', async () => {
		globalThis.fetch = (async () => new Response('<html>not json</html>', { status: 200 })) as unknown as typeof fetch;

		const res = await call_dd_diffusion_api(sample_rqo);

		expect(res.result).toBe(false);
	});
});

describe('check_auth', () => {

	test('false without cookie header (no PHP round-trip)', async () => {
		globalThis.fetch = (async () => { throw new Error('must not be called'); }) as unknown as typeof fetch;
		expect(await check_auth(null)).toBe(false);
		expect(await check_auth(undefined)).toBe(false);
	});

	test('true when PHP reports is_logged', async () => {
		globalThis.fetch = (async () => Response.json({ result: { page_globals: { is_logged: true } } })) as unknown as typeof fetch;
		expect(await check_auth('dedalo_x=abc')).toBe(true);
	});

	test('false when PHP reports not logged', async () => {
		globalThis.fetch = (async () => Response.json({ result: { page_globals: { is_logged: false } } })) as unknown as typeof fetch;
		expect(await check_auth('dedalo_x=abc')).toBe(false);
	});

	test('false on non-2xx and on network error', async () => {
		globalThis.fetch = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
		expect(await check_auth('dedalo_x=abc')).toBe(false);

		globalThis.fetch = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
		expect(await check_auth('dedalo_x=abc')).toBe(false);
	});
});
