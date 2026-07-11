/**
 * AUTHZ-05 wildcard-guard DENY gate (test-quality audit 2026-07-07, security
 * cluster finding #2: the wildcard grant had an ALLOW test but no DENY test —
 * removing the `^[a-z]+[0-9]+$` concrete-parent regex, the entire point of
 * AUTHZ-05, made getPermissions(_, 'all', 'all') return level 1 (a universally
 * readable cross-section scan) with every gate green).
 *
 * The allow direction (concrete parent + 'all'/inverse tipo → 1) is pinned in
 * test/parity/permissions_differential.test.ts; THIS file pins the refusals.
 */

import { describe, expect, test } from 'bun:test';
import { getPermissions, resolvePrincipal } from '../../src/core/security/permissions.ts';

// Real non-admin on the mib DB (profile 8) — same fixture as the differential.
const NON_ADMIN_USER = 16;

describe('AUTHZ-05: the wildcard grant requires a CONCRETE parent section', () => {
	test("getPermissions(_, 'all', 'all') can NEVER inherit the wildcard level-1 grant", async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		expect(principal.isGlobalAdmin).toBe(false); // fixture guard, not vacuous
		expect(await getPermissions(principal, 'all', 'all')).toBe(0);
	});

	test('non-section parent shapes are refused the wildcard grant', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		// Plain word — no numeric tail.
		expect(await getPermissions(principal, 'notasection', 'all')).toBe(0);
		// Uppercase — outside the ^[a-z]+[0-9]+$ grammar.
		expect(await getPermissions(principal, 'NUMISDATA6', 'all')).toBe(0);
		// Embedded separator / traversal-shaped inputs.
		expect(await getPermissions(principal, 'numisdata6 OR 1=1', 'all')).toBe(0);
		expect(await getPermissions(principal, 'numisdata', 'all')).toBe(0);
		expect(await getPermissions(principal, '6', 'all')).toBe(0);
	});

	test('empty parent/tipo fail closed (level 0)', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		expect(await getPermissions(principal, '', 'all')).toBe(0);
		expect(await getPermissions(principal, 'numisdata6', '')).toBe(0);
	});

	test('control: the legitimate wildcard grant still works on a concrete section', async () => {
		// Anti-vacuity: proves this file is exercising the SAME code path the
		// deny cases refuse (a deny-everything regression would fail here).
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		expect(await getPermissions(principal, 'numisdata6', 'all')).toBe(1);
	});
});
