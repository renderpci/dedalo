/**
 * Pure-logic gate for `tools/tool_import_files/server/script_files/numisdata/crop_50.ts`'s
 * `custom_arguments` extraction — the piece that maps a crop's left/right
 * output to the Obverse/Reverse PORTAL tipos declared on the ontology's
 * `button_import` node. No ImageMagick spawn, no DB, credless.
 *
 * The fixtures are generic `test` TLD tipos, never an install's: the mapping
 * under test is a pure object walk over `custom_arguments`, so naming one
 * install's nodes would tie a gate about SHAPE to records only that machine
 * holds (AGENTS.md, generic_tld ratchet).
 */

import { describe, expect, test } from 'bun:test';
import { destinationPortalTipos } from '../../tools/tool_import_files/server/script_files/numisdata/crop_50.ts';

describe('destinationPortalTipos', () => {
	test('the real production shape: two destinations, insertion order preserved', () => {
		const fileProcessorProperties = [
			{
				name: 'Split image 50%',
				script_file: '/script_files/numisdata/crop_50.php',
				function_name: 'crop_50',
				custom_arguments: { destination_1: 'test164', destination_2: 'test165' },
			},
		];
		const destinations = destinationPortalTipos(fileProcessorProperties);
		// The floor the empty-case assertions below are read against: a mapper that
		// returned nothing would satisfy every `toEqual([])` in this file.
		expect(destinations.length).toBe(2);
		expect(destinations).toEqual(['test164', 'test165']);
	});

	test('other processors in the same array are ignored', () => {
		const fileProcessorProperties = [
			{ function_name: 'some_other_processor', custom_arguments: { x: 'wrong_tipo' } },
			{ function_name: 'crop_50', custom_arguments: { a: 'tipoA', b: 'tipoB' } },
		];
		expect(destinationPortalTipos(fileProcessorProperties)).toEqual(['tipoA', 'tipoB']);
	});

	test('missing/malformed config fails closed to an empty list, never a guess', () => {
		expect(destinationPortalTipos(undefined)).toEqual([]);
		expect(destinationPortalTipos(null)).toEqual([]);
		expect(destinationPortalTipos([])).toEqual([]);
		expect(destinationPortalTipos([{ function_name: 'crop_50' }])).toEqual([]); // no custom_arguments
		expect(destinationPortalTipos([{ function_name: 'crop_50', custom_arguments: null }])).toEqual(
			[],
		);
		expect(
			destinationPortalTipos([{ function_name: 'not_crop_50', custom_arguments: { a: 'x' } }]),
		).toEqual([]);
	});

	test('non-string values are dropped rather than propagated as a bad tipo', () => {
		const fileProcessorProperties = [
			{ function_name: 'crop_50', custom_arguments: { a: 'tipoA', b: 123, c: null } },
		];
		expect(destinationPortalTipos(fileProcessorProperties)).toEqual(['tipoA']);
	});
});
