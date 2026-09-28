/**
 * LANG REGION — the part of a key one language's write owns, and its inverse
 * (src/core/concepts/lang_region.ts). The undo log records a sliced write's
 * BEFORE/AFTER as regions and a revert puts one back with restoreRegion, so the
 * round trip must be exact: other languages untouched, orphans restored once,
 * absence distinct from an unsliced empty key (a region holding nothing IS absence).
 *
 * HERMETIC: pure functions, no DB.
 */

import { describe, expect, test } from 'bun:test';
import { canonicalJson } from '../../src/core/concepts/canonical_json.ts';
import {
	isOtherLangItem,
	keyImage,
	regionOf,
	restoreRegion,
} from '../../src/core/concepts/lang_region.ts';

const SPA = 'lg-spa';
const ENG = 'lg-eng';
const spa = (value: string) => ({ id: 1, lang: SPA, value });
const eng = (value: string) => ({ id: 1, lang: ENG, value });
const orphan = { id: 2, value: 'PHP-era, no lang' };

describe('isOtherLangItem', () => {
	test('only an object with a DIFFERENT non-empty lang is another language’s', () => {
		expect(isOtherLangItem(eng('x'), SPA)).toBe(true);
		expect(isOtherLangItem(spa('x'), SPA)).toBe(false);
		expect(isOtherLangItem(orphan, SPA)).toBe(false);
		expect(isOtherLangItem({ lang: '' }, SPA)).toBe(false);
		expect(isOtherLangItem({ lang: 7 }, SPA)).toBe(false);
		expect(isOtherLangItem(null, SPA)).toBe(false);
		expect(isOtherLangItem('scalar', SPA)).toBe(false);
	});
});

describe('regionOf', () => {
	test('sliced: every item not another language’s — orphans INCLUDED', () => {
		const region = regionOf([eng('e'), spa('s'), orphan], SPA, true);
		expect(region).toHaveLength(2);
		expect(region).toEqual([spa('s'), orphan]);
	});

	test('unsliced: the whole key; absent stays absent; a non-array value is whole', () => {
		const value = [eng('e'), spa('s')];
		expect(regionOf(value, SPA, false)).toBe(value);
		expect(regionOf(undefined, SPA, true)).toBeUndefined();
		expect(regionOf({ not: 'an array' }, SPA, true)).toEqual({ not: 'an array' });
	});

	test('a non-array value is ONE item, read by its language like the save path reads it', () => {
		// A PHP-era key stored as a single object: another language's item is NOT
		// ours (the save keeps it); our own item, or an orphan, is the region whole.
		expect(regionOf(eng('e'), SPA, true)).toBeUndefined();
		expect(regionOf(spa('s'), SPA, true)).toEqual(spa('s'));
		expect(regionOf(orphan, SPA, true)).toEqual(orphan);
		expect(regionOf(eng('e'), SPA, false)).toEqual(eng('e'));
	});
});

describe('regionOf — the ONE absence law', () => {
	test('a stored JSON null is absence, sliced or not', () => {
		expect(regionOf(null, SPA, true)).toBeUndefined();
		expect(regionOf(null, SPA, false)).toBeUndefined();
		expect(keyImage(null)).toBeUndefined();
		expect(keyImage([])).toEqual([]);
	});

	test('sliced: a key with no item of the region is absence — [] and other-languages-only alike', () => {
		expect(regionOf([], SPA, true)).toBeUndefined();
		expect(regionOf([eng('e')], SPA, true)).toBeUndefined();
		// …and restoring it removes the key unless another language survives.
		expect(restoreRegion([spa('s')], SPA, regionOf([], SPA, true), true)).toBeUndefined();
		expect(restoreRegion([eng('e'), spa('s')], SPA, regionOf([eng('e')], SPA, true), true)).toEqual(
			[eng('e')],
		);
	});

	test('unsliced: [] is a present, empty key (the whole key is the region)', () => {
		expect(regionOf([], SPA, false)).toEqual([]);
	});
});

describe('restoreRegion', () => {
	test('round trip: region(before) put back over a live key that moved on', () => {
		const before = [eng('e0'), spa('s0'), orphan];
		// The write replaced the spa region (the orphan was dropped by set_data).
		const live = [eng('e1'), spa('s1')];
		const restored = restoreRegion(live, SPA, regionOf(before, SPA, true), true);
		// eng keeps its LIVE value (not ours); spa + the orphan come back, once.
		expect(restored).toEqual([eng('e1'), spa('s0'), orphan]);
		expect(canonicalJson(regionOf(restored, SPA, true))).toBe(
			canonicalJson(regionOf(before, SPA, true)),
		);
	});

	test('a live orphan is part of OUR region: replaced IN PLACE, never duplicated', () => {
		const restored = restoreRegion([orphan, eng('e')], SPA, [orphan], true);
		expect(restored).toEqual([orphan, eng('e')]);
	});

	test('in place: reverting one language never reorders another language’s region', () => {
		// An orphan belongs to BOTH regions. Run: spa insert, then eng insert.
		const pre = [orphan, eng('e')];
		const afterSpa = [orphan, eng('e'), spa('s')];
		const afterEng = [orphan, eng('e'), spa('s'), { id: 3, lang: ENG, value: 'e2' }];
		// Revert spa first: eng's live region must still equal its recorded after.
		const spaReverted = restoreRegion(afterEng, SPA, regionOf(pre, SPA, true), true);
		expect(canonicalJson(regionOf(spaReverted, ENG, true))).toBe(
			canonicalJson(regionOf(afterEng, ENG, true)),
		);
		const done = restoreRegion(spaReverted, ENG, regionOf(afterSpa, ENG, true), true);
		expect(done).toEqual(pre);
	});

	test('no live region item: the region is appended after the other languages', () => {
		expect(restoreRegion([eng('e')], SPA, [spa('s')], true)).toEqual([eng('e'), spa('s')]);
	});

	test('absent region: remove the key, unless another language survives', () => {
		expect(restoreRegion([spa('s')], SPA, undefined, true)).toBeUndefined();
		expect(restoreRegion([spa('s'), eng('e')], SPA, undefined, true)).toEqual([eng('e')]);
		expect(restoreRegion([spa('s')], SPA, undefined, false)).toBeUndefined();
	});

	test('an empty region is kept as a present, empty key', () => {
		expect(restoreRegion([spa('s')], SPA, [], true)).toEqual([]);
	});

	test('unsliced: the region replaces the whole key', () => {
		expect(restoreRegion([eng('e')], SPA, [spa('s')], false)).toEqual([spa('s')]);
	});

	test('round trip over a non-array OTHER-language stored value (PHP-era single object)', () => {
		// Stored `{eng}`; a spa save keeps it and adds spa: [{eng}, {spa new}].
		const stored = eng('e');
		const persisted = [eng('e'), spa('new')];
		const before = regionOf(stored, SPA, true);
		expect(before).toBeUndefined();
		expect(regionOf(persisted, SPA, true)).toEqual([spa('new')]);
		// The revert restores spa to absent and keeps the eng item — no throw.
		expect(restoreRegion(persisted, SPA, before, true)).toEqual([eng('e')]);
		// A non-array other-language LIVE value survives a restore beside it.
		expect(restoreRegion(eng('e'), SPA, [spa('s')], true)).toEqual([eng('e'), spa('s')]);
		expect(restoreRegion(eng('e'), SPA, undefined, true)).toEqual([eng('e')]);
	});

	test('a non-array region beside surviving other languages is the ONE item it is, spliced in', () => {
		expect(restoreRegion(undefined, SPA, { v: 1 }, true)).toEqual({ v: 1 });
		expect(restoreRegion([eng('e')], SPA, { v: 1 }, true)).toEqual([eng('e'), { v: 1 }]);
		// In place of the live region's first item, other languages' order kept.
		expect(restoreRegion([eng('e'), spa('s'), eng('f')], SPA, { v: 1 }, true)).toEqual([
			eng('e'),
			{ v: 1 },
			eng('f'),
		]);
	});
});
