/**
 * THE MCP RECORD-LIFECYCLE DOORS REQUIRE THEIR RECORD, AND find_or_create IS
 * AUTHORIZED BEFORE ITS EFFECT AND ATOMIC AFTER IT (closure Step 3 review r8;
 * WC-2026-09-30-write-door, addendum 2026-10-01).
 *
 * WHAT WAS WRONG:
 *   - `dedalo_delete_record` / `dedalo_duplicate_record` authorized through
 *     `authorizeSectionTarget`, which reads an ABSENT `section_id` as a CREATE:
 *     the section level alone passed and the grant carried `sectionId: null`,
 *     which the handler cast to a number and deleted / duplicated. Only the zod
 *     `inputShape` kept an id present — a caller that skipped it (a direct
 *     import, a future door) turned a record delete into a section-level
 *     authorization with a null target. The doors now call
 *     `authorizeSectionRecord`, which refuses the absent id itself;
 *   - `dedalo_find_or_create` authorized its create on the SECTION level alone,
 *     created the record, and only then judged each fill: a caller holding the
 *     section at 2 but a match/set field at 0 — or whose new record falls
 *     outside their scope — left a stray record behind on every call. Now every
 *     field's pair is asked BEFORE the create, and the create + fills run in ONE
 *     transaction (a fill the door still refuses rolls the create back).
 *
 * MEASURED ON STORED STATE, through the real resolver (authz_door_fixture): the
 * section's row count, and the section table's row-id SEQUENCE — sequences are
 * not transactional, so an unchanged `matrix_test_id_seq` proves no row was
 * inserted even transiently (the pre-flight), where an unchanged count alone
 * only proves the rollback. Every refusal has a served twin.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { duplicateRecord, findOrCreate } from '../../src/ai/mcp/tools/fields_write.ts';
import { deleteRecord } from '../../src/ai/mcp/tools/records_write.ts';
import { deleteMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { type Principal, resolvePrincipal } from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import {
	AUTHZ_AV,
	AUTHZ_PROJECT_P,
	AUTHZ_SECTION,
	AUTHZ_TEXT,
	AUTHZ_TEXT_AREA,
	type AuthzIdentities,
	assertAuthzDoorContrast,
	createDoorRecord,
	installAuthzDoorFixture,
	removeAuthzDoorFixture,
	resolveAuthzIdentities,
} from '../helpers/authz_door_fixture.ts';
import { DB_READY } from '../helpers/db_ready.ts';
import { refusalOf } from '../helpers/refusal.ts';

/** test3 lives in matrix_test; its row id comes from this sequence. */
const TABLE = 'matrix_test';
const ROW_ID_SEQUENCE = 'matrix_test_id_seq';

let ids: AuthzIdentities;
let superuser: Principal;
/** Records a served leg minted (swept after). */
const minted: number[] = [];

async function sectionRowCount(): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM ${TABLE} WHERE section_tipo = $1`,
		[AUTHZ_SECTION],
	)) as { n: number }[];
	return rows[0]?.n ?? -1;
}

async function rowIdSequence(): Promise<string> {
	const rows = (await sql.unsafe(`SELECT last_value::text AS v FROM ${ROW_ID_SEQUENCE}`)) as {
		v: string;
	}[];
	return rows[0]?.v ?? '';
}

async function sweepMinted(): Promise<void> {
	await assertTestDatabase('mcp_record_door_native: sweep');
	while (minted.length > 0) {
		const sectionId = minted.pop() as number;
		await deleteMatrixRecord(TABLE, AUTHZ_SECTION, sectionId);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[AUTHZ_SECTION, sectionId],
		);
	}
}

const codeOf = (run: Promise<unknown>) =>
	run.then(
		() => 'served',
		(error: unknown) => (error as { code?: string }).code ?? String(error),
	);

describe.if(DB_READY)('MCP record doors — the record is required, find_or_create is atomic', () => {
	beforeAll(async () => {
		await installAuthzDoorFixture();
		ids = await resolveAuthzIdentities();
		superuser = await resolvePrincipal(-1);
	});
	afterAll(async () => {
		await sweepMinted();
		await removeAuthzDoorFixture();
	});

	test('the contrast is live (guards every leg)', async () => {
		await assertAuthzDoorContrast(ids);
	});

	// ── the record-lifecycle doors: an absent id is refused BY THE DOOR ──────
	const ABSENT: readonly [string, unknown][] = [
		['absent', undefined],
		['null', null],
		["''", ''],
	];
	for (const [label, absent] of ABSENT) {
		test(`delete / duplicate with section_id ${label} → request.invalid for the admin AND the control; nothing deleted or minted`, async () => {
			const before = await sectionRowCount();
			const answers: Record<string, string> = {};
			for (const [who, principal] of [
				['dd128Admin', ids.dd128Admin],
				['control', ids.control],
			] as const) {
				const target = {
					section_tipo: AUTHZ_SECTION,
					...(absent === undefined ? {} : { section_id: absent }),
				} as { section_tipo: string; section_id: number };
				answers[`delete ${who}`] = await codeOf(deleteRecord(principal, target));
				answers[`duplicate ${who}`] = await codeOf(duplicateRecord(principal, target));
			}
			expect({ answers, count: await sectionRowCount() }).toEqual({
				answers: {
					'delete dd128Admin': 'request.invalid',
					'duplicate dd128Admin': 'request.invalid',
					'delete control': 'request.invalid',
					'duplicate control': 'request.invalid',
				},
				count: before,
			});
		});
	}

	test('TWIN: the control deletes and duplicates an in-scope record it names', async () => {
		const source = await createDoorRecord(AUTHZ_SECTION, AUTHZ_PROJECT_P);
		const copy = await duplicateRecord(ids.control, {
			section_tipo: AUTHZ_SECTION,
			section_id: source,
		});
		minted.push(copy.section_id);
		expect(copy.section_id).toBeGreaterThan(source);
		const removed = await deleteRecord(ids.control, {
			section_tipo: AUTHZ_SECTION,
			section_id: copy.section_id,
		});
		expect(removed.deleted).toEqual([copy.section_id]);
	});

	// ── find_or_create: authorized before the effect ─────────────────────────
	test('find_or_create: a SET field the caller holds at 0 → perm.denied ON it BEFORE the create — no row, not even transiently', async () => {
		// TEXT_ONLY: the section at 2, the text area at 2 (the match field — the
		// search misses, the create branch is taken), the AV at 0 (the set field).
		const count = await sectionRowCount();
		const sequence = await rowIdSequence();
		const refusal = await refusalOf(
			findOrCreate(ids.textOnly, {
				section_tipo: AUTHZ_SECTION,
				match: [
					{ field: AUTHZ_TEXT_AREA, value: `zzauthz foc ${crypto.randomUUID()}`, lang: 'lg-eng' },
				],
				set: [{ field: AUTHZ_AV, value: 'zzauthz' }],
			}),
		);
		expect({
			code: refusal.code,
			tipo: refusal.coordinates?.tipo,
			count: await sectionRowCount(),
			sequence: await rowIdSequence(),
		}).toEqual({ code: 'perm.denied', tipo: AUTHZ_AV, count, sequence });
	});

	test('find_or_create: NO_COMPONENT on the MATCH field → refused ON it BEFORE the create — no row, not even transiently', async () => {
		// The row count alone cannot tell the pre-flight from the transaction's
		// rollback (both leave it unchanged): the SEQUENCE can — a create that ran
		// and rolled back still consumed an id. Measured: with the match fields
		// dropped from the pre-flight this leg stayed green on the count alone.
		const count = await sectionRowCount();
		const sequence = await rowIdSequence();
		const refusal = await refusalOf(
			findOrCreate(ids.sectionOnly, {
				section_tipo: AUTHZ_SECTION,
				match: [{ field: AUTHZ_TEXT, value: `zzauthz foc ${crypto.randomUUID()}`, lang: 'lg-eng' }],
			}),
		);
		expect({
			code: refusal.code,
			tipo: refusal.coordinates?.tipo,
			count: await sectionRowCount(),
			sequence: await rowIdSequence(),
		}).toEqual({ code: 'perm.denied', tipo: AUTHZ_TEXT, count, sequence });
	});

	// ── find_or_create: atomic after the effect ──────────────────────────────
	test("find_or_create: every pair granted, but the NEW record is outside the caller's scope → the fill is refused and the create ROLLS BACK (no stray record)", async () => {
		// The non-admin control: every pair at 2, so the pre-flight passes and the
		// create happens — but a test3 record is born with no project
		// (record_defaults' FILTER_EXCLUDED_SECTIONS), so the first fill's scope
		// step refuses it. Committed, that create was a stray empty record per call.
		const count = await sectionRowCount();
		const sequence = await rowIdSequence();
		const refusal = await refusalOf(
			findOrCreate(ids.control, {
				section_tipo: AUTHZ_SECTION,
				match: [{ field: AUTHZ_TEXT, value: `zzauthz foc ${crypto.randomUUID()}`, lang: 'lg-eng' }],
			}),
		);
		expect({
			code: refusal.code,
			count: await sectionRowCount(),
			// Non-vacuity: the create really ran (the sequence moved) — it was rolled back.
			inserted: (await rowIdSequence()) !== sequence,
		}).toEqual({ code: 'perm.out_of_scope', count, inserted: true });
	});

	test('find_or_create SERVED twin: the superuser creates AND fills — one new record carrying the match value', async () => {
		const count = await sectionRowCount();
		const value = `zzauthz foc ${crypto.randomUUID()}`;
		const found = await findOrCreate(superuser, {
			section_tipo: AUTHZ_SECTION,
			match: [{ field: AUTHZ_TEXT, value, lang: 'lg-eng' }],
		});
		minted.push(found.section_id);
		const stored = (await sql.unsafe(
			`SELECT string->($3::text) AS items FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
			[AUTHZ_SECTION, found.section_id, AUTHZ_TEXT],
		)) as { items: unknown }[];
		expect({
			created: found.created,
			count: await sectionRowCount(),
			holdsValue: JSON.stringify(stored[0]?.items ?? null).includes(value),
		}).toEqual({ created: true, count: count + 1, holdsValue: true });
	});
});
