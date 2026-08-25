/**
 * Phase 5b gate: permissions differential — the TS getPermissions() versus the
 * dd774 grant matrix, for a NON-ADMIN identity across a wide spread of
 * (section_tipo, component_tipo) pairs.
 *
 * This is a WHITE-BOX differential: TS getPermissions vs the raw dd774 matrix
 * (the source of truth the resolver reads) plus the hard-coded bypass rules.
 * It needs no oracle: the frozen store never held a get_permissions body, and
 * the matrix IS the specification.
 *
 * @twinned-by   test/unit/permissions_wildcard_deny.test.ts
 */
// GENERIC-TLD MIGRATED 2026-08-19 (WC-2026-08-19-test-tld-replay).
// The gate used to read the monedaiberica install's user 16 / profile 8 (148
// grants) — an identity no other database has, so the coverage floor below was
// unreachable everywhere else and the whole matrix half asserted nothing.
// It now BUILDS the situation it tests: a scratch non-admin user + profile in
// the reserved >= 900000 band, whose dd774 matrix is generated over the GENERIC
// `test`-TLD ontology at every one of the four levels, swept in afterAll. The
// dd*/dd64 tipos that stay are SEED-SHIPPED ontology every installation ships.
// Worked example for the identity shapes: test/helpers/acl_identity_fixture.ts
// (read, never edited — this gate needs a DIFFERENT, much wider grant matrix
// than that fixture's three rows, so it mints its own in its own id band).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo, getModelByTipo } from '../../src/core/ontology/resolver.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	clearUserProjectsCache,
	getPermissions,
	getSectionPermissions,
	PUBLIC_LIST_TABLES,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

/** A SEED-SHIPPED tipo, spelled out of the install-TLD census's token grammar. */
const seed = (tld: string, id: number): string => `${tld}${id}`;

// --- the scratch identity (band 931000-931999; the acl fixture owns 930xxx) --

const SCRATCH_ID_FLOOR = 900000;
const NON_ADMIN_USER = 931001;
const NON_ADMIN_PROFILE = 931011;

const USERS_SECTION = seed('dd', 128);
const PROFILES_SECTION = seed('dd', 234);
const YES_NO_SECTION = seed('dd', 64);
/** dd64 record ids: 1 = Yes, 2 = No. */
const YES = 1;
const NO = 2;

const OWNED_RECORDS = [
	{ table: 'matrix_users', sectionTipo: USERS_SECTION, sectionId: NON_ADMIN_USER },
	{ table: 'matrix_profiles', sectionTipo: PROFILES_SECTION, sectionId: NON_ADMIN_PROFILE },
];

/** The cloned object section this gate addresses for the bypass rules. */
const SECTION = 'testmint1';
/** One of its components (a clone of the install's mint-name input_text). */
const COMPONENT = 'testmint1002';
/** A component tipo NO profile ever grants (it is not an ontology node at all). */
const UNGRANTED_COMPONENT = 'testmint999999';

/**
 * How many (section, component) pairs the generated matrix must cover.
 *
 * The old floor was `checked > 50` against one install's 148-grant profile.
 * A BUILT matrix can do better than a floor: the gate asserts that EVERY grant
 * it wrote was checked (exact), and this constant is what makes that exact
 * number a real coverage statement rather than a technicality.
 */
const MATRIX_PAIRS = 60;

/** The four levels, cycled over the generated pairs so all of them are exercised. */
const LEVELS = [0, 1, 2, 3] as const;

interface Grant {
	id: number;
	tipo: string;
	section_tipo: string;
	value: number;
}

function locator(componentTipo: string, sectionTipo: string, sectionId: number) {
	return {
		id: 1,
		type: seed('dd', 151),
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
 * Build the grant matrix from the GENERIC ontology: every `test`-TLD section
 * with its own component children, in a stable order, one grant per pair with
 * the level cycling through all four.
 *
 * PLUS one deliberate zero-grant on a SEED-SHIPPED section that stores in a
 * PUBLIC_LIST table — the documented fallback branch (a stored 0 resolves to 1
 * there). It is asserted to have fired, so the branch cannot go unexercised.
 */
async function buildGrants(): Promise<{ grants: Grant[]; publicListSection: string }> {
	const rows = (await sql.unsafe(
		`SELECT s.tipo AS section_tipo, c.tipo AS component_tipo
		   FROM dd_ontology s
		   JOIN dd_ontology c ON c.parent = s.tipo
		  WHERE s.model = 'section' AND s.tipo LIKE 'test%' AND c.model LIKE 'component!_%' ESCAPE '!'
		  ORDER BY s.tipo, c.tipo
		  LIMIT $1`,
		[MATRIX_PAIRS],
	)) as { section_tipo: string; component_tipo: string }[];
	if (rows.length < MATRIX_PAIRS) {
		throw new Error(
			`permissions_differential: the generic ontology yielded ${rows.length} (section, component) pairs, fewer than the ${MATRIX_PAIRS} this gate grants over. The test ontology is not materialized — build the suite database with 'bun run test:db:setup'.`,
		);
	}
	const grants: Grant[] = rows.map((row, index) => ({
		id: index + 1,
		tipo: row.component_tipo,
		section_tipo: row.section_tipo,
		value: LEVELS[index % LEVELS.length] as number,
	}));
	// The public-list fallback case: dd64 (Yes/No) is seed-shipped and stores in
	// a PUBLIC_LIST table on every installation. VERIFIED below, never assumed.
	const publicListTable = await getMatrixTableFromTipo(YES_NO_SECTION);
	if (publicListTable === null || !PUBLIC_LIST_TABLES.has(publicListTable)) {
		throw new Error(
			`permissions_differential: ${YES_NO_SECTION} stores in '${String(publicListTable)}', which is not a PUBLIC_LIST table — the zero-grant fallback branch would never be exercised. Pick another seed-shipped list section.`,
		);
	}
	grants.push({
		id: grants.length + 1,
		tipo: YES_NO_SECTION,
		section_tipo: YES_NO_SECTION,
		value: 0,
	});
	return { grants, publicListSection: YES_NO_SECTION };
}

async function purge(strict: boolean): Promise<void> {
	for (const record of OWNED_RECORDS) {
		if (record.sectionId < SCRATCH_ID_FLOOR) {
			throw new Error(
				`permissions_differential: id ${record.sectionId} is below the scratch floor ${SCRATCH_ID_FLOOR} — refusing to touch an installed record`,
			);
		}
		const removed = await deleteMatrixRecord(record.table, record.sectionTipo, record.sectionId);
		if (strict && removed === 0) {
			throw new Error(
				`permissions_differential sweep removed 0 rows for ${record.table}/${record.sectionTipo}/${record.sectionId} — the scratch filter is wrong`,
			);
		}
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[record.sectionTipo, record.sectionId],
		);
	}
}

describe('permissions differential: TS vs dd774 matrix (Phase 5b gate)', () => {
	let grants: Grant[];
	let publicListSection: string;

	beforeAll(async () => {
		// This gate writes USERS and PROFILES rows — the identity tables of an
		// installation. The database must say it is disposable first.
		await assertTestDatabase('permissions_differential');
		await purge(false); // a crashed previous run leaves rows; sweep leniently
		({ grants, publicListSection } = await buildGrants());
		await insertScratchRecord('matrix_profiles', PROFILES_SECTION, NON_ADMIN_PROFILE, {
			string: { [seed('dd', 237)]: [{ id: 1, lang: 'lg-eng', value: 'zzperm reader profile' }] },
			misc: { [seed('dd', 774)]: grants },
		});
		await insertScratchRecord('matrix_users', USERS_SECTION, NON_ADMIN_USER, {
			string: { [seed('dd', 132)]: [{ id: 1, lang: 'lg-nolan', value: 'zzperm_reader' }] },
			relation: {
				// dd244 PRESENT but "No" — a present-but-negative flag catches a
				// reader that tested `!== null` instead of `=== 1`.
				[seed('dd', 131)]: [locator(seed('dd', 131), YES_NO_SECTION, YES)],
				[seed('dd', 244)]: [locator(seed('dd', 244), YES_NO_SECTION, NO)],
				[seed('dd', 515)]: [locator(seed('dd', 515), YES_NO_SECTION, NO)],
				[seed('dd', 1725)]: [locator(seed('dd', 1725), PROFILES_SECTION, NON_ADMIN_PROFILE)],
			},
		});
		clearPrincipalCache();
		clearUserProjectsCache();
		clearPermissionsCache();
	});

	afterAll(async () => {
		await purge(true);
		clearPrincipalCache();
		clearUserProjectsCache();
		clearPermissionsCache();
	});

	test('resolvePrincipal marks the scratch user as a non-admin, non-developer', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		expect(principal.isGlobalAdmin).toBe(false);
		expect(principal.isDeveloper).toBe(false);
	});

	test('every matrix grant resolves to exactly its stored level', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		// Sample across all four levels; skip bypass-shadowed keys.
		const bypassed = new Set([seed('dd', 15), seed('dd', 1324), seed('dd', 655)]);
		let checked = 0;
		let zeroChecked = 0;
		let fallbackChecked = 0;
		const levelsSeen = new Set<number>();
		for (const grant of grants) {
			if (bypassed.has(grant.section_tipo)) continue;
			const level = await getPermissions(principal, grant.section_tipo, grant.tipo);
			if (grant.value > 0) {
				expect(level).toBe(grant.value);
			} else {
				// EXACT zero-grant law (audit 2026-07-07: the former >= 0 was
				// vacuous — a denied grant resolving to 2/3 passed). A stored 0 is
				// exactly 0, UNLESS the documented public-list fallback applies
				// (parent is a 'section' model on a PUBLIC_LIST_TABLES table),
				// in which case it is exactly 1 — never anything else.
				const isSection = (await getModelByTipo(grant.section_tipo)) === 'section';
				const table = isSection ? await getMatrixTableFromTipo(grant.section_tipo) : null;
				const publicListFallback = table !== null && PUBLIC_LIST_TABLES.has(table);
				expect(level).toBe(publicListFallback ? 1 : 0);
				zeroChecked++;
				if (publicListFallback) fallbackChecked++;
			}
			levelsSeen.add(grant.value);
			checked++;
		}
		// EXACT coverage, not a floor: every grant this gate wrote was resolved,
		// at every one of the four levels, and the two zero-grant branches (plain
		// deny and public-list fallback) both really ran.
		expect(checked).toBe(grants.length);
		expect(checked).toBeGreaterThan(MATRIX_PAIRS - 1);
		expect([...levelsSeen].sort()).toEqual([...LEVELS]);
		expect(zeroChecked).toBeGreaterThan(0);
		expect(fallbackChecked).toBe(1);
		expect(publicListSection).toBe(YES_NO_SECTION);
	});

	test('a pair NOT in the matrix denies (level 0) unless a public-list fallback applies', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		// A component tipo the profile never grants on a non-list section.
		const level = await getPermissions(principal, SECTION, UNGRANTED_COMPONENT);
		expect(level).toBe(0);
	});

	test('hard-coded bypasses hold for the non-admin', async () => {
		const principal = await resolvePrincipal(NON_ADMIN_USER);
		// time machine → admin-only → 0 for non-admin
		expect(await getPermissions(principal, seed('dd', 15), 'anything')).toBe(0);
		// tools register → 1
		expect(await getPermissions(principal, seed('dd', 1324), 'x1')).toBe(1);
		// temp preset → 2
		expect(await getPermissions(principal, seed('dd', 655), 'x1')).toBe(2);
		// inverse relations / 'all' → 1
		expect(await getPermissions(principal, SECTION, 'all')).toBe(1);
		expect(await getPermissions(principal, SECTION, seed('dd', 1596))).toBe(1);
		// area maintenance → 0 (blocked for non-admin/non-dev)
		expect(await getPermissions(principal, 'x1', seed('dd', 88))).toBe(0);
	});

	test('superuser is always level 3', async () => {
		const superuser = await resolvePrincipal(-1);
		expect(superuser.isGlobalAdmin).toBe(true);
		expect(await getPermissions(superuser, SECTION, COMPONENT)).toBe(3);
		expect(await getPermissions(superuser, 'anything', 'anything')).toBe(3);
	});

	test('consultation-only cap lives ONLY in getSectionPermissions, never in getPermissions', async () => {
		const superuser = await resolvePrincipal(-1);
		// getPermissions mirrors PHP common::get_permissions — Activity is NOT
		// capped there (the cap is one layer up, section::get_section_permissions).
		expect(await getPermissions(superuser, seed('dd', 542), seed('dd', 542))).toBe(3);
		// getSectionPermissions IS the capped section-level perm (PHP :1929).
		expect(await getSectionPermissions(superuser, seed('dd', 542))).toBe(1);
		// A normal section is passed through unchanged by getSectionPermissions.
		expect(await getSectionPermissions(superuser, SECTION)).toBe(3);
	});
});
