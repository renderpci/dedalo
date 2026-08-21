/**
 * THE SYNTHETIC ACL IDENTITY FIXTURE (plan item F2).
 *
 * WHY IT EXISTS. Measured on `dedalo_mib_v7_test` (2026-08-10): the suite
 * database holds exactly three `dd128` users — `-1`, `0` and `1`. Neither user
 * 16 (imported as `NON_ADMIN_USER` by ~10 unit files) nor ANY real admin
 * exists: `resolvePrincipal(1)` returns `isGlobalAdmin:false` and
 * `getPermissions(_, 'test3','test3') === 0`, and `resolvePrincipal(16)` is the
 * same. So every "the admin sees strictly more than the non-admin" assertion in
 * the suite is satisfiable at ZERO versus ZERO — the green-suite trap in its
 * ambient form. This helper mints the two identities that make that contrast
 * mean something, and `acl_identity_fixture_native.test.ts` is the gate that
 * proves the contrast is non-degenerate.
 *
 * WHAT IT MINTS (band 930000-930999, tipo prefix `zzacl` for the string values;
 * no new ontology node is required — users/profiles/projects are ordinary
 * `dd128`/`dd234`/`dd153` records):
 *
 *   930001  matrix_users     ADMIN     dd244 → dd64/1 (Yes)  ⇒ isGlobalAdmin
 *                                      dd515 → dd64/2 (No)   ⇒ NOT developer
 *                                      dd1725 → dd234/930011 (admin profile)
 *   930002  matrix_users     NON-ADMIN dd244 → dd64/2 (No)   ⇒ NOT admin
 *                                      dd515 → dd64/2 (No)
 *                                      dd1725 → dd234/930012 (reader profile)
 *                                      dd170  → dd153/930021 (one project)
 *   930011  matrix_profiles  admin profile  — misc.dd774 grants test3 = 3,
 *                                      test3.test92 = 3, dd88 = 2;
 *                                      dd1067 → the derived tool_export row
 *   930012  matrix_profiles  reader profile — misc.dd774 grants test3 = 1,
 *                                      test3.test92 = 1, dd88 = 2
 *   930021  matrix_projects  the one scratch project the non-admin may see
 *
 * The grants are VERIFIED, not merely written: `acl_identity_fixture_native`
 * reads them back through the REAL doors (`getSectionPermissions`,
 * `getPermissions`, `ddoIsAuthorized`, `getUserTools`), so a fixture that
 * claims a level it does not actually confer reddens there.
 *
 * The shapes are copied from the REAL rows in the suite DB (user `-1` carries
 * `dd244`/`dd1725` locators of exactly this form; profile `2` carries
 * `misc.dd774` entries of exactly this form), so the fixture exercises the same
 * jsonb reads production does — `readUserRelationTargetId` (`relation-><tipo>`
 * first locator's `section_id`) and `getPermissionsTable`
 * (`misc.dd774` → `${section_tipo}_${tipo}` → value).
 *
 * SCRATCH-ID LAW. The ids are EXPLICIT and in the reserved ≥ 900000 band. This
 * helper deliberately does NOT allocate through `insertMatrixRecordWithCounter`
 * (that is how `password_reset_native.test.ts` landed a scratch user at
 * `section_id 0`, inside the installed-user band — plan item F3) and does not
 * touch `matrix_counter` at all, so it leaves no residue in the shared counters.
 *
 * SWEEP. `removeAclIdentityFixture()` deletes all five records and any
 * `matrix_time_machine` rows for those (section_tipo, section_id) pairs, and
 * THROWS when a matrix delete removes 0 rows — a sweep that deletes nothing
 * means the filter is wrong, which is the exact class of bug that left the
 * suite DB 44% unswept. TM rows are swept opportunistically (this helper writes
 * none, so 0 there is the expected count and is NOT an error).
 *
 * USAGE (any test file may consume it):
 *
 *   import { ACL_ADMIN_USER_ID, ACL_NON_ADMIN_USER_ID,
 *            installAclIdentityFixture, removeAclIdentityFixture }
 *     from '../helpers/acl_identity_fixture.ts';
 *
 *   beforeAll(installAclIdentityFixture);
 *   afterAll(removeAclIdentityFixture);
 *
 * Install is idempotent (it sweeps a crashed previous run's rows first) and
 * drops the three per-user security caches, so a principal resolved BEFORE the
 * mint (by another file in the same bun process) can never be served stale.
 */

import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
} from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

// --- the reserved ids (band 930000-930999) ---------------------------------

/** dd128 user whose dd244 flag is SET → `resolvePrincipal().isGlobalAdmin`. */
export const ACL_ADMIN_USER_ID = 930001;
/** dd128 user whose dd244 flag is UNSET (explicit "No"). */
export const ACL_NON_ADMIN_USER_ID = 930002;
/** dd234 profile assigned to the admin (test3 grant level 3). */
export const ACL_ADMIN_PROFILE_ID = 930011;
/** dd234 profile assigned to the non-admin (test3 grant level 1 = read). */
export const ACL_NON_ADMIN_PROFILE_ID = 930012;
/** dd153 project the non-admin's dd170 relation resolves to. */
export const ACL_PROJECT_ID = 930021;

/**
 * The tool the ADMIN profile grants and the reader profile does not.
 *
 * The grant is EXPLICIT because the tool ACL has no role shortcut: only the
 * SUPERUSER id receives the unfiltered tool list (registry.ts getUserTools —
 * audit OH1 finding 5), so a global admin sees exactly the tools their profile
 * names plus the always_active ones, like everyone else. A fixture admin
 * without this locator authorizes no restricted tool at all.
 */
export const ACL_GRANTED_TOOL_NAME = 'tool_export';

/**
 * Its dd1324 registry `section_id`, DERIVED — never pinned.
 *
 * A hardcoded id is a bet on one database's seed order, and it lost: the id
 * this constant used to hold (21) is `tool_import_marc21` on the suite DB
 * (`tool_export` is 22 there), so the fixture threw on every install and no
 * consumer could get a principal at all. The registry is addressable BY NAME
 * through its own door — `getActiveToolMetaBySectionId()`, the same map the
 * dd1067 datalist hydration reads — so ask it instead of guessing.
 *
 * Three refusals, because a silently-wrong grant is the failure mode this
 * replaces: the name must resolve, it must resolve UNIQUELY, and the tool must
 * NOT be `always_active` (an always-active tool is granted to every profile by
 * `getUserTools`, so granting it would make the admin/reader contrast vacuous).
 */
export async function resolveAclGrantedToolRegistryId(): Promise<number> {
	const { getActiveToolMetaBySectionId } = await import('../../src/core/tools/registry.ts');
	const registry = await getActiveToolMetaBySectionId();
	const matches = [...registry.entries()].filter(([, meta]) => meta.name === ACL_GRANTED_TOOL_NAME);
	if (matches.length !== 1) {
		throw new Error(
			`acl_identity_fixture: the ACTIVE tool registry holds ${matches.length} rows named '${ACL_GRANTED_TOOL_NAME}' (expected exactly 1) out of ${registry.size} active tools — the grant cannot be addressed.` +
				(registry.size === 0
					? " The registry is EMPTY: this database's tool step has not run. Build it with 'bun run test:db:setup'."
					: ''),
		);
	}
	const [sectionId, meta] = matches[0] as [number, { always_active: boolean }];
	if (meta.always_active) {
		throw new Error(
			`acl_identity_fixture: '${ACL_GRANTED_TOOL_NAME}' is always_active, so every profile authorizes it — the fixture's granted/denied contrast would be vacuous. Pick a restricted tool.`,
		);
	}
	return sectionId;
}

/** The section the grants are written for — the real playground section. */
export const ACL_GRANTED_SECTION = 'test3';
/**
 * A COMPONENT of {@link ACL_GRANTED_SECTION} both profiles grant (admin at
 * {@link ACL_ADMIN_LEVEL}, reader at {@link ACL_NON_ADMIN_LEVEL}).
 *
 * A section grant alone is NOT a readable section: `ddoIsAuthorized` — the
 * per-component gate every read door runs, and the one the component `get_data`
 * facade self-gates with — reads `getPermissions(section, COMPONENT)`, whose
 * key is `test3_test92`, not `test3_test3`. It has NO global-admin bypass
 * either (only the superuser short-circuits), so a fixture with section grants
 * only serves the empty shell to BOTH identities and any "the reader can read
 * this component" assertion is vacuous at empty-vs-empty. Real profiles carry
 * per-component dd774 rows; so does this one now.
 *
 * `test92` is test3's own `component_publication` (the seeded playground
 * ontology) — the component the publication search-filter gate reads.
 */
export const ACL_GRANTED_COMPONENT = 'test92';
/**
 * A component of the SAME section NEITHER profile grants — the negative half of
 * the component contrast, so "granted" can be told from "the gate never ran".
 * `test91` is test3's `component_select`.
 */
export const ACL_DENIED_COMPONENT = 'test91';
/** Grant level held by the admin's profile on {@link ACL_GRANTED_SECTION}. */
export const ACL_ADMIN_LEVEL = 3;
/** Grant level held by the non-admin's profile on {@link ACL_GRANTED_SECTION}. */
export const ACL_NON_ADMIN_LEVEL = 1;
/**
 * dd88 — the maintenance area. BOTH profiles grant it level 2; only the admin
 * gets it, because getPermissions' maintenance gate refuses a non-admin
 * non-developer before the matrix is consulted.
 */
export const AREA_MAINTENANCE = 'dd88';
/** The level both profiles grant on {@link AREA_MAINTENANCE}. */
export const ACL_MAINTENANCE_GRANT = 2;

const USERS_SECTION = 'dd128';
const PROFILES_SECTION = 'dd234';
const PROJECTS_SECTION = 'dd153';
const YES_NO_SECTION = 'dd64';
/** The tools REGISTRY section (dd1324) a dd1067 grant locator points into. */
const TOOLS_REGISTER_SECTION = 'dd1324';
/** dd64 record ids: 1 = Yes, 2 = No (the flag components point at these). */
const YES = 1;
const NO = 2;

/** Every (table, section_tipo, section_id) this fixture owns, sweep order. */
const OWNED_RECORDS: { table: string; sectionTipo: string; sectionId: number }[] = [
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: ACL_ADMIN_USER_ID },
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: ACL_NON_ADMIN_USER_ID },
	{ table: 'matrix_profiles', sectionTipo: PROFILES_SECTION, sectionId: ACL_ADMIN_PROFILE_ID },
	{ table: 'matrix_profiles', sectionTipo: PROFILES_SECTION, sectionId: ACL_NON_ADMIN_PROFILE_ID },
	{ table: 'matrix_projects', sectionTipo: PROJECTS_SECTION, sectionId: ACL_PROJECT_ID },
];

/** A yes/no flag locator as the real user records carry it (dd151 = list). */
function flagLocator(componentTipo: string, target: number) {
	return {
		id: 1,
		type: 'dd151',
		section_id: target,
		section_tipo: YES_NO_SECTION,
		from_component_tipo: componentTipo,
	};
}

/** A locator into another section (profile-select dd1725, projects dd170). */
function recordLocator(componentTipo: string, sectionTipo: string, sectionId: number) {
	return {
		id: 1,
		type: 'dd151',
		section_id: sectionId,
		section_tipo: sectionTipo,
		from_component_tipo: componentTipo,
	};
}

/** Insert one record at an EXPLICIT section_id — no counter, no advisory lock. */
async function insertScratchRecord(
	table: string,
	sectionTipo: string,
	sectionId: number,
	columns: Record<string, unknown>,
): Promise<void> {
	const names = ['"section_tipo"', '"section_id"'];
	const placeholders = ['$1', '$2'];
	const params: (string | number)[] = [sectionTipo, sectionId];
	let index = 3;
	for (const [column, value] of Object.entries(columns)) {
		names.push(`"${column}"`);
		placeholders.push(`$${index}::text::jsonb`);
		params.push(encodeForJsonb(value));
		index++;
	}
	await sql.unsafe(
		`INSERT INTO "${table}" (${names.join(', ')}) VALUES (${placeholders.join(', ')})`,
		params,
	);
}

/**
 * The scratch floor, ENFORCED — not merely documented. Every id this helper
 * touches is asserted before any INSERT or DELETE runs, because the sweep
 * deletes by (section_tipo, section_id): an id edited down into the installed
 * band would silently destroy a real users/profiles/projects record on the
 * SHARED suite database. (This was not hypothetical — a mutation run that set
 * ACL_ADMIN_USER_ID to 1 deleted the suite DB's dd128/1 row before this guard
 * existed.)
 */
const SCRATCH_ID_FLOOR = 900000;

function assertScratchIds(): void {
	for (const record of OWNED_RECORDS) {
		if (!Number.isInteger(record.sectionId) || record.sectionId < SCRATCH_ID_FLOOR) {
			throw new Error(
				`acl_identity_fixture: ${record.table}/${record.sectionTipo} id ${record.sectionId} is below the scratch floor ${SCRATCH_ID_FLOOR} — refusing to touch an installed record`,
			);
		}
	}
}

/** Drop the three per-user security caches this fixture's rows feed. */
export function clearAclIdentityCaches(): void {
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
}

/**
 * Mint the fixture. Idempotent: a crashed previous run's rows are swept first
 * (leniently — nothing to delete is the normal case here).
 */
export async function installAclIdentityFixture(): Promise<void> {
	// This fixture writes USERS, PROFILES and PROJECTS rows — the identity
	// tables of an installation. The database must say it is disposable first.
	await assertTestDatabase('installAclIdentityFixture');
	assertScratchIds();
	const grantedToolRegistryId = await resolveAclGrantedToolRegistryId();
	await purge({ strict: false });

	// The one project the non-admin is scoped to.
	await insertScratchRecord('matrix_projects', PROJECTS_SECTION, ACL_PROJECT_ID, {
		string: { dd156: [{ id: 1, lang: 'lg-eng', value: 'zzacl scratch project' }] },
	});

	// Profiles — the dd774 grant matrix getPermissionsTable reads off `misc`.
	await insertScratchRecord('matrix_profiles', PROFILES_SECTION, ACL_ADMIN_PROFILE_ID, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'zzacl admin profile' }] },
		// dd1067 — the profile's authorized-tools locators (→ dd1324 registry
		// rows), the ONLY thing that authorizes a restricted tool for a
		// non-superuser. See ACL_GRANTED_TOOL_REGISTRY_ID.
		relation: {
			dd1067: [recordLocator('dd1067', TOOLS_REGISTER_SECTION, grantedToolRegistryId)],
		},
		misc: {
			dd774: [
				{
					id: 1,
					tipo: ACL_GRANTED_SECTION,
					section_tipo: ACL_GRANTED_SECTION,
					value: ACL_ADMIN_LEVEL,
				},
				// IDENTICAL to the reader profile's second grant on purpose: the
				// maintenance area (dd88) is refused to a non-admin by the FLAG,
				// not by the matrix, so an identical grant with a different
				// outcome isolates the flag's effect from the grant's.
				{
					id: 2,
					tipo: AREA_MAINTENANCE,
					section_tipo: AREA_MAINTENANCE,
					value: ACL_MAINTENANCE_GRANT,
				},
				// The per-COMPONENT row — see ACL_GRANTED_COMPONENT.
				{
					id: 3,
					tipo: ACL_GRANTED_COMPONENT,
					section_tipo: ACL_GRANTED_SECTION,
					value: ACL_ADMIN_LEVEL,
				},
			],
		},
	});
	await insertScratchRecord('matrix_profiles', PROFILES_SECTION, ACL_NON_ADMIN_PROFILE_ID, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'zzacl reader profile' }] },
		misc: {
			dd774: [
				{
					id: 1,
					tipo: ACL_GRANTED_SECTION,
					section_tipo: ACL_GRANTED_SECTION,
					value: ACL_NON_ADMIN_LEVEL,
				},
				{
					id: 2,
					tipo: AREA_MAINTENANCE,
					section_tipo: AREA_MAINTENANCE,
					value: ACL_MAINTENANCE_GRANT,
				},
				{
					id: 3,
					tipo: ACL_GRANTED_COMPONENT,
					section_tipo: ACL_GRANTED_SECTION,
					value: ACL_NON_ADMIN_LEVEL,
				},
			],
		},
	});

	// The ADMIN user: dd244 SET (Yes) — this is the single byte the gate's
	// mutation flips. dd515 is explicitly "No" so admin-ness and developer-ness
	// can never be conflated by a reader that swapped the two component tipos.
	await insertScratchRecord('matrix_users', USERS_SECTION, ACL_ADMIN_USER_ID, {
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: 'zzacl_admin' }] },
		relation: {
			dd131: [flagLocator('dd131', YES)],
			dd244: [flagLocator('dd244', YES)],
			dd515: [flagLocator('dd515', NO)],
			dd1725: [recordLocator('dd1725', PROFILES_SECTION, ACL_ADMIN_PROFILE_ID)],
		},
	});

	// The NON-ADMIN user: dd244 present but "No" (2) — a PRESENT-BUT-NEGATIVE
	// flag, so a reader that tested `!== null` instead of `=== 1` is caught.
	await insertScratchRecord('matrix_users', USERS_SECTION, ACL_NON_ADMIN_USER_ID, {
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: 'zzacl_reader' }] },
		relation: {
			dd131: [flagLocator('dd131', YES)],
			dd244: [flagLocator('dd244', NO)],
			dd515: [flagLocator('dd515', NO)],
			dd1725: [recordLocator('dd1725', PROFILES_SECTION, ACL_NON_ADMIN_PROFILE_ID)],
			dd170: [recordLocator('dd170', PROJECTS_SECTION, ACL_PROJECT_ID)],
		},
	});

	clearAclIdentityCaches();
}

/**
 * Sweep every record this fixture owns plus its TM rows. THROWS on a 0-row
 * matrix delete (strict mode) — a filter that matches nothing is the bug.
 */
export async function removeAclIdentityFixture(): Promise<void> {
	await assertTestDatabase('removeAclIdentityFixture');
	await purge({ strict: true });
	clearAclIdentityCaches();
}

async function purge(options: { strict: boolean }): Promise<void> {
	assertScratchIds();
	const missing: string[] = [];
	for (const record of OWNED_RECORDS) {
		const removed = await deleteMatrixRecord(record.table, record.sectionTipo, record.sectionId);
		if (removed === 0) missing.push(`${record.table}/${record.sectionTipo}/${record.sectionId}`);
		// TM rows: this fixture's direct inserts write none, so 0 here is the
		// expected count and never an error — but a consumer that SAVES through
		// the chokepoint on these records will have produced some, and they are
		// swept unconditionally so no consumer can leak them.
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[record.sectionTipo, record.sectionId],
		);
	}
	if (options.strict && missing.length > 0) {
		throw new Error(
			`acl_identity_fixture sweep removed 0 rows for: ${missing.join(', ')} — the scratch filter is wrong or another run deleted them`,
		);
	}
}
