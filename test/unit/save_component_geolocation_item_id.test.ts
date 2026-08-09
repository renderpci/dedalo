/**
 * The server half of the geolocation append-vs-replace contract.
 *
 * THE LAW: a single-value component's stored array NEVER grows past one item.
 * A second save of a geolocation REPLACES the first — whatever the client sends.
 *
 * Two mechanisms hold it, and this file gates both:
 *  1. ids ARE minted server-side. saveComponentData stamps every id-less item
 *     with allocateComponentItemId before the write (the PHP set_data_item_counter
 *     twin), so the save response carries the id and the client's
 *     build_changed_data_item recovers it into the NEXT change.
 *  2. the monovalue guard (MONOVALUE_MODELS) is the belt: an id-less update of an
 *     already-populated monovalue component replaces element 0 instead of
 *     appending, so the array cannot double even when a door sends id:null twice.
 *
 * Deliberate PHP divergence: PHP's update branch appends an id-less change and
 * logs a warning (class.component_common.php:4209-4213); its monovalue registry
 * is consulted on the insert branch only.
 *
 * Client twin: client/dedalo/test/client/js/test_component_geolocation.js
 * ("build_changed_data_item RECOVERS the id from the stored entry").
 *
 * Pure: no DB, no scratch surface.
 */

import { describe, expect, test } from 'bun:test';
import {
	applyUpdate,
	getIdFromKey,
	isLangSlicedModel,
	isMonovalueModel,
	normalizeItemId,
} from '../../src/core/section/record/save_component.ts';

const geoValue = (lat: number, lon: number, id: unknown = null) => ({
	id,
	lat,
	lon,
	zoom: 9,
	alt: null,
});

/** The write-path chokepoint's id stamp (save_component.ts, post-applyUpdate):
 * every id-less item gets a fresh per-component counter id before the write. */
const stampMissingIds = (items: unknown[], counter: { next: number }): unknown[] => {
	for (const item of items) {
		if (item === null || typeof item !== 'object') continue;
		const id = (item as { id?: unknown }).id;
		if (id === undefined || id === null || id === '') {
			(item as { id: number }).id = counter.next++;
		}
	}
	return items;
};

describe('component_geolocation item id — the array never grows past 1', () => {
	test('component_geolocation is monovalue and not lang-sliced', () => {
		expect(isMonovalueModel('component_geolocation')).toBe(true);
		// not lang-sliced ⇒ applyUpdate takes the sliceLang===null branch and
		// ignores `key`, which is why the id (not the key) is the replace switch
		expect(isLangSlicedModel('component_geolocation')).toBe(false);
	});

	test('two saves of one geolocation leave ONE item, the second position winning', () => {
		const counter = { next: 1 };

		// save 1 — no stored value: the update creates the item, the chokepoint
		// mints its id
		const first = stampMissingIds(
			applyUpdate(
				[],
				{ action: 'update', key: 0, id: null, value: geoValue(41.6523, -4.7245) },
				null,
				true,
			),
			counter,
		);
		expect(first).toHaveLength(1);
		expect((first[0] as { id: unknown }).id).toBe(1);

		// save 2 — the client recovered the minted id from the save response
		const second = applyUpdate(
			first,
			{ action: 'update', key: 0, id: 1, value: geoValue(42.1, -3.9, 1) },
			null,
			true,
		);
		expect(second).toHaveLength(1);
		expect((second[0] as { lat: number }).lat).toBe(42.1);
		expect((second[0] as { id: unknown }).id).toBe(1);
	});

	test('an id-less SECOND save still replaces — the monovalue belt', () => {
		const counter = { next: 1 };
		const first = stampMissingIds(
			applyUpdate(
				[],
				{ action: 'update', key: 0, id: null, value: geoValue(41.6523, -4.7245) },
				null,
				true,
			),
			counter,
		);

		// a door that never recovered the id (a stale client, an import, an agent
		// change-plan): without the guard this appended and published two points
		const second = applyUpdate(
			first,
			{ action: 'update', key: 0, id: null, value: geoValue(42.1, -3.9) },
			null,
			true,
		);

		expect(second).toHaveLength(1);
		expect((second[0] as { lat: number }).lat).toBe(42.1);
		// the replacement inherits the stored id, so nothing is orphaned
		expect((second[0] as { id: unknown }).id).toBe(1);
	});

	test('the guard cannot suppress the FIRST save (empty array still appends)', () => {
		const created = applyUpdate(
			[],
			{ action: 'update', key: 0, id: null, value: geoValue(41.6523, -4.7245) },
			null,
			true,
		);
		expect(created).toHaveLength(1);
	});

	test('MULTI-VALUE models are untouched: an id-less update still appends', () => {
		expect(isMonovalueModel('component_portal')).toBe(false);

		const stored = [{ id: 7, section_tipo: 'test3', section_id: '1' }];
		const appended = applyUpdate(
			stored,
			{ action: 'update', key: 1, id: null, value: { section_tipo: 'test3', section_id: '2' } },
			null,
			false,
		);

		expect(appended).toHaveLength(2);
	});

	test('an update carrying the stored id REPLACES in place', () => {
		const stored = [geoValue(41.6523, -4.7245, 7)];

		const updated = applyUpdate(
			stored,
			{ action: 'update', key: 0, id: 7, value: geoValue(42.1, -3.9, 7) },
			null,
			true,
		);

		expect(updated).toHaveLength(1);
		expect((updated[0] as { lat: number }).lat).toBe(42.1);
		expect((updated[0] as { id: unknown }).id).toBe(7);
	});

	test('a numeric-string id still replaces (normalizeItemId)', () => {
		const stored = [geoValue(41.6523, -4.7245, 7)];

		const updated = applyUpdate(
			stored,
			{ action: 'update', key: 0, id: '7', value: geoValue(42.1, -3.9) },
			null,
			true,
		);

		expect(updated).toHaveLength(1);
		expect((updated[0] as { lat: number }).lat).toBe(42.1);
		// the replacement inherits the matched id, so the NEXT save still replaces
		expect(normalizeItemId((updated[0] as { id: unknown }).id)).toBe(7);
	});

	test('getIdFromKey cannot rescue a non-sliced id-less update', () => {
		// it groups by lang, and geolocation items carry none — which is why the
		// monovalue guard, not `key`, is what closes the id-less path
		const stored = [geoValue(41.6523, -4.7245, 7)];
		expect(getIdFromKey(stored, 0, [])).toBeNull();
	});

	test('a non-matching id appends rather than clobbering another item', () => {
		// an id that resolves nowhere is NOT the monovalue path (targetId is set),
		// so PHP's fallback stands: never destroy an item the change did not name
		const stored = [geoValue(41.6523, -4.7245, 7)];

		const updated = applyUpdate(
			stored,
			{ action: 'update', key: 0, id: 99, value: geoValue(42.1, -3.9, 99) },
			null,
			true,
		);

		expect(updated).toHaveLength(2);
		expect((updated[0] as { lat: number }).lat).toBe(41.6523);
	});
});
