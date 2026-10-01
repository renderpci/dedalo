/**
 * SEC-2 — the portal unlink (`deletePortalLocator`, dd_component_portal_api
 * .delete_locator) goes through THE WRITE DOOR (security/write_door.ts:
 * write, level 2, section floor 2 — the dd128-aware PAIR and the record SCOPE)
 * before any read, lock or write; the effect is a private function typed on the
 * grant and audited as `grant.userId` (closure 2026-09-26 Step 3).
 *
 * WHAT WAS WRONG (measured at 6078937362): the door asked the SECTION only
 * (`getSectionPermissions >= 2`). A profile holding the host section at 2 but
 * the portal itself below 2 unlinked through it; a record outside the caller's
 * projects was unlinked; a (dd128, dd1725) user-manager unlinked their OWN
 * profile (the own-record downgrade never applied); a non-positive id and a
 * garbage tipo / id were "served"; and the row lock was taken for callers the
 * door should have refused.
 *
 * THE SITUATION IS BUILT HERE: two scratch dd153 projects, scratch dd234
 * profiles and dd128 users minted through the counter (no fixed id, no band),
 * and a fresh engine-created test6099 host per leg whose portal test6155 holds
 * two locators and whose dataframe slot test6783 holds one frame per locator.
 * Every refusing leg asserts the code AND that the portal key, the slot key and
 * the host's Time Machine row count are byte-unchanged. Leg a is the vacuity
 * control (a door that refuses everyone reddens there).
 *
 * Suite DB only (assertTestDatabase); every scratch row is swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import {
	deleteMatrixRecord,
	insertMatrixRecordWithCounter,
} from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/dedalo_error.ts';
import {
	getComponentFilterTipo,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../../src/core/ontology/resolver.ts';
import { resolveDataframeSlotTipos } from '../../src/core/relations/dataframe_slots.ts';
import { deletePortalLocator } from '../../src/core/relations/save.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { clearUserFilterRecordsCache } from '../../src/core/security/filter_records.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const HOST_SECTION = 'test6099';
const PORTAL = 'test6155';
const SLOT = 'test6783';
const PORTAL_TARGET_SECTION = 'test2';
const FRAME_TARGET_SECTION = 'test6100';
const USERS = 'dd128';
const PROFILES = 'dd234';
const PROJECTS = 'dd153';
const YES_NO = 'dd64';
const YES = 1;
const NO = 2;

let HOST_TABLE = '';
let FILTER_TIPO = '';

/** Every scratch row this file created — swept tolerantly in afterAll. */
const created: { table: string; sectionTipo: string; sectionId: number }[] = [];
function track(table: string, sectionTipo: string, sectionId: number): number {
	created.push({ table, sectionTipo, sectionId });
	return sectionId;
}

let projectP = 0;
let projectQ = 0;
let portalTargets: [number, number] = [0, 0];
let frameTargets: [number, number] = [0, 0];

interface Identity {
	userId: number;
	profileId: number;
	principal: Principal;
}
const identities: Record<
	'CONTROL' | 'COMPONENT_DENIED' | 'READ_SECTION' | 'OUT_OF_SCOPE' | 'MANAGER',
	Identity
> = {} as never;
let admin: Principal;

// --- builders ------------------------------------------------------------------

function relationLocator(
	componentTipo: string,
	sectionTipo: string,
	sectionId: number,
	type = 'dd151',
	id = 1,
) {
	return {
		id,
		type,
		section_id: sectionId,
		section_tipo: sectionTipo,
		from_component_tipo: componentTipo,
	};
}

const projectLocator = (projectId: number) =>
	relationLocator(FILTER_TIPO, PROJECTS, projectId, 'dd675');

async function mintProject(label: string): Promise<number> {
	const id = await insertMatrixRecordWithCounter('matrix_projects', PROJECTS, {
		string: { dd156: [{ id: 1, lang: 'lg-eng', value: `zzportal door project ${label}` }] },
	});
	return track('matrix_projects', PROJECTS, id);
}

/** A dd234 profile with the given dd774 grants, then a dd128 user carrying it. */
async function mintIdentity(
	name: string,
	grants: [string, string, number][],
	projectId: number,
): Promise<Identity> {
	const profileId = track(
		'matrix_profiles',
		PROFILES,
		await insertMatrixRecordWithCounter('matrix_profiles', PROFILES, {
			string: { dd237: [{ id: 1, lang: 'lg-eng', value: `${name} profile` }] },
			misc: {
				dd774: grants.map(([sectionTipo, tipo, value], index) => ({
					id: index + 1,
					tipo,
					section_tipo: sectionTipo,
					value,
				})),
			},
		}),
	);
	const userId = track(
		'matrix_users',
		USERS,
		await insertMatrixRecordWithCounter('matrix_users', USERS, {
			string: { dd132: [{ id: 1, lang: 'lg-nolan', value: name }] },
			relation: {
				dd131: [relationLocator('dd131', YES_NO, YES)],
				dd244: [relationLocator('dd244', YES_NO, NO)],
				dd515: [relationLocator('dd515', YES_NO, NO)],
				dd1725: [relationLocator('dd1725', PROFILES, profileId)],
				dd170: [relationLocator('dd170', PROJECTS, projectId, 'dd675')],
			},
		}),
	);
	return { userId, profileId, principal: undefined as never };
}

function clearCaches(): void {
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
	clearUserFilterRecordsCache();
}

const portalItem = (id: number, targetId: number) =>
	relationLocator(PORTAL, PORTAL_TARGET_SECTION, targetId, 'dd151', id);

function frameEntry(idKey: number, frameTargetId: number): Record<string, unknown> {
	return {
		type: 'dd490',
		section_id: frameTargetId,
		section_tipo: FRAME_TARGET_SECTION,
		from_component_tipo: SLOT,
		main_component_tipo: PORTAL,
		id_key: idKey,
	};
}

/** L1 / L2 — the two stored portal locators every host is seeded with. */
const L1 = () => portalItem(1, portalTargets[0]);
const L2 = () => portalItem(2, portalTargets[1]);

/** A fresh engine-created host in project P, seeded `[L1, L2]` + one frame each. */
async function seedHost(projectId = projectP): Promise<number> {
	const hostId = track(
		HOST_TABLE,
		HOST_SECTION,
		await createSectionRecord(HOST_SECTION, -1, new Date(), undefined, {
			filterData: [projectLocator(projectId)],
		}),
	);
	const relation = {
		[PORTAL]: [L1(), L2()],
		[SLOT]: [frameEntry(1, frameTargets[0]), frameEntry(2, frameTargets[1])],
	};
	await sql.unsafe(
		`UPDATE "${HOST_TABLE}" SET relation = COALESCE(relation, '{}'::jsonb) || $1::text::jsonb
		 WHERE section_tipo = $2 AND section_id = $3`,
		[encodeForJsonb(relation), HOST_SECTION, hostId],
	);
	return hostId;
}

async function keyText(
	table: string,
	sectionTipo: string,
	sectionId: number,
	key: string,
): Promise<string | null> {
	const rows = (await sql.unsafe(
		`SELECT (relation->$1)::text AS v FROM "${table}" WHERE section_tipo = $2 AND section_id = $3`,
		[key, sectionTipo, sectionId],
	)) as { v: string | null }[];
	return rows[0]?.v ?? null;
}

async function tmCount(sectionTipo: string, sectionId: number): Promise<number> {
	const rows = (await sql.unsafe(
		'SELECT count(*)::int AS n FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
		[sectionTipo, sectionId],
	)) as { n: number }[];
	return rows[0]?.n ?? 0;
}

interface Snapshot {
	keys: (string | null)[];
	tm: number;
}
async function snapshot(
	table: string,
	sectionTipo: string,
	sectionId: number,
	keys: readonly string[],
): Promise<Snapshot> {
	const values: (string | null)[] = [];
	for (const key of keys) values.push(await keyText(table, sectionTipo, sectionId, key));
	return { keys: values, tm: await tmCount(sectionTipo, sectionId) };
}
const hostSnapshot = (hostId: number) => snapshot(HOST_TABLE, HOST_SECTION, hostId, [PORTAL, SLOT]);

async function refusalOf(run: () => Promise<unknown>): Promise<DedaloError | string> {
	try {
		const value = await run();
		return `served: ${JSON.stringify(value)}`;
	} catch (error) {
		if (error instanceof DedaloError) return error;
		return `threw non-DedaloError: ${String(error)}`;
	}
}

function codeOf(outcome: DedaloError | string): string {
	return outcome instanceof DedaloError ? outcome.code : outcome;
}

const unlink = (
	principal: Principal,
	hostId: number | string,
	locator: unknown = L1(),
	tipo: string = PORTAL,
) =>
	deletePortalLocator(
		principal,
		{ tipo, section_tipo: HOST_SECTION, section_id: hostId as number },
		{
			locator: locator as Record<string, unknown>,
			ar_properties: ['section_tipo', 'section_id', 'type'],
		},
	);

/** A refusing leg: the code (and coordinate when pinned), and the host unchanged. */
async function expectRefusedUnchanged(
	run: () => Promise<unknown>,
	code: string,
	before: () => Promise<Snapshot>,
	after: () => Promise<Snapshot>,
	coordinateTipo?: string,
): Promise<void> {
	const seed = await before();
	const outcome = await refusalOf(run);
	expect(codeOf(outcome)).toBe(code);
	if (coordinateTipo !== undefined && outcome instanceof DedaloError) {
		expect(outcome.coordinates?.tipo).toBe(coordinateTipo);
	}
	expect(await after()).toEqual(seed);
}

// --- the gate ------------------------------------------------------------------

describe.if(DB_READY)(
	'SEC-2 deletePortalLocator — the write door before any read, lock or write',
	() => {
		beforeAll(async () => {
			await assertTestDatabase('portal_locator_door_native');
			// The situation, asserted through the resolver — drift reddens here.
			expect(await getModelByTipo(PORTAL)).toBe('component_portal');
			expect(await resolveDataframeSlotTipos(PORTAL)).toContain(SLOT);
			HOST_TABLE = (await getMatrixTableFromTipo(HOST_SECTION)) ?? '';
			expect(HOST_TABLE).toBe('matrix_test');
			FILTER_TIPO = (await getComponentFilterTipo(HOST_SECTION)) ?? '';
			expect(FILTER_TIPO).not.toBe('');

			projectP = await mintProject('P');
			projectQ = await mintProject('Q');
			const portalTable = (await getMatrixTableFromTipo(PORTAL_TARGET_SECTION)) as string;
			const frameTable = (await getMatrixTableFromTipo(FRAME_TARGET_SECTION)) as string;
			portalTargets = [
				track(
					portalTable,
					PORTAL_TARGET_SECTION,
					await createSectionRecord(PORTAL_TARGET_SECTION, -1),
				),
				track(
					portalTable,
					PORTAL_TARGET_SECTION,
					await createSectionRecord(PORTAL_TARGET_SECTION, -1),
				),
			];
			frameTargets = [
				track(
					frameTable,
					FRAME_TARGET_SECTION,
					await createSectionRecord(FRAME_TARGET_SECTION, -1),
				),
				track(
					frameTable,
					FRAME_TARGET_SECTION,
					await createSectionRecord(FRAME_TARGET_SECTION, -1),
				),
			];

			const full: [string, string, number][] = [
				[HOST_SECTION, HOST_SECTION, 2],
				[HOST_SECTION, PORTAL, 2],
			];
			identities.CONTROL = await mintIdentity('zzportal_control', full, projectP);
			identities.COMPONENT_DENIED = await mintIdentity(
				'zzportal_component_denied',
				[
					[HOST_SECTION, HOST_SECTION, 2],
					[HOST_SECTION, PORTAL, 1],
				],
				projectP,
			);
			identities.READ_SECTION = await mintIdentity(
				'zzportal_read_section',
				[
					[HOST_SECTION, HOST_SECTION, 1],
					[HOST_SECTION, PORTAL, 2],
				],
				projectP,
			);
			identities.OUT_OF_SCOPE = await mintIdentity('zzportal_out_of_scope', full, projectQ);
			identities.MANAGER = await mintIdentity(
				'zzportal_manager',
				[
					[USERS, USERS, 2],
					[USERS, 'dd1725', 2],
				],
				projectP,
			);
			clearCaches();
			for (const identity of Object.values(identities)) {
				identity.principal = await resolvePrincipal(identity.userId);
				expect(identity.principal.isGlobalAdmin).toBe(false);
			}
			admin = await resolvePrincipal(-1);
			expect(admin.isGlobalAdmin).toBe(true);
		}, 60000);

		afterAll(async () => {
			await assertTestDatabase('portal_locator_door_native: sweep');
			const userIds = Object.values(identities).map((identity) => identity.userId);
			while (created.length > 0) {
				const row = created.pop() as { table: string; sectionTipo: string; sectionId: number };
				await deleteMatrixRecord(row.table, row.sectionTipo, row.sectionId);
				await sql.unsafe(
					'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
					[row.sectionTipo, row.sectionId],
				);
			}
			for (const userId of userIds) {
				await sql.unsafe(
					`DELETE FROM matrix_activity WHERE section_tipo = 'dd542' AND relation @> $1::text::jsonb`,
					[JSON.stringify({ dd543: [{ section_id: userId }] })],
				);
			}
			clearCaches();
		}, 60000);

		test('the host is born in project P (the scope the legs stand on)', async () => {
			const host = await seedHost();
			const filter = JSON.parse(
				(await keyText(HOST_TABLE, HOST_SECTION, host, FILTER_TIPO)) ?? '[]',
			);
			expect(filter.map((item: { section_id: unknown }) => Number(item.section_id))).toEqual([
				projectP,
			]);
		});

		test('a. CONTROL (2/2, in scope) removes L1 + its frame, audited as CONTROL', async () => {
			const control = identities.CONTROL;
			const host = await seedHost();
			const tmBefore = await tmCount(HOST_SECTION, host);
			const result = await unlink(control.principal, host);
			expect(result.removed).toBe(1);
			const portal = JSON.parse((await keyText(HOST_TABLE, HOST_SECTION, host, PORTAL)) ?? '[]');
			expect(portal.map((item: { id: number }) => item.id)).toEqual([2]);
			const slot = JSON.parse((await keyText(HOST_TABLE, HOST_SECTION, host, SLOT)) ?? '[]');
			expect(slot.map((entry: { id_key: number }) => entry.id_key)).toEqual([2]);
			// The audit is the GRANT's actor, never -1 or a request-derived id.
			expect(await tmCount(HOST_SECTION, host)).toBeGreaterThan(tmBefore);
			const tm = (await sql.unsafe(
				`SELECT user_id FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ORDER BY id DESC LIMIT 1`,
				[HOST_SECTION, host, PORTAL],
			)) as { user_id: number | string }[];
			expect(Number(tm[0]?.user_id)).toBe(control.userId);
			const modifiedBy = JSON.parse(
				(await keyText(HOST_TABLE, HOST_SECTION, host, 'dd197')) ?? '[]',
			);
			expect(Number(modifiedBy[0]?.section_id)).toBe(control.userId);
		});

		test('b. section 2 but the PORTAL below 2 → perm.denied on the portal, nothing changed', async () => {
			const host = await seedHost();
			await expectRefusedUnchanged(
				() => unlink(identities.COMPONENT_DENIED.principal, host),
				'perm.denied',
				() => hostSnapshot(host),
				() => hostSnapshot(host),
				PORTAL,
			);
		});

		test('c. a record outside the caller projects → perm.out_of_scope, nothing changed', async () => {
			const host = await seedHost();
			await expectRefusedUnchanged(
				() => unlink(identities.OUT_OF_SCOPE.principal, host),
				'perm.out_of_scope',
				() => hostSnapshot(host),
				() => hostSnapshot(host),
			);
		});

		test('d. a (dd128, dd1725) manager on their OWN dd1725 → perm.denied on dd1725, link kept', async () => {
			const manager = identities.MANAGER;
			const own = () => snapshot('matrix_users', USERS, manager.userId, ['dd1725']);
			const before = await own();
			expect(before.keys[0]).not.toBeNull();
			await expectRefusedUnchanged(
				() =>
					deletePortalLocator(
						manager.principal,
						{ tipo: 'dd1725', section_tipo: USERS, section_id: manager.userId },
						{
							locator: relationLocator('dd1725', PROFILES, manager.profileId),
							ar_properties: ['section_tipo', 'section_id'],
						},
					),
				'perm.denied',
				own,
				own,
				'dd1725',
			);
		});

		for (const sectionId of [-1, 0]) {
			test(`e. a global admin at section_id ${sectionId} → perm.out_of_scope`, async () => {
				const outcome = await refusalOf(() => unlink(admin, sectionId));
				expect(codeOf(outcome)).toBe('perm.out_of_scope');
			});
		}

		test('f. a nonexistent record: out of scope for a non-admin, the empty-data answer for an admin', async () => {
			const gone = await seedHost();
			await deleteMatrixRecord(HOST_TABLE, HOST_SECTION, gone);
			const outcome = await refusalOf(() => unlink(identities.CONTROL.principal, gone));
			expect(codeOf(outcome)).toBe('perm.out_of_scope');
			const answer = await unlink(admin, gone);
			expect(answer.removed).toBe(0);
			expect(answer.msg.join('\n')).toContain('The component data is empty');
		});

		test('g. the SECTION at 1 (portal at 2) → perm.denied, nothing changed (the floor)', async () => {
			const host = await seedHost();
			await expectRefusedUnchanged(
				() => unlink(identities.READ_SECTION.principal, host),
				'perm.denied',
				() => hostSnapshot(host),
				() => hostSnapshot(host),
			);
		});

		test('h. target grammar: a malformed tipo / id is request.invalid; a missing tipo request.invalid_options', async () => {
			const host = await seedHost();
			const control = identities.CONTROL.principal;
			await expectRefusedUnchanged(
				() => unlink(control, host, L1(), `${PORTAL};x`),
				'request.invalid',
				() => hostSnapshot(host),
				() => hostSnapshot(host),
			);
			await expectRefusedUnchanged(
				() => unlink(control, '1.5'),
				'request.invalid',
				() => hostSnapshot(host),
				() => hostSnapshot(host),
			);
			await expectRefusedUnchanged(
				() => unlink(control, host, L1(), ''),
				'request.invalid_options',
				() => hostSnapshot(host),
				() => hostSnapshot(host),
			);
		});

		test('i. the door runs BEFORE the row lock: a refused caller never waits on a locked row', async () => {
			const host = await seedHost();
			const connection = await sql.reserve();
			let pending: Promise<unknown> | null = null;
			let verdict = 'unset';
			try {
				await connection.unsafe('BEGIN');
				await connection.unsafe(
					`SELECT id FROM "${HOST_TABLE}" WHERE section_tipo = $1 AND section_id = $2 FOR UPDATE`,
					[HOST_SECTION, host],
				);
				pending = unlink(identities.OUT_OF_SCOPE.principal, host);
				const timeout = new Promise<string>((resolve) => {
					setTimeout(() => resolve('timed out waiting on the row lock'), 3000);
				});
				verdict = await Promise.race([
					pending.then(
						() => 'served',
						(error: unknown) => (error instanceof DedaloError ? error.code : String(error)),
					),
					timeout,
				]);
			} finally {
				await connection.unsafe('ROLLBACK');
				connection.release();
				// A regressed call settles before the sweep.
				await pending?.catch(() => undefined);
			}
			expect(verdict).toBe('perm.out_of_scope');
		});

		test('j. the locator is checked AFTER the door', async () => {
			const host = await seedHost();
			const call = (principal: Principal, options: Record<string, unknown>) =>
				refusalOf(() =>
					deletePortalLocator(
						principal,
						{ tipo: PORTAL, section_tipo: HOST_SECTION, section_id: host },
						options as never,
					),
				);
			expect(codeOf(await call(identities.OUT_OF_SCOPE.principal, {}))).toBe('perm.out_of_scope');
			expect(codeOf(await call(identities.CONTROL.principal, {}))).toBe('request.invalid_options');
			expect(codeOf(await call(identities.CONTROL.principal, { locator: 'x' }))).toBe(
				'request.invalid_options',
			);
		});
	},
);
