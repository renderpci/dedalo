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
 * when the reader is unloaded or the IP is private. The public-IP leg runs in
 * EVERY environment against MaxMind's official fake test database, vendored as
 * a test fixture (test/fixtures/geoip/ — provenance + licence in its README),
 * loaded through the `loadReader(path)` seam and never through
 * `config.geoip.dir` (the installation's downloaded database). It used to be a
 * `test.if(existsSync(...))` skip: green on every CI run, asserting nothing.
 * The fixture's identity (sha256 + its own metadata) and its licence text are
 * pinned here, because it ships nowhere and so has no vendor_manifest.json row.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CityResponse, Reader } from 'mmdb-lib';
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

/** MaxMind's official fake test database — see test/fixtures/geoip/README.md. */
const FIXTURE_DIR = join(import.meta.dir, '../fixtures/geoip');
const FIXTURE_MMDB = join(FIXTURE_DIR, 'GeoLite2-City-Test.mmdb');
/** The pins the README records; a bump moves the file, the README and these together. */
const FIXTURE_SHA256 = 'f936702b51dcb6c94b286d77a6f182c31a1601baf4b27e8e896934deb41f49f2';
const FIXTURE_BUILD_EPOCH = 1770245369;

describe('GeoIP test fixture — identity and licence', () => {
	const bytes = readFileSync(FIXTURE_MMDB);
	const readme = readFileSync(join(FIXTURE_DIR, 'README.md'), 'utf-8');

	test('the bytes are the upstream file the README records (sha256)', () => {
		expect(createHash('sha256').update(bytes).digest('hex')).toBe(FIXTURE_SHA256);
		// The record and the pin cannot drift apart: the README states the same digest.
		expect(readme).toContain(FIXTURE_SHA256);
	});

	test("the file's own metadata says it is MaxMind's fake GeoLite2-City test database", () => {
		const metadata = new Reader<CityResponse>(bytes).metadata;
		expect(metadata.databaseType).toBe('GeoLite2-City');
		expect(Math.floor(metadata.buildEpoch.getTime() / 1000)).toBe(FIXTURE_BUILD_EPOCH);
		// mmdb-lib types `description` as a string; the format stores a lang-keyed map.
		expect(JSON.stringify(metadata.description)).toContain('fake GeoIP2 data');
		expect(readme).toContain(String(FIXTURE_BUILD_EPOCH));
	});

	test('the licence it is redistributed under ships with it', () => {
		expect(readFileSync(join(FIXTURE_DIR, 'LICENSE-MIT'), 'utf-8')).toContain(
			'Permission is hereby granted, free of charge',
		);
		expect(readFileSync(join(FIXTURE_DIR, 'LICENSE-APACHE'), 'utf-8')).toContain('Apache License');
		expect(readme).toContain('Apache License, Version\n2.0 or the MIT License');
	});
});

describe('resolveCountry — public IPs against the test database', () => {
	beforeAll(() => {
		loadReader(FIXTURE_MMDB);
	});
	afterAll(() => {
		unloadReader();
	});

	// Documented in upstream source-data/GeoLite2-City-Test.json (README table).
	const KNOWN: readonly (readonly [ip: string, country: string, city: string | null])[] = [
		['81.2.69.142', 'GB', 'London'],
		['89.160.20.128', 'SE', 'Linköping'],
		['216.160.83.56', 'US', 'Milton'],
		['2001:218::', 'JP', null],
	];

	for (const [ip, country, city] of KNOWN) {
		test(`${ip} → ${country}${city === null ? '' : ` (${city})`}`, () => {
			expect(isReaderLoaded()).toBe(true);
			expect(resolveCountry(ip)).toEqual({ country_code: country });
			// The fixture really holds that record: the city the upstream source names is
			// in the same entry the engine read the country from.
			const record = new Reader<CityResponse>(readFileSync(FIXTURE_MMDB)).get(ip);
			expect(record?.city?.names?.en ?? null).toBe(city);
		});
	}

	test('a public IP absent from the database → null (missing record)', () => {
		expect(isReaderLoaded()).toBe(true);
		expect(resolveCountry('8.8.8.8')).toBeNull();
	});

	test('private / malformed input stays null with a database loaded', () => {
		expect(isReaderLoaded()).toBe(true);
		expect(resolveCountry('::1')).toBeNull();
		expect(resolveCountry('192.168.1.1')).toBeNull();
		expect(resolveCountry('not-an-ip')).toBeNull();
	});
});
