/**
 * Custom ddo fns — the three publication fns the numisdata domain configures on
 * dd1190 field nodes (DIFFUSION_SPEC §4.1 stage D, custom-fn dispatch):
 *
 * - parse_tag_to_html   (PHP diffusion/class.diffusion_fn.php :367-404): a
 *   text_area value with Dédalo tags ([svg..], [geo..], [note..], …) rendered
 *   to publication HTML via TR::add_tag_img_on_the_fly (shared/class.TR.php
 *   :254-437), then html_entity_decode'd by the component_text_area
 *   get_diffusion_data override (class.component_text_area.php :2441-2453);
 * - get_geojson_data    (PHP class.component_text_area.php :1612-1665 +
 *   build_geolocation_data :1697-1830 + component_geolocation::
 *   get_diffusion_value_as_geojson :362-433): the PAIRED component_geolocation
 *   lib_data layers as [{layer_id, text:'', layer_data}] — the single-point
 *   lat/lon fallback included;
 * - get_diffusion_iconography (PHP class.component_portal.php :477-529): the
 *   3-level portal walk (record → scene records → inner autocomplete_hi terms)
 *   joined per lang with the ddo separators.
 *
 * Everything here is PURE (no I/O): the resolver reads the matrix slices and
 * resolves terms/ontology pairs, this module owns the byte-level shaping.
 */

import { config } from '../../config/config.ts';
import { mediaTypeOf } from '../../core/concepts/media.ts';
import { decodeHtmlEntities } from './default_value.ts';

// ---------------------------------------------------------------------------
// parse_tag_to_html — TR::add_tag_img_on_the_fly twin
// ---------------------------------------------------------------------------

/** A tag-embedded svg locator ({'section_tipo':…} with single quotes). */
export interface SvgTagLocator {
	section_tipo?: unknown;
	section_id?: unknown;
	component_tipo?: unknown;
	[extra: string]: unknown;
}

/**
 * The published svg file URL for a tag locator — PHP component_svg::
 * get_url_from_locator (:426-462) + get_url (:233-250): DEDALO_MEDIA_URL +
 * folder + '/' + default quality + '/' + `${component_tipo}_${section_tipo}_
 * ${section_id}.svg`. PURE twin: the PHP ontology-model guards (component_tipo
 * must be a component, section_tipo a section) become shape checks — a
 * malformed locator yields null exactly like the PHP guard path.
 */
export function svgUrlFromTagLocator(locator: SvgTagLocator): string | null {
	const { component_tipo, section_tipo, section_id } = locator;
	if (typeof component_tipo !== 'string' || component_tipo === '') return null;
	if (typeof section_tipo !== 'string' || section_tipo === '') return null;
	if (section_id === undefined || section_id === null || section_id === '') return null;
	const spec = mediaTypeOf('component_svg');
	if (spec === null) return null;
	const imageId = `${component_tipo}_${section_tipo}_${section_id}`;
	return `/dedalo/${config.mediaDir}${spec.folder}/${spec.defaultQuality}/${imageId}.${spec.defaultExtension}`;
}

/** htmlspecialchars(ENT_QUOTES) twin — the SEC-028 attribute escaping. */
function esc(value: string | undefined): string {
	return (value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export interface TagRenderOptions {
	/** PHP $options->tag_url default '../component_text_area/tag'. */
	tagUrl?: string;
	/** svg tag URL resolver — defaults to the pure grammar twin above. */
	svgUrl?: (locator: SvgTagLocator) => string | null;
}

/**
 * TR::add_tag_img_on_the_fly (shared/class.TR.php :254-437) — Dédalo text tags
 * to `<img>`/`<reference>` HTML, all attribute captures escaped (SEC-028).
 * Patterns are byte-ports of TR::get_mark_pattern with IDENTICAL group
 * numbering (the PHP patterns carry an outer capture around the whole tag).
 * Replacement order matches PHP exactly: indexIn, indexOut, referenceIn,
 * referenceOut, tc, svg, draw, geo, page, person, note, lang.
 */
export function addTagImgOnTheFly(text: string, options: TagRenderOptions = {}): string {
	const tagUrl = `${options.tagUrl ?? '../component_text_area/tag'}/?id=`;
	const svgUrl = options.svgUrl ?? svgUrlFromTagLocator;
	let out = text;

	// INDEX IN (groups: 2 type, 3 state, 4 id, 6 label, 7 data)
	out = out.replace(
		/(\[(index)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])/g,
		(_m, _g1, g2: string, g3: string, g4: string, _g5, g6?: string, g7?: string) => {
			const [e2, e3, e4, e6, e7] = [esc(g2), esc(g3), esc(g4), esc(g6), esc(g7)];
			const id = `[${e2}-${e3}-${e4}-${e6}]`;
			return `<img id="${id}" src="${tagUrl}${id}" class="index" data-type="indexIn" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${e7}">`;
		},
	);

	// INDEX OUT
	out = out.replace(
		/(\[\/(index)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])/g,
		(_m, _g1, g2: string, g3: string, g4: string, _g5, g6?: string, g7?: string) => {
			const [e2, e3, e4, e6, e7] = [esc(g2), esc(g3), esc(g4), esc(g6), esc(g7)];
			const id = `[/${e2}-${e3}-${e4}-${e6}]`;
			return `<img id="${id}" src="${tagUrl}${id}" class="index" data-type="indexOut" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${e7}">`;
		},
	);

	// REFERENCE IN
	out = out.replace(
		/(\[(reference)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])/g,
		(_m, _g1, _g2, g3: string, g4: string, _g5, g6?: string, g7?: string) => {
			const [e3, e4, e6, e7] = [esc(g3), esc(g4), esc(g6), esc(g7)];
			return `<reference id="reference_${e4}" class="reference" data-type="reference" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${e7}">`;
		},
	);

	// REFERENCE OUT
	out = out.replace(
		/(\[\/(reference)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])/g,
		'</reference>',
	);

	// TC (groups: 1 full tag, 2 timecode value)
	out = out.replace(
		/(\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2}(\.[0-9]{1,3})?)_TC\])/g,
		(_m, g1: string, g2: string) => {
			const [e1, e2] = [esc(g1), esc(g2)];
			return `<img id="${e1}" src="${tagUrl}${e1}" class="tc" data-type="tc" data-tag_id="${e1}" data-state="n" data-label="${e2}" data-data="${e2}">`;
		},
	);

	// SVG (groups: 2 type, 3 state, 4 id, 6 label, 7 locator data) — the data
	// is a locator with single quotes; on parse failure PHP's callback returns
	// null and the tag is removed (preg_replace_callback null → '').
	out = out.replace(
		/(\[(svg)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])/g,
		(_m, _g1, g2: string, g3: string, g4: string, _g5, g6: string | undefined, g7: string) => {
			const locatorText = g7.replace(/'/g, '"');
			let locator: SvgTagLocator | null = null;
			try {
				const parsed: unknown = JSON.parse(locatorText);
				if (parsed !== null && typeof parsed === 'object') locator = parsed as SvgTagLocator;
			} catch {
				locator = null;
			}
			if (locator === null) return '';
			const url = svgUrl(locator);
			// PHP: $data = str_replace('"','\'',$_7) — safe single-quote form.
			const data = g7.replace(/"/g, "'");
			const [e2, e3, e4, e6] = [esc(g2), esc(g3), esc(g4), esc(g6)];
			return `<img id="[${e2}-${e3}-${e4}-${e6}]" src="${esc(url ?? '')}" class="svg" data-type="svg" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${esc(data)}">`;
		},
	);

	// DRAW / GEO / NOTE / LANG share the svg-shaped pattern (label optional,
	// data mandatory): groups 2 type, 3 state, 4 id, 6 label, 7 data.
	const spriteTag =
		(kind: string) =>
		(
			_m: string,
			_g1: string,
			g2: string,
			g3: string,
			g4: string,
			_g5: string | undefined,
			g6: string | undefined,
			g7: string,
		): string => {
			const [e2, e3, e4, e6, e7] = [esc(g2), esc(g3), esc(g4), esc(g6), esc(g7)];
			const id = `[${e2}-${e3}-${e4}-${e6}]`;
			return `<img id="${id}" src="${tagUrl}${id}" class="${kind}" data-type="${kind}" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${e7}">`;
		};
	out = out.replace(
		/(\[(draw)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])/g,
		spriteTag('draw'),
	);
	out = out.replace(
		/(\[(geo)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])/g,
		spriteTag('geo'),
	);

	// PAGE (index-shaped pattern: label+data optional as a block)
	out = out.replace(
		/(\[(page)-([a-z])-([0-9]{1,6})(-([^-]{0,22})-data:(.*?):data)?\])/g,
		(_m, _g1, g2: string, g3: string, g4: string, _g5, g6?: string, g7?: string) => {
			const [e2, e3, e4, e6, e7] = [esc(g2), esc(g3), esc(g4), esc(g6), esc(g7)];
			const id = `[${e2}-${e3}-${e4}-${e6}]`;
			return `<img id="${id}" src="${tagUrl}${id}" class="page" data-type="page" data-tag_id="${e4}" data-state="${e3}" data-label="${e6}" data-data="${e7}">`;
		},
	);

	// PERSON (groups: 2 type, 3 state, 4 id, 5 label, 6 data — no optional wrap)
	out = out.replace(
		/(\[(person)-([a-z])-([0-9]{0,6})-([^-]{0,22})-data:(.*?):data\])/g,
		(_m, _g1, g2: string, g3: string, g4: string, g5: string, g6: string) => {
			const [e2, e3, e4, e5, e6] = [esc(g2), esc(g3), esc(g4), esc(g5), esc(g6)];
			const id = `[${e2}-${e3}-${e4}-${e5}]`;
			return `<img id="${id}" src="${tagUrl}${id}" class="person" data-type="person" data-tag_id="${e4}" data-state="${e3}" data-label="${e5}" data-data="${e6}">`;
		},
	);

	out = out.replace(
		/(\[(note)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])/g,
		spriteTag('note'),
	);
	out = out.replace(
		/(\[(lang)-([a-z])-([0-9]{1,6})(-([^-]{0,22}))?-data:(.*?):data\])/g,
		spriteTag('lang'),
	);

	return out;
}

/**
 * The full parse_tag_to_html value transform for ONE stored text value: tags
 * to HTML, then the component_text_area get_diffusion_data override's
 * html_entity_decode (class.component_text_area.php :2441-2453) over the whole
 * string — which deliberately UNDOES the SEC-028 attribute escaping (PHP does
 * exactly this: the fn output goes through the decode pass), so published
 * attributes carry the raw single-quoted locator text the old engine emitted.
 */
export function parseTagValueToHtml(raw: string, options: TagRenderOptions = {}): string {
	return decodeHtmlEntities(addTagImgOnTheFly(raw, options));
}

// ---------------------------------------------------------------------------
// get_geojson_data — build_geolocation_data(geojson=true) + point fallback
// ---------------------------------------------------------------------------

/** One published geo layer (v5 diffusion format: text is ALWAYS ''). */
export interface GeojsonLayer {
	layer_id: unknown;
	text: '';
	layer_data: unknown;
}

/** A stored component_geolocation item ({id, alt, lat, lon, zoom, lib_data}). */
export interface StoredGeolocationItem {
	lat?: unknown;
	lon?: unknown;
	lib_data?: { layer_id?: unknown; layer_data?: unknown }[] | null;
	[extra: string]: unknown;
}

/**
 * PHP number_format((float)$v, 16, '.', '') — %.16f of the double. The decimal
 * is within half-ulp of the double for the coordinate ranges involved, so the
 * JSON round-trip (json_decode → json_encode = shortest repr) reproduces the
 * original number; Number() + JSON.stringify is the byte-equivalent.
 */
function coordinateOf(raw: unknown): number {
	// PHP `!empty($value->lon)`: null/''/0/'0' → the literal 0.
	if (raw === null || raw === undefined || raw === '' || raw === 0 || raw === '0') return 0;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * component_geolocation::get_diffusion_value_as_geojson (:362-433) as a layer
 * list: the single-point FeatureCollection built from the stored lat/lon, with
 * the factory-default sentinel guard (Valencia 39.462571/-0.376295 = "no
 * location set"). Returns [] when no point can be built (PHP null).
 */
export function geojsonPointFallbackLayers(
	item: StoredGeolocationItem | undefined,
): GeojsonLayer[] {
	if (item === undefined || item === null) return [];
	if (item.lon === undefined || item.lat === undefined) return [];
	// Sentinel: normalise comma decimals, compare as strings (PHP :383-395).
	const latStr = String(item.lat).replace(/,/g, '.');
	const lonStr = String(item.lon).replace(/,/g, '.');
	if (latStr === '39.462571' && lonStr === '-0.376295') return [];
	// Key order is the PHP JSON literal's: type, properties, geometry.
	return [
		{
			layer_id: 1,
			text: '',
			layer_data: {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						properties: {},
						geometry: {
							type: 'Point',
							coordinates: [coordinateOf(item.lon), coordinateOf(item.lat)],
						},
					},
				],
			},
		},
	];
}

/**
 * component_text_area::get_geojson_data (:1612-1665): the paired
 * component_geolocation's lib_data layers kept VERBATIM as
 * [{layer_id, text:'', layer_data}] (build_geolocation_data geojson=true,
 * :1765-1799 — text is always '', v5 diffusion format parity); when lib_data
 * is absent, the single-point fallback above. [] when nothing resolves.
 */
export function buildGeojsonLayers(geoItems: unknown[] | null): GeojsonLayer[] {
	const first = (geoItems ?? [])[0] as StoredGeolocationItem | undefined;
	const libData = first?.lib_data;
	if (Array.isArray(libData) && libData.length > 0) {
		return libData.map((layer) => ({
			layer_id: layer?.layer_id ?? null,
			text: '' as const,
			layer_data: layer?.layer_data ?? null,
		}));
	}
	return geojsonPointFallbackLayers(first);
}

// ---------------------------------------------------------------------------
// get_diffusion_iconography — separators + join semantics
// ---------------------------------------------------------------------------

/** The ddo options with PHP defaults (class.component_portal.php :479-482). */
export interface IconographyOptions {
	innerTipo: string;
	termSeparator: string;
	fieldsSeparator: string;
	sceneSeparator: string;
}

/** Read the fn ddo's options, PHP defaults applied. */
export function iconographyOptionsOf(ddo: Record<string, unknown> | undefined): IconographyOptions {
	return {
		innerTipo: typeof ddo?.inner_relation === 'string' ? ddo.inner_relation : 'numisdata722',
		termSeparator: typeof ddo?.term_separator === 'string' ? ddo.term_separator : ' | ',
		fieldsSeparator: typeof ddo?.fields_separator === 'string' ? ddo.fields_separator : ', ',
		sceneSeparator: typeof ddo?.scene_separator === 'string' ? ddo.scene_separator : ' | ',
	};
}

/**
 * The per-lang join (PHP :503-521): within a term the resolved value list is
 * imploded by term_separator (a null term value still contributes its EMPTY
 * string — PHP `!empty([null])` is true and `implode` of [null] is ''); terms
 * of one scene join by fields_separator (scenes with NO terms are skipped);
 * scenes join by scene_separator. Null when no scene produced anything.
 */
export function joinIconographyScenes(
	sceneTermValues: (string | null)[][],
	options: IconographyOptions,
): string | null {
	const scenes: string[] = [];
	for (const termValues of sceneTermValues) {
		const terms: string[] = [];
		for (const value of termValues) {
			// get_locator_value always returns a one-element array here
			// (show_parents=false): implode(term_sep, [v]) === v ?? ''.
			terms.push(value ?? '');
		}
		if (terms.length > 0) scenes.push(terms.join(options.fieldsSeparator));
	}
	return scenes.length > 0 ? scenes.join(options.sceneSeparator) : null;
}
