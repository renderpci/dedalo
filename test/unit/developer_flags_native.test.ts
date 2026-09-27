/**
 * The developer/debug surfaces are PER-USER, not server-wide.
 *
 * PHP defined them in boot (core/base/boot/class.boot_web_phases.php):
 *   SHOW_DEBUG     = (logged_user_id() == DEDALO_SUPERUSER)
 *   SHOW_DEVELOPER = (logged_user_is_developer() === true)
 * and the frozen oracle fixture records EXACTLY that
 * (test/parity/fixtures/oracle_harvest/environment_differential.json: a
 * NON-developer on a dev server gets SHOW_DEBUG=false, SHOW_DEVELOPER=false
 * while DEVELOPMENT_SERVER=true).
 *
 * The client's developer/admin info bar renders when
 * `SHOW_DEVELOPER===true || SHOW_DEBUG===true`
 * (client/dedalo/core/menu/js/view_default_edit_menu.js), so this gate pins the
 * DISPLAY criterion the user asked for: the logged user's developer flag, root
 * (superuser) included. DEDALO_DEV_MODE does NOT gate these — it is the SERVER
 * posture (DEVELOPMENT_SERVER, no-cache path, readable libs, test harness).
 *
 * DB-free: buildPlainVars reads no database.
 */

import { describe, expect, test } from 'bun:test';
import { buildPlainVars } from '../../src/core/resolve/environment.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import type { Session } from '../../src/core/security/session_store.ts';

/** Minimal synthetic session — buildPlainVars reads only userId here. */
function session(userId: number): Session {
	return {
		userId,
		username: userId === -1 ? 'root' : `u${userId}`,
		isGlobalAdmin: false,
		csrfToken: 'x',
		applicationLang: null,
		dataLang: null,
	};
}

function principal(userId: number, isDeveloper: boolean): Principal {
	return { userId, isGlobalAdmin: false, isDeveloper };
}

/** The client's info-bar predicate (view_default_edit_menu.js). */
const infoBarVisible = (vars: Record<string, unknown>): boolean =>
	vars.SHOW_DEVELOPER === true || vars.SHOW_DEBUG === true;

describe('developer/debug surfaces follow the logged user (PHP boot semantics)', () => {
	test('anonymous: no developer surface (the login form is never told the posture)', () => {
		const vars = buildPlainVars(null, null);
		expect(vars.SHOW_DEBUG).toBe(false);
		expect(vars.SHOW_DEVELOPER).toBe(false);
		expect(infoBarVisible(vars)).toBe(false);
	});

	test('root (superuser) sees both developer surfaces', () => {
		const vars = buildPlainVars(session(-1), principal(-1, true));
		expect(vars.SHOW_DEBUG).toBe(true);
		expect(vars.SHOW_DEVELOPER).toBe(true);
		expect(infoBarVisible(vars)).toBe(true);
	});

	test('a non-root is_developer user sees the bar (SHOW_DEVELOPER), not SHOW_DEBUG', () => {
		const vars = buildPlainVars(session(16), principal(16, true));
		expect(vars.SHOW_DEVELOPER).toBe(true);
		expect(vars.SHOW_DEBUG).toBe(false);
		expect(infoBarVisible(vars)).toBe(true);
	});

	test('a non-developer sees neither, whatever the server dev posture', () => {
		const vars = buildPlainVars(session(17), principal(17, false));
		expect(vars.SHOW_DEBUG).toBe(false);
		expect(vars.SHOW_DEVELOPER).toBe(false);
		expect(infoBarVisible(vars)).toBe(false);
		// DEVELOPMENT_SERVER is the SERVER posture and is independent of the user.
		expect(vars.DEVELOPMENT_SERVER).toBe(buildPlainVars(null, null).DEVELOPMENT_SERVER);
	});

	test('the bar tracks the PRINCIPAL, not the login-time snapshot (SEC-14)', () => {
		const s = session(16);
		expect(buildPlainVars(s, principal(16, true)).SHOW_DEVELOPER).toBe(true);
		expect(buildPlainVars(s, principal(16, false)).SHOW_DEVELOPER).toBe(false);
	});
});
