/**
 * THE ONTOLOGY-AREA ACCESS FIXTURE (engineering/AREA_SPEC.md §9,
 * WC-2026-10-07-ontology-area-admin-grant).
 *
 * The rule under test: area_ontology (dd5) opens — read AND menu — for the
 * superuser, or a GLOBAL ADMIN whose profile grants dd5; inside, each TLD
 * hierarchy answers the ordinary ACL. Each half of the conjunction needs its
 * own identity, so the fixture builds three users, never reads ambient ones:
 *
 * WHAT IT MINTS (band 947000-947999):
 *
 *   947001  matrix_users     GLOBAL ADMIN, profile 947011 (dd5 + test0 granted)
 *   947002  matrix_users     GLOBAL ADMIN, profile 947012 (test0 only — NO dd5)
 *   947003  matrix_users     NON-ADMIN,    profile 947011 (the same dd5 grant)
 *   947011  matrix_profiles  misc.dd774: dd5 = 1, test0 = 1
 *   947012  matrix_profiles  misc.dd774: test0 = 1
 *
 * test0 (the generic `test` TLD's ontology section) is the ONE granted
 * hierarchy; dd0 is served to the superuser and must be pruned for 947001 —
 * the gate asserts the superuser sees both, so the pruning is not vacuous.
 *
 * Explicit scratch ids, no counter touch, strict sweep, and the database must
 * carry the `dedalo_test_marker` row before anything is written.
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

/** Global admin whose profile grants dd5 — the one non-root identity admitted. */
export const OA_GRANTED_ADMIN_ID = 947001;
/** Global admin WITHOUT the dd5 grant — admin status alone must not open it. */
export const OA_UNGRANTED_ADMIN_ID = 947002;
/** Non-admin WITH the dd5 grant — a grant alone must not open it. */
export const OA_GRANTED_NON_ADMIN_ID = 947003;
export const OA_GRANT_PROFILE_ID = 947011;
export const OA_NO_GRANT_PROFILE_ID = 947012;

/** The one ontology hierarchy the profiles grant. */
export const OA_GRANTED_TLD_SECTION = 'test0';
/** An ontology hierarchy no fixture profile grants (served to the superuser). */
export const OA_DENIED_TLD_SECTION = 'dd0';

const AREA_ONTOLOGY = 'dd5';
const USERS_SECTION = 'dd128';
const PROFILES_SECTION = 'dd234';
const YES_NO_SECTION = 'dd64';
const YES = 1;
const NO = 2;

const OWNED_RECORDS: { table: string; sectionTipo: string; sectionId: number }[] = [
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: OA_GRANTED_ADMIN_ID },
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: OA_UNGRANTED_ADMIN_ID },
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: OA_GRANTED_NON_ADMIN_ID },
	{ table: 'matrix_profiles', sectionTipo: PROFILES_SECTION, sectionId: OA_GRANT_PROFILE_ID },
	{ table: 'matrix_profiles', sectionTipo: PROFILES_SECTION, sectionId: OA_NO_GRANT_PROFILE_ID },
];

function locator(componentTipo: string, sectionTipo: string, sectionId: number) {
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

function grant(tipo: string, id: number) {
	return { id, tipo, section_tipo: tipo, value: 1 };
}

async function insertUser(
	userId: number,
	username: string,
	isGlobalAdmin: boolean,
	profileId: number,
): Promise<void> {
	await insertScratchRecord('matrix_users', USERS_SECTION, userId, {
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: username }] },
		relation: {
			dd131: [locator('dd131', YES_NO_SECTION, YES)],
			dd244: [locator('dd244', YES_NO_SECTION, isGlobalAdmin ? YES : NO)],
			dd515: [locator('dd515', YES_NO_SECTION, NO)],
			dd1725: [locator('dd1725', PROFILES_SECTION, profileId)],
		},
	});
}

function clearIdentityCaches(): void {
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
}

/** Mint the fixture. Idempotent: a crashed previous run's rows are swept first. */
export async function installOntologyAreaAccessFixture(): Promise<void> {
	await assertTestDatabase('installOntologyAreaAccessFixture');
	await purge({ strict: false });

	await insertScratchRecord('matrix_profiles', PROFILES_SECTION, OA_GRANT_PROFILE_ID, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'zzoa ontology grant profile' }] },
		misc: { dd774: [grant(AREA_ONTOLOGY, 1), grant(OA_GRANTED_TLD_SECTION, 2)] },
	});
	await insertScratchRecord('matrix_profiles', PROFILES_SECTION, OA_NO_GRANT_PROFILE_ID, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'zzoa no ontology profile' }] },
		misc: { dd774: [grant(OA_GRANTED_TLD_SECTION, 1)] },
	});

	await insertUser(OA_GRANTED_ADMIN_ID, 'zzoa_granted_admin', true, OA_GRANT_PROFILE_ID);
	await insertUser(OA_UNGRANTED_ADMIN_ID, 'zzoa_ungranted_admin', true, OA_NO_GRANT_PROFILE_ID);
	await insertUser(OA_GRANTED_NON_ADMIN_ID, 'zzoa_granted_reader', false, OA_GRANT_PROFILE_ID);

	clearIdentityCaches();
}

/** Sweep every record this fixture owns. THROWS on a 0-row delete. */
export async function removeOntologyAreaAccessFixture(): Promise<void> {
	await assertTestDatabase('removeOntologyAreaAccessFixture');
	await purge({ strict: true });
	clearIdentityCaches();
}

async function purge(options: { strict: boolean }): Promise<void> {
	const missing: string[] = [];
	for (const record of OWNED_RECORDS) {
		const removed = await deleteMatrixRecord(record.table, record.sectionTipo, record.sectionId);
		if (removed === 0) missing.push(`${record.table}/${record.sectionTipo}/${record.sectionId}`);
	}
	if (options.strict && missing.length > 0) {
		throw new Error(
			`ontology_area_access_fixture sweep removed 0 rows for: ${missing.join(', ')} — the delete filter is wrong or the fixture was never installed`,
		);
	}
}
