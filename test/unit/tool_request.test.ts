/**
 * Phase 6 gate: dd_tools_api.tool_request dispatch + tool_time_machine
 * apply_value (the client's "Apply and save" restore).
 *
 * Round-trip against the live DB: a fresh test-section record is saved twice
 * (v1 then v2 — each save writes a TM audit row), then apply_value restores
 * the v1 snapshot by its matrix_time_machine PK and the live value must be
 * v1 again, with a FRESH TM audit row for the restore itself. The dispatch
 * gates are asserted one by one: unknown tool, unregistered method,
 * non-admin denial (ledgered), target mismatch, missing params.
 */
// Migrated to the generic `test` TLD 2026-08-19: the restored component and the
// mismatch probes are opaque tipos, so they now name generic `test` nodes.

import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import * as realRecordScope from '../../src/core/security/record_scope.ts';
import { dispatchToolRequest } from '../../src/core/tools/dispatch.ts';
import { refusalOf } from '../helpers/refusal.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const REAL_RECORD_SCOPE = { ...realRecordScope };

const SECTION_TIPO = 'test2';
const COMPONENT_TIPO = 'test52'; // input_text (string column) — the standing test fixture tipo
const LANG = 'lg-spa';
const SUPERUSER: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true };
const NO_ACCESS: Principal = { userId: 999999, isGlobalAdmin: false, isDeveloper: false };

let recordId = 0;
let v1MatrixId = 0;

async function liveValue(): Promise<unknown[]> {
	const rows = (await sql.unsafe(
		`SELECT string->'${COMPONENT_TIPO}' AS items FROM matrix_test
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION_TIPO, recordId],
	)) as { items: unknown[] | null }[];
	return rows[0]?.items ?? [];
}

beforeAll(async () => {
	recordId = await createSectionRecord(SECTION_TIPO, -1);

	// v1 then v2 — each save records a TM row carrying the post-save data.
	for (const value of ['TM-RESTORE-V1', 'TM-RESTORE-V2']) {
		const saved = await saveComponentData({
			componentTipo: COMPONENT_TIPO,
			sectionTipo: SECTION_TIPO,
			sectionId: recordId,
			lang: LANG,
			changedData: [{ action: 'update', id: 1, value: { id: 1, lang: LANG, value } }],
			userId: -1,
		});
		expect(saved.ok).toBe(true);
	}

	const tmRows = (await sql.unsafe(
		`SELECT id, data FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ORDER BY id ASC`,
		[SECTION_TIPO, recordId, COMPONENT_TIPO],
	)) as { id: number; data: unknown }[];
	expect(tmRows.length).toBe(2);
	expect(JSON.stringify(tmRows[0]?.data)).toContain('TM-RESTORE-V1');
	v1MatrixId = tmRows[0]?.id as number;
});

afterAll(async () => {
	// mock.module is process-GLOBAL and mock.restore() does not revert it.
	mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE);
	await cleanScratchRecord(SECTION_TIPO, recordId);
});

const APPLY_SOURCE = { model: 'tool_time_machine', action: 'apply_value' };

function applyOptions(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		section_tipo: SECTION_TIPO,
		section_id: recordId,
		tipo: COMPONENT_TIPO,
		lang: LANG,
		matrix_id: v1MatrixId,
		...overrides,
	};
}

describe('dd_tools_api.tool_request (Phase 6 gate)', () => {
	test('gates: unknown tool, unregistered method, non-admin, bad target', async () => {
		// Every gate REFUSES BY THROWING its registered code (ERRORS_SPEC §4).
		const badTool = await refusalOf(
			dispatchToolRequest(
				SUPERUSER,
				-1,
				{ model: 'tool_i_invented', action: 'apply_value' },
				applyOptions(),
			),
		);
		expect(badTool.code).toBe('tool.invalid_name');

		// A REAL registered tool whose methods are not in the TS action registry.
		const badMethod = await refusalOf(
			dispatchToolRequest(
				SUPERUSER,
				-1,
				{ model: 'tool_time_machine', action: 'not_a_method' },
				applyOptions(),
			),
		);
		expect(badMethod.code).toBe('tool.method_not_allowed');

		const nonAdmin = await refusalOf(
			dispatchToolRequest(NO_ACCESS, 999999, APPLY_SOURCE, applyOptions()),
		);
		expect(nonAdmin.code).toBe('tool.not_authorized');

		const badOptions = await refusalOf(
			dispatchToolRequest(SUPERUSER, -1, APPLY_SOURCE, 'not-an-object'),
		);
		expect(badOptions.code).toBe('request.invalid_options');
	});

	test('apply_value rejects a TM row that does not match the target', async () => {
		// (!) Assert on the MESSAGE, not just the 'invalid_request' code: the
		// missing-parameter branch returns the same code, so a code-only
		// assertion would pass even if the target-match check were deleted.
		const mismatched = await refusalOf(
			dispatchToolRequest(SUPERUSER, -1, APPLY_SOURCE, applyOptions({ section_id: recordId + 1 })),
		);
		expect(mismatched.code).toBe('request.invalid_options');
		expect(mismatched.publicMessage).toBe('matrix_id does not belong to the requested target');

		// Same section+record, WRONG component tipo: a snapshot of test52
		// must never be restorable into another component's slot.
		const otherTipo = await refusalOf(
			dispatchToolRequest(SUPERUSER, -1, APPLY_SOURCE, applyOptions({ tipo: 'test162' })),
		);
		expect(otherTipo.code).toBe('request.invalid_options');
		expect(otherTipo.publicMessage).toBe('matrix_id does not belong to the requested target');

		// And the live value is still v2 — nothing was restored by either.
		expect(JSON.stringify(await liveValue())).toContain('TM-RESTORE-V2');
	});

	test('apply_value refuses a record outside the caller scope (SEC-024 §9.4)', async () => {
		// The declarative 'tipo' gate authorizes the (section_tipo, tipo) SCHEMA
		// pair only; the caller-supplied section_id needs its own projects-scope
		// assertion, which the TM row lookup does not apply. Deny it and assert
		// the live value is untouched.
		mock.module('../../src/core/security/record_scope.ts', () => ({
			...REAL_RECORD_SCOPE,
			principalCanAccessRecord: async () => false,
		}));
		try {
			const before = await liveValue();
			const denied = await refusalOf(
				dispatchToolRequest(SUPERUSER, -1, APPLY_SOURCE, applyOptions()),
			);
			expect(denied.code).toBe('perm.out_of_scope');
			expect(await liveValue()).toEqual(before);
		} finally {
			mock.module('../../src/core/security/record_scope.ts', () => REAL_RECORD_SCOPE);
		}
	});

	test('apply_value restores the v1 snapshot into the live record', async () => {
		// Live value is v2 before the restore.
		expect(JSON.stringify(await liveValue())).toContain('TM-RESTORE-V2');

		const response = await dispatchToolRequest(SUPERUSER, -1, APPLY_SOURCE, applyOptions());
		expect(response.ok).toBe(true);
		expect(response.data).toBe(true);

		// Live value is v1 again — the exact snapshot, id 1 kept, correct lang.
		const restored = await liveValue();
		expect(restored).toEqual([{ id: 1, lang: LANG, value: 'TM-RESTORE-V1' }]);

		// The restore wrote a FRESH TM row (revertible restore, consumed row kept).
		const tmCount = (await sql.unsafe(
			`SELECT count(*)::int AS c FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3`,
			[SECTION_TIPO, recordId, COMPONENT_TIPO],
		)) as { c: number }[];
		expect(tmCount[0]?.c).toBe(3);
	});

	test('apply_value strips dataframe frames from the restored main data', async () => {
		// Seed a TM row whose data mixes main items with dd490 frame entries
		// (the shape a dataframe-paired component snapshot has).
		const mixed = [
			{ id: 1, lang: LANG, value: 'MAIN-ONLY' },
			{ type: 'dd490', section_id: 9, section_tipo: 'test3', from_component_tipo: 'x1' },
			{ main_component_tipo: COMPONENT_TIPO, section_id_key: 1 }, // legacy frame shape
		];
		const inserted = (await sql.unsafe(
			`INSERT INTO matrix_time_machine
				(section_id, section_tipo, tipo, lang, timestamp, user_id, data)
			 VALUES ($1,$2,$3,$4,$5,$6,$7::text::jsonb) RETURNING id`,
			[
				recordId,
				SECTION_TIPO,
				COMPONENT_TIPO,
				LANG,
				'2026-01-01 00:00:00',
				-1,
				JSON.stringify(mixed),
			],
		)) as { id: number }[];

		const response = await dispatchToolRequest(
			SUPERUSER,
			-1,
			APPLY_SOURCE,
			applyOptions({ matrix_id: inserted[0]?.id }),
		);
		expect(response.ok).toBe(true);
		// Frames NEVER reach the live column — literal mains strip them too.
		expect(await liveValue()).toEqual([{ id: 1, lang: LANG, value: 'MAIN-ONLY' }]);
	});
});
