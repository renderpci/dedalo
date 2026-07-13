/**
 * Import engine gate: conformImportData + unwrapDedaloData (the GENERIC half —
 * the per-model parsers have their own gate in import_conform.test.ts).
 *
 * The CRITICAL invariant is the raw-export round-trip: a dato wrapped as
 * {"dedalo_data":<dato>}, unwrapped, then conformed, must reproduce the exact
 * dato for EVERY model. Plus: PHP's decode-verified is_json, the clear case, and
 * the LOUD REFUSAL of a flat cell for a model with no flat form (which must never
 * silently clear the record's existing value).
 */

import { describe, expect, test } from 'bun:test';
import { conformImportData, isJson, unwrapDedaloData } from '../../src/core/tools/import_data.ts';

function conform(model: string, importValue: string, componentTipo = 't1') {
	return conformImportData({
		model,
		importValue,
		columnName: componentTipo,
		sectionTipo: 'test3',
		sectionId: 1,
		componentTipo,
	});
}

/** Simulate a raw-export cell for a dato, then the tool's unwrap → conform. */
async function roundTrip(model: string, dato: unknown) {
	const cell = JSON.stringify({ dedalo_data: dato });
	const unwrapped = unwrapDedaloData(cell);
	expect(unwrapped.wrapped).toBe(true);
	const out = await conformImportData({
		model,
		importValue: unwrapped.value,
		columnName: 't1',
		sectionTipo: 'test3',
		sectionId: 1,
		componentTipo: 't1',
		wrapped: unwrapped.wrapped,
	});
	return out.result;
}

describe('raw-export round-trip (the invariant)', () => {
	test('value-property (input_text): items reproduced exactly', async () => {
		const dato = [{ value: 'hello', lang: 'lg-eng', id: 1 }];
		expect(await roundTrip('component_input_text', dato)).toEqual(dato);
	});
	test('date: nested item objects reproduced', async () => {
		const dato = [
			{ start: { day: 1, month: 2, year: 2020 }, end: { day: 1, month: 2, year: 2020 }, id: 1 },
		];
		expect(await roundTrip('component_date', dato)).toEqual(dato);
	});
	test('lang-keyed multi-language object reproduced', async () => {
		const dato = { 'lg-eng': [{ value: 'cat' }], 'lg-spa': [{ value: 'gato' }] };
		expect(await roundTrip('component_input_text', dato)).toEqual(dato);
	});
	test('a model with NO importConform facet still round-trips its json dato', async () => {
		// component_image has no flat form (media is imported by tool_import_files),
		// but its stored dato must survive an export→import cycle untouched.
		const dato = [{ id: 1, value: 42 }];
		expect(await roundTrip('component_image', dato)).toEqual(dato);
	});
});

describe('is_json is DECODE-verified (PHP json_handler::is_json)', () => {
	test('only arrays and objects are json', () => {
		expect(isJson('[{"a":1}]')).toBe(true);
		expect(isJson('{"a":1}')).toBe(true);
		// Bare scalars are NOT json — this is why the string branch ever sees a number.
		expect(isJson('5')).toBe(false);
		expect(isJson('true')).toBe(false);
		expect(isJson('null')).toBe(false);
	});
	test("'[Ac]' looks bracketed but is not json — it is literal text, not an error", async () => {
		expect(isJson('[Ac]')).toBe(false);
		const out = await conform('component_input_text', '[Ac]');
		expect(out.errors).toHaveLength(0);
		expect(out.result).toEqual([{ value: '[Ac]' }]);
	});
});

describe('the generic path (models with no importConform facet)', () => {
	test('empty cell → null (clear)', async () => {
		expect((await conform('component_image', '')).result).toBeNull();
	});
	test('a flat cell for a model with no flat form is REFUSED, never written', async () => {
		const out = await conform('component_image', 'photo.jpg');
		expect(out.result).toBeNull();
		expect(out.errors).toHaveLength(1);
		expect(out.errors[0]?.msg).toContain('no flat-value import form');
		// The point of the refusal: the record keeps whatever it already had.
		expect(out.errors[0]?.msg).toContain('left untouched');
	});
	test('json cell round-trips through the generic normalizer', async () => {
		const out = await conform('component_image', '[{"id":1,"value":7}]');
		expect(out.errors).toHaveLength(0);
		expect(out.result).toEqual([{ id: 1, value: 7 }]);
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
		expect(out).toEqual({ value: '', wrapped: false, dataframe: null, hasDato: true });
	});
	test('{dato, dataframe} envelope splits out the dataframe', () => {
		const out = unwrapDedaloData(
			'{"dedalo_data":{"dato":[{"value":"x"}],"dataframe":[{"id_key":0}]}}',
		);
		expect(out.wrapped).toBe(true);
		expect(JSON.parse(out.value)).toEqual([{ value: 'x' }]);
		expect(out.dataframe).toEqual([{ id_key: 0 }]);
		expect(out.hasDato).toBe(true);
	});
	test('a dataframe-ONLY envelope reports hasDato:false (do not touch the data)', () => {
		// The distinction that matters: this must NOT be read as "clear the component".
		const out = unwrapDedaloData('{"dedalo_data":{"dataframe":[{"id_key":0}]}}');
		expect(out.hasDato).toBe(false);
		expect(out.dataframe).toEqual([{ id_key: 0 }]);
		expect(out.value).toBe('');
	});
	test('non-JSON cell passes through untouched', () => {
		expect(unwrapDedaloData('plain text')).toEqual({
			value: 'plain text',
			wrapped: false,
			dataframe: null,
			hasDato: true,
		});
	});
});
