/**
 * component_text_area inline-tag gate (grammar + SVG render).
 *
 * Ports PHP core/component_text_area/tag/index.php + shared/class.TR.php
 * `get_mark_pattern`. Verifies parseTagId classifies every tag type the way the
 * client twin (client/dedalo/core/common/js/tr.js) does, and that the SVG
 * renderer emits well-formed, XML-escaped, correctly-sized badges.
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rule: a test uses
// the generic `test` TLD and BUILDS the situation it tests). The tipos below are
// OPAQUE IDENTIFIERS to this gate — it parses and renders them, it never reads a
// record — so the migration is a rename: same grammar, no install in it.

import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import {
	parseTagId,
	type SpriteTag,
	safeDecodeTagId,
	TAG_WIDTHS,
} from '../../src/core/components/component_text_area/tag_grammar.ts';
import {
	renderDrawTag,
	renderSpriteTag,
} from '../../src/core/components/component_text_area/tag_render.ts';

describe('parseTagId — short forms (what the endpoint receives)', () => {
	test('tc → display is the timecode value', () => {
		const tag = parseTagId('[TC_00:00:25.684_TC]');
		expect(tag).toMatchObject({
			kind: 'sprite',
			type: 'tc',
			display: '00:00:25.684',
			width: TAG_WIDTHS.tc,
		});
	});

	test('tc without milliseconds also parses', () => {
		expect(parseTagId('[TC_1:2:3_TC]')).toMatchObject({
			kind: 'sprite',
			type: 'tc',
			display: '1:2:3',
		});
	});

	test('index (in) → numeric id, state, not out', () => {
		expect(parseTagId('[index-n-1-Madrid]')).toMatchObject({
			kind: 'sprite',
			type: 'index',
			out: false,
			state: 'n',
			display: '1',
			width: TAG_WIDTHS.index,
		});
	});

	test('index (out) → leading slash sets out=true; still shows the number', () => {
		expect(parseTagId('[/index-r-5-Madrid]')).toMatchObject({
			kind: 'sprite',
			type: 'index',
			out: true,
			state: 'r',
			display: '5',
		});
	});

	test('geo / page → numeric id (PHP explode/group-3 choice)', () => {
		expect(parseTagId('[geo-n-3-x]')).toMatchObject({
			kind: 'sprite',
			type: 'geo',
			display: '3',
			width: TAG_WIDTHS.geo,
		});
		expect(parseTagId('[page-d-7-p]')).toMatchObject({
			kind: 'sprite',
			type: 'page',
			display: '7',
			width: TAG_WIDTHS.page,
		});
	});

	test('person → label, state clamps to a/b, fallback ...', () => {
		expect(parseTagId('[person-a-2-JavNa]')).toMatchObject({
			kind: 'sprite',
			type: 'person',
			state: 'a',
			display: 'JavNa',
			width: TAG_WIDTHS.person,
		});
		expect(parseTagId('[person-z-2-x]')).toMatchObject({ state: 'a' }); // unknown state clamps
		expect(parseTagId('[person-b-2-El%20in]')).toMatchObject({ state: 'b', display: 'El in' }); // urldecode
	});

	test('note → numeric id; lang → label', () => {
		expect(parseTagId('[note-n-4-lbl]')).toMatchObject({
			kind: 'sprite',
			type: 'note',
			display: '4',
			width: TAG_WIDTHS.note,
		});
		expect(parseTagId('[lang-a-2-spa]')).toMatchObject({
			kind: 'sprite',
			type: 'lang',
			display: 'spa',
			width: TAG_WIDTHS.lang,
		});
	});

	test('draw → its own kind, label as display', () => {
		expect(parseTagId('[draw-n-1-abc]')).toMatchObject({
			kind: 'draw',
			state: 'n',
			display: 'abc',
		});
	});

	test('locator {…} → parsed section/component tipos', () => {
		expect(
			parseTagId('{"section_tipo":"test3","section_id":"29","component_tipo":"test52"}'),
		).toMatchObject({
			kind: 'locator',
			section_tipo: 'test3',
			// parsed representation is the canonical int; the inline MARKER byte
			// form stays pinned (WC-2026-08-10-section-id-int-canonical)
			section_id: 29,
			component_tipo: 'test52',
		});
	});

	test("locator tolerates single quotes (client's HTML5 dataset form)", () => {
		expect(
			parseTagId("{'section_tipo':'test3','section_id':'29','component_tipo':'test52'}"),
		).toMatchObject({
			kind: 'locator',
			section_tipo: 'test3',
		});
	});

	test('malformed / unknown → invalid', () => {
		expect(parseTagId('')).toMatchObject({ kind: 'invalid' });
		expect(parseTagId('[bogus-n-1-x]')).toMatchObject({ kind: 'invalid' });
		expect(parseTagId('[TC_not-a-time_TC]')).toMatchObject({ kind: 'invalid' });
		expect(parseTagId('{"section_id":"1"}')).toMatchObject({ kind: 'invalid' }); // no section_tipo
	});
});

describe('parseTagId — full in-text markup (with -data:…:data payload)', () => {
	test('the optional data payload is tolerated and stripped', () => {
		expect(
			parseTagId("[person-a-1-JavNa-data:{'section_tipo':'test2','section_id':'2'}:data]"),
		).toMatchObject({
			kind: 'sprite',
			type: 'person',
			display: 'JavNa',
		});
		expect(parseTagId("[lang-a-2-spa-data:['lg-spa']:data]")).toMatchObject({
			kind: 'sprite',
			type: 'lang',
			display: 'spa',
		});
		expect(parseTagId('[index-n-1-label in 1-data::data]')).toMatchObject({
			kind: 'sprite',
			type: 'index',
			display: '1',
		});
	});

	test('every bracket-tag in the real sample corpus parses (no invalids)', async () => {
		const samplePath = resolve(
			import.meta.dir,
			'../../src/core/components/component_text_area/samples/data.json',
		);
		const entries = (await Bun.file(samplePath).json()) as Array<{ value: string }>;
		const corpus = entries.map((entry) => entry.value).join('');
		// Every full-form tag the client would recognise (mirrors tr.js get_mark_pattern
		// set). The optional `-data:…:data` payload can itself contain `]` (e.g.
		// `['lg-spa']`), so match it non-greedily up to the trailing `:data]`.
		const tagPattern =
			/\[\/?(?:index|reference|svg|draw|geo|page|person|note|lang)-[a-z]-[0-9]{0,6}(?:-[^\]]*?)?(?:-data:.*?:data)?\]|\[TC_[0-9:.]+_TC\]/g;
		const found = corpus.match(tagPattern) ?? [];
		expect(found.length).toBeGreaterThan(5); // the corpus really does exercise tags
		for (const tag of found) {
			// reference (<reference> element) and svg (src IS the locator payload) are
			// rendered client-side and never hit this endpoint as a bracket — skip them.
			if (/^\[\/?(?:reference|svg)-/.test(tag)) continue;
			const parsed = parseTagId(tag);
			expect(parsed.kind, `tag failed to parse: ${tag}`).not.toBe('invalid');
		}
	});
});

describe('safeDecodeTagId (SEC-027)', () => {
	test('leaves a JSON locator payload untouched', () => {
		const locator = '{"section_tipo":"test3","section_id":"29"}';
		expect(safeDecodeTagId(locator)).toBe(locator);
	});

	test('strips complete HTML tags from non-JSON input, without entity-encoding', () => {
		expect(safeDecodeTagId('[index-n-1-a<b>bad</b>]')).toBe('[index-n-1-abad]');
		// bare ampersand is NOT encoded here (renderer owns XML-escaping)
		expect(safeDecodeTagId('[lang-n-1-A&B]')).toBe('[lang-n-1-A&B]');
	});
});

describe('renderSpriteTag / renderDrawTag — SVG output', () => {
	const asTag = (over: Partial<SpriteTag>): SpriteTag => ({
		kind: 'sprite',
		type: 'index',
		out: false,
		state: 'n',
		display: '1',
		width: TAG_WIDTHS.index,
		...over,
	});

	/** The single overlaid `<text>` element (the label) of a rendered badge. */
	function textEl(svg: string): string {
		const match = svg.match(/<text[^>]*>[^<]*<\/text>/);
		expect(match, `badge has no <text> label: ${svg}`).not.toBeNull();
		return match?.[0] ?? '';
	}

	/**
	 * WC-2026-08-11-vector-tag-badges: the badge is DRAWN, never blitted. An
	 * embedded raster is what cost ~1.3s of main thread on a 330-tag record, so
	 * "no `<image>`, no data-URI" is the invariant, not a stylistic preference.
	 */
	function assertPureVector(svg: string): void {
		expect(svg).not.toContain('<image');
		expect(svg).not.toContain('data:image');
		expect(svg).not.toContain('xlink');
	}

	test('badges are pure vector (drawn pill + overlaid label, no raster)', () => {
		const svg = renderSpriteTag(
			asTag({ type: 'tc', display: '00:00:25.684', width: TAG_WIDTHS.tc }),
		);
		// native 2x dimensions (tc_ms was 164x30), drawn black bar, green tc label.
		expect(svg).toContain('viewBox="0 0 164 30"');
		assertPureVector(svg);
		expect(svg).toContain(
			'<rect x="0" y="0" width="164" height="30" rx="15" ry="15" fill="#000000"/>',
		);
		expect(textEl(svg)).toContain('fill="#00e800"');
		expect(svg).toContain('>00:00:25.684<');
	});

	// WC-2026-08-02-index-tag-legibility: PHP painted the NORMAL state white on
	// #ffab01; every index fill is light, so the ink is black on all three states.
	test('index label colour: black on every state (WC-2026-08-02-index-tag-legibility)', () => {
		expect(textEl(renderSpriteTag(asTag({ state: 'n' })))).toContain('fill="#000000"');
		expect(textEl(renderSpriteTag(asTag({ state: 'r' })))).toContain('fill="#000000"');
		expect(textEl(renderSpriteTag(asTag({ state: 'd' })))).toContain('fill="#000000"');
	});

	/**
	 * The pill fills are the shape's, not the label's, and they carry the
	 * WC-2026-08-02 palette. Both directions draw the SAME state colour — only
	 * the geometry mirrors (cap/notch swap sides), so a fill regression on one
	 * direction only is caught here.
	 */
	test('index pill fill per state, both directions (n/r/d)', () => {
		for (const out of [false, true]) {
			expect(renderSpriteTag(asTag({ state: 'n', out }))).toContain('<path fill="#ffab01"');
			expect(renderSpriteTag(asTag({ state: 'r', out }))).toContain('<path fill="#fc461a"');
			expect(renderSpriteTag(asTag({ state: 'd', out }))).toContain('<path fill="#2f8fff"');
		}
		// the mirrored `out` shape is a DIFFERENT path, not the same one re-filled.
		expect(renderSpriteTag(asTag({ out: false }))).not.toBe(renderSpriteTag(asTag({ out: true })));
	});

	/**
	 * The number sits on the VISIBLE pill body, not the badge box: both index
	 * shapes are 68x30 with a circular notch, opaque at mid-height over 0..54
	 * (`in`, centre 27) and 13..67 (`out`, centre 40). PHP's single `+2` nudge
	 * put the label at x=36 for BOTH — 9px right of centre on `in`, 4px left on
	 * `out`. A wrong anchor here is invisible in an eyeball test at 1-digit and
	 * glaring at 3 digits, so it is pinned.
	 */
	test('index label is centred on the visible pill body, per direction', () => {
		expect(textEl(renderSpriteTag(asTag({ out: false })))).toContain('x="27"');
		expect(textEl(renderSpriteTag(asTag({ out: true })))).toContain('x="40"');
		// vertically centred in the full-height pill, not PHP's `21 + offsetY` baseline.
		expect(textEl(renderSpriteTag(asTag({ out: false })))).toContain(
			'y="15" dominant-baseline="central"',
		);
	});

	/**
	 * Cheap XML well-formedness guard (Bun has no DOMParser): inside every tag,
	 * strip valid double-quoted `name="…"` attributes; if any `"` survives, an
	 * attribute value contained an unescaped double quote and the SVG is broken
	 * for strict parsers (this is exactly the font-family-quote bug the
	 * ImageMagick rasterize step surfaced).
	 */
	function assertWellFormed(svg: string): void {
		expect(svg.startsWith('<svg')).toBe(true);
		expect(svg.endsWith('</svg>')).toBe(true);
		for (const tag of svg.match(/<[^>]*>/g) ?? []) {
			const stripped = tag.replace(/[\w:-]+="[^"]*"/g, '');
			expect(stripped.includes('"'), `unescaped quote in tag: ${tag}`).toBe(false);
		}
	}

	// ── Icon geometry pins ──────────────────────────────────────────────────
	//
	// The badge is now DRAWN (WC-2026-08-11-vector-tag-badges), so the icons are
	// hand-fitted path SOURCE, not bytes inside an immutable sprite: deleting
	// `+ filled(PIN, …)` from a SHAPES entry leaves a perfectly valid, perfectly
	// blank pill. The generic `/<rect|path>/` shape check below is satisfied by
	// the pill ALONE and cannot see that, so every (type × state × direction)
	// badge pins its exact drawn elements — how many, in which paint order, each
	// with its fill, its identifying path head, and any fill-rule/transform it
	// needs to look right (the map pin fills solid without `evenodd`; the lang
	// glyphs land elsewhere without their fit transforms).
	//
	// Path heads are the first move of each icon in tag_render.ts — enough to
	// identify the icon and to fail on deletion, substitution or re-anchoring,
	// without duplicating ~250 lines of curve data into the gate.
	const PILL = (width: number, fill: string) =>
		`<rect x="0" y="0" width="${width}" height="30" rx="15" ry="15" fill="${fill}"/>`;
	const EYE_D = 'd="m14.86 5.9c-0.97 0-1.92 0.09-2.84 0.4';
	const PIN_D = 'd="M7.225 12C7.225 18.3 15.61 26.3';
	const PAGE_D = 'd="M14.69 3.37H23.7V25H7.57V12.37';
	const PERSON_HEAD_D = 'd="M19.37 4.4A5.37 5.37 0 0 1 24.74 9.77';
	const PERSON_BODY_D = 'd="M19.37 16.28 30.11 23.21';
	const NOTE_D = 'd="M3.4 0H40.6A3.4 3.4 0 0 1 44 3.4';
	const LANG_CJK_D = 'd="M12.87 15.07l-2.54-2.51';
	const LANG_A_D = 'd="M18.5 10h-2L12 22h2l1.12-3';
	const INDEX_IN_D = 'd="M15 0H69.76A15 15 0 0 0 69.76 30H15A15 15 0 0 1 15 0Z"';
	const INDEX_OUT_D = 'd="M53 0A15 15 0 0 1 53 30H-1.76A15 15 0 0 0-1.76 0Z"';
	const CJK_FIT = 'transform="translate(7.35 -0.24) scale(1.134 1.118)"';
	const LANG_A_FIT = 'transform="translate(1.82 -6.83) scale(1.482 1.583)"';
	const EYE_FIT = 'transform="translate(2 .6) scale(.975)"';

	/** One badge variant: how it is rendered and what it MUST draw, in paint order. */
	interface BadgeCase {
		readonly name: string;
		readonly svg: string;
		/** Per drawn element (pill first, icon over it): substrings that must all be present. */
		readonly drawn: readonly (readonly string[])[];
	}

	const sprite = (over: Partial<SpriteTag>): string =>
		renderSpriteTag(asTag({ width: TAG_WIDTHS[over.type ?? 'index'], ...over }));

	/**
	 * Every shape in tag_render.ts SHAPES, reached through the public renderers:
	 * 7 sprite types across their states/directions + the 3 draw states = 20.
	 */
	const BADGES: readonly BadgeCase[] = [
		{
			name: 'tc',
			svg: sprite({ type: 'tc', display: '00:00:25.684' }),
			drawn: [[PILL(164, '#000000')]],
		},
		{
			name: 'index-in-n',
			svg: sprite({ out: false, state: 'n' }),
			drawn: [['fill="#ffab01"', INDEX_IN_D]],
		},
		{
			name: 'index-in-r',
			svg: sprite({ out: false, state: 'r' }),
			drawn: [['fill="#fc461a"', INDEX_IN_D]],
		},
		{
			name: 'index-in-d',
			svg: sprite({ out: false, state: 'd' }),
			drawn: [['fill="#2f8fff"', INDEX_IN_D]],
		},
		{
			name: 'index-out-n',
			svg: sprite({ out: true, state: 'n' }),
			drawn: [['fill="#ffab01"', INDEX_OUT_D]],
		},
		{
			name: 'index-out-r',
			svg: sprite({ out: true, state: 'r' }),
			drawn: [['fill="#fc461a"', INDEX_OUT_D]],
		},
		{
			name: 'index-out-d',
			svg: sprite({ out: true, state: 'd' }),
			drawn: [['fill="#2f8fff"', INDEX_OUT_D]],
		},
		{
			name: 'geo-n',
			svg: sprite({ type: 'geo', state: 'n', display: '3' }),
			drawn: [[PILL(76, '#ffab01')], ['fill="#000000"', 'fill-rule="evenodd"', PIN_D]],
		},
		{
			name: 'geo-r',
			svg: sprite({ type: 'geo', state: 'r', display: '3' }),
			drawn: [[PILL(76, '#fc461a')], ['fill="#000000"', 'fill-rule="evenodd"', PIN_D]],
		},
		{
			name: 'page-n',
			svg: sprite({ type: 'page', state: 'n', display: '7' }),
			drawn: [[PILL(76, '#ffab01')], ['fill="#000000"', PAGE_D]],
		},
		{
			name: 'page-r',
			svg: sprite({ type: 'page', state: 'r', display: '7' }),
			drawn: [[PILL(76, '#fc461a')], ['fill="#000000"', PAGE_D]],
		},
		{
			name: 'person-a',
			svg: sprite({ type: 'person', state: 'a', display: 'JavNa' }),
			drawn: [
				[PILL(144, '#ffaa00')],
				['fill="#ffffff"', PERSON_HEAD_D],
				['fill="#ffffff"', PERSON_BODY_D],
			],
		},
		{
			name: 'person-b',
			svg: sprite({ type: 'person', state: 'b', display: 'JavNa' }),
			drawn: [
				[PILL(144, '#ffaa00')],
				['fill="#000000"', PERSON_HEAD_D],
				['fill="#000000"', PERSON_BODY_D],
			],
		},
		{
			name: 'note-a',
			svg: sprite({ type: 'note', state: 'a', display: '4' }),
			drawn: [['fill="#ffaa00"', NOTE_D]],
		},
		{
			name: 'note-b',
			svg: sprite({ type: 'note', state: 'b', display: '4' }),
			drawn: [['fill="#44b941"', NOTE_D]],
		},
		{
			name: 'lang-a',
			svg: sprite({ type: 'lang', state: 'a', display: 'spa' }),
			drawn: [
				[PILL(100, '#ffab01')],
				['fill="#ffffff"', CJK_FIT, LANG_CJK_D],
				['fill="#ffffff"', LANG_A_FIT, LANG_A_D],
			],
		},
		{
			name: 'lang-b',
			svg: sprite({ type: 'lang', state: 'b', display: 'spa' }),
			drawn: [
				[PILL(100, '#fc461a')],
				['fill="#ffffff"', CJK_FIT, LANG_CJK_D],
				['fill="#ffffff"', LANG_A_FIT, LANG_A_D],
			],
		},
		{
			name: 'draw-n',
			svg: renderDrawTag({ kind: 'draw', state: 'n', display: '1:0' }),
			drawn: [[PILL(76, '#ffab01')], ['fill="#000000"', EYE_FIT, EYE_D]],
		},
		{
			name: 'draw-r',
			svg: renderDrawTag({ kind: 'draw', state: 'r', display: '1:0' }),
			drawn: [[PILL(76, '#fc461a')], ['fill="#000000"', EYE_FIT, EYE_D]],
		},
		{
			name: 'draw-d',
			svg: renderDrawTag({ kind: 'draw', state: 'd', display: '1:0' }),
			drawn: [[PILL(76, '#3e8fed')], ['fill="#181818"', EYE_FIT, EYE_D]],
		},
	];

	/** The drawn (non-label) elements of a badge, in paint order. */
	function drawnElements(svg: string): string[] {
		return svg.match(/<(?:rect|path)\b[^>]*\/>/g) ?? [];
	}

	test('every badge draws its pill AND its type icon (fill, geometry, paint order)', () => {
		expect(BADGES.length).toBe(20); // every SHAPES entry in tag_render.ts
		for (const badge of BADGES) {
			const elements = drawnElements(badge.svg);
			expect(elements.length, `${badge.name}: wrong number of drawn elements`).toBe(
				badge.drawn.length,
			);
			badge.drawn.forEach((required, index) => {
				const element = elements[index] ?? '';
				for (const fragment of required) {
					expect(element.includes(fragment), `${badge.name}[${index}] missing ${fragment}`).toBe(
						true,
					);
				}
			});
		}
	});

	/**
	 * FNV-1a 32-bit over the whole badge set — fixed and dependency-free on
	 * purpose, so the pinned token only ever moves because the DRAWING moved.
	 */
	function fingerprint(payload: string): string {
		let hash = 0x811c9dc5;
		for (let index = 0; index < payload.length; index++) {
			hash ^= payload.charCodeAt(index);
			hash = Math.imul(hash, 0x01000193) >>> 0;
		}
		return hash.toString(16).padStart(8, '0');
	}

	/**
	 * The badge URL carries no version (`?id=[index-n-1-x]`) while its bytes are a
	 * function of THIS renderer, so a browser that cached a badge keeps the old
	 * drawing until its response goes stale — which is why the redraw shipped with
	 * `&v=<fingerprint>` on the client src and `immutable` reserved for that
	 * versioned form. This gate is what keeps the token honest: it is the
	 * fingerprint of the rendered badge set, so any geometry/colour change fails
	 * here with the value to paste into tr.js.
	 */
	test('badge renderer fingerprint is the client cache-bust token (tr.tag_badge_version)', async () => {
		const expected = fingerprint(BADGES.map((badge) => `${badge.name}\n${badge.svg}`).join('\n'));

		const trPath = resolve(import.meta.dir, '../../client/dedalo/core/common/js/tr.js');
		const trSource = await Bun.file(trPath).text();
		const token = trSource.match(/tag_badge_version\s*:\s*'([^']*)'/)?.[1];
		expect(token, 'tr.js must declare tr.tag_badge_version').toBeDefined();
		expect(
			token,
			`badge drawing changed — set tr.tag_badge_version to '${expected}' (client/dedalo/core/common/js/tr.js)`,
		).toBe(expected);

		// every deterministic badge src goes through badge_src (id + &v=token); the
		// single bare `${tag_url}` left is the svg/locator media redirect.
		expect(
			/const badge_src\s*=\s*\(id\)\s*=>\s*`\$\{tag_url\}\$\{id\}&v=\$\{tr\.tag_badge_version\}`/.test(
				trSource,
			),
			'tr.js badge_src must append &v=${tr.tag_badge_version}',
		).toBe(true);
		expect((trSource.match(/src="\$\{tag_url\}/g) ?? []).length).toBe(1);

		// the editor's own insert path (build_view_tag_obj) versions its src too.
		const componentPath = resolve(
			import.meta.dir,
			'../../client/dedalo/core/component_text_area/js/component_text_area.js',
		);
		const componentSource = await Bun.file(componentPath).text();
		expect(componentSource).toContain("'&v=' + tr.tag_badge_version");
	});

	test('every badge renders valid, single-root, well-formed XML at the native 2x size', () => {
		for (const [type, width] of Object.entries(TAG_WIDTHS)) {
			const svg = renderSpriteTag(asTag({ type: type as SpriteTag['type'], width }));
			// the badge IS the native 2x asset → viewBox is (2*clientWidth) x 30. The
			// client sizes it `width:auto; height:15px`, so this aspect is load-bearing.
			expect(svg).toContain(`viewBox="0 0 ${width * 2} 30"`);
			expect(svg).toContain(`width="${width * 2}" height="30"`);
			assertPureVector(svg);
			// a drawn shape, not an empty box (tc is a plain bar, the rest are paths)
			expect(/<(?:rect|path) /.test(svg), `no drawn shape in ${type}`).toBe(true);
			expect((svg.match(/<svg/g) ?? []).length).toBe(1);
			assertWellFormed(svg);
		}
		// draw path too (draw shape, distinct code path)
		const draw = renderDrawTag({ kind: 'draw', state: 'n', display: 'abcd' });
		assertPureVector(draw);
		assertWellFormed(draw);
	});

	test('SEC-028: hostile label is XML-escaped exactly once (no injection)', () => {
		const svg = renderSpriteTag(
			asTag({ type: 'person', display: '"><script>&', width: TAG_WIDTHS.person }),
		);
		expect(svg).not.toContain('<script>');
		expect(svg).toContain('&quot;&gt;&lt;script&gt;&amp;');
		expect(svg).not.toContain('&amp;amp;'); // not double-encoded
	});

	test('draw draws the eye-icon pill (native 76x30) with a white label', () => {
		const svg = renderDrawTag({ kind: 'draw', state: 'n', display: '1:0' });
		expect(svg).toContain('viewBox="0 0 76 30"');
		assertPureVector(svg);
		expect(svg).toContain('rx="15" ry="15" fill="#ffab01"'); // the drawn pill
		expect(svg).toContain('<path fill="#000000"'); // the eye
		expect(textEl(svg)).toContain('fill="#ffffff"');
		expect(svg).toContain('>1:0<');
	});
});
