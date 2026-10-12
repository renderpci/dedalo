/**
 * THE LOGO, DRAWN (terminal installer phase 3, 2026-10-12) — LOGO_PIXELS as 16
 * rows of half blocks: a cell whose top pixel is lit draws `▀`, its bottom
 * `▄`, both `█`, neither a space — one colour (the accent) in the foreground
 * only, so NO_COLOR draws the same shape in the terminal's own colour. Shown
 * on the Welcome and Done screens when the terminal has ≥ 30 rows.
 */

import { LOGO_PIXELS, LOGO_WIDTH } from './logo_pixels.ts';
import type { Line } from './styled.ts';

const HALF_BLOCKS: readonly string[] = [' ', '▄', '▀', '█'];

/** One cell from its top and bottom pixel. */
function cell(top: string | undefined, bottom: string | undefined): string {
	return HALF_BLOCKS[(top === '#' ? 2 : 0) + (bottom === '#' ? 1 : 0)] as string;
}

/** The logo's text rows (16 rows × 30 columns). */
export function logoCells(): string[] {
	const rows: string[] = [];
	for (let row = 0; row < LOGO_PIXELS.length; row += 2) {
		const top = LOGO_PIXELS[row] ?? '';
		const bottom = LOGO_PIXELS[row + 1] ?? '';
		rows.push(
			Array.from({ length: LOGO_WIDTH }, (_, column) => cell(top[column], bottom[column])).join(''),
		);
	}
	return rows;
}

/** The logo as lines in the accent. */
export function logoLines(): Line[] {
	return logoCells().map((text) => [{ text, role: 'accent' }]);
}
