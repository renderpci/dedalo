/**
 * The 'record_tipo' declarative permission kind — the pair, the section floor
 * AND the record scope, through THE WRITE DOOR (closure Step 3).
 *
 * PHP's SEC-024 doors on a COMPONENT of a RECORD assert two separate things:
 *   assert_tipo_permission($section_tipo, $component_tipo, $level)   // the pair
 *   assert_record_in_user_scope($section_tipo, (int)$section_id)     // the scope
 *
 * Neither older TS kind expressed that: 'tipo' checked the pair and skipped the
 * record scope, 'record' checked the SECTION level plus the scope and never
 * consulted the component tipo. Every media-family port therefore kept one
 * half, and the audit found the consequence: a user with section write who is
 * explicitly DENIED level 2 on one media component could still delete its
 * files, rotate it, remux it, or bulk-rewrite a transcription.
 *
 * Since closure Step 3 the kind is `write_door.authorizeRecordAccess` with
 * section floor 1 — so a profile that grants the component but NOT the section
 * (a matrix the human read refuses) is refused here too.
 *
 * NO MOCKS (rewritten 2026-09-30): the halves are told apart by REAL identities
 * whose grants differ per target (test/helpers/authz_door_fixture.ts), resolved
 * through the real permission resolver on the suite database, against
 * engine-built records. The contrast is asserted first.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ok } from '../../src/core/errors/convert.ts';
import { type Principal, resolvePrincipal } from '../../src/core/security/permissions.ts';
import type { ToolActionSpec } from '../../src/core/tools/module.ts';
import { assertActionPermission } from '../../src/core/tools/security.ts';
import {
	AUTHZ_AV,
	AUTHZ_IMAGE,
	AUTHZ_PROJECT_P,
	AUTHZ_PROJECT_Q,
	AUTHZ_SECTION,
	type AuthzIdentities,
	assertAuthzDoorContrast,
	createDoorRecord,
	installAuthzDoorFixture,
	removeAuthzDoorFixture,
	resolveAuthzIdentities,
} from '../helpers/authz_door_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const SECTION = AUTHZ_SECTION;
const COMPONENT = AUTHZ_AV;

function spec(minLevel = 2): ToolActionSpec {
	return {
		permission: 'record_tipo',
		minLevel,
		handler: async () => ok(true, { requestId: 'tools-record-tipo-permission-test' }),
	};
}

describe('record_tipo — fail-closed target validation (grammar first, no DB needed)', () => {
	// The superuser holds every grant, so a refusal here is the GRAMMAR's.
	const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };

	test('a missing component tipo is a denial, never a section-only pass', async () => {
		const result = await assertActionPermission(
			spec(),
			{ section_tipo: SECTION, section_id: 1 },
			SUPERUSER,
		);
		expect(result).toEqual({
			ok: false,
			msg: 'invalid permission target',
			errors: ['invalid_request'],
		});
	});

	test('a missing section_id is a denial', async () => {
		const result = await assertActionPermission(
			spec(),
			{ section_tipo: SECTION, tipo: COMPONENT },
			SUPERUSER,
		);
		expect(result.ok).toBe(false);
	});

	test('a non-integer or traversal-shaped target is a denial', async () => {
		for (const options of [
			{ section_tipo: SECTION, tipo: COMPONENT, section_id: 'abc' },
			{ section_tipo: SECTION, tipo: COMPONENT, section_id: 1.5 },
			{ section_tipo: '../etc', tipo: COMPONENT, section_id: 1 },
			{ section_tipo: SECTION, tipo: '../etc', section_id: 1 },
		]) {
			const result = await assertActionPermission(spec(), options, SUPERUSER);
			expect({ options, ok: result.ok }).toEqual({ options, ok: false });
		}
	});
});

describe.if(DB_READY)('record_tipo — the real resolver, real identities, real records', () => {
	let ids: AuthzIdentities;
	let superuser: Principal;
	/** A record in project P (every in-scope identity's project). */
	let inScope = 0;
	/** A record in project Q (only the out-of-scope identity's project). */
	let otherProject = 0;

	beforeAll(async () => {
		await installAuthzDoorFixture();
		inScope = await createDoorRecord(SECTION, AUTHZ_PROJECT_P);
		otherProject = await createDoorRecord(SECTION, AUTHZ_PROJECT_Q);
		ids = await resolveAuthzIdentities();
		superuser = await resolvePrincipal(-1);
	});
	afterAll(removeAuthzDoorFixture);

	const target = (sectionId: number, extra: Record<string, unknown> = {}) => ({
		section_tipo: SECTION,
		tipo: COMPONENT,
		section_id: sectionId,
		...extra,
	});

	test('the contrast is live (guards every pair below)', async () => {
		await assertAuthzDoorContrast(ids);
		expect(inScope).toBeGreaterThan(0);
		expect(otherProject).toBeGreaterThan(0);
	});

	describe('the alias keys', () => {
		test('BOTH keys present and DIFFERING is a denial (authorize-one / act-on-another)', async () => {
			// The gate reads `tipo ?? component_tipo`; a handler reading them in the
			// OPPOSITE order (tool_tc did) would be authorized against one component and
			// then rewrite a DIFFERENT one from the same payload. Refusing the ambiguous
			// request makes the gate order-independent.
			const result = await assertActionPermission(
				spec(2),
				target(inScope, { component_tipo: AUTHZ_IMAGE }),
				ids.control,
			);
			expect(result).toEqual({
				ok: false,
				msg: 'conflicting component target',
				errors: ['invalid_request'],
			});
		});

		test('both keys present but IDENTICAL is fine (the media family sends both)', async () => {
			expect(
				await assertActionPermission(
					spec(2),
					target(inScope, { component_tipo: COMPONENT }),
					ids.control,
				),
			).toEqual({ ok: true });
		});

		test('component_tipo is accepted as the alias for tipo', async () => {
			expect(
				await assertActionPermission(
					spec(2),
					{ section_tipo: SECTION, component_tipo: COMPONENT, section_id: inScope },
					ids.control,
				),
			).toEqual({ ok: true });
		});
	});

	describe('the COMPONENT half (what "record" could not express)', () => {
		test('SECTION write + component DENIED is refused; the control is served', async () => {
			const refused = await assertActionPermission(spec(2), target(inScope), ids.sectionOnly);
			expect(refused).toEqual({
				ok: false,
				msg: 'insufficient permissions on target',
				errors: ['unauthorized'],
			});
			expect(await assertActionPermission(spec(2), target(inScope), ids.control)).toEqual({
				ok: true,
			});
		});

		test('component READ where WRITE is required is refused; READ is enough at minLevel 1', async () => {
			expect((await assertActionPermission(spec(2), target(inScope), ids.level1)).ok).toBe(false);
			expect(await assertActionPermission(spec(1), target(inScope), ids.level1)).toEqual({
				ok: true,
			});
		});
	});

	describe('the SECTION half (the write door floor — new in closure Step 3)', () => {
		test('the component granted but the SECTION at 0 is refused, at both levels', async () => {
			for (const level of [1, 2]) {
				const result = await assertActionPermission(
					spec(level),
					target(inScope),
					ids.componentOnly,
				);
				expect({ level, result }).toEqual({
					level,
					result: {
						ok: false,
						msg: 'insufficient permissions on target',
						errors: ['unauthorized'],
					},
				});
			}
		});
	});

	describe('the RECORD half (what "tipo" could not express)', () => {
		test('a granted component on an OUT-OF-SCOPE record is refused', async () => {
			const result = await assertActionPermission(spec(2), target(inScope), ids.outOfScope);
			expect(result).toEqual({
				ok: false,
				msg: 'record is out of the user scope',
				errors: ['unauthorized'],
			});
		});

		test('a global admin is unscoped, as with the record kind — on a POSITIVE id', async () => {
			// dd128Admin holds project P only; the record is in Q.
			expect(await assertActionPermission(spec(2), target(otherProject), ids.dd128Admin)).toEqual({
				ok: true,
			});
			// …and a non-positive id is refused for the admin all the same (SEC-05).
			expect((await assertActionPermission(spec(2), target(0), ids.dd128Admin)).ok).toBe(false);
			expect((await assertActionPermission(spec(2), target(-1), superuser)).ok).toBe(false);
		});
	});

	test('REACHABILITY: a record_tipo gate must pass the payload its caller actually sends', async () => {
		// Asserting the permission STRING is not enough — that is how
		// get_ar_identifying_image shipped green while being permanently DEAD: it was
		// flipped to record_tipo, but neither its handler nor its client sends a
		// component tipo, so the gate refused every caller including a global admin.
		// A gate the real payload cannot satisfy is a broken action, not a strict one.
		const mediaPayload = { section_tipo: SECTION, tipo: COMPONENT, section_id: inScope };
		expect(await assertActionPermission(spec(1), mediaPayload, ids.control)).toEqual({ ok: true });

		// get_ar_identifying_image's REAL payload carries no tipo, which is why it
		// must stay 'record'. Proof that record_tipo would break it:
		const posterframeArPayload = { section_tipo: SECTION, section_id: inScope };
		expect((await assertActionPermission(spec(1), posterframeArPayload, superuser)).ok).toBe(false);

		const posterframe = (await import('../../tools/tool_posterframe/server/index.ts')) as {
			tool: { apiActions: Record<string, ToolActionSpec> };
		};
		expect(posterframe.tool.apiActions.get_ar_identifying_image?.permission).toBe('record');
	});
});

describe('the media family actually uses the kind', () => {
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
			// assert_record_in_user_scope — i.e. 'record'. See the reachability test.
			tool_posterframe: ['create_identifying_image'],
			// The twelfth (2026-09-30, WC-2026-09-30-media-pair-scope): the upload writes
			// ONE component's master file + files_info, so it asks the pair too.
			tool_upload: ['process_uploaded_file'],
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
});
