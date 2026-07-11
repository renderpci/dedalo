/**
 * quit — the menu's log-out button (PHP dd_utils_api::quit). Regression coverage
 * for the bug where log out was inert: the action was never registered, so
 * dispatch returned 400, the client's result===true branch never ran, and — the
 * real defect — the server-side session was never destroyed, leaving the user
 * authenticated even after the client redirected to the login page.
 *
 * These tests drive the real dispatch chokepoint: a valid session logs out, the
 * session is gone afterwards, and the result carries the cookie-clearing flag the
 * router turns into an expiring Set-Cookie.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import {
	createSession,
	destroySession,
	getSession,
} from '../../src/core/security/session_store.ts';

let token: string;

beforeEach(() => {
	// A real superuser session (userId -1). createSession returns the raw cookie token.
	token = createSession(-1, 'root', true);
});

afterEach(() => {
	// Idempotent: quit already destroyed it in the happy path.
	destroySession(token);
});

/** An authenticated, CSRF-valid context for the freshly-created session. */
function contextFor(rawToken: string): ApiRequestContext {
	const session = getSession(rawToken);
	if (session === null) throw new Error('session vanished');
	return {
		requestId: 'test',
		clientIp: '127.0.0.1',
		session,
		sessionToken: rawToken,
		csrfCandidate: session.csrfToken, // pass the CSRF gate
	};
}

describe('quit action', () => {
	test('returns result:true and signals the cookie clear', async () => {
		const result = await dispatchRqo(
			{ dd_api: 'dd_utils_api', action: 'quit', options: {} } as Rqo,
			contextFor(token),
		);
		expect(result.status).toBe(200);
		expect(result.body.result).toBe(true);
		expect(result.clearSessionCookie).toBe(true);
	});

	test('destroys the server-side session so it is no longer valid', async () => {
		await dispatchRqo(
			{ dd_api: 'dd_utils_api', action: 'quit', options: {} } as Rqo,
			contextFor(token),
		);
		// The core of the bug: after logout the token must resolve to nothing.
		expect(getSession(token)).toBeNull();
	});

	test('a subsequent authenticated request on the killed session is rejected', async () => {
		const ctx = contextFor(token); // capture BEFORE the session dies
		await dispatchRqo({ dd_api: 'dd_utils_api', action: 'quit', options: {} } as Rqo, ctx);
		// Re-resolve the session from the now-dead token: gate 2 (auth) must reject.
		const after = await dispatchRqo({ dd_api: 'dd_core_api', action: 'get_environment' } as Rqo, {
			...ctx,
			session: getSession(token),
		});
		expect(after.body.result).not.toBe(true);
	});

	test('requires a session — anonymous quit is rejected', async () => {
		const result = await dispatchRqo(
			{ dd_api: 'dd_utils_api', action: 'quit', options: {} } as Rqo,
			{
				requestId: 'test',
				clientIp: '127.0.0.1',
				session: null,
				sessionToken: null,
				csrfCandidate: null,
			},
		);
		expect(result.status).toBe(401);
	});
});
