/**
 * The 'record_tipo' declarative permission kind — the pair AND the record scope.
 *
 * PHP's SEC-024 doors on a COMPONENT of a RECORD assert two separate things:
 *   assert_tipo_permission($section_tipo, $component_tipo, $level)   // the pair
 *   assert_record_in_user_scope($section_tipo, (int)$section_id)     // the scope
 *
 * Neither existing TS kind expresses that: 'tipo' checks the pair and skips the
 * record scope, 'record' checks the SECTION level (getPermissions(p, s, s)) plus
 * the scope and never consults the component tipo. Every media-family port
 * therefore kept one half, and the audit found the consequence: a user with
 * section write who is explicitly DENIED level 2 on one media component could
 * still delete its files, rotate it, remux it, or bulk-rewrite a transcription.
 *
 * The two halves are only distinguishable with a principal whose level DIFFERS
 * per target, so the discriminating cases mock getPermissions. `mock.module` is
 * process-GLOBAL and `mock.restore()` does not revert it — the real exports are
 * snapshotted at import and re-installed (dedalo-ts-testing).
 */
// BINDS INSTALL TLDs: rsc — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test';
import { ok } from '../../src/core/errors/convert.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import * as realPermissions from '../../src/core/security/permissions.ts';
import * as realRecordScope from '../../src/core/security/record_scope.ts';
import type { ToolActionSpec } from '../../src/core/tools/module.ts';
import { assertActionPermission } from '../../src/core/tools/security.ts';

// BOTH mocked modules must be restored: mock.module is process-GLOBAL and
// mock.restore() does not revert it, so a module left stubbed here leaks into
// every other test file in the same run (dedalo-ts-testing).
const REAL_PERMISSIONS = { ...realPermissions };
const REAL_RECORD_SCOPE = { ...realRecordScope };
const restoreReal = () => {
	mock.module('../../src/core/security/permissions.ts', () => REAL_PERMISSIONS);
	mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE);
};
afterEach(restoreReal);
afterAll(restoreReal);

const USER: Principal = { userId: 16, isGlobalAdmin: false, isDeveloper: false };
const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

const SECTION = 'rsc167';
const COMPONENT = 'rsc35';

function spec(minLevel = 2): ToolActionSpec {
	return {
		permission: 'record_tipo',
		minLevel,
		handler: async () => ok(true, { requestId: 'tools-record-tipo-permission-test' }),
	};
}

/** Levels keyed by target: section-level vs the (section, component) pair. */
function stubLevels(sectionLevel: number, pairLevel: number, inScope = true) {
	mock.module('../../src/core/security/permissions.ts', () => ({
		...REAL_PERMISSIONS,
		getPermissions: async (_p: unknown, sectionTipo: string, tipo: string) =>
			sectionTipo === tipo ? sectionLevel : pairLevel,
	}));
	mock.module('../../src/core/security/record_scope.ts', () => ({
		isRecordInScope: async () => inScope,
	}));
}

describe('record_tipo — fail-closed target validation', () => {
	test('a missing component tipo is a denial, never a section-only pass', async () => {
		const result = await assertActionPermission(
			spec(),
			{ section_tipo: SECTION, section_id: 1 },
			ADMIN,
		);
		expect(result.ok).toBe(false);
	});

	test('a missing section_id is a denial', async () => {
		const result = await assertActionPermission(
			spec(),
			{ section_tipo: SECTION, tipo: COMPONENT },
			ADMIN,
		);
		expect(result.ok).toBe(false);
	});

	test('a non-numeric or traversal-shaped target is a denial', async () => {
		for (const options of [
			{ section_tipo: SECTION, tipo: COMPONENT, section_id: 'abc' },
			{ section_tipo: '../etc', tipo: COMPONENT, section_id: 1 },
			{ section_tipo: SECTION, tipo: '../etc', section_id: 1 },
		]) {
			expect((await assertActionPermission(spec(), options, ADMIN)).ok).toBe(false);
		}
	});

	test('BOTH keys present and DIFFERING is a denial (authorize-one / act-on-another)', async () => {
		// The gate reads `tipo ?? component_tipo`; a handler reading them in the
		// OPPOSITE order (tool_tc did) would be authorized against one component and
		// then rewrite a DIFFERENT one from the same payload. Refusing the ambiguous
		// request makes the gate order-independent, so no handler's key preference
		// can ever diverge from what was actually authorized.
		stubLevels(2, 2);
		const result = await assertActionPermission(
			spec(2),
			{ section_tipo: SECTION, tipo: COMPONENT, component_tipo: 'rsc99', section_id: 1 },
			USER,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors).toContain('invalid_request');
	});

	test('both keys present but IDENTICAL is fine (the media family sends both)', async () => {
		stubLevels(2, 2);
		const result = await assertActionPermission(
			spec(2),
			{ section_tipo: SECTION, tipo: COMPONENT, component_tipo: COMPONENT, section_id: 1 },
			USER,
		);
		expect(result.ok).toBe(true);
	});

	test('component_tipo is accepted as the alias for tipo (the media family sends both)', async () => {
		stubLevels(2, 2);
		const result = await assertActionPermission(
			spec(),
			{ section_tipo: SECTION, component_tipo: COMPONENT, section_id: 1 },
			USER,
		);
		expect(result.ok).toBe(true);
	});
});

describe('record_tipo — the COMPONENT half (what "record" could not express)', () => {
	test('SECTION write + component DENIED is refused', async () => {
		// The exact hole: 'record' would have passed this.
		stubLevels(2, 0);
		const result = await assertActionPermission(
			spec(2),
			{ section_tipo: SECTION, tipo: COMPONENT, section_id: 1 },
			USER,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors).toContain('unauthorized');
	});

	test('component READ where WRITE is required is refused', async () => {
		stubLevels(2, 1);
		expect(
			(
				await assertActionPermission(
					spec(2),
					{ section_tipo: SECTION, tipo: COMPONENT, section_id: 1 },
					USER,
				)
			).ok,
		).toBe(false);
	});

	test('component READ is enough when minLevel is 1', async () => {
		stubLevels(0, 1);
		expect(
			(
				await assertActionPermission(
					spec(1),
					{ section_tipo: SECTION, tipo: COMPONENT, section_id: 1 },
					USER,
				)
			).ok,
		).toBe(true);
	});
});

describe('record_tipo — the RECORD half (what "tipo" could not express)', () => {
	test('a granted component on an OUT-OF-SCOPE record is refused', async () => {
		stubLevels(2, 2, false);
		const result = await assertActionPermission(
			spec(2),
			{ section_tipo: SECTION, tipo: COMPONENT, section_id: 1 },
			USER,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.msg).toMatch(/scope/i);
	});

	test('a global admin is unscoped, as with the record kind', async () => {
		stubLevels(2, 2, false);
		expect(
			(
				await assertActionPermission(
					spec(2),
					{ section_tipo: SECTION, tipo: COMPONENT, section_id: 1 },
					ADMIN,
				)
			).ok,
		).toBe(true);
	});

	test('both halves satisfied passes', async () => {
		stubLevels(0, 2, true);
		expect(
			(
				await assertActionPermission(
					spec(2),
					{ section_tipo: SECTION, tipo: COMPONENT, section_id: 1 },
					USER,
				)
			).ok,
		).toBe(true);
	});
});

describe('the media family actually uses the new kind', () => {
	test('every destructive media action gates the component pair + the record', async () => {
		const expected: Record<string, readonly string[]> = {
			tool_media_versions: [
				'get_files_info',
				'build_version',
				'sync_files',
				'delete_version',
				'delete_quality',
				'conform_headers',
				'rotate',
			],
			tool_image_rotation: ['apply_rotation'],
			tool_tc: ['change_all_timecodes'],
			tool_pdf_extractor: ['get_pdf_data'],
			// get_ar_identifying_image is NOT here: its handler and client send no
			// component tipo at all, and PHP gates it assert_section_permission +
			// assert_record_in_user_scope — i.e. 'record'. See the reachability test below.
			tool_posterframe: ['create_identifying_image'],
		};
		for (const [name, actions] of Object.entries(expected)) {
			const module = (await import(`../../tools/${name}/server/index.ts`)) as {
				tool: { apiActions: Record<string, ToolActionSpec> };
			};
			for (const action of actions) {
				const actionSpec = module.tool.apiActions[action];
				expect(actionSpec, `${name}.${action} must exist`).toBeDefined();
				expect(actionSpec?.permission, `${name}.${action} must gate record_tipo`).toBe(
					'record_tipo',
				);
			}
		}
	});

	test('REACHABILITY: a record_tipo gate must pass the payload its caller actually sends', async () => {
		// Asserting the permission STRING is not enough — that is how
		// get_ar_identifying_image shipped green while being permanently DEAD: it was
		// flipped to record_tipo, but neither its handler nor its client sends a
		// component tipo, so the gate returned 'invalid permission target' for every
		// caller including a global admin. A gate the real payload cannot satisfy is
		// a broken action, not a strict one.
		stubLevels(2, 2);
		const mediaPayload = { section_tipo: SECTION, tipo: COMPONENT, section_id: 1 };
		expect((await assertActionPermission(spec(1), mediaPayload, USER)).ok).toBe(true);

		// get_ar_identifying_image's REAL payload carries no tipo, which is why it
		// must stay 'record'. Proof that record_tipo would break it:
		const posterframeArPayload = { section_tipo: SECTION, section_id: 1 };
		expect((await assertActionPermission(spec(1), posterframeArPayload, ADMIN)).ok).toBe(false);

		const posterframe = (await import('../../tools/tool_posterframe/server/index.ts')) as {
			tool: { apiActions: Record<string, ToolActionSpec> };
		};
		expect(posterframe.tool.apiActions.get_ar_identifying_image?.permission).toBe('record');
	});
});
