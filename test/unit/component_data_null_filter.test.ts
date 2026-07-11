/**
 * readComponentItems null-hole filter (2026-07-04, user-reported client crash).
 *
 * A corrupt/legacy record can store a `null` (or '') hole in a component's data
 * array. PHP get_data emits it verbatim, which CRASHES the copied client — the
 * date edit renderer reads `current_value.id` on a null entry at index>0
 * (render_edit_component_date.js). We diverge from that PHP live defect and strip
 * the holes at the single read chokepoint so no view (edit/list/export) ever
 * receives a null item; a later save then self-heals the stored array.
 *
 * Deterministic unit test (the differential fixture test3/1·test145 depends on
 * volatile stored data). See rewrite/STATUS.md "component_data null-hole filter".
 */

import { describe, expect, test } from 'bun:test';
import type { MatrixRecord } from '../../src/core/db/matrix.ts';
import { readComponentItems } from '../../src/core/resolve/component_data.ts';

function dateRecord(items: unknown[]): MatrixRecord {
	return {
		id: 1,
		section_id: 1,
		section_tipo: 'test3',
		columns: { date: { test145: items } },
		rawText: {},
	};
}

describe('readComponentItems null-hole filter', () => {
	const a = { id: 1, start: { year: 2023, month: 6, day: 1 } };
	const b = { id: 2, start: { year: 2024, month: 1, day: 1 } };

	test('drops trailing null hole (the reported crash shape)', () => {
		expect(readComponentItems(dateRecord([a, b, null]), 'test145', 'component_date')).toEqual([
			a,
			b,
		]);
	});

	test('drops null AND empty-string holes anywhere in the array', () => {
		expect(readComponentItems(dateRecord([a, null, b, '']), 'test145', 'component_date')).toEqual([
			a,
			b,
		]);
	});

	test('an all-holes array collapses to []', () => {
		expect(readComponentItems(dateRecord([null, '']), 'test145', 'component_date')).toEqual([]);
	});

	test('a clean array is returned unchanged', () => {
		expect(readComponentItems(dateRecord([a, b]), 'test145', 'component_date')).toEqual([a, b]);
	});

	test('non-array scalar is still coerced to a single-item array', () => {
		expect(
			readComponentItems(dateRecord(a as unknown as unknown[]), 'test145', 'component_date'),
		).toEqual([a]);
	});
});
