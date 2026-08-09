/**
 * PER-MODEL IMPORT CONFORM gate (src/core/tools/import_conform.ts) — the parsers
 * that make a HUMAN-authored CSV importable. This is the capability the TS port
 * was missing: before these facets, every one of the cells below was refused and
 * only a Dédalo raw JSON export could be re-imported.
 *
 * Pure models only (no DB): date, email, geolocation, input_text, text_area, json.
 * The ontology-dependent facets (number type, relation targets, select_lang codes)
 * are driven in import_drive.test.ts against the real DB.
 */

import { describe, expect, test } from 'bun:test';
import { conformImportData } from '../../src/core/tools/import_data.ts';

function conform(
	model: string,
	importValue: string,
	options: { columnName?: string; lang?: string; wrapped?: boolean } = {},
) {
	return conformImportData({
		model,
		importValue,
		columnName: options.columnName ?? 't1',
		sectionTipo: 'test3',
		sectionId: 7,
		componentTipo: 't1',
		lang: options.lang ?? 'lg-nolan',
		wrapped: options.wrapped ?? false,
	});
}

describe('component_date — the order comes from the column-name suffix', () => {
	test('dmy: 21-05-1998 → day 21, month 5, year 1998', async () => {
		const out = await conform('component_date', '21-05-1998', { columnName: 't1_dmy' });
		expect(out.errors).toHaveLength(0);
		expect(out.result).toEqual([{ start: { day: 21, month: 5, year: 1998 } }]);
	});
	test('ymd is the default when the column carries no suffix', async () => {
		const out = await conform('component_date', '1998/05/21');
		expect(out.result).toEqual([{ start: { year: 1998, month: 5, day: 21 } }]);
	});
	test('mdy: 05/21/1998 → month 5, day 21', async () => {
		const out = await conform('component_date', '05/21/1998', { columnName: 't1_mdy' });
		expect(out.result).toEqual([{ start: { month: 5, day: 21, year: 1998 } }]);
	});
	test('a start<>end range, and several ranges separated by |', async () => {
		const out = await conform('component_date', '1930 | 1999/01/01 <> 2008/09/30');
		expect(out.result).toEqual([
			{ start: { year: 1930 } },
			{ start: { year: 1999, month: 1, day: 1 }, end: { year: 2008, month: 9, day: 30 } },
		]);
	});
	test('a negative (BCE) year survives the separator normalization', async () => {
		const out = await conform('component_date', '-205/05/21');
		expect(out.result).toEqual([{ start: { year: -205, month: 5, day: 21 } }]);
	});
	test('an ambiguous mdy pair is REFUSED (month/day? month/year?)', async () => {
		const out = await conform('component_date', '05/1998', { columnName: 't1_mdy' });
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('Invalid mdy date format');
	});
	test('an out-of-range month is REFUSED, not stored', async () => {
		const out = await conform('component_date', '1998/13/21');
		expect(out.result).toBeNull();
		expect(out.errors).toHaveLength(1);
	});
	test('empty cell clears', async () => {
		expect((await conform('component_date', '')).result).toBeNull();
	});
});

describe('component_email', () => {
	test('single address', async () => {
		expect((await conform('component_email', 'a@b.com')).result).toEqual([{ value: 'a@b.com' }]);
	});
	test("multiple addresses split on ' | ' (space-pipe-space, not a bare pipe)", async () => {
		const out = await conform('component_email', 'a@b.com | c@d.org');
		expect(out.result).toEqual([{ value: 'a@b.com' }, { value: 'c@d.org' }]);
	});
});

describe('component_geolocation', () => {
	test("the flat human form is 'lat, lon' — LAT first (the opposite of GeoJSON)", async () => {
		const out = await conform('component_geolocation', '41.3874, 2.1686');
		expect(out.errors).toHaveLength(0);
		expect(out.result).toEqual([{ lat: 41.3874, lon: 2.1686, zoom: 16, alt: 0 }]);
	});
	test('zoom and alt are optional and default to 16 / 0', async () => {
		const out = await conform('component_geolocation', '41.3874, 2.1686, 12, 30');
		expect(out.result).toEqual([{ lat: 41.3874, lon: 2.1686, zoom: 12, alt: 30 }]);
	});
	test('an out-of-range latitude is REFUSED', async () => {
		const out = await conform('component_geolocation', '191.0, 2.1');
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('out of range');
	});
	test('a non-numeric coordinate is REFUSED', async () => {
		const out = await conform('component_geolocation', 'north, 2.1');
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('Non numeric value');
	});
	test('a bare GeoJSON FeatureCollection takes its centre from the first Point', async () => {
		const fc = JSON.stringify({
			type: 'FeatureCollection',
			features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [2.1686, 41.3874] } }],
		});
		const out = await conform('component_geolocation', fc);
		expect(out.errors).toHaveLength(0);
		const item = (out.result as Record<string, unknown>[])[0] as Record<string, unknown>;
		// GeoJSON is [lon, lat]; the stored dato is lat/lon. The swap must happen.
		expect(item.lat).toBe(41.3874);
		expect(item.lon).toBe(2.1686);
		expect(Array.isArray(item.lib_data)).toBe(true);
	});
	test('a FeatureCollection with no Point has no centre and is REFUSED', async () => {
		const fc = JSON.stringify({ type: 'FeatureCollection', features: [] });
		const out = await conform('component_geolocation', fc);
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('without any Point feature');
	});
});

/**
 * THE GEO LAW at the import door (src/core/concepts/geo_coordinate.ts).
 *
 * Absence is structural and NEVER fabricated — but "nothing to store" is only
 * silent when the SOURCE SAID SO. A conform result of `null` with NO errors is
 * the import's explicit CLEAR: the executor saves `set_data []` for it and the
 * record's stored coordinate is deleted. So every shape that is merely
 * unreadable must carry an `error` instead — an error both reaches the run
 * report and (since the executor's refusal fix) keeps the stored value.
 * conform.warnings reach no report today; that is why the malformed shapes
 * below are errors, not warnings.
 *
 * The write side of that distinction is gated in
 * test/unit/import_execute_refusal.test.ts, which drives import_execute against
 * a scratch record. This file only pins which outcome each source shape gets.
 */
describe('component_geolocation — absence, emptiness and the ex-sentinel', () => {
	const geo = (value: unknown) => conform('component_geolocation', JSON.stringify(value));

	test('lat/lon present and BLANK states no location: nothing to store, no error', async () => {
		const out = await geo([{ lat: '', lon: '' }]);
		expect(out.result).toBeNull();
		expect(out.errors).toHaveLength(0);
	});

	test('a geometry-only item (no coordinate, real features) is kept for its layers', async () => {
		const layer = {
			layer_id: 1,
			layer_data: {
				type: 'FeatureCollection',
				features: [
					{ type: 'Feature', geometry: { type: 'Point', coordinates: [3.14754, 41.858199] } },
				],
			},
		};
		const out = await geo([{ lat: '', lon: '', lib_data: [layer] }]);
		expect(out.errors).toHaveLength(0);
		expect(out.result).toEqual([{ lib_data: [layer] }]);
		// No coordinate is invented for it — the import never frames a map.
		const item = (out.result as Record<string, unknown>[])[0] as Record<string, unknown>;
		expect('lat' in item).toBe(false);
		expect('lon' in item).toBe(false);
	});

	test('an EMPTY lib_data is not content: no coordinate-less husk is stored', async () => {
		// The exact shape a record produces after its last drawn layer is removed.
		const out = await geo([{ lat: '', lon: '', lib_data: [] }]);
		expect(out.errors).toHaveLength(0);
		expect(out.result).toBeNull();
	});

	test('a layer list whose layers carry NO feature is not content either', async () => {
		const empty = { layer_id: 1, layer_data: { type: 'FeatureCollection', features: [] } };
		const out = await geo([{ lat: '', lon: '', lib_data: [empty] }]);
		expect(out.errors).toHaveLength(0);
		expect(out.result).toBeNull();
	});

	test("'0, 0' is Null Island, a LEGAL coordinate — never an absence", async () => {
		const out = await conform('component_geolocation', '0, 0');
		expect(out.errors).toHaveLength(0);
		expect(out.result).toEqual([{ lat: 0, lon: 0, zoom: 16, alt: 0 }]);
	});

	test('the ex-sentinel Valencia pair is ORDINARY data, special-cased in NEITHER direction', async () => {
		const flat = await conform('component_geolocation', '39.462571, -0.376295');
		expect(flat.errors).toHaveLength(0);
		expect(flat.result).toEqual([{ lat: 39.462571, lon: -0.376295, zoom: 16, alt: 0 }]);
		// …and it conforms exactly like any other point: same shape, same defaults.
		const other = await conform('component_geolocation', '41.3874, 2.1686');
		const [sentinel] = flat.result as [Record<string, unknown>];
		const [ordinary] = other.result as [Record<string, unknown>];
		expect(Object.keys(sentinel)).toEqual(Object.keys(ordinary));
	});

	test('lat without lon is a malformed PAIR and is REFUSED', async () => {
		const out = await geo([{ lat: 41.3874 }]);
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('lat and lon must be given together');
	});

	test('lon without lat is refused the same way', async () => {
		const out = await geo([{ lat: '', lon: 2.1686 }]);
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('lat and lon must be given together');
	});

	test('a comma decimal is the same coordinate as a dot one (one law, both doors)', async () => {
		// geo_coordinate.ts normalizes ',' -> '.' in the publication path (PHP
		// str_replace parity); the import door must not refuse what publishes.
		const out = await geo([{ lat: '39,5', lon: '-0,25' }]);
		expect(out.errors).toHaveLength(0);
		expect(out.result).toEqual([{ lat: 39.5, lon: -0.25, zoom: 16, alt: 0 }]);
	});

	test('multi-comma text is not a coordinate', async () => {
		const out = await geo([{ lat: '3,1,4', lon: 2 }]);
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('numeric properties are mandatory');
	});

	test('the RANGE law is enforced at this door, loudly', async () => {
		const out = await geo([{ lat: 999, lon: 2.1 }]);
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('out of range');
	});

	// The silent-clear guard. Each of these once conformed to
	// {result:null, errors:[]} — an OK report over a deleted coordinate.
	test.each([
		['a wrong-named pair (latitude/longitude)', { latitude: 41.3, longitude: 2.1 }],
		['a wrong-cased pair (Lat/Lon)', { Lat: 41.3, Lon: 2.1 }],
		['an empty object', {}],
		['framing only, no location', { zoom: 12 }],
	])('%s is REFUSED, never a silent clear', async (_label, source) => {
		const out = await geo([source]);
		expect(out.result).toBeNull();
		expect(out.errors).toHaveLength(1);
		expect(out.errors[0]?.msg).toContain('lat and lon properties are mandatory');
	});

	test('the refusal is a ConformFailure — the row an operator reads in the run report', async () => {
		const out = await geo([{ latitude: 41.3, longitude: 2.1 }]);
		// Shape only. That this row reaches `failed` AND that the stored coordinate
		// survives is asserted against a real write in import_execute_refusal.test.ts.
		expect(out.msg).toBe('Error. Request failed');
		expect(out.errors[0]).toMatchObject({
			section_id: 7,
			component_tipo: 't1',
			msg: expect.stringContaining('IGNORED: malformed data.'),
		});
	});
});

describe('component_input_text', () => {
	test('a plain cell becomes one value item', async () => {
		expect((await conform('component_input_text', 'hello')).result).toEqual([{ value: 'hello' }]);
	});
	test("'0' is a value, not an absence", async () => {
		expect((await conform('component_input_text', '0')).result).toEqual([{ value: '0' }]);
	});
	test('a cell that LOOKS like a JSON string-array is refused rather than stored as text', async () => {
		const out = await conform('component_input_text', '["foo');
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('malformed data');
	});
	test('a lang-keyed export stays an OBJECT (the executor saves each lang separately)', async () => {
		const out = await conform('component_input_text', '{"lg-eng":["cat"],"lg-spa":["gato"]}');
		expect(out.result).toEqual({ 'lg-eng': [{ value: 'cat' }], 'lg-spa': [{ value: 'gato' }] });
	});
});

describe('component_text_area — stores HTML, so a plain cell is paragraph-wrapped', () => {
	test('a plain cell is wrapped in <p>', async () => {
		expect((await conform('component_text_area', 'hello')).result).toEqual([
			{ value: '<p>hello</p>' },
		]);
	});
	test('line breaks become paragraph breaks', async () => {
		const out = await conform('component_text_area', 'one\ntwo');
		expect(out.result).toEqual([{ value: '<p>one</p><p>two</p>' }]);
	});
	test('already-HTML content is not double-wrapped', async () => {
		const out = await conform('component_text_area', '<p>hello</p>');
		expect(out.result).toEqual([{ value: '<p>hello</p>' }]);
	});
});

describe('component_iri — the json branch', () => {
	// D21 (2026-08-09): the `IGNORED: expected array and get: <type>` arm this
	// branch used to carry was UNREACHABLE — decodeCell only reports isJson for a
	// string that decodes to a non-null object — and was DELETED rather than
	// fake-tested. These pin the two arms that ARE live, so the deletion cannot
	// quietly take a real one with it.
	test('a json ARRAY of iri objects conforms element-wise', async () => {
		const out = await conform('component_iri', '[{"iri":"https://a.test/1"}]');
		expect(out.errors).toHaveLength(0);
		expect(out.result).toEqual([{ iri: 'https://a.test/1' }]);
	});
	test('a single json OBJECT is wrapped into a one-element list', async () => {
		const out = await conform('component_iri', '{"iri":"https://a.test/2"}');
		expect(out.errors).toHaveLength(0);
		expect(out.result).toEqual([{ iri: 'https://a.test/2' }]);
	});
	test('a bare scalar never reaches the json branch (isJson refuses it)', async () => {
		// '42' is NOT json per PHP json_handler::is_json, so it takes the STRING
		// path — the reason the deleted arm could never fire.
		const out = await conform('component_iri', '42');
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('malformed data');
	});
});

describe('component_json — the wrapper is what disambiguates a dato from a value', () => {
	test('WRAPPED: the cell IS the stored dato and round-trips verbatim', async () => {
		const out = await conform('component_json', '[{"id":1,"value":{"a":2}}]', { wrapped: true });
		expect(out.errors).toHaveLength(0);
		expect(out.result).toEqual([{ id: 1, value: { a: 2 } }]);
	});
	test('UNWRAPPED: the same text is a literal json VALUE, so it nests under {value}', async () => {
		const out = await conform('component_json', '{"open_as":"window"}');
		expect(out.result).toEqual([{ value: { open_as: 'window' } }]);
	});
	test('a wrapped cell whose items lack `value` is REFUSED', async () => {
		const out = await conform('component_json', '[{"id":1}]', { wrapped: true });
		expect(out.result).toBeNull();
		expect(out.errors[0]?.msg).toContain('objects with a value property');
	});
});
