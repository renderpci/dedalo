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

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	MEDIA_AUTH_COOKIE,
	currentMediaAuthCookie,
	initMediaAuthCookie,
	overrideMediaProtectionPathsForTests,
} from '../../src/core/media/protection.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import {
	SESSION_COOKIE,
	SESSION_IDLE_TTL_SECONDS,
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

/**
 * WC-051 — THE MEDIA COOKIE TRACKS THE SESSION.
 *
 * The bug this gates: `dedalo_media_auth` was minted ONLY at login, with a fixed
 * Max-Age=86400, while the session renewed on every request (sliding TTL). Anyone
 * logged in longer than a day kept a perfectly healthy session and lost the cookie —
 * and because the WEB SERVER gates media, not this process, every image/av/pdf/3d
 * 404'd while the app itself looked fine. Rule B could not save them either: without
 * publication markers it never matches, so Rule A is the only door.
 *
 * The reverse leak was live too — a cookie minted just before logout stayed a valid
 * media credential for up to 48h (today+yesterday markers) with no session behind it.
 */
describe('WC-051: the media-auth cookie is re-issued for a live session', () => {
	let scratch: string;

	beforeEach(() => {
		scratch = mkdtempSync(join(tmpdir(), 'dedalo_media_cookie_'));
		mkdirSync(join(scratch, 'media'), { recursive: true });
		overrideMediaProtectionPathsForTests({
			mediaRoot: join(scratch, 'media'),
			authStorePath: join(scratch, 'private', 'media_auth.json'),
		});
		setServerState({ media_access_mode: 'publication' });
		// Lay the store + markers exactly as a login would, so the re-issue path has
		// a value to serve.
		initMediaAuthCookie();
	});

	afterEach(() => {
		setServerState({ media_access_mode: null });
		overrideMediaProtectionPathsForTests(null);
		rmSync(scratch, { recursive: true, force: true });
	});

	/** Any authenticated, CSRF-exempt-free call; `quit` is avoided here because it
	 * deliberately CLEARS both cookies (covered above). */
	async function authenticatedRequest(token: string, cookieHeader: string): Promise<Response> {
		const session = getSession(token);
		return await handleRequest(
			new Request('http://localhost/dedalo/core/api/v1/json/', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Cookie: cookieHeader,
					'X-Dedalo-Csrf-Token': session?.csrfToken ?? '',
				},
				body: JSON.stringify({
					action: 'get_system_info',
					dd_api: 'dd_utils_api',
					prevent_lock: true,
					source: {},
				}),
			}),
			context,
		);
	}

	test('a live session with NO media cookie gets one back', async () => {
		const token = createSession(-1, 'root', true);
		const response = await authenticatedRequest(token, `${SESSION_COOKIE}=${token}`);

		const mediaCookie = response.headers
			.getSetCookie()
			.find((cookie) => cookie.startsWith(`${MEDIA_AUTH_COOKIE}=`));
		expect(mediaCookie).toBeDefined();
		expect(mediaCookie).toContain(`${MEDIA_AUTH_COOKIE}=${currentMediaAuthCookie()}`);
	});

	test('the re-issued Max-Age is the SESSION idle window, not a fixed day', async () => {
		// The load-bearing assertion: a media credential must not outlive the session
		// that earned it, in either direction.
		const token = createSession(-1, 'root', true);
		const response = await authenticatedRequest(token, `${SESSION_COOKIE}=${token}`);

		const mediaCookie = response.headers
			.getSetCookie()
			.find((cookie) => cookie.startsWith(`${MEDIA_AUTH_COOKIE}=`));
		expect(mediaCookie).toContain(`Max-Age=${SESSION_IDLE_TTL_SECONDS}`);
	});

	test('a session already holding the CURRENT value gets no redundant Set-Cookie', async () => {
		// Steady state is every request after the first: re-sending the identical
		// cookie on each one would be pure header weight.
		const token = createSession(-1, 'root', true);
		const current = currentMediaAuthCookie();
		expect(current).not.toBeNull();

		const response = await authenticatedRequest(
			token,
			`${SESSION_COOKIE}=${token}; ${MEDIA_AUTH_COOKIE}=${current}`,
		);
		expect(response.headers.getSetCookie().some((c) => c.startsWith(`${MEDIA_AUTH_COOKIE}=`))).toBe(
			false,
		);
	});

	test('a STALE value is replaced — the day-old-cookie 404 bug', async () => {
		const token = createSession(-1, 'root', true);
		const stale = 'f'.repeat(128); // well-formed, but not today's value
		const response = await authenticatedRequest(
			token,
			`${SESSION_COOKIE}=${token}; ${MEDIA_AUTH_COOKIE}=${stale}`,
		);

		const mediaCookie = response.headers
			.getSetCookie()
			.find((cookie) => cookie.startsWith(`${MEDIA_AUTH_COOKIE}=`));
		expect(mediaCookie).toBeDefined();
		expect(mediaCookie).not.toContain(stale);
		expect(mediaCookie).toContain(`${MEDIA_AUTH_COOKIE}=${currentMediaAuthCookie()}`);
	});

	test('an UNAUTHENTICATED request is never handed a media credential', async () => {
		// The cookie is an authorization value: no session, no cookie, ever.
		const response = await handleRequest(
			new Request('http://localhost/dedalo/core/api/v1/json/', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'get_system_info',
					dd_api: 'dd_utils_api',
					prevent_lock: true,
					source: {},
				}),
			}),
			context,
		);
		expect(response.headers.getSetCookie().some((c) => c.startsWith(`${MEDIA_AUTH_COOKIE}=`))).toBe(
			false,
		);
	});

	test('currentMediaAuthCookie NEVER writes — it runs on every authenticated request', async () => {
		// A writer on this path would rewrite the whole gate (markers + Apache/nginx
		// rule files) under load. Prove it by removing the store and confirming that
		// a read does not recreate it.
		const storePath = join(scratch, 'private', 'media_auth.json');
		expect(existsSync(storePath)).toBe(true);
		rmSync(storePath);
		// Re-point the seam to drop the day cache, so this reads from disk.
		overrideMediaProtectionPathsForTests({
			mediaRoot: join(scratch, 'media'),
			authStorePath: storePath,
		});
		expect(currentMediaAuthCookie()).toBeNull();
		expect(existsSync(storePath)).toBe(false);
	});
});
