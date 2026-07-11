/**
 * H5 gate: login-throttle hardening.
 *
 *  (1) clientIpFromRequest resolves the client IP from the TRUSTED X-Forwarded-For
 *      hop, never the spoofable left-most entry (which let an attacker rotate a
 *      fake XFF to mint a fresh throttle bucket per request).
 *  (2) The login throttle has an account-global dimension (IP-independent), so
 *      rotating the source IP can no longer evade the per-account lockout.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
	LOGIN_ACCOUNT_MAX_ATTEMPTS,
	buildAccountThrottleKey,
	buildThrottleKey,
	isThrottled,
	recordFailedAttempt,
	resetSessionStoreForTests,
} from '../../src/core/security/session_store.ts';
import { clientIpFromRequest } from '../../src/server.ts';

const req = (headers: Record<string, string>): Request => new Request('http://x/', { headers });

afterEach(() => resetSessionStoreForTests());

describe('clientIpFromRequest — trusted-hop XFF (H5)', () => {
	test('no XFF header → local', () => {
		expect(clientIpFromRequest(req({}))).toBe('local');
	});

	test('a single trusted-proxy hop → the sole entry is the client', () => {
		expect(clientIpFromRequest(req({ 'x-forwarded-for': '203.0.113.7' }))).toBe('203.0.113.7');
	});

	test('a spoofed left-most value is ignored; the trusted right-most wins', () => {
		// Attacker sends "1.2.3.4"; the single trusted proxy appends the real peer.
		expect(clientIpFromRequest(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }))).toBe(
			'203.0.113.7',
		);
	});
});

describe('login throttle — account-global dimension (H5)', () => {
	test('rotating the IP cannot reset the per-account lockout', () => {
		const username = 'victim';
		const accountKey = buildAccountThrottleKey('login', username);
		for (let i = 0; i < LOGIN_ACCOUNT_MAX_ATTEMPTS; i++) {
			const ipKey = buildThrottleKey('login', username, `10.0.0.${i}`); // a fresh IP each time
			recordFailedAttempt(ipKey); // per-IP bucket: a single hit → never trips
			recordFailedAttempt(accountKey); // account bucket: accrues across all IPs
			expect(isThrottled(ipKey)).toBe(false);
		}
		// The IP-independent bucket has crossed its threshold and locks the account.
		expect(isThrottled(accountKey, LOGIN_ACCOUNT_MAX_ATTEMPTS)).toBe(true);
	});

	test('the account key is IP-independent and distinct from the per-IP key', () => {
		expect(buildAccountThrottleKey('login', 'Bob')).toBe('login|acct|bob');
		expect(buildAccountThrottleKey('login', 'Bob')).not.toBe(
			buildThrottleKey('login', 'Bob', '10.0.0.1'),
		);
	});
});
