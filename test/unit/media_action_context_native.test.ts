/**
 * CRAP item 2.22 — resolveMediaActionContext (api/handlers/media_action_context.ts)
 * + the threeDMoveFileAction shell (api/handlers/dd_component_3d_api.ts).
 *
 * Branch inventory of resolveMediaActionContext, in execution order:
 *  1. coordinate validation (tipo / section_tipo / positive integer section_id)
 *     — runs BEFORE requirePrincipal, so it is credless AND DB-less;
 *  2. the section permission gate: getPermissions(principal, sectionTipo, sectionTipo)
 *     — BOTH args are the SECTION tipo, never the component tipo. The scratch
 *     user granted only on (test3, test26) is the case that pins this;
 *  3. model gate (getModelByTipo(tipo) === expectedModel);
 *  4. the frozen media spec + the language-NEUTRAL identity (lang:null) + pathOpts.
 *
 * Scratch surfaces (namespace: scratch users + test3 ids 933000-933999):
 *  matrix_users / matrix_profiles rows 933001-933003 (dd128 / dd234).
 * No 3D happy path: there is no media-root seam through resolveMediaPathOptions,
 * so a real move would write into the developer's LIVE media tree. The
 * filesystem effect is gated by tool_posterframe.test.ts. The "missing staged
 * source" case only stats a non-existent path and returns false before any mkdir.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ApiRequestContext } from '../../src/core/api/handler_context.ts';
import { component3dApiActions } from '../../src/core/api/handlers/dd_component_3d_api.ts';
import {
	avActionFail,
	resolveMediaActionContext,
} from '../../src/core/api/handlers/media_action_context.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import type { Rqo } from '../../src/core/concepts/rqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
	getPermissions,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import type { Session } from '../../src/core/security/session_store.ts';
import { mustGet } from '../helpers/assert.ts';

// --- fixture coordinates ---------------------------------------------------

/** A NORMAL section: model 'section', matrix table 'matrix_test' — NOT one of
 * PUBLIC_LIST_TABLES, so a zero grant really resolves to 0 (a matrix_list /
 * matrix_dd / matrix_notes parent would be handed level 1 by the fallback and
 * make the whole permission half of this file vacuous). */
const SECTION = 'test3';
const COMPONENT_3D = 'test26'; // model component_3d
const COMPONENT_IMAGE = 'test99'; // model component_image
const SECTION_ID = 933100;

const USERS_SECTION = 'dd128';
const PROFILES_SECTION = 'dd234';
const PROFILE_SELECT = 'dd1725';
const SECURITY_ACCESS = 'dd774';

/** user id === profile id, all inside the assigned scratch band. */
const USER_COMPONENT_ONLY = 933001; // granted (test3, test26)=2 — NOT (test3, test3)
const USER_LEVEL_1 = 933002; // granted (test3, test3)=1
const USER_LEVEL_2 = 933003; // granted (test3, test3)=2
const SCRATCH_IDS = [USER_COMPONENT_ONLY, USER_LEVEL_1, USER_LEVEL_2];

const COORD_MSG = 'tipo, section_tipo and a positive section_id are required';
const WRITE_MSG = 'insufficient permissions (write required)';
const READ_MSG = 'insufficient permissions';
/** The exact envelope every refusal branch relays (avActionFail). */
const fail = (msg: string) => ({
	status: 200,
	body: { result: false, msg: `Error. ${msg}`, errors: [msg] },
});

// --- harness ---------------------------------------------------------------

/** A context WITHOUT a principal — every coordinate-validation case must answer
 * before requirePrincipal is reached (which would throw). */
const contextWithoutPrincipal = (): ApiRequestContext => ({
	requestId: 'crap-2-22',
	clientIp: '127.0.0.1',
	session: null,
	csrfCandidate: null,
});

const contextFor = (principal: Principal): ApiRequestContext => ({
	requestId: 'crap-2-22',
	clientIp: '127.0.0.1',
	session: {
		userId: principal.userId,
		username: `scratch_${principal.userId}`,
		isGlobalAdmin: false,
		csrfToken: 'x',
		applicationLang: null,
		dataLang: null,
	} as Session,
	csrfCandidate: null,
	principal,
});

const rqoOf = (source: unknown, options?: unknown): Rqo =>
	({ action: 'move_file_to_dir', source, options }) as unknown as Rqo;

/** Delete both scratch surfaces (records AND the Time Machine tail), fail-loud
 * residue check by the caller. Ids are numeric constants from this file. */
async function purgeScratch(): Promise<void> {
	const ids = SCRATCH_IDS.join(',');
	await sql.unsafe(`DELETE FROM matrix_users WHERE section_tipo = $1 AND section_id IN (${ids})`, [
		USERS_SECTION,
	]);
	await sql.unsafe(
		`DELETE FROM matrix_profiles WHERE section_tipo = $1 AND section_id IN (${ids})`,
		[PROFILES_SECTION],
	);
	await sql.unsafe(
		`DELETE FROM matrix_time_machine WHERE section_tipo IN ($1, $2) AND section_id IN (${ids})`,
		[USERS_SECTION, PROFILES_SECTION],
	);
}

async function seedScratchUser(id: number, grants: unknown[]): Promise<void> {
	await sql.unsafe(
		`INSERT INTO "${'matrix_profiles'}" (section_id, section_tipo, misc)
		 VALUES ($1, $2, $3::text::jsonb)`,
		[id, PROFILES_SECTION, JSON.stringify({ [SECURITY_ACCESS]: grants })],
	);
	await sql.unsafe(
		`INSERT INTO "${'matrix_users'}" (section_id, section_tipo, relation)
		 VALUES ($1, $2, $3::text::jsonb)`,
		[
			id,
			USERS_SECTION,
			JSON.stringify({
				[PROFILE_SELECT]: [{ section_tipo: PROFILES_SECTION, section_id: String(id) }],
			}),
		],
	);
}

beforeAll(async () => {
	// Clear residue from an aborted previous run rather than colliding.
	await purgeScratch();

	await seedScratchUser(USER_COMPONENT_ONLY, [
		// A grant on the (section, COMPONENT) pair, deliberately WITHOUT the
		// (section, section) pair the gate actually reads.
		{ id: 1, tipo: COMPONENT_3D, section_tipo: SECTION, value: 2 },
	]);
	await seedScratchUser(USER_LEVEL_1, [{ id: 1, tipo: SECTION, section_tipo: SECTION, value: 1 }]);
	await seedScratchUser(USER_LEVEL_2, [{ id: 1, tipo: SECTION, section_tipo: SECTION, value: 2 }]);

	clearPermissionsCache();
	clearPrincipalCache();
	clearUserProjectsCache();
});

afterAll(async () => {
	await purgeScratch();
	// Fail loud on residue — both ends.
	const ids = SCRATCH_IDS.join(',');
	const residue = (await sql.unsafe(
		`SELECT
			(SELECT count(*) FROM matrix_users WHERE section_tipo = $1 AND section_id IN (${ids})) AS users,
			(SELECT count(*) FROM matrix_profiles WHERE section_tipo = $2 AND section_id IN (${ids})) AS profiles,
			(SELECT count(*) FROM matrix_time_machine WHERE section_tipo IN ($1, $2) AND section_id IN (${ids})) AS tm`,
		[USERS_SECTION, PROFILES_SECTION],
	)) as { users: string; profiles: string; tm: string }[];
	const row = mustGet(residue[0], 'the scratch residue probe row');
	if (Number(row.users) + Number(row.profiles) + Number(row.tm) !== 0) {
		throw new Error(`scratch residue left behind: ${JSON.stringify(row)}`);
	}
	clearPermissionsCache();
	clearPrincipalCache();
	clearUserProjectsCache();
});

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
			const result = await resolveMediaActionContext(
				rqoOf(source),
				contextWithoutPrincipal(),
				2,
				'component_3d',
			);
			expect(result).toEqual({ error: fail(COORD_MSG) });
			expect('ctx' in result).toBe(false);
		});
	}

	test("a numeric-string section_id IS accepted (Number('7') === 7)", async () => {
		// Pins the coercion: the guard is Number()+Number.isInteger, not typeof.
		// It gets past the coordinate branch and dies at requirePrincipal instead.
		await expect(
			resolveMediaActionContext(
				rqoOf({ tipo: COMPONENT_3D, section_tipo: SECTION, section_id: '7' }),
				contextWithoutPrincipal(),
				2,
				'component_3d',
			),
		).rejects.toThrow(/requirePrincipal/);
	});

	test('avActionFail shapes the envelope every branch relays', () => {
		expect(avActionFail('boom')).toEqual({
			status: 200,
			body: { result: false, msg: 'Error. boom', errors: ['boom'] },
		});
	});
});

// --- 2. the section permission gate ---------------------------------------

describe('resolveMediaActionContext — section permission gate', () => {
	const source = { tipo: COMPONENT_3D, section_tipo: SECTION, section_id: SECTION_ID };

	test('THE ITEM: a grant on (section, COMPONENT) is NOT a grant on (section, section)', async () => {
		const principal = await resolvePrincipal(USER_COMPONENT_ONLY);
		expect(principal.isGlobalAdmin).toBe(false);
		// The grant the scratch profile actually carries is real and level 2 …
		expect(await getPermissions(principal, SECTION, COMPONENT_3D)).toBe(2);
		// … and the gate still refuses, because arg 2 is the SECTION tipo.
		expect(await getPermissions(principal, SECTION, SECTION)).toBe(0);

		const result = await resolveMediaActionContext(
			rqoOf(source),
			contextFor(principal),
			2,
			'component_3d',
		);
		expect(result).toEqual({ error: fail(WRITE_MSG) });
	});

	test('level 0 at minLevel 1 → the READ wording (no "(write required)")', async () => {
		const principal = await resolvePrincipal(USER_COMPONENT_ONLY);
		const result = await resolveMediaActionContext(
			rqoOf(source),
			contextFor(principal),
			1,
			'component_3d',
		);
		expect(result).toEqual({ error: fail(READ_MSG) });
	});

	test('level 1 principal: refused at minLevel 2, admitted at minLevel 1', async () => {
		const principal = await resolvePrincipal(USER_LEVEL_1);
		expect(await getPermissions(principal, SECTION, SECTION)).toBe(1);

		const refused = await resolveMediaActionContext(
			rqoOf(source),
			contextFor(principal),
			2,
			'component_3d',
		);
		expect(refused).toEqual({ error: fail(WRITE_MSG) });

		const admitted = await resolveMediaActionContext(
			rqoOf(source),
			contextFor(principal),
			1,
			'component_3d',
		);
		expect('ctx' in admitted).toBe(true);
	});

	test('level 2 principal passes minLevel 2', async () => {
		const principal = await resolvePrincipal(USER_LEVEL_2);
		expect(await getPermissions(principal, SECTION, SECTION)).toBe(2);
		const result = await resolveMediaActionContext(
			rqoOf(source),
			contextFor(principal),
			2,
			'component_3d',
		);
		expect('ctx' in result).toBe(true);
	});

	test('the gate runs BEFORE the model gate (ordering)', async () => {
		// A tipo that is not a component at all: a level-0 caller still gets the
		// permission refusal, never the model message — no ontology probing for
		// an unauthorized caller.
		const principal = await resolvePrincipal(USER_COMPONENT_ONLY);
		const result = await resolveMediaActionContext(
			rqoOf({ tipo: 'zzznotatipo1', section_tipo: SECTION, section_id: SECTION_ID }),
			contextFor(principal),
			2,
			'component_3d',
		);
		expect(result).toEqual({ error: fail(WRITE_MSG) });
	});
});

// --- 3. model gate + 4. the resolved context ------------------------------

describe('resolveMediaActionContext — model gate and resolved context', () => {
	test('a component_image tipo under expectedModel component_3d is refused', async () => {
		const principal = await resolvePrincipal(USER_LEVEL_1);
		const result = await resolveMediaActionContext(
			rqoOf({ tipo: COMPONENT_IMAGE, section_tipo: SECTION, section_id: SECTION_ID }),
			contextFor(principal),
			1,
			'component_3d',
		);
		expect(result).toEqual({ error: fail('component is not component_3d') });
	});

	test('a component_3d tipo under expectedModel component_av is refused', async () => {
		const principal = await resolvePrincipal(USER_LEVEL_1);
		const result = await resolveMediaActionContext(
			rqoOf({ tipo: COMPONENT_3D, section_tipo: SECTION, section_id: SECTION_ID }),
			contextFor(principal),
			1,
			'component_av',
		);
		expect(result).toEqual({ error: fail('component is not component_av') });
	});

	test('an unknown tipo (no model) is refused by the model gate', async () => {
		const principal = await resolvePrincipal(USER_LEVEL_1);
		const result = await resolveMediaActionContext(
			rqoOf({ tipo: 'zzznotatipo1', section_tipo: SECTION, section_id: SECTION_ID }),
			contextFor(principal),
			1,
			'component_3d',
		);
		expect(result).toEqual({ error: fail('component is not component_3d') });
	});

	test('the resolved ctx is language-NEUTRAL and carries the frozen spec', async () => {
		const principal = await resolvePrincipal(USER_LEVEL_2);
		const result = await resolveMediaActionContext(
			rqoOf({ tipo: COMPONENT_3D, section_tipo: SECTION, section_id: SECTION_ID }),
			contextFor(principal),
			2,
			'component_3d',
		);
		if (!('ctx' in result)) throw new Error(`expected a ctx, got ${JSON.stringify(result)}`);
		const { ctx } = result;
		// DEDALO_DATA_NOLAN — media files are language-neutral; the identifier the
		// section read serves has no lang segment.
		expect(ctx.identity).toEqual({
			componentTipo: COMPONENT_3D,
			sectionTipo: SECTION,
			sectionId: SECTION_ID,
			lang: null,
		});
		// IDENTITY, not deep-equality: the spec table is frozen and cached.
		expect(ctx.spec).toBe(mustGet(mediaTypeOf('component_3d'), 'the component_3d media spec'));
		// Ontology-derived: test26 declares properties.max_items_folder; test3
		// declares no initial_media_path entry for it.
		expect(ctx.pathOpts).toEqual({ initialMediaPath: '', maxItemsFolder: 1000 });
	});

	test('section_id is coerced to a number on the identity', async () => {
		const principal = await resolvePrincipal(USER_LEVEL_2);
		const result = await resolveMediaActionContext(
			rqoOf({ tipo: COMPONENT_3D, section_tipo: SECTION, section_id: String(SECTION_ID) }),
			contextFor(principal),
			2,
			'component_3d',
		);
		if (!('ctx' in result)) throw new Error(`expected a ctx, got ${JSON.stringify(result)}`);
		expect(result.ctx.identity.sectionId).toBe(SECTION_ID);
	});
});

// --- 5. the threeDMoveFileAction shell ------------------------------------

describe('threeDMoveFileAction (dd_component_3d_api move_file_to_dir)', () => {
	const source = { tipo: COMPONENT_3D, section_tipo: SECTION, section_id: SECTION_ID };
	const validOptions = {
		target_dir: 'posterframe',
		file_data: {
			name: 'snapshot.jpg',
			// Deliberately nonexistent — only the PRESENCE of these fields is under
			// test (the required-fields gate), never their content. Kept low-entropy
			// and self-describing: a random-looking value next to a `key` field name
			// reads as a credential to the secret scanner (gitleaks generic-api-key).
			key_dir: 'no_such_key_dir',
			tmp_name: 'no_such_tmp.jpg',
		},
	};
	const move = mustGet(
		component3dApiActions.move_file_to_dir,
		'component3dApiActions.move_file_to_dir',
	);

	test('the level-2 gate is relayed verbatim (paired with the level-2 control)', async () => {
		// Level 1 on the SAME coordinates and the SAME (fully valid) options →
		// the permission envelope, proving the relay is bound to the gate.
		const weak = await move(
			rqoOf(source, validOptions),
			contextFor(await resolvePrincipal(USER_LEVEL_1)),
		);
		expect(weak).toEqual(fail(WRITE_MSG));

		// CONTROL: level 2, identical coordinates and options → past the gate.
		// The staged source does not exist, so it stops at the rename, which is
		// a DIFFERENT envelope. Without this pair the case above would pass for
		// a handler that refused everything.
		const strong = await move(
			rqoOf(source, validOptions),
			contextFor(await resolvePrincipal(USER_LEVEL_2)),
		);
		expect(strong).toEqual({
			status: 200,
			body: { result: false, msg: 'Error. Staged upload not found', errors: ['rename failed'] },
		});
	});

	test('the coordinate refusal is relayed before any authentication', async () => {
		const result = await move(rqoOf({}, validOptions), contextWithoutPrincipal());
		expect(result).toEqual(fail(COORD_MSG));
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
		['empty target_dir', { ...validOptions, target_dir: '' }],
		[
			'empty file name',
			{ target_dir: 'posterframe', file_data: { name: '', key_dir: 'k', tmp_name: 't' } },
		],
	];

	for (const [name, options] of badOptions) {
		test(`file_data validation: ${name}`, async () => {
			const result = await move(
				rqoOf(source, options),
				contextFor(await resolvePrincipal(USER_LEVEL_2)),
			);
			expect(result).toEqual(fail('target_dir and file_data.{name,key_dir,tmp_name} are required'));
		});
	}

	test('a missing staged source answers HTTP 200 + result:false (never a throw)', async () => {
		const result = await move(
			rqoOf(source, validOptions),
			contextFor(await resolvePrincipal(USER_LEVEL_2)),
		);
		expect(result).toEqual({
			status: 200,
			body: { result: false, msg: 'Error. Staged upload not found', errors: ['rename failed'] },
		});
	});
});
