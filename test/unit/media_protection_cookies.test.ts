/**
 * THE two-Set-Cookie gate (media protection, Rule A).
 *
 * server.ts must emit the session cookie AND the media-auth cookie as two SEPARATE
 * Set-Cookie headers. It used to build its response headers as a plain
 * `Record<string, string>`, where a second `headers['Set-Cookie'] = …` SILENTLY
 * OVERWRITES the first. That failure is nasty precisely because of how it presents:
 *
 *   - media cookie wins  → the session cookie is dropped → login "mysteriously" fails,
 *     and the plausible-looking fix is to switch media protection off. World-open media,
 *     on a system whose docs say it is protected.
 *   - session cookie wins → every editor 404s on every media file.
 *
 * Set-Cookie is also the one header that must NEVER be comma-folded (RFC 6265 §3), so
 * "just join them" is not a fix either.
 *
 * Exercised over the real HTTP layer (handleRequest + Request/Response), through `quit` —
 * which emits BOTH cookies via exactly the same header-assembly path as login, without
 * needing a real DB user and password.
 */

import { describe, expect, test } from 'bun:test';
import { MEDIA_AUTH_COOKIE } from '../../src/core/media/protection.ts';
import {
	SESSION_COOKIE,
	createSession,
	getSession,
} from '../../src/core/security/session_store.ts';
import { handleRequest } from '../../src/server.ts';
import { registerSessionCleanup } from '../helpers/session_cleanup.ts';

registerSessionCleanup();

const context = { requestId: 'media-cookie-test', startedAt: 0 };

describe('the response carries session and media cookies as SEPARATE headers', () => {
	test('quit emits two distinct Set-Cookie headers, neither clobbering the other', async () => {
		const token = createSession(-1, 'root', true);
		const session = getSession(token);
		expect(session).not.toBeNull();

		const response = await handleRequest(
			new Request('http://localhost/dedalo/core/api/v1/json/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: `${SESSION_COOKIE}=${token}`,
					'X-Dedalo-Csrf-Token': session?.csrfToken ?? '',
				},
				body: JSON.stringify({ action: 'quit', dd_api: 'dd_utils_api' }),
			}),
			context,
		);

		const cookies = response.headers.getSetCookie();

		// The whole point: TWO headers, not one folded/clobbered value.
		expect(cookies).toHaveLength(2);
		expect(cookies.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))).toBe(true);
		expect(cookies.some((cookie) => cookie.startsWith(`${MEDIA_AUTH_COOKIE}=`))).toBe(true);

		// Logout expires both, so the browser actually drops them.
		for (const cookie of cookies) {
			expect(cookie).toContain('Max-Age=0');
			expect(cookie).toContain('HttpOnly');
			expect(cookie).toContain('Path=/');
		}
	});

	test('the media cookie carries the same security attributes as the session cookie', async () => {
		// A Secure session cookie sitting beside a cleartext media cookie would leak an
		// authorization value on a single plaintext hop.
		const token = createSession(-1, 'root', true);
		const session = getSession(token);

		const response = await handleRequest(
			new Request('http://localhost/dedalo/core/api/v1/json/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: `${SESSION_COOKIE}=${token}`,
					'X-Dedalo-Csrf-Token': session?.csrfToken ?? '',
				},
				body: JSON.stringify({ action: 'quit', dd_api: 'dd_utils_api' }),
			}),
			context,
		);

		const cookies = response.headers.getSetCookie();
		const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
		const mediaCookie = cookies.find((cookie) => cookie.startsWith(`${MEDIA_AUTH_COOKIE}=`));
		expect(sessionCookie).toBeDefined();
		expect(mediaCookie).toBeDefined();

		// Secure is governed by one switch (SESSION_COOKIE_SECURE) for both, so the two
		// must always agree on it — whatever this test env has configured.
		expect(mediaCookie?.includes('Secure')).toBe(sessionCookie?.includes('Secure') ?? false);
		expect(mediaCookie).toContain('SameSite=Lax');
	});
});
