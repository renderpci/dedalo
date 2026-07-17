/**
 * GEOIP — unit gate for IP→country resolution (section Activity dd542).
 *
 * The load-bearing invariant is the private/reserved classifier
 * (src/core/geoip/ip_ranges.ts): it is the authoritative server-side gate that
 * keeps non-routable addresses (the IPv6 `::1` / `local` cases that caused the
 * original browser 404) out of the country database and returns no flag for
 * them. It is pure, so the matrix below runs with no database and no network.
 *
 * `resolveCountry` (reader.ts) is checked for its soft-degrade contract: null
 * when the reader is unloaded or the IP is private. When a real database file
 * is present on disk (a full server boot has downloaded it) an extra pass
 * asserts a known public IP resolves — skipped otherwise so the gate is green
 * credless / DB-less in CI.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { DB_BASENAME } from '../../src/core/geoip/download.ts';
import { isPrivateOrReserved } from '../../src/core/geoip/ip_ranges.ts';
import {
	isReaderLoaded,
	loadReader,
	resolveCountry,
	unloadReader,
} from '../../src/core/geoip/reader.ts';

describe('isPrivateOrReserved — private / reserved / sentinel → true', () => {
	const PRIVATE = [
		'',
		'local',
		'localhost',
		'unknown',
		'LOCALHOST', // case-insensitive
		// IPv4 non-routable
		'10.1.2.3',
		'127.0.0.1',
		'169.254.1.1',
		'172.16.0.1',
		'172.31.255.255',
		'192.168.1.1',
		'0.0.0.0',
		'255.255.255.255',
		'100.64.0.1', // CGNAT
		// IPv6 non-routable
		'::',
		'::1',
		'fe80::1',
		'fe80::abcd%eth0', // with zone id
		'[::1]', // bracketed
		'fea0::1',
		'feb0::1',
		'fc00::1',
		'fd12:3456:789a::1',
		// IPv4-mapped IPv6 of private/loopback v4
		'::ffff:127.0.0.1',
		'::ffff:10.0.0.1',
		'::ffff:192.168.0.1',
		// malformed
		'not-an-ip',
		'1.2.3',
		'1.2.3.4.5',
		'999.1.1.1',
	];
	for (const ip of PRIVATE) {
		test(`private: ${JSON.stringify(ip)}`, () => {
			expect(isPrivateOrReserved(ip)).toBe(true);
		});
	}
	test('non-string → true', () => {
		expect(isPrivateOrReserved(undefined)).toBe(true);
		expect(isPrivateOrReserved(null)).toBe(true);
		expect(isPrivateOrReserved(12345)).toBe(true);
	});
});

describe('isPrivateOrReserved — public → false', () => {
	const PUBLIC = [
		'8.8.8.8',
		'1.1.1.1',
		'172.15.0.1', // just below RFC-1918 class B
		'172.32.0.1', // just above RFC-1918 class B
		'100.63.0.1', // just below CGNAT
		'100.128.0.1', // just above CGNAT
		'2001:4860:4860::8888',
		'2606:4700:4700::1111',
		'::ffff:8.8.8.8', // IPv4-mapped public
	];
	for (const ip of PUBLIC) {
		test(`public: ${JSON.stringify(ip)}`, () => {
			expect(isPrivateOrReserved(ip)).toBe(false);
		});
	}
});

describe('resolveCountry — soft degrade', () => {
	test('null when reader is not loaded, even for a public IP', () => {
		unloadReader();
		expect(isReaderLoaded()).toBe(false);
		expect(resolveCountry('8.8.8.8')).toBeNull();
	});
	test('null for a private IP regardless of reader state', () => {
		unloadReader();
		expect(resolveCountry('::1')).toBeNull();
		expect(resolveCountry('192.168.1.1')).toBeNull();
	});
});

describe('resolveCountry — real database (when present)', () => {
	const dbPath = join(config.geoip.dir, DB_BASENAME);
	const havedb = existsSync(dbPath);
	test.if(havedb)('resolves a known public IP to a country code', () => {
		loadReader(dbPath);
		expect(isReaderLoaded()).toBe(true);
		const resolved = resolveCountry('8.8.8.8');
		expect(resolved).not.toBeNull();
		expect(typeof resolved?.country_code).toBe('string');
		expect(resolved?.country_code.length).toBe(2);
		unloadReader();
	});
	test.if(!havedb)('SKIPPED public-IP resolution (no database file on disk)', () => {
		// Present so the suite records that this coverage is conditional; a full
		// server boot downloads the DB into config.geoip.dir and enables it.
		expect(havedb).toBe(false);
	});
});
