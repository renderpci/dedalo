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

// The tag→HTML converter LIVES IN CORE (the list emit hook needs it and core
// must never import src/diffusion/**); re-exported here so diffusion consumers
// keep their historical import site.
import {
	type TagRenderOptions,
	addTagImgOnTheFly,
} from '../../core/components/component_text_area/tag_html.ts';
import { decodeHtmlEntities } from './default_value.ts';

// ---------------------------------------------------------------------------
// parse_tag_to_html — TR::add_tag_img_on_the_fly twin (moved to
// src/core/components/component_text_area/tag_html.ts)
// ---------------------------------------------------------------------------

export {
	type SvgTagLocator,
	type TagRenderOptions,
	addTagImgOnTheFly,
	svgUrlFromTagLocator,
} from '../../core/components/component_text_area/tag_html.ts';

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
