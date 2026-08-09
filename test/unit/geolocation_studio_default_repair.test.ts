/**
 * Gate on the geolocation sentinel repair's PREDICATES.
 *
 * These functions decide, per component, between an irreversible key removal, an
 * ENGINE-AUTHORED coordinate rewrite, and a hold — over records of hand-drawn
 * geometry that matrix_time_machine cannot restore (0 rows carry the sentinel).
 * Project law: the most destructive predicate in the change is the one that must
 * be tripwired. Pure functions only — no DB, importing the script does not run
 * the sweep (it is `import.meta.main`-guarded).
 */

import { describe, expect, test } from 'bun:test';
import {
	adjudicate,
	coordKey,
	deriveCentreFromGeometry,
	hasDrawnGeometry,
	isSentinelCentred,
	itemPositions,
	namesSentinelPlace,
} from '../../scripts/repair_geolocation_studio_default.ts';
import { parseCoordinate } from '../../src/core/concepts/geo_coordinate.ts';

const SENTINEL = { lat: 39.462571, lon: -0.376295 };

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
	test('number, string and comma-decimal forms of the sentinel all collapse to one key', () => {
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
	 * The script inlines its own normalization so commit B does not depend on
	 * commit C (the core leaf src/core/concepts/geo_coordinate.ts ships with the
	 * guard removal). Correct decision — and the reason the two must be pinned
	 * equal here, or they drift silently and the repair starts adjudicating a
	 * different population than the engine parses.
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

describe('namesSentinelPlace — the accidental true positive, flagged not carved out', () => {
	/** es1/7242's real `string` column shape. */
	const valencia = JSON.stringify({
		hierarchy25: [{ id: 1, lang: 'lg-spa', value: 'Valencia' }],
	});

	test('the record whose own text names the sentinel place is flagged', () => {
		expect(namesSentinelPlace(valencia)).toBe(true);
		expect(namesSentinelPlace(JSON.stringify({ h1: [{ value: 'València' }] }))).toBe(true);
		expect(namesSentinelPlace(JSON.stringify({ h1: [{ value: '  VALENCIA ' }] }))).toBe(true);
	});

	test('EXACT value equality — a name that merely contains it is not flagged', () => {
		// es1/8804 "Barcelona" — the 400-km-wrong neighbour in the same run.
		expect(namesSentinelPlace(JSON.stringify({ h1: [{ value: 'Barcelona' }] }))).toBe(false);
		expect(namesSentinelPlace(JSON.stringify({ h1: [{ value: 'Valencia de Don Juan' }] }))).toBe(
			false,
		);
		expect(namesSentinelPlace(JSON.stringify({ h1: [{ value: 'Nueva Valencia' }] }))).toBe(false);
	});

	test('an absent, empty or unparseable string column flags nothing', () => {
		expect(namesSentinelPlace(null)).toBe(false);
		expect(namesSentinelPlace('')).toBe(false);
		expect(namesSentinelPlace('{not json')).toBe(false);
		expect(namesSentinelPlace('{}')).toBe(false);
	});

	test('the flag is a REPORT concern only — it never changes a verdict', () => {
		// Same item, flagged record or not: still an ordinary bare sentinel.
		expect(adjudicate([{ ...SENTINEL }])).toEqual({ verdict: 'CLEAR' });
	});
});

describe('isSentinelCentred', () => {
	test('matches the fabricated pair as numbers, strings and comma decimals', () => {
		expect(isSentinelCentred({ lat: 39.462571, lon: -0.376295 })).toBe(true);
		expect(isSentinelCentred({ lat: '39.462571', lon: '-0.376295' })).toBe(true);
		expect(isSentinelCentred({ lat: '39,462571', lon: '-0,376295' })).toBe(true);
	});

	test('one axis off, or an absent axis, is not the sentinel', () => {
		expect(isSentinelCentred({ lat: 39.462571, lon: -0.376296 })).toBe(false);
		expect(isSentinelCentred({ lat: 41.6523, lon: -4.7245 })).toBe(false);
		expect(isSentinelCentred({ lat: 39.462571 })).toBe(false);
		expect(isSentinelCentred({})).toBe(false);
		expect(isSentinelCentred({ lat: 0, lon: 0 })).toBe(false);
	});
});

describe('hasDrawnGeometry', () => {
	test('a non-empty FeatureCollection is drawn geometry', () => {
		expect(
			hasDrawnGeometry({ ...SENTINEL, lib_data: layers({ type: 'Point', coordinates: [1, 2] }) }),
		).toBe(true);
	});

	test('layer_data:null is NOT geometry (16 such layers exist in matrix)', () => {
		expect(hasDrawnGeometry({ ...SENTINEL, lib_data: [{ layer_data: null }] })).toBe(false);
	});

	test('an empty feature list, an empty lib_data and no lib_data are not geometry', () => {
		expect(
			hasDrawnGeometry({
				...SENTINEL,
				lib_data: [{ layer_data: { type: 'FeatureCollection', features: [] } }],
			}),
		).toBe(false);
		expect(hasDrawnGeometry({ ...SENTINEL, lib_data: [] })).toBe(false);
		expect(hasDrawnGeometry({ ...SENTINEL })).toBe(false);
	});
});

describe('deriveCentreFromGeometry — the ENGINE-AUTHORED coordinate', () => {
	test('a single drawn Point derives to EXACTLY itself, unrounded', () => {
		// tchi1/113's shape: one Point on the Costa Brava, ~400 km from Valencia.
		const item = {
			...SENTINEL,
			lib_data: layers({ type: 'Point', coordinates: [3.14754, 41.858199] }),
		};
		expect(deriveCentreFromGeometry(item)).toEqual({ lat: 41.858199, lon: 3.14754 });
	});

	test('a Point with more decimals than the rounding step is still exact', () => {
		const item = {
			...SENTINEL,
			lib_data: layers({ type: 'Point', coordinates: [3.1234567891, 41.9876543219] }),
		};
		expect(deriveCentreFromGeometry(item)).toEqual({ lat: 41.9876543219, lon: 3.1234567891 });
	});

	test('a LineString derives the bbox centre, not the vertex mean', () => {
		// bbox lon 0..10, lat 0..40 → centre 5/20. The mean of the three vertices
		// would be lat 13.33 — the bbox centre is the framing of the drawn extent.
		const item = {
			...SENTINEL,
			lib_data: layers({
				type: 'LineString',
				coordinates: [
					[0, 0],
					[10, 0],
					[0, 40],
				],
			}),
		};
		expect(deriveCentreFromGeometry(item)).toEqual({ lat: 20, lon: 5 });
	});

	test('a Polygon ring derives its bbox centre', () => {
		const item = {
			...SENTINEL,
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
		expect(deriveCentreFromGeometry(item)).toEqual({ lat: 41, lon: 3 });
	});

	test('a MultiPolygon spans every ring of every polygon', () => {
		const item = {
			...SENTINEL,
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
		expect(deriveCentreFromGeometry(item)).toEqual({ lat: 5, lon: 5 });
	});

	test('the bbox spans ALL features across ALL lib_data layers', () => {
		const item = {
			...SENTINEL,
			lib_data: [
				...layers({ type: 'Point', coordinates: [0, 0] }),
				...layers({ type: 'Point', coordinates: [10, 20] }),
			],
		};
		expect(deriveCentreFromGeometry(item)).toEqual({ lat: 10, lon: 5 });
	});

	test('a GeometryCollection is walked', () => {
		const item = {
			...SENTINEL,
			lib_data: layers({
				type: 'GeometryCollection',
				geometries: [
					{ type: 'Point', coordinates: [0, 0] },
					{ type: 'Point', coordinates: [4, 8] },
				],
			}),
		};
		expect(deriveCentreFromGeometry(item)).toEqual({ lat: 4, lon: 2 });
	});

	test('an odd centre is rounded to 6 decimals (0.1 m — what the client stores)', () => {
		const item = {
			...SENTINEL,
			lib_data: layers({
				type: 'LineString',
				coordinates: [
					[0, 0],
					[1 / 3, 1 / 7],
				],
			}),
		};
		expect(deriveCentreFromGeometry(item)).toEqual({ lat: 0.071429, lon: 0.166667 });
	});

	test('geometry with no extractable position derives NOTHING (never a guess)', () => {
		expect(
			deriveCentreFromGeometry({
				...SENTINEL,
				lib_data: layers({ type: 'Point', coordinates: [] }),
			}),
		).toBeNull();
		expect(
			deriveCentreFromGeometry({
				...SENTINEL,
				lib_data: layers({ type: 'Point', coordinates: ['x', 'y'] }),
			}),
		).toBeNull();
		expect(deriveCentreFromGeometry({ ...SENTINEL })).toBeNull();
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
	test('a bare sentinel item is CLEAR (key removal)', () => {
		expect(adjudicate([{ ...SENTINEL, zoom: 9, alt: null }])).toEqual({ verdict: 'CLEAR' });
	});

	test('string and comma-decimal sentinels are CLEAR too', () => {
		expect(adjudicate([{ lat: '39.462571', lon: '-0.376295' }])?.verdict).toBe('CLEAR');
		expect(adjudicate([{ lat: '39,462571', lon: '-0,376295' }])?.verdict).toBe('CLEAR');
	});

	test('sentinel + layer_data:null is CLEAR — that is not geometry', () => {
		expect(adjudicate([{ ...SENTINEL, lib_data: [{ layer_data: null }] }])?.verdict).toBe('CLEAR');
	});

	test('sentinel + a non-empty FeatureCollection is DERIVE, keeping everything else', () => {
		const item = {
			id: 7,
			...SENTINEL,
			zoom: 13,
			alt: null,
			lib_data: layers({ type: 'Point', coordinates: [3.14754, 41.858199] }),
		};
		const outcome = adjudicate([item]);
		expect(outcome?.verdict).toBe('DERIVE');
		expect(outcome?.value).toEqual([{ ...item, lat: 41.858199, lon: 3.14754 }]);
		// The rewritten value is stable: re-adjudicating it is a no-op.
		expect(adjudicate(outcome?.value ?? [])).toBeNull();
	});

	test('a derived component keeps its non-sentinel siblings untouched', () => {
		const real = { id: 2, lat: 41.6523, lon: -4.7245 };
		const drawn = {
			id: 1,
			...SENTINEL,
			lib_data: layers({ type: 'Point', coordinates: [1, 2] }),
		};
		const outcome = adjudicate([drawn, real]);
		expect(outcome?.verdict).toBe('DERIVE');
		expect(outcome?.value).toEqual([{ ...drawn, lat: 2, lon: 1 }, real]);
	});

	test('drawn geometry with no extractable position is HOLD/NO_POSITION, never cleared', () => {
		const outcome = adjudicate([
			{ ...SENTINEL, lib_data: layers({ type: 'Point', coordinates: ['x', 'y'] }) },
		]);
		expect(outcome?.verdict).toBe('HOLD');
		expect(outcome?.reason).toBe('NO_POSITION');
	});

	test('a bare sentinel beside a real item is HOLD/MIXED (key removal is all-or-nothing)', () => {
		const outcome = adjudicate([{ ...SENTINEL }, { lat: 41.6523, lon: -4.7245 }]);
		expect(outcome?.verdict).toBe('HOLD');
		expect(outcome?.reason).toBe('MIXED');
	});

	test('a bare sentinel beside a drawn one is HOLD/MIXED — deriving would leave the bare one', () => {
		const outcome = adjudicate([
			{ ...SENTINEL },
			{ ...SENTINEL, lib_data: layers({ type: 'Point', coordinates: [1, 2] }) },
		]);
		expect(outcome?.verdict).toBe('HOLD');
		expect(outcome?.reason).toBe('MIXED');
	});

	test('a bare sentinel beside a non-object entry is HOLD/MIXED', () => {
		expect(adjudicate([{ ...SENTINEL }, null])?.reason).toBe('MIXED');
		expect(adjudicate([{ ...SENTINEL }, 'junk'])?.reason).toBe('MIXED');
	});

	test('no sentinel anywhere is null — not our business', () => {
		expect(adjudicate([{ lat: 41.6523, lon: -4.7245 }])).toBeNull();
		expect(adjudicate([{ lat: 0, lon: 0 }])).toBeNull();
		expect(adjudicate([{}])).toBeNull();
		expect(adjudicate([])).toBeNull();
		expect(adjudicate([null])).toBeNull();
	});
});
