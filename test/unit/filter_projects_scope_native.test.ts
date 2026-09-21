/**
 * AUTHZ-06 behaviourally — the two per-user narrowings the 2026-07-23 audit
 * named under one id, driven with a REAL non-admin and a REAL global admin:
 *
 *   (1) `getUserAuthorizedProjects` (src/core/relations/filter_projects.ts) —
 *       the component_filter PROJECTS datalist. Before the fix every
 *       authenticated non-admin got the full dd153 catalog: the datalist leaked
 *       every tenant's project names, order and parentage. The rule is
 *       `principal.isGlobalAdmin ? all : getUserProjects(principal.userId)`,
 *       intersected into the SELECT; unanchored ⇒ [] (ISO-01 polarity).
 *   (2) the component `get_data` facade (src/core/section/read_facade.ts) —
 *       it SELF-GATES on `ddoIsAuthorized(principal, section_tipo, tipo)` and
 *       answers the PHP empty shell for a component the caller holds level 0
 *       on, independent of the `read` handler's Gate A (the synthetic
 *       search_<n> path skips the record gate above it).
 *
 * WHY THIS FILE EXISTS (S-2 clause 4 / P0-15 — the SEC-01 lesson). Both
 * decisions were asserted in the tree ONLY as source substrings
 * (`security_audit_2026_07_23_tripwire`: `toContain('getUserProjects(principal.userId)')`,
 * `toMatch(/principal\.isGlobalAdmin\s*\?\s*null/)`,
 * `toMatch(/ddoIsAuthorized\(principal, source\.section_tipo, source\.tipo\)/)`),
 * and the only behavioural drives of (1) anchored a global admin. Measured: a
 * `|| true` on the allowed-ids filter — every non-admin sees every project,
 * spelling preserved — stayed green across the whole suite. This file is the
 * twin those pins are credited with in `authz_substring_gate_tripwire`.
 *
 * THE SITUATION IS BUILT, NOT BORROWED. The principals are the synthetic ACL
 * fixture's reader (dd170 → exactly ONE project, 930021; read = 1 on `test3`,
 * `test3.test92` = 1, `test3.test91` = 0) and its admin. A SECOND project
 * (`ensureSuiteProjectsFixture`, 930031) guarantees the catalog is wider than
 * the reader's set, so "narrowed" is a strict subset and never empty-vs-empty.
 * The `get_data` target is this file's OWN `test3` record (931601), carrying
 * the fixture project on `test101` so the reader passes the RECORD gate — the
 * granted component then answers data and the denied one the shell, and the
 * only difference between the two reads is the component's level.
 *
 * NOT HERMETIC: resolves the fixture principals through matrix_users /
 * matrix_profiles, reads matrix_projects, and mints/sweeps one matrix_test row.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	clearFilterProjectsCache,
	getFilterDatalist,
	getUserAuthorizedProjects,
} from '../../src/core/relations/filter_projects.ts';
import { routeSectionRead } from '../../src/core/section/read_facade.ts';
import {
	ddoIsAuthorized,
	getUserProjects,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { runWithRequestContext } from '../../src/core/security/request_context.ts';
import {
	ensureSuiteProjectsFixture,
	removeSuiteProjectsFixture,
	SUITE_SECOND_PROJECT_ID,
} from '../../src/core/test_data/projects_fixture.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import {
	ACL_ADMIN_USER_ID,
	ACL_DENIED_COMPONENT,
	ACL_GRANTED_COMPONENT,
	ACL_GRANTED_SECTION,
	ACL_NON_ADMIN_USER_ID,
	ACL_PROJECT_ID,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const SECTION = ACL_GRANTED_SECTION;
const SECTION_TABLE = 'matrix_test';
/** test3's `component_filter` — the per-record projects gate the reader passes. */
const FILTER_COMPONENT = 'test101';
const PROJECTS_SECTION = 'dd153';
/** dd64 — the yes/no list both test91 and test92 point into on a real record. */
const YES_NO_SECTION = 'dd64';
/**
 * This file's OWN scratch record. Isolation is the SUITE DATABASE and its
 * marker (asserted before the write), never an id band — a heritage section
 * may legitimately hold any id, so no range is "clear of genuine records".
 */
const SCRATCH_RECORD_ID = 931601;

const locator = (componentTipo: string, sectionTipo: string, sectionId: number) => ({
	id: 1,
	type: 'dd151',
	section_id: sectionId,
	section_tipo: sectionTipo,
	from_component_tipo: componentTipo,
});

async function installScratchRecord(): Promise<void> {
	await assertTestDatabase('filter_projects_scope_native');
	await removeScratchRecord({ strict: false });
	const relation = {
		[FILTER_COMPONENT]: [locator(FILTER_COMPONENT, PROJECTS_SECTION, ACL_PROJECT_ID)],
		[ACL_GRANTED_COMPONENT]: [locator(ACL_GRANTED_COMPONENT, YES_NO_SECTION, 1)],
		[ACL_DENIED_COMPONENT]: [locator(ACL_DENIED_COMPONENT, YES_NO_SECTION, 1)],
	};
	await sql.unsafe(
		`INSERT INTO "${SECTION_TABLE}" ("section_tipo", "section_id", "relation", "data")
		 VALUES ($1, $2, $3::text::jsonb, $4::text::jsonb)`,
		[
			SECTION,
			SCRATCH_RECORD_ID,
			encodeForJsonb(relation),
			encodeForJsonb({ label: 'zzfps01 filter projects scope', section_tipo: SECTION }),
		],
	);
}

async function removeScratchRecord({ strict = true }: { strict?: boolean } = {}): Promise<void> {
	const deleted = (await sql.unsafe(
		`DELETE FROM "${SECTION_TABLE}" WHERE section_tipo = $1 AND section_id = $2 RETURNING section_id`,
		[SECTION, SCRATCH_RECORD_ID],
	)) as unknown[];
	if (strict && deleted.length === 0) {
		throw new Error(
			`filter_projects_scope_native: the sweep deleted 0 rows for ${SECTION}/${SCRATCH_RECORD_ID} — the filter is wrong, so the suite database keeps scratch residue`,
		);
	}
}

/** Run `fn` anchored as `principal`, the way the authenticated dispatch path does. */
const as = <T>(principal: Principal, fn: () => Promise<T>): Promise<T> =>
	runWithRequestContext(
		{ principal, session: null, requestId: 'filter_projects_scope_native', clientIp: '127.0.0.1' },
		fn,
	);

const projectIds = (projects: { locator: { section_id: number } }[]): number[] =>
	projects.map((project) => project.locator.section_id).sort((a, b) => a - b);

/** One component `get_data` read of the scratch record, as `principal`. */
async function getDataRows(principal: Principal, componentTipo: string): Promise<unknown[]> {
	const rqo = {
		dd_api: 'dd_core_api',
		action: 'read',
		source: {
			action: 'get_data',
			tipo: componentTipo,
			section_tipo: SECTION,
			section_id: SCRATCH_RECORD_ID,
			lang: 'lg-nolan',
		},
	} as unknown as Parameters<typeof routeSectionRead>[0];
	const result = await as(principal, () => routeSectionRead(rqo, principal));
	expect(result.status).toBe(200);
	return (result.body as { data?: { data?: unknown[] } }).data?.data ?? [];
}

describe.if(DB_READY)(
	'AUTHZ-06 — per-user narrowing is decided by the principal, not spelled',
	() => {
		let reader: Principal;
		let admin: Principal;

		beforeAll(async () => {
			await installAclIdentityFixture();
			await ensureSuiteProjectsFixture();
			await installScratchRecord();
			reader = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
			admin = await resolvePrincipal(ACL_ADMIN_USER_ID);
			// The fixture project rows were minted by raw INSERT: drop any projection
			// another file in this process may have cached before they existed.
			clearFilterProjectsCache();
		});
		afterAll(async () => {
			await removeScratchRecord();
			await removeSuiteProjectsFixture();
			await removeAclIdentityFixture();
			clearFilterProjectsCache();
		});

		test('the contrast is non-degenerate: the reader holds ONE project, the catalog holds more', async () => {
			expect(reader.isGlobalAdmin).toBe(false);
			expect(admin.isGlobalAdmin).toBe(true);
			expect(await getUserProjects(reader.userId)).toEqual([ACL_PROJECT_ID]);
			// Two distinct projects exist, so "narrowed" below is a strict subset.
			expect(SUITE_SECOND_PROJECT_ID).not.toBe(ACL_PROJECT_ID);
			// The component pair: granted at read, denied at 0 — for the reader.
			expect(await ddoIsAuthorized(reader, SECTION, ACL_GRANTED_COMPONENT)).toBe(true);
			expect(await ddoIsAuthorized(reader, SECTION, ACL_DENIED_COMPONENT)).toBe(false);
		});

		test('(1) a non-admin gets EXACTLY their dd170 projects — the second project is withheld', async () => {
			const ids = projectIds(await as(reader, getUserAuthorizedProjects));
			expect(ids).toEqual([ACL_PROJECT_ID]);
			expect(ids).not.toContain(SUITE_SECOND_PROJECT_ID);
		});

		test('(1) CONTROL — a global admin keeps the full catalog, both projects included', async () => {
			const ids = projectIds(await as(admin, getUserAuthorizedProjects));
			expect(ids).toContain(ACL_PROJECT_ID);
			expect(ids).toContain(SUITE_SECOND_PROJECT_ID);
			// Strictly wider than the reader's, so the narrowing is not a blanket cut.
			expect(ids.length).toBeGreaterThan(1);
		});

		test('(1) the datalist DOOR itself — the option set that leaked — is the narrowed set', async () => {
			const options = await as(reader, getFilterDatalist);
			expect(options.map((option) => option.section_id)).toEqual([ACL_PROJECT_ID]);
			expect(options.every((option) => option.type === 'project')).toBe(true);
			const adminOptions = await as(admin, getFilterDatalist);
			expect(adminOptions.map((option) => option.section_id)).toContain(SUITE_SECOND_PROJECT_ID);
		});

		test('(1) an UNANCHORED call yields no projects at all (fail closed, never the catalog)', async () => {
			expect(await getUserAuthorizedProjects()).toEqual([]);
		});

		test('(2) get_data of a component the reader holds level 0 on answers the EMPTY shell', async () => {
			// The record itself is readable by the reader (the granted sibling proves
			// it two lines down), so the shell here is the COMPONENT gate's, not the
			// record gate's.
			expect(await getDataRows(reader, ACL_DENIED_COMPONENT)).toEqual([]);
		});

		test('(2) CONTROL — the granted sibling on the SAME record answers data to the reader', async () => {
			const rows = await getDataRows(reader, ACL_GRANTED_COMPONENT);
			expect(rows.length).toBeGreaterThan(0);
		});

		test('(2) the level is the matrix, not the role flag: the admin holds 0 on it too and gets the shell', async () => {
			expect(await ddoIsAuthorized(admin, SECTION, ACL_DENIED_COMPONENT)).toBe(false);
			expect(await getDataRows(admin, ACL_DENIED_COMPONENT)).toEqual([]);
			expect((await getDataRows(admin, ACL_GRANTED_COMPONENT)).length).toBeGreaterThan(0);
		});
	},
);
