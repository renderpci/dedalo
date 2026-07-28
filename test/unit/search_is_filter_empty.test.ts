/**
 * Client-contract gate for `is_filter_empty` (client search_utils.js).
 *
 * A leaf filter row ALWAYS carries a `q` key; its value is empty when the user
 * opened the panel without entering a search value (`q:''` / `q:null` / `q:[]`).
 * The classifier must treat such a leaf as an EMPTY leaf, never as a nested
 * group. Misclassifying it triggered recursion INTO the leaf, iterating its own
 * scalar props (`lang:null` -> `.length` of null crash; `lang:'es'` -> infinite
 * recursion). Reproduced live opening the dd15 search panel:
 *   "TypeError: Cannot read properties of null (reading 'length')"
 */

import { describe, expect, test } from 'bun:test';
// @ts-expect-error — vanilla client ES module, no types
import { is_filter_empty } from '../../client/dedalo/core/search/js/search_utils.js';

describe('is_filter_empty', () => {
	test('default empty group is empty', () => {
		expect(is_filter_empty({ $and: [] })).toBe(true);
	});

	test('leaf with empty-string q (unentered value) is empty, no crash', () => {
		const filter = {
			$and: [{ path: [{ section_tipo: 'dd15' }], q: '', q_operator: '', lang: null }],
		};
		expect(is_filter_empty(filter)).toBe(true);
	});

	test('leaf with null q is empty, no infinite recursion', () => {
		const filter = { $and: [{ path: [1], q: null, q_operator: null, lang: 'es' }] };
		expect(is_filter_empty(filter)).toBe(true);
	});

	test('leaf with empty-array q is empty', () => {
		const filter = { $and: [{ path: [1], q: [], q_operator: null, lang: null }] };
		expect(is_filter_empty(filter)).toBe(true);
	});

	test('leaf with a real value is NOT empty', () => {
		const filter = {
			$and: [{ path: [1], q: [{ id: 1, value: '5' }], q_operator: null, lang: 'es' }],
		};
		expect(is_filter_empty(filter)).toBe(false);
	});

	test('nested groups: empty everywhere is empty', () => {
		const filter = {
			$and: [{ path: [1], q: '', lang: null }, { $or: [{ path: [2], q: null, lang: null }] }],
		};
		expect(is_filter_empty(filter)).toBe(true);
	});

	test('nested groups: one real value makes the whole filter non-empty', () => {
		const filter = {
			$and: [
				{ path: [1], q: '', lang: null },
				{ $or: [{ path: [2], q: [{ id: 1, value: 'x' }], lang: null }] },
			],
		};
		expect(is_filter_empty(filter)).toBe(false);
	});
});
