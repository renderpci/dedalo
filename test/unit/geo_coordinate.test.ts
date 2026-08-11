/**
 * THE geo-coordinate law gate (src/core/concepts/geo_coordinate.ts) — the ONE
 * predicate behind the import door (import_conform.ts) and the three
 * publication paths (default_value.ts, ddo_fns.ts, parser_misc.ts), plus
 * scripts/repair_geolocation_studio_default.ts's candidate test.
 *
 * It is pure and dependency-free, and it decides whether a stored location
 * publishes or vanishes, so it is pinned directly rather than through its
 * callers.
 *
 * The two clauses that are LAW rather than description:
 *   - 0 is a coordinate, '' is not (absence is structural);
 *   - the RANGE is an INPUT-door rule. hasCoordinate carries no range opinion,
 *     so publication emits what is stored instead of silently dropping it.
 */

import { describe, expect, test } from 'bun:test';
import {
	hasCoordinate,
	isCoordinateInRange,
	parseCoordinate,
	toCoordinate,
} from '../../src/core/concepts/geo_coordinate.ts';
// The publication path's facade must BE the same law, not a copy of it.
import * as diffusionFacade from '../../src/diffusion/resolve/geo_coordinate.ts';

describe('parse law — absence is structural', () => {
	test.each([
		['null', null],
		['undefined', undefined],
		['empty string', ''],
		['whitespace only', '   '],
		['tab and newline', '\t\n'],
		['a bare comma', ','],
		['plain text', 'north'],
		['multi-comma text', '3,1,4'],
		['a trailing-garbage number', '39.5deg'],
		['NaN', Number.NaN],
		['Infinity', Number.POSITIVE_INFINITY],
		['-Infinity', Number.NEGATIVE_INFINITY],
		['an object', { lat: 39.5 }],
		['an array', [39.5]],
		['an array of one number (no Number() coercion)', [39.5, 2.1]],
		['a boolean', true],
	])('%s is NOT a coordinate', (_label, raw) => {
		expect(hasCoordinate(raw)).toBe(false);
		expect(parseCoordinate(raw)).toBeNull();
	});

	test.each([
		['0 the number', 0, 0],
		["'0' the string", '0', 0],
		['-0', -0, -0],
		['a negative number', -0.376295, -0.376295],
		['a numeric string', '39.5', 39.5],
		['a padded numeric string', '  39.5  ', 39.5],
		['a comma decimal', '39,5', 39.5],
		['a negative comma decimal', '-0,376295', -0.376295],
		['exponent notation', '1e2', 100],
		['a plus sign', '+41.3874', 41.3874],
	])('%s IS a coordinate', (_label, raw, expected) => {
		expect(hasCoordinate(raw)).toBe(true);
		expect(toCoordinate(raw)).toBe(expected as number);
	});

	test('the ex-sentinel Valencia pair is an ordinary coordinate', () => {
		// No magic coordinate anywhere: this pair parses like any other point.
		expect(hasCoordinate(39.462571)).toBe(true);
		expect(hasCoordinate('39.462571')).toBe(true);
		expect(toCoordinate('-0.376295')).toBe(-0.376295);
	});

	test('the store is MIXED: the string and number forms parse identically', () => {
		expect(toCoordinate('41.5')).toBe(toCoordinate(41.5));
		expect(toCoordinate('0')).toBe(toCoordinate(0));
	});

	test('toCoordinate on a non-coordinate is NaN, never a fabricated 0', () => {
		// A caller that skips hasCoordinate must get an obviously-wrong value, not
		// Greenwich — the PHP `!empty()` coercion that published 0/0 is the bug.
		expect(toCoordinate('')).toBeNaN();
		expect(toCoordinate(null)).toBeNaN();
	});
});

describe('range law — the input door enforces it, publication does not', () => {
	test.each([
		[90, true],
		[-90, true],
		[0, true],
		[90.0001, false],
		[-90.0001, false],
		[999, false],
	])('latitude %p in range: %p', (value, expected) => {
		expect(isCoordinateInRange(value, 'lat')).toBe(expected);
	});

	test.each([
		[180, true],
		[-180, true],
		[179.999, true],
		[180.0001, false],
		[-999, false],
	])('longitude %p in range: %p', (value, expected) => {
		expect(isCoordinateInRange(value, 'lon')).toBe(expected);
	});

	test('a longitude-valid value is refused as a latitude', () => {
		expect(isCoordinateInRange(120, 'lon')).toBe(true);
		expect(isCoordinateInRange(120, 'lat')).toBe(false);
	});

	test('a non-coordinate is out of range on both axes (single admission test)', () => {
		for (const raw of [null, '', 'north', Number.NaN]) {
			expect(isCoordinateInRange(raw, 'lat')).toBe(false);
			expect(isCoordinateInRange(raw, 'lon')).toBe(false);
		}
	});

	test('the range parses the same forms as hasCoordinate', () => {
		expect(isCoordinateInRange('39,5', 'lat')).toBe(true);
		expect(isCoordinateInRange('  -0.376295 ', 'lon')).toBe(true);
	});

	test('hasCoordinate carries NO range opinion — an out-of-range value still PUBLISHES', () => {
		// Deliberate: range-gating the publication path would silently drop a
		// stored location (the failure class the sentinel retirement removes) and
		// diverge from the oracle, which range-checks nothing. Garbage in the
		// store is a repair job, never a silent publication drop.
		expect(hasCoordinate(999)).toBe(true);
		expect(toCoordinate(999)).toBe(999);
	});
});

describe('one law, not two', () => {
	test('the diffusion facade re-exports the core leaf, with no logic of its own', () => {
		expect(diffusionFacade.hasCoordinate).toBe(hasCoordinate);
		expect(diffusionFacade.toCoordinate).toBe(toCoordinate);
		expect(diffusionFacade.parseCoordinate).toBe(parseCoordinate);
		expect(diffusionFacade.isCoordinateInRange).toBe(isCoordinateInRange);
	});
});
