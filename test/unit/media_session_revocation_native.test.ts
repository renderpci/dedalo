/**
 * THE MEDIA CREDENTIAL IS REVOCABLE (2026-08-24, `WC-2026-08-24-media-auth-session-scoped`).
 *
 * A logged-in user reads media through the WEB SERVER, not through this process: their
 * browser carries `dedalo_media_auth`, and Apache/nginx authorizes by stat()ing a
 * zero-byte marker named by that value. No application process is in the byte path —
 * that is what keeps multi-GB files on sendfile and Range — so while the marker exists,
 * the cookie works, and no session check, principal or password change is consulted.
 *
 * Until this landed the value was one per INSTALL per DAY. Every logged-in editor held
 * the identical cookie, so unlinking its marker on one logout would have locked out all
 * of them; nothing was unlinked, and the consequence was written into the logout handler
 * as a rule: "must NEVER unlink the auth marker". A stolen cookie therefore survived
 * logout AND a password reset for up to ~48 hours (today's and yesterday's markers are
 * both valid) — entirely outside the session store's reach. The password-reset flow,
 * whose whole purpose is cutting off whoever holds a stolen token, could not cut off
 * that one.
 *
 * The credential is now per SESSION and lives on the session row, which makes the marker
 * set a PROJECTION of the sessions table. What this gate holds is that every way a
 * session ends takes its marker with it, and — just as load-bearing — that ending ONE
 * session never touches another's, because that is the property whose absence made the
 * old design unrevokable in the first place.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	dropAuthMarker,
	issueSessionMediaKey,
	layAuthMarker,
	overrideMediaProtectionPathsForTests,
	reconcileAuthMarkers,
} from '../../src/core/media/protection.ts';
import { setServerState } from '../../src/core/resolve/server_state.ts';
import {
	endSession,
	endUserSessions,
	sweepExpiredSessions,
} from '../../src/core/security/session_media.ts';
import { createSession, listActiveMediaKeys } from '../../src/core/security/session_store.ts';
import { markMediaRoot } from '../helpers/media_scratch_root.ts';

let scratch = '';
let authDir = '';

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), 'dedalo_media_revoke_'));
	markMediaRoot(join(scratch, 'media'));
	overrideMediaProtectionPathsForTests({
		mediaRoot: join(scratch, 'media'),
		authStorePath: join(scratch, 'private', 'media_auth.json'),
	});
	setServerState({ media_access_mode: 'private' });
	authDir = join(scratch, 'media', '.publication', 'auth');
});

afterEach(() => {
	setServerState({ media_access_mode: null });
	overrideMediaProtectionPathsForTests(null);
	rmSync(scratch, { recursive: true, force: true });
});

/** Log a user in the way login does: mint the key, then carry it on the session row. */
function loginAs(userId: number): { token: string; key: string } {
	const key = issueSessionMediaKey();
	if (key === null) throw new Error('no media key issued — the seam is not armed');
	return { token: createSession(userId, `user${String(userId)}`, false, key), key };
}

describe('media credential: one per session', () => {
	test('two logins get two different credentials, both live', () => {
		const first = loginAs(101);
		const second = loginAs(102);
		expect(second.key).not.toBe(first.key);
		expect(existsSync(join(authDir, first.key))).toBe(true);
		expect(existsSync(join(authDir, second.key))).toBe(true);
	});

	test('every key matches the strict hex grammar the generated rules capture', () => {
		// The generated Apache/nginx rules capture `[a-f0-9]{128}` and the value becomes
		// a literal FILENAME. If a key could take another shape, either the gate stops
		// matching (media 404s) or a path leaves the marker directory.
		for (let index = 0; index < 5; index++) {
			expect(loginAs(200 + index).key).toMatch(/^[a-f0-9]{128}$/);
		}
	});
});

describe('media credential: revocation', () => {
	test('LOGOUT revokes this session and leaves every other alone', () => {
		// The inversion. The old rule was "logout must never unlink the marker".
		const staying = loginAs(101);
		const leaving = loginAs(102);

		endSession(leaving.token);

		expect(existsSync(join(authDir, leaving.key))).toBe(false);
		expect(existsSync(join(authDir, staying.key))).toBe(true);
	});

	test('a PASSWORD RESET revokes every credential of that user', () => {
		// What the reset could not do before: a reset revoked the tokens and left the
		// media cookie working for up to ~48h, so an attacker locked out of the account
		// kept reading the whole media tree.
		const laptop = loginAs(101);
		const phone = loginAs(101);
		const someoneElse = loginAs(102);

		endUserSessions(101);

		expect(existsSync(join(authDir, laptop.key))).toBe(false);
		expect(existsSync(join(authDir, phone.key))).toBe(false);
		expect(existsSync(join(authDir, someoneElse.key))).toBe(true);
	});

	test('single-session eviction keeps the surviving session usable', () => {
		// endUserSessions(userId, keep) is what login calls under DEDALO_SINGLE_SESSION.
		// If the kept session lost its marker, the policy would log the user out of
		// their own media on every login.
		const old = loginAs(101);
		const fresh = loginAs(101);

		endUserSessions(101, fresh.token);

		expect(existsSync(join(authDir, old.key))).toBe(false);
		expect(existsSync(join(authDir, fresh.key))).toBe(true);
	});

	test('revocation is idempotent and never throws', () => {
		const session = loginAs(101);
		endSession(session.token);
		expect(() => {
			endSession(session.token);
		}).not.toThrow();
		expect(() => {
			dropAuthMarker(session.key);
		}).not.toThrow();
	});

	test('a marker path is never built from an unvetted value', () => {
		// The filename IS the credential, so the hex grammar is the traversal guard.
		const survivor = loginAs(101);
		for (const hostile of ['../../../etc/passwd', '', 'ZZZ', 'a'.repeat(127)]) {
			expect(() => {
				dropAuthMarker(hostile);
			}).not.toThrow();
			expect(() => {
				layAuthMarker(hostile);
			}).not.toThrow();
		}
		expect(existsSync(join(authDir, survivor.key))).toBe(true);
	});
});

describe('media credential: the marker set is a projection of the sessions table', () => {
	test('an ORPHAN marker is collected, a live one is kept', () => {
		// A marker can outlive its row only if the process died between the DELETE and
		// the unlink, or the session database was replaced underneath it.
		const live = loginAs(101);
		const orphan = 'c'.repeat(128);
		layAuthMarker(orphan);
		expect(existsSync(join(authDir, orphan))).toBe(true);

		reconcileAuthMarkers(listActiveMediaKeys());

		expect(existsSync(join(authDir, orphan))).toBe(false);
		expect(existsSync(join(authDir, live.key))).toBe(true);
	});

	test('the sweep prunes, revokes and reconciles in one pass', () => {
		const live = loginAs(101);
		const orphan = 'd'.repeat(128);
		layAuthMarker(orphan);

		sweepExpiredSessions();

		expect(existsSync(join(authDir, orphan))).toBe(false);
		expect(existsSync(join(authDir, live.key))).toBe(true);
	});

	test('every live session key has a marker after a reconcile', () => {
		const sessions = [loginAs(101), loginAs(102), loginAs(103)];
		rmSync(join(scratch, 'media', '.publication'), { recursive: true, force: true });

		reconcileAuthMarkers(listActiveMediaKeys());

		for (const session of sessions) {
			expect(existsSync(join(authDir, session.key))).toBe(true);
		}
	});
});
