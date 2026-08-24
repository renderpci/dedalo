/**
 * TRIPWIRE — the install-window address allowlist is FAIL-CLOSED, and the
 * documentation cannot drift back to saying otherwise.
 *
 * WHAT IS BEHIND THE PREDICATE. While an instance is unsealed, `dd_utils_api:install`
 * and `get_install_context` answer WITHOUT a session: `persist_config` rewrites
 * `../private/.env` and exits so the supervisor restarts the engine into that
 * configuration, and `test_db_connection` spawns psql. `installIpAllowed` is the only
 * address check in front of all of it. Until 2026-08-24 an unset
 * `DEDALO_INSTALL_ALLOWED_IPS` left that open to every address (audit P2-6;
 * `engineering/wire_contract/WC-2026-08-24-install-ip-gate-fail-closed.md`), which is
 * the wrong default on precisely the deployments where the browser wizard is the
 * reasonable path — a container stack, a VM, a hosted box.
 *
 * WHY A TRIPWIRE AND NOT ONLY A UNIT TEST. A fail-closed default is a decision that
 * decays in two directions, and only one of them is a code change:
 *
 *  1. the CODE quietly regains a "convenient" open default (the shape being replaced
 *     was, verbatim, `if (raw === undefined) return true`), or an entry spelling turns
 *     into a wildcard by accident; and
 *  2. the DOCUMENTATION keeps telling operators the old rule. That is not cosmetic:
 *     an operator who reads "unset = open" concludes the wizard is exposed and goes
 *     looking for a lock that is already on — or, worse, a later editor "restores
 *     consistency" by changing the code to match the prose. Six documents plus the
 *     generated config artifacts stated the old rule; all of them moved in the same
 *     change, and this gate is what keeps them moved.
 *
 * So: the behavioural half asserts the default, the `any` opt-out and the CIDR
 * arithmetic against the SAME exported constants the engine runs on, and the prose
 * half scans the operator-facing tree. The prose scan carries a POSITIVE CONTROL — a
 * synthetic sentence in the old wording that must match — so it can never pass by
 * having scanned nothing or by a pattern that matches nothing.
 *
 * HONEST LIMIT. This proves the PREDICATE and the PROSE. It does not prove the
 * dispatcher calls it (that is `install_gate.test.ts`, which drives `dispatchRqo` and
 * asserts the 403), and it cannot see past `clientIp`: the dispatcher resolves a
 * request with no `X-Forwarded-For` to the sentinel `'local'`, so on a bare TCP
 * listener with no proxy in front a remote peer still reads as loopback. That gap
 * lives in `server.ts::clientIpFromRequest` and is recorded in the WC entry.
 *
 * Pure: no DB, no server. `DEDALO_INSTALL_ALLOWED_IPS` is set/cleared on process.env
 * (readEnv resolves per call and process env wins) and restored.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { readEnv } from '../../src/config/env.ts';
import {
	DEFAULT_INSTALL_ALLOW_ENTRIES,
	describeInstallAllowPolicy,
	INSTALL_ALLOW_ANY,
	installAllowPolicy,
	installIpAllowed,
	ipInCidr,
	LOOPBACK_SPELLINGS,
} from '../../src/core/install/gate.ts';

const KEY = 'DEDALO_INSTALL_ALLOWED_IPS';
const original = process.env[KEY];
const ROOT = join(import.meta.dir, '..', '..');

afterEach(() => {
	if (original === undefined) delete process.env[KEY];
	else process.env[KEY] = original;
});

/** Addresses that must NEVER reach the pre-auth installer under the default policy. */
const NON_LOOPBACK = [
	'203.0.113.7', // TEST-NET-3, the documentation example
	'10.0.0.5', // a private LAN peer — the docker/VM case this default exists for
	'192.168.1.50',
	'172.17.0.1', // the docker bridge gateway: what a container sees as "the host"
	'2001:db8::1',
	'::ffff:203.0.113.7', // the IPv4-mapped spelling must not slip past the fold
	'0.0.0.0',
	'127.0.0.2', // loopback to the kernel, but not a spelling this engine produces
	'', // an unresolved address is not a pass
];

describe('the DEFAULT policy is loopback only (fail-closed)', () => {
	test('unset ⇒ every non-loopback address is denied', () => {
		delete process.env[KEY];
		// Only meaningful when this checkout's ../private/.env does not set the key —
		// asserted rather than skipped silently, so the gate says why if it ever is.
		expect(readEnv(KEY)).toBeUndefined();
		expect(installAllowPolicy()).toEqual({
			entries: DEFAULT_INSTALL_ALLOW_ENTRIES,
			source: 'default',
		});
		for (const ip of NON_LOOPBACK) expect(installIpAllowed(ip)).toBe(false);
	});

	test('unset ⇒ every loopback SPELLING is admitted (the operator is not locked out)', () => {
		delete process.env[KEY];
		for (const ip of LOOPBACK_SPELLINGS) expect(installIpAllowed(ip)).toBe(true);
		// The sentinel the dispatcher uses for "no X-Forwarded-For" is one of them:
		// without it a unix-socket dev box and the CLI installer could not install.
		expect(LOOPBACK_SPELLINGS.has('local')).toBe(true);
	});

	test('an empty / separator-only value is the DEFAULT, never "open"', () => {
		for (const raw of ['', '   ', ',', ' , , ']) {
			process.env[KEY] = raw;
			expect(installAllowPolicy().source).toBe('default');
			expect(installIpAllowed('203.0.113.7')).toBe(false);
			expect(installIpAllowed('127.0.0.1')).toBe(true);
		}
	});

	test('the default entries contain NO open spelling', () => {
		expect([...DEFAULT_INSTALL_ALLOW_ENTRIES]).toEqual(['loopback']);
		expect(DEFAULT_INSTALL_ALLOW_ENTRIES.includes(INSTALL_ALLOW_ANY)).toBe(false);
		expect(Object.isFrozen(DEFAULT_INSTALL_ALLOW_ENTRIES)).toBe(true);
	});
});

describe('`any` is the ONE open spelling, and it is always explicit', () => {
	test("'any' admits every address", () => {
		process.env[KEY] = 'any';
		expect(installAllowPolicy().source).toBe('env');
		for (const ip of NON_LOOPBACK) expect(installIpAllowed(ip)).toBe(true);
	});

	test('no other wildcard-looking spelling opens the surface', () => {
		// Each of these is a wildcard in SOME other system's syntax. None is one here:
		// an operator who means "everyone" writes the word that means it.
		// `ANY` upper-cased is on the list on purpose: the token is exact, so a
		// mis-cased opt-out fails CLOSED (the operator is locked out and fixes it)
		// rather than open. Surrounding whitespace IS trimmed, asserted below.
		for (const entry of ['*', 'all', 'ALL', 'ANY', '0/0', '0.0.0.0']) {
			process.env[KEY] = entry;
			expect(installIpAllowed('203.0.113.7')).toBe(false);
			expect(installIpAllowed('2001:db8::1')).toBe(false);
			expect(installIpAllowed('local')).toBe(false);
		}
		// The two default ROUTES are the interesting pair: they are valid CIDR, so
		// they really do open their own family — deliberately, an operator wrote them
		// — but they are not `any`, so they open neither the other family nor the
		// no-address sentinel.
		// …while the exact token, whitespace and all, is honoured.
		process.env[KEY] = '  any  ';
		expect(installIpAllowed('203.0.113.7')).toBe(true);

		process.env[KEY] = '0.0.0.0/0';
		expect(installIpAllowed('203.0.113.7')).toBe(true);
		expect(installIpAllowed('2001:db8::1')).toBe(false);
		expect(installIpAllowed('local')).toBe(false);
		process.env[KEY] = '::/0';
		expect(installIpAllowed('2001:db8::1')).toBe(true);
		expect(installIpAllowed('203.0.113.7')).toBe(false);
		expect(installIpAllowed('local')).toBe(false);
	});

	test('the boot banner names the policy, and says so when it is open', () => {
		delete process.env[KEY];
		expect(describeInstallAllowPolicy()).toContain('loopback');
		expect(describeInstallAllowPolicy()).toContain('default');
		process.env[KEY] = 'any';
		expect(describeInstallAllowPolicy()).toContain('EVERY ADDRESS');
	});
});

describe('ipInCidr — bitwise, total, fail-closed', () => {
	test('IPv4 in range / out of range, on and off a byte boundary', () => {
		expect(ipInCidr('10.0.0.5', '10.0.0.0/24')).toBe(true);
		expect(ipInCidr('10.0.1.5', '10.0.0.0/24')).toBe(false);
		expect(ipInCidr('10.0.1.5', '10.0.0.0/23')).toBe(true);
		expect(ipInCidr('203.0.113.130', '203.0.113.128/25')).toBe(true);
		expect(ipInCidr('203.0.113.126', '203.0.113.128/25')).toBe(false);
		expect(ipInCidr('10.9.9.9', '10.0.0.0/8')).toBe(true);
		expect(ipInCidr('11.9.9.9', '10.0.0.0/8')).toBe(false);
		expect(ipInCidr('203.0.113.7', '0.0.0.0/0')).toBe(true); // /0 means what it says
	});

	test('IPv6 in range / out of range, including the IPv4-mapped fold', () => {
		expect(ipInCidr('2001:db8::1', '2001:db8::/32')).toBe(true);
		expect(ipInCidr('2001:db9::1', '2001:db8::/32')).toBe(false);
		expect(ipInCidr('2001:db8:0:1::1', '2001:db8:0:1::/64')).toBe(true);
		expect(ipInCidr('2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8::/32')).toBe(true);
		expect(ipInCidr('::ffff:10.0.0.5', '10.0.0.0/8')).toBe(true);
	});

	test('families never match across each other', () => {
		expect(ipInCidr('10.0.0.5', '2001:db8::/32')).toBe(false);
		expect(ipInCidr('2001:db8::1', '10.0.0.0/8')).toBe(false);
		expect(ipInCidr('2001:db8::1', '0.0.0.0/0')).toBe(false);
	});

	test('MALFORMED input denies — and never throws', () => {
		const malformed: [string, string][] = [
			['10.0.0.5', '10.0.0.0'], // no prefix at all
			['10.0.0.5', '10.0.0.0/'],
			['10.0.0.5', '10.0.0.0/abc'],
			['10.0.0.5', '10.0.0.0/-1'],
			['10.0.0.5', '10.0.0.0/33'], // wider than the family
			['10.0.0.5', '10.0.0.0/999'],
			['10.0.0.5', '/24'],
			['10.0.0.5', ''],
			['10.0.0.5', 'not-an-address/24'],
			['10.0.0.5', '10.0.0.0/24/24'],
			['999.0.0.1', '10.0.0.0/8'],
			['10.0.0', '10.0.0.0/8'],
			['10.0.0.5.6', '10.0.0.0/8'],
			['', '10.0.0.0/8'],
			['2001:db8::1', '2001:db8::/129'],
			['2001:db8:::1', '2001:db8::/32'],
			['2001:zzzz::1', '2001:db8::/32'],
			['0x7f.0.0.1', '127.0.0.0/8'],
			['127.0.0.01', '127.0.0.0/32'], // leading zeros are not a second spelling
		];
		for (const [ip, cidr] of malformed) {
			expect(() => ipInCidr(ip, cidr)).not.toThrow();
			expect(ipInCidr(ip, cidr)).toBe(false);
		}
	});

	test('a CIDR entry in the allowlist admits its block and nothing else', () => {
		process.env[KEY] = '10.0.0.0/24, 2001:db8::/32, loopback';
		expect(installIpAllowed('10.0.0.9')).toBe(true);
		expect(installIpAllowed('10.0.1.9')).toBe(false);
		expect(installIpAllowed('2001:db8::5')).toBe(true);
		expect(installIpAllowed('2001:db9::5')).toBe(false);
		expect(installIpAllowed('local')).toBe(true);
		// A malformed entry poisons nothing else on the list, and admits nobody.
		process.env[KEY] = '10.0.0.0/notanumber, 192.168.1.9';
		expect(installIpAllowed('192.168.1.9')).toBe(true);
		expect(installIpAllowed('10.0.0.9')).toBe(false);
	});
});

/**
 * The prose half. Two rules over the operator-facing tree:
 *
 *  A. no file may state the OLD rule (unset/default = open), in any of the spellings
 *     the tree actually used before this change; and
 *  B. every file that NAMES the key must also state the new default, so a document
 *     cannot go quiet about it and leave the reader with the old assumption.
 *
 * Both run over real files discovered by glob, with a positive control each.
 */
const PROSE_FILES: readonly string[] = [
	...new Glob('docs/install/*.md').scanSync({ cwd: ROOT }),
	'docs/development/ts_install_internals.md',
	'docs/config/config.md',
	'engineering/PRODUCTION.md',
	'install/sample.env',
	'src/config/catalog/install.ts',
	'docker-compose.yml',
];

/**
 * Spellings of "unset means open". Each is bound to the word that makes it a claim
 * about the DEFAULT — `unset`, `default`, `by default` — so the prose describing the
 * `any` opt-out ("`any`, which opens the wizard to every address") is not a false
 * positive: that sentence is about a value the operator wrote.
 */
const OPEN_DEFAULT_PATTERNS: readonly RegExp[] = [
	/unset\s*[=:—-]\s*open/i,
	/unset[^.\n]{0,80}\bis\s+(?:\*\*)?open\b/i,
	/unset[^.\n]{0,80}\bopen to (?:any|every)\b/i,
	/\bopen\b[^.\n]{0,40}\bby default\b/i,
	/\bdefault[^.\n]{0,40}\bis\s+(?:\*\*)?open\b/i,
];

describe('the documentation cannot drift back to "unset = open"', () => {
	test('the patterns really do match the wording this change removed (positive control)', () => {
		// Verbatim from the tree before 2026-08-24. If a pattern stops matching these,
		// rule A has silently become a no-op.
		const removed = [
			'Unset, the wizard is open to any address, which is the convenient default for a local installation.',
			'Unset the key entirely and the surface is **open** — that is the development default.',
			'`DEDALO_INSTALL_ALLOWED_IPS` (unset = open, dev default); once `install_finish`',
			'(`DEDALO_INSTALL_ALLOWED_IPS`, `loopback` token; unset = open, dev)',
		];
		for (const sentence of removed) {
			expect(OPEN_DEFAULT_PATTERNS.some((pattern) => pattern.test(sentence))).toBe(true);
		}
	});

	/**
	 * Rule A is a WHOLE-FILE scan (the sentence being banned rarely repeats the key
	 * next to itself — "Unset the key entirely and the surface is **open**" never
	 * did), so it needs one narrow exemption: `docs/config/config.md` documents
	 * EVERY key, including `DEDALO_ERROR_REPORT_ALLOWED_IPS`, whose unset-is-open
	 * default is correct and deliberate (that receiver is off unless switched on,
	 * invisible when off, throttled and token-checked). The exemption is decided per
	 * MATCH, on the surrounding window, and only when that window is about the other
	 * key and not about this one — and the next test proves the exemption is narrow.
	 */
	const otherAllowlist = (text: string, at: number): boolean => {
		const window = text.slice(Math.max(0, at - 900), at + 900);
		return (
			/DEDALO_ERROR_REPORT_ALLOWED_IPS|error[- ]report intake/i.test(window) &&
			!window.includes('DEDALO_INSTALL_ALLOWED_IPS')
		);
	};

	const oldRuleHits = (text: string): string[] => {
		const hits: string[] = [];
		for (const pattern of OPEN_DEFAULT_PATTERNS) {
			for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
				if (match.index !== undefined && otherAllowlist(text, match.index)) continue;
				hits.push(match[0]);
			}
		}
		return hits;
	};

	test('no operator-facing file states the old rule', () => {
		expect(PROSE_FILES.length).toBeGreaterThan(8); // the glob really found the tree
		const offenders: string[] = [];
		for (const relative of PROSE_FILES) {
			const text = readFileSync(join(ROOT, relative), 'utf8');
			for (const hit of oldRuleHits(text)) offenders.push(`${relative}: ${hit}`);
		}
		expect(offenders).toEqual([]);
	});

	test('the other-key exemption is NARROW (it cannot swallow an install regression)', () => {
		// The real error-report paragraph is exempt…
		const errorReportProse =
			'DEDALO_ERROR_REPORT_ALLOWED_IPS `string`\n\nUnset (the default) leaves the intake open to any address.';
		expect(oldRuleHits(errorReportProse)).toEqual([]);
		// …and the same sentence about THIS key, in the same window, is not.
		const installProse =
			'DEDALO_INSTALL_ALLOWED_IPS `string`\n\nUnset (the default) leaves the wizard open to any address.';
		expect(oldRuleHits(installProse).length).toBeGreaterThan(0);
		// A window that names neither key is judged on the sentence alone.
		expect(oldRuleHits('Unset, the wizard is open to any address.').length).toBeGreaterThan(0);
	});

	test('every file that names the key also states the fail-closed default', () => {
		// Any of these phrasings will do — the rule is that the reader is TOLD, not
		// that a sentence is copied around.
		const statesDefault =
			/(unset[^.\n]{0,120}(loopback|local machine)|local machine (and nobody else|only)|loopback only|default:\s*loopback|LOOPBACK ONLY|admits \*\*the local\s?machine only\*\*|the local\s+machine only)/i;
		const naming = PROSE_FILES.filter((relative) =>
			readFileSync(join(ROOT, relative), 'utf8').includes('DEDALO_INSTALL_ALLOWED_IPS'),
		);
		// Positive control: the key is documented in more than one place, so a broken
		// filter cannot make this test vacuous.
		expect(naming.length).toBeGreaterThan(5);
		const silent = naming.filter(
			(relative) => !statesDefault.test(readFileSync(join(ROOT, relative), 'utf8')),
		);
		expect(silent).toEqual([]);
	});

	test('the shipped compose file passes the key through (docs alone do not fix an artifact)', () => {
		const compose = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
		expect(compose).toContain('DEDALO_INSTALL_ALLOWED_IPS: ${DEDALO_INSTALL_ALLOWED_IPS:-}');
	});
});
