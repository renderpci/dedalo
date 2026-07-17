/**
 * Session-SQO navigation merge (PHP dd_core_api :2159-2199 "received case",
 * TS-native contract — DEC-14b): navigation properties the client did NOT
 * send are filled from the session's stored SQO. This is the read-back half
 * of the session navigation contract; without it a secondary window opened
 * plain (page/?tipo=X) loses the filter its opener stored via the client's
 * open_records_in_window dummy build and shows the FULL section.
 *
 * PHP semantics pinned here:
 * - `!property_exists(client)` — a client-present key, EVEN explicit null,
 *   blocks the merge (first-load `limit: null` must resolve the config
 *   default, never the stored one);
 * - `isset(session)` — a null stored value is skipped;
 * - only filter/order/limit/offset/filter_by_locators/children_recursive
 *   merge — never mode/section_tipo;
 * - merged values are deep-cloned (no aliasing into the session store).
 */

import { describe, expect, test } from 'bun:test';
import { mergeSessionSqo } from '../../src/core/concepts/sqo.ts';

const ID_FILTER = {
	$and: [
		{
			q: ['5,9,12'],
			path: [
				{
					section_tipo: 'oh1',
					component_tipo: 'oh4',
					model: 'component_section_id',
					name: 'Id',
				},
			],
		},
	],
};

describe('mergeSessionSqo: PHP received-case parity', () => {
	test('absent client keys are filled from the stored SQO (all six)', () => {
		const client: Record<string, unknown> = { section_tipo: ['oh1'] };
		const stored = {
			filter: ID_FILTER,
			order: [{ direction: 'ASC' }],
			limit: 30,
			offset: 60,
			filter_by_locators: [{ section_tipo: 'oh1', section_id: '5' }],
			children_recursive: true,
		};
		mergeSessionSqo(client, stored);
		expect(client.filter).toEqual(ID_FILTER);
		expect(client.order).toEqual([{ direction: 'ASC' }]);
		expect(client.limit).toBe(30);
		expect(client.offset).toBe(60);
		expect(client.filter_by_locators).toEqual([{ section_tipo: 'oh1', section_id: '5' }]);
		expect(client.children_recursive).toBe(true);
	});

	test('a client-present key blocks the merge — explicit null included', () => {
		// The real client's first load sends limit/offset as explicit null;
		// PHP property_exists(null) is true → config default path, NOT session.
		const client: Record<string, unknown> = {
			section_tipo: ['oh1'],
			limit: null,
			offset: 0,
		};
		mergeSessionSqo(client, { limit: 30, offset: 60, filter: ID_FILTER });
		expect(client.limit).toBeNull();
		expect(client.offset).toBe(0);
		expect(client.filter).toEqual(ID_FILTER); // absent key still merges
	});

	test('a null stored value is skipped (PHP isset)', () => {
		const client: Record<string, unknown> = { section_tipo: ['oh1'] };
		mergeSessionSqo(client, { filter: null, order: undefined, limit: 30 });
		expect(Object.hasOwn(client, 'filter')).toBe(false);
		expect(Object.hasOwn(client, 'order')).toBe(false);
		expect(client.limit).toBe(30);
	});

	test('only the six navigation keys merge — mode/section_tipo/id never', () => {
		const client: Record<string, unknown> = { section_tipo: ['oh1'] };
		mergeSessionSqo(client, {
			mode: 'edit',
			section_tipo: ['rsc197'],
			id: 'oh1',
			parsed: true,
			limit: 30,
		});
		expect(client.section_tipo).toEqual(['oh1']);
		expect(Object.hasOwn(client, 'mode')).toBe(false);
		expect(Object.hasOwn(client, 'id')).toBe(false);
		expect(Object.hasOwn(client, 'parsed')).toBe(false);
		expect(client.limit).toBe(30);
	});

	test('merged values are deep-cloned — mutating the result never reaches the store', () => {
		const stored = { filter: structuredClone(ID_FILTER) };
		const client: Record<string, unknown> = { section_tipo: ['oh1'] };
		mergeSessionSqo(client, stored);
		(client.filter as { $and: unknown[] }).$and.length = 0;
		expect(stored.filter.$and).toHaveLength(1);
	});

	test('non-object stored SQO is a no-op (corrupt session row tolerated)', () => {
		const client: Record<string, unknown> = { section_tipo: ['oh1'] };
		expect(mergeSessionSqo(client, null)).toBe(client);
		expect(mergeSessionSqo(client, 'garbage')).toBe(client);
		expect(mergeSessionSqo(client, [1, 2])).toBe(client);
		expect(Object.keys(client)).toEqual(['section_tipo']);
	});

	test('secondary-window shape survives the merge end-to-end', () => {
		// The exact scenario the client relies on: dummy build stored a
		// section_id filter; the new window sends the bare first-load SQO.
		const firstLoad: Record<string, unknown> = {
			section_tipo: ['oh1'],
			limit: null,
			offset: 0,
		};
		const dummyStored = { section_tipo: ['oh1'], limit: 1, offset: 0, filter: ID_FILTER };
		mergeSessionSqo(firstLoad, dummyStored);
		expect(firstLoad.filter).toEqual(ID_FILTER); // the related-records filter arrives
		expect(firstLoad.limit).toBeNull(); // pagination still resolves mode default
	});
});
