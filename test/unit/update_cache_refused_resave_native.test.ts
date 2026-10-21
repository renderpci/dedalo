/**
 * tool_update_cache — a re-save the SAVE DOOR refuses rolls the whole component
 * back, is reported per record, and never stops the sweep
 * (WC-2026-10-21-update-cache-locked-resave, addendum 2026-10-21 r2).
 *
 * The regenerate of a translatable literal re-saves its stored value one lang
 * group at a time, all of them in ONE transaction under the row lock. When the
 * door refuses a later group, the groups already re-saved in that transaction
 * must not stay: the record is reported "nothing written", so nothing may be.
 * And the refusal is THAT record's — a PHP-era item no cast can read (the
 * value-shape law, value_shape.ts "the door then refuses it: loud, per record")
 * used to escape the sweep as a thrown error and end the whole run at the first
 * such record, every record after it left unprocessed.
 *
 * OUTCOME, one sweep over two runtime records:
 *   R1 record A holds two lang groups — the FIRST re-saves to different bytes
 *      (an item with no id gets one stamped), the SECOND is a malformed item the
 *      door refuses. A's stored bytes are unchanged in every language, the run
 *      wrote no undo-log row for A, and errors[] carries
 *      '<tipo>#<A>: the re-save was refused — nothing written (<reason>)';
 *   R2 record B, swept after A in the same run, IS re-saved (the sweep went on):
 *      `regenerated` counts B alone and the summary names the one refusal.
 *
 * SITUATION: runtime-created `test3` playground records (generic `test` TLD),
 * `test52` (translatable component_input_text). Records, TM rows, activity rows
 * and the dd800 run are swept. assertTestDatabase first.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { getLoadedTool } from '../../src/core/tools/loader.ts';
import { mustGet } from '../helpers/assert.ts';

const SECTION = 'test3';
const TEXT = 'test52'; // component_input_text, translatable
const USER_ID = -1;

const records: number[] = [];
const bulkIds: number[] = [];
let table = '';
let bulkTable = '';

async function newRecord(): Promise<number> {
	const id = await createSectionRecord(SECTION, USER_ID);
	records.push(id);
	return id;
}

async function seed(id: number, value: unknown): Promise<void> {
	await sql.unsafe(
		`UPDATE "${table}" SET string = COALESCE(string, '{}'::jsonb) || jsonb_build_object($3::text, $4::text::jsonb)
		  WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, id, TEXT, JSON.stringify(value)],
	);
}

async function stored(id: number): Promise<unknown> {
	const rows = (await sql.unsafe(
		`SELECT string->$3 AS v FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, id, TEXT],
	)) as { v: unknown }[];
	return rows.length === 0 ? 'NO-RECORD' : (rows[0]?.v ?? null);
}

async function runRowCount(id: number, bulk: number): Promise<number> {
	const [row] = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id = $2 AND bulk_process_id = $3`,
		[SECTION, id, bulk],
	)) as { n: number }[];
	return Number(row?.n ?? 0);
}

interface SweepResult {
	bulk_process_id: number;
	summary: string;
	regenerated: number;
	records: number;
	processed: number;
	errors: string[];
}

async function runSweep(ids: readonly number[]): Promise<SweepResult> {
	const loaded = await getLoadedTool('tool_update_cache');
	const handler = mustGet(loaded?.module.apiActions.update_cache, 'update_cache').handler;
	const response = await handler({
		principal: await resolvePrincipal(USER_ID),
		userId: USER_ID,
		background: false,
		options: {
			section_tipo: SECTION,
			components_selection: [{ tipo: TEXT }],
			sqo: {
				section_tipo: [SECTION],
				filter_by_locators: ids.map((id) => ({ section_tipo: SECTION, section_id: String(id) })),
			},
		},
	});
	const data = response.data as SweepResult;
	bulkIds.push(Number(data.bulk_process_id));
	return data;
}

beforeAll(async () => {
	await assertTestDatabase('update_cache_refused_resave_native');
	table = mustGet(await getMatrixTableFromTipo(SECTION), 'test3 table');
	bulkTable = mustGet(await getMatrixTableFromTipo('dd800'), 'dd800 table');
}, 60_000);

afterAll(async () => {
	for (const id of records) {
		await sql.unsafe(`DELETE FROM "${table}" WHERE section_tipo = $1 AND section_id = $2`, [
			SECTION,
			id,
		]);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		);
		await sql.unsafe(
			`DELETE FROM matrix_activity WHERE data->>'section_tipo' = $1 AND data->>'section_id' = $2`,
			[SECTION, String(id)],
		);
	}
	for (const id of bulkIds) {
		await sql.unsafe(
			`DELETE FROM "${bulkTable}" WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd800' AND section_id = $1`,
			[id],
		);
	}
});

describe('update_cache: a refused re-save writes nothing and does not end the run', () => {
	test('R1 a group refused after an accepted one rolls the component back; R2 the sweep goes on', async () => {
		const refusedId = await newRecord();
		const healthyId = await newRecord();
		// FIRST group (lg-eng): no item id — its re-save stamps one, so it is a REAL
		// write ("unchanged" below is measured, not a no-op in disguise). SECOND group
		// (lg-spa): a `value` that is an object — the string column's shape law
		// refuses it, and no re-save cast reads it.
		const refusedValue = [
			{ lang: 'lg-eng', value: 'accepted first group' },
			{ id: 2, lang: 'lg-spa', value: { not: 'a string' } },
		];
		const healthyValue = [{ lang: 'lg-spa', value: 'healthy record' }];
		await seed(refusedId, refusedValue);
		await seed(healthyId, healthyValue);

		const result = await runSweep([refusedId, healthyId]);

		// R1 — nothing of the refused component stayed, in ANY language.
		expect(await stored(refusedId)).toEqual(refusedValue);
		expect(await runRowCount(refusedId, result.bulk_process_id)).toBe(0);
		const refusalLines = result.errors.filter((line) =>
			line.startsWith(`${TEXT}#${refusedId}: the re-save was refused — nothing written (`),
		);
		expect(refusalLines).toHaveLength(1);
		expect(result.summary).toContain('1 re-save(s) refused by the save door');

		// R2 — the record after it was processed and re-saved (an id was stamped).
		expect(result.processed).toBe(2);
		expect(result.regenerated).toBe(1);
		const healthy = (await stored(healthyId)) as { id?: unknown; value?: unknown }[];
		expect(healthy).toHaveLength(1);
		expect(healthy[0]?.value).toBe('healthy record');
		expect(typeof healthy[0]?.id).toBe('number');
		expect(await runRowCount(healthyId, result.bulk_process_id)).toBeGreaterThan(0);
	}, 90_000);
});
