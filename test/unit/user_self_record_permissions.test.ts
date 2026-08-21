/**
 * dd128 OWN-USER-RECORD permission rules (PHP component_common::
 * resolve_component_read_permission, class.component_common.php:3547-3577).
 *
 * PHP evaluates these in NON-SEARCH mode on the actor's OWN user record and both
 * UPGRADES and DOWNGRADES the matrix level:
 *
 *   dd244 security-administrator          -> 1  (always, even for a global admin)
 *   dd1725/dd515/dd132/dd330              -> 1  (non-global-admins: anti self-elevation)
 *   dd452/dd134/dd133/dd522               -> 2  (editable self-data, used by tool_user_admin)
 *
 * The TS port shipped only the SEARCH-mode branch, so both halves were missing:
 * an ordinary user could not edit their own password/email/name (the tool's whole
 * purpose), and a user holding a dd128 write grant could set their OWN profile
 * assignment or developer flag through the generic save API.
 *
 * The rules are a WRITE gate, not only a display stamp — dd_core_api::save must
 * consult them too, which is what the end-to-end block below pins.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule). The tipos are
// identifiers threaded through the unit under test — a generic `test` section carries
// the same meaning here as the install one did.

import { describe, expect, test } from 'bun:test';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import {
	type Principal,
	resolveComponentContextPermission,
	resolveOwnUserRecordPermission,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';

const USERS = 'dd128';
const SECURITY_ADMIN = 'dd244';
const GUARDED = ['dd1725', 'dd515', 'dd132', 'dd330'] as const; // profile/developer/username/section_id
const SELF_EDITABLE = ['dd452', 'dd134', 'dd133', 'dd522'] as const; // name/email/password/image

function principal(userId: number, isGlobalAdmin: boolean): Principal {
	return { userId, isGlobalAdmin, isDeveloper: false };
}

describe('resolveOwnUserRecordPermission — the PHP dd128 table', () => {
	test('dd244 is forced to READ on your own record, global admin included', () => {
		expect(resolveOwnUserRecordPermission(principal(7, false), USERS, SECURITY_ADMIN, 7)).toBe(1);
		expect(resolveOwnUserRecordPermission(principal(7, true), USERS, SECURITY_ADMIN, 7)).toBe(1);
	});

	test('profile/developer/username/section_id are forced to READ for a non-global-admin', () => {
		for (const tipo of GUARDED) {
			expect(resolveOwnUserRecordPermission(principal(7, false), USERS, tipo, 7)).toBe(1);
		}
	});

	test('a GLOBAL ADMIN keeps the matrix level on those four (PHP exempts them)', () => {
		for (const tipo of GUARDED) {
			expect(resolveOwnUserRecordPermission(principal(7, true), USERS, tipo, 7)).toBeNull();
		}
	});

	test('name/email/password/image are forced to WRITE on your own record', () => {
		for (const tipo of SELF_EDITABLE) {
			expect(resolveOwnUserRecordPermission(principal(7, false), USERS, tipo, 7)).toBe(2);
			expect(resolveOwnUserRecordPermission(principal(7, true), USERS, tipo, 7)).toBe(2);
		}
	});

	test('ANOTHER user record is untouched — no upgrade, no downgrade', () => {
		for (const tipo of [SECURITY_ADMIN, ...GUARDED, ...SELF_EDITABLE]) {
			expect(resolveOwnUserRecordPermission(principal(7, false), USERS, tipo, 8)).toBeNull();
		}
	});

	test('a non-dd128 section is untouched', () => {
		expect(resolveOwnUserRecordPermission(principal(7, false), 'test3', 'dd133', 7)).toBeNull();
	});

	test('an absent section_id is untouched (PHP $section_id !== null)', () => {
		expect(resolveOwnUserRecordPermission(principal(7, false), USERS, 'dd133', null)).toBeNull();
		expect(
			resolveOwnUserRecordPermission(principal(7, false), USERS, 'dd133', undefined),
		).toBeNull();
	});

	test('user id 0 is skipped — PHP guards the branch with !empty($user_id)', () => {
		expect(resolveOwnUserRecordPermission(principal(0, false), USERS, 'dd133', 0)).toBeNull();
		expect(
			resolveOwnUserRecordPermission(principal(0, false), USERS, SECURITY_ADMIN, 0),
		).toBeNull();
	});

	test('a string section_id from the wire still matches its own record', () => {
		expect(resolveOwnUserRecordPermission(principal(7, false), USERS, 'dd133', '7')).toBe(2);
	});
});

describe('resolveComponentContextPermission applies the table (non-search only)', () => {
	test('own password stamps WRITE even with a zero matrix grant', async () => {
		const level = await resolveComponentContextPermission(
			principal(7, false),
			USERS,
			'dd133',
			7,
			'edit',
		);
		expect(level).toBe(2);
	});

	test('own profile stamps READ for a non-global-admin', async () => {
		const level = await resolveComponentContextPermission(
			principal(7, false),
			USERS,
			'dd1725',
			7,
			'edit',
		);
		expect(level).toBe(1);
	});

	test('SEARCH mode does NOT apply the table — PHP returns before it', async () => {
		// dd244 is a metadata-free ordinary component: in search mode PHP falls
		// through to the matrix, so the own-record downgrade must not fire here.
		const level = await resolveComponentContextPermission(
			principal(-1, true),
			USERS,
			SECURITY_ADMIN,
			-1,
			'search',
		);
		expect(level).toBeGreaterThan(1);
	});
});

describe('dd_core_api::save honours the table (the WRITE gate, end to end)', () => {
	function contextFor(userId: number, username: string, isGlobalAdmin: boolean, p: Principal) {
		const token = createSession(userId, username, isGlobalAdmin);
		const session = getSession(token);
		return {
			requestId: 'self-perm',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal: p,
		};
	}

	/**
	 * Root holds level 3 on dd244 and is a global admin, so ONLY the forced
	 * downgrade can refuse this save. Nothing is written on the denial path.
	 */
	test('editing your OWN security-administrator flag is refused, even as root', async () => {
		const p = await resolvePrincipal(-1);
		expect(p.isGlobalAdmin).toBe(true);
		const result = await dispatchRqo(
			{
				action: 'save',
				dd_api: 'dd_core_api',
				source: {
					model: 'component_security_administrator',
					tipo: SECURITY_ADMIN,
					section_tipo: USERS,
					section_id: -1,
				},
				data: { changed_data: [] },
			} as never,
			contextFor(-1, 'root', true, p) as never,
		);
		expect(result.status).toBe(403);
		expect((result.body as { ok: boolean; error: { code: string } }).ok).toBe(false);
		expect((result.body as { ok: boolean; error: { code: string } }).error.code).toBe(
			'perm.denied',
		);
	});

	test('the same flag on ANOTHER user record is NOT blocked by this rule', async () => {
		const p = await resolvePrincipal(-1);
		const result = await dispatchRqo(
			{
				action: 'save',
				dd_api: 'dd_core_api',
				source: {
					model: 'component_security_administrator',
					tipo: SECURITY_ADMIN,
					section_tipo: USERS,
					section_id: 1,
				},
				data: { changed_data: [] },
			} as never,
			contextFor(-1, 'root', true, p) as never,
		);
		expect(result.status).not.toBe(403);
	});
});
