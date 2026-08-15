/**
 * TIME MACHINE (dd15) PERMISSION FLOOR — WC-2026-08-14-tm-permission-floor.
 *
 * Two rules used to disagree, invisibly, because the TM read never consulted the
 * first: `getPermissions` capped every dd15 column at `isGlobalAdmin ? 1 : 0`,
 * while `canAccessTimeMachineList` (SECTION_SPEC §7.4) exists precisely to grant
 * a section's history to NON-admins holding its `time_machine_list` grant. They
 * never collided because `buildTmContext` hardcoded `permissions: 1` and the
 * client re-stamped every ddo the same way — the per-ddo authz loop was bypassed.
 *
 * Unifying dd15 onto the generic read makes that loop run for real, so the floor
 * now derives from the §7.4 grant on the CALLER SECTION. `getPermissions` has no
 * parameter to carry which section that is, so it arrives through the
 * request-scoped TM scope (tm_scope_context.ts). Absence of a scope is
 * MEANINGFUL, not a gap: the bare browse (`?tipo=dd15&mode=list`) shows every
 * section's history at once, so no per-section grant can authorize it.
 *
 * The scope RESOLVER is pinned exhaustively here because it is the input to an
 * authorization decision: it decides which section's grant is consulted, so a
 * wrong answer is a cross-section read, not a cosmetic bug. It is pure (no DB),
 * which is why this half asserts in full.
 */

import { describe, expect, test } from 'bun:test';
import { resolveTimeMachineScopeSection } from '../../src/core/section/list_definitions/time_machine_list.ts';
import {
	currentTimeMachineScopeSection,
	runWithTimeMachineScope,
} from '../../src/core/section/list_definitions/tm_scope_context.ts';
import { getPermissions, type Principal } from '../../src/core/security/permissions.ts';

const TM = 'dd15';

const admin: Principal = { userId: 42, isGlobalAdmin: true, isDeveloper: false };
const plainUser: Principal = { userId: 43, isGlobalAdmin: false, isDeveloper: false };

describe('TM scope resolution (the input to the floor)', () => {
	test('a per-component history scopes to its locator section', () => {
		const scope = resolveTimeMachineScopeSection({
			filter_by_locators: [{ section_tipo: 'oh1', section_id: 7, tipo: 'oh25', lang: 'lg-spa' }],
		});
		expect(scope).toEqual({ sectionTipo: 'oh1', mixed: false });
	});

	test('several locators on the SAME section still scope to it', () => {
		const scope = resolveTimeMachineScopeSection({
			filter_by_locators: [
				{ section_tipo: 'oh1', section_id: 7 },
				{ section_tipo: 'oh1', section_id: 9 },
			],
		});
		expect(scope).toEqual({ sectionTipo: 'oh1', mixed: false });
	});

	test('locators spanning TWO sections are refused, never reduced to the first', () => {
		// Taking the first would authorize the second under a grant that does not
		// cover it — the cross-section read this resolver exists to prevent.
		const scope = resolveTimeMachineScopeSection({
			filter_by_locators: [
				{ section_tipo: 'oh1', section_id: 7 },
				{ section_tipo: 'rsc36', section_id: 3 },
			],
		});
		expect(scope).toEqual({ sectionTipo: null, mixed: true });
	});

	test('the record-snapshot list scopes to its `tipo` column filter', () => {
		const scope = resolveTimeMachineScopeSection({
			filter: { $and: [{ column_name: 'tipo', q: 'oh25' }] },
		});
		expect(scope).toEqual({ sectionTipo: 'oh25', mixed: false });
	});

	test('the bare browse is UNSCOPED (and therefore admin-only downstream)', () => {
		expect(resolveTimeMachineScopeSection({ section_tipo: [{ tipo: TM }] })).toEqual({
			sectionTipo: null,
			mixed: false,
		});
		expect(resolveTimeMachineScopeSection(undefined)).toEqual({ sectionTipo: null, mixed: false });
	});

	test('locators carrying no section_tipo do not fabricate a scope', () => {
		expect(resolveTimeMachineScopeSection({ filter_by_locators: [{ section_id: 7 }] })).toEqual({
			sectionTipo: null,
			mixed: false,
		});
	});
});

describe('the TM scope is request-scoped, never module state', () => {
	test('it is undefined outside any scope and does not leak out of one', async () => {
		expect(currentTimeMachineScopeSection()).toBeUndefined();
		const inside = await runWithTimeMachineScope('oh1', async () =>
			currentTimeMachineScopeSection(),
		);
		expect(inside).toBe('oh1');
		expect(currentTimeMachineScopeSection()).toBeUndefined();
	});

	test('concurrent scopes do not bleed into each other', async () => {
		// The whole reason this is AsyncLocalStorage and not a module variable:
		// Bun is a long-lived process serving concurrent requests.
		const [a, b] = await Promise.all([
			runWithTimeMachineScope('oh1', async () => {
				await Promise.resolve();
				return currentTimeMachineScopeSection();
			}),
			runWithTimeMachineScope('rsc36', async () => currentTimeMachineScopeSection()),
		]);
		expect(a).toBe('oh1');
		expect(b).toBe('rsc36');
	});
});

describe('the dd15 permission floor', () => {
	test('a global admin reads dd15 columns, scoped or not', async () => {
		expect(await getPermissions(admin, TM, 'dd559')).toBe(1);
		expect(await runWithTimeMachineScope('oh1', () => getPermissions(admin, TM, 'dd559'))).toBe(1);
	});

	test('a global admin is never granted more than READ on dd15', async () => {
		// Consultation-only: reverts go through tool_time_machine, never inline edit.
		for (const tipo of ['dd559', 'dd577', 'dd578', 'dd1574', 'rsc329']) {
			expect(await getPermissions(admin, TM, tipo)).toBe(1);
		}
	});

	test('a non-admin gets NOTHING on the unscoped browse', async () => {
		// No scope ⇒ every section's history at once ⇒ no per-section grant applies.
		expect(await getPermissions(plainUser, TM, 'dd559')).toBe(0);
	});

	test('a non-admin gets nothing when the scope is dd15 itself', async () => {
		// dd15 declares no time_machine_list child, so scoping to it would be a
		// self-referential grant. Fail closed rather than resolve it.
		expect(await runWithTimeMachineScope(TM, () => getPermissions(plainUser, TM, 'dd559'))).toBe(0);
	});

	test('a non-admin scoped to a section they hold no grant on is refused', async () => {
		// 'dd0' is not a granted section for this synthetic principal; the floor
		// must resolve through canAccessTimeMachineList and come back 0 rather
		// than defaulting open.
		expect(await runWithTimeMachineScope('dd0', () => getPermissions(plainUser, TM, 'dd559'))).toBe(
			0,
		);
	});
});
