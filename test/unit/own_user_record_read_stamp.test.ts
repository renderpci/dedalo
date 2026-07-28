/**
 * The dd128 OWN-USER-RECORD rules must reach the SECTION READ's per-element
 * permission stamp (PHP component_common::get_component_permissions →
 * resolve_component_read_permission, class.component_common.php:3462).
 *
 * PHP resolves EVERY component instance's context permission through that
 * resolver, so reading your own user record both UPGRADES the four self-editable
 * components (dd452 name / dd133 password / dd134 email / dd522 image → 2) and
 * DOWNGRADES the guarded ones (dd244 security-administrator → 1 always;
 * dd1725/dd515/dd132/dd330 → 1 for a non-global-admin).
 *
 * The TS port already applies this on the SAVE door (dd_core_api save) and on
 * the single-component get_data read (resolveComponentContextPermission), but
 * the SECTION read stamped straight from the matrix — and tool_user_admin builds
 * a dd128 SECTION instance. Consequences of the gap:
 *   - an ordinary user whose profile grants <2 on those components got read-only
 *     (or, at 0, dropped) fields, so the self-service editor could not edit
 *     anything the save door would happily have accepted;
 *   - the actor's own dd244 flag rendered EDITABLE for anyone the matrix gave 2+.
 *
 * Root is the observable fixture here: the superuser short-circuits the matrix
 * to 3, so every forced level below 3 proves the rule fired.
 */

import { describe, expect, test } from 'bun:test';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { readSection } from '../../src/core/section/read.ts';
import type { Principal } from '../../src/core/security/permissions.ts';

const USERS = 'dd128';
/** name / password / email / image — PHP forces 2 on your own record. */
const SELF_EDITABLE = ['dd452', 'dd133', 'dd134', 'dd522'] as const;
/** security-administrator — PHP forces 1 on your own record, admins included. */
const SECURITY_ADMIN = 'dd244';

const ROOT: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: false };

function ddo(tipo: string, model: string): Record<string, unknown> {
	return {
		tipo,
		type: 'component',
		typo: 'ddo',
		model,
		section_tipo: USERS,
		parent: USERS,
		mode: 'edit',
		properties: { css: {} },
	};
}

/** tipo → stamped context permission, for a dd128 record read in edit mode. */
async function stampedPermissions(
	principal: Principal,
	sectionId: number,
): Promise<Map<string, number>> {
	const result = await runWithRequestLangs(
		{ applicationLang: 'lg-eng', dataLang: 'lg-nolan' },
		async () =>
			readSection(
				{
					source: {
						typo: 'source',
						model: 'section',
						tipo: USERS,
						section_tipo: USERS,
						section_id: String(sectionId),
						action: 'get_data',
						mode: 'edit',
						lang: 'lg-nolan',
					},
					show: {
						ddo_map: [
							ddo('dd452', 'component_input_text'),
							ddo('dd133', 'component_password'),
							ddo('dd134', 'component_email'),
							ddo('dd522', 'component_image'),
							ddo(SECURITY_ADMIN, 'component_radio_button'),
						],
					},
					sqo: { section_tipo: [USERS], limit: 1, offset: 0 },
					// biome-ignore lint/suspicious/noExplicitAny: test rqo literal
				} as any,
				principal,
			),
	);
	const levels = new Map<string, number>();
	for (const entry of result.context) {
		levels.set(String(entry.tipo), Number(entry.permissions));
	}
	return levels;
}

describe('own-user-record rules reach the section read stamp', () => {
	test('the four self-editable components are forced to WRITE (2) on your own record', async () => {
		const levels = await stampedPermissions(ROOT, ROOT.userId);
		for (const tipo of SELF_EDITABLE) {
			// Root's matrix level is 3; a 2 here can only come from the own-record rule.
			expect(levels.get(tipo)).toBe(2);
		}
	});

	test('the security-administrator flag is forced to READ (1) on your own record', async () => {
		const levels = await stampedPermissions(ROOT, ROOT.userId);
		expect(levels.get(SECURITY_ADMIN)).toBe(1);
	});

	test("ANOTHER user's record is untouched by the rule — the matrix still decides", async () => {
		// section_id 1 is not root's own record, so every element keeps level 3.
		const levels = await stampedPermissions(ROOT, 1);
		for (const tipo of [...SELF_EDITABLE, SECURITY_ADMIN]) {
			expect(levels.get(tipo)).toBe(3);
		}
	});
});
