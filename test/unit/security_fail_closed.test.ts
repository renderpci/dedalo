/**
 * Phase 5 gate: fail-closed security suite (plan A6 §5).
 *
 * Every bypass the PHP gates block must fail closed here too:
 * unknown api class/action, unauthenticated read, wrong password, brute-force
 * lockout, CSRF for non-exempt actions — plus the positive paths (real login
 * against the shared matrix_users root account, session rotation, throttle
 * reset on success).
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { readEnv } from '../../src/config/env.ts';
import { type ApiRequestContext, dispatchRqo } from '../../src/core/api/dispatch.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { login } from '../../src/core/security/auth.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	LOGIN_MAX_ATTEMPTS,
	buildThrottleKey,
	createSession,
	destroyUserSessions,
	getSession,
	isThrottled,
	recordFailedAttempt,
	resetSessionStoreForTests,
	verifyCsrf,
} from '../../src/core/security/session_store.ts';

const hasRootCreds = Boolean(config.phpReference.username && config.phpReference.password);

function anonymousContext(): ApiRequestContext {
	return { requestId: 'test', clientIp: '127.0.0.1', session: null, csrfCandidate: null };
}

/** An authenticated superuser context with a valid CSRF candidate. */
function authedContext(): ApiRequestContext {
	const token = createSession(-1, 'root', true);
	const session = getSession(token);
	return {
		requestId: 'test',
		clientIp: '127.0.0.1',
		session,
		sessionToken: token,
		csrfCandidate: session?.csrfToken ?? null,
	};
}

describe('fail-closed security suite (Phase 5 gate)', () => {
	beforeEach(resetSessionStoreForTests);

	test('L4: lock endpoints fail closed when section_tipo is absent (gate not skipped)', async () => {
		for (const action of ['update_lock_components_state', 'get_lock_status']) {
			const res = await dispatchRqo(
				{ action, dd_api: 'dd_utils_api', options: {} } as Rqo,
				authedContext(),
			);
			expect(res.status).toBe(400);
			expect(res.body.result).toBe(false);
		}
	});

	test('unknown api class and unknown action are denied identically', async () => {
		const unknownClass = await dispatchRqo(
			{ action: 'read', dd_api: 'evil_api' } as Rqo,
			anonymousContext(),
		);
		expect(unknownClass.status).toBe(400);
		expect(unknownClass.body.result).toBe(false);

		const unknownAction = await dispatchRqo(
			{ action: 'drop_all_tables', dd_api: 'dd_core_api' } as Rqo,
			anonymousContext(),
		);
		expect(unknownAction.status).toBe(400);
		// Identical message — no oracle for which part was wrong.
		expect(unknownAction.body.msg).toBe(unknownClass.body.msg);
	});

	test('inherited Object.prototype keys are NOT dispatchable actions (API-01)', async () => {
		// ACTION_REGISTRY and its per-class tables are plain object literals, so
		// `table[action]` on an inherited key returns an Object.prototype builtin
		// (constructor/toString/valueOf/hasOwnProperty) — not undefined — and
		// action:'constructor' slipped past the old `=== undefined` gate, then threw
		// a raw 500 at the post-handler csrf assignment. Gate 1 now resolves via
		// Object.hasOwn + a typeof-function guard, so every inherited key is an
		// unregistered action → the documented 400 envelope, never a 500.
		const unknownAction = await dispatchRqo(
			{ action: 'drop_all_tables', dd_api: 'dd_core_api' } as Rqo,
			anonymousContext(),
		);
		for (const action of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) {
			const res = await dispatchRqo(
				{ action, dd_api: 'dd_core_api', source: {} } as Rqo,
				authedContext(), // fully authenticated: prove Gate 1 rejects BEFORE the handler
			);
			expect(res.status).toBe(400);
			expect(res.body.result).toBe(false);
			// Same shape as any unregistered action — no distinct 500 / stack.
			expect(res.body.msg).toBe(unknownAction.body.msg);
		}
		// An inherited key in the CLASS (dd_api) position is equally rejected.
		const inheritedClass = await dispatchRqo(
			{ action: 'read', dd_api: 'constructor' } as Rqo,
			anonymousContext(),
		);
		expect(inheritedClass.status).toBe(400);
		expect(inheritedClass.body.result).toBe(false);
	});

	test('maintenance mode is enforced PER REQUEST — a pre-maintenance non-root session is refused (AUTH-05)', async () => {
		const { setServerState } = await import('../../src/core/resolve/server_state.ts');
		// A non-root editor session with a VALID CSRF token, so ONLY the maintenance
		// gate can reject it (isolate Gate 2b from the CSRF gate). userId 4321 ≠ -1.
		const editorToken = createSession(4321, 'editor', false);
		const editorSession = getSession(editorToken);
		const editorCtx: ApiRequestContext = {
			requestId: 'test',
			clientIp: '127.0.0.1',
			session: editorSession,
			sessionToken: editorToken,
			csrfCandidate: editorSession?.csrfToken ?? null,
		};
		setServerState({ maintenance_mode: true });
		try {
			// The login gate blocks NEW logins; this session was minted BEFORE
			// maintenance. PHP verify_login demotes it to unauthenticated per request.
			const blocked = await dispatchRqo(
				{ action: 'get_environment', dd_api: 'dd_core_api' } as Rqo,
				editorCtx,
			);
			expect(blocked.status).toBe(401);
			// Root (superuser) MUST still traverse — it is who lifts maintenance.
			const rootOk = await dispatchRqo(
				{ action: 'get_environment', dd_api: 'dd_core_api' } as Rqo,
				authedContext(),
			);
			expect(rootOk.status).toBe(200);
		} finally {
			setServerState({ maintenance_mode: false });
		}
		// With maintenance OFF the same non-root identity is NOT blocked by this gate.
		const afterToken = createSession(4321, 'editor', false);
		const afterSession = getSession(afterToken);
		const afterCtx: ApiRequestContext = {
			requestId: 'test',
			clientIp: '127.0.0.1',
			session: afterSession,
			sessionToken: afterToken,
			csrfCandidate: afterSession?.csrfToken ?? null,
		};
		const notBlocked = await dispatchRqo(
			{ action: 'get_environment', dd_api: 'dd_core_api' } as Rqo,
			afterCtx,
		);
		expect(notBlocked.status).toBe(200);
	});

	test('unauthenticated read is denied; get_environment is not', async () => {
		const readAttempt = await dispatchRqo(
			{ action: 'read', dd_api: 'dd_core_api', source: { tipo: 'numisdata6' } } as Rqo,
			anonymousContext(),
		);
		expect(readAttempt.status).toBe(401);

		const environment = await dispatchRqo(
			{ action: 'get_environment', dd_api: 'dd_core_api' } as Rqo,
			anonymousContext(),
		);
		expect(environment.status).toBe(200);
		const result = environment.body.result as {
			page_globals: {
				is_logged: boolean;
				dedalo_db_name: unknown;
				pg_version: unknown;
				php_version: unknown;
				php_memory: unknown;
			};
			plain_vars: { SHOW_DEBUG: unknown; SHOW_DEVELOPER: unknown; DEVELOPMENT_SERVER: unknown };
		};
		expect(result.page_globals.is_logged).toBe(false);
		// M1: an UNAUTHENTICATED get_environment must not leak recon-sensitive facts.
		expect(result.page_globals.dedalo_db_name).toBeNull();
		expect(result.page_globals.pg_version).toBeNull();
		expect(result.page_globals.php_version).toBeNull();
		expect(result.page_globals.php_memory).toBeNull();
		expect(result.plain_vars.SHOW_DEBUG).toBe(false);
		expect(result.plain_vars.SHOW_DEVELOPER).toBe(false);
		// DEVELOPMENT_SERVER is deliberately NOT isLogged-gated: PHP emits it
		// pre-auth (get_js_plain_vars) and the login form reads it BEFORE
		// authentication to pick the no-service-worker cache path on dev
		// servers (S1-19). It follows DEDALO_DEV_MODE alone — dev-vs-prod
		// posture only, no debug data. On a production install it is false.
		expect(result.plain_vars.DEVELOPMENT_SERVER).toBe(
			(readEnv('DEDALO_DEV_MODE') ?? 'false') === 'true',
		);
	});

	test('the install surface is GONE (404) once the instance is sealed', async () => {
		// DEC-19: get_install_context / install are pre-auth WHILE UNSEALED
		// (that gate is proven in install_gate.test.ts). A normal configured
		// server is SEALED, so the whole surface must 404 — no residual pre-auth
		// install actions on a live instance. (bun test isolates the state file.)
		const { setServerState } = await import('../../src/core/resolve/server_state.ts');
		setServerState({ install_status: 'sealed' });
		try {
			for (const action of ['get_install_context', 'install']) {
				const res = await dispatchRqo(
					{ action, dd_api: 'dd_utils_api', options: { action: 'set_root_pw' } } as Rqo,
					anonymousContext(),
				);
				expect(res.status).toBe(404);
			}
		} finally {
			setServerState({ install_status: undefined });
		}
	});

	test('wrong password fails ambiguously; nonexistent user fails with the SAME message', async () => {
		const wrongPassword = await login(
			(config.phpReference.username as string) ?? 'root',
			'definitely-wrong-password',
			'127.0.0.1',
		);
		const noSuchUser = await login('no_such_user_zzz', 'whatever', '127.0.0.1');
		expect(wrongPassword.ok).toBe(false);
		expect(noSuchUser.ok).toBe(false);
		expect(wrongPassword.message).toBe(noSuchUser.message); // no existence oracle
	});

	test('brute force locks out after the attempt ceiling (sliding window)', () => {
		const key = buildThrottleKey('login', 'victim', '10.0.0.1');
		expect(isThrottled(key)).toBe(false);
		for (let attempt = 0; attempt < LOGIN_MAX_ATTEMPTS; attempt++) {
			recordFailedAttempt(key);
		}
		expect(isThrottled(key)).toBe(true);
		// A different ip is NOT locked (per-key isolation).
		expect(isThrottled(buildThrottleKey('login', 'victim', '10.0.0.2'))).toBe(false);
	});

	test('real login against shared matrix_users root: session issued + rotation + throttle reset', async () => {
		if (!hasRootCreds) {
			console.warn('[UNCOVERED] root credentials not configured — live login test skipped.');
			return;
		}
		const username = config.phpReference.username as string;
		const password = config.phpReference.password as string;

		// Poison the throttle a bit, then succeed — success must clear it.
		const key = buildThrottleKey('login', username, '127.0.0.1');
		recordFailedAttempt(key);

		const first = await login(username, password, '127.0.0.1');
		expect(first.ok).toBe(true);
		expect(first.userId).toBe(-1);
		expect(isThrottled(key)).toBe(false);

		const second = await login(username, password, '127.0.0.1');
		// Rotation: every login issues a distinct token.
		expect(second.sessionToken).not.toBe(first.sessionToken);

		const session = getSession(first.sessionToken as string);
		expect(session?.isGlobalAdmin).toBe(true);
	});

	test('CSRF: non-exempt actions require the exact session token, constant-time', async () => {
		const rawToken = createSession(42, 'someone', false);
		const session = getSession(rawToken);
		expect(session).not.toBeNull();
		if (session === null) return;
		expect(verifyCsrf(session, session.csrfToken)).toBe(true);
		expect(verifyCsrf(session, 'wrong-token')).toBe(false);
		expect(verifyCsrf(session, '')).toBe(false);
		expect(verifyCsrf(session, null)).toBe(false);
		// Same length but different content must also fail (timingSafeEqual path).
		const sameLength = session.csrfToken.replace(/./, (c) => (c === 'a' ? 'b' : 'a'));
		expect(verifyCsrf(session, sameLength)).toBe(false);
	});

	test('expired/garbage session tokens resolve to null (no partial trust)', () => {
		expect(getSession('not-a-real-token')).toBeNull();
		expect(getSession('')).toBeNull();
	});

	test('single-session eviction keeps the new token and drops the rest (AUTHZ-04)', () => {
		// The mechanism login() runs when DEDALO_SINGLE_SESSION is on: a fresh login
		// evicts the user's OTHER sessions, so a token stolen earlier stops working
		// the moment the victim re-logs-in. destroyUserSessions(userId, keepToken).
		const stolen = createSession(7001, 'multi', false); // an attacker's earlier token
		const other = createSession(7001, 'multi', false); // another device
		const fresh = createSession(7001, 'multi', false); // the just-minted login
		expect(getSession(stolen)).not.toBeNull();
		expect(getSession(other)).not.toBeNull();
		const removed = destroyUserSessions(7001, fresh);
		expect(removed).toBe(2);
		expect(getSession(stolen)).toBeNull(); // the stolen token is now dead
		expect(getSession(other)).toBeNull();
		expect(getSession(fresh)).not.toBeNull(); // the new session survives
		// A DIFFERENT user is untouched (per-user scope).
		const bystander = createSession(7002, 'bystander', false);
		expect(destroyUserSessions(7001, fresh)).toBe(0);
		expect(getSession(bystander)).not.toBeNull();
	});

	test('read gate denies a non-admin on a section their profile does not grant', async () => {
		// User 16 (profile 8) has no grant on numisdata6 → read must 403 at the
		// dispatch gate, before any search runs.
		const principal = await resolvePrincipal(16);
		expect(principal.isGlobalAdmin).toBe(false);
		const context: ApiRequestContext = {
			requestId: 'test',
			clientIp: '127.0.0.1',
			session: {
				userId: 16,
				username: 'user16',
				isGlobalAdmin: false,
				csrfToken: 'x',
				applicationLang: null,
				dataLang: null,
			},
			csrfCandidate: 'x',
			principal,
		};
		const denied = await dispatchRqo(
			{
				action: 'read',
				dd_api: 'dd_core_api',
				source: { model: 'section', tipo: 'numisdata6', section_tipo: 'numisdata6', mode: 'list' },
				sqo: { section_tipo: ['numisdata6'], limit: 5 },
			} as Rqo,
			context,
		);
		expect(denied.status).toBe(403);
		expect(denied.body.result).toBe(false);
	});

	test('superuser passes the read gate (level 3 everywhere)', async () => {
		const principal = await resolvePrincipal(-1);
		const context: ApiRequestContext = {
			requestId: 'test',
			clientIp: '127.0.0.1',
			session: {
				userId: -1,
				username: 'root',
				isGlobalAdmin: true,
				csrfToken: 'x',
				applicationLang: null,
				dataLang: null,
			},
			csrfCandidate: 'x',
			principal,
		};
		const ok = await dispatchRqo(
			{
				action: 'read',
				dd_api: 'dd_core_api',
				source: {
					model: 'section',
					tipo: 'numisdata6',
					section_tipo: 'numisdata6',
					mode: 'list',
					lang: 'lg-spa',
					action: 'search',
				},
				sqo: { section_tipo: ['numisdata6'], limit: 2 },
				show: {
					ddo_map: [
						{
							tipo: 'numisdata16',
							section_tipo: 'self',
							parent: 'self',
							mode: 'list',
							lang: 'lg-spa',
						},
					],
				},
			} as Rqo,
			context,
		);
		expect(ok.status).toBe(200);
		const result = ok.body.result as { data: unknown[] };
		expect(result.data.length).toBeGreaterThan(0);
	});
});
