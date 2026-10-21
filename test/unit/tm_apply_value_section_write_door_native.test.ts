/**
 * TIME MACHINE apply_value, SECTION branch — a whole-record restore asks the
 * write door for EVERY component it changes (cross-write:r3, review of
 * b095553e22..ffc2a8479b, S2 security-authz).
 *
 * THE DEFECT. The component branch asks the write door (authorizeRecordAccess:
 * the dd128-aware pair, the write scope) for the main and every slot it writes.
 * The SECTION branch (tipo = section_tipo, a whole-record TM row) returned
 * before that door: restoreSection → persistRecordColumns upserted every
 * snapshot column with only the declarative 'tipo' gate on the (section,
 * section) pair behind it. On dd128 that pair carries no component, so the
 * own-record DOWNGRADE never applied: a user-manager (level 2 on dd128 and on
 * dd1725) restored a whole-record row of their OWN account and wrote its old
 * profile (dd1725) back — the SEC-03 self-elevation the component door refuses.
 * And on any section, a field the caller may only READ was rewritten by a
 * whole-record restore.
 *
 * THE OUTCOMES PINNED (the snapshot's changed key the only variable):
 *   - dd128, the manager's OWN record, the snapshot changes dd1725 → refused
 *     perm.*, the live dd1725 unchanged (nothing written);
 *   - CONTROL: the same manager, the same record, the snapshot changes only
 *     dd452 (self-editable full name) → restored; dd1725 untouched;
 *   - test3, a READ-ONLY field (test17 at level 1) the snapshot changes →
 *     refused, the live value unchanged;
 *   - CONTROL: the identity that may write test17 → restored.
 * What is gated is what the restore CHANGES: an unchanged key (dd1725 in the
 * CONTROL) is never asked, and neither are the modified stamps (dd197 / dd201)
 * a real, older snapshot differs on — the restore writes its own there.
 *
 * SITUATION: the authorization-door fixture's identities (band 944000-944099)
 * and engine-built test3 records; every row, TM row and activity row swept, the
 * activity residue asserted zero. assertTestDatabase before the first write.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { getColumnNameByModel, getModelByTipo } from '../../src/core/ontology/resolver.ts';
import {
	getRecordComponentPermission,
	type Principal,
	resolvePrincipal,
} from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { toolTimeMachineApplyValue } from '../../tools/tool_time_machine/server/tool_time_machine.ts';
import { countActivityRows, sweepActivityRows } from '../helpers/activity_rows.ts';
import {
	AUTHZ_CONTROL_USER_ID,
	AUTHZ_PROJECT_P,
	AUTHZ_READ_COMPONENT_USER_ID,
	AUTHZ_SECTION,
	AUTHZ_TEXT_AREA,
	AUTHZ_USER_MANAGER_PROFILE_ID,
	AUTHZ_USER_MANAGER_USER_ID,
	authzProfileId,
	clearAuthzDoorCaches,
	createDoorRecord,
	installAuthzDoorFixture,
	removeAuthzDoorFixture,
} from '../helpers/authz_door_fixture.ts';
import { refusalOf } from '../helpers/refusal.ts';

const USERS = 'dd128';
const PROFILE = 'dd1725';
const FULL_NAME = 'dd452';
const createdTest3: number[] = [];

/** Insert a whole-record TM row of `sectionTipo/sectionId` holding `columns`. */
async function wholeRecordRow(
	sectionTipo: string,
	sectionId: number,
	columns: Record<string, unknown>,
): Promise<number> {
	const rows = (await sql.unsafe(
		`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
		 VALUES ($1, $2, $2, 'lg-nolan', '2026-07-01 10:00:00', -1, $3::text::jsonb) RETURNING id`,
		[sectionId, sectionTipo, JSON.stringify(columns)],
	)) as { id: number }[];
	return Number(rows[0]?.id);
}

/** The live record's columns, deep-copied (a snapshot to edit). */
async function liveColumns(
	table: string,
	sectionTipo: string,
	sectionId: number,
): Promise<Record<string, Record<string, unknown> | null>> {
	const record = await readMatrixRecord(table, sectionTipo, sectionId);
	expect(record).not.toBeNull();
	return structuredClone(record?.columns ?? {}) as Record<string, Record<string, unknown> | null>;
}

async function liveKey(
	table: string,
	column: string,
	sectionTipo: string,
	sectionId: number,
	key: string,
): Promise<unknown> {
	const record = await readMatrixRecord(table, sectionTipo, sectionId);
	return (record?.columns as Record<string, Record<string, unknown> | null> | undefined)?.[
		column
	]?.[key];
}

async function restoreAs(principal: Principal, sectionTipo: string, sectionId: number, tm: number) {
	return toolTimeMachineApplyValue({
		principal,
		userId: principal.userId,
		options: {
			section_tipo: sectionTipo,
			section_id: sectionId,
			tipo: sectionTipo,
			lang: 'lg-nolan',
			matrix_id: tm,
		},
		background: false,
	});
}

const profileLocator = (profileId: number) => ({
	type: 'dd151',
	section_id: profileId,
	section_tipo: 'dd234',
	from_component_tipo: PROFILE,
});

beforeAll(async () => {
	await assertTestDatabase('tm_apply_value_section_write_door_native');
	await installAuthzDoorFixture();
}, 60_000);

afterAll(async () => {
	await sweepActivityRows(USERS, [AUTHZ_USER_MANAGER_USER_ID]);
	await sweepActivityRows(AUTHZ_SECTION, createdTest3);
	await removeAuthzDoorFixture();
	expect(await countActivityRows(USERS, [AUTHZ_USER_MANAGER_USER_ID])).toBe(0);
	expect(await countActivityRows(AUTHZ_SECTION, createdTest3)).toBe(0);
}, 60_000);

describe('apply_value SECTION branch: the write door for every changed component', () => {
	test('dd128 OWN record, the snapshot changes dd1725: refused perm.*, profile unchanged', async () => {
		const manager = await resolvePrincipal(AUTHZ_USER_MANAGER_USER_ID);
		// FLOOR: the manager holds the raw pair the declarative gate reads, and the
		// own-record rule is what downgrades it — the refusal below is that rule.
		expect(manager.isGlobalAdmin).toBe(false);
		expect(await getRecordComponentPermission(manager, USERS, PROFILE, 1)).toBe(2);
		expect(
			await getRecordComponentPermission(manager, USERS, PROFILE, AUTHZ_USER_MANAGER_USER_ID),
		).toBe(1);
		const before = await liveKey(
			'matrix_users',
			'relation',
			USERS,
			AUTHZ_USER_MANAGER_USER_ID,
			PROFILE,
		);
		const snapshot = await liveColumns('matrix_users', USERS, AUTHZ_USER_MANAGER_USER_ID);
		const other = authzProfileId(AUTHZ_CONTROL_USER_ID);
		(snapshot.relation as Record<string, unknown>)[PROFILE] = [{ id: 1, ...profileLocator(other) }];
		const tm = await wholeRecordRow(USERS, AUTHZ_USER_MANAGER_USER_ID, snapshot);

		const refusal = await refusalOf(restoreAs(manager, USERS, AUTHZ_USER_MANAGER_USER_ID, tm));
		expect(refusal.code.startsWith('perm.')).toBe(true);
		clearAuthzDoorCaches();
		const after = await liveKey(
			'matrix_users',
			'relation',
			USERS,
			AUTHZ_USER_MANAGER_USER_ID,
			PROFILE,
		);
		expect(after).toEqual(before);
		expect(Number((after as { section_id: unknown }[])[0]?.section_id)).toBe(
			AUTHZ_USER_MANAGER_PROFILE_ID,
		);
	}, 60_000);

	test('CONTROL — dd128 OWN record, the snapshot changes only the self-editable name: restored', async () => {
		const manager = await resolvePrincipal(AUTHZ_USER_MANAGER_USER_ID);
		const nameColumn = getColumnNameByModel((await getModelByTipo(FULL_NAME)) ?? '');
		expect(nameColumn).not.toBeNull();
		const before = await liveKey(
			'matrix_users',
			'relation',
			USERS,
			AUTHZ_USER_MANAGER_USER_ID,
			PROFILE,
		);
		const snapshot = await liveColumns('matrix_users', USERS, AUTHZ_USER_MANAGER_USER_ID);
		const name = [{ id: 1, lang: 'lg-nolan', value: 'zz restored name' }];
		snapshot[nameColumn as string] = {
			...(snapshot[nameColumn as string] ?? {}),
			[FULL_NAME]: name,
		};
		const tm = await wholeRecordRow(USERS, AUTHZ_USER_MANAGER_USER_ID, snapshot);

		const response = await restoreAs(manager, USERS, AUTHZ_USER_MANAGER_USER_ID, tm);
		expect(response.ok).toBe(true);
		clearAuthzDoorCaches();
		expect(
			await liveKey(
				'matrix_users',
				nameColumn as string,
				USERS,
				AUTHZ_USER_MANAGER_USER_ID,
				FULL_NAME,
			),
		).toEqual(name);
		expect(
			await liveKey('matrix_users', 'relation', USERS, AUTHZ_USER_MANAGER_USER_ID, PROFILE),
		).toEqual(before);
	}, 60_000);

	for (const leg of [
		{
			label: 'a READ-ONLY field the snapshot changes: refused, unchanged',
			userId: AUTHZ_READ_COMPONENT_USER_ID,
			served: false,
		},
		{
			label: 'CONTROL — the field is writable: restored',
			userId: AUTHZ_CONTROL_USER_ID,
			served: true,
		},
	]) {
		test(`test3 — ${leg.label}`, async () => {
			const principal = await resolvePrincipal(leg.userId);
			const column = getColumnNameByModel((await getModelByTipo(AUTHZ_TEXT_AREA)) ?? '');
			expect(column).not.toBeNull();
			const now = [{ id: 1, lang: 'lg-eng', value: '<p>now</p>' }];
			const then = [{ id: 1, lang: 'lg-eng', value: '<p>then</p>' }];
			const id = await createDoorRecord(AUTHZ_SECTION, AUTHZ_PROJECT_P, [
				{ tipo: AUTHZ_TEXT_AREA, lang: 'lg-eng', value: now },
			]);
			createdTest3.push(id);
			const table = 'matrix_test';
			// FLOOR: the field holds `now`, and the identity's level on it is the variable.
			expect(await liveKey(table, column as string, AUTHZ_SECTION, id, AUTHZ_TEXT_AREA)).toEqual(
				now,
			);
			expect(
				await getRecordComponentPermission(principal, AUTHZ_SECTION, AUTHZ_TEXT_AREA, id),
			).toBe(leg.served ? 2 : 1);
			const snapshot = await liveColumns(table, AUTHZ_SECTION, id);
			snapshot[column as string] = {
				...(snapshot[column as string] ?? {}),
				[AUTHZ_TEXT_AREA]: then,
			};
			// A real snapshot is OLDER than the record: its modified stamps (dd197 /
			// dd201) differ from the live ones. The restore writes its OWN stamps
			// there — never the caller's to authorize (the identities hold no grant
			// on them), so they must not be asked.
			snapshot.date = {
				...(snapshot.date ?? {}),
				dd201: [
					{
						id: 1,
						lang: 'lg-nolan',
						start: { day: 1, hour: 10, year: 2026, month: 7, minute: 0, second: 0 },
					},
				],
			};
			snapshot.relation = {
				...(snapshot.relation ?? {}),
				dd197: [
					{
						id: 1,
						type: 'dd151',
						section_id: AUTHZ_CONTROL_USER_ID,
						section_tipo: USERS,
						from_component_tipo: 'dd197',
					},
				],
			};
			const tm = await wholeRecordRow(AUTHZ_SECTION, id, snapshot);

			if (leg.served) {
				expect((await restoreAs(principal, AUTHZ_SECTION, id, tm)).ok).toBe(true);
				expect(await liveKey(table, column as string, AUTHZ_SECTION, id, AUTHZ_TEXT_AREA)).toEqual(
					then,
				);
			} else {
				const refusal = await refusalOf(restoreAs(principal, AUTHZ_SECTION, id, tm));
				expect(refusal.code.startsWith('perm.')).toBe(true);
				expect(await liveKey(table, column as string, AUTHZ_SECTION, id, AUTHZ_TEXT_AREA)).toEqual(
					now,
				);
			}
		}, 60_000);
	}
});
