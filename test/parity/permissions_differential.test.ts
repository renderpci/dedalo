/**
 * Phase 5b gate: permissions differential — the TS getPermissions() versus the
 * live PHP get_permissions for a REAL non-admin user (user 16, profile 8, 148
 * grants) across a spread of (section_tipo, component_tipo) pairs.
 *
 * PHP side: dd_utils_api::get_permissions (if exposed) OR the observable
 * behavior — a non-admin read that PHP denies must be denied by TS too. Here
 * we drive the TS resolver directly and cross-check against the profile's
 * dd774 grants read straight from the DB (the source of truth both engines
 * read), plus the hard-coded bypass rules.
 *
 * This is a WHITE-BOX differential: TS getPermissions vs the raw dd774 matrix +
 * documented bypasses. A live-PHP end-to-end deny/allow check is layered on
 * top via the dispatch read gate.
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../../src/core/ontology/resolver.ts';
import {
	PUBLIC_LIST_TABLES,
	getPermissions,
	getSectionPermissions,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';

const NON_ADMIN_USER = 16; // profile 8, real non-admin on the mib DB

interface Grant {
	tipo: string;
	section_tipo: string;
	value: number;
}

describe('permissions differential: TS vs dd774 matrix (Phase 5b gate)', () => {
	let grants: Grant[];

	beforeAll(async () => {
		const rows = (await sql`
			SELECT misc->'dd774' AS grants FROM matrix_profiles
			WHERE section_tipo = 'dd234' AND section_id = 8
		`) as { grants: Grant[] }[];
		grants = rows[0]?.grants ?? [];
	});

	test('resolvePrincipal marks user 16 as a non-admin, non-developer', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		expect(principal.isGlobalAdmin).toBe(false);
		expect(principal.isDeveloper).toBe(false);
	});

	test('every matrix grant resolves to exactly its stored level', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		// Sample across all four levels; skip bypass-shadowed keys.
		const bypassed = new Set(['dd15', 'dd1324', 'dd655']);
		let checked = 0;
		let zeroChecked = 0;
		for (const grant of grants) {
			if (bypassed.has(grant.section_tipo)) continue;
			const level = await getPermissions(principal, grant.section_tipo, grant.tipo);
			if (grant.value > 0) {
				expect(level).toBe(grant.value);
			} else {
				// EXACT zero-grant law (audit 2026-07-07: the former >= 0 was
				// vacuous — a denied grant resolving to 2/3 passed). A stored 0 is
				// exactly 0, UNLESS the documented public-list fallback applies
				// (parent is a 'section' model on a PUBLIC_LIST_TABLES table),
				// in which case it is exactly 1 — never anything else.
				const isSection = (await getModelByTipo(grant.section_tipo)) === 'section';
				const table = isSection ? await getMatrixTableFromTipo(grant.section_tipo) : null;
				const publicListFallback = table !== null && PUBLIC_LIST_TABLES.has(table);
				expect(level).toBe(publicListFallback ? 1 : 0);
				zeroChecked++;
			}
			checked++;
		}
		expect(checked).toBeGreaterThan(50); // real coverage, not a no-op
		expect(zeroChecked).toBeGreaterThan(0); // the DENY half of the matrix is really exercised
	});

	test('a pair NOT in the matrix denies (level 0) unless a public-list fallback applies', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		// A component tipo the profile never grants on a non-list section.
		const level = await getPermissions(principal, 'numisdata6', 'numisdata999999');
		expect(level).toBe(0);
	});

	test('hard-coded bypasses hold for the non-admin', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		// time machine → admin-only → 0 for non-admin
		expect(await getPermissions(principal, 'dd15', 'anything')).toBe(0);
		// tools register → 1
		expect(await getPermissions(principal, 'dd1324', 'x1')).toBe(1);
		// temp preset → 2
		expect(await getPermissions(principal, 'dd655', 'x1')).toBe(2);
		// inverse relations / 'all' → 1
		expect(await getPermissions(principal, 'numisdata6', 'all')).toBe(1);
		expect(await getPermissions(principal, 'numisdata6', 'dd1596')).toBe(1);
		// area maintenance → 0 (blocked for non-admin/non-dev)
		expect(await getPermissions(principal, 'x1', 'dd88')).toBe(0);
	});

	test('superuser is always level 3', async () => {
		const superuser = await resolvePrincipal(-1);
		expect(superuser.isGlobalAdmin).toBe(true);
		expect(await getPermissions(superuser, 'numisdata6', 'numisdata16')).toBe(3);
		expect(await getPermissions(superuser, 'anything', 'anything')).toBe(3);
	});

	test('consultation-only cap lives ONLY in getSectionPermissions, never in getPermissions', async () => {
		const superuser = await resolvePrincipal(-1);
		// getPermissions mirrors PHP common::get_permissions — Activity is NOT
		// capped there (the cap is one layer up, section::get_section_permissions).
		expect(await getPermissions(superuser, 'dd542', 'dd542')).toBe(3);
		// getSectionPermissions IS the capped section-level perm (PHP :1929).
		expect(await getSectionPermissions(superuser, 'dd542')).toBe(1);
		// A normal section is passed through unchanged by getSectionPermissions.
		expect(await getSectionPermissions(superuser, 'numisdata6')).toBe(3);
	});
});
