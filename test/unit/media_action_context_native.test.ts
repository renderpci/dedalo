/**
 * resolveMediaActionContext (api/handlers/media_action_context.ts) — the media
 * door of dd_component_av_api / dd_component_3d_api (closure Step 3, SEC-2-media)
 * + the threeDMoveFileAction shell.
 *
 * WHAT WAS WRONG (measured at 45b8c45162): the door asked ONE question,
 * `getPermissions(principal, section, section) >= minLevel`. It never asked the
 * (section, COMPONENT) pair — a profile explicitly denied the AV component but
 * holding the section cut fragments, probed streams and deleted posterframes —
 * and it never asked the RECORD SCOPE — a profile whose projects do not include
 * the record did all of that on any record id it could guess. The model gate
 * answered before either, so an unauthorized caller could probe the ontology.
 *
 * THE DOOR NOW (write_door.authorizeRecordAccess): grammar → the section floor
 * (= minLevel) → the pair (dd128-aware) → the record scope → the model. The
 * returned identity is built from the GRANT, never from the rqo.
 *
 * Branch inventory, in execution order:
 *  1. coordinate validation (tipo / section_tipo / positive integer section_id)
 *     — runs BEFORE requirePrincipal, so it is credless AND DB-less;
 *  2. the authorization door — every action of both classes, DERIVED from the
 *     READ_DOOR_POSTURE rows of `dd_component_{av,3d}_api` (an empty derivation
 *     throws), probed with the identities of `authz_door_fixture`:
 *       SECTION_ONLY   (section 2, component 0)  → perm.denied
 *       OUT_OF_SCOPE   (full grants, project Q)  → perm.out_of_scope
 *       COMPONENT_ONLY (section 0, component 2)  → perm.denied
 *       LEVEL_1        → perm.denied on the write actions, served on the reads
 *       READ_COMPONENT (section 2, component 1) → perm.denied ON the component
 *                        on the write actions (the section floor PASSES it, so
 *                        only the level-2 PAIR can refuse), served on the reads
 *       READ_SECTION   (section 1, component 2) → perm.denied ON the SECTION
 *                        half on the write actions (the pair PASSES it, so only
 *                        the section floor at 2 — HEAD's level — can refuse),
 *                        served on the reads
 *       CONTROL        → served; the returned identity equals the grant
 *  3. the model gate — AFTER the pair and the scope (no ontology oracle);
 *  4. the frozen media spec + the language-NEUTRAL identity (lang:null) + pathOpts.
 *
 * The record is ENGINE-BUILT (createSectionRecord, in project P) — no phantom
 * id, no raw seeding. No 3D happy path writes media: the "missing staged
 * source" case only stats a non-existent path.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ActionHandler, ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { component3dApiActions } from '../../src/core/api/handlers/dd_component_3d_api.ts';
import { componentAvApiActions } from '../../src/core/api/handlers/dd_component_av_api.ts';
import {
	avActionFail,
	resolveMediaActionContext,
} from '../../src/core/api/handlers/media_action_context.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { READ_DOOR_POSTURE } from '../../src/core/security/read_door.ts';
import type { Session } from '../../src/core/security/session_store.ts';
import { mustGet } from '../helpers/assert.ts';
import {
	AUTHZ_3D,
	AUTHZ_AV,
	AUTHZ_PROJECT_P,
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
const COMPONENT_3D = AUTHZ_3D; // model component_3d
const COMPONENT_IMAGE = 'test99'; // model component_image

/**
 * ENVELOPE v2 (engineering/ERRORS_SPEC.md §4): every refusal branch THROWS a
 * registered code; the dispatch chokepoint converts.
 */
const COORD_CODE = 'request.invalid_source';
const PERM_CODE = 'perm.denied';
const SCOPE_CODE = 'perm.out_of_scope';
const MODEL_CODE = 'request.invalid_model';

/** The DedaloError a call threw, or a loud failure if it did not throw one. */
async function refusalOf(promise: Promise<unknown>): Promise<DedaloError> {
	const outcome = await promise.then(
		(value) => ({ threw: false as const, value }),
		(error: unknown) => ({ threw: true as const, error }),
	);
	if (!outcome.threw) {
		throw new Error(`expected a refusal, got ${JSON.stringify(outcome.value)}`);
	}
	if (!(outcome.error instanceof DedaloError)) throw outcome.error;
	return outcome.error;
}

// --- harness ---------------------------------------------------------------

const contextWithoutPrincipal = (): ApiRequestContext => ({
	requestId: 'media-door',
	clientIp: '127.0.0.1',
	session: null,
	csrfCandidate: null,
});

const contextFor = (principal: Principal): ApiRequestContext => ({
	requestId: 'media-door',
	clientIp: '127.0.0.1',
	session: {
		userId: principal.userId,
		username: `zzauthz_${principal.userId}`,
		isGlobalAdmin: principal.isGlobalAdmin,
		csrfToken: 'x',
		applicationLang: null,
		dataLang: null,
	} as Session,
	csrfCandidate: null,
	principal,
});

const rqoOf = (source: unknown, options?: unknown, action = 'media_action'): Rqo =>
	({ action, source, options }) as unknown as Rqo;

/** Options valid enough that a handler past the gate would ACT (never reached by a refusal). */
const MOVE_OPTIONS = {
	target_dir: 'posterframe',
	file_data: { name: 'snapshot.jpg', key_dir: 'no_such_key_dir', tmp_name: 'no_such_tmp.jpg' },
};

// --- the door census, DERIVED from the posture ledger -----------------------

interface MediaDoor {
	key: string;
	action: string;
	model: 'component_av' | 'component_3d';
	tipo: string;
	minLevel: 1 | 2;
	handler: ActionHandler;
}

const CLASSES = [
	{
		api: 'dd_component_av_api',
		model: 'component_av',
		tipo: AUTHZ_AV,
		actions: componentAvApiActions,
	},
	{
		api: 'dd_component_3d_api',
		model: 'component_3d',
		tipo: AUTHZ_3D,
		actions: component3dApiActions,
	},
] as const;

const MEDIA_DOORS: MediaDoor[] = [...READ_DOOR_POSTURE.entries()].flatMap(([key, posture]) => {
	const [api, action] = key.split(':') as [string, string];
	const owner = CLASSES.find((entry) => entry.api === api);
	if (owner === undefined) return [];
	const handler = owner.actions[action];
	if (handler === undefined) throw new Error(`posture row ${key} names no handler`);
	return [
		{
			key,
			action,
			model: owner.model,
			tipo: owner.tipo,
			// A mutating row is a WRITE door; every other posture is a read.
			minLevel: posture.posture === 'mutating' ? 2 : 1,
			handler,
		},
	];
});
if (MEDIA_DOORS.length === 0) {
	throw new Error(
		'media door census derived ZERO rows from READ_DOOR_POSTURE — the derivation is broken',
	);
}

let ids: AuthzIdentities;
let recordId: number;

// --- 1. coordinate validation (credless, DB-less) --------------------------

describe('resolveMediaActionContext — coordinate validation (no principal, no DB)', () => {
	const badSources: [string, unknown][] = [
		['source absent', undefined],
		['empty source', {}],
		['tipo only', { tipo: COMPONENT_3D }],
		['tipo + section_tipo, no section_id', { tipo: COMPONENT_3D, section_tipo: SECTION }],
		['section_id 0', { tipo: COMPONENT_3D, section_tipo: SECTION, section_id: 0 }],
		['section_id -1', { tipo: COMPONENT_3D, section_tipo: SECTION, section_id: -1 }],
		["section_id 'abc'", { tipo: COMPONENT_3D, section_tipo: SECTION, section_id: 'abc' }],
		['section_id 1.5', { tipo: COMPONENT_3D, section_tipo: SECTION, section_id: 1.5 }],
		['empty tipo', { tipo: '', section_tipo: SECTION, section_id: 1 }],
		['empty section_tipo', { tipo: COMPONENT_3D, section_tipo: '', section_id: 1 }],
	];

	for (const [name, source] of badSources) {
		test(`${name} → the coordinate refusal, no ctx`, async () => {
			const refusal = await refusalOf(
				resolveMediaActionContext(rqoOf(source), contextWithoutPrincipal(), 2, 'component_3d'),
			);
			expect(refusal.code).toBe(COORD_CODE);
			expect(refusal.spec.status).toBe(400);
		});
	}

	test("a numeric-string section_id IS accepted (Number('7') === 7)", async () => {
		await expect(
			resolveMediaActionContext(
				rqoOf({ tipo: COMPONENT_3D, section_tipo: SECTION, section_id: '7' }),
				contextWithoutPrincipal(),
				2,
				'component_3d',
			),
		).rejects.toThrow(/requirePrincipal/);
	});

	test('avActionFail THROWS media.action_failed — it builds no body', () => {
		let thrown: unknown;
		try {
			avActionFail('boom');
			throw new Error('avActionFail returned instead of throwing');
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(DedaloError);
		expect((thrown as DedaloError).code).toBe('media.action_failed');
		expect((thrown as DedaloError).spec.status).toBe(500);
		expect((thrown as DedaloError).message).toContain('boom');
		expect((thrown as DedaloError).publicMessage).toBeUndefined();
	});
});

describe.if(DB_READY)('the media door — derived census × identities', () => {
	beforeAll(async () => {
		await installAuthzDoorFixture();
		recordId = await createDoorRecord(SECTION, AUTHZ_PROJECT_P);
		ids = await resolveAuthzIdentities();
	});
	afterAll(removeAuthzDoorFixture);

	test('the census is the two classes, every action (read + write)', () => {
		expect(MEDIA_DOORS.map((door) => door.key).sort()).toEqual(
			[
				...Object.keys(componentAvApiActions).map((a) => `dd_component_av_api:${a}`),
				...Object.keys(component3dApiActions).map((a) => `dd_component_3d_api:${a}`),
			].sort(),
		);
		expect(MEDIA_DOORS.some((door) => door.minLevel === 1)).toBe(true);
		expect(MEDIA_DOORS.some((door) => door.minLevel === 2)).toBe(true);
	});

	test('the contrast is live (guards every pair below)', async () => {
		await assertAuthzDoorContrast(ids);
	});

	const sourceOf = (door: MediaDoor, sectionId: number = recordId) => ({
		tipo: door.tipo,
		section_tipo: SECTION,
		section_id: sectionId,
	});
	const call = (door: MediaDoor, principal: Principal, sectionId?: number) =>
		door.handler(
			rqoOf(
				sourceOf(door, sectionId),
				door.action === 'move_file_to_dir' ? MOVE_OPTIONS : {},
				door.action,
			),
			contextFor(principal),
		);

	for (const door of MEDIA_DOORS) {
		describe(door.key, () => {
			test('SECTION_ONLY (section granted, the component at 0) → perm.denied', async () => {
				expect((await refusalOf(call(door, ids.sectionOnly))).code).toBe(PERM_CODE);
			});

			test('OUT_OF_SCOPE (every grant, another project) → perm.out_of_scope', async () => {
				expect((await refusalOf(call(door, ids.outOfScope))).code).toBe(SCOPE_CODE);
			});

			test('COMPONENT_ONLY (the component granted, the section at 0) → perm.denied', async () => {
				expect((await refusalOf(call(door, ids.componentOnly))).code).toBe(PERM_CODE);
			});

			if (door.minLevel === 2) {
				test('LEVEL_1 on a WRITE door → perm.denied', async () => {
					expect((await refusalOf(call(door, ids.level1))).code).toBe(PERM_CODE);
				});
				// LEVEL_1 holds the SECTION at 1, so the section floor answers first and
				// the pair is never asked. READ_COMPONENT holds the section at 2: only the
				// write-level PAIR on the media component can refuse it — the one leg
				// that goes red if a write action is authorized in read mode.
				test('READ_COMPONENT (section 2, the component READ-only) on a WRITE door → perm.denied ON the component', async () => {
					const refusal = await refusalOf(call(door, ids.readComponent));
					expect({
						code: refusal.code,
						tipo: refusal.coordinates?.tipo,
						required: refusal.coordinates?.required,
						half: /the component grant/.test(refusal.message),
					}).toEqual({ code: PERM_CODE, tipo: door.tipo, required: 2, half: true });
				});
				// The mirror: READ_SECTION holds the component at WRITE, so the pair
				// passes and ONLY the section floor (2 on a write door) can refuse it —
				// the leg that goes red if the media writes' floor drops to 1.
				test('READ_SECTION (section 1, the component WRITABLE) on a WRITE door → perm.denied ON the section half', async () => {
					const refusal = await refusalOf(call(door, ids.readSection));
					expect({
						code: refusal.code,
						required: refusal.coordinates?.required,
						half: /the section grant/.test(refusal.message),
					}).toEqual({ code: PERM_CODE, required: 2, half: true });
				});
			} else {
				test('READ_SECTION (section 1, the component WRITABLE) on a READ door passes the gate', async () => {
					const result = await resolveMediaActionContext(
						rqoOf(sourceOf(door)),
						contextFor(ids.readSection),
						1,
						door.model,
						door.key,
					);
					expect(result.grant).toMatchObject({ componentTipo: door.tipo, sectionId: recordId });
				});
				test('READ_COMPONENT (section 2, the component READ-only) on a READ door passes the gate', async () => {
					const result = await resolveMediaActionContext(
						rqoOf(sourceOf(door)),
						contextFor(ids.readComponent),
						1,
						door.model,
						door.key,
					);
					expect(result.grant).toMatchObject({ componentTipo: door.tipo, sectionId: recordId });
				});
				test('LEVEL_1 on a READ door passes the gate', async () => {
					const result = await resolveMediaActionContext(
						rqoOf(sourceOf(door)),
						contextFor(ids.level1),
						1,
						door.model,
						door.key,
					);
					expect(result.ctx.identity.sectionId).toBe(recordId);
				});
			}

			test('a global admin with a non-positive id → request.invalid_source', async () => {
				for (const sectionId of [-1, 0]) {
					expect((await refusalOf(call(door, ids.dd128Admin, sectionId))).code).toBe(COORD_CODE);
				}
			});

			test('CONTROL passes the gate; the returned identity IS the grant', async () => {
				const result = (await resolveMediaActionContext(
					rqoOf(sourceOf(door)),
					contextFor(ids.control),
					door.minLevel,
					door.model,
					door.key,
				)) as Awaited<ReturnType<typeof resolveMediaActionContext>> & {
					grant?: Record<string, unknown>;
				};
				expect(result.grant).toMatchObject({
					sectionTipo: SECTION,
					componentTipo: door.tipo,
					sectionId: recordId,
					level: door.minLevel,
				});
				expect(result.ctx.identity).toEqual({
					componentTipo: result.grant?.componentTipo,
					sectionTipo: result.grant?.sectionTipo,
					sectionId: result.grant?.sectionId,
					lang: null,
				});
			});
		});
	}

	test('ORDER: the pair and the scope answer BEFORE the model (no ontology oracle)', async () => {
		// A tipo that is not a component at all: an unauthorized caller gets the
		// permission code, never the model code.
		const probe = rqoOf({ tipo: 'zzznotatipo1', section_tipo: SECTION, section_id: recordId });
		for (const principal of [ids.sectionOnly, ids.componentOnly]) {
			const refusal = await refusalOf(
				resolveMediaActionContext(probe, contextFor(principal), 2, 'component_3d', 'order-probe'),
			);
			expect(refusal.code).toBe(PERM_CODE);
		}
	});

	// --- 3. model gate + 4. the resolved context ----------------------------

	describe('model gate and resolved context (CONTROL, in scope)', () => {
		test('a component_image tipo under expectedModel component_3d is refused', async () => {
			const refusal = await refusalOf(
				resolveMediaActionContext(
					rqoOf({ tipo: COMPONENT_IMAGE, section_tipo: SECTION, section_id: recordId }),
					contextFor(ids.control),
					1,
					'component_3d',
				),
			);
			expect(refusal.code).toBe(MODEL_CODE);
			expect(refusal.coordinates).toMatchObject({
				tipo: COMPONENT_IMAGE,
				expected: 'component_3d',
			});
		});

		test('a component_3d tipo under expectedModel component_av is refused', async () => {
			const refusal = await refusalOf(
				resolveMediaActionContext(
					rqoOf({ tipo: COMPONENT_3D, section_tipo: SECTION, section_id: recordId }),
					contextFor(ids.control),
					1,
					'component_av',
				),
			);
			expect(refusal.code).toBe(MODEL_CODE);
			expect(refusal.coordinates).toMatchObject({ expected: 'component_av' });
		});

		test('the resolved ctx is language-NEUTRAL and carries the frozen spec', async () => {
			const result = await resolveMediaActionContext(
				rqoOf({ tipo: COMPONENT_3D, section_tipo: SECTION, section_id: recordId }),
				contextFor(ids.control),
				2,
				'component_3d',
			);
			const { ctx } = result;
			expect(ctx.identity).toEqual({
				componentTipo: COMPONENT_3D,
				sectionTipo: SECTION,
				sectionId: recordId,
				lang: null,
			});
			expect(ctx.spec).toBe(mustGet(mediaTypeOf('component_3d'), 'the component_3d media spec'));
			expect(ctx.pathOpts).toEqual({ initialMediaPath: '', maxItemsFolder: 1000 });
		});

		test('section_id is coerced to a number on the identity', async () => {
			const result = await resolveMediaActionContext(
				rqoOf({ tipo: COMPONENT_3D, section_tipo: SECTION, section_id: String(recordId) }),
				contextFor(ids.control),
				2,
				'component_3d',
			);
			expect(result.ctx.identity.sectionId).toBe(recordId);
		});
	});

	// --- 5. the threeDMoveFileAction shell ----------------------------------

	describe('threeDMoveFileAction (dd_component_3d_api move_file_to_dir)', () => {
		const move = mustGet(
			component3dApiActions.move_file_to_dir,
			'component3dApiActions.move_file_to_dir',
		);
		const source = () => ({ tipo: COMPONENT_3D, section_tipo: SECTION, section_id: recordId });

		test('the level-2 gate is relayed verbatim (paired with the level-2 control)', async () => {
			const weak = await refusalOf(move(rqoOf(source(), MOVE_OPTIONS), contextFor(ids.level1)));
			expect(weak.code).toBe(PERM_CODE);
			// CONTROL: past the gate; the staged source does not exist → 404.
			const strong = await refusalOf(move(rqoOf(source(), MOVE_OPTIONS), contextFor(ids.control)));
			expect(strong.code).toBe('resource.not_found');
			expect(strong.spec.status).toBe(404);
		});

		test('the coordinate refusal is relayed before any authentication', async () => {
			const refusal = await refusalOf(move(rqoOf({}, MOVE_OPTIONS), contextWithoutPrincipal()));
			expect(refusal.code).toBe(COORD_CODE);
		});

		const badOptions: [string, unknown][] = [
			['options absent', undefined],
			['empty options', {}],
			['target_dir only', { target_dir: 'posterframe' }],
			['file_data.name only', { target_dir: 'posterframe', file_data: { name: 'a.jpg' } }],
			[
				'file_data without tmp_name',
				{ target_dir: 'posterframe', file_data: { name: 'a.jpg', key_dir: 'k' } },
			],
			['empty target_dir', { ...MOVE_OPTIONS, target_dir: '' }],
			[
				'empty file name',
				{ target_dir: 'posterframe', file_data: { name: '', key_dir: 'k', tmp_name: 't' } },
			],
		];

		for (const [name, options] of badOptions) {
			test(`file_data validation: ${name}`, async () => {
				const refusal = await refusalOf(move(rqoOf(source(), options), contextFor(ids.control)));
				expect(refusal.code).toBe('request.invalid_options');
				expect(refusal.publicMessage).toBe(
					'options.target_dir and options.file_data.{name,key_dir,tmp_name} are required',
				);
			});
		}

		test('a missing staged source is a 404 REFUSAL, not a falsy success', async () => {
			const refusal = await refusalOf(move(rqoOf(source(), MOVE_OPTIONS), contextFor(ids.control)));
			expect(refusal.code).toBe('resource.not_found');
			expect(refusal.coordinates).toMatchObject({
				key_dir: 'no_such_key_dir',
				tmp_name: 'no_such_tmp.jpg',
			});
		});
	});
});
