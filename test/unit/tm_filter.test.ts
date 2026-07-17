/**
 * conformTmFilter unit gate (no DB) — dd15 Time Machine component search was
 * ENTIRELY IGNORED before 2026-07-17 (buildTmWhere returned all rows for any
 * component clause). Locks the physical-column SQL per component kind and the
 * operator grammar (PHP search_tm + the _tm traits): number/date/string/json/
 * relation over the flat matrix_time_machine columns, values as bound $N params.
 */

import { describe, expect, test } from 'bun:test';
import { conformTmFilter } from '../../src/core/resolve/tm_filter.ts';

/** Run one leaf (unwrapped) through the conformer; returns {sql, params}. */
function one(componentTipo: string, q: unknown, qOperator: string) {
	const params: unknown[] = [];
	const sql = conformTmFilter(
		{ path: [{ section_tipo: 'dd15', component_tipo: componentTipo }], q, q_operator: qOperator },
		{ params },
	);
	return { sql, params };
}

describe('conformTmFilter — number columns (id/section_id/bulk_process_id)', () => {
	test('Section id (dd1212) = 2 → section_id = $1', () => {
		expect(one('dd1212', ['2'], '=')).toEqual({ sql: 'section_id = $1', params: [2] });
	});
	test('directional and inline operators', () => {
		expect(one('dd1212', ['2'], '>').sql).toBe('section_id > $1');
		expect(one('dd1212', ['>=5'], '').sql).toBe('section_id >= $1');
		expect(one('dd1573', null, '!*').sql).toBe('id IS NULL');
		expect(one('dd1371', null, '*').sql).toBe('bulk_process_id IS NOT NULL');
	});
	test('non-numeric input never matches (1=0)', () => {
		expect(one('dd1212', ['abc'], '=').sql).toBe('1=0');
	});
});

describe('conformTmFilter — date column (timestamp, WC-036 span semantics)', () => {
	test('When (dd559) = 2026 → whole-year half-open range', () => {
		expect(one('dd559', ['2026'], '=')).toEqual({
			sql: '("timestamp" >= $1::date AND "timestamp" < $2::date)',
			params: ['2026-01-01', '2027-01-01'],
		});
	});
	test('> a full day → strictly after (>= next day)', () => {
		expect(one('dd559', [{ start: { year: 2026, month: 7, day: 16 } }], '>')).toEqual({
			sql: '"timestamp" >= $1::date',
			params: ['2026-07-17'],
		});
	});
});

describe('conformTmFilter — string columns (tipo/section_tipo)', () => {
	test('== exact, != not-contains, default exact', () => {
		expect(one('dd1772', ['rsc197'], '==')).toEqual({
			sql: 'section_tipo = $1',
			params: ['rsc197'],
		});
		expect(one('dd1772', ['rsc197'], '!=')).toEqual({
			sql: 'section_tipo NOT ILIKE $1',
			params: ['%rsc197%'],
		});
		expect(one('dd1772', ['rsc197'], '')).toEqual({ sql: 'section_tipo = $1', params: ['rsc197'] });
	});
	test('wildcard → ILIKE, existence', () => {
		expect(one('dd1772', ['*rsc*'], '')).toEqual({
			sql: 'section_tipo ILIKE $1',
			params: ['%rsc%'],
		});
		expect(one('dd577', null, '!*').sql).toBe("(tipo IS NULL OR tipo = '')");
	});
});

describe('conformTmFilter — json (data) and relation (user_id)', () => {
	test('Value (dd1574) contains → CAST text ILIKE', () => {
		expect(one('dd1574', ['rsc197'], '')).toEqual({
			sql: 'CAST(data AS text) ILIKE $1',
			params: ['%rsc197%'],
		});
	});
	test('Who (dd578) = locator → user_id = section_id', () => {
		expect(one('dd578', [{ section_tipo: 'dd128', section_id: 2 }], '=')).toEqual({
			sql: 'user_id = $1',
			params: ['2'],
		});
		expect(one('dd578', null, '*').sql).toBe('user_id IS NOT NULL');
	});
});

describe('conformTmFilter — structure', () => {
	test('AND of two clauses combines with shared $N numbering', () => {
		const params: unknown[] = [];
		const sql = conformTmFilter(
			{
				$and: [
					{ path: [{ component_tipo: 'dd1212' }], q: ['2'], q_operator: '=' },
					{ path: [{ component_tipo: 'dd1772' }], q: ['rsc197'], q_operator: '==' },
				],
			},
			{ params },
		);
		expect(sql).toBe('(section_id = $1 AND section_tipo = $2)');
		expect(params).toEqual([2, 'rsc197']);
	});

	test('no component clause → null (buildTmWhere falls back to all rows)', () => {
		expect(conformTmFilter(undefined, { params: [] })).toBeNull();
		expect(
			conformTmFilter({ $and: [{ column_name: 'tipo', q: 'dd542' }] }, { params: [] }),
		).toBeNull();
	});

	test('an unmapped component tipo throws loudly (no silent narrowing)', () => {
		expect(() => one('dd9999', ['x'], '=')).toThrow(/no matrix_time_machine column/);
	});
});
