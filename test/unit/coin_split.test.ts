/**
 * Pure-logic gate for `src/core/media/coin_split.ts` — the crop_50 region
 * detection/pairing rules, tested against synthetic ImageMagick
 * connected-components report text. No ImageMagick spawn, no DB, credless.
 */

import { describe, expect, test } from 'bun:test';
import {
	assertPlausibleCoinPair,
	parseConnectedComponentsReport,
} from '../../src/core/media/coin_split.ts';

/** One synthetic ImageMagick verbose connected-components report line. */
function ccLine(
	id: number,
	w: number,
	h: number,
	x: number,
	y: number,
	area: number,
	gray: number,
): string {
	return `  ${id}: ${w}x${h}+${x}+${y} ${(x + w / 2).toFixed(1)},${(y + h / 2).toFixed(1)} ${area} gray(${gray})`;
}

describe('parseConnectedComponentsReport', () => {
	test('keeps only the foreground (gray 255) label, above the min dimension', () => {
		const report = [
			'Objects (id: bounding-box centroid area mean-color):',
			ccLine(0, 800, 600, 0, 0, 420000, 0), // background label — always present, dropped
			ccLine(1, 200, 220, 40, 60, 38000, 255), // left coin
			ccLine(2, 205, 215, 400, 65, 37500, 255), // right coin
			ccLine(3, 10, 10, 5, 5, 90, 255), // dust speck, below min dimension
		].join('\n');

		const regions = parseConnectedComponentsReport(report, 50);

		expect(regions).toHaveLength(2);
		expect(regions[0]).toEqual({ x: 40, y: 60, width: 200, height: 220, area: 38000 });
		expect(regions[1]).toEqual({ x: 400, y: 65, width: 205, height: 215, area: 37500 });
	});

	test('an unparsable/empty report yields no regions, not a throw', () => {
		expect(parseConnectedComponentsReport('', 50)).toEqual([]);
		expect(parseConnectedComponentsReport('garbage line with no geometry', 50)).toEqual([]);
	});
});

describe('assertPlausibleCoinPair', () => {
	test('two similar-area regions are accepted and ordered left-to-right', () => {
		const rightFirst = [
			{ x: 400, y: 65, width: 205, height: 215, area: 37500 },
			{ x: 40, y: 60, width: 200, height: 220, area: 38000 },
		];
		const [left, right] = assertPlausibleCoinPair(rightFirst, 0.4);
		expect(left.x).toBe(40);
		expect(right.x).toBe(400);
	});

	test('a count other than 2 is refused with the region summary in the message', () => {
		expect(() => assertPlausibleCoinPair([], 0.4)).toThrow(/found 0/i);
		const three = [
			{ x: 0, y: 0, width: 100, height: 100, area: 8000 },
			{ x: 200, y: 0, width: 100, height: 100, area: 8000 },
			{ x: 400, y: 0, width: 60, height: 40, area: 2200 }, // e.g. a scale card
		];
		expect(() => assertPlausibleCoinPair(three, 0.4)).toThrow(/found 3/i);
	});

	test('NEW: two regions with very different areas are refused (single coin split by a hole/crack)', () => {
		// One coin's silhouette broken into a big piece and a sliver by (say) a
		// hole punched through it — count is 2, but they are not two coin faces.
		const brokenSingleCoin = [
			{ x: 40, y: 60, width: 200, height: 220, area: 38000 },
			{ x: 240, y: 260, width: 15, height: 12, area: 140 },
		];
		expect(() => assertPlausibleCoinPair(brokenSingleCoin, 0.4)).toThrow(/too different/i);
	});

	test('similarity ratio is inclusive at the floor', () => {
		// area ratio exactly 0.4 must be ACCEPTED (>=, not >).
		const atFloor = [
			{ x: 0, y: 0, width: 100, height: 100, area: 10000 },
			{ x: 200, y: 0, width: 100, height: 100, area: 4000 },
		];
		expect(() => assertPlausibleCoinPair(atFloor, 0.4)).not.toThrow();
	});
});
