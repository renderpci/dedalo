/**
 * Phase 7 gate (seam item 2): the CSRF handshake matches what the copied
 * client's data_manager implements (SEC-008):
 * - the client sends the token as the `X-Dedalo-Csrf-Token` header (exact
 *   casing it uses) and reads `json.csrf_token` from EVERY response;
 * - a rejection carries result:false + errors including the LITERAL string
 *   'csrf_failed' + a fresh csrf_token, and the client retries exactly once
 *   with that token — so the retry MUST succeed.
 *
 * Exercised over the real HTTP layer (handleRequest with Request objects +
 * session cookie), i.e. the exact path a browser takes.
 */

import { describe, expect, test } from 'bun:test';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { handleRequest } from '../../src/server.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const context = { requestId: 'csrf-test', startedAt: 0 };

function apiRequest(body: unknown, cookie: string, csrfToken?: string): Request {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Cookie: cookie,
	};
	// The client's exact header casing (data_manager SEC-008).
	if (csrfToken !== undefined) headers['X-Dedalo-Csrf-Token'] = csrfToken;
	return new Request('http://localhost/dedalo/core/api/v1/json/', {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
}

/** A CSRF-protected read RQO (read is NOT exempt, matching PHP). */
const READ_RQO = {
	action: 'read',
	dd_api: 'dd_core_api',
	prevent_lock: true,
	source: {
		model: 'section',
		tipo: 'numisdata6',
		section_tipo: 'numisdata6',
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: { section_tipo: ['numisdata6'], limit: 1 },
};

describe('client CSRF handshake (Phase 7 gate, seam item 2)', () => {
	test('rejection carries csrf_failed + a fresh token; the client retry succeeds', async () => {
		const token = createSession(-1, 'root', true);
		const cookie = `dedalo_ts_session=${token}`;

		// 1. The bootstrap race: a non-exempt action fires with a WRONG token.
		const rejected = await handleRequest(apiRequest(READ_RQO, cookie, 'stale-token'), context);
		expect(rejected.status).toBe(403);
		const rejectedBody = (await rejected.json()) as {
			result: boolean;
			errors: string[];
			csrf_token?: string;
		};
		// The exact shape data_manager keys its transparent retry on.
		expect(rejectedBody.result).toBe(false);
		expect(rejectedBody.errors).toContain('csrf_failed');
		expect(typeof rejectedBody.csrf_token).toBe('string');
		expect((rejectedBody.csrf_token as string).length).toBeGreaterThan(0);

		// 2. The single retry with the fresh token from the rejection MUST succeed.
		const retried = await handleRequest(
			apiRequest(READ_RQO, cookie, rejectedBody.csrf_token),
			context,
		);
		expect(retried.status).toBe(200);
		const retriedBody = (await retried.json()) as {
			result: { context: unknown[]; data: unknown[] };
			csrf_token?: string;
		};
		expect(Array.isArray(retriedBody.result.data)).toBe(true);
		// 3. Every successful response also carries the token (client refreshes
		//    its cache from every response).
		expect(retriedBody.csrf_token).toBe(getSession(token)?.csrfToken as string);
	});

	test('exempt actions work without any token (start bootstrap)', async () => {
		const token = createSession(-1, 'root', true);
		const cookie = `dedalo_ts_session=${token}`;
		const response = await handleRequest(
			apiRequest(
				{ action: 'start', dd_api: 'dd_core_api', prevent_lock: true, source: {} },
				cookie,
			),
			context,
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { csrf_token?: string; environment?: unknown };
		// The start response hands the client its first token + the environment.
		expect(typeof body.csrf_token).toBe('string');
		expect(body.environment).toBeDefined();
	});
});
