/**
 * Wave 2 gate: tool_time_machine.apply_value SECTION restore (newly ported).
 *
 * Scratch twin in matrix_test (section test3): seed a record, snapshot its full
 * columns into a matrix_time_machine SECTION row (tipo = section_tipo), mutate
 * the live record, then apply_value the snapshot back. The record's columns must
 * be restored to the snapshot AND the dd197/dd201 modified stamps refreshed
 * (PHP element->set_data + save()).
 *
 * Also gates the two guardrails: a matrix_id whose target does not match the
 * request is refused, and a caller_dataframe request is denied (ledgered scope).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import { toolTimeMachineApplyValue } from '../../tools/tool_time_machine/server/tool_time_machine.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const SECTION = 'test3';
const TABLE = 'matrix_test';
const COMPONENT = 'test52'; // component_input_text
const ORIGINAL = [{ id: 1, lang: 'lg-nolan', value: 'ORIGINAL_VALUE' }];
const MUTATED = [{ id: 1, lang: 'lg-nolan', value: 'MUTATED_VALUE' }];

let recordId = 0;
let tmRowId = 0;

async function context(options: Record<string, unknown>) {
	return {
		principal: await resolvePrincipal(-1),
		userId: -1,
		options,
		background: false,
	};
}

beforeAll(async () => {
	recordId = await createSectionRecord(SECTION, -1);
	// Seed the ORIGINAL value directly (bypass save side-effects).
	await sql.unsafe(
		`UPDATE ${TABLE} SET string = jsonb_build_object($3::text, $4::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, recordId, COMPONENT, JSON.stringify(ORIGINAL)],
	);
	// Snapshot the full columns into a SECTION-level TM row (tipo = section_tipo).
	const snapshotRows = (await sql.unsafe(
		`SELECT data, relation, string, date, iri, geo, number, media, misc, relation_search, meta
		 FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, recordId],
	)) as Record<string, unknown>[];
	const snapshot = snapshotRows[0] ?? {};
	const tmRows = (await sql.unsafe(
		`INSERT INTO matrix_time_machine (section_id, section_tipo, tipo, lang, timestamp, user_id, data)
		 VALUES ($1, $2, $2, 'lg-nolan', '2026-07-01 10:00:00', -1, $3::text::jsonb)
		 RETURNING id`,
		[recordId, SECTION, JSON.stringify(snapshot)],
	)) as { id: number }[];
	tmRowId = tmRows[0]?.id ?? 0;
	// Mutate the live record so the restore has something to undo.
	await sql.unsafe(
		`UPDATE ${TABLE} SET string = jsonb_build_object($3::text, $4::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, recordId, COMPONENT, JSON.stringify(MUTATED)],
	);
});

afterAll(async () => {
	// The seeded TM row carries (SECTION, recordId), so the shared sweep covers it.
	await cleanScratchRecord(SECTION, recordId);
});

describe('apply_value SECTION restore', () => {
	test('restores the snapshot columns and refreshes the modified stamps', async () => {
		const response = await toolTimeMachineApplyValue(
			await context({
				section_tipo: SECTION,
				section_id: recordId,
				tipo: SECTION, // model 'section'
				lang: 'lg-nolan',
				matrix_id: tmRowId,
			}),
		);
		expect(response.result).toBe(true);

		const row = await readMatrixRecord(TABLE, SECTION, recordId);
		// The mutated value is gone; the ORIGINAL snapshot value is back.
		expect((row?.columns.string as Record<string, unknown>)[COMPONENT]).toEqual(ORIGINAL);
		// Modified stamps refreshed by the chokepoint (PHP save()).
		expect((row?.columns.relation as Record<string, unknown>)?.dd197).toBeDefined();
		expect((row?.columns.date as Record<string, unknown>)?.dd201).toBeDefined();
	});

	test('refuses a matrix_id that does not match the requested target', async () => {
		const response = await toolTimeMachineApplyValue(
			await context({
				section_tipo: SECTION,
				section_id: recordId + 999999, // wrong id
				tipo: SECTION,
				lang: 'lg-nolan',
				matrix_id: tmRowId,
			}),
		);
		expect(response.result).toBe(false);
		expect(response.errors).toContain('invalid_request');
	});

	test('denies a caller_dataframe request (ledgered uncovered scope)', async () => {
		const response = await toolTimeMachineApplyValue(
			await context({
				section_tipo: SECTION,
				section_id: recordId,
				tipo: SECTION,
				lang: 'lg-nolan',
				matrix_id: tmRowId,
				caller_dataframe: { main_component_tipo: 'test52' },
			}),
		);
		expect(response.result).toBe(false);
		expect(response.errors).toContain('uncovered_scope');
	});
});
