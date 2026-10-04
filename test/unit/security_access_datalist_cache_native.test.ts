/**
 * component_security_access datalist CACHE gate (plan item 3, 2026-10-02).
 *
 * The ACL tree (~13k nodes) used to be rebuilt on every edit read with ~3
 * sequential queries per node (26k statements on the suite DB, 6–7 s on a real
 * install). resolve/security_access_datalist.ts now builds it from ONE
 * dd_ontology query and caches it per (application lang, deny list) and per
 * viewer granted-area set. This file pins:
 *
 *  1. COST — a cold build issues a SMALL CONSTANT number of statements (the
 *     snapshot + one per root area model + alias hops), never one per node;
 *     a warm read issues none; two concurrent cold reads share ONE build.
 *  2. CONTENT — warm === cold, deep-equal and frozen (a shared value).
 *  3. ISOLATION — per lang (labels follow the requested lang, same structure)
 *     and per user (each non-admin sees only their own granted areas; a
 *     concurrent interleave of two users × two langs answers each correctly).
 *  4. INVALIDATION — a REAL dd_ontology write (upsertDdOntologyNode) re-labels
 *     the next read; a profile write (the save-event channel production writes
 *     fire) drops the finished-datalist level and re-scopes the viewer.
 *
 * SCRATCH SURFACES ONLY: a `zzsacache` TLD section + component under the
 * `dd14` area (torn down with deleteTldNodes), two scratch profiles (dd234) and
 * two scratch users (dd128), deleted in afterAll with their TM rows.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { deleteTldNodes, upsertDdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import {
	deleteMatrixRecord,
	insertMatrixRecordWithCounter,
} from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { runWithQueryTap } from '../../src/core/db/query_tap.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import {
	getSecurityAccessDatalist,
	type SecurityAccessDatalistItem,
} from '../../src/core/resolve/security_access_datalist.ts';
import { fireSaveEvent } from '../../src/core/section_record/save_event.ts';
import {
	clearPermissionsCache,
	clearPrincipalCache,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const TLD = 'zzsacache';
const SECTION = `${TLD}1`;
const FIELD = `${TLD}2`;
/** A walked area of the suite ontology (dd1 → dd14) to hang the scratch section under. */
const HOST_AREA = 'dd14';
/** The other user's grant — the suite's playground section. */
const OTHER_SECTION = 'test3';

const PROFILES_TABLE = 'matrix_profiles';
const PROFILES_SECTION = 'dd234';
const USERS_TABLE = 'matrix_users';
const USERS_SECTION = 'dd128';
const RUN_TAG = `sacache_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * The cold-build statement budget: 1 snapshot + 10 root-model lookups
 * (MENU_ROOT_MODEL_ORDER) + the alias hops of the suite ontology, measured 11
 * on 2026-10-02 — against 26,059 before the cache. Generous headroom for a
 * few alias nodes, still four orders of magnitude below one-per-node.
 */
const COLD_STATEMENT_BUDGET = 40;

let profileOne = 0;
let profileTwo = 0;
let userOne = 0;
let userTwo = 0;
let principalOne: Principal;
let principalTwo: Principal;
const superuser = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;

function grants(...tipos: string[]) {
	return tipos.map((tipo, index) => ({ id: index + 1, tipo, section_tipo: tipo, value: 2 }));
}

async function insertUser(profileId: number): Promise<number> {
	return insertMatrixRecordWithCounter(USERS_TABLE, USERS_SECTION, {
		relation: {
			dd1725: [
				{
					id: 1,
					type: 'dd151',
					section_id: String(profileId),
					section_tipo: PROFILES_SECTION,
					from_component_tipo: 'dd1725',
				},
			],
		},
		data: { label: RUN_TAG, section_tipo: USERS_SECTION, created_by_user_id: -1 },
	});
}

async function cleanupRecord(table: string, sectionTipo: string, sectionId: number): Promise<void> {
	if (sectionId <= 0) return;
	await deleteMatrixRecord(table, sectionTipo, sectionId);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		sectionTipo,
		sectionId,
	]);
}

async function upsertScratchField(engLabel: string): Promise<void> {
	await upsertDdOntologyNode({
		tipo: FIELD,
		model: 'component_input_text',
		parent: SECTION,
		tld: TLD,
		term: { 'lg-eng': engLabel, 'lg-spa': 'Campo de la prueba de caché' },
	});
}

/** The datalist as `viewer`, in `lang` (an explicit request-lang scope, like a request). */
function datalistAs(viewer: Principal, lang: string) {
	return runWithRequestLangs({ applicationLang: lang, dataLang: lang }, () =>
		getSecurityAccessDatalist(viewer),
	);
}

/** The area-level rows (an area/section is its own section_tipo). */
function areaTipos(list: readonly SecurityAccessDatalistItem[]): Set<string> {
	return new Set(list.filter((item) => item.tipo === item.section_tipo).map((item) => item.tipo));
}

function labelOf(list: readonly SecurityAccessDatalistItem[], tipo: string): string | null {
	return list.find((item) => item.tipo === tipo)?.label ?? null;
}

beforeAll(async () => {
	await assertTestDatabase('security_access_datalist_cache_native');
	await deleteTldNodes(TLD);
	await upsertDdOntologyNode({
		tipo: SECTION,
		model: 'section',
		parent: HOST_AREA,
		tld: TLD,
		term: { 'lg-eng': 'Cache gate section', 'lg-spa': 'Sección de la prueba de caché' },
		relations: [{ tipo: 'test24' }],
	});
	await upsertScratchField('Cache gate field');

	profileOne = await insertMatrixRecordWithCounter(PROFILES_TABLE, PROFILES_SECTION, {
		misc: { dd774: grants(SECTION) },
		data: { label: RUN_TAG, section_tipo: PROFILES_SECTION },
	});
	profileTwo = await insertMatrixRecordWithCounter(PROFILES_TABLE, PROFILES_SECTION, {
		misc: { dd774: grants(OTHER_SECTION) },
		data: { label: RUN_TAG, section_tipo: PROFILES_SECTION },
	});
	userOne = await insertUser(profileOne);
	userTwo = await insertUser(profileTwo);
	// Raw inserts fire no save event — drop the per-user caches by hand.
	clearPermissionsCache();
	clearPrincipalCache();
	principalOne = await resolvePrincipal(userOne);
	principalTwo = await resolvePrincipal(userTwo);
}, 60000);

afterAll(async () => {
	await cleanupRecord(USERS_TABLE, USERS_SECTION, userOne);
	await cleanupRecord(USERS_TABLE, USERS_SECTION, userTwo);
	await cleanupRecord(PROFILES_TABLE, PROFILES_SECTION, profileOne);
	await cleanupRecord(PROFILES_TABLE, PROFILES_SECTION, profileTwo);
	clearPermissionsCache();
	clearPrincipalCache();
	await deleteTldNodes(TLD); // fires the hub — leaves no scratch cache state
}, 60000);

describe('cost: a cold build is a constant number of statements, a warm read none', () => {
	test('cold ≤ budget (not per node), warm = 0 statements, identical frozen content', async () => {
		await clearOntologyDerivedCaches();
		const startedAt = performance.now();
		const cold = await runWithQueryTap('sa cold', () => datalistAs(superuser, 'lg-eng'));
		const coldMs = performance.now() - startedAt;
		const warmStartedAt = performance.now();
		const warm = await runWithQueryTap('sa warm', () => datalistAs(superuser, 'lg-eng'));
		const warmMs = performance.now() - warmStartedAt;
		console.log(
			`[sa-cache] ${cold.result.length} items — cold ${coldMs.toFixed(0)} ms / ${cold.report.count} statements, warm ${warmMs.toFixed(1)} ms / ${warm.report.count}`,
		);

		// A tree of thousands of nodes …
		expect(cold.result.length).toBeGreaterThan(1000);
		// … built with a constant handful of statements.
		expect(cold.report.count).toBeGreaterThan(0);
		expect(cold.report.count).toBeLessThanOrEqual(COLD_STATEMENT_BUDGET);
		expect(warm.report.count).toBe(0);

		expect(warm.result).toEqual(cold.result);
		expect(warm.result).toBe(cold.result);
		expect(Object.isFrozen(warm.result)).toBe(true);
		expect(Object.isFrozen(warm.result[0])).toBe(true);
		expect(Object.isFrozen(warm.result[0]?.ar_parent)).toBe(true);
		// The scratch section and its field are in the admin tree.
		expect(labelOf(cold.result, FIELD)).toBe('Cache gate field');
	}, 60000);

	test('two concurrent cold reads share ONE build', async () => {
		await clearOntologyDerivedCaches();
		const single = await runWithQueryTap('sa single', () => datalistAs(superuser, 'lg-eng'));
		await clearOntologyDerivedCaches();
		const pair = await runWithQueryTap('sa pair', () =>
			Promise.all([datalistAs(superuser, 'lg-eng'), datalistAs(superuser, 'lg-eng')]),
		);
		expect(pair.report.count).toBe(single.report.count);
		expect(pair.result[0]).toBe(pair.result[1]);
	}, 60000);
});

describe('isolation per lang and per user', () => {
	test('labels follow the requested lang; the structure is the same', async () => {
		const english = await datalistAs(superuser, 'lg-eng');
		const spanish = await datalistAs(superuser, 'lg-spa');
		expect(labelOf(english, FIELD)).toBe('Cache gate field');
		expect(labelOf(spanish, FIELD)).toBe('Campo de la prueba de caché');
		expect(labelOf(english, SECTION)).toBe('Cache gate section');
		expect(labelOf(spanish, SECTION)).toBe('Sección de la prueba de caché');
		expect(spanish.map((item) => item.tipo)).toEqual(english.map((item) => item.tipo));
	}, 60000);

	test('each non-admin sees only their own granted areas, warm and interleaved', async () => {
		const one = await datalistAs(principalOne, 'lg-eng');
		const two = await datalistAs(principalTwo, 'lg-eng');
		expect([...areaTipos(one)]).toEqual([SECTION]);
		expect([...areaTipos(two)]).toEqual([OTHER_SECTION]);
		expect(labelOf(one, FIELD)).toBe('Cache gate field');
		expect(one.some((item) => item.section_tipo === OTHER_SECTION)).toBe(false);
		expect(two.some((item) => item.section_tipo === SECTION)).toBe(false);

		// Concurrent interleave: 2 users × 2 langs, plus the admin, all at once.
		const [oneEng, twoSpa, oneSpa, twoEng, admin] = await Promise.all([
			datalistAs(principalOne, 'lg-eng'),
			datalistAs(principalTwo, 'lg-spa'),
			datalistAs(principalOne, 'lg-spa'),
			datalistAs(principalTwo, 'lg-eng'),
			datalistAs(superuser, 'lg-spa'),
		]);
		expect(oneEng).toBe(one);
		expect(twoEng).toBe(two);
		expect([...areaTipos(oneSpa)]).toEqual([SECTION]);
		expect(labelOf(oneSpa, FIELD)).toBe('Campo de la prueba de caché');
		expect([...areaTipos(twoSpa)]).toEqual([OTHER_SECTION]);
		expect(areaTipos(admin).has(SECTION)).toBe(true);
		expect(areaTipos(admin).has(OTHER_SECTION)).toBe(true);
		expect(admin.length).toBeGreaterThan(oneSpa.length + twoSpa.length);
	}, 60000);
});

describe('invalidation', () => {
	test('a REAL dd_ontology write re-labels the next read', async () => {
		const before = await datalistAs(superuser, 'lg-eng');
		expect(labelOf(before, FIELD)).toBe('Cache gate field');
		await upsertScratchField('Cache gate field (renamed)');
		const after = await datalistAs(superuser, 'lg-eng');
		expect(after).not.toBe(before);
		expect(labelOf(after, FIELD)).toBe('Cache gate field (renamed)');
		const userView = await datalistAs(principalOne, 'lg-eng');
		expect(labelOf(userView, FIELD)).toBe('Cache gate field (renamed)');
	}, 60000);

	test('an ontology write DURING a cold build never leaves a pre-write datalist cached', async () => {
		await clearOntologyDerivedCaches();
		// The build reads its snapshot first; the write lands while it is in flight.
		const inFlight = datalistAs(superuser, 'lg-eng');
		await upsertScratchField('Cache gate field (written mid-build)');
		await inFlight;
		const next = await datalistAs(superuser, 'lg-eng');
		expect(labelOf(next, FIELD)).toBe('Cache gate field (written mid-build)');
	}, 60000);

	test('a profile write drops the finished datalists and re-scopes the viewer', async () => {
		const adminBefore = await datalistAs(superuser, 'lg-eng');
		const oneBefore = await datalistAs(principalOne, 'lg-eng');
		expect(areaTipos(oneBefore).has(OTHER_SECTION)).toBe(false);

		await sql.unsafe(
			`UPDATE ${PROFILES_TABLE} SET misc = jsonb_set(misc, '{dd774}', $1::text::jsonb)
			 WHERE section_tipo = $2 AND section_id = $3`,
			[JSON.stringify(grants(SECTION, OTHER_SECTION)), PROFILES_SECTION, profileOne],
		);
		// The event every persistent record write fires (save_event.ts).
		await fireSaveEvent(PROFILES_SECTION);

		const adminAfter = await datalistAs(superuser, 'lg-eng');
		expect(adminAfter).not.toBe(adminBefore);
		expect(adminAfter).toEqual(adminBefore);
		const oneAfter = await datalistAs(principalOne, 'lg-eng');
		expect([...areaTipos(oneAfter)].sort()).toEqual([SECTION, OTHER_SECTION].sort());
	}, 60000);
});
