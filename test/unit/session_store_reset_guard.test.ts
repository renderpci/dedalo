/**
 * S1-18 gate: the test session store is isolated from the live one.
 *
 * (1) The bunfig [test] preload (test/preload/session_db.ts) must have pointed
 *     session_store at a per-run scratch file BEFORE it was imported — proven
 *     by writing a session and observing the scratch file, not the live path.
 * (2) resetSessionStoreForTests must THROW whenever the resolved store path is
 *     not the DEDALO_SESSION_DB_PATH override (unset, or pointing elsewhere) —
 *     the guard that makes wiping the live ../private store impossible.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import {
	createSession,
	getSession,
	resetSessionStoreForTests,
} from '../../src/core/security/session_store.ts';

const preloadOverride = process.env.DEDALO_SESSION_DB_PATH;

afterEach(() => {
	// Restore the preload's override — other files in the run rely on it.
	// biome-ignore lint/performance/noDelete: assigning undefined leaves the STRING 'undefined' in process.env
	if (preloadOverride === undefined) delete process.env.DEDALO_SESSION_DB_PATH;
	else process.env.DEDALO_SESSION_DB_PATH = preloadOverride;
});

describe('session store test isolation (S1-18)', () => {
	test('preload plumbed the override: sessions land in the scratch file', () => {
		expect(preloadOverride).toBeDefined();
		expect(preloadOverride).not.toContain('private/dedalo_ts_sessions.sqlite');
		const token = createSession(-1, 'root', true);
		expect(getSession(token)).not.toBeNull();
		expect(existsSync(preloadOverride as string)).toBe(true);
	});

	test('reset runs under the matching test override', () => {
		const token = createSession(42, 'someone', false);
		expect(() => resetSessionStoreForTests()).not.toThrow();
		expect(getSession(token)).toBeNull(); // actually wiped
	});

	test('reset throws when the override is unset (store would be the live file)', () => {
		// biome-ignore lint/performance/noDelete: the test NEEDS the key truly unset, not the string 'undefined'
		delete process.env.DEDALO_SESSION_DB_PATH;
		expect(() => resetSessionStoreForTests()).toThrow(/refused/);
	});

	test('reset throws when the override points at a DIFFERENT path than the open store', () => {
		process.env.DEDALO_SESSION_DB_PATH = '/tmp/dedalo_ts_test_sessions-elsewhere.sqlite';
		expect(() => resetSessionStoreForTests()).toThrow(/refused/);
	});
});
