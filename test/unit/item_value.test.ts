/**
 * ITEM VALUE IDENTITY (src/core/concepts/item_value.ts) — the id-blind rule the
 * propagate pre-check and the save door's set_data id carry-over share.
 *
 * HERMETIC: pure functions, no DB.
 */

import { describe, expect, test } from 'bun:test';
import { adoptStoredItemIds, sameItemValue } from '../../src/core/concepts/item_value.ts';

describe('sameItemValue', () => {
	test('blind to the stored id only when the candidate names none', () => {
		expect(
			sameItemValue({ id: 3, lang: 'lg-spa', value: 'x' }, { value: 'x', lang: 'lg-spa' }),
		).toBe(true);
		expect(sameItemValue({ id: 3, value: 'x' }, { id: 4, value: 'x' })).toBe(false);
		expect(sameItemValue({ id: 3, value: 'x' }, { value: 'y' })).toBe(false);
	});
});

describe('adoptStoredItemIds', () => {
	test('an equal item at the SAME position keeps the stored id; a copy, never the caller object', () => {
		const incoming = [{ lang: 'lg-spa', value: 'x' }];
		const out = adoptStoredItemIds(incoming, [{ id: 7, lang: 'lg-spa', value: 'x' }]);
		expect(out).toEqual([{ lang: 'lg-spa', value: 'x', id: 7 }]);
		expect(incoming[0]).toEqual({ lang: 'lg-spa', value: 'x' });
	});

	test('a REORDER is a change: no id travels to another position', () => {
		const out = adoptStoredItemIds(
			[{ value: 'b' }, { value: 'a' }],
			[
				{ id: 1, value: 'a' },
				{ id: 2, value: 'b' },
			],
		);
		expect(out).toEqual([{ value: 'b' }, { value: 'a' }]);
	});

	test('an id another incoming item names is never adopted twice', () => {
		const out = adoptStoredItemIds(
			[{ value: 'a' }, { id: 1, value: 'z' }],
			[{ id: 1, value: 'a' }],
		);
		expect(out).toEqual([{ value: 'a' }, { id: 1, value: 'z' }]);
	});
});

describe('sameItemValue — compared AS PERSISTED (derived date `time`)', () => {
	// The save door stamps component_date's derived `time` AFTER the id
	// carry-over; a CSV/propagated date names none. Without the persisted-form
	// comparison every re-import of an unchanged date re-minted its id.
	const stored = { id: 7, start: { year: 2020, month: 1, day: 2, time: 64924502400 } };

	test('a time-less incoming date equals its stamped stored twin', () => {
		expect(sameItemValue(stored, { start: { year: 2020, month: 1, day: 2 } })).toBe(true);
		expect(adoptStoredItemIds([{ start: { year: 2020, month: 1, day: 2 } }], [stored])).toEqual([
			{ start: { year: 2020, month: 1, day: 2 }, id: 7 },
		]);
	});

	test('a different date is still a change; a stale client time never masks it', () => {
		expect(sameItemValue(stored, { start: { year: 2020, month: 1, day: 3 } })).toBe(false);
		expect(
			sameItemValue(stored, { start: { year: 2021, month: 1, day: 2, time: 64924502400 } }),
		).toBe(false);
	});

	test('neither side is mutated by the comparison', () => {
		const candidate = { start: { year: 2020, month: 1, day: 2 } };
		sameItemValue(stored, candidate);
		expect(candidate).toEqual({ start: { year: 2020, month: 1, day: 2 } });
	});
});
