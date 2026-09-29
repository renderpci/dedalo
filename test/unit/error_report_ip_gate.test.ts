/**
 * The error-report intake's address allowlist (`reporterIpAllowed`,
 * src/core/error_report/gate.ts) — the SECOND consumer of the shared entry matcher
 * and of `ipInCidr` (security/ip_address.ts).
 *
 * install_ip_gate_tripwire proves the arithmetic through the install gate. This gate
 * exists because the intake reads a DIFFERENT key with a DIFFERENT default (unset =
 * open, deliberately — see the gate's header), and a consumer that stopped routing
 * its entries through the shared matcher would pass every install test. So: the
 * default, a CIDR entry at its edges, the loopback token, the IPv4-mapped peer
 * spelling, and the parser's strictness, all through THIS predicate.
 *
 * Pure: no DB, no server. The key is set on process.env (readEnv resolves per call
 * and process env wins) and restored.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { reporterIpAllowed } from '../../src/core/error_report/gate.ts';

const KEY = 'DEDALO_ERROR_REPORT_ALLOWED_IPS';
const original = process.env[KEY];

afterEach(() => {
	if (original === undefined) delete process.env[KEY];
	else process.env[KEY] = original;
});

describe('reporterIpAllowed — the error-report intake allowlist', () => {
	test('empty ⇒ open (the intake default, unlike the installer)', () => {
		process.env[KEY] = '';
		expect(reporterIpAllowed('203.0.113.7')).toBe(true);
	});

	test('a CIDR entry admits its block — edges included — and nothing else', () => {
		process.env[KEY] = '198.51.100.0/25, 2001:db8:1::/48';
		expect(reporterIpAllowed('198.51.100.0')).toBe(true);
		expect(reporterIpAllowed('198.51.100.127')).toBe(true);
		expect(reporterIpAllowed('198.51.100.128')).toBe(false); // just past the /25
		expect(reporterIpAllowed('198.51.99.255')).toBe(false);
		expect(reporterIpAllowed('::ffff:198.51.100.5')).toBe(true); // a dual-stack listener's spelling
		expect(reporterIpAllowed('2001:DB8:1:ffff::1')).toBe(true); // case-insensitive
		expect(reporterIpAllowed('2001:db8:2::1')).toBe(false);
		// Strictness reaches this consumer too: an ambiguous or malformed peer is no match.
		expect(reporterIpAllowed('198.51.100.05')).toBe(false);
		expect(reporterIpAllowed('2001:db8:1::1::')).toBe(false);
		expect(reporterIpAllowed('local')).toBe(false);
	});

	test('the loopback token and literal entries share the install grammar', () => {
		process.env[KEY] = 'loopback, 192.0.2.10';
		expect(reporterIpAllowed('local')).toBe(true);
		expect(reporterIpAllowed('::1')).toBe(true);
		expect(reporterIpAllowed('192.0.2.10')).toBe(true);
		expect(reporterIpAllowed('192.0.2.11')).toBe(false);
	});
});
