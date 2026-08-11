/**
 * TEXT_AREA TAG BADGE RENDERER — PURE VECTOR SVG (no raster, no fs).
 *
 * PHP (core/component_text_area/tag/index.php) composited each badge in GD from
 * a per-type/-state base sprite (the pill shape + the type ICON — index
 * number-well, tc bar, geo pin, page document, person silhouette, lang
 * translate-glyph, note bubble, draw eye) with the number/label drawn over it.
 * The first TS port reproduced that look by EMBEDDING the sprite PNG as a
 * base64 data-URI `<image>`.
 *
 * That is now DRAWN instead of blitted. Reason is measured, not aesthetic: the
 * client renders every tag as an `<img>` with a unique URL, and Chrome builds
 * one isolated SVG image document per such `<img>` — SVG parse + sub-fetch of
 * the inner data:PNG + PNG decode + a full document lifecycle, all on the main
 * thread. A tag-heavy record (rsc167/1 ≈ 330 tags) paid ~4s of blocked main
 * thread on entering edit mode, re-paid on every entry because the cost is
 * document CONSTRUCTION, which HTTP caching cannot touch. Isolated A/B over 330
 * badges: embedded-PNG 1474ms total / 1256ms blocking vs pure vector 699ms
 * total / 0ms blocking.
 *
 * The vectors were fitted against the sprites they replace (measured mean alpha
 * error 0.0005–0.0043 per shape, lang 0.028), so the badges are the same look,
 * the same colours and the SAME native `W x 30` box — load-bearing, because the
 * client sizes the `<img>` as `width:auto; height:15px` and takes the intrinsic
 * width from the SVG. Every sprite is the native 2x asset, so a `W x 30`
 * viewBox maps 1:1 onto the client's `W/2 x 15` box.
 */

import type { DrawTag, SpriteTag } from './tag_grammar.ts';

/** A badge shape: its vector body (pill + icon) and its native pixel size. */
interface Shape {
	readonly body: string;
	readonly width: number;
	readonly height: number;
}

/** Every badge is the native 2x asset: 30 native px tall, 15 at the client. */
const HEIGHT = 30;

/**
 * The pill of every wide badge (tc/draw/geo/page/person/lang) is a TRUE STADIUM:
 * a full-bleed rect with a half-height cap. Measured best-fit radii across the
 * sprites are 14.86–15.13 — 15 within anti-alias noise.
 */
function stadium(width: number, fill: string): string {
	return `<rect x="0" y="0" width="${width}" height="${HEIGHT}" rx="15" ry="15" fill="${fill}"/>`;
}

/** Draw primitive: one filled path, optionally transformed / evenodd-filled. */
function filled(d: string, fill: string, attrs = ''): string {
	return `<path fill="${fill}"${attrs} d="${d}"/>`;
}

// ── Icon geometry (fitted to the sprites; see the per-shape error notes) ─────

/** Eye: outer almond ring + iris + glint. The PHP vector is an older generation
 * of the same drawing, hence the fitted overlay transform (fit error 0.0043). */
const EYE =
	'm14.86 5.9c-0.97 0-1.92 0.09-2.84 0.4-5.39 1.81-7.99 6.89-8.16 7.32-0.16 0.43-0.25 0.77-0.25 1.02s0.08 0.59 0.25 1.02c0.16 0.43 3.42 7.71 10.99 7.71 8.01 0 10.83-7.28 10.99-7.71s0.25-0.77 0.25-1.02-0.08-0.59-0.25-1.02c-0.16-0.43-2.77-5.39-8.16-7.32-0.89-0.33-1.85-0.4-2.82-0.4zm-5.09 4.68c0.18-0.18 0.28-0.25 0.32-0.21s0.01 0.16-0.09 0.39c-0.29 0.67-0.44 1.37-0.44 2.1 0 1.46 0.52 2.71 1.56 3.75s2.29 1.56 3.75 1.56 2.71-0.52 3.75-1.56 1.56-2.29 1.56-3.75c0-0.7-0.14-1.37-0.41-2.01-0.09-0.22-0.12-0.35-0.08-0.39s0.14 0.04 0.31 0.21c0.82 0.81 1.77 1.9 2.83 3.25 0.15 0.19 0.24 0.43 0.27 0.72 0.02 0.29-0.03 0.54-0.16 0.75-0.26 0.42-3.18 5.6-8.06 5.6-5.39 0-7.8-5.16-8.06-5.58-0.13-0.21-0.18-0.46-0.16-0.75s0.11-0.53 0.25-0.73c1.04-1.39 2-2.5 2.86-3.35zm7.78 1.8 0.62 0.64c0.18 0.18 0.29 0.4 0.34 0.68s0.03 0.52-0.08 0.73c-0.44 0.8-0.98 1.48-1.64 2.05-0.19 0.15-0.42 0.22-0.68 0.19-0.27-0.02-0.48-0.12-0.65-0.3l-0.62-0.6c-0.16-0.18-0.24-0.37-0.22-0.59s0.11-0.42 0.29-0.59c0.52-0.52 1.04-1.21 1.57-2.07 0.13-0.21 0.29-0.33 0.49-0.35s0.4 0.05 0.58 0.21z';
const EYE_FIT = ' transform="translate(2 .6) scale(.975)"';

/** Map pin: teardrop (convex Material-place sides, NOT straight tangents) with a
 * round hole — the hole needs evenodd or it fills solid. */
const PIN =
	'M7.225 12C7.225 18.3 15.61 26.3 15.61 26.3S23.995 18.3 23.995 12A8.385 8.385 0 1 0 7.225 12ZM15.55 11.75m-3.28 0a3.28 3.28 0 1 0 6.56 0a3.28 3.28 0 1 0-6.56 0Z';
const EVENODD = ' fill-rule="evenodd"';

/** Document: L-shaped body + a DETACHED folded-corner flap (the sprite leaves a
 * ~1.7px gap between them). */
const PAGE_DOC = 'M14.69 3.37H23.7V25H7.57V12.37h7.12ZM12.97 5.12v5.51H7.46Z';

/** Translate glyph (文 + A), refitted from the Material path in two pieces. The
 * 乂 crossing differs from the sprite by up to ~1.5px (fit error 0.028); the
 * pill, bar, stem and the whole A land within a pixel. */
const LANG_CJK =
	'M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z';
const LANG_CJK_FIT = ' transform="translate(7.35 -0.24) scale(1.134 1.118)"';
const LANG_A = 'M18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z';
const LANG_A_FIT = ' transform="translate(1.82 -6.83) scale(1.482 1.583)"';

/** Person bust: head capsule + shoulder trapezoid. Both subpaths MUST wind the
 * same way or the default nonzero rule punches a hole at the neck. */
const PERSON_HEAD =
	'M19.37 4.4A5.37 5.37 0 0 1 24.74 9.77V13.5a5.37 5.37 0 0 1-10.74 0V9.77A5.37 5.37 0 0 1 19.37 4.4Z';
const PERSON_BODY = 'M19.37 16.28 30.11 23.21V25.81H8.63V23.21Z';

/** Note is a speech BUBBLE, not a stadium: rounded body (r=3.4) + a tail
 * triangle reaching the bottom edge. */
const NOTE_BUBBLE =
	'M3.4 0H40.6A3.4 3.4 0 0 1 44 3.4V21.66A3.4 3.4 0 0 1 40.6 25.06H36.25V30L24.36 25.06H3.4A3.4 3.4 0 0 1 0 21.66V3.4A3.4 3.4 0 0 1 3.4 0Z';

/**
 * Index tags interlock: `in` is a convex cap on the left + a full-radius
 * semicircular BITE on the right, `out` is its exact mirror. Both are drawn
 * beyond the 68px box (cap-centre to notch-centre pitch 54.76) and CLIPPED by
 * the viewBox, exactly as the sprites were — that clipping is what makes an
 * in/out pair fit together.
 */
const INDEX_IN = 'M15 0H69.76A15 15 0 0 0 69.76 30H15A15 15 0 0 1 15 0Z';
const INDEX_OUT = 'M53 0A15 15 0 0 1 53 30H-1.76A15 15 0 0 0-1.76 0Z';

// ── Shapes, keyed exactly like the sprites they replace ─────────────────────

/**
 * One entry per (type × state × direction). Fills are the sprites' own, sampled
 * per file — note the palette DRIFT they carry: index n/r/d and geo/page/lang
 * are the WC-2026-08-02 colours (#ffab01 / #fc461a / #2f8fff), while draw-d
 * (#3e8fed), person (#ffaa00) and note (#ffaa00 / #44b941) never got that
 * update. Reproducing them keeps this change look-identical; re-colouring them
 * is a separate, deliberate decision.
 */
const SHAPES: ReadonlyMap<string, Shape> = new Map<string, Shape>([
	['tc_ms', { width: 164, height: HEIGHT, body: stadium(164, '#000000') }],
	['indexIn-n', { width: 68, height: HEIGHT, body: filled(INDEX_IN, '#ffab01') }],
	['indexIn-r', { width: 68, height: HEIGHT, body: filled(INDEX_IN, '#fc461a') }],
	['indexIn-d', { width: 68, height: HEIGHT, body: filled(INDEX_IN, '#2f8fff') }],
	['indexOut-n', { width: 68, height: HEIGHT, body: filled(INDEX_OUT, '#ffab01') }],
	['indexOut-r', { width: 68, height: HEIGHT, body: filled(INDEX_OUT, '#fc461a') }],
	['indexOut-d', { width: 68, height: HEIGHT, body: filled(INDEX_OUT, '#2f8fff') }],
	[
		'geo-n',
		{ width: 76, height: HEIGHT, body: stadium(76, '#ffab01') + filled(PIN, '#000000', EVENODD) },
	],
	[
		'geo-r',
		{ width: 76, height: HEIGHT, body: stadium(76, '#fc461a') + filled(PIN, '#000000', EVENODD) },
	],
	[
		'page-n',
		{ width: 76, height: HEIGHT, body: stadium(76, '#ffab01') + filled(PAGE_DOC, '#000000') },
	],
	[
		'page-r',
		{ width: 76, height: HEIGHT, body: stadium(76, '#fc461a') + filled(PAGE_DOC, '#000000') },
	],
	[
		'person-a',
		{
			width: 144,
			height: HEIGHT,
			body:
				stadium(144, '#ffaa00') + filled(PERSON_HEAD, '#ffffff') + filled(PERSON_BODY, '#ffffff'),
		},
	],
	[
		'person-b',
		{
			width: 144,
			height: HEIGHT,
			body:
				stadium(144, '#ffaa00') + filled(PERSON_HEAD, '#000000') + filled(PERSON_BODY, '#000000'),
		},
	],
	['note-a', { width: 44, height: HEIGHT, body: filled(NOTE_BUBBLE, '#ffaa00') }],
	['note-b', { width: 44, height: HEIGHT, body: filled(NOTE_BUBBLE, '#44b941') }],
	[
		'lang-a',
		{
			width: 100,
			height: HEIGHT,
			body:
				stadium(100, '#ffab01') +
				filled(LANG_CJK, '#ffffff', LANG_CJK_FIT) +
				filled(LANG_A, '#ffffff', LANG_A_FIT),
		},
	],
	[
		'lang-b',
		{
			width: 100,
			height: HEIGHT,
			body:
				stadium(100, '#fc461a') +
				filled(LANG_CJK, '#ffffff', LANG_CJK_FIT) +
				filled(LANG_A, '#ffffff', LANG_A_FIT),
		},
	],
	[
		'draw-n',
		{ width: 76, height: HEIGHT, body: stadium(76, '#ffab01') + filled(EYE, '#000000', EYE_FIT) },
	],
	[
		'draw-r',
		{ width: 76, height: HEIGHT, body: stadium(76, '#fc461a') + filled(EYE, '#000000', EYE_FIT) },
	],
	[
		'draw-d',
		{ width: 76, height: HEIGHT, body: stadium(76, '#3e8fed') + filled(EYE, '#181818', EYE_FIT) },
	],
]);

/** System UI font stack — the San-Francisco intent without shipping a TTF. Multi-word
 * family names use SINGLE quotes (this sits inside a DOUBLE-quoted attribute). */
const FONT_FAMILY =
	"-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, sans-serif";

/**
 * Per-type styling ported from tag/index.php: which shape to pick for a
 * (state, out), the label colour, and the x/y label offset (native px). PHP
 * centres the label on the full badge width then nudges by offsetX (the icon
 * lives on the left), and the baseline is `21 + offsetY` in the 30px-tall badge.
 */
interface TypeStyle {
	/** Resolve the shape key for this state (with graceful fallback). */
	readonly shapeFor: (state: string, out: boolean) => string;
	/** Label colour for this state. */
	readonly colorFor: (state: string) => string;
	/** Horizontal nudge from centre (PHP $offsetX). */
	readonly offsetX: number;
	/**
	 * Per-direction horizontal nudge, overriding `offsetX` when present. Needed by
	 * `index`, whose in/out shapes are MIRRORED: the notch (and therefore the
	 * visible pill body) sits on the opposite side for each.
	 */
	readonly offsetXFor?: (out: boolean) => number;
	/** Label font weight (default 'normal'). */
	readonly fontWeight?: number;
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

/** Pick `state` when a shape exists for it, else the type's default (PHP fell back to a valid PNG). */
function pickState(state: string, allowed: readonly string[], fallback: string): string {
	return allowed.includes(state) ? state : fallback;
}

const WHITE = '#ffffff';
const BLACK = '#000000';
const TC_GREEN = '#00e800'; // PHP colorH (0,232,0)

const TYPE_STYLES: Record<SpriteTag['type'], TypeStyle> = {
	tc: {
		shapeFor: () => 'tc_ms',
		colorFor: () => TC_GREEN,
		offsetX: 0,
		offsetY: 0,
		fontSize: 23,
		vCenter: true,
	},
	index: {
		shapeFor: (state, out) =>
			`${out ? 'indexOut' : 'indexIn'}-${pickState(state, ['n', 'r', 'd'], 'n')}`,
		// DIVERGENCE from PHP (which used white for the normal state): black on
		// every state. All three index fills are LIGHT (#ffab01 / #fc461a /
		// #2f8fff), so black is the readable ink on each — white on the orange
		// was the worst pair of the set.
		colorFor: () => BLACK,
		// The number is centred on the VISIBLE pill body, not on the 68px badge
		// box. Measured opaque span at mid-height (both are 68x30 with a circular
		// notch): indexIn 0..54 → centre 27, indexOut 13..67 → centre 40. Badge
		// centre is 34, hence -7 / +6. PHP's single +2 sat 9px right of centre on
		// `in` and 4px left of centre on `out`.
		offsetX: -7,
		offsetXFor: (out) => (out ? 6 : -7),
		offsetY: 2,
		// 20 native px (10 at the client's 1x box) instead of the ported 18: the
		// badge is small and the digits are the whole payload. Fits — 4 digits at
		// 20px measure ~36 native px against a 54px visible body.
		fontSize: 20,
		fontWeight: 600,
		// The pill is full-height, so centre the digits instead of PHP's fixed
		// `21 + offsetY` baseline (which sat ~2px low).
		vCenter: true,
	},
	geo: {
		shapeFor: (state) => `geo-${pickState(state, ['n', 'r'], 'n')}`,
		colorFor: () => WHITE,
		offsetX: 7,
		offsetY: 2,
	},
	page: {
		shapeFor: (state) => `page-${pickState(state, ['n', 'r'], 'n')}`,
		colorFor: () => BLACK,
		offsetX: 8,
		offsetY: 2,
	},
	person: {
		shapeFor: (state) => `person-${pickState(state, ['a', 'b'], 'a')}`,
		colorFor: () => BLACK,
		offsetX: 8,
		offsetY: 0,
	},
	note: {
		shapeFor: (state) => `note-${pickState(state, ['a', 'b'], 'a')}`,
		colorFor: () => BLACK,
		offsetX: 0,
		offsetY: 0,
	},
	lang: {
		shapeFor: (state) => `lang-${pickState(state, ['a', 'b'], 'a')}`,
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
	readonly fontWeight?: number;
}

/**
 * Build an SVG that draws `shape` (pill + icon) and overlays the label. Default
 * placement is PHP's: centred at `centreX + offsetX`, baseline `21 + offsetY`.
 * When `vCenter` is set the label is centred vertically instead
 * (dominant-baseline central at y=height/2) — used by `tc`, whose big timecode
 * fills the bar and must sit dead-centre.
 */
function composite(shape: Shape, label: string, spec: LabelSpec): string {
	const { width, height, body } = shape;
	const x = width / 2 + spec.offsetX;
	const fontSize = spec.fontSize ?? 18;
	const text = xmlEscape(label);
	const y = spec.vCenter ? height / 2 : 21 + spec.offsetY;
	const baseline = spec.vCenter ? ' dominant-baseline="central"' : '';
	const weight = spec.fontWeight === undefined ? '' : ` font-weight="${spec.fontWeight}"`;
	const glyph = `<text x="${x}" y="${y}"${baseline} text-anchor="middle" fill="${spec.color}" font-family="${FONT_FAMILY}" font-size="${fontSize}"${weight}>${text}</text>`;
	// The index shapes overflow the box on purpose; the outermost <svg> clips
	// them at the viewBox, which is what makes an in/out pair interlock.
	const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
	return `${open}${body}${glyph}</svg>`;
}

/**
 * Fallback badge (a plain state-coloured pill) for the rare case a shape lookup
 * misses — keeps the endpoint answering rather than 404ing a valid tag.
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
	const shape = SHAPES.get(style.shapeFor(tag.state, tag.out));
	if (shape === undefined) return fallbackPill(tag.width, tag.state, tag.display);
	return composite(shape, tag.display, {
		color: style.colorFor(tag.state),
		offsetX: style.offsetXFor?.(tag.out) ?? style.offsetX,
		offsetY: style.offsetY,
		fontSize: style.fontSize,
		vCenter: style.vCenter,
		fontWeight: style.fontWeight,
	});
}

/**
 * Render a `draw` tag over the eye-icon draw pill (PHP composited/generated the
 * same eye pill). White label, PHP's draw offset.
 */
export function renderDrawTag(tag: DrawTag): string {
	const shape = SHAPES.get(`draw-${pickState(tag.state, ['n', 'r', 'd'], 'n')}`);
	if (shape === undefined) return fallbackPill(76, tag.state, tag.display);
	return composite(shape, tag.display, { color: WHITE, offsetX: 10, offsetY: 2 });
}
