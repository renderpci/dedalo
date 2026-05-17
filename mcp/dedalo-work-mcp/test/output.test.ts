import { describe, test, expect } from 'bun:test';
import { buildPagination } from '../src/tools/_shared/output.js';
import type { DedaloResponse } from '@dedalo/mcp-common';

function res(data: unknown, total?: number): DedaloResponse {
	return { result: true, data, total } as DedaloResponse;
}

describe('buildPagination', () => {
	test('uses total when full_count was returned', () => {
		const p = buildPagination(res(new Array(10).fill(0), 100), 0, 50);
		expect(p).toEqual({ total: 100, offset: 0, count: 10, has_more: true, next_offset: 10 });
	});

	test('infers has_more from limit when total absent', () => {
		const p = buildPagination(res(new Array(50).fill(0)), 0, 50);
		expect(p?.total).toBeNull();
		expect(p?.has_more).toBe(true);
		expect(p?.next_offset).toBe(50);
	});

	test('no more when count < limit and no total', () => {
		const p = buildPagination(res(new Array(7).fill(0)), 0, 50);
		expect(p?.has_more).toBe(false);
		expect(p?.next_offset).toBeNull();
	});

	test('handles non-array data as count=0', () => {
		const p = buildPagination(res({ id: 1 }), 0, 50);
		expect(p?.count).toBe(0);
	});
});
