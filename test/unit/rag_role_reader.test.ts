/**
 * The characterizer's role reader — date handling.
 *
 * REGRESSION (2026-07-28): component_date stores structured `{start, end}`
 * objects in the `date` column, which carry no `.value`. The reader flattened
 * every component through the string-text path first, so a date flattened to ''
 * and the reader returned null BEFORE its own date branch could run — every
 * date role was silently missing from characterize proposals, and the branch
 * itself was dead code.
 *
 * The span logic is tested deterministically over synthetic stored items (the
 * `component_data_null_filter.test.ts` pattern); one DB-backed case asserts the
 * reader actually ROUTES a date model to that logic, which is the part that was
 * broken.
 */

import { describe, expect, test } from 'bun:test';
import { buildRoleReader, spanOfDateItems } from '../../src/ai/rag/role_reader.ts';
import { ddDateToSeconds } from '../../src/core/media/file_date.ts';

/** A stored component_date item as the matrix holds it. */
const item = (start: object | null, end?: object | null) => ({
	id: 1,
	...(start === null ? {} : { start }),
	...(end === undefined || end === null ? {} : { end }),
});

describe('spanOfDateItems', () => {
	test('a start+end item spans both endpoints and labels the range', () => {
		const span = spanOfDateItems([
			item({ year: 1999, month: 1, day: 1 }, { year: 2008, month: 9, day: 30 }),
		]);
		expect(span).not.toBeNull();
		expect(span?.from).toBe(ddDateToSeconds({ year: 1999, month: 1, day: 1 }));
		expect(span?.to).toBe(ddDateToSeconds({ year: 2008, month: 9, day: 30 }));
		// The bug this file guards: from === to (a zero-width range) would make
		// the characterizer's confidence meaningless.
		expect(span?.from).toBeLessThan(span?.to as number);
		expect(span?.label).toBe('1999/01/01 <> 2008/09/30');
	});

	test('a point date closes on its own start', () => {
		const span = spanOfDateItems([item({ year: -218 })]);
		expect(span?.from).toBe(ddDateToSeconds({ year: -218 }));
		expect(span?.to).toBe(span?.from);
		expect(span?.label).toBe('-218');
	});

	test('multiple items collapse to the widest span', () => {
		const span = spanOfDateItems([
			item({ year: 1950 }, { year: 1960 }),
			item({ year: 1900 }, { year: 1910 }),
			item({ year: 2000 }),
		]);
		expect(span?.from).toBe(ddDateToSeconds({ year: 1900 }));
		expect(span?.to).toBe(ddDateToSeconds({ year: 2000 }));
	});

	test('BCE years order below CE years on one scale', () => {
		const bce = spanOfDateItems([item({ year: -50 })]);
		const ce = spanOfDateItems([item({ year: 50 })]);
		expect(bce?.from).toBeLessThan(ce?.from as number);
	});

	test('yearless items yield null, never a 0-seconds range', () => {
		// {time: 0} with no year is the junk shape a legacy save could persist;
		// treating it as year 0 would drag every span back to the epoch.
		expect(spanOfDateItems([item({ time: 0 })])).toBeNull();
		expect(spanOfDateItems([])).toBeNull();
		expect(spanOfDateItems([null, '', 7])).toBeNull();
	});

	test('a yearless item does not poison a usable sibling', () => {
		const span = spanOfDateItems([item({ time: 0 }), item({ year: 1888 })]);
		expect(span?.from).toBe(ddDateToSeconds({ year: 1888 }));
		expect(span?.to).toBe(ddDateToSeconds({ year: 1888 }));
	});
});

describe('buildRoleReader', () => {
	test('routes a component_date to the date reader (not the text path)', async () => {
		// test3/1·test145 is the canonical playground date; the fixture manifest
		// pins it as hole-free. Values are not asserted (other suites edit the
		// record) — only that a date resolves at all, which is the regression.
		const read = buildRoleReader(['lg-spa'], 'lg-nolan');
		const result = await read('period', 'test145', {
			sectionTipo: 'test3',
			sectionId: 1,
			score: 1,
		} as Parameters<typeof read>[2]);

		expect(result).not.toBeNull();
		expect(result?.kind).toBe('date');
		if (result?.kind === 'date') {
			expect(result.to).toBeGreaterThanOrEqual(result.from);
			expect(result.label).not.toBe('');
		}
	});
});
