/**
 * GEOMETRY WINS — the geolocation publication precedence, gated on all three
 * publication paths at once (owner decision 2026-08-09).
 *
 * Precedence (identical in the three paths):
 *   1. lib_data carrying at least one non-empty features array → the GEOMETRY;
 *   2. else a usable lat/lon (0 included) → the point;
 *   3. else nothing is published.
 *
 * The standalone-component path (default_value.ts) additionally DROPS the
 * stored lat/lon when the geometry wins: on a geometry item the pair is the
 * map framing the client saved beside the work, and record_ir.ts
 * valueIrToString stringifies the whole atom onto the wire, so a consumer
 * reading `.lat` would read framing as an asserted location.
 *
 * The sibling paths (parser_misc.ts geoGeojson, ddo_fns.ts buildGeojsonLayers)
 * emit layer arrays only, so they never carried the centre at all — the third
 * path is asserted here beside them so the three cannot drift.
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

describe('component_geolocation standalone atom — geometry wins over the centre', () => {
	test('drawn geometry publishes the GEOMETRY and NO stored coordinate', () => {
		const atoms = geoAtoms([
			{ id: 1, lat: '41.5', lon: '2.1', zoom: 12, alt: 16, lib_data: [drawnPoint(3.14754, 41.85)] },
		]);
		expect(atoms).toHaveLength(1);
		expect(atoms[0]?.kind).toBe('geo');
		const value = payload(atoms[0]);
		// the framing pair is gone; everything else survives byte-for-byte
		expect(value.lat).toBeUndefined();
		expect(value.lon).toBeUndefined();
		expect(Object.keys(value).sort()).toEqual(['alt', 'lib_data', 'zoom']);
		expect(value.zoom).toBe(12);
		expect(value.alt).toBe(16);
		expect(value.lib_data).toEqual([drawnPoint(3.14754, 41.85)]);
		// and what actually reaches a published cell carries no lat/lon either
		const wire = valueIrToString(atoms[0] as never) ?? '';
		expect(wire).toContain('"coordinates":[3.14754,41.85]');
		expect(wire).not.toContain('"lat"');
		expect(wire).not.toContain('"lon"');
	});

	test('tchi1/113: a geometry item whose centre is the EX-SENTINEL publishes the GEOMETRY', () => {
		// The case the decision was taken for: the stored centre is Valencia,
		// the operator drew on the Costa Brava ~400 km away. The centre is
		// framing and must not reach the wire as the record's location.
		const atoms = geoAtoms([
			{ id: 1, ...EX_SENTINEL, zoom: 8, alt: 16, lib_data: [drawnPoint(3.14754, 41.858199)] },
		]);
		expect(atoms).toHaveLength(1);
		const value = payload(atoms[0]);
		expect(value.lat).toBeUndefined();
		expect(value.lon).toBeUndefined();
		expect(JSON.stringify(value)).not.toContain('39.462571');
		expect(JSON.stringify(value)).toContain('41.858199');
	});

	test('a centre-only item still publishes its point (id stripped)', () => {
		const atoms = geoAtoms([{ id: 3, lat: '41.5', lon: '2.1', zoom: 15, alt: 281 }]);
		expect(atoms).toHaveLength(1);
		expect(payload(atoms[0])).toEqual({ lat: '41.5', lon: '2.1', zoom: 15, alt: 281 });
	});

	test('the ex-sentinel pair with NO geometry is an ordinary coordinate and publishes', () => {
		const atoms = geoAtoms([{ id: 1, ...EX_SENTINEL, zoom: 12, alt: 16 }]);
		expect(atoms).toHaveLength(1);
		expect(payload(atoms[0]).lat).toBe(EX_SENTINEL.lat);
		expect(payload(atoms[0]).lon).toBe(EX_SENTINEL.lon);
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

	test('multi-item slices are resolved per item, each on its own precedence', () => {
		const atoms = geoAtoms([
			{ id: 1, lat: '41.5', lon: '2.1' },
			{ id: 2, lat: '39.0', lon: '-0.3', lib_data: [drawnPoint(1, 2)] },
			{ id: 3, lat: '', lon: '' },
		]);
		expect(atoms).toHaveLength(2);
		expect(payload(atoms[0])).toEqual({ lat: '41.5', lon: '2.1' });
		expect(payload(atoms[1])).toEqual({ lib_data: [drawnPoint(1, 2)] });
	});
});

describe('the three geo publication paths agree on precedence', () => {
	const item = {
		id: 1,
		...EX_SENTINEL,
		zoom: 8,
		alt: 16,
		lib_data: [drawnPoint(3.14754, 41.858199)],
	};

	test('geometry wins in geoGeojson, buildGeojsonLayers and the standalone atom', () => {
		// parser path: the drawn layers, verbatim
		const parsed = geoGeojson([{ value: item }] as never, {}, NO_LANGS);
		expect(JSON.stringify(parsed)).toContain('"coordinates":[3.14754,41.858199]');
		expect(JSON.stringify(parsed)).not.toContain('39.462571');

		// ddo fn path: the drawn layers, verbatim
		const layers = buildGeojsonLayers([item]);
		expect(JSON.stringify(layers)).toContain('"coordinates":[3.14754,41.858199]');
		expect(JSON.stringify(layers)).not.toContain('39.462571');

		// standalone-component path: the geometry, centre dropped
		expect(JSON.stringify(payload(geoAtoms([item])[0]))).not.toContain('39.462571');
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
