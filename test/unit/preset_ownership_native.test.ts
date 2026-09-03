/**
 * GATE (behavioural, suite DB) — a dd655 editing preset is READABLE and
 * WRITABLE by its OWNER only (audit 2026-08-26 P1-24 / CARRY-07 / TOOLS-03).
 *
 * `getPermissions` answers 2 on dd655 for EVERY principal (the rule that lets
 * each user keep one transient editing preset per section), dd655 lives in
 * matrix_list (projects-exempt), and the owner condition used to be built by
 * the CLIENT inside its own SQO with no server module re-imposing it — so any
 * user could list, read, rewrite or delete any other user's preset by id
 * (measured on the application database: 80 rows, three owners, all mutually
 * reachable). The fix is ONE predicate in the search assembler
 * (buildPresetOwnerFilter), so the list, the count, every UNION branch,
 * isRecordInScope and therefore the save/delete doors inherit it at once.
 *
 * Two scratch users, each with their own dd655 row
 * (test/helpers/scope_binding_fixture.ts). Every negative carries its positive
 * control (the owner still lists, reads and saves); the admin is unchanged.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import { dispatchRqo } from '../../src/core/api/dispatch.ts';
import { sanitizeClientSqo } from '../../src/core/concepts/sqo.ts';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import {
	getPermissions,
	type Principal,
	resolvePrincipal,
	TEMP_PRESET_SECTION,
} from '../../src/core/security/permissions.ts';
import { isRecordInScope, principalCanAccessRecord } from '../../src/core/security/record_scope.ts';
import { createSession, getSession } from '../../src/core/security/session_store.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import {
	installScopeBindingFixture,
	removeScopeBindingFixture,
	SB_GRANTED_SECTION,
	SB_HOP_COMPONENT,
	SB_PRESET_OF_A,
	SB_PRESET_OF_B,
	SB_PRESET_SPLIT,
	SB_PROJECT_OF_A,
	SB_USER_A,
	SB_USER_B,
} from '../helpers/scope_binding_fixture.ts';

/** dd624 — the preset's name (component_input_text): the value the save writes. */
const PRESET_NAME_COMPONENT = 'dd624';

let A: Principal;
let B: Principal;
/**
 * A test3 record of A's whose portal (test80) points at BOTH presets — the
 * main record of the frontier-hop probe. Inside A's scope (A's project is
 * stamped on it; test3 is the birth-defaults sentinel, so the probe stamps it).
 */
let hopHostOfA = 0;

/** A dd151 locator into dd655 as a portal stores it. */
const presetLocator = (id: number, sectionId: number) => ({
	id,
	type: 'dd151',
	section_id: sectionId,
	section_tipo: TEMP_PRESET_SECTION,
	from_component_tipo: SB_HOP_COMPONENT,
});

/**
 * The main-record ids a PATH search answers with for `principal`: test3 records
 * whose test80 portal reaches a dd655 row whose dd624 name matches `q`. The hop
 * INTO dd655 is where the frontier predicate must apply the owner rule.
 */
async function hostsReachingPresetNamed(principal: Principal, q: string): Promise<number[]> {
	const sqo = sanitizeClientSqo({
		section_tipo: [SB_GRANTED_SECTION],
		limit: 50,
		offset: 0,
		filter: {
			$and: [
				{
					q,
					path: [
						{ section_tipo: SB_GRANTED_SECTION, component_tipo: SB_HOP_COMPONENT },
						{ section_tipo: TEMP_PRESET_SECTION, component_tipo: PRESET_NAME_COMPONENT },
					],
				},
			],
		},
	} as never);
	const built = await buildSearchSql(sqo, { principal });
	const rows = (await sql.unsafe(built.sql, built.params as (string | number | null)[])) as {
		section_id: number;
	}[];
	return rows.map((row) => Number(row.section_id));
}

/** The ids a principal's dd655 LIST answers with. */
async function visiblePresetIds(
	principal: Principal,
	sections = [TEMP_PRESET_SECTION],
): Promise<number[]> {
	const sqo = sanitizeClientSqo({ section_tipo: sections, limit: 1000, offset: 0 });
	const built = await buildSearchSql(sqo, { principal });
	const rows = (await sql.unsafe(built.sql, built.params as (string | number | null)[])) as {
		section_tipo: string;
		section_id: number;
	}[];
	return rows
		.filter((row) => row.section_tipo === TEMP_PRESET_SECTION)
		.map((row) => row.section_id);
}

/** A REAL dd_core_api save on one preset row, as `principal`, through dispatchRqo. */
async function savePresetName(principal: Principal, sectionId: number, value: string) {
	const token = createSession(
		principal.userId,
		`zzsb_${principal.userId}`,
		principal.isGlobalAdmin,
	);
	const session = getSession(token);
	return dispatchRqo(
		{
			action: 'save',
			dd_api: 'dd_core_api',
			source: {
				model: 'component_input_text',
				tipo: PRESET_NAME_COMPONENT,
				section_tipo: TEMP_PRESET_SECTION,
				section_id: sectionId,
				lang: 'lg-nolan',
			},
			data: {
				changed_data: [{ action: 'set_data', id: null, value: [{ value, lang: 'lg-nolan' }] }],
			},
		} as never,
		{
			requestId: 'preset-ownership',
			clientIp: '127.0.0.1',
			session,
			csrfCandidate: session?.csrfToken ?? null,
			principal,
		} as never,
	);
}

describe.if(DB_READY)('preset_ownership — a dd655 row belongs to its owner', () => {
	beforeAll(async () => {
		await installScopeBindingFixture();
		A = await resolvePrincipal(SB_USER_A);
		B = await resolvePrincipal(SB_USER_B);
		hopHostOfA = await createSectionRecord(SB_GRANTED_SECTION, SB_USER_A);
		await sql.unsafe(
			`UPDATE matrix_test SET relation = coalesce(relation, '{}'::jsonb) || $3::text::jsonb
			 WHERE section_tipo = $1 AND section_id = $2`,
			[
				SB_GRANTED_SECTION,
				hopHostOfA,
				encodeForJsonb({
					test101: [
						{
							id: 1,
							type: 'dd675',
							section_id: SB_PROJECT_OF_A,
							section_tipo: config.features.filterSectionTipo,
							from_component_tipo: 'test101',
						},
					],
					[SB_HOP_COMPONENT]: [presetLocator(1, SB_PRESET_OF_A), presetLocator(2, SB_PRESET_OF_B)],
				}),
			],
		);
	});
	afterAll(async () => {
		if (hopHostOfA > 0) await deleteSectionRecord(SB_GRANTED_SECTION, hopHostOfA, -1);
		await removeScopeBindingFixture();
	});

	test('the blanket rule still holds: every principal resolves level 2 on dd655', async () => {
		// Bounded by ownership below — NOT removed: each user keeps their own
		// editing preset without an install-wide grant.
		expect(await getPermissions(A, TEMP_PRESET_SECTION, TEMP_PRESET_SECTION)).toBe(2);
		expect(await getPermissions(B, TEMP_PRESET_SECTION, TEMP_PRESET_SECTION)).toBe(2);
	});

	test("LIST: a non-owner's row is absent from the list; the owner's row is present", async () => {
		const seenByA = await visiblePresetIds(A);
		expect(seenByA).toContain(SB_PRESET_OF_A);
		expect(seenByA).not.toContain(SB_PRESET_OF_B);
		const seenByB = await visiblePresetIds(B);
		expect(seenByB).toContain(SB_PRESET_OF_B);
		expect(seenByB).not.toContain(SB_PRESET_OF_A);
	});

	test('BOTH arms reach on their own: the dd654 owner locator, and created_by_user_id', async () => {
		// The split row: dd654 → A, created_by → B. A reaches it through the
		// locator arm alone, B through the creator arm alone — so neither arm can
		// be dropped without one of these going red.
		expect(await visiblePresetIds(A)).toContain(SB_PRESET_SPLIT);
		expect(await visiblePresetIds(B)).toContain(SB_PRESET_SPLIT);
		expect(await isRecordInScope(TEMP_PRESET_SECTION, SB_PRESET_SPLIT, A)).toBe(true);
		expect(await isRecordInScope(TEMP_PRESET_SECTION, SB_PRESET_SPLIT, B)).toBe(true);
	});

	test('UNION: the predicate rides the multi-section branch too', async () => {
		// dd655 beside a projects-ungated test section: the dd655 branch is still
		// owner-narrowed (the exemption is per table; ownership is per section).
		const seenByA = await visiblePresetIds(A, [TEMP_PRESET_SECTION, 'test3']);
		expect(seenByA).toContain(SB_PRESET_OF_A);
		expect(seenByA).not.toContain(SB_PRESET_OF_B);
	});

	test("READ scope: isRecordInScope answers false for a non-owner's row, true for the owner's", async () => {
		expect(await isRecordInScope(TEMP_PRESET_SECTION, SB_PRESET_OF_B, A)).toBe(false);
		expect(await isRecordInScope(TEMP_PRESET_SECTION, SB_PRESET_OF_A, A)).toBe(true);
		expect(await isRecordInScope(TEMP_PRESET_SECTION, SB_PRESET_OF_A, B)).toBe(false);
	});

	test("FRONTIER HOP: a path search hopping INTO dd655 reaches the owner's row and NOT a stranger's", async () => {
		// The hop predicate is emitted into the join's ON clause (conform.ts
		// buildJoinChain ← sql_assembler buildPathScope → hopNeedsProjectsFilter).
		// dd655 lives in a projects-exempt table, so the OWNER-BOUND check must
		// come BEFORE the table exemption there too — otherwise every user's
		// presets are matchable by name from any record that links to them.
		const root = await resolvePrincipal(-1);
		// The situation is real: the admin reaches both presets through the hop.
		expect(await hostsReachingPresetNamed(root, `zzsb preset of ${SB_USER_B}`)).toEqual([
			hopHostOfA,
		]);
		expect(await hostsReachingPresetNamed(root, `zzsb preset of ${SB_USER_A}`)).toEqual([
			hopHostOfA,
		]);
		// A: their own preset is reachable through the hop (the positive control)…
		expect(await hostsReachingPresetNamed(A, `zzsb preset of ${SB_USER_A}`)).toEqual([hopHostOfA]);
		// …and B's is not, although A's own record links to it by locator: the
		// host that the admin's answer above proves reachable is absent for A.
		const throughStrangersPreset = await hostsReachingPresetNamed(A, `zzsb preset of ${SB_USER_B}`);
		expect(throughStrangersPreset).not.toContain(hopHostOfA);
		expect(throughStrangersPreset).toHaveLength(0);
	});

	test("SAVE through the real door: a non-owner's save is REFUSED, the owner's succeeds", async () => {
		const refused = await savePresetName(A, SB_PRESET_OF_B, 'hijacked');
		expect(refused.status).toBe(403);
		expect((refused.body as { error: { code: string } }).error.code).toBe('perm.out_of_scope');
		// Nothing was written: B's row still carries its fixture name.
		const [rowB] = (await sql.unsafe(
			`SELECT string->'${PRESET_NAME_COMPONENT}'->0->>'value' AS name FROM matrix_list WHERE section_tipo = $1 AND section_id = $2`,
			[TEMP_PRESET_SECTION, SB_PRESET_OF_B],
		)) as { name: string }[];
		expect(rowB?.name).toBe(`zzsb preset of ${SB_USER_B}`);
		// Positive control: the owner's save lands.
		const accepted = await savePresetName(A, SB_PRESET_OF_A, 'renamed by owner');
		expect(accepted.status).toBe(200);
		const [rowA] = (await sql.unsafe(
			`SELECT string->'${PRESET_NAME_COMPONENT}'->0->>'value' AS name FROM matrix_list WHERE section_tipo = $1 AND section_id = $2`,
			[TEMP_PRESET_SECTION, SB_PRESET_OF_A],
		)) as { name: string }[];
		expect(rowA?.name).toBe('renamed by owner');
	});

	test('a global admin is unchanged: both rows are in scope', async () => {
		const root = await resolvePrincipal(-1);
		expect(root.isGlobalAdmin).toBe(true);
		expect(await principalCanAccessRecord(TEMP_PRESET_SECTION, SB_PRESET_OF_A, root)).toBe(true);
		expect(await principalCanAccessRecord(TEMP_PRESET_SECTION, SB_PRESET_OF_B, root)).toBe(true);
		const seen = await visiblePresetIds(root);
		expect(seen).toContain(SB_PRESET_OF_A);
		expect(seen).toContain(SB_PRESET_OF_B);
	});
});
