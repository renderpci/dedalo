/**
 * IMAGE REGION SPLITTING — pure logic split out of the ImageMagick spawn calls
 * (`engine/imagemagick.ts`) so it is unit-testable without spawning a process.
 *
 * Generic: this detects foreground blobs against a near-white background and
 * validates a plausible PAIR among them — it is not coin-specific. Any image
 * whose subject is two similarly-sized objects on a clean background fits
 * (e.g. a scanned document's front/back, two objects photographed together).
 * The first consumer is PHP tool_import_files' crop_50 (the numisdata "split
 * obverse/reverse" script) — see
 * `tools/tool_import_files/server/script_files/numisdata/crop_50.ts` for that
 * orchestrator — but nothing here assumes the subject is a coin.
 */

import { DedaloError } from '../errors/dedalo_error.ts';

/** One connected-component's bounding box + reported pixel area (not width*height — the box need not be fully filled). */
export interface Region {
	x: number;
	y: number;
	width: number;
	height: number;
	area: number;
}

/**
 * Parse ImageMagick's verbose connected-components report
 * (`runConnectedComponents` in `engine/imagemagick.ts`) into foreground
 * regions. One line per labelled blob:
 *   `  <id>: <w>x<h>+<x>+<y> <cx>,<cy> <area> gray(<mean>)`
 * Keeps only the FOREGROUND label (`gray(255)` — the bilevel mask's negate +
 * threshold step maps the near-white background to `gray(0)`, always
 * present, and everything else to `gray(255)`), and drops anything smaller
 * than `minDimension` on either axis (a second noise floor, independent of
 * the area-threshold already applied inside the ImageMagick call itself).
 */
export function parseConnectedComponentsReport(report: string, minDimension: number): Region[] {
	const lineRe = /(\d+)x(\d+)\+(\d+)\+(\d+)\s+[\d.,-]+\s+(\d+)\s+gray\((\d+)\)/;
	const regions: Region[] = [];
	for (const line of report.split('\n')) {
		const match = lineRe.exec(line);
		if (match === null) continue;
		const [, width, height, x, y, area, gray] = match;
		if (Number(gray) !== 255) continue; // gray(0) is the background label, always present
		if (Number(width) < minDimension || Number(height) < minDimension) continue;
		regions.push({
			x: Number(x),
			y: Number(y),
			width: Number(width),
			height: Number(height),
			area: Number(area),
		});
	}
	return regions;
}

/**
 * Validate that exactly two detected regions plausibly represent one matched
 * PAIR of objects, and return them ordered LEFT-TO-RIGHT.
 *
 * TWO gates, not one:
 *  1. exactly 2 regions (the PHP crop_50 original's only check) — a dirty
 *     background, an in-frame scale card/label, or shadow artifacts produce a
 *     different count and refuse here, with a diagnostic naming what was
 *     actually found (the PHP original gave no such detail).
 *  2. NEW, agreed before porting: the two regions' pixel AREAS must be within
 *     `minSimilarity` of each other (smaller/larger ratio). Without this, a
 *     single object accidentally split into two blobs — a hole, a crack, a
 *     glare spot breaking the silhouette — passed the PHP original's count
 *     check silently and was mis-cropped into two garbage halves with no
 *     error at all. This is the failure mode that actually corrupts data,
 *     as opposed to just rejecting a bad photo.
 */
export function assertPlausibleObjectPair(
	regions: Region[],
	minSimilarity: number,
): [Region, Region] {
	if (regions.length !== 2) {
		const summary = regions
			.map((r) => `${r.width}x${r.height}+${r.x}+${r.y} (area ${r.area})`)
			.join(', ');
		const message =
			`Expected exactly 2 object-sized regions, found ${regions.length}` +
			`${summary === '' ? '' : `: [${summary}]`}. Likely cause: a scale card/label in frame, ` +
			'a non-white or dirty background, or uneven lighting/shadow.';
		throw new DedaloError('tool.action_failed', {
			message,
			publicMessage: message,
			coordinates: { region_count: regions.length },
		});
	}
	// Length is proven === 2 above; noUncheckedIndexedAccess still types a
	// destructure as possibly-undefined, so name the invariant explicitly.
	const a = regions[0];
	const b = regions[1];
	if (a === undefined || b === undefined) {
		throw new DedaloError('internal.invariant', {
			message: 'assertPlausibleObjectPair: length was 2 but an index was undefined',
		});
	}
	const ratio = Math.min(a.area, b.area) / Math.max(a.area, b.area);
	if (ratio < minSimilarity) {
		const message =
			"Found 2 regions but their sizes are too different to be one object's matched pair " +
			`(areas ${a.area} vs ${b.area}, ratio ${ratio.toFixed(2)}, need >= ${minSimilarity.toFixed(2)}). ` +
			'Likely cause: a single object split into two blobs by a hole, crack, or glare — not two separate objects.';
		throw new DedaloError('tool.action_failed', {
			message,
			publicMessage: message,
			coordinates: { area_a: a.area, area_b: b.area, ratio },
		});
	}
	return a.x <= b.x ? [a, b] : [b, a];
}
