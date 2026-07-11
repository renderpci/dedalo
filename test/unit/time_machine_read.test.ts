/**
 * Time Machine reader against the real DB.
 *
 * Also pins the two TM contract points that differ from standard matrix
 * tables (see time_machine.ts header): TM is NOT readable through the
 * standard matrix reader, and a row's section_tipo is the SOURCE section,
 * never 'dd15'.
 */

import { describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import {
	TIME_MACHINE_SECTION_TIPO,
	readTimeMachineHistory,
	readTimeMachineRow,
} from '../../src/core/db/time_machine.ts';

describe('time machine read (real DB)', () => {
	test('reads a real TM row by primary key with the flat audit contract', async () => {
		// Oldest row in the dev DB, seen via psql during scaffolding.
		const row = await readTimeMachineRow(50995944);
		expect(row).not.toBeNull();
		// section_tipo is the SOURCE section — the dd15 mismatch contract.
		expect(row?.section_tipo).not.toBe(TIME_MACHINE_SECTION_TIPO);
		expect(row?.tipo).toBeString();
		if (row?.dataText != null) {
			expect(JSON.parse(row.dataText)).toEqual(row.data);
		}
	});

	test('reads a component change history newest-first', async () => {
		const seed = await readTimeMachineRow(50995944);
		expect(seed).not.toBeNull();
		const history = await readTimeMachineHistory(
			seed?.section_tipo as string,
			seed?.section_id as number,
			seed?.tipo as string,
			10,
		);
		expect(history.length).toBeGreaterThan(0);
		// Newest first (search_tm default ordering).
		const timestamps = history.map((entry) => entry.timestamp ?? '');
		expect([...timestamps].sort().reverse()).toEqual(timestamps);
	});

	test('standard matrix reader refuses matrix_time_machine (different contract)', async () => {
		await expect(readMatrixRecord('matrix_time_machine', 'dd15', 1)).rejects.toThrow(/allowlist/);
	});
});
