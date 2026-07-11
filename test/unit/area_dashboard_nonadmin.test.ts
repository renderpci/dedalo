/**
 * Phase B non-admin gate (DB-derived, no PHP — the menu_nonadmin pattern): the
 * dashboard `total` metric is an ACL surface. PHP count_section_records returns
 * null when read permission < 1, so a non-admin's dashboard must null out the
 * totals of sections they cannot read. Verified white-box against getPermissions
 * (the admin harness cannot see this gate — admin reads everything).
 *
 * Fixture: NON_ADMIN_USER 16 (profile 8 — the standing non-admin fixture, same
 * as menu_nonadmin.test.ts). Area dd242 (area_root, 24 sections) has a mixed
 * access spread for this user.
 */

import { beforeAll, expect, test } from 'bun:test';
import { getDashboardChildSections, getDashboardData } from '../../src/core/area/dashboard.ts';
import { getPermissions, resolvePrincipal } from '../../src/core/security/permissions.ts';

const NON_ADMIN_USER = 16;
const AREA_TIPO = 'dd242';

let sections: { section_tipo: string; total?: number | null }[] = [];
let adminNonNull = 0;

beforeAll(async () => {
	const nonAdmin = await resolvePrincipal(NON_ADMIN_USER);
	const admin = await resolvePrincipal(-1);
	const nonAdminDash = await getDashboardData(nonAdmin, AREA_TIPO, ['total']);
	sections = nonAdminDash.sections as { section_tipo: string; total?: number | null }[];
	const adminDash = await getDashboardData(admin, AREA_TIPO, ['total']);
	adminNonNull = (adminDash.sections as { total?: number | null }[]).filter(
		(s) => typeof s.total === 'number',
	).length;
}, 60000);

test('non-admin dashboard nulls total for every unreadable section', async () => {
	const nonAdmin = await resolvePrincipal(NON_ADMIN_USER);
	expect(sections.length).toBeGreaterThan(0);
	for (const section of sections) {
		const level = await getPermissions(nonAdmin, section.section_tipo, section.section_tipo);
		if (level < 1) {
			expect(section.total).toBe(null);
		}
	}
}, 30000);

test('the ACL bites: admin sees strictly more countable sections than the non-admin', () => {
	const nonAdminNonNull = sections.filter((s) => typeof s.total === 'number').length;
	// admin reads every section; the non-admin fixture reads far fewer.
	expect(adminNonNull).toBeGreaterThan(nonAdminNonNull);
});
