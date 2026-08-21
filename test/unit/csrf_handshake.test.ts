/**
 * Phase 7 gate (seam item 2): the CSRF handshake matches what the client's
 * data_manager implements (SEC-008), restated on envelope v2 (ERRORS_SPEC §3-4):
 * - the client sends the token as the `X-Dedalo-Csrf-Token` header (exact
 *   casing it uses) and reads `json.csrf_token` from EVERY response;
 * - a rejection is 403 + `error.code === 'auth.csrf_failed'` + a fresh
 *   `csrf_token`, and the client retries exactly once with that token — so the
 *   retry MUST succeed. The PHP-era compat mirror (`result`, `errors:[code]`)
 *   is DELETED (WC-2026-08-16-error-envelope-compat-removal): no body carries a
 *   top-level `result` at all.
 *
 * Exercised over the real HTTP layer (handleRequest with Request objects +
 * session cookie), i.e. the exact path a browser takes.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule). Install tipos
// were replaced by their twins from src/core/test_data/test_tld_tipo_map.json; the
// seed-shipped ones (rsc/dd/hierarchy/ontology/lg) have no twin and stay, because they
// ship with every installation.

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
		tipo: 'testmint1',
		section_tipo: 'testmint1',
		mode: 'list',
		lang: 'lg-spa',
		action: 'search',
	},
	sqo: { section_tipo: ['testmint1'], limit: 1 },
};

describe('client CSRF handshake (Phase 7 gate, seam item 2)', () => {
	test('rejection carries csrf_failed + a fresh token; the client retry succeeds', async () => {
		const token = createSession(-1, 'root', true);
		const cookie = `dedalo_ts_session=${token}`;

		// 1. The bootstrap race: a non-exempt action fires with a WRONG token.
		const rejected = await handleRequest(apiRequest(READ_RQO, cookie, 'stale-token'), context);
		expect(rejected.status).toBe(403);
		const rejectedBody = (await rejected.json()) as {
			ok: boolean;
			error: { code: string; category: string };
			action?: string;
			csrf_token?: string;
		};
		// The exact shape data_manager keys its transparent retry on.
		expect(rejectedBody.ok).toBe(false);
		expect(rejectedBody.error.code).toBe('auth.csrf_failed');
		expect('result' in rejectedBody).toBe(false);
		// The refused action rides as an extension key (it always did).
		expect(rejectedBody.action).toBe('read');
		expect(typeof rejectedBody.csrf_token).toBe('string');
		expect((rejectedBody.csrf_token as string).length).toBeGreaterThan(0);

		// 2. The single retry with the fresh token from the rejection MUST succeed.
		const retried = await handleRequest(
			apiRequest(READ_RQO, cookie, rejectedBody.csrf_token),
			context,
		);
		expect(retried.status).toBe(200);
		const retriedBody = (await retried.json()) as {
			ok: boolean;
			data: { context: unknown[]; data: unknown[] };
			csrf_token?: string;
		};
		expect(retriedBody.ok).toBe(true);
		expect(Array.isArray(retriedBody.data.data)).toBe(true);
		// The payload lives in `data` and nowhere else.
		expect('result' in retriedBody).toBe(false);
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
