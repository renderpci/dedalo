/**
 * The shared SSRF guard's IP-range vetting (SSRF-01/02, 2026-07-28 audit).
 *
 * The bug it replaces: per-tool STRING BLOCKLISTS that a private address in any
 * non-canonical form walked straight through. isPrivateIp is the deterministic
 * core — resolution + fetch hardening (assertPublicUrl / fetchGuardedText) build
 * on it and are exercised by the tools' own suites.
 */

import { describe, expect, test } from 'bun:test';
import { isPrivateIp } from '../../src/core/security/ssrf_guard.ts';

describe('isPrivateIp — comprehensive private/reserved vetting', () => {
	test('rejects every private/loopback/link-local/reserved IPv4 form', () => {
		for (const ip of [
			'0.0.0.0',
			'127.0.0.1',
			'127.0.0.2', // the old blocklist only caught 127.0.0.1
			'10.1.2.3',
			'172.16.9.9',
			'172.31.255.255',
			'192.168.1.20',
			'169.254.169.254', // cloud metadata
			'169.254.0.5',
			'100.64.0.1', // CGNAT
			'192.0.0.1',
			'198.18.0.1',
			'224.0.0.1', // multicast
			'240.0.0.1', // reserved
		]) {
			expect(isPrivateIp(ip), `${ip} must be private`).toBe(true);
		}
	});

	test('accepts genuine public IPv4', () => {
		for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '203.0.113.10']) {
			expect(isPrivateIp(ip), `${ip} must be public`).toBe(false);
		}
	});

	test('rejects private/loopback/mapped IPv6 forms', () => {
		for (const ip of [
			'::1',
			'::',
			'::ffff:127.0.0.1', // IPv4-mapped loopback
			'::ffff:192.168.0.1', // IPv4-mapped private
			'fc00::1', // ULA
			'fd12:3456::1', // ULA
			'fe80::1', // link-local
		]) {
			expect(isPrivateIp(ip), `${ip} must be private`).toBe(true);
		}
	});

	test('accepts a public IPv6', () => {
		expect(isPrivateIp('2606:4700:4700::1111')).toBe(false); // Cloudflare
	});

	test('a non-IP string is refused (fail closed)', () => {
		expect(isPrivateIp('not-an-ip')).toBe(true);
		expect(isPrivateIp('')).toBe(true);
	});
});
