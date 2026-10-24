/**
 * TIME MACHINE apply_value — every dataframe SLOT the restore WRITES needs the
 * caller's own write grant on it (cross-write:r2, review of
 * b095553e22..73ff5d88a4, S2 security-authz).
 *
 * THE DEFECT. apply_value's declarative gate ('tipo', level 2) authorizes the
 * (section, MAIN) pair only. The restore then rewrites — or empties — every
 * dataframe slot of that main (planRowFrames → applyDataframeRestore), and no
 * grant was asked for any slot: a profile with level 2 on the main and level 1
 * (read-only) on its slot rewrote the slot. The bulk door gated every slot it
 * writes; the single-row door was strictly weaker for the same write.
 *
 * THE OUTCOMES PINNED (one situation, the slot grant the only variable):
 *   - slot read-only, the restore CHANGES the slot → refused perm.*, the main
 *     AND the slot byte-unchanged (one transaction: nothing half-restored);
 *   - slot writable (CONTROL) → restored, main and frames;
 *   - slot read-only, the restore leaves the slot as it is (no frames then, no
 *     frames now) → restored: what is gated is what is WRITTEN, never a slot
 *     the restore does not touch;
 *   - MAIN read-only, the handler reached past the module gate → the handler's
 *     own write door refuses (defence in depth: the module gate reads the raw
 *     pair, the door the dd128-aware one).
 *
 * SITUATION: a `zztav` scratch TLD on `test1` (→ matrix_test): a section, a
 * portal MAIN with its dataframe SLOT. The non-admin is the ACL identity
 * fixture's; the section has no projects filter, so the record is in scope —
 * only the component grants differ. Everything is swept; the situation drop
 * asserts zero residue. assertTestDatabase before the first write.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { principalCanAccessRecord } from '../../src/core/security/record_scope.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { resolveDataframeSlotTipos } from '../../tools/tool_time_machine/server/dataframe_restore.ts';
import { toolTimeMachineApplyValue } from '../../tools/tool_time_machine/server/tool_time_machine.ts';
import {
	ACL_NON_ADMIN_PROFILE_ID,
	ACL_NON_ADMIN_USER_ID,
	clearAclIdentityCaches,
	installAclIdentityFixture,
	removeAclIdentityFixture,
} from '../helpers/acl_identity_fixture.ts';
import { countActivityRows, sweepActivityRows } from '../helpers/activity_rows.ts';
import { refusalOf } from '../helpers/refusal.ts';

const TLD = 'zztav';
const SECTION = `${TLD}1`;
const MAIN = `${TLD}2`;
const SLOT = `${TLD}3`;
const TABLE = 'matrix_test';

const SITUATION = situation({
	tld: TLD,
	name: 'tm_apply_value_slot_grant',
	nodes: [
		{ tipo: SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'Hosts' } },
		{
			tipo: MAIN,
			parent: SECTION,
			model: 'component_portal',
			term: { 'lg-eng': 'Main' },
			properties: {
				source: {
					request_config: [
						{
							sqo: { section_tipo: [{ value: [SECTION], source: 'section' }] },
							show: { ddo_map: [{ tipo: SLOT, parent: 'self', section_tipo: SECTION }] },
						},
					],
				},
			},
		},
		{ tipo: SLOT, parent: MAIN, model: 'component_dataframe', term: { 'lg-eng': 'Role' } },
	],
});

const locator = (id: number, target: number) => ({
	id,
	type: 'dd151',
	section_tipo: SECTION,
	section_id: target,
	from_component_tipo: MAIN,
});
const frame = (id: number, idKey: number, target: number) => ({
	id,
	type: 'dd490',
	id_key: idKey,
	section_tipo: SECTION,
	section_id: target,
	from_component_tipo: SLOT,
	main_component_tipo: MAIN,
});

/** Then (the TM row): two items, one frame each. Now (live): one item, one other frame. */
const MAIN_THEN = [locator(1, 501), locator(2, 502)];
const FRAMES_THEN = [frame(1, 1, 601), frame(2, 2, 602)];
const MAIN_NOW = [locator(1, 901)];
const FRAMES_NOW = [frame(1, 1, 977)];

async function setGrants(slotLevel: number, mainLevel = 2): Promise<void> {
	const grants = [
		{ id: 50, tipo: SECTION, section_tipo: SECTION, value: 2 },
		{ id: 51, tipo: MAIN, section_tipo: SECTION, value: mainLevel },
		{ id: 52, tipo: SLOT, section_tipo: SECTION, value: slotLevel },
	];
	// Replace (never append) this file's grants: the profile's own ones stay.
	await sql.unsafe(
		`UPDATE matrix_profiles
		 SET misc = jsonb_set(misc, '{dd774}',
		   COALESCE((SELECT jsonb_agg(g) FROM jsonb_array_elements(misc->'dd774') g
		             WHERE g->>'section_tipo' <> $3), '[]'::jsonb) || $1::text::jsonb)
		 WHERE section_tipo = 'dd234' AND section_id = $2`,
		[JSON.stringify(grants), ACL_NON_ADMIN_PROFILE_ID, SECTION],
	);
	clearAclIdentityCaches();
}

/** A record holding `main`/`frames` NOW, and a composed TM row of MAIN holding `then`. */
async function twin(
	main: unknown[],
	frames: unknown[],
	then: unknown[],
): Promise<{ id: number; tm: number }> {
	const id = await createSectionRecord(SECTION, -1);
	const relation: Record<string, unknown> = { [MAIN]: main };
	if (frames.length > 0) relation[SLOT] = frames;
	await sql.unsafe(
		`UPDATE "${TABLE}" SET relation = COALESCE(relation, '{}'::jsonb) || $3::text::jsonb
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, id, JSON.stringify(relation)],
	);
	const rows = (await sql.unsafe(
		`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
		 VALUES ($1, $2, $3, 'lg-nolan', '2026-07-01 10:00:00', -1, $4::text::jsonb) RETURNING id`,
		[id, SECTION, MAIN, JSON.stringify(then)],
	)) as { id: number }[];
	return { id, tm: Number(rows[0]?.id) };
}

async function storedKey(id: number, key: string): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT relation->$3 AS v FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, id, key],
	)) as { v: unknown }[];
	return rows[0]?.v ?? null;
}

async function applyAsReader(id: number, tm: number) {
	return toolTimeMachineApplyValue({
		principal: await resolvePrincipal(ACL_NON_ADMIN_USER_ID),
		userId: ACL_NON_ADMIN_USER_ID,
		options: { section_tipo: SECTION, section_id: id, tipo: MAIN, lang: 'lg-nolan', matrix_id: tm },
		background: false,
	});
}

beforeAll(async () => {
	await assertTestDatabase('tm_apply_value_slot_grant_native');
	await ensureSituation(SITUATION);
	expect(await getMatrixTableFromTipo(SECTION)).toBe(TABLE);
	expect(await resolveDataframeSlotTipos(MAIN)).toEqual([SLOT]);
	await installAclIdentityFixture();
}, 60_000);

afterAll(async () => {
	await removeAclIdentityFixture();
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1', [SECTION]);
	await sql.unsafe('DELETE FROM dedalo_ts_record_generation WHERE section_tipo = $1', [SECTION]);
	await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1`, [SECTION]);
	// The scratch section's activity rows (the restores' RECOVER rows), asserted gone.
	await sweepActivityRows(SECTION);
	expect(await countActivityRows(SECTION)).toBe(0);
	expect(await dropSituation(SITUATION)).toBe(0);
});

describe('apply_value gates every slot it writes on the caller’s own grant', () => {
	test('slot READ-ONLY, the restore would change it: refused perm.*, main and slot unchanged', async () => {
		await setGrants(1);
		const { id, tm } = await twin(MAIN_NOW, FRAMES_NOW, [...MAIN_THEN, ...FRAMES_THEN]);
		const reader = await resolvePrincipal(ACL_NON_ADMIN_USER_ID);
		// FLOOR: in scope, not an admin — only the slot grant is missing.
		expect(reader.isGlobalAdmin).toBe(false);
		expect(await principalCanAccessRecord(SECTION, id, reader)).toBe(true);
		const refusal = await refusalOf(applyAsReader(id, tm));
		expect(refusal.code.startsWith('perm.')).toBe(true);
		expect(await storedKey(id, MAIN)).toEqual(MAIN_NOW);
		expect(await storedKey(id, SLOT)).toEqual(FRAMES_NOW);
	}, 60_000);

	test('CONTROL — slot WRITABLE: main and frames restored', async () => {
		await setGrants(2);
		const { id, tm } = await twin(MAIN_NOW, FRAMES_NOW, [...MAIN_THEN, ...FRAMES_THEN]);
		const response = await applyAsReader(id, tm);
		expect(response.ok).toBe(true);
		expect(await storedKey(id, MAIN)).toEqual(MAIN_THEN);
		expect(await storedKey(id, SLOT)).toEqual(FRAMES_THEN);
	}, 60_000);

	test('MAIN read-only, reached past the module gate: the handler’s own door refuses, nothing written', async () => {
		await setGrants(2, 1);
		const { id, tm } = await twin(MAIN_NOW, FRAMES_NOW, [...MAIN_THEN, ...FRAMES_THEN]);
		const refusal = await refusalOf(applyAsReader(id, tm));
		expect(refusal.code.startsWith('perm.')).toBe(true);
		expect(await storedKey(id, MAIN)).toEqual(MAIN_NOW);
		expect(await storedKey(id, SLOT)).toEqual(FRAMES_NOW);
	}, 60_000);

	test('slot READ-ONLY, the restore does not touch it (no frames then or now): restored', async () => {
		await setGrants(1);
		const { id, tm } = await twin(MAIN_NOW, [], [...MAIN_THEN]);
		const response = await applyAsReader(id, tm);
		expect(response.ok).toBe(true);
		expect(await storedKey(id, MAIN)).toEqual(MAIN_THEN);
		expect(await storedKey(id, SLOT)).toBeNull();
	}, 60_000);
});
