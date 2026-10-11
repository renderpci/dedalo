/**
 * READ-1 — THE PROJECTS PICKER FOLLOWS THE CALLER'S CURRENT MEMBERSHIP.
 *
 * `getUserAuthorizedProjects` (relations/filter_projects.ts) caches the
 * authorized dd153 projection per projects-scope + data lang. The finding: the
 * non-admin scope was keyed by the USER (`u<userId>`), not by the user's
 * PROJECT SET, while the value was filtered by that set. A dd170 change on the
 * user record evicts the per-user `getUserProjects` cache (permissions.ts, the
 * dd128 save channel) but never this one — so a revoked project stayed in the
 * picker (and its label stayed resolvable in list mode) until an unrelated
 * eviction, and a newly granted one stayed invisible.
 *
 * THE OUTCOME PINNED (never the key spelling): after a dd170 write through the
 * REAL save door (`saveComponentData` as an admin — no cache-clear helper is
 * called between the steps), the reader's datalist and list value equal its NEW
 * membership exactly, in both directions (revoke, then re-grant), and the
 * global admin still sees the whole catalog.
 *
 * TWO PATHS, one mechanism (the key IS the membership set — there is no dd128
 * listener on the picker cache; tripwire-or-delete):
 *   - the save door: a dd128 write evicts the per-user `getUserProjects` cache
 *     (permissions.ts), and the next read keys a fresh entry;
 *   - a membership change this process never hears of (another worker, a
 *     direct write; the per-user dd170 cache is then evicted only by its TTL
 *     backstop): dd170 is rewritten by direct SQL on the suite DB and ONLY the
 *     per-user membership cache is evicted (what the TTL does), the picker cache
 *     is left alone. A per-user key serves the stale projection here.
 *
 * PLUS the pure seam: `projectsScopeKey` normalises (order, duplicates, numeric
 * strings), and `buildAuthorizedProjects(scope, lang)` is a pure function of its
 * arguments (same deep-frozen answer under two principals and outside any
 * request) that agrees with the in-request picker.
 *
 * Situation: the ACL identity fixture (reader 930002, dd170 = [930021]) plus
 * the suite projects fixture (930031) — both explicit-id scratch records on the
 * suite DB, swept after. dd170 is restored in `finally`.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import * as filterProjects from '../../src/core/relations/filter_projects.ts';
import { getFilterDatalist, getFilterListValue } from '../../src/core/relations/filter_projects.ts';
import { currentDataLang } from '../../src/core/resolve/request_lang.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import {
	clearUserProjectsCache,
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
	ACL_NON_ADMIN_USER_ID,
	ACL_PROJECT_ID,
	clearAclIdentityCaches,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const USERS_SECTION = 'dd128';
const PROJECTS_SECTION = 'dd153';
/** dd170 — the user's projects (component_filter_master). */
const USER_PROJECTS_TIPO = 'dd170';

function asPrincipal<T>(principal: Principal, fn: () => Promise<T>): Promise<T> {
	return runWithRequestContext(
		{ principal, session: null, requestId: 'filter_projects_membership', clientIp: '127.0.0.1' },
		fn,
	);
}

/** The reader's datalist ids, sorted — the picker's visible option set. */
async function readerIds(reader: Principal): Promise<number[]> {
	const items = await asPrincipal(reader, () => getFilterDatalist());
	return items.map((item) => item.section_id).sort((a, b) => a - b);
}

/** Write dd170 on the reader through the REAL save door, as the admin. */
async function setReaderProjects(admin: Principal, projectIds: number[]): Promise<void> {
	const outcome = await asPrincipal(admin, () =>
		saveComponentData({
			componentTipo: USER_PROJECTS_TIPO,
			sectionTipo: USERS_SECTION,
			sectionId: ACL_NON_ADMIN_USER_ID,
			lang: 'lg-nolan',
			changedData: [
				{
					action: 'set_data',
					value: projectIds.map((id) => ({
						type: 'dd151',
						section_tipo: PROJECTS_SECTION,
						section_id: id,
						from_component_tipo: USER_PROJECTS_TIPO,
					})),
				},
			],
			userId: admin.userId,
		}),
	);
	expect(outcome.ok).toBe(true);
}

/**
 * Rewrite the reader's dd170 BEHIND the engine's back (direct SQL on the suite
 * DB — no section-data event, so no listener runs), then evict only what the
 * PERMISSIONS_CACHE_TTL backstop evicts: the per-user membership cache.
 */
async function setReaderProjectsUnheard(projectIds: number[]): Promise<void> {
	await assertTestDatabase('filter_projects_membership_native');
	const locators = projectIds.map((id) => ({
		type: 'dd151',
		section_tipo: PROJECTS_SECTION,
		section_id: id,
		from_component_tipo: USER_PROJECTS_TIPO,
	}));
	await sql.unsafe(
		`UPDATE matrix_users SET relation = jsonb_set(coalesce(relation, '{}'::jsonb), '{${USER_PROJECTS_TIPO}}', $1::text::jsonb)
		 WHERE section_tipo = $2 AND section_id = $3`,
		[JSON.stringify(locators), USERS_SECTION, ACL_NON_ADMIN_USER_ID],
	);
	clearUserProjectsCache(ACL_NON_ADMIN_USER_ID);
}

describe.if(DB_READY)('READ-1 — the projects picker follows dd170 membership', () => {
	let admin: Principal;
	let reader: Principal;

	beforeAll(async () => {
		await installAclIdentityFixture();
		await ensureSuiteProjectsFixture();
		admin = await resolvePrincipal(ACL_ADMIN_USER_ID);
		reader = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
	});

	afterAll(async () => {
		await removeSuiteProjectsFixture();
		await removeAclIdentityFixture();
	});

	test('revoke and re-grant through the save door: the reader sees exactly its new set', async () => {
		// Non-degeneracy: the identities are what the fixture claims.
		expect(admin.isGlobalAdmin).toBe(true);
		expect(reader.isGlobalAdmin).toBe(false);
		try {
			// 1 — warm the cache with the original membership.
			expect(await readerIds(reader)).toEqual([ACL_PROJECT_ID]);
			const warmLabels = await asPrincipal(reader, () =>
				getFilterListValue([{ section_tipo: PROJECTS_SECTION, section_id: ACL_PROJECT_ID }]),
			);
			expect(warmLabels.length).toBe(1);

			// 2 — revoke 930021, grant 930031 (no cache helper called).
			await setReaderProjects(admin, [SUITE_SECOND_PROJECT_ID]);

			// The membership itself DID change (the per-user dd170 cache is evicted
			// by the dd128 save channel) — so a stale picker below is the picker's
			// own cache, not a write that never landed.
			expect(await getUserProjects(ACL_NON_ADMIN_USER_ID)).toEqual([SUITE_SECOND_PROJECT_ID]);

			// 3 — the picker follows: the revoked project is gone, the new one shows.
			expect(await readerIds(reader)).toEqual([SUITE_SECOND_PROJECT_ID]);
			const revokedLabels = await asPrincipal(reader, () =>
				getFilterListValue([{ section_tipo: PROJECTS_SECTION, section_id: ACL_PROJECT_ID }]),
			);
			expect(revokedLabels).toEqual([]);

			// 4 — re-grant the original: back to exactly it.
			await setReaderProjects(admin, [ACL_PROJECT_ID]);
			expect(await readerIds(reader)).toEqual([ACL_PROJECT_ID]);

			// 5 — the admin keeps the full catalog (both scratch projects among it).
			const adminIds = (await asPrincipal(admin, () => getFilterDatalist())).map(
				(item) => item.section_id,
			);
			expect(adminIds).toContain(ACL_PROJECT_ID);
			expect(adminIds).toContain(SUITE_SECOND_PROJECT_ID);
			expect(adminIds.length).toBeGreaterThan(2);
		} finally {
			await setReaderProjects(admin, [ACL_PROJECT_ID]).catch(() => undefined);
			clearAclIdentityCaches();
		}
	});

	test('a membership change this process never heard of is followed (the key IS the set)', async () => {
		try {
			// 1 — warm the picker cache with the original membership.
			expect(await readerIds(reader)).toEqual([ACL_PROJECT_ID]);

			// 2 — dd170 changes unheard: no dd128 event, the picker cache untouched.
			await setReaderProjectsUnheard([SUITE_SECOND_PROJECT_ID]);
			expect(await getUserProjects(ACL_NON_ADMIN_USER_ID)).toEqual([SUITE_SECOND_PROJECT_ID]);

			// 3 — the picker follows the set, both in the datalist and list mode.
			expect(await readerIds(reader)).toEqual([SUITE_SECOND_PROJECT_ID]);
			expect(
				await asPrincipal(reader, () =>
					getFilterListValue([{ section_tipo: PROJECTS_SECTION, section_id: ACL_PROJECT_ID }]),
				),
			).toEqual([]);

			// 4 — and back, still unheard.
			await setReaderProjectsUnheard([ACL_PROJECT_ID]);
			expect(await readerIds(reader)).toEqual([ACL_PROJECT_ID]);
		} finally {
			await setReaderProjects(admin, [ACL_PROJECT_ID]).catch(() => undefined);
			clearAclIdentityCaches();
		}
	});
});

/**
 * The scope/key/builder seam (READ-1 final design). Reached through the module
 * NAMESPACE, never named imports: a missing export must fail an assertion here,
 * not unlink the whole file (so the gate is red for the finding, pre-fix).
 *
 *   ProjectsScope = {kind:'all'} | {kind:'set'; ids: readonly number[]}
 *   resolveProjectsScope(principal)      — the one constructor
 *   projectsScopeKey(scope, lang)        — reads ONLY the scope
 *   buildAuthorizedProjects(scope, lang) — PURE: no request context
 */
type ProjectsScope = { kind: 'all' } | { kind: 'set'; ids: readonly (number | string)[] };
type ScopeApi = {
	projectsScopeKey?: (scope: ProjectsScope, lang: string) => string;
	resolveProjectsScope?: (principal: Principal) => Promise<ProjectsScope>;
	buildAuthorizedProjects?: (scope: ProjectsScope, lang: string) => Promise<readonly unknown[]>;
};
const scopeApi = filterProjects as unknown as ScopeApi;
const setScope = (...ids: (number | string)[]): ProjectsScope => ({ kind: 'set', ids });
const ALL: ProjectsScope = { kind: 'all' };

describe('READ-1 — projectsScopeKey (pure)', () => {
	test('is exported', () => {
		expect(typeof scopeApi.projectsScopeKey).toBe('function');
	});

	test('keys by the SET: order, duplicates and numeric strings do not matter; lang separates', () => {
		const key = scopeApi.projectsScopeKey as NonNullable<ScopeApi['projectsScopeKey']>;
		expect(key(setScope(3, 1, 2), 'lg-eng')).toBe(key(setScope(1, 2, 3), 'lg-eng'));
		expect(key(setScope(2, 1, 2), 'lg-eng')).toBe(key(setScope(1, 2), 'lg-eng'));
		expect(key(setScope('2', 1), 'lg-eng')).toBe(key(setScope(1, 2), 'lg-eng'));
		expect(key(setScope(1, 2), 'lg-eng')).not.toBe(key(setScope(1, 3), 'lg-eng'));
		expect(key(setScope(1, 2), 'lg-eng')).not.toBe(key(setScope(1, 2), 'lg-spa'));
		expect(key(setScope(12), 'lg-eng')).not.toBe(key(setScope(1, 2), 'lg-eng'));
	});

	test('the empty set and the admin (all) scope are distinct from each other and from a set', () => {
		const key = scopeApi.projectsScopeKey as NonNullable<ScopeApi['projectsScopeKey']>;
		expect(key(setScope(), 'lg-eng')).toBe(key(setScope(), 'lg-eng'));
		expect(key(setScope(), 'lg-eng')).not.toBe(key(ALL, 'lg-eng'));
		expect(key(setScope(2, 1), 'lg-eng')).not.toBe(key(ALL, 'lg-eng'));
		expect(key(setScope(2, 1), 'lg-eng')).not.toBe(key(setScope(), 'lg-eng'));
		expect(key(ALL, 'lg-eng')).not.toBe(key(ALL, 'lg-spa'));
	});
});

/** Deep-frozen: the value and every nested object (cached entries are shared). */
function expectDeepFrozen(value: unknown, path = 'value'): void {
	if (value === null || typeof value !== 'object') return;
	if (!Object.isFrozen(value)) throw new Error(`${path} is not frozen`);
	for (const [key, child] of Object.entries(value)) expectDeepFrozen(child, `${path}.${key}`);
}

describe.if(DB_READY)('READ-1 — the value is a pure function of (scope, lang)', () => {
	let admin: Principal;
	let reader: Principal;

	beforeAll(async () => {
		await installAclIdentityFixture();
		await ensureSuiteProjectsFixture();
		admin = await resolvePrincipal(ACL_ADMIN_USER_ID);
		reader = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
	});

	afterAll(async () => {
		await removeSuiteProjectsFixture();
		await removeAclIdentityFixture();
	});

	test('builder: same answer under two principals and outside any request, frozen, equal to the in-request picker', async () => {
		expect(typeof scopeApi.resolveProjectsScope).toBe('function');
		expect(typeof scopeApi.buildAuthorizedProjects).toBe('function');
		const resolveScope = scopeApi.resolveProjectsScope as NonNullable<
			ScopeApi['resolveProjectsScope']
		>;
		const build = scopeApi.buildAuthorizedProjects as NonNullable<
			ScopeApi['buildAuthorizedProjects']
		>;
		const key = scopeApi.projectsScopeKey as NonNullable<ScopeApi['projectsScopeKey']>;
		try {
			// The reader's membership: BOTH scratch projects.
			await setReaderProjects(admin, [ACL_PROJECT_ID, SUITE_SECOND_PROJECT_ID]);
			const expectedIds = [ACL_PROJECT_ID, SUITE_SECOND_PROJECT_ID].sort((a, b) => a - b);

			// The one constructor: normalised + frozen.
			const resolved = await resolveScope(reader);
			expect(resolved).toEqual({ kind: 'set', ids: expectedIds });
			expectDeepFrozen(resolved, 'scope');
			expect(await resolveScope(admin)).toEqual({ kind: 'all' });

			// The in-request answer (the cached door) under the reader.
			const lang = await asPrincipal(reader, async () => currentDataLang());
			const inRequest = (await asPrincipal(reader, () =>
				filterProjects.getUserAuthorizedProjects(),
			)) as readonly { locator: { section_id: number } }[];
			expect(inRequest.map((p) => p.locator.section_id).sort((a, b) => a - b)).toEqual(expectedIds);
			expectDeepFrozen(inRequest, 'cached');

			// A scope carrying a NUMERIC STRING id + a duplicate: key and value must
			// both come from the same normalisation (the WIP keyed Number(id) but
			// filtered the raw set — the string id would vanish from the value).
			const raw = setScope(String(SUITE_SECOND_PROJECT_ID), ACL_PROJECT_ID, ACL_PROJECT_ID);
			expect(key(raw, lang)).toBe(key(resolved, lang));

			const underAdmin = await asPrincipal(admin, () => build(raw, lang));
			const underReader = await asPrincipal(reader, () => build(raw, lang));
			const outside = await build(raw, lang);

			expect(outside).toEqual(inRequest);
			expect(underAdmin).toEqual(outside);
			expect(underReader).toEqual(outside);
			expectDeepFrozen(outside, 'built');
		} finally {
			await setReaderProjects(admin, [ACL_PROJECT_ID]).catch(() => undefined);
			clearAclIdentityCaches();
		}
	});
});
