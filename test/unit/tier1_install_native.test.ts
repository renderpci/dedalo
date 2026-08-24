/**
 * Tier-1 backlog gate — the install subsystem's PURE helpers (coverage plan
 * §4.1.9): the pre-auth IP allow-list, the pg-client candidate ORDER, and the
 * vendored hierarchy-descriptor readers. The destructive install orchestration
 * around them stays exempt (§5.2) — this file executes none of it.
 *
 * Operator-visible failure each family prevents:
 *  - installIpAllowed: it is the ONLY address check in front of an
 *    UNAUTHENTICATED installer that rewrites ../private/.env and spawns psql.
 *    A regression that widens it exposes that surface; one that narrows the
 *    `loopback` token locks the operator out of their own fresh box. The
 *    DEFAULT half of that contract (unset ⇒ loopback only, fail-closed since
 *    2026-08-24) plus the CIDR grammar are pinned by
 *    test/unit/install_ip_gate_tripwire.test.ts; what stays here is the
 *    per-entry matching behaviour this tier already owned.
 *  - pgBinaryCandidates: a client OLDER than the server refuses to connect, so
 *    "newest first" and "configured dir wins" are the difference between a
 *    working backup/restore and an install that dies at the psql step.
 *  - hierarchy_meta: the wizard's checkbox list and the activator read the SAME
 *    descriptors; a reader that offers a tld with no vendored data file ships an
 *    install step that cannot run.
 *
 * Pure: no DB, no server. `DEDALO_INSTALL_ALLOWED_IPS` is set/cleared on
 * process.env (readEnv resolves per call and process env wins) and restored.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { readEnv } from '../../src/config/env.ts';
import { installIpAllowed } from '../../src/core/install/gate.ts';
import {
	availableHierarchyTlds,
	hierarchyMetaByTld,
	offeredHierarchies,
	readHierarchyJson,
} from '../../src/core/install/hierarchy_meta.ts';
import { deriveLangConfig } from '../../src/core/install/lang_catalog.ts';
import { pgBinaryCandidates } from '../../src/core/install/pg_bin.ts';

const KEY = 'DEDALO_INSTALL_ALLOWED_IPS';
const original = process.env[KEY];

afterEach(() => {
	if (original === undefined) delete process.env[KEY];
	else process.env[KEY] = original;
});

describe('installIpAllowed — the pre-auth install surface address gate (§4.1.9)', () => {
	// INVERTED 2026-08-24 (audit P2-6,
	// engineering/wire_contract/WC-2026-08-24-install-ip-gate-fail-closed.md):
	// these two cases used to assert that an unset/empty key left the surface
	// OPEN. It is now LOOPBACK ONLY — the operator opts out explicitly with `any`.
	test('an EMPTY / whitespace value is the DEFAULT, not "open"', () => {
		process.env[KEY] = '';
		expect(installIpAllowed('203.0.113.7')).toBe(false);
		expect(installIpAllowed('127.0.0.1')).toBe(true);
		process.env[KEY] = '   ';
		expect(installIpAllowed('203.0.113.7')).toBe(false);
		// A value of nothing but separators is still "the operator said nothing".
		process.env[KEY] = ' , , ';
		expect(installIpAllowed('203.0.113.7')).toBe(false);
		expect(installIpAllowed('local')).toBe(true);
	});

	test('UNSET is LOOPBACK ONLY — the unauthenticated installer is not exposed', () => {
		delete process.env[KEY];
		// Only meaningful when this checkout's ../private/.env does not set the key.
		if (readEnv(KEY) === undefined) {
			expect(installIpAllowed('203.0.113.7')).toBe(false);
			expect(installIpAllowed('local')).toBe(true);
		}
	});

	test("the 'loopback' token matches EVERY local spelling and nothing else", () => {
		process.env[KEY] = 'loopback';
		for (const ip of ['local', '127.0.0.1', '::1', '::ffff:127.0.0.1']) {
			expect(installIpAllowed(ip)).toBe(true);
		}
		expect(installIpAllowed('127.0.0.2')).toBe(false);
		expect(installIpAllowed('203.0.113.7')).toBe(false);
	});

	test('a set list admits only its exact entries — everything else is refused', () => {
		process.env[KEY] = ' 10.0.0.5 , , 192.168.1.9 ';
		expect(installIpAllowed('10.0.0.5')).toBe(true);
		expect(installIpAllowed('192.168.1.9')).toBe(true);
		expect(installIpAllowed('10.0.0.50')).toBe(false);
		expect(installIpAllowed('local')).toBe(false); // no loopback token ⇒ no implicit local
		expect(installIpAllowed('')).toBe(false); // an empty entry never becomes a wildcard
	});
});

describe('pgBinaryCandidates — probe ORDER (§4.1.9)', () => {
	test('the configured dir is probed FIRST, then Homebrew newest-first', () => {
		expect(pgBinaryCandidates('psql', '/opt/pg/bin')).toEqual([
			'/opt/pg/bin/psql',
			'/opt/homebrew/opt/postgresql@18/bin/psql',
			'/opt/homebrew/opt/postgresql@17/bin/psql',
			'/opt/homebrew/opt/postgresql@16/bin/psql',
			'/opt/homebrew/opt/postgresql@15/bin/psql',
		]);
	});

	test('no configured dir (undefined or empty) contributes no candidate', () => {
		const expected = [18, 17, 16, 15].map((v) => `/opt/homebrew/opt/postgresql@${v}/bin/pg_dump`);
		expect(pgBinaryCandidates('pg_dump', undefined)).toEqual(expected);
		expect(pgBinaryCandidates('pg_dump', '')).toEqual(expected);
	});
});

describe('hierarchy_meta — the vendored descriptor readers (§4.1.9)', () => {
	test('a missing JSON file yields the FALLBACK, never a throw', () => {
		expect(readHierarchyJson('does_not_exist_zzbk.json', [])).toEqual([]);
		expect(readHierarchyJson('does_not_exist_zzbk.json', { k: 1 })).toEqual({ k: 1 });
	});

	test('availableHierarchyTlds strips the `<tld>1.copy.gz` suffix (tlds, not filenames)', () => {
		const available = availableHierarchyTlds();
		expect(available.size).toBeGreaterThan(0);
		for (const tld of available) expect(tld).toMatch(/^[a-z]+$/);
		expect(available.has('ad')).toBe(true);
		expect(available.has('ad1.copy.gz')).toBe(false);
	});

	test('hierarchyMetaByTld normalizes case and whitespace; an unknown tld is null', () => {
		const found = hierarchyMetaByTld('  AF  ');
		expect(found?.tld).toBe('af');
		expect(typeof found?.label).toBe('string');
		expect(hierarchyMetaByTld('zzbk')).toBeNull();
	});

	test('offeredHierarchies is the INTERSECTION — never a descriptor without its data file', () => {
		const offered = offeredHierarchies();
		const available = availableHierarchyTlds();
		expect(offered.length).toBeGreaterThan(0);
		for (const entry of offered) expect(available.has(entry.tld)).toBe(true);
		// And it is a real filter: the vendored set is LARGER than the described set.
		expect(offered.length).toBeLessThanOrEqual(available.size);
	});
});

describe('deriveLangConfig — the remaining default branch (§4.1.9)', () => {
	test('an EMPTY-STRING default falls back to the first picked code without an error', () => {
		const derived = deriveLangConfig({
			langs: ['lg-cat', 'lg-eng'],
			appLangDefault: '',
			dataLangDefault: '',
		});
		expect(derived.applicationLangsDefault).toBe('lg-cat');
		expect(derived.dataLangDefault).toBe('lg-cat');
		expect(derived.errors).toEqual([]);
		expect(derived.structureLang).toBe('lg-spa');
	});
});
