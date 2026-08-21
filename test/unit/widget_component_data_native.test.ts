/**
 * readWidgetComponentData (component_info/widgets/widget_common.ts) — the
 * NO-RECORD case of a section whose declared matrix_table is not a readable
 * record store.
 *
 * dd15 (Time Machine) is a section whose ontology matrix_table is
 * `matrix_time_machine`: flat columns, NOT the jsonb matrix shape, and
 * deliberately OFF MATRIX_TABLE_ALLOWLIST. section/read.ts already serves that
 * section's components as the no-record branch; this helper did not, so any
 * component_info widget over a dd15 component threw
 * `internal.invariant` ("Refusing unknown matrix table 'matrix_time_machine'")
 * out of assertMatrixTable instead of rendering empty.
 *
 * Non-vacuity: the first case pins that dd15 REALLY resolves to that table
 * (otherwise the second would pass for the wrong reason), and the third pins
 * that the allowlist itself still refuses the table — the fix is a caller-side
 * no-record branch, not a widened gate.
 *
 * Read-only: no scratch surface, no DB write.
 */

import { describe, expect, test } from 'bun:test';
import { readWidgetComponentData } from '../../src/core/components/component_info/widgets/widget_common.ts';
import { isMatrixTable, readMatrixRecord } from '../../src/core/db/matrix.ts';
import { getMatrixTableFromTipo } from '../../src/core/ontology/resolver.ts';

describe('readWidgetComponentData: non-record matrix table', () => {
	test('dd15 resolves to matrix_time_machine, which is NOT a record table', async () => {
		expect(await getMatrixTableFromTipo('dd15')).toBe('matrix_time_machine');
		expect(isMatrixTable('matrix_time_machine')).toBe(false);
	});

	test('a dd15 component serves [] instead of throwing internal.invariant', async () => {
		expect(await readWidgetComponentData('dd15', 1, 'dd16')).toEqual([]);
	});

	test('the identifier allowlist still refuses the table directly', async () => {
		expect(readMatrixRecord('matrix_time_machine', 'dd15', 1)).rejects.toThrow(
			/Refusing unknown matrix table/,
		);
	});
});
