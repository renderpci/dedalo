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
		for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '9.9.9.9']) {
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

	/**
	 * The gaps measured 2026-09-29 (PR #114 review): the old check was a BLOCKLIST of
	 * v6 prefixes, and every one of these was read as PUBLIC. Each is given in the
	 * spelling the URL parser actually hands the guard (`new URL(…).hostname`), since
	 * that — not the textbook form — is what arrives.
	 */
	test('rejects every IPv6 form that reaches a private address, in its URL spelling', () => {
		for (const literal of [
			'[::127.0.0.1]', // IPv4-compatible (deprecated) loopback
			'[::ffff:0:7f00:1]', // IPv4-translated (SIIT) loopback
			'[::ffff:0:a9fe:a9fe]', // SIIT → cloud metadata
			'[64:ff9b::a9fe:a9fe]', // NAT64 → cloud metadata
			'[64:ff9b::127.0.0.1]', // NAT64 → loopback, dotted
			'[64:ff9b:1::5db8:d822]', // local-use NAT64: the translator is inside
			'[2002:7f00:1::]', // 6to4 → loopback
			'[2002:a00:1::1]', // 6to4 → 10.0.0.1
			'[2001::1]', // Teredo
			'[2001:db8::1]', // documentation
			'[3fff::1]', // documentation (RFC 9637)
			'[fec0::1]', // deprecated site-local
			'[ff02::1]', // multicast
			'[100::1]', // discard-only
			'[0:0:0:0:0:0:0:1]', // loopback, long form
			'[FE80::1]', // link-local, upper case
		]) {
			const host = new URL(`http://${literal}/`).hostname.replace(/^\[|\]$/g, '');
			expect(isPrivateIp(host), `${literal} (arrives as ${host}) must be private`).toBe(true);
		}
	});

	test('an IPv4-carrying IPv6 address to a PUBLIC host stays public', () => {
		// The fix vets the embedded IPv4 rather than refusing the prefix wholesale: an
		// IPv6-only host with DNS64 reaches the whole v4 internet through 64:ff9b::/96.
		for (const ip of [
			'::ffff:93.184.216.34', // mapped, dotted — the text fold must not hide it
			'::ffff:5db8:d822', // mapped, hex
			'64:ff9b::5db8:d822', // NAT64 → 93.184.216.34
			'2002:5db8:d822::1', // 6to4 → 93.184.216.34
		]) {
			expect(isPrivateIp(ip), `${ip} must be public`).toBe(false);
		}
	});

	test('a non-IP string is refused (fail closed)', () => {
		expect(isPrivateIp('not-an-ip')).toBe(true);
		expect(isPrivateIp('')).toBe(true);
	});
});
