/**
 * THE HIERARCHY-PRUNING FIXTURE (generic-TLD rebuild of the 2026-07-10 gate).
 *
 * WHY IT EXISTS. `area_hierarchy_pruning.test.ts` used to assert the mht
 * install's live matrix: "fixture user 4 (profile 13) holds dd100 level 2 and
 * a partial hierarchy split". On the suite database user 4 does not exist
 * (matrix_users holds only -1) and the whole gate reddened as a claim about an
 * ABSENT install — a fixture assertion, not an engine one. Per the generic-TLD
 * law the gate now BUILDS its situation: a scratch non-admin whose profile
 * grants the thesaurus area plus exactly ONE of two scratch hierarchies'
 * targets, so the granted/denied split is constructed, not discovered.
 *
 * WHAT IT MINTS (band 939000-939999 — 930xxx is the acl identity fixture,
 * 931xxx portal/permissions scratch, 932xxx/933xxx user-stats, 934-938 taken):
 *
 *   939001  matrix_users           NON-ADMIN  dd244 → dd64/2 (No)
 *                                             dd1725 → dd234/939011
 *   939011  matrix_profiles        misc.dd774 grants dd100 = 1 (the
 *                                  thesaurus area), test3 = 1 (the granted
 *                                  hierarchy's target AND its root-term
 *                                  section). NO grant for test65 — the denied
 *                                  target — which is the whole point.
 *   939021  matrix_hierarchy_main  GRANTED hierarchy: target test3, active
 *                                  (hierarchy4 dd64/1), active_in_thesaurus
 *                                  (hierarchy125 dd64/1), typology
 *                                  hierarchy13/2, root term test3/1.
 *   939022  matrix_hierarchy_main  DENIED hierarchy: same shape, target
 *                                  test65 (a section with its own
 *                                  component_relation_children, test156, so
 *                                  the SUPERUSER serves it and its absence
 *                                  from the non-admin tree is pruning, not a
 *                                  config drop).
 *
 * Both hierarchy rows are fully SERVABLE by construction (active flags,
 * typology, root terms, resolvable children tipo): a row dropped for a
 * structural reason would satisfy "denied is absent" vacuously, and the gate
 * guards against that by asserting the superuser tree DOES serve both.
 *
 * Locator shapes copied from the real hierarchy1 rows on the suite DB
 * (hierarchy4/125 dd64 flags, hierarchy9 typology, hierarchy45 dd48 root
 * terms, hierarchy53 lg-nolan target, hierarchy48 number order).
 *
 * SCRATCH-ID LAW: explicit ids in the reserved >= 900000 band, no counter
 * touch, sweep throws on a 0-row matrix delete (strict), and the database
 * must carry the `dedalo_test_marker` row before anything is written.
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

// --- the reserved ids (band 939000-939999) ---------------------------------

/** dd128 user: non-admin (dd244 present but "No"), profile 939011. */
export const HP_NON_ADMIN_USER_ID = 939001;
/** dd234 profile: dd100 = 1 + test3 = 1; NOTHING for test65. */
export const HP_PROFILE_ID = 939011;
/** hierarchy1 record whose target the profile grants. */
export const HP_GRANTED_HIERARCHY_ID = 939021;
/** hierarchy1 record whose target the profile does NOT grant. */
export const HP_DENIED_HIERARCHY_ID = 939022;

/** The thesaurus area tipo the pruning loop serves (area_thesaurus). */
export const HP_AREA_TIPO = 'dd100';
/** Granted target: the canonical playground section (children tipo test201). */
export const HP_GRANTED_TARGET = 'test3';
/** Denied target: a test-TLD section with its own children tipo (test156). */
export const HP_DENIED_TARGET = 'test65';

const USERS_SECTION = 'dd128';
const PROFILES_SECTION = 'dd234';
const HIERARCHY_SECTION = 'hierarchy1';
const YES_NO_SECTION = 'dd64';
const YES = 1;
const NO = 2;

/** Every (table, section_tipo, section_id) this fixture owns, sweep order. */
const OWNED_RECORDS: { table: string; sectionTipo: string; sectionId: number }[] = [
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: HP_NON_ADMIN_USER_ID },
	{ table: 'matrix_profiles', sectionTipo: PROFILES_SECTION, sectionId: HP_PROFILE_ID },
	{
		table: 'matrix_hierarchy_main',
		sectionTipo: HIERARCHY_SECTION,
		sectionId: HP_GRANTED_HIERARCHY_ID,
	},
	{
		table: 'matrix_hierarchy_main',
		sectionTipo: HIERARCHY_SECTION,
		sectionId: HP_DENIED_HIERARCHY_ID,
	},
];

const SCRATCH_ID_FLOOR = 900000;

function assertScratchIds(): void {
	for (const record of OWNED_RECORDS) {
		if (!Number.isInteger(record.sectionId) || record.sectionId < SCRATCH_ID_FLOOR) {
			throw new Error(
				`hierarchy_pruning_fixture: ${record.table}/${record.sectionTipo} id ${record.sectionId} is below the scratch floor ${SCRATCH_ID_FLOOR} — refusing to touch an installed record`,
			);
		}
	}
}

/** A dd151-typed locator as the real rows carry it. */
function locator(componentTipo: string, sectionTipo: string, sectionId: number) {
	return {
		id: 1,
		type: 'dd151',
		section_id: sectionId,
		section_tipo: sectionTipo,
		from_component_tipo: componentTipo,
	};
}

/** One hierarchy1 record, servable by construction (see module doc). */
function hierarchyRecordColumns(name: string, target: string): Record<string, unknown> {
	return {
		string: {
			hierarchy5: [{ id: 1, lang: 'lg-nolan', value: name }],
			// The target reads lg-nolan FIRST (tree.ts langSliceValue) — the
			// real rows store it exactly like this.
			hierarchy53: [{ id: 1, lang: 'lg-nolan', value: target }],
		},
		relation: {
			// Active (the boot query's filter) — probed in both typed forms, the
			// stored form here is the post-int-sweep NUMERIC one.
			hierarchy4: [locator('hierarchy4', YES_NO_SECTION, YES)],
			// active_in_thesaurus — a thesaurus entry is skipped without it.
			hierarchy125: [locator('hierarchy125', YES_NO_SECTION, YES)],
			// Typology (thesaurus, hierarchy13/2 on the seed) — skipped without.
			hierarchy9: [locator('hierarchy9', 'hierarchy13', 2)],
			// Root term: the target's own record 1. filterRootTermsByGrant checks
			// the SECTION grant, so granted/denied follows the target's grant.
			hierarchy45: [
				{
					id: 1,
					type: 'dd48',
					section_id: 1,
					section_tipo: target,
					from_component_tipo: 'hierarchy45',
				},
			],
		},
		number: { hierarchy48: [{ id: 1, value: 0 }] },
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

/** Drop the per-user security caches the fixture's rows feed. */
function clearIdentityCaches(): void {
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
}

/**
 * Mint the fixture. Idempotent: a crashed previous run's rows are swept first
 * (leniently — nothing to delete is the normal case there).
 */
export async function installHierarchyPruningFixture(): Promise<void> {
	await assertTestDatabase('installHierarchyPruningFixture');
	assertScratchIds();
	await purge({ strict: false });

	// The profile: area access + the granted target, and NOTHING else — the
	// denied target's absence from this map IS the fixture.
	await insertScratchRecord('matrix_profiles', PROFILES_SECTION, HP_PROFILE_ID, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'zzhp pruning profile' }] },
		misc: {
			dd774: [
				{ id: 1, tipo: HP_AREA_TIPO, section_tipo: HP_AREA_TIPO, value: 1 },
				{ id: 2, tipo: HP_GRANTED_TARGET, section_tipo: HP_GRANTED_TARGET, value: 1 },
			],
		},
	});

	// The NON-ADMIN user: dd244 present but "No" — a PRESENT-BUT-NEGATIVE flag,
	// so a reader testing `!== null` instead of `=== 1` is caught.
	await insertScratchRecord('matrix_users', USERS_SECTION, HP_NON_ADMIN_USER_ID, {
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: 'zzhp_pruned_reader' }] },
		relation: {
			dd131: [locator('dd131', YES_NO_SECTION, YES)],
			dd244: [locator('dd244', YES_NO_SECTION, NO)],
			dd515: [locator('dd515', YES_NO_SECTION, NO)],
			dd1725: [locator('dd1725', PROFILES_SECTION, HP_PROFILE_ID)],
		},
	});

	await insertScratchRecord(
		'matrix_hierarchy_main',
		HIERARCHY_SECTION,
		HP_GRANTED_HIERARCHY_ID,
		hierarchyRecordColumns('zzhp granted hierarchy', HP_GRANTED_TARGET),
	);
	await insertScratchRecord(
		'matrix_hierarchy_main',
		HIERARCHY_SECTION,
		HP_DENIED_HIERARCHY_ID,
		hierarchyRecordColumns('zzhp denied hierarchy', HP_DENIED_TARGET),
	);

	clearIdentityCaches();
}

/**
 * Sweep every record this fixture owns. THROWS on a 0-row matrix delete
 * (strict mode) — a filter that matches nothing is the bug.
 */
export async function removeHierarchyPruningFixture(): Promise<void> {
	await assertTestDatabase('removeHierarchyPruningFixture');
	await purge({ strict: true });
	clearIdentityCaches();
}

async function purge(options: { strict: boolean }): Promise<void> {
	assertScratchIds();
	const missing: string[] = [];
	for (const record of OWNED_RECORDS) {
		const removed = await deleteMatrixRecord(record.table, record.sectionTipo, record.sectionId);
		if (removed === 0) missing.push(`${record.table}/${record.sectionTipo}/${record.sectionId}`);
	}
	if (options.strict && missing.length > 0) {
		throw new Error(
			`hierarchy_pruning_fixture sweep removed 0 rows for: ${missing.join(', ')} — the delete filter is wrong or the fixture was never installed`,
		);
	}
}
