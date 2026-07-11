/**
 * core/update/version.ts — the ONE engine-version source (UPDATE_PROCESS
 * Phase 0). Byte-pins every exported shape (these are WIRE values: the client
 * displays the strings, update_data_version/environment emit the triple) and
 * the matrix_updates semantic-ordering compare contract.
 */

import { describe, expect, test } from 'bun:test';
import {
	DEDALO_ENGINE_VERSION,
	DEDALO_VERSION,
	DEDALO_VERSION_MAJOR_MINOR,
	DEDALO_VERSION_TRIPLE,
	compareVersionArrays,
	parseVersionString,
} from '../../src/core/update/version.ts';

describe('version exports (byte-pinned wire values)', () => {
	test('the four shapes derive from one triple and match the install literals', () => {
		expect(JSON.stringify(DEDALO_VERSION_TRIPLE)).toBe('[7,0,0]');
		expect(DEDALO_VERSION).toBe('7.0.0');
		expect(DEDALO_ENGINE_VERSION).toBe('7.0.0.dev');
		expect(DEDALO_VERSION_MAJOR_MINOR).toBe('7.0');
	});

	test('the triple is frozen (shared by reference into wire payloads)', () => {
		expect(Object.isFrozen(DEDALO_VERSION_TRIPLE)).toBe(true);
	});
});

describe('compareVersionArrays (matrix_updates int[] semantic ordering)', () => {
	test('orders semantically, not lexically', () => {
		expect(compareVersionArrays([7, 0, 0], [7, 0, 0])).toBe(0);
		expect(compareVersionArrays([7, 0, 1], [7, 0, 0])).toBe(1);
		expect(compareVersionArrays([6, 9, 9], [7, 0, 0])).toBe(-1);
		// The lexical trap: 6.10.0 > 6.9.0 semantically.
		expect(compareVersionArrays([6, 10, 0], [6, 9, 0])).toBe(1);
	});

	test('missing segments count as 0 (PHP version_compare padding)', () => {
		expect(compareVersionArrays([7, 0], [7, 0, 0])).toBe(0);
		expect(compareVersionArrays([7], [7, 0, 1])).toBe(-1);
		expect(compareVersionArrays([7, 0, 1], [7])).toBe(1);
	});
});

describe('parseVersionString', () => {
	test('strips the prerelease tag and splits on dots', () => {
		expect(parseVersionString('7.0.0.dev')).toEqual([7, 0, 0]);
		expect(parseVersionString('7.0.0')).toEqual([7, 0, 0]);
		expect(parseVersionString('6.8.10')).toEqual([6, 8, 10]);
	});

	test('round-trips the exported strings back to the triple', () => {
		expect(parseVersionString(DEDALO_ENGINE_VERSION)).toEqual([...DEDALO_VERSION_TRIPLE]);
		expect(parseVersionString(DEDALO_VERSION)).toEqual([...DEDALO_VERSION_TRIPLE]);
	});
});
