/**
 * Session lifetime gates (test-quality audit 2026-07-07, security cluster
 * finding #1: the idle-TTL and absolute-lifetime branches of getSession had
 * ZERO tests — deleting either expiry branch, a genuine session-forever
 * regression, kept every gate green).
 *
 * The store runs on the per-test scratch sqlite (S1-18 preload —
 * DEDALO_SESSION_DB_PATH), so this file opens a SECOND connection to the same
 * file to backdate rows: expiry is time-based and the store exposes no clock
 * seam, so the test moves the ROWS through time instead of the clock.
 * WAL mode makes the cross-connection read/write safe (session_store.ts:85).
 */

import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { readEnv } from '../../src/config/env.ts';
import {
	createSession,
	destroyUserSessions,
	getSession,
	pruneExpiredSessions,
	resetSessionStoreForTests,
} from '../../src/core/security/session_store.ts';

const SESSION_DB_PATH = readEnv('DEDALO_SESSION_DB_PATH');
if (SESSION_DB_PATH === undefined) {
	// The S1-18 preload must have pointed the process at a scratch store —
	// backdating rows in the LIVE store would corrupt real sessions.
	throw new Error(
		'session_expiry.test.ts: DEDALO_SESSION_DB_PATH is not set — refusing to run against the live session store (S1-18)',
	);
}
// session_store.ts (imported above, hoisted) has already created the file.
const raw = new Database(SESSION_DB_PATH, { readwrite: true });
raw.exec('PRAGMA busy_timeout = 5000');

/** Same TTL defaults as the catalog — override-aware via readEnv. WC-051 retuned
 * both: 1h idle (an unattended browser is the threat) and a 12h absolute cap. */
const IDLE_TTL_S = Number(readEnv('SESSION_TTL_SECONDS') ?? '3600');
const ABSOLUTE_TTL_S = Number(readEnv('SESSION_ABSOLUTE_TTL_SECONDS') ?? '43200');

function sha256Hex(value: string): string {
	return new Bun.CryptoHasher('sha256').update(value).digest('hex');
}

function backdate(rawToken: string, fields: { lastSeen?: number; createdAt?: number }): void {
	if (fields.lastSeen !== undefined) {
		raw
			.query('UPDATE sessions SET last_seen = ? WHERE token_hash = ?')
			.run(fields.lastSeen, sha256Hex(rawToken));
	}
	if (fields.createdAt !== undefined) {
		raw
			.query('UPDATE sessions SET created_at = ? WHERE token_hash = ?')
			.run(fields.createdAt, sha256Hex(rawToken));
	}
}

function rowExists(rawToken: string): boolean {
	return raw.query('SELECT 1 FROM sessions WHERE token_hash = ?').get(sha256Hex(rawToken)) !== null;
}

function nowSeconds(): number {
	return Math.floor(Date.now() / 1000);
}

describe('session expiry (idle TTL + absolute lifetime cap L3)', () => {
	beforeEach(() => {
		resetSessionStoreForTests();
	});
	afterAll(() => {
		resetSessionStoreForTests();
		raw.close();
	});

	test('control: a fresh session resolves (the expiry tests below cannot pass vacuously)', () => {
		const token = createSession(9001, 'expiry_probe', false);
		const session = getSession(token);
		expect(session).not.toBeNull();
		expect(session?.userId).toBe(9001);
	});

	test('idle TTL: a session unseen past SESSION_TTL_SECONDS is null AND its row is deleted', () => {
		const token = createSession(9001, 'expiry_probe', false);
		backdate(token, { lastSeen: nowSeconds() - IDLE_TTL_S - 10 });
		expect(getSession(token)).toBeNull();
		// The expired row must be destroyed, not just filtered — a lingering row
		// would come back to life if the TTL were ever raised.
		expect(rowExists(token)).toBe(false);
	});

	test('idle TTL boundary: a session seen just INSIDE the TTL still resolves', () => {
		const token = createSession(9001, 'expiry_probe', false);
		backdate(token, { lastSeen: nowSeconds() - IDLE_TTL_S + 60 });
		expect(getSession(token)).not.toBeNull();
	});

	test('absolute cap (L3): a CONTINUOUSLY USED session older than the absolute TTL dies', () => {
		// last_seen is fresh — only the absolute branch can expire this session,
		// so the test proves the cap independently of the idle TTL.
		const token = createSession(9001, 'expiry_probe', false);
		backdate(token, {
			createdAt: nowSeconds() - ABSOLUTE_TTL_S - 10,
			lastSeen: nowSeconds(),
		});
		expect(getSession(token)).toBeNull();
		expect(rowExists(token)).toBe(false);
	});

	test('getSession touches last_seen (the keep-alive that makes the idle TTL sliding)', () => {
		const token = createSession(9001, 'expiry_probe', false);
		const staleButAlive = nowSeconds() - Math.min(IDLE_TTL_S - 60, 3600);
		backdate(token, { lastSeen: staleButAlive });
		expect(getSession(token)).not.toBeNull();
		const row = raw
			.query('SELECT last_seen FROM sessions WHERE token_hash = ?')
			.get(sha256Hex(token)) as { last_seen: number };
		expect(row.last_seen).toBeGreaterThan(staleButAlive);
	});

	test('pruneExpiredSessions GCs only the stale rows', () => {
		const stale = createSession(9001, 'expiry_probe', false);
		const fresh = createSession(9002, 'expiry_probe_fresh', false);
		backdate(stale, { lastSeen: nowSeconds() - IDLE_TTL_S - 10 });
		const pruned = pruneExpiredSessions();
		expect(pruned).toBe(1);
		expect(rowExists(stale)).toBe(false);
		expect(rowExists(fresh)).toBe(true);
	});

	test('pruneExpiredSessions ALSO GCs the absolute-capped rows (WC-051 leak)', () => {
		// The GC swept `last_seen` only, while getSession rejects on EITHER clock.
		// A session kept warm past the absolute cap by a polling client was therefore
		// refused on every request and never deleted — an ever-growing population of
		// exactly the rows the cap exists to remove.
		if (ABSOLUTE_TTL_S <= 0) return; // cap disabled by env override — nothing to prove
		const capped = createSession(9003, 'expiry_probe_capped', false);
		const fresh = createSession(9004, 'expiry_probe_fresh', false);
		// Fresh last_seen: only the absolute branch can select this row.
		backdate(capped, { createdAt: nowSeconds() - ABSOLUTE_TTL_S - 10, lastSeen: nowSeconds() });
		expect(pruneExpiredSessions()).toBe(1);
		expect(rowExists(capped)).toBe(false);
		expect(rowExists(fresh)).toBe(true);
	});

	test('WC-051: a live session reports both clocks for the client warning timer', () => {
		const token = createSession(9005, 'expiry_probe_clocks', false);
		const session = getSession(token);
		// expiresIn is the MIN of the two, measured from the refresh this call just
		// performed — so a fresh session gets the full idle window (the idle term
		// wins unless the absolute cap is nearer).
		expect(session?.expiresIn).toBe(Math.min(IDLE_TTL_S, ABSOLUTE_TTL_S || IDLE_TTL_S));
		// The absolute term is shipped SEPARATELY because it is the one the client
		// cannot re-derive: the idle window restarts on every request, the cap never does.
		if (ABSOLUTE_TTL_S > 0) {
			expect(session?.absoluteExpiresIn).toBe(ABSOLUTE_TTL_S);
		} else {
			expect(session?.absoluteExpiresIn).toBeNull();
		}
	});

	test('WC-051: the absolute deadline SHRINKS with age while the idle window resets', () => {
		if (ABSOLUTE_TTL_S <= 0) return;
		const token = createSession(9006, 'expiry_probe_aging', false);
		const ageSeconds = Math.floor(ABSOLUTE_TTL_S / 2);
		backdate(token, { createdAt: nowSeconds() - ageSeconds, lastSeen: nowSeconds() - 30 });
		const session = getSession(token);
		// Half the cap consumed…
		expect(session?.absoluteExpiresIn).toBeLessThanOrEqual(ABSOLUTE_TTL_S - ageSeconds + 1);
		expect(session?.absoluteExpiresIn).toBeGreaterThanOrEqual(ABSOLUTE_TTL_S - ageSeconds - 1);
		// …while the idle clock was just refreshed by this very getSession.
		expect(session?.expiresIn).toBe(Math.min(IDLE_TTL_S, session?.absoluteExpiresIn ?? 0));
	});
});

describe('destroyUserSessions (AUTHZ-04 "log out everywhere")', () => {
	beforeEach(() => {
		resetSessionStoreForTests();
	});

	test("evicts all of a user's sessions except the kept one; other users untouched", () => {
		const keep = createSession(9001, 'expiry_probe', false);
		createSession(9001, 'expiry_probe', false);
		createSession(9001, 'expiry_probe', false);
		const otherUser = createSession(9002, 'bystander', false);

		const removed = destroyUserSessions(9001, keep);
		expect(removed).toBe(2);
		expect(getSession(keep)).not.toBeNull();
		expect(getSession(otherUser)).not.toBeNull();
	});

	test("without a keep token, ALL of the user's sessions die", () => {
		const a = createSession(9001, 'expiry_probe', false);
		const b = createSession(9001, 'expiry_probe', false);
		const removed = destroyUserSessions(9001);
		expect(removed).toBe(2);
		expect(getSession(a)).toBeNull();
		expect(getSession(b)).toBeNull();
	});
});
