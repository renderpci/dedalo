/**
 * THE GEOLOCATION PUBLICATION LAW, gated on all three paths at once so they
 * cannot drift.
 *
 * The VIEW (lat/lon/zoom) is published data and always has been. For many
 * records it is the only positional data that exists, publication has read it
 * since the first implementation, and consumers depend on it — so it is emitted
 * as stored, alongside any drawn features rather than instead of them. A
 * revision that dropped the view when features were present changed published
 * bytes for existing records; that is what these tests now forbid.
 *
 * Two refusals, and only two:
 *   · ABSENCE — null/undefined/''/unparseable. `0` is NOT absence: it is the
 *     equator and the prime meridian, and it publishes.
 *   · the STUDIO DEFAULT — 39.462571/-0.376295, the Dédalo facilities' own
 *     coordinates, shipped as the client's factory map position and written on
 *     save by the v6 client whether or not anyone touched the map. Fabricated
 *     wherever it appears, so it never reaches a consumer as a position. It
 *     stays an ordinary coordinate everywhere else — stored, edited, migrated
 *     like any other — and is refused at this one door only. An item whose view
 *     is fabricated but which carries real drawn features still publishes them.
 *
 * The parser paths (parser_misc.ts geoGeojson, ddo_fns.ts buildGeojsonLayers)
 * emit layer arrays; the standalone path (default_value.ts) emits the stored
 * object as an atom that record_ir.ts valueIrToString stringifies onto the
 * wire. All three are asserted here together.
 */

import { describe, expect, test } from 'bun:test';
import type { MatrixRecord } from '../../src/core/db/matrix.ts';
import { geoGeojson } from '../../src/diffusion/parsers/parser_misc.ts';
import type { ParserContext } from '../../src/diffusion/parsers/types.ts';
import { buildGeojsonLayers } from '../../src/diffusion/resolve/ddo_fns.ts';
import { defaultPublicationValue } from '../../src/diffusion/resolve/default_value.ts';
import { valueIrToString } from '../../src/diffusion/resolve/record_ir.ts';

const TIPO = 'numisdata264';

const NO_LANGS: ParserContext = { langs: [], mainLang: null };

/** The ex-sentinel pair — an ordinary coordinate since the retirement. */
const EX_SENTINEL = { lat: 39.462571, lon: -0.376295 };

/** A drawn layer with one feature (the tchi1/113 Costa Brava Point shape). */
function drawnPoint(lon: number, lat: number): Record<string, unknown> {
	return {
		layer_id: 1,
		text: '',
		layer_data: {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: {},
					geometry: { type: 'Point', coordinates: [lon, lat] },
				},
			],
		},
	};
}

function geoRecord(items: unknown[]): MatrixRecord {
	return {
		id: 1,
		section_id: 113,
		section_tipo: 'tchi1',
		columns: { geo: { [TIPO]: items } },
		rawText: {},
	};
}

function geoAtoms(items: unknown[]) {
	return defaultPublicationValue(geoRecord(items), TIPO, 'component_geolocation', { tipo: TIPO });
}

/** Atom payload (the ValueIR union has no shared `value` member). */
function payload(atom: unknown): Record<string, unknown> {
	return (atom as { value?: Record<string, unknown> }).value as Record<string, unknown>;
}

describe('component_geolocation standalone atom — the view and the features are independent', () => {
	test('the VIEW is published ALONGSIDE the geometry, never dropped', () => {
		// The view is the record's framing and is often the only positional data
		// there is; publication has read it since the first implementation and
		// consumers depend on it. An item carrying both publishes both.
		const atoms = geoAtoms([
			{ id: 1, lat: '41.5', lon: '2.1', zoom: 12, alt: 16, lib_data: [drawnPoint(3.14754, 41.85)] },
		]);
		expect(atoms).toHaveLength(1);
		expect(atoms[0]?.kind).toBe('geo');
		const value = payload(atoms[0]);
		// everything but the editor id survives byte-for-byte
		expect(Object.keys(value).sort()).toEqual(['alt', 'lat', 'lib_data', 'lon', 'zoom']);
		expect(value.lat).toBe('41.5');
		expect(value.lon).toBe('2.1');
		expect(value.lib_data).toEqual([drawnPoint(3.14754, 41.85)]);
		const wire = valueIrToString(atoms[0] as never) ?? '';
		expect(wire).toContain('"coordinates":[3.14754,41.85]');
		expect(wire).toContain('"lat"');
	});

	test('a STUDIO-DEFAULT view is withheld, but the drawn geometry still publishes', () => {
		// The view is fabricated (the factory position the v6 client wrote on
		// save), so it is not emitted — but the operator's drawn work is real and
		// must survive. Only the fabricated pair is withheld.
		const atoms = geoAtoms([
			{ id: 1, ...EX_SENTINEL, zoom: 8, alt: 16, lib_data: [drawnPoint(3.14754, 41.858199)] },
		]);
		expect(atoms).toHaveLength(1);
		const value = payload(atoms[0]);
		expect(value.lat).toBeUndefined();
		expect(value.lon).toBeUndefined();
		expect(JSON.stringify(value)).not.toContain('39.462571');
		expect(JSON.stringify(value)).toContain('41.858199');
		expect(value.zoom).toBe(8);
		expect(value.alt).toBe(16);
	});

	test('a centre-only item still publishes its point (id stripped)', () => {
		const atoms = geoAtoms([{ id: 3, lat: '41.5', lon: '2.1', zoom: 15, alt: 281 }]);
		expect(atoms).toHaveLength(1);
		expect(payload(atoms[0])).toEqual({ lat: '41.5', lon: '2.1', zoom: 15, alt: 281 });
	});

	test('a STUDIO-DEFAULT view with nothing else emits NO atom', () => {
		const atoms = geoAtoms([{ id: 1, ...EX_SENTINEL, zoom: 12, alt: 16 }]);
		expect(atoms).toEqual([]);
	});

	test('0/0 publishes — the equator/prime meridian is a real position', () => {
		const atoms = geoAtoms([{ id: 1, lat: 0, lon: 0, zoom: 2, alt: 0 }]);
		expect(atoms).toHaveLength(1);
		expect(payload(atoms[0])).toEqual({ lat: 0, lon: 0, zoom: 2, alt: 0 });
	});

	test('absence emits NO atom', () => {
		expect(geoAtoms([])).toEqual([]);
		expect(geoAtoms([{ id: 1, lat: '', lon: '', zoom: 2, alt: 0 }])).toEqual([]);
		expect(geoAtoms([{ id: 1, lat: null, lon: null }])).toEqual([]);
		expect(geoAtoms([{ id: 1, zoom: 12, alt: 16 }])).toEqual([]);
		expect(geoAtoms([{ id: 1, lat: 'x', lon: 'y' }])).toEqual([]);
	});

	test('an EMPTY lib_data is NOT geometry — it falls through to the point', () => {
		// []: the shape a record takes after the last drawn layer is removed.
		const emptyArray = geoAtoms([{ id: 1, lat: '41.5', lon: '2.1', zoom: 9, lib_data: [] }]);
		expect(emptyArray).toHaveLength(1);
		expect(payload(emptyArray[0])).toEqual({
			lat: '41.5',
			lon: '2.1',
			zoom: 9,
			lib_data: [],
		});
		// layers present but carrying no feature: still not geometry.
		const featureless = geoAtoms([
			{
				id: 1,
				lat: '41.5',
				lon: '2.1',
				lib_data: [{ layer_id: 1, layer_data: { type: 'FeatureCollection', features: [] } }],
			},
		]);
		expect(featureless).toHaveLength(1);
		expect(payload(featureless[0]).lat).toBe('41.5');
		// and with no coordinate to fall back on, an empty lib_data emits nothing
		expect(geoAtoms([{ id: 1, lat: '', lon: '', lib_data: [] }])).toEqual([]);
		expect(
			geoAtoms([
				{
					id: 1,
					lib_data: [{ layer_id: 1, layer_data: { type: 'FeatureCollection', features: [] } }],
				},
			]),
		).toEqual([]);
		// a null layer_data is not geometry either (16 such layers exist today)
		expect(geoAtoms([{ id: 1, lib_data: [{ layer_id: 1, layer_data: null }] }])).toEqual([]);
	});

	test('geometry with no coordinate at all publishes the geometry (import/draw shape)', () => {
		const atoms = geoAtoms([{ id: 1, lib_data: [drawnPoint(0, 0)] }]);
		expect(atoms).toHaveLength(1);
		expect(payload(atoms[0])).toEqual({ lib_data: [drawnPoint(0, 0)] });
	});

	test('multi-item slices are resolved per item, each on its own merits', () => {
		const atoms = geoAtoms([
			{ id: 1, lat: '41.5', lon: '2.1' },
			{ id: 2, lat: '39.0', lon: '-0.3', lib_data: [drawnPoint(1, 2)] },
			{ id: 3, lat: '', lon: '' },
		]);
		expect(atoms).toHaveLength(2);
		expect(payload(atoms[0])).toEqual({ lat: '41.5', lon: '2.1' });
		// the second item keeps BOTH its view and its geometry
		expect(payload(atoms[1])).toEqual({
			lat: '39.0',
			lon: '-0.3',
			lib_data: [drawnPoint(1, 2)],
		});
	});
});

describe('the three geo publication paths agree on the law', () => {
	const item = {
		id: 1,
		...EX_SENTINEL,
		zoom: 8,
		alt: 16,
		lib_data: [drawnPoint(3.14754, 41.858199)],
	};

	test('a fabricated view never reaches the wire, in any of the three', () => {
		// parser path: the drawn layers, verbatim
		const parsed = geoGeojson([{ value: item }] as never, {}, NO_LANGS);
		expect(JSON.stringify(parsed)).toContain('"coordinates":[3.14754,41.858199]');
		expect(JSON.stringify(parsed)).not.toContain('39.462571');

		// ddo fn path: the drawn layers, verbatim
		const layers = buildGeojsonLayers([item]);
		expect(JSON.stringify(layers)).toContain('"coordinates":[3.14754,41.858199]');
		expect(JSON.stringify(layers)).not.toContain('39.462571');

		// standalone-component path: geometry kept, the fabricated view withheld
		expect(JSON.stringify(payload(geoAtoms([item])[0]))).not.toContain('39.462571');
		expect(JSON.stringify(payload(geoAtoms([item])[0]))).toContain('41.858199');
	});

	test('a REAL view is published by all three, geometry or not', () => {
		const real = { id: 1, lat: '41.5', lon: '2.1', zoom: 8 };
		expect(JSON.stringify(geoGeojson([{ value: real }] as never, {}, NO_LANGS))).toContain(
			'"coordinates":[2.1,41.5]',
		);
		expect(JSON.stringify(buildGeojsonLayers([real]))).toContain('"coordinates":[2.1,41.5]');
		expect(payload(geoAtoms([real])[0])).toEqual({ lat: '41.5', lon: '2.1', zoom: 8 });
	});

	test('a centre-only item yields the point in all three', () => {
		const centreOnly = { id: 1, lat: 0, lon: 0, zoom: 2 };
		expect(JSON.stringify(geoGeojson([{ value: centreOnly }] as never, {}, NO_LANGS))).toContain(
			'"coordinates":[0,0]',
		);
		expect(JSON.stringify(buildGeojsonLayers([centreOnly]))).toContain('"coordinates":[0,0]');
		expect(geoAtoms([centreOnly])).toHaveLength(1);
		expect(payload(geoAtoms([centreOnly])[0])).toEqual({ lat: 0, lon: 0, zoom: 2 });
	});

	test('absence yields nothing in all three', () => {
		const empty = { id: 1, lat: '', lon: '', zoom: 2 };
		expect(geoGeojson([{ value: empty }] as never, {}, NO_LANGS)).toBeNull();
		expect(buildGeojsonLayers([empty])).toEqual([]);
		expect(geoAtoms([empty])).toEqual([]);
	});
});
