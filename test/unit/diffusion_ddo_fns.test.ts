/**
 * Custom ddo fn cores — oracle-derived fixtures (PURE, no DB).
 *
 * Oracle anchors:
 * - parse_tag_to_html: PHP diffusion/class.diffusion_fn.php :367-404 over
 *   TR::add_tag_img_on_the_fly (shared/class.TR.php :254-437) + the
 *   component_text_area get_diffusion_data html_entity_decode override
 *   (class.component_text_area.php :2441-2453). Tag fixtures are REAL stored
 *   matrix values (coins numisdata150/154, mints numisdata19) and grammar
 *   samples from the TR doc comments.
 * - get_geojson_data: PHP class.component_text_area.php :1612-1665 +
 *   build_geolocation_data :1697-1830 (geojson=true keeps lib_data layers
 *   VERBATIM, text always '') + component_geolocation::
 *   get_diffusion_value_as_geojson :362-433 (single-point fallback, factory
 *   default sentinel). The mints fixture reproduces the OLD ENGINE'S published
 *   web_numisdata_mib.mints#75 cell byte-for-byte.
 * - get_diffusion_iconography: PHP class.component_portal.php :477-529 join
 *   semantics (term | field | scene separators, null term → EMPTY slot —
 *   PHP `!empty([null])` is true and implode of [null] is '').
 */

import { describe, expect, test } from 'bun:test';
import { config } from '../../src/config/config.ts';
import {
	addTagImgOnTheFly,
	buildGeojsonLayers,
	geojsonPointFallbackLayers,
	iconographyOptionsOf,
	joinIconographyScenes,
	parseTagValueToHtml,
	svgUrlFromTagLocator,
} from '../../src/diffusion/resolve/ddo_fns.ts';

const TAG_URL = '../component_text_area/tag/?id=';

describe('parse_tag_to_html — TR::add_tag_img_on_the_fly + entity decode', () => {
	test('plain HTML passes through unchanged (coins 64019 public_info oracle cell)', () => {
		// The old engine published exactly this value for web_numisdata_mib
		// coins#64019.public_info — no tags, no entities: identity.
		expect(parseTagValueToHtml('<p>ACIP 2</p><p></p>')).toBe('<p>ACIP 2</p><p></p>');
	});

	test('svg countermark tag renders the published <img> (coins 203 numisdata154 stored value)', () => {
		const stored =
			"<p>[svg-n-1--data:{'section_tipo':'sccmk1','section_id':'461','component_tipo':'hierarchy95'}:data]</p>";
		// PHP: svg URL from locator (component_svg::get_url, quality 'web'),
		// data-data keeps the single-quoted locator text (the SEC-028 escaping
		// is undone by the text_area override's html_entity_decode — PHP does
		// exactly this to fn output). Matches the dd1190 numisdata1052
		// output_sample: <img id="[svg-n-1-]" src="/dedalo/media/svg/web/…">.
		expect(parseTagValueToHtml(stored)).toBe(
			`<p><img id="[svg-n-1-]" src="/dedalo/${config.mediaDir}/svg/web/hierarchy95_sccmk1_461.svg" class="svg" data-type="svg" data-tag_id="1" data-state="n" data-label="" data-data="{'section_tipo':'sccmk1','section_id':'461','component_tipo':'hierarchy95'}"></p>`,
		);
	});

	test('svg tag with unparseable locator data is REMOVED (PHP null callback → empty)', () => {
		expect(parseTagValueToHtml('<p>[svg-n-1--data:not json:data]</p>')).toBe('<p></p>');
	});

	test('geo tag renders class geo with the raw data payload (mints stored value)', () => {
		const stored = '<p>[geo-n-1--data:[1]:data]&nbsp;Aproximado</p>';
		// &nbsp; decodes to U+00A0 (PHP html_entity_decode parity, not 0x20).
		expect(parseTagValueToHtml(stored)).toBe(
			`<p><img id="[geo-n-1-]" src="${TAG_URL}[geo-n-1-]" class="geo" data-type="geo" data-tag_id="1" data-state="n" data-label="" data-data="[1]"> Aproximado</p>`,
		);
	});

	test('tc tag: the FULL tag is id and the timecode is label/data', () => {
		expect(addTagImgOnTheFly('a [TC_00:01:25.627_TC] b')).toBe(
			`a <img id="[TC_00:01:25.627_TC]" src="${TAG_URL}[TC_00:01:25.627_TC]" class="tc" data-type="tc" data-tag_id="[TC_00:01:25.627_TC]" data-state="n" data-label="00:01:25.627" data-data="00:01:25.627"> b`,
		);
	});

	test('tc tag without milliseconds (regenerate_component legacy form) still matches', () => {
		const out = addTagImgOnTheFly('[TC_0:1:2_TC]');
		expect(out).toContain('class="tc"');
		expect(out).toContain('data-label="0:1:2"');
	});

	test('index in/out pair renders indexIn/indexOut img tags (bare form)', () => {
		expect(addTagImgOnTheFly('[index-n-5]x[/index-n-5]')).toBe(
			`<img id="[index-n-5-]" src="${TAG_URL}[index-n-5-]" class="index" data-type="indexIn" data-tag_id="5" data-state="n" data-label="" data-data="">x<img id="[/index-n-5-]" src="${TAG_URL}[/index-n-5-]" class="index" data-type="indexOut" data-tag_id="5" data-state="n" data-label="" data-data="">`,
		);
	});

	test('reference in/out pair renders <reference>…</reference>', () => {
		expect(addTagImgOnTheFly('[reference-n-2]cite[/reference-n-2]')).toBe(
			'<reference id="reference_2" class="reference" data-type="reference" data-tag_id="2" data-state="n" data-label="" data-data="">cite</reference>',
		);
	});

	test('person tag (TR doc sample) renders class person with locator data', () => {
		const raw = '[person-a-3-JD-data:{"section_tipo":"dd35","section_id":"52"}:data]';
		expect(addTagImgOnTheFly(raw)).toBe(
			`<img id="[person-a-3-JD]" src="${TAG_URL}[person-a-3-JD]" class="person" data-type="person" data-tag_id="3" data-state="a" data-label="JD" data-data="{&quot;section_tipo&quot;:&quot;dd35&quot;,&quot;section_id&quot;:&quot;52&quot;}">`,
		);
	});

	test('note and lang tags render their classes', () => {
		const note = addTagImgOnTheFly(
			"[note-n-2--data:{'section_tipo':'dd15','section_id':'5'}:data]",
		);
		expect(note).toContain('class="note"');
		expect(note).toContain('data-type="note"');
		const lang = addTagImgOnTheFly('[lang-n-1--data:"lg-spa":data]');
		expect(lang).toContain('class="lang"');
		expect(lang).toContain('data-data="&quot;lg-spa&quot;"');
	});

	test('page and draw tags render their classes', () => {
		expect(addTagImgOnTheFly('[page-n-3]')).toContain('data-type="page"');
		expect(addTagImgOnTheFly("[draw-n-1--data:{'k':'v'}:data]")).toContain('class="draw"');
	});

	test('SEC-028: attribute captures are escaped in the raw render (pre-decode)', () => {
		const raw = '[geo-n-1--data:[1,"x"]:data]';
		// Pre-decode (addTagImgOnTheFly alone) the quotes are &quot;-escaped…
		expect(addTagImgOnTheFly(raw)).toContain('data-data="[1,&quot;x&quot;]"');
		// …and the PHP-faithful full transform decodes them back (the text_area
		// override html_entity_decode's the WHOLE fn output — oracle behavior).
		expect(parseTagValueToHtml(raw)).toContain('data-data="[1,"x"]"');
	});

	test('svgUrlFromTagLocator: grammar URL for a valid locator, null on malformed', () => {
		expect(
			svgUrlFromTagLocator({
				section_tipo: 'sccmk1',
				section_id: '382',
				component_tipo: 'hierarchy95',
			}),
		).toBe(`/dedalo/${config.mediaDir}/svg/web/hierarchy95_sccmk1_382.svg`);
		expect(svgUrlFromTagLocator({ section_tipo: 'sccmk1', section_id: '382' })).toBe(null);
		expect(svgUrlFromTagLocator({ component_tipo: 'hierarchy95', section_id: 1 })).toBe(null);
		expect(svgUrlFromTagLocator({ component_tipo: 'hierarchy95', section_tipo: 'sccmk1' })).toBe(
			null,
		);
	});
});

describe('get_geojson_data — lib_data layers verbatim + point fallback', () => {
	test('mints#75 stored lib_data reproduces the OLD ENGINE published cell byte-for-byte', () => {
		// Stored matrix value (numisdata6#75 geo→numisdata264[0]) as read from
		// JSONB (Postgres key normalization order preserved by the driver).
		const storedItem = {
			id: 1,
			alt: '0',
			lat: '42.13457368415802',
			lon: '3.120603218165126',
			zoom: 17,
			lib_data: [
				{
					layer_id: 1,
					layer_data: {
						type: 'FeatureCollection',
						features: [
							{
								type: 'Feature',
								geometry: { type: 'Point', coordinates: [3.120603218165126, 42.13457368415802] },
								properties: {},
							},
						],
					},
				},
			],
		};
		const layers = buildGeojsonLayers([storedItem]);
		// The OLD engine's web_numisdata_mib.mints#75.georef_geojson cell:
		expect(JSON.stringify(layers)).toBe(
			'[{"layer_id":1,"text":"","layer_data":{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[3.120603218165126,42.13457368415802]},"properties":{}}]}}]',
		);
	});

	test('multi-layer lib_data emits one {layer_id, text:"", layer_data} per layer', () => {
		const layers = buildGeojsonLayers([
			{
				lib_data: [
					{ layer_id: 1, layer_data: { type: 'FeatureCollection', features: [] } },
					{ layer_id: 2, layer_data: { type: 'FeatureCollection', features: [] } },
				],
			},
		]);
		expect(layers).toHaveLength(2);
		expect(layers[0]?.layer_id).toBe(1);
		expect(layers[1]?.layer_id).toBe(2);
		expect(layers.every((layer) => layer.text === '')).toBe(true);
	});

	test('point fallback: lat/lon build the PHP JSON-literal FeatureCollection', () => {
		// component_geolocation get_data doc sample (:364).
		const layers = geojsonPointFallbackLayers({
			alt: 281,
			lat: '41.56236346',
			lon: '2.01215141',
			zoom: 15,
		});
		expect(JSON.stringify(layers)).toBe(
			'[{"layer_id":1,"text":"","layer_data":{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[2.01215141,41.56236346]}}]}}]',
		);
	});

	test('factory-default sentinel coordinates mean "no location set" (PHP guard)', () => {
		expect(geojsonPointFallbackLayers({ lat: '39.462571', lon: '-0.376295' })).toEqual([]);
		// comma-decimal locales are normalised before the compare (PHP :389-391)
		expect(geojsonPointFallbackLayers({ lat: '39,462571', lon: '-0,376295' })).toEqual([]);
	});

	test('missing lon/lat, empty items and empty lib_data resolve to []', () => {
		expect(geojsonPointFallbackLayers(undefined)).toEqual([]);
		expect(geojsonPointFallbackLayers({ lat: '41.5' })).toEqual([]);
		expect(buildGeojsonLayers(null)).toEqual([]);
		expect(buildGeojsonLayers([])).toEqual([]);
		// empty lib_data array falls through to the point fallback
		expect(
			JSON.stringify(buildGeojsonLayers([{ lat: '41.5', lon: '2.1', lib_data: [] }])),
		).toContain('"coordinates":[2.1,41.5]');
	});

	test('PHP !empty coercion: 0/"0"/"" coordinates publish as literal 0', () => {
		const layers = geojsonPointFallbackLayers({ lat: '41.5', lon: '' });
		expect(JSON.stringify(layers)).toContain('"coordinates":[0,41.5]');
	});
});

describe('get_diffusion_iconography — options + join semantics', () => {
	test('ddo options default to the PHP hardcoded values', () => {
		expect(iconographyOptionsOf(undefined)).toEqual({
			innerTipo: 'numisdata722',
			termSeparator: ' | ',
			fieldsSeparator: ', ',
			sceneSeparator: ' | ',
		});
		expect(
			iconographyOptionsOf({
				fn: 'get_diffusion_iconography',
				inner_relation: 'tchi99',
				term_separator: ' / ',
				fields_separator: '; ',
				scene_separator: ' — ',
			}),
		).toEqual({
			innerTipo: 'tchi99',
			termSeparator: ' / ',
			fieldsSeparator: '; ',
			sceneSeparator: ' — ',
		});
	});

	test('terms join by fields_separator, scenes by scene_separator (designs#401 shape)', () => {
		const options = iconographyOptionsOf(undefined);
		expect(
			joinIconographyScenes(
				[
					['Aqueloo'],
					['Toro androcéfalo', 'Media figura', 'a izquierda'],
					['Prótomo'],
					['Parte anterior'],
				],
				options,
			),
		).toBe('Aqueloo | Toro androcéfalo, Media figura, a izquierda | Prótomo | Parte anterior');
	});

	test('a null term contributes an EMPTY slot (PHP implode-of-[null] quirk)', () => {
		const options = iconographyOptionsOf(undefined);
		expect(joinIconographyScenes([['A', null]], options)).toBe('A, ');
		expect(joinIconographyScenes([[null]], options)).toBe('');
	});

	test('scenes with NO terms are skipped; nothing at all → null', () => {
		const options = iconographyOptionsOf(undefined);
		expect(joinIconographyScenes([['X'], []], options)).toBe('X');
		expect(joinIconographyScenes([[], []], options)).toBe(null);
		expect(joinIconographyScenes([], options)).toBe(null);
	});
});
