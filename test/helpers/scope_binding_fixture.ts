/**
 * THE SCOPE-BINDING FIXTURE — the situation the P1-24 behavioural gates build
 * (action_scope_binding_native, preset_ownership_native).
 *
 * WHY IT EXISTS. The audit's CARRY-08 doors were proven open with a principal
 * that HELD the grant each action declared (write on `options.section_tipo`)
 * and held NOTHING on the target the action wrote. A gate that only ever runs
 * as the superuser cannot tell the two apart — root passes every level check
 * before the matrix is consulted. So the gates mint two non-admin identities
 * whose grants are DISJOINT on exactly the axis each door confused:
 *
 *   946001  matrix_users     USER A   dd244 → dd64/2 (No), dd515 → No,
 *                                     dd1725 → dd234/946011,
 *                                     dd170 → dd153/946041 (A's OWN project)
 *   946002  matrix_users     USER B   same flags, dd1725 → dd234/946012,
 *                                     dd170 → dd153/<the default project>
 *   946011  matrix_profiles  A's profile — misc.dd774: test3 = 2,
 *                                     test3.test52 = 2, test3.test99 = 2,
 *                                     test3.test80 = 2 (the portal a path
 *                                     search hops through and an import
 *                                     links through). NOTHING on test65,
 *                                     NOTHING on hierarchy1.
 *   946012  matrix_profiles  B's profile — misc.dd774: hierarchy1 = 2,
 *                                     test3 = 2, test3.test52 = 2,
 *                                     test3.test99 = 2, test3.test80 = 2,
 *                                     and READ ONLY on
 *                                     test65 = 1 / test65.test52 = 1 (the
 *                                     level a write action must refuse).
 *   946041  matrix_projects  A's project (dd153) — what puts a record A
 *                                  creates inside A's scope and outside B's;
 *                                  B's records ride the default project, so
 *                                  the two scopes are DISJOINT on test3.
 *           Both profiles carry dd1067 locators for the three tools the
 *           probes dispatch (resolved by NAME from the active registry).
 *   946021  matrix_hierarchy_main  ONE hierarchy1 record (target test3,
 *                                  servable shape copied from the real rows)
 *                                  — the record the hierarchy door PINS.
 *   946031  matrix_list      dd655 editing preset OWNED BY A (dd654 → dd128/A,
 *                                  data.created_by_user_id = A)
 *   946032  matrix_list      dd655 editing preset OWNED BY B
 *   946033  matrix_list      dd655 preset with the two owner arms SPLIT:
 *                                  dd654 → A, created_by_user_id = B
 *
 * So: A holds the DECLARED-BUT-WRONG grant at each door (test3 write) and 0 on
 * the real target (test65 / hierarchy1); B is the positive control for the
 * hierarchy door and holds the READ-ONLY grant a write action must refuse; A
 * and B are each other's non-owner for the preset rows and each other's
 * out-of-scope creator on test3 (the record axis: a record B creates is one A
 * cannot reach, whatever A's section grant says).
 *
 * Every id is explicit and swept strictly (a 0-row delete throws), the
 * database must carry the `dedalo_test_marker` row before anything is written,
 * and the per-user security + tool caches are dropped on install and remove.
 * ISOLATION IS THE MARKER, NOT THE IDS: the explicit ids are a typo guard on
 * this module's own constants (see assertScratchIds), never a reserved band.
 */

import { config } from '../../src/config/config.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
	FILTER_MASTER_COMPONENT,
	PRESET_OWNER_COMPONENT,
	TEMP_PRESET_SECTION,
} from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { invalidateAllToolCaches } from '../../src/core/tools/cache.ts';

// --- the ids (band 946000-946999) -----------------------------------------

export const SB_USER_A = 946001;
export const SB_USER_B = 946002;
export const SB_PROFILE_A = 946011;
export const SB_PROFILE_B = 946012;
/** The one hierarchy1 record — what tool_hierarchy's writer is pinned to. */
export const SB_HIERARCHY_ID = 946021;
/** dd655 editing presets, one per user. */
export const SB_PRESET_OF_A = 946031;
export const SB_PRESET_OF_B = 946032;
/**
 * A preset whose dd654 OWNER is A but whose `created_by_user_id` is B — the
 * two arms of the owner predicate split apart, so each can be proven to
 * reach on its own (A sees it by the locator arm, B by the creator arm).
 */
export const SB_PRESET_SPLIT = 946033;
/**
 * A's OWN project (dd153). A record created by A is born with it
 * (record_defaults.ts: a non-admin's FIRST project), B's records with the
 * default project — so on a projects-filtered section (test3) each user's
 * records are outside the other's scope.
 */
export const SB_PROJECT_OF_A = 946041;

/** The section A and B both hold write on — the DECLARED grant at each door. */
export const SB_GRANTED_SECTION = 'test3';
/** A component of it both profiles grant at level 2 (test3's input_text). */
export const SB_GRANTED_COMPONENT = 'test52';
/** test3's component_image — the media component an import writes (both profiles: 2). */
export const SB_MEDIA_COMPONENT = 'test99';
/** test3's component_portal — the hop a path search takes out of test3, the portal an import links through (both: 2). */
export const SB_HOP_COMPONENT = 'test80';
/**
 * A test-TLD section A holds NOTHING on — the real target A must be refused
 * on — and B holds READ ONLY (test65 = 1, test65.test52 = 1): the level a
 * write action (minLevel 2) must refuse and a read action (minLevel 1) admits.
 */
export const SB_DENIED_SECTION = 'test65';
/** The hierarchy section — granted to B only. */
export const SB_HIERARCHY_SECTION = 'hierarchy1';

/** The tools the probes dispatch as A/B (granted through dd1067 by name). */
export const SB_GRANTED_TOOLS = [
	'tool_update_cache',
	'tool_hierarchy',
	'tool_import_files',
] as const;

const USERS_SECTION = 'dd128';
const PROFILES_SECTION = 'dd234';
const PROJECTS_SECTION = 'dd153';
/** dd156 — the project NAME component. */
const PROJECT_NAME_COMPONENT = 'dd156';
const YES_NO_SECTION = 'dd64';
const TOOLS_REGISTER_SECTION = 'dd1324';
const YES = 1;
const NO = 2;

const OWNED_RECORDS: { table: string; sectionTipo: string; sectionId: number }[] = [
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: SB_USER_A },
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: SB_USER_B },
	{ table: 'matrix_profiles', sectionTipo: PROFILES_SECTION, sectionId: SB_PROFILE_A },
	{ table: 'matrix_profiles', sectionTipo: PROFILES_SECTION, sectionId: SB_PROFILE_B },
	{ table: 'matrix_hierarchy_main', sectionTipo: SB_HIERARCHY_SECTION, sectionId: SB_HIERARCHY_ID },
	{ table: 'matrix_list', sectionTipo: TEMP_PRESET_SECTION, sectionId: SB_PRESET_OF_A },
	{ table: 'matrix_list', sectionTipo: TEMP_PRESET_SECTION, sectionId: SB_PRESET_OF_B },
	{ table: 'matrix_list', sectionTipo: TEMP_PRESET_SECTION, sectionId: SB_PRESET_SPLIT },
	{ table: 'matrix_projects', sectionTipo: PROJECTS_SECTION, sectionId: SB_PROJECT_OF_A },
];

/**
 * A TYPO GUARD on this module's own constants — NOT a reserved band (there is
 * none: isolation is the `dedalo_test_marker` the writers assert, and any id
 * may legitimately belong to a real record on a real install). This module
 * sweeps by explicit hardcoded ids, so the one way it could ever address a
 * seeded row of the SUITE database is a constant edited down to a low value;
 * the floor refuses that edit and asserts nothing else.
 */
const TYPO_GUARD_FLOOR = 900000;

function assertScratchIds(): void {
	for (const record of OWNED_RECORDS) {
		if (!Number.isInteger(record.sectionId) || record.sectionId < TYPO_GUARD_FLOOR) {
			throw new Error(
				`scope_binding_fixture: ${record.table}/${record.sectionTipo} id ${record.sectionId} is below this module's typo-guard floor ${TYPO_GUARD_FLOOR} — a constant was edited down`,
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
 * The dd1324 registry ids of the granted tools, resolved BY NAME through the
 * registry's own door (a pinned id is a bet on one database's seed order).
 * An always_active tool needs no grant and is skipped.
 */
async function grantedToolLocators(): Promise<Record<string, unknown>[]> {
	const { getActiveToolMetaBySectionId } = await import('../../src/core/tools/registry.ts');
	const registry = await getActiveToolMetaBySectionId();
	const locators: Record<string, unknown>[] = [];
	let id = 1;
	for (const name of SB_GRANTED_TOOLS) {
		const matches = [...registry.entries()].filter(([, meta]) => meta.name === name);
		if (matches.length !== 1) {
			throw new Error(
				`scope_binding_fixture: the ACTIVE tool registry holds ${matches.length} rows named '${name}' (expected 1) — build the suite DB with 'bun run test:db:setup'`,
			);
		}
		const [sectionId, meta] = matches[0] as [number, { always_active: boolean }];
		if (meta.always_active) continue;
		locators.push({ ...locator('dd1067', TOOLS_REGISTER_SECTION, sectionId), id: id++ });
	}
	return locators;
}

/** One dd774 grant row. */
function grant(id: number, sectionTipo: string, tipo: string, value: number) {
	return { id, tipo, section_tipo: sectionTipo, value };
}

/** A user record: non-admin, non-developer, one profile, ONE project. */
function userColumns(name: string, profileId: number, projectId: number): Record<string, unknown> {
	return {
		string: { dd132: [{ id: 1, lang: 'lg-nolan', value: name }] },
		relation: {
			dd131: [locator('dd131', YES_NO_SECTION, YES)],
			dd244: [locator('dd244', YES_NO_SECTION, NO)],
			dd515: [locator('dd515', YES_NO_SECTION, NO)],
			dd1725: [locator('dd1725', PROFILES_SECTION, profileId)],
			[FILTER_MASTER_COMPONENT]: [locator(FILTER_MASTER_COMPONENT, PROJECTS_SECTION, projectId)],
		},
	};
}

/** A's project — the seeded row's shape (dd156 name), nothing else needed. */
function projectColumns(): Record<string, unknown> {
	return {
		string: { [PROJECT_NAME_COMPONENT]: [{ id: 1, lang: 'lg-eng', value: 'zzsb project of A' }] },
	};
}

/** One hierarchy1 record, servable by construction (the pruning fixture's shape). */
function hierarchyColumns(): Record<string, unknown> {
	return {
		string: {
			hierarchy5: [{ id: 1, lang: 'lg-nolan', value: 'zzsb scope-binding hierarchy' }],
			hierarchy53: [{ id: 1, lang: 'lg-nolan', value: SB_GRANTED_SECTION }],
		},
		relation: {
			hierarchy4: [locator('hierarchy4', YES_NO_SECTION, YES)],
			hierarchy125: [locator('hierarchy125', YES_NO_SECTION, YES)],
			hierarchy9: [locator('hierarchy9', 'hierarchy13', 2)],
			hierarchy45: [
				{
					id: 1,
					type: 'dd48',
					section_id: 1,
					section_tipo: SB_GRANTED_SECTION,
					from_component_tipo: 'hierarchy45',
				},
			],
		},
		number: { hierarchy48: [{ id: 1, value: 0 }] },
	};
}

/**
 * One dd655 editing preset owned by `ownerId` — the stored shape of the real
 * rows: `relation.dd654` = the owner's dd128 locator, `data.created_by_user_id`
 * = the creator (both arms of the assembler's owner predicate).
 */
function presetColumns(ownerId: number, creatorId = ownerId): Record<string, unknown> {
	return {
		string: { dd624: [{ id: 1, lang: 'lg-nolan', value: `zzsb preset of ${ownerId}` }] },
		relation: {
			[PRESET_OWNER_COMPONENT]: [locator(PRESET_OWNER_COMPONENT, USERS_SECTION, ownerId)],
		},
		data: {
			label: 'zzsb preset',
			section_id: null,
			section_tipo: TEMP_PRESET_SECTION,
			diffusion_info: null,
			created_by_user_id: creatorId,
		},
	};
}

function clearCaches(): void {
	clearPrincipalCache();
	clearUserProjectsCache();
	clearPermissionsCache();
	invalidateAllToolCaches();
}

/** Mint the fixture. Idempotent: a crashed previous run's rows are swept first. */
export async function installScopeBindingFixture(): Promise<void> {
	await assertTestDatabase('installScopeBindingFixture');
	assertScratchIds();
	const tools = await grantedToolLocators();
	await purge({ strict: false });

	await insertScratchRecord('matrix_profiles', PROFILES_SECTION, SB_PROFILE_A, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'zzsb profile A' }] },
		relation: { dd1067: tools },
		misc: {
			dd774: [
				grant(1, SB_GRANTED_SECTION, SB_GRANTED_SECTION, 2),
				grant(2, SB_GRANTED_SECTION, SB_GRANTED_COMPONENT, 2),
				grant(3, SB_GRANTED_SECTION, SB_MEDIA_COMPONENT, 2),
				grant(4, SB_GRANTED_SECTION, SB_HOP_COMPONENT, 2),
			],
		},
	});
	await insertScratchRecord('matrix_profiles', PROFILES_SECTION, SB_PROFILE_B, {
		string: { dd237: [{ id: 1, lang: 'lg-eng', value: 'zzsb profile B' }] },
		relation: { dd1067: tools },
		misc: {
			dd774: [
				grant(1, SB_HIERARCHY_SECTION, SB_HIERARCHY_SECTION, 2),
				grant(2, SB_GRANTED_SECTION, SB_GRANTED_SECTION, 2),
				grant(3, SB_GRANTED_SECTION, SB_GRANTED_COMPONENT, 2),
				grant(4, SB_GRANTED_SECTION, SB_MEDIA_COMPONENT, 2),
				grant(7, SB_GRANTED_SECTION, SB_HOP_COMPONENT, 2),
				grant(5, SB_DENIED_SECTION, SB_DENIED_SECTION, 1),
				grant(6, SB_DENIED_SECTION, SB_GRANTED_COMPONENT, 1),
			],
		},
	});
	await insertScratchRecord('matrix_projects', PROJECTS_SECTION, SB_PROJECT_OF_A, projectColumns());
	await insertScratchRecord(
		'matrix_users',
		USERS_SECTION,
		SB_USER_A,
		userColumns('zzsb_a', SB_PROFILE_A, SB_PROJECT_OF_A),
	);
	await insertScratchRecord(
		'matrix_users',
		USERS_SECTION,
		SB_USER_B,
		userColumns('zzsb_b', SB_PROFILE_B, config.features.defaultProject),
	);
	await insertScratchRecord(
		'matrix_hierarchy_main',
		SB_HIERARCHY_SECTION,
		SB_HIERARCHY_ID,
		hierarchyColumns(),
	);
	await insertScratchRecord(
		'matrix_list',
		TEMP_PRESET_SECTION,
		SB_PRESET_OF_A,
		presetColumns(SB_USER_A),
	);
	await insertScratchRecord(
		'matrix_list',
		TEMP_PRESET_SECTION,
		SB_PRESET_OF_B,
		presetColumns(SB_USER_B),
	);
	await insertScratchRecord(
		'matrix_list',
		TEMP_PRESET_SECTION,
		SB_PRESET_SPLIT,
		presetColumns(SB_USER_A, SB_USER_B),
	);

	clearCaches();
}

/** Sweep every record this fixture owns plus its TM rows; strict on the matrix rows. */
export async function removeScopeBindingFixture(): Promise<void> {
	await assertTestDatabase('removeScopeBindingFixture');
	await purge({ strict: true });
	clearCaches();
}

async function purge(options: { strict: boolean }): Promise<void> {
	assertScratchIds();
	const missing: string[] = [];
	for (const record of OWNED_RECORDS) {
		const removed = await deleteMatrixRecord(record.table, record.sectionTipo, record.sectionId);
		if (removed === 0) missing.push(`${record.table}/${record.sectionTipo}/${record.sectionId}`);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[record.sectionTipo, record.sectionId],
		);
	}
	if (options.strict && missing.length > 0) {
		throw new Error(
			`scope_binding_fixture: sweep deleted 0 rows for ${missing.join(', ')} — the filter is wrong, or the rows were never written`,
		);
	}
}
