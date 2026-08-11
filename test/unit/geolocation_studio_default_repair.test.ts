/**
 * Gate on the geolocation studio-default repair's PREDICATES.
 *
 * These functions decide, per component, between an irreversible key removal, a
 * refit of the stored VIEW to the item's own features, and a hold — over
 * records of hand-drawn geometry that matrix_time_machine cannot restore.
 * Project law: the most destructive predicate in the change is the one that
 * must be tripwired. Pure functions only — no DB, importing the script does not
 * run the sweep (it is `import.meta.main`-guarded).
 *
 * THE RULE UNDER TEST: a studio-default view with no features is REMOVED; a
 * studio-default view on an item that carries features is FITTED to those
 * features; anything else is untouched, and `alt` goes only with a removed item.
 */

import { describe, expect, test } from 'bun:test';
import {
	adjudicate,
	coordKey,
	fitViewToGeometry,
	hasDrawnGeometry,
	isStudioDefaultView,
	itemPositions,
} from '../../scripts/repair_geolocation_studio_default.ts';
import { parseCoordinate } from '../../src/core/concepts/geo_coordinate.ts';

/** The client's factory map position, stored as a VIEW nobody chose. */
const STUDIO_DEFAULT = { lat: 39.462571, lon: -0.376295 };

/** One lib_data layer holding a FeatureCollection of the given geometries. */
function layers(...geometries: unknown[]): unknown[] {
	return [
		{
			layer_data: {
				type: 'FeatureCollection',
				features: geometries.map((geometry) => ({ type: 'Feature', geometry })),
			},
		},
	];
}

describe('coordKey — the stored-coordinate normalization (mixed string/number)', () => {
	test('number, string and comma-decimal forms of the studio default all collapse to one key', () => {
		expect(coordKey(39.462571)).toBe('39.462571');
		expect(coordKey('39.462571')).toBe('39.462571');
		expect(coordKey('39,462571')).toBe('39.462571');
		expect(coordKey(' 39.462571 ')).toBe('39.462571');
	});

	test('0 is a legal coordinate; absence is structural', () => {
		expect(coordKey(0)).toBe('0');
		expect(coordKey('0')).toBe('0');
		expect(coordKey(null)).toBeNull();
		expect(coordKey(undefined)).toBeNull();
		expect(coordKey('')).toBeNull();
		expect(coordKey('   ')).toBeNull();
		expect(coordKey('abc')).toBeNull();
		expect(coordKey(Number.NaN)).toBeNull();
		expect(coordKey({})).toBeNull();
	});
});

describe('coordKey ≡ parseCoordinate — the THIRD copy of the normalization', () => {
	/**
	 * The one-shot script inlines its own normalization so it depends on nothing
	 * the engine may later change (the core leaf is
	 * src/core/concepts/geo_coordinate.ts). Correct decision — and the reason the
	 * two must be pinned equal here, or they drift silently and the repair starts
	 * adjudicating a different population than the engine parses.
	 */
	const INPUTS: unknown[] = [
		39.462571,
		'39.462571',
		'39,462571',
		' 39.462571 ',
		-0.376295,
		'-0,376295',
		0,
		'0',
		'-0',
		'0.0',
		'  0  ',
		1e-7,
		1.7138671875000002,
		'41.6523',
		'3,1,4',
		'',
		'   ',
		'abc',
		'12abc',
		null,
		undefined,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		true,
		{},
		[],
		[1, 2],
		'1e3',
		'  -180  ',
		'91',
	];

	test('coordKey is exactly the canonical text of parseCoordinate, for every stored form', () => {
		for (const input of INPUTS) {
			const parsed = parseCoordinate(input);
			// Same ABSENCE verdict AND the same number behind it, in one assertion.
			expect([String(input), coordKey(input)]).toEqual([
				String(input),
				parsed === null ? null : String(parsed),
			]);
		}
	});
});

describe('isStudioDefaultView', () => {
	test('matches the fabricated pair as numbers, strings and comma decimals', () => {
		expect(isStudioDefaultView({ lat: 39.462571, lon: -0.376295 })).toBe(true);
		expect(isStudioDefaultView({ lat: '39.462571', lon: '-0.376295' })).toBe(true);
		expect(isStudioDefaultView({ lat: '39,462571', lon: '-0,376295' })).toBe(true);
	});

	test('one axis off, or an absent axis, is not the studio default', () => {
		expect(isStudioDefaultView({ lat: 39.462571, lon: -0.376296 })).toBe(false);
		expect(isStudioDefaultView({ lat: 41.6523, lon: -4.7245 })).toBe(false);
		expect(isStudioDefaultView({ lat: 39.462571 })).toBe(false);
		expect(isStudioDefaultView({})).toBe(false);
		expect(isStudioDefaultView({ lat: 0, lon: 0 })).toBe(false);
	});
});

describe('hasDrawnGeometry', () => {
	test('a non-empty FeatureCollection is drawn geometry', () => {
		expect(
			hasDrawnGeometry({
				...STUDIO_DEFAULT,
				lib_data: layers({ type: 'Point', coordinates: [1, 2] }),
			}),
		).toBe(true);
	});

	test('layer_data:null is NOT geometry — such an item is default-only', () => {
		expect(hasDrawnGeometry({ ...STUDIO_DEFAULT, lib_data: [{ layer_data: null }] })).toBe(false);
	});

	test('an empty feature list, an empty lib_data and no lib_data are not geometry', () => {
		expect(
			hasDrawnGeometry({
				...STUDIO_DEFAULT,
				lib_data: [{ layer_data: { type: 'FeatureCollection', features: [] } }],
			}),
		).toBe(false);
		expect(hasDrawnGeometry({ ...STUDIO_DEFAULT, lib_data: [] })).toBe(false);
		expect(hasDrawnGeometry({ ...STUDIO_DEFAULT })).toBe(false);
	});
});

describe("fitViewToGeometry — the view fitted to the item's own features", () => {
	test('a single drawn Point fits the view to EXACTLY itself, unrounded', () => {
		// One Point far from the studio: the fitted view frames the drawn work.
		const item = {
			...STUDIO_DEFAULT,
			lib_data: layers({ type: 'Point', coordinates: [3.14754, 41.858199] }),
		};
		expect(fitViewToGeometry(item)).toEqual({ lat: 41.858199, lon: 3.14754 });
	});

	test('a Point with more decimals than the rounding step is still exact', () => {
		const item = {
			...STUDIO_DEFAULT,
			lib_data: layers({ type: 'Point', coordinates: [3.1234567891, 41.9876543219] }),
		};
		expect(fitViewToGeometry(item)).toEqual({ lat: 41.9876543219, lon: 3.1234567891 });
	});

	test('a LineString fits the bbox centre, not the vertex mean', () => {
		// bbox lon 0..10, lat 0..40 → centre 5/20. The mean of the three vertices
		// would be lat 13.33 — the bbox centre is the framing of the drawn extent.
		const item = {
			...STUDIO_DEFAULT,
			lib_data: layers({
				type: 'LineString',
				coordinates: [
					[0, 0],
					[10, 0],
					[0, 40],
				],
			}),
		};
		expect(fitViewToGeometry(item)).toEqual({ lat: 20, lon: 5 });
	});

	test('a Polygon ring fits its bbox centre', () => {
		const item = {
			...STUDIO_DEFAULT,
			lib_data: layers({
				type: 'Polygon',
				coordinates: [
					[
						[2, 40],
						[4, 40],
						[4, 42],
						[2, 42],
						[2, 40],
					],
				],
			}),
		};
		expect(fitViewToGeometry(item)).toEqual({ lat: 41, lon: 3 });
	});

	test('a MultiPolygon spans every ring of every polygon', () => {
		const item = {
			...STUDIO_DEFAULT,
			lib_data: layers({
				type: 'MultiPolygon',
				coordinates: [
					[
						[
							[0, 0],
							[2, 0],
							[2, 2],
							[0, 0],
						],
					],
					[
						[
							[8, 8],
							[10, 8],
							[10, 10],
							[8, 8],
						],
					],
				],
			}),
		};
		expect(fitViewToGeometry(item)).toEqual({ lat: 5, lon: 5 });
	});

	test('the bbox spans ALL features across ALL lib_data layers', () => {
		const item = {
			...STUDIO_DEFAULT,
			lib_data: [
				...layers({ type: 'Point', coordinates: [0, 0] }),
				...layers({ type: 'Point', coordinates: [10, 20] }),
			],
		};
		expect(fitViewToGeometry(item)).toEqual({ lat: 10, lon: 5 });
	});

	test('a GeometryCollection is walked', () => {
		const item = {
			...STUDIO_DEFAULT,
			lib_data: layers({
				type: 'GeometryCollection',
				geometries: [
					{ type: 'Point', coordinates: [0, 0] },
					{ type: 'Point', coordinates: [4, 8] },
				],
			}),
		};
		expect(fitViewToGeometry(item)).toEqual({ lat: 4, lon: 2 });
	});

	test('an odd centre is rounded to 6 decimals (0.1 m — what the client stores)', () => {
		const item = {
			...STUDIO_DEFAULT,
			lib_data: layers({
				type: 'LineString',
				coordinates: [
					[0, 0],
					[1 / 3, 1 / 7],
				],
			}),
		};
		expect(fitViewToGeometry(item)).toEqual({ lat: 0.071429, lon: 0.166667 });
	});

	test('features with no extractable position fit NOTHING (never a guess)', () => {
		expect(
			fitViewToGeometry({
				...STUDIO_DEFAULT,
				lib_data: layers({ type: 'Point', coordinates: [] }),
			}),
		).toBeNull();
		expect(
			fitViewToGeometry({
				...STUDIO_DEFAULT,
				lib_data: layers({ type: 'Point', coordinates: ['x', 'y'] }),
			}),
		).toBeNull();
		expect(fitViewToGeometry({ ...STUDIO_DEFAULT })).toBeNull();
	});

	test('itemPositions reads string positions the same way stored coordinates are read', () => {
		expect(
			itemPositions({
				lib_data: layers({ type: 'Point', coordinates: ['3,14754', '41,858199'] }),
			}),
		).toEqual([[3.14754, 41.858199]]);
	});
});

describe('adjudicate — the verdict that decides what is destroyed', () => {
	test('a default-only item is CLEAR (key removal)', () => {
		expect(adjudicate([{ ...STUDIO_DEFAULT, zoom: 9, alt: null }])).toEqual({ verdict: 'CLEAR' });
	});

	test('string and comma-decimal studio defaults are CLEAR too', () => {
		expect(adjudicate([{ lat: '39.462571', lon: '-0.376295' }])?.verdict).toBe('CLEAR');
		expect(adjudicate([{ lat: '39,462571', lon: '-0,376295' }])?.verdict).toBe('CLEAR');
	});

	test('studio-default view + layer_data:null is CLEAR — that is not geometry', () => {
		expect(adjudicate([{ ...STUDIO_DEFAULT, lib_data: [{ layer_data: null }] }])?.verdict).toBe(
			'CLEAR',
		);
	});

	test('studio-default view + a non-empty FeatureCollection is FIT_VIEW, keeping everything else', () => {
		const item = {
			id: 7,
			...STUDIO_DEFAULT,
			zoom: 13,
			alt: null,
			lib_data: layers({ type: 'Point', coordinates: [3.14754, 41.858199] }),
		};
		const outcome = adjudicate([item]);
		expect(outcome?.verdict).toBe('FIT_VIEW');
		expect(outcome?.value).toEqual([{ ...item, lat: 41.858199, lon: 3.14754 }]);
		// The rewritten value is stable: re-adjudicating it is a no-op.
		expect(adjudicate(outcome?.value ?? [])).toBeNull();
	});

	test('a refitted component keeps its non-default siblings untouched', () => {
		const real = { id: 2, lat: 41.6523, lon: -4.7245 };
		const drawn = {
			id: 1,
			...STUDIO_DEFAULT,
			lib_data: layers({ type: 'Point', coordinates: [1, 2] }),
		};
		const outcome = adjudicate([drawn, real]);
		expect(outcome?.verdict).toBe('FIT_VIEW');
		expect(outcome?.value).toEqual([{ ...drawn, lat: 2, lon: 1 }, real]);
	});

	test('drawn geometry with no extractable position is HOLD/NO_POSITION, never cleared', () => {
		const outcome = adjudicate([
			{ ...STUDIO_DEFAULT, lib_data: layers({ type: 'Point', coordinates: ['x', 'y'] }) },
		]);
		expect(outcome?.verdict).toBe('HOLD');
		expect(outcome?.reason).toBe('NO_POSITION');
	});

	test('a default-only item beside a real item is HOLD/MIXED (key removal is all-or-nothing)', () => {
		const outcome = adjudicate([{ ...STUDIO_DEFAULT }, { lat: 41.6523, lon: -4.7245 }]);
		expect(outcome?.verdict).toBe('HOLD');
		expect(outcome?.reason).toBe('MIXED');
	});

	test('a default-only item beside a drawn one is HOLD/MIXED — refitting would leave the default-only one', () => {
		const outcome = adjudicate([
			{ ...STUDIO_DEFAULT },
			{ ...STUDIO_DEFAULT, lib_data: layers({ type: 'Point', coordinates: [1, 2] }) },
		]);
		expect(outcome?.verdict).toBe('HOLD');
		expect(outcome?.reason).toBe('MIXED');
	});

	test('a default-only item beside a non-object entry is HOLD/MIXED', () => {
		expect(adjudicate([{ ...STUDIO_DEFAULT }, null])?.reason).toBe('MIXED');
		expect(adjudicate([{ ...STUDIO_DEFAULT }, 'junk'])?.reason).toBe('MIXED');
	});

	test('alt survives a refit and goes only with a removed item', () => {
		// Refit: alt (real data some installs use) is carried through untouched.
		const drawn = {
			...STUDIO_DEFAULT,
			alt: 16,
			lib_data: layers({ type: 'Point', coordinates: [1, 2] }),
		};
		expect(adjudicate([drawn])?.value).toEqual([{ ...drawn, lat: 2, lon: 1 }]);
		// Removal: the whole item goes, alt with it — the only way alt is lost.
		expect(adjudicate([{ ...STUDIO_DEFAULT, alt: 16 }])).toEqual({ verdict: 'CLEAR' });
		// An item that is not the studio default keeps its alt: untouched.
		expect(adjudicate([{ lat: 41.6523, lon: -4.7245, alt: 16 }])).toBeNull();
	});

	test('no studio-default view anywhere is null — not our business', () => {
		expect(adjudicate([{ lat: 41.6523, lon: -4.7245 }])).toBeNull();
		expect(adjudicate([{ lat: 0, lon: 0 }])).toBeNull();
		expect(adjudicate([{}])).toBeNull();
		expect(adjudicate([])).toBeNull();
		expect(adjudicate([null])).toBeNull();
	});
});

/**
 * The place-name mechanism (namesSentinelPlace / SENTINEL_PLACE_NAMES / the
 * FLAGGED verdict and report) was built on the false premise that
 * 39.462571/-0.376295 is "the city of Valencia" and could therefore be a
 * record's correct coordinate. It is the STUDIO DEFAULT — a factory map
 * position, not a place — so there is no true positive to flag and a record
 * merely NAMED after that city is fabricated like any other. It is DELETED,
 * and this keeps it deleted: nothing about a record's own text may re-enter
 * the verdict or the report.
 */
describe('no place-name machinery — deleted, not repaired', () => {
	const SCRIPT = new URL('../../scripts/repair_geolocation_studio_default.ts', import.meta.url)
		.pathname;

	test('the script carries no place-name test, flag or FLAGGED report path', async () => {
		const source = await Bun.file(SCRIPT).text();
		for (const dead of [
			'namesSentinelPlace',
			'SENTINEL_PLACE_NAMES',
			'foldPlaceName',
			'stringLeaves',
			'flaggedUnits',
			'FLAGGED',
			'flagged',
			// The flag's only data source: the record's own text column.
			'string_text',
		]) {
			expect([dead, source.includes(dead)]).toEqual([dead, false]);
		}
	});

	test('a record named after the studio city is CLEARed like any other', () => {
		// The verdict is a function of the ITEM alone — the record's text is not an
		// input, and a previously "flagged" unit is an ordinary removal.
		expect(adjudicate([{ ...STUDIO_DEFAULT, zoom: 12, alt: 16 }])).toEqual({ verdict: 'CLEAR' });
	});
});
