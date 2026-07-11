/**
 * TEXT_AREA TAG BADGE RENDERER — SVG that EMBEDS the PHP base sprite.
 *
 * PHP (core/component_text_area/tag/index.php) composites each badge in GD: it
 * loads a per-type/-state base sprite from core/themes/default/tag_base/ (the
 * pill shape + the type ICON — index number-well, tc bar, geo pin, page
 * document, person silhouette, lang translate-glyph, note bubble, draw eye) and
 * draws the number/label over it with a TTF font.
 *
 * We reproduce that look EXACTLY without GD: emit an SVG that embeds the SAME
 * sprite PNG as a base64 data-URI `<image>` and overlays the label as `<text>`
 * at PHP's computed position and colour. Result: pixel-faithful to PHP, still a
 * tiny immutable-cacheable SVG, still no native raster dependency, and the
 * fixed-size client <img> scales it crisply (the sprite is the native 2× asset,
 * so a `WxH` viewBox maps 1:1 onto the client's `W/2 x 15` box).
 *
 * The sprites are copied into this component's own `tag_base/` folder (spec:
 * the TS port is self-contained — it does not read the PHP tree at runtime).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DrawTag, SpriteTag } from './tag_grammar.ts';

/** A loaded base sprite: its data-URI plus native pixel size (from the PNG header). */
interface Sprite {
	readonly dataUri: string;
	readonly width: number;
	readonly height: number;
}

/**
 * Load every base sprite once at module init: base64 the PNG and read its
 * width/height straight from the IHDR chunk (bytes 16–23, big-endian). Keeping
 * the native size lets each badge use the sprite's real aspect ratio, exactly
 * like PHP streaming the raw PNG.
 */
const SPRITES: ReadonlyMap<string, Sprite> = (() => {
	const dir = join(import.meta.dir, 'tag_base');
	const map = new Map<string, Sprite>();
	for (const file of readdirSync(dir)) {
		if (!file.endsWith('.png')) continue;
		const buffer = readFileSync(join(dir, file));
		map.set(file, {
			dataUri: `data:image/png;base64,${buffer.toString('base64')}`,
			width: buffer.readUInt32BE(16),
			height: buffer.readUInt32BE(20),
		});
	}
	return map;
})();

/** System UI font stack — the San-Francisco intent without shipping a TTF. Multi-word
 * family names use SINGLE quotes (this sits inside a DOUBLE-quoted attribute). */
const FONT_FAMILY =
	"-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, sans-serif";

/**
 * Per-type styling ported from tag/index.php: which sprite to pick for a
 * (state, out), the label colour, and the x/y label offset (native px). PHP
 * centres the label on the full sprite width then nudges by offsetX (the icon
 * lives on the left), and the baseline is `21 + offsetY` in the 30px-tall sprite.
 */
interface TypeStyle {
	/** Resolve the base sprite filename for this state (with graceful fallback). */
	readonly spriteFor: (state: string, out: boolean) => string;
	/** Label colour for this state. */
	readonly colorFor: (state: string) => string;
	/** Horizontal nudge from centre (PHP $offsetX). */
	readonly offsetX: number;
	/** Vertical nudge added to the baseline (PHP $offsetY). */
	readonly offsetY: number;
	/** Label font size in native px (default 18). */
	readonly fontSize?: number;
	/**
	 * Vertically centre the label in the pill (dominant-baseline central at y=15)
	 * instead of PHP's fixed `21 + offsetY` baseline. Used for `tc`, whose big
	 * timecode fills the black bar and must sit dead-centre.
	 */
	readonly vCenter?: boolean;
}

/** Pick `state` when the sprite exists, else the type's default (PHP falls back to a valid PNG). */
function pickState(state: string, allowed: readonly string[], fallback: string): string {
	return allowed.includes(state) ? state : fallback;
}

const WHITE = '#ffffff';
const BLACK = '#000000';
const TC_GREEN = '#00e800'; // PHP colorH (0,232,0)

const TYPE_STYLES: Record<SpriteTag['type'], TypeStyle> = {
	tc: {
		spriteFor: () => 'tc_ms-x2.png',
		colorFor: () => TC_GREEN,
		offsetX: 0,
		offsetY: 0,
		fontSize: 23,
		vCenter: true,
	},
	index: {
		spriteFor: (state, out) =>
			`${out ? 'indexOut' : 'indexIn'}-${pickState(state, ['n', 'r', 'd'], 'n')}-x2.png`,
		// PHP: black label, white only for the normal state.
		colorFor: (state) => (state === 'n' ? WHITE : BLACK),
		offsetX: 2,
		offsetY: 2,
	},
	geo: {
		spriteFor: (state) => `geo-${pickState(state, ['n', 'r'], 'n')}-x2.png`,
		colorFor: () => WHITE,
		offsetX: 7,
		offsetY: 2,
	},
	page: {
		spriteFor: (state) => `page-${pickState(state, ['n', 'r'], 'n')}-x2.png`,
		colorFor: () => BLACK,
		offsetX: 8,
		offsetY: 2,
	},
	person: {
		spriteFor: (state) => `person-${pickState(state, ['a', 'b'], 'a')}-x2.png`,
		colorFor: () => BLACK,
		offsetX: 8,
		offsetY: 0,
	},
	note: {
		spriteFor: (state) => `note-${pickState(state, ['a', 'b'], 'a')}-x2.png`,
		colorFor: () => BLACK,
		offsetX: 0,
		offsetY: 0,
	},
	lang: {
		spriteFor: (state) => `lang-${pickState(state, ['a', 'b'], 'a')}-x2.png`,
		colorFor: () => BLACK,
		offsetX: 10,
		offsetY: 2,
	},
};

/** XML-escape text before it goes into SVG content (SEC-028 parity with the client `esc()`). */
function xmlEscape(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** Label placement/appearance for a composite (resolved from the type style). */
interface LabelSpec {
	readonly color: string;
	readonly offsetX: number;
	readonly offsetY: number;
	readonly fontSize?: number;
	readonly vCenter?: boolean;
}

/**
 * Build an SVG that embeds `sprite` as a full-bleed `<image>` and overlays the
 * label. Default placement is PHP's: centred at `centreX + offsetX`, baseline
 * `21 + offsetY`. When `vCenter` is set the label is centred vertically instead
 * (dominant-baseline central at y=height/2) — used by `tc`, whose big timecode
 * fills the bar and must sit dead-centre.
 */
function composite(sprite: Sprite, label: string, spec: LabelSpec): string {
	const { width, height, dataUri } = sprite;
	const x = width / 2 + spec.offsetX;
	const fontSize = spec.fontSize ?? 18;
	const text = xmlEscape(label);
	const y = spec.vCenter ? height / 2 : 21 + spec.offsetY;
	const baseline = spec.vCenter ? ' dominant-baseline="central"' : '';
	const image = `<image width="${width}" height="${height}" xlink:href="${dataUri}"/>`;
	const glyph = `<text x="${x}" y="${y}"${baseline} text-anchor="middle" fill="${spec.color}" font-family="${FONT_FAMILY}" font-size="${fontSize}">${text}</text>`;
	const open = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
	return `${open}${image}${glyph}</svg>`;
}

/**
 * Fallback badge (a plain state-coloured pill) for the rare case a sprite asset
 * is missing — keeps the endpoint answering rather than 404ing a valid tag.
 */
const FALLBACK_FILL: Record<string, string> = {
	n: '#ffa43d',
	r: '#e04a26',
	d: '#3e8fed',
	a: '#00a79d',
	b: '#7e57c2',
};
function fallbackPill(width: number, state: string, label: string): string {
	const fill = FALLBACK_FILL[state] ?? FALLBACK_FILL.n ?? '#ffa43d';
	const text = xmlEscape(label);
	const rect = `<rect x="0.5" y="0.5" width="${width - 1}" height="14" rx="7" ry="7" fill="${fill}"/>`;
	const glyph = `<text x="${width / 2}" y="11" text-anchor="middle" fill="#ffffff" font-family="${FONT_FAMILY}" font-size="10">${text}</text>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="15" viewBox="0 0 ${width} 15">${rect}${glyph}</svg>`;
}

/** Render a deterministic sprite tag (tc/index/geo/page/person/note/lang) as SVG. */
export function renderSpriteTag(tag: SpriteTag): string {
	const style = TYPE_STYLES[tag.type];
	const sprite = SPRITES.get(style.spriteFor(tag.state, tag.out));
	if (sprite === undefined) return fallbackPill(tag.width, tag.state, tag.display);
	return composite(sprite, tag.display, {
		color: style.colorFor(tag.state),
		offsetX: style.offsetX,
		offsetY: style.offsetY,
		fontSize: style.fontSize,
		vCenter: style.vCenter,
	});
}

/**
 * Render a `draw` tag over the eye-icon draw sprite (PHP composites/generates the
 * same eye pill). White label, PHP's draw offset.
 */
export function renderDrawTag(tag: DrawTag): string {
	const sprite = SPRITES.get(`draw-${pickState(tag.state, ['n', 'r', 'd'], 'n')}-x2.png`);
	if (sprite === undefined) return fallbackPill(76, tag.state, tag.display);
	return composite(sprite, tag.display, { color: WHITE, offsetX: 10, offsetY: 2 });
}
