/**
 * change_lang — the menu's interface/data language selectors (PHP dd_utils_api::
 * change_lang). Regression coverage for the bug where BOTH selectors were inert:
 * the action was never registered, so dispatch returned 400 and nothing was
 * persisted, so the post-reload page rebuilt with the install-default language.
 *
 * These tests drive the real dispatch chokepoint end-to-end: persist the choice
 * on the session, then confirm the very next request's environment reflects it
 * (via the request-scoped language context) — with zero cross-request bleed.
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
	// A real superuser session (userId -1). createSession returns the raw cookie
	// token; the request context needs both the resolved session and that token.
	token = createSession(-1, 'root', true);
});

afterEach(() => {
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

describe('change_lang action', () => {
	test('persists the data language onto the session', async () => {
		const result = await dispatchRqo(
			{
				dd_api: 'dd_utils_api',
				action: 'change_lang',
				options: { dedalo_data_lang: 'lg-eng' },
			} as Rqo,
			contextFor(token),
		);
		expect(result.status).toBe(200);
		expect(result.body.result).toBe(true);
		// Re-read the session: the choice survived.
		expect(getSession(token)?.dataLang).toBe('lg-eng');
		expect(getSession(token)?.applicationLang).toBeNull(); // untouched
	});

	test('persists the interface (application) language onto the session', async () => {
		await dispatchRqo(
			{
				dd_api: 'dd_utils_api',
				action: 'change_lang',
				options: { dedalo_application_lang: 'lg-cat' },
			} as Rqo,
			contextFor(token),
		);
		expect(getSession(token)?.applicationLang).toBe('lg-cat');
	});

	test('the next request environment reflects the stored languages', async () => {
		// Store both, then ask for the environment on the SAME session.
		await dispatchRqo(
			{
				dd_api: 'dd_utils_api',
				action: 'change_lang',
				options: { dedalo_application_lang: 'lg-cat', dedalo_data_lang: 'lg-eng' },
			} as Rqo,
			contextFor(token),
		);
		const env = await dispatchRqo(
			{ dd_api: 'dd_core_api', action: 'get_environment' } as Rqo,
			contextFor(token),
		);
		const pageGlobals = (env.body.result as { page_globals?: Record<string, unknown> })
			?.page_globals;
		expect(pageGlobals?.dedalo_application_lang).toBe('lg-cat');
		expect(pageGlobals?.dedalo_data_lang).toBe('lg-eng');
	});

	test('rejects an invalid language tag without persisting it (SEC §7.6)', async () => {
		const result = await dispatchRqo(
			{
				dd_api: 'dd_utils_api',
				action: 'change_lang',
				options: { dedalo_data_lang: "lg-eng'; DROP TABLE" },
			} as Rqo,
			contextFor(token),
		);
		expect(result.body.result).toBe(false);
		expect(getSession(token)?.dataLang).toBeNull();
	});

	test('a session with no override falls back to the install default', async () => {
		// No change_lang call — the environment must carry the configured default,
		// proving the override is opt-in and never bleeds from another request.
		const env = await dispatchRqo(
			{ dd_api: 'dd_core_api', action: 'get_environment' } as Rqo,
			contextFor(token),
		);
		const pageGlobals = (env.body.result as { page_globals?: Record<string, unknown> })
			?.page_globals;
		const { config } = await import('../../src/config/config.ts');
		expect(pageGlobals?.dedalo_data_lang).toBe(config.menu.dataLang);
		expect(pageGlobals?.dedalo_application_lang).toBe(config.menu.applicationLang);
	});
});
