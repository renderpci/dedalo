/**
 * S1-07 ROUND-TRIP SCRATCH GATE — writeRegistryRecord (dd1324 tools registry).
 *
 * The pre-fix writer had BOTH corruption modes of the unpoliced binding
 * convention: UPDATE bound `JSON.stringify` output as `$n::jsonb` (Bun 1.3.9
 * double-encodes → jsonb STRING scalar — the row becomes unfindable by TS
 * readRegistryByName AND PHP get_tools on the SHARED registry), and the
 * INSERT referenced an unbound `$1` (42P18 — could never execute, which also
 * shielded a bare MAX+1 counter race).
 *
 * This gate MUST be green before TOOLS_ENABLE_REGISTRY_IMPORT is ever enabled
 * (REMEDIATION WS-A item 3). It runs the real writer against the SCRATCH
 * surface (matrix_test + a zztws* section tipo) via the injectable
 * RegistryWriteTarget:
 *   - INSERT lands with jsonb_typeof='object' on every written column;
 *   - section_id allocation goes through the matrix counter (advances, never
 *     bare MAX+1) and self-heals like any counter insert;
 *   - the row is findable by name through the same ->> extraction the
 *     registry reader uses;
 *   - UPDATE keeps jsonb_typeof='object' and replaces the identity columns.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import type { RegistryRow, ToolRecord } from '../../src/core/tools/register.ts';
import { writeRegistryRecord } from '../../src/core/tools/register.ts';
import { cleanScratchTipo } from '../helpers/test_data.ts';

const TARGET = { table: 'matrix_test', sectionTipo: 'zztws2' } as const;

/** Minimal column-keyed tool record (TIPO.NAME dd1326 lives in `string`). */
function toolRecord(name: string, version: string): ToolRecord {
	return {
		data: {},
		string: {
			dd1326: [{ value: name, lang: 'lg-nolan' }],
			dd1327: [{ value: version, lang: 'lg-nolan' }],
		},
		relation: {
			dd1354: [{ section_tipo: 'dd64', section_id: '1', type: 'dd96' }], // active
		},
		misc: {
			dd1335: [{ value: { view: 'default' } }],
		},
	} as unknown as ToolRecord;
}

async function clean(): Promise<void> {
	await cleanScratchTipo(TARGET.sectionTipo);
}

describe('S1-07 — writeRegistryRecord round-trip on the scratch target', () => {
	beforeAll(clean);
	afterAll(clean);

	test('INSERT: executes, allocates via the counter, stores objects (never jsonb strings)', async () => {
		await writeRegistryRecord('tool_scratch_probe', toolRecord('tool_scratch_probe', '1.0'), null, {
			...TARGET,
		});

		const rows = (await sql.unsafe(
			`SELECT section_id,
			        jsonb_typeof(string)   AS string_type,
			        jsonb_typeof(relation) AS relation_type,
			        jsonb_typeof(misc)     AS misc_type,
			        string->'dd1326'->0->>'value' AS name
			 FROM matrix_test WHERE section_tipo = $1`,
			[TARGET.sectionTipo],
		)) as {
			section_id: number;
			string_type: string;
			relation_type: string;
			misc_type: string;
			name: string;
		}[];
		expect(rows.length).toBe(1);
		// The double-encode corruption mode: these would be 'string'.
		expect(rows[0]?.string_type).toBe('object');
		expect(rows[0]?.relation_type).toBe('object');
		expect(rows[0]?.misc_type).toBe('object');
		// Findable by name via the reader's ->> extraction (the corrupted row
		// was unfindable by BOTH engines).
		expect(rows[0]?.name).toBe('tool_scratch_probe');

		// Counter-backed allocation (never bare MAX+1): the counter row exists
		// and matches the allocated id.
		const counter = (await sql.unsafe('SELECT value FROM matrix_counter WHERE tipo = $1', [
			TARGET.sectionTipo,
		])) as { value: number }[];
		expect(Number(counter[0]?.value)).toBe(Number(rows[0]?.section_id));

		// A second insert advances the counter (no id reuse).
		await writeRegistryRecord(
			'tool_scratch_probe2',
			toolRecord('tool_scratch_probe2', '1.0'),
			null,
			{
				...TARGET,
			},
		);
		const ids = (await sql.unsafe(
			'SELECT section_id FROM matrix_test WHERE section_tipo = $1 ORDER BY section_id',
			[TARGET.sectionTipo],
		)) as { section_id: number }[];
		expect(ids.length).toBe(2);
		expect(Number(ids[1]?.section_id)).toBe(Number(ids[0]?.section_id) + 1);
	}, 30000);

	test('UPDATE: replaces the identity columns, still objects', async () => {
		const before = (await sql.unsafe(
			`SELECT section_id FROM matrix_test WHERE section_tipo = $1
			 AND string->'dd1326'->0->>'value' = 'tool_scratch_probe'`,
			[TARGET.sectionTipo],
		)) as { section_id: number }[];
		const sectionId = Number(before[0]?.section_id);
		expect(Number.isFinite(sectionId)).toBe(true);

		const existing = {
			sectionId,
			record: toolRecord('tool_scratch_probe', '1.0'),
		} as unknown as RegistryRow;
		await writeRegistryRecord(
			'tool_scratch_probe',
			toolRecord('tool_scratch_probe', '2.0'),
			existing,
			{ ...TARGET },
		);

		const rows = (await sql.unsafe(
			`SELECT jsonb_typeof(string) AS string_type,
			        string->'dd1327'->0->>'value' AS version
			 FROM matrix_test WHERE section_tipo = $1 AND section_id = $2`,
			[TARGET.sectionTipo, sectionId],
		)) as { string_type: string; version: string }[];
		expect(rows[0]?.string_type).toBe('object'); // UPDATE was the live corruption mode
		expect(rows[0]?.version).toBe('2.0');
	}, 30000);
});
