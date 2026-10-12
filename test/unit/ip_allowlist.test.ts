/**
 * The ONE address-allowlist entry grammar (`src/core/security/ip_allowlist.ts`) and the
 * CIDR / address arithmetic under it (`src/core/security/ip_address.ts`).
 *
 * Moved here 2026-10-12 from the retired install_ip_gate_tripwire when the pre-auth
 * install surface was removed (WC-2026-10-12-install-surface-removed): the gate that
 * consumed the grammar is gone, the grammar is not — the error-report intake
 * (`reporterIpAllowed`, DEDALO_ERROR_REPORT_ALLOWED_IPS) reads it, and any future
 * allowlist must read this matcher rather than a hand-written `127.0.0.1`.
 *
 * Entry cases run THROUGH THE REAL CONSUMER (`reporterIpAllowed` with the key set on
 * process.env — readEnv resolves per call and process env wins; restored after), so a
 * consumer that stopped routing its entries through the shared matcher goes red here.
 * The token-level cases (`any` exactness, unusable entries) go straight to
 * `allowEntryMatches`. Pure: no DB, no server.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { reporterIpAllowed } from '../../src/core/error_report/gate.ts';
import { ipInCidr, peerBytes, sameAddress } from '../../src/core/security/ip_address.ts';
import {
	ALLOW_ANY,
	allowEntryMatches,
	LOOPBACK_SPELLINGS,
} from '../../src/core/security/ip_allowlist.ts';

const KEY = 'DEDALO_ERROR_REPORT_ALLOWED_IPS';
const original = process.env[KEY];

afterEach(() => {
	if (original === undefined) delete process.env[KEY];
	else process.env[KEY] = original;
});

/** The live consumer of the grammar, with KEY already set by the case. */
const admitted = (ip: string): boolean => reporterIpAllowed(ip);

describe('the entry tokens', () => {
	test("'any' admits every address — and is the ONE open spelling", () => {
		expect(ALLOW_ANY).toBe('any');
		process.env[KEY] = '  any  '; // surrounding whitespace is trimmed…
		for (const ip of ['203.0.113.7', '2001:db8::1', '10.0.0.5', 'local']) {
			expect(admitted(ip), ip).toBe(true);
		}
		// …but each of these is a wildcard in SOME other syntax, and none is one here.
		// `ANY` is exact on purpose: a mis-cased opt-out fails CLOSED.
		for (const entry of ['*', 'all', 'ALL', 'ANY', '0/0', '0.0.0.0']) {
			process.env[KEY] = entry;
			expect(admitted('203.0.113.7'), entry).toBe(false);
			expect(admitted('2001:db8::1'), entry).toBe(false);
			expect(admitted('local'), entry).toBe(false);
		}
		// The two default ROUTES are valid CIDR: each opens its own family only.
		process.env[KEY] = '0.0.0.0/0';
		expect(admitted('203.0.113.7')).toBe(true);
		expect(admitted('2001:db8::1')).toBe(false);
		expect(admitted('local')).toBe(false);
		process.env[KEY] = '::/0';
		expect(admitted('2001:db8::1')).toBe(true);
		expect(admitted('203.0.113.7')).toBe(false);
		expect(admitted('local')).toBe(false);
	});

	test("'loopback' admits every spelling of this machine, and nothing else", () => {
		expect(LOOPBACK_SPELLINGS.has('local')).toBe(true); // the no-XFF dispatcher sentinel
		process.env[KEY] = 'loopback';
		for (const ip of LOOPBACK_SPELLINGS) expect(admitted(ip), ip).toBe(true);
		for (const ip of [
			'203.0.113.7',
			'10.0.0.5',
			'172.17.0.1',
			'::ffff:203.0.113.7',
			'0.0.0.0',
			'127.0.0.2',
			'',
		]) {
			expect(admitted(ip), ip).toBe(false);
		}
	});

	test('an entry that matches NO address admits nobody (leading zeros, bad prefixes, words)', () => {
		// A leading zero is refused (ip_address.ts IPV4_PART): ambiguous, never guessed.
		expect(allowEntryMatches('127.0.0.01', '127.0.0.1')).toBe(false);
		expect(allowEntryMatches('010.0.0.0/8', '10.1.2.3')).toBe(false);
		for (const entry of ['local', '10.0.0.0/33', 'not-an-ip', '::ffff:1.2.3', 'ANY']) {
			for (const ip of ['127.0.0.1', '10.0.0.1', '1.2.3.4', '203.0.113.7']) {
				expect(allowEntryMatches(entry, ip), `${entry} vs ${ip}`).toBe(false);
			}
		}
		// Positive controls: the well-formed neighbours DO match.
		expect(allowEntryMatches('10.0.0.0/8', '10.1.2.3')).toBe(true);
		expect(allowEntryMatches('::ffff:a00:0/104', '10.1.2.3')).toBe(true);
		expect(allowEntryMatches('2001:db8::1', '2001:db8:0::1')).toBe(true);
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
			// …and against the address ITSELF: a /33 read as /32 would match here, so
			// only these prove the width refusal (the pairs above miss the network anyway).
			['10.0.0.5', '10.0.0.5/33'],
			['10.0.0.5', '10.0.0.5/999'],
			['2001:db8::1', '2001:db8::1/129'],
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
			// Leading zeros are not a second spelling: `01` is octal to inet_aton and
			// decimal to a naive read, so the literal is REFUSED, not guessed at. Checked
			// against the /32 of the address a decimal read WOULD mean — a case that
			// matched before 2026-09-29 (the old parser read `01` as 1) — so it proves
			// the refusal rather than passing vacuously against a block it misses anyway.
			['127.0.0.01', '127.0.0.1/32'],
			['010.0.0.5', '10.0.0.0/8'],
			['10.0.0.5', '010.0.0.0/8'], // …in the CIDR's network too
		];
		for (const [ip, cidr] of malformed) {
			expect(() => ipInCidr(ip, cidr)).not.toThrow();
			expect(ipInCidr(ip, cidr)).toBe(false);
		}
	});

	test('a MALFORMED dotted tail is not an address, as peer or entry — and never a throw', () => {
		// The module promises PURE and TOTAL: a literal that LOOKS like it ends in a v4
		// tail but does not pack as one must be a null, not an exception in a pre-auth gate.
		for (const bad of ['::ffff:1.2.3', '::1.2.3.256', '1.2.3.4::', '::ffff:1.2.3.4.5']) {
			expect(() => ipInCidr(bad, '0.0.0.0/0'), bad).not.toThrow();
			expect(ipInCidr(bad, '0.0.0.0/0'), bad).toBe(false);
			expect(ipInCidr(bad, '::/0'), bad).toBe(false);
			expect(ipInCidr('1.2.3.4', `${bad}/128`), bad).toBe(false);
			expect(sameAddress(bad, '1.2.3.4'), bad).toBe(false);
			expect(sameAddress(bad, bad), bad).toBe(false);
			expect(allowEntryMatches(bad, '1.2.3.4'), bad).toBe(false);
			expect(allowEntryMatches('loopback', bad), bad).toBe(false);
		}
	});

	test('only ::ffff:0:0/96 is folded: an address one byte off it is NOT the IPv4 it ends in', () => {
		// Byte 0 set, byte 10 clear: each is an ordinary IPv6 address, not 127.0.0.1.
		for (const near of ['100::ffff:7f00:1', '::ff:7f00:1', '::ff00:7f00:1']) {
			expect(allowEntryMatches('loopback', near), near).toBe(false);
			expect(sameAddress(near, '127.0.0.1'), near).toBe(false);
			expect(ipInCidr(near, '127.0.0.0/8'), near).toBe(false);
		}
		expect(ipInCidr('100::ffff:a00:1', '10.0.0.0/8')).toBe(false);
		expect(allowEntryMatches('loopback', '::ffff:7f00:1')).toBe(true); // positive control
	});

	test('a mapped block is an IPv4 block ONLY from /96 on: a shorter one is plain IPv6', () => {
		// /96 is the whole mapped space: every IPv4 peer.
		expect(ipInCidr('203.0.113.9', '::ffff:0:0/96')).toBe(true);
		// Shorter than /96 there is no IPv4 prefix to fold to (it would be negative and
		// compare no bytes, admitting every IPv4 peer): it is an IPv6 block, which no
		// IPv4 peer is in.
		for (const block of ['::ffff:a00:0/80', '::ffff:a00:0/95', '::ffff:a00:0/0']) {
			expect(ipInCidr('203.0.113.9', block), block).toBe(false);
			expect(ipInCidr('10.0.0.1', block), block).toBe(false);
		}
		expect(ipInCidr('::1', '::ffff:a00:0/0')).toBe(true); // …it is IPv6: /0 is every IPv6
	});

	test('host-length prefixes (/32, /128) match exactly one address', () => {
		expect(ipInCidr('203.0.113.7', '203.0.113.7/32')).toBe(true);
		expect(ipInCidr('203.0.113.8', '203.0.113.7/32')).toBe(false);
		expect(ipInCidr('203.0.113.6', '203.0.113.7/32')).toBe(false);
		expect(ipInCidr('2001:db8::7', '2001:db8::7/128')).toBe(true);
		expect(ipInCidr('2001:db8::8', '2001:db8::7/128')).toBe(false);
		expect(ipInCidr('2001:db8::6', '2001:db8::7/128')).toBe(false);
	});

	test('the octet boundary: 255 is an address, 256 is not', () => {
		expect(ipInCidr('10.0.0.255', '10.0.0.0/24')).toBe(true);
		expect(ipInCidr('10.0.0.256', '10.0.0.0/8')).toBe(false);
		expect(ipInCidr('255.255.255.255', '255.255.255.255/32')).toBe(true);
		expect(ipInCidr('256.0.0.0', '0.0.0.0/0')).toBe(false);
	});

	test('upper-case IPv6 matches its lower-case CIDR (and the reverse)', () => {
		expect(ipInCidr('2001:DB8::1', '2001:db8::/32')).toBe(true);
		expect(ipInCidr('2001:db8::1', '2001:DB8::/32')).toBe(true);
		expect(ipInCidr('FE80::ABCD', 'fe80::/10')).toBe(true);
		expect(ipInCidr('2001:DB9::1', '2001:db8::/32')).toBe(false);
	});

	test('MALFORMED IPv6 literals deny (RFC 4291 §2.2)', () => {
		for (const ip of [
			'1.2.3.4::', // a dotted quad only as the FINAL 32 bits
			'::1.2.3.4:1',
			'1:2:3:4:5:6:7:8::', // 8 groups AND an elision
			'::1:2:3:4:5:6:7:8',
			'1:2:3:4:5:6:7', // 7 groups, no elision
			'1:2:3:4:5:6:7:8:9',
			'1:::2', // a triple colon
			':::1',
			'1::2::3', // two elisions
			'12345::1', // a 5-hex-digit group
			'1:2:3:4:5:6:7:1.2.3.4', // 7 groups + a v4 tail = 9 groups' worth
			'::ffff:1.2.3.04', // a leading zero inside the v4 tail
			'fe80::1%eth0', // a zone is not part of an address to match
		]) {
			expect(() => ipInCidr(ip, '::/0')).not.toThrow();
			expect(ipInCidr(ip, '::/0'), ip).toBe(false);
		}
		// Positive controls: the well-formed neighbours of the cases above DO match.
		for (const ip of ['::1.2.3.4', '1:2:3:4:5:6:7:8', '1:2:3:4:5:6:1.2.3.4', '1::2', 'ffff::1']) {
			expect(ipInCidr(ip, '::/0'), ip).toBe(true);
		}
	});

	test('a CIDR entry in the allowlist admits its block and nothing else', () => {
		process.env[KEY] = '10.0.0.0/24, 2001:db8::/32, loopback';
		expect(admitted('10.0.0.9')).toBe(true);
		expect(admitted('10.0.1.9')).toBe(false);
		expect(admitted('2001:db8::5')).toBe(true);
		expect(admitted('2001:db9::5')).toBe(false);
		expect(admitted('local')).toBe(true);
		// A malformed entry poisons nothing else on the list, and admits nobody.
		process.env[KEY] = '10.0.0.0/notanumber, 192.168.1.9';
		expect(admitted('192.168.1.9')).toBe(true);
		expect(admitted('10.0.0.9')).toBe(false);
	});

	test('a LITERAL entry and the loopback token compare BYTES: every spelling of one address', () => {
		process.env[KEY] = '2001:db8:0::1, ::ffff:127.0.0.1';
		expect(admitted('2001:db8::1')).toBe(true);
		expect(admitted('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe(true);
		expect(admitted('::ffff:7f00:1')).toBe(true); // the hex spelling of the entry
		expect(admitted('127.0.0.1')).toBe(true); // …and the IPv4 it maps
		expect(admitted('2001:db8::2')).toBe(false);
		expect(admitted('127.0.0.01')).toBe(false); // ambiguous, never guessed
		process.env[KEY] = 'loopback';
		for (const ip of ['0:0:0:0:0:0:0:1', '::ffff:7f00:1', '0:0:0:0:0:ffff:7f00:1', 'LOCAL']) {
			expect(admitted(ip), ip).toBe(true);
		}
		for (const ip of ['127.0.0.2', '::ffff:7f00:2', '::2', 'localhost']) {
			expect(admitted(ip), ip).toBe(false); // exact addresses, not a range
		}
		// Near-miss MAPPED PREFIXES: only `::ffff:0:0/96` folds to IPv4. A prefix one byte
		// off is an ordinary IPv6 address, never 127.0.0.1 — folding it would open the
		// pre-auth installer to any peer that can pick its own IPv6 bits.
		for (const ip of ['::ff00:7f00:1', '::fffe:7f00:1', '::1:ffff:7f00:1', '1::ffff:7f00:1']) {
			expect(admitted(ip), ip).toBe(false);
			expect(peerBytes(ip)?.length, ip).toBe(16);
		}
	});

	test('a 4-byte and a 16-byte address never match, whatever their bytes', () => {
		// `102:304::` starts with the bytes of 1.2.3.4; only the length tells them apart.
		expect(sameAddress('1.2.3.4', '102:304::')).toBe(false);
		expect(sameAddress('102:304::', '1.2.3.4')).toBe(false);
		process.env[KEY] = '1.2.3.4';
		expect(admitted('102:304::')).toBe(false);
		expect(admitted('1.2.3.4')).toBe(true); // positive control
	});

	test('a CIDR entry written inside ::ffff:0:0/96 (/96 or longer) is the IPv4 block it spells', () => {
		// RFC 4291 §2.5.5.2 spellings of 10.0.0.0/8: a mapped peer is folded to IPv4, so
		// the block must be too, or the entry matches no peer at all.
		for (const entry of ['::ffff:a00:0/104', '::ffff:10.0.0.0/104', '::FFFF:A00:0/104']) {
			expect(ipInCidr('::ffff:a00:1', entry), entry).toBe(true);
			expect(ipInCidr('10.200.0.1', entry), entry).toBe(true);
			expect(ipInCidr('11.0.0.1', entry), entry).toBe(false);
			expect(ipInCidr('::a00:1', entry), entry).toBe(false); // IPv4-compatible is not mapped
		}
		expect(ipInCidr('10.0.0.1', '::ffff:10.0.0.1/128')).toBe(true);
		expect(ipInCidr('10.0.0.2', '::ffff:10.0.0.1/128')).toBe(false);
		expect(ipInCidr('10.0.0.1', '::ffff:a00:1/129')).toBe(false); // wider than IPv6: a typo
		process.env[KEY] = '::ffff:a00:0/104';
		expect(admitted('::ffff:10.1.2.3')).toBe(true);
		expect(admitted('192.168.0.1')).toBe(false);
	});

	test('a mapped-form CIDR is the IPv4 block it spells; a mapped peer in any spelling is its IPv4', () => {
		expect(ipInCidr('192.168.1.7', '::ffff:192.168.1.0/24')).toBe(true);
		expect(ipInCidr('192.168.1.7', '::FFFF:192.168.1.0/24')).toBe(true); // case is not a spelling
		expect(ipInCidr('::1', '::ffff:192.168.1.0/24')).toBe(false); // not a v6 /24 of zeros
		expect(ipInCidr('::ffff:c0a8:107', '192.168.1.0/24')).toBe(true);
		expect(ipInCidr('::ffff:7f00:1', '127.0.0.0/8')).toBe(true);
		expect(ipInCidr('10.0.0.5', '10.0.0.0/0008')).toBe(false); // a prefix is 1-3 digits
	});
});
