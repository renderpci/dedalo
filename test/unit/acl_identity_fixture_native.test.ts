/**
 * THE ACL IDENTITY FIXTURE'S OWN GATE (plan item F2).
 *
 * The fixture (`test/helpers/acl_identity_fixture.ts`) exists because the suite
 * database has NO real admin and NO real non-admin: measured 2026-08-10,
 * `resolvePrincipal(1)` returns `isGlobalAdmin:false` with permission 0 on
 * `test3`, and user 16 — imported as `NON_ADMIN_USER` by ~10 unit files — does
 * not exist at all. Every "the admin sees strictly more than the non-admin"
 * assertion in the suite is therefore satisfiable at ZERO versus ZERO.
 *
 * THIS FILE IS WHAT MAKES THAT IMPOSSIBLE TO REGRESS. It asserts, against the
 * real production readers (no literals, no hand-built `{isGlobalAdmin:true}`),
 * that the two minted identities differ in every dimension the ACL branches on:
 *
 *   - the FLAG:    resolvePrincipal(admin).isGlobalAdmin === true,
 *                  resolvePrincipal(nonAdmin).isGlobalAdmin === false — with the
 *                  non-admin's dd244 PRESENT and negative, so a reader that
 *                  tested "locator exists" instead of "target === 1" is caught;
 *   - the GRANT:   getPermissions(nonAdmin,'test3','test3') === 1 and
 *                  getPermissions(admin,'test3','test3') === 3 — and the
 *                  NON-DEGENERACY assertion: the low side is strictly > 0;
 *   - the FLAG ALONE, grants held equal: dd88 (maintenance) is granted at level
 *                  2 by BOTH profiles, yet the non-admin gets 0 — the gate is
 *                  the flag, not the matrix; and dd15 (time machine) is
 *                  admin-only with no grant on either side;
 *   - the ASSIGNMENTS: resolveProfileId and getUserProjects resolve the minted
 *                  dd1725 / dd170 locators.
 *
 * Plus the fixture's own hygiene: reserved-band ids, and a sweep that THROWS
 * when it deletes nothing.
 *
 * Scratch band 930000-930999, swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	getPermissions,
	getUserProjects,
	resolvePrincipal,
	resolveProfileId,
} from '../../src/core/security/permissions.ts';
import {
	ACL_ADMIN_LEVEL,
	ACL_ADMIN_PROFILE_ID,
	ACL_ADMIN_USER_ID,
	ACL_GRANTED_SECTION,
	ACL_MAINTENANCE_GRANT,
	ACL_NON_ADMIN_LEVEL,
	ACL_NON_ADMIN_PROFILE_ID,
	ACL_NON_ADMIN_USER_ID,
	ACL_PROJECT_ID,
	AREA_MAINTENANCE,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';

/** dd15 — the time-machine section; the wrapper rule is admin-only. */
const TIME_MACHINE_SECTION = 'dd15';
/** The lowest id the scratch law allows a minted record to occupy. */
const SCRATCH_ID_FLOOR = 900000;

describe.if(DB_READY)('ACL identity fixture — the contrast is non-degenerate', () => {
	beforeAll(installAclIdentityFixture);
	afterAll(removeAclIdentityFixture);

	test('the admin flag resolves TRUE, and only the admin flag does', async () => {
		const admin = await resolvePrincipal(ACL_ADMIN_USER_ID);
		expect(admin.userId).toBe(ACL_ADMIN_USER_ID);
		expect(admin.isGlobalAdmin).toBe(true);
		// dd515 is explicitly "No": admin-ness and developer-ness are read from
		// DIFFERENT components and must not be conflated.
		expect(admin.isDeveloper).toBe(false);
	});

	test('a PRESENT but negative dd244 resolves FALSE (not merely "absent")', async () => {
		const nonAdmin = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
		expect(nonAdmin.userId).toBe(ACL_NON_ADMIN_USER_ID);
		expect(nonAdmin.isGlobalAdmin).toBe(false);
		expect(nonAdmin.isDeveloper).toBe(false);
	});

	test('grant matrix: non-admin reads test3 at exactly 1, admin at exactly 3', async () => {
		const admin = await resolvePrincipal(ACL_ADMIN_USER_ID);
		const nonAdmin = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);

		const adminLevel = await getPermissions(admin, ACL_GRANTED_SECTION, ACL_GRANTED_SECTION);
		const nonAdminLevel = await getPermissions(nonAdmin, ACL_GRANTED_SECTION, ACL_GRANTED_SECTION);

		expect(nonAdminLevel).toBe(ACL_NON_ADMIN_LEVEL);
		expect(adminLevel).toBe(ACL_ADMIN_LEVEL);

		// THE ANTI-ZERO-VERSUS-ZERO ASSERTION. "admin > non-admin" alone is
		// satisfied by 0 > 0 being false... and by 1 > 0 where the 0 is an
		// identity that does not exist. Pin the LOW side above zero too.
		expect(nonAdminLevel).toBeGreaterThan(0);
		expect(adminLevel).toBeGreaterThan(nonAdminLevel);
	});

	test('flag alone, grants held EQUAL: dd88 is 2 for the admin and 0 for the non-admin', async () => {
		const admin = await resolvePrincipal(ACL_ADMIN_USER_ID);
		const nonAdmin = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);

		// Both profiles carry the identical dd88_dd88 grant, so the only thing
		// that can separate these two numbers is the maintenance gate reading
		// the principal's flags.
		expect(await getPermissions(admin, AREA_MAINTENANCE, AREA_MAINTENANCE)).toBe(
			ACL_MAINTENANCE_GRANT,
		);
		expect(await getPermissions(nonAdmin, AREA_MAINTENANCE, AREA_MAINTENANCE)).toBe(0);
	});

	test('time machine (dd15) is admin-only, with no grant on either profile', async () => {
		const admin = await resolvePrincipal(ACL_ADMIN_USER_ID);
		const nonAdmin = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
		expect(await getPermissions(admin, TIME_MACHINE_SECTION, TIME_MACHINE_SECTION)).toBe(1);
		expect(await getPermissions(nonAdmin, TIME_MACHINE_SECTION, TIME_MACHINE_SECTION)).toBe(0);
	});

	test('dd1725 profile assignment resolves to each minted profile record', async () => {
		expect(await resolveProfileId(ACL_ADMIN_USER_ID)).toBe(ACL_ADMIN_PROFILE_ID);
		expect(await resolveProfileId(ACL_NON_ADMIN_USER_ID)).toBe(ACL_NON_ADMIN_PROFILE_ID);
	});

	test('dd170 scopes the non-admin to exactly one project; the admin has none', async () => {
		expect(await getUserProjects(ACL_NON_ADMIN_USER_ID)).toEqual([ACL_PROJECT_ID]);
		expect(await getUserProjects(ACL_ADMIN_USER_ID)).toEqual([]);
	});

	test('every minted id sits in the reserved scratch band', () => {
		for (const id of [
			ACL_ADMIN_USER_ID,
			ACL_NON_ADMIN_USER_ID,
			ACL_ADMIN_PROFILE_ID,
			ACL_NON_ADMIN_PROFILE_ID,
			ACL_PROJECT_ID,
		]) {
			expect(id).toBeGreaterThanOrEqual(SCRATCH_ID_FLOOR);
			expect(id).toBeLessThan(931000);
		}
	});

	// LAST: the sweep must FAIL LOUDLY when it deletes nothing (a filter that
	// matches no rows is exactly how the suite DB accumulated 44% unswept
	// scratch). Re-installs afterwards so the file's own afterAll sweep — which
	// is strict — still finds its rows.
	test('the sweep throws when it removes 0 rows, and install is idempotent', async () => {
		await removeAclIdentityFixture();
		await expect(removeAclIdentityFixture()).rejects.toThrow(
			/removed 0 rows|scratch filter is wrong/,
		);
		await installAclIdentityFixture();
		expect((await resolvePrincipal(ACL_ADMIN_USER_ID)).isGlobalAdmin).toBe(true);
	});
});
