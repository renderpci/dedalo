/**
 * TIME MACHINE scope AUTHORIZATION — WC-2026-08-14-tm-scope-server-owned,
 * WC-2026-08-14-tm-permission-floor.
 *
 * The ACL gate (read_facade) and the per-ddo permission floor both consume ONE
 * answer: which caller section a TM read is scoped to. This gate pins the two
 * properties that make that answer an authorization input rather than a
 * convenience:
 *
 *   1. REFUSAL OVER REDUCTION — a read spanning two sections resolves to NO
 *      scope (mixed), never to the first section: one section's grant must not
 *      authorize another section's history. read_facade turns `mixed` into a
 *      401; the floor turns the null section into admin-only. Both behaviours
 *      hang off the values pinned here.
 *   2. FAIL-CLOSED GRANTS — a section that declares no `time_machine_list`
 *      child grants NOTHING to a non-admin (§7.4: the target is absent, so
 *      access falls back to global-admin only). `test65` — the scratch section
 *      every TM gate mints under — declares none, which makes it the honest
 *      probe: if this ever flips open, a non-admin reads history the ontology
 *      never granted.
 *
 * (The companion behaviours are pinned elsewhere: the floor consuming this
 * scope in tm_permission_floor_native, the session isolation in
 * tm_session_sqo_isolation_native, the derived columns in
 * tm_list_definitions_native.)
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). The two
// section tipos became their phase-2 clones (src/core/test_data/test_tld_tipo_map.json):
// `resolveTimeMachineScopeSection` is a pure function over the SQO's locators and
// resolves neither, so the rename IS the whole migration and every asserted value
// is unchanged. The fail-closed §7.4 half already ran on the generic `test65`.

import { describe, expect, test } from 'bun:test';
import {
	canAccessTimeMachineList,
	getTimeMachineListTipo,
	resolveTimeMachineScopeSection,
} from '../../src/core/section/list_definitions/time_machine_list.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const admin: Principal = { userId: 42, isGlobalAdmin: true, isDeveloper: false };
const plainUser: Principal = { userId: 43, isGlobalAdmin: false, isDeveloper: false };

describe('refusal over reduction', () => {
	test('locators spanning two sections resolve to NO scope, flagged mixed', () => {
		expect(
			resolveTimeMachineScopeSection({
				filter_by_locators: [
					{ section_tipo: 'test6813', section_id: 7 },
					{ section_tipo: 'test6099', section_id: 3 },
				],
			}),
		).toEqual({ sectionTipo: null, mixed: true });
	});

	test('a single-section read is scoped; the bare browse is not', () => {
		expect(
			resolveTimeMachineScopeSection({
				filter_by_locators: [{ section_tipo: 'test6813', section_id: 7 }],
			}),
		).toEqual({ sectionTipo: 'test6813', mixed: false });
		expect(resolveTimeMachineScopeSection({ section_tipo: ['dd15'] })).toEqual({
			sectionTipo: null,
			mixed: false,
		});
	});
});

describe('fail-closed grants (§7.4)', () => {
	test('a section with no time_machine_list child grants a non-admin nothing', async () => {
		expect(await getTimeMachineListTipo('test65')).toBeNull();
		expect(await canAccessTimeMachineList(plainUser, 'test65')).toBe(false);
	});

	test('a global admin passes regardless — the browse depends on it', async () => {
		expect(await canAccessTimeMachineList(admin, 'test65')).toBe(true);
		// dd15 itself declares no time_machine_list child either: gating the
		// UNSCOPED browse against dd15 is exactly what makes it admin-only.
		expect(await canAccessTimeMachineList(plainUser, 'dd15')).toBe(false);
		expect(await canAccessTimeMachineList(admin, 'dd15')).toBe(true);
	});
});
