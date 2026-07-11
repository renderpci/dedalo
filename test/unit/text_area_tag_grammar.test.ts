/**
 * component_text_area inline-tag gate (grammar + SVG render).
 *
 * Ports PHP core/component_text_area/tag/index.php + shared/class.TR.php
 * `get_mark_pattern`. Verifies parseTagId classifies every tag type the way the
 * client twin (client/dedalo/core/common/js/tr.js) does, and that the SVG
 * renderer emits well-formed, XML-escaped, correctly-sized badges.
 */

import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import {
	type SpriteTag,
	TAG_WIDTHS,
	parseTagId,
	safeDecodeTagId,
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
			parseTagId('{"section_tipo":"rsc167","section_id":"29","component_tipo":"rsc170"}'),
		).toMatchObject({
			kind: 'locator',
			section_tipo: 'rsc167',
			section_id: '29',
			component_tipo: 'rsc170',
		});
	});

	test("locator tolerates single quotes (client's HTML5 dataset form)", () => {
		expect(
			parseTagId("{'section_tipo':'rsc167','section_id':'29','component_tipo':'rsc170'}"),
		).toMatchObject({
			kind: 'locator',
			section_tipo: 'rsc167',
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
			parseTagId("[person-a-1-JavNa-data:{'section_tipo':'rsc197','section_id':'2'}:data]"),
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
		const locator = '{"section_tipo":"rsc167","section_id":"29"}';
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

	test('badges embed the base sprite PNG (data-URI <image>) + overlay the label', () => {
		const svg = renderSpriteTag(
			asTag({ type: 'tc', display: '00:00:25.684', width: TAG_WIDTHS.tc }),
		);
		// native 2x sprite dimensions (tc_ms is 164x30), embedded PNG, green tc label.
		expect(svg).toContain('viewBox="0 0 164 30"');
		expect(svg).toContain('xlink:href="data:image/png;base64,');
		expect(svg).toContain('fill="#00e800"');
		expect(svg).toContain('>00:00:25.684<');
	});

	test('index label colour: white on the normal state, black otherwise (PHP parity)', () => {
		expect(renderSpriteTag(asTag({ state: 'n' }))).toContain('fill="#ffffff"');
		expect(renderSpriteTag(asTag({ state: 'r' }))).toContain('fill="#000000"');
		expect(renderSpriteTag(asTag({ state: 'd' }))).toContain('fill="#000000"');
		// index out uses the mirrored sprite but still embeds a base image.
		expect(renderSpriteTag(asTag({ out: true }))).toContain('xlink:href="data:image/png;base64,');
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

	test('every sprite renders valid, single-root, well-formed XML at the native 2x size', () => {
		for (const [type, width] of Object.entries(TAG_WIDTHS)) {
			const svg = renderSpriteTag(asTag({ type: type as SpriteTag['type'], width }));
			// sprite is the native 2x asset → viewBox is (2*clientWidth) x 30.
			expect(svg).toContain(`viewBox="0 0 ${width * 2} 30"`);
			expect(svg).toContain('xlink:href="data:image/png;base64,');
			expect((svg.match(/<svg/g) ?? []).length).toBe(1);
			assertWellFormed(svg);
		}
		// draw path too (draw sprite, distinct code path)
		assertWellFormed(renderDrawTag({ kind: 'draw', state: 'n', display: 'abcd' }));
	});

	test('SEC-028: hostile label is XML-escaped exactly once (no injection)', () => {
		const svg = renderSpriteTag(
			asTag({ type: 'person', display: '"><script>&', width: TAG_WIDTHS.person }),
		);
		expect(svg).not.toContain('<script>');
		expect(svg).toContain('&quot;&gt;&lt;script&gt;&amp;');
		expect(svg).not.toContain('&amp;amp;'); // not double-encoded
	});

	test('draw embeds the eye-icon draw sprite (native 76x30) with a white label', () => {
		const svg = renderDrawTag({ kind: 'draw', state: 'n', display: '1:0' });
		expect(svg).toContain('viewBox="0 0 76 30"');
		expect(svg).toContain('xlink:href="data:image/png;base64,');
		expect(svg).toContain('fill="#ffffff"');
		expect(svg).toContain('>1:0<');
	});
});
