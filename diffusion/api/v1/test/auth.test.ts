/**
 * AUTH TESTS
 * check_server_auth: internal-token short-circuit (no PHP round-trip)
 * and session fallback. The pure token comparison is covered in
 * delete_record.test.ts.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { check_server_auth } from '../lib/auth';

const real_fetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = real_fetch;
	delete process.env.DIFFUSION_INTERNAL_TOKEN;
});

function request_with_token(token?: string): Request {
	return new Request('http://localhost/', {
		method: 'POST',
		headers: token ? { 'X-Diffusion-Internal-Token': token } : {},
	});
}

describe('check_server_auth', () => {

	test('valid internal token short-circuits without calling PHP', async () => {
		process.env.DIFFUSION_INTERNAL_TOKEN = 'tok-123456';
		globalThis.fetch = (async () => { throw new Error('PHP must not be called'); }) as unknown as typeof fetch;

		const ok = await check_server_auth(null, request_with_token('tok-123456'));
		expect(ok).toBe(true);
	});

	test('invalid token falls back to session check', async () => {
		process.env.DIFFUSION_INTERNAL_TOKEN = 'tok-123456';
		globalThis.fetch = (async () => Response.json({ result: { page_globals: { is_logged: true } } })) as unknown as typeof fetch;

		const ok = await check_server_auth('dedalo_x=abc', request_with_token('wrong-token'));
		expect(ok).toBe(true); // session saved it
	});

	test('no token and no session is rejected', async () => {
		globalThis.fetch = (async () => Response.json({ result: { page_globals: { is_logged: false } } })) as unknown as typeof fetch;

		const ok = await check_server_auth(null, request_with_token());
		expect(ok).toBe(false);
	});
});
