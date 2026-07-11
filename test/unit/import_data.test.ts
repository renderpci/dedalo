/**
 * Import engine gate: conformImportData + unwrapDedaloData (PHP component_common).
 * The CRITICAL invariant is the raw-export round-trip — a dato wrapped as
 * {"dedalo_data":<dato>}, unwrapped, then conformed, must reproduce the exact
 * dato for EVERY model. Plus the flat-string / clear / lang-keyed / error cases.
 */

import { describe, expect, test } from 'bun:test';
import { conformImportData, unwrapDedaloData } from '../../src/core/tools/import_data.ts';

function conform(model: string, importValue: string) {
	return conformImportData({
		model,
		importValue,
		columnName: model,
		sectionId: 1,
		componentTipo: 't1',
	});
}

/** Simulate a raw-export cell for a dato, then the tool's unwrap → conform. */
function roundTrip(model: string, dato: unknown) {
	const cell = JSON.stringify({ dedalo_data: dato });
	const unwrapped = unwrapDedaloData(cell);
	expect(unwrapped.wrapped).toBe(true);
	return conform(model, unwrapped.value).result;
}

describe('raw-export round-trip (the invariant)', () => {
	test('value-property (input_text): items reproduced exactly', () => {
		const dato = [{ value: 'hello', lang: 'lg-eng', id: 1 }];
		expect(roundTrip('component_input_text', dato)).toEqual(dato);
	});
	test('relation (non-value-property): locators pass through unchanged', () => {
		const dato = [
			{ section_tipo: 'rsc197', section_id: 5, type: 'dd66', from_component_tipo: 'x' },
		];
		expect(roundTrip('component_relation_related', dato)).toEqual(dato);
	});
	test('date: nested item objects reproduced', () => {
		const dato = [
			{ start: { day: 1, month: 2, year: 2020 }, end: { day: 1, month: 2, year: 2020 }, id: 1 },
		];
		expect(roundTrip('component_date', dato)).toEqual(dato);
	});
	test('lang-keyed multi-language object reproduced', () => {
		const dato = { 'lg-eng': [{ value: 'cat' }], 'lg-spa': [{ value: 'gato' }] };
		expect(roundTrip('component_input_text', dato)).toEqual(dato);
	});
});

describe('conform flat-string / clear / error', () => {
	test('value-property bare scalar → {value}', () => {
		expect(conform('component_input_text', 'hello').result).toEqual([{ value: 'hello' }]);
	});
	test("'0' is a legitimate value (not cleared)", () => {
		expect(conform('component_number', '0').result).toEqual([{ value: '0' }]);
	});
	test('empty cell → null (clear)', () => {
		expect(conform('component_input_text', '').result).toBeNull();
	});
	test('invalid JSON → failed row, no result', () => {
		const out = conform('component_input_text', '[bad json');
		expect(out.result).toBeNull();
		expect(out.errors).toHaveLength(1);
		expect(out.errors[0]?.msg).toContain('JSON decode failed');
	});
	test('bare JSON array of scalars normalizes to {value} for value-property', () => {
		expect(conform('component_input_text', '["a","b"]').result).toEqual([
			{ value: 'a' },
			{ value: 'b' },
		]);
	});
});

describe('unwrapDedaloData', () => {
	test('recognizes the wrapper only when dedalo_data is the SOLE property', () => {
		expect(unwrapDedaloData('{"dedalo_data":[1]}').wrapped).toBe(true);
		// legit component_json value with the same-name key + others → NOT unwrapped.
		expect(unwrapDedaloData('{"dedalo_data":1,"other":2}').wrapped).toBe(false);
	});
	test('null inner → empty value, not wrapped (behaves as empty cell)', () => {
		const out = unwrapDedaloData('{"dedalo_data":null}');
		expect(out).toEqual({ value: '', wrapped: false, dataframe: null });
	});
	test('{dato, dataframe} envelope splits out the dataframe', () => {
		const out = unwrapDedaloData(
			'{"dedalo_data":{"dato":[{"value":"x"}],"dataframe":[{"id_key":0}]}}',
		);
		expect(out.wrapped).toBe(true);
		expect(JSON.parse(out.value)).toEqual([{ value: 'x' }]);
		expect(out.dataframe).toEqual([{ id_key: 0 }]);
	});
	test('non-JSON cell passes through untouched', () => {
		expect(unwrapDedaloData('plain text')).toEqual({
			value: 'plain text',
			wrapped: false,
			dataframe: null,
		});
	});
});
