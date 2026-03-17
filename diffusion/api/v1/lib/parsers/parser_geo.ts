/**
 * PARSER_GEO
 * Process diffusion geolocation values (component_geolocation).
 *
 * Two code paths mirror PHP behavior:
 *
 * 1. lib_data present → pass through as-is (already a GeoJSON layer array).
 * 2. lib_data absent  → build a GeoJSON layer array from lat/lon fields.
 *    - Default test coords (lat=39.462571, lon=-0.376295) → return null.
 *    - zoom and other fields are ignored.
 *
 * Input value shape (array, first element used):
 *   { id?, alt?, lat: string|number, lon: string|number, zoom?, lib_data?: layer[] }
 *
 * Output value shape (GeoJSON layer array):
 *   [{ layer_id: 1, text: "", layer_data: FeatureCollection }]
 */

import type { parser_options, data_item } from '../types';


/** Single coordinate entry stored in component_geolocation */
interface geo_value {
	id?:       number;
	alt?:      number;
	lat:       string | number;
	lon:       string | number;
	zoom?:     number;
	lib_data?: geo_layer[];
}

/** GeoJSON layer as already stored in lib_data */
interface geo_layer {
	layer_id:   number;
	text?:      string;
	layer_data: object;
}

/** Default test coordinates used by PHP to signal "no real data" */
const DEFAULT_TEST_LAT = '39.462571';
const DEFAULT_TEST_LON = '-0.376295';


/**
 * GEO
 * Main parser function.
 *
 * @param data    - Array of data_items whose value is a geo_value[]
 * @param options - Parser options (currently unused, reserved for future use)
 * @returns data_item[] with GeoJSON layer array as value, or null
 */
export function geojson(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const result: data_item[] = [];

	const layer_array: geo_layer[] = [];
	for (const item of data) {

		const raw = item.value;
		if (raw === null || raw === undefined) continue;

		// Normalise: value may be a single object or an array
		const entries: geo_value[] = Array.isArray(raw) ? (raw as geo_value[]) : [raw as geo_value];

		for (const geo_obj of entries) {
			if (!geo_obj || typeof geo_obj !== 'object') continue;

			// Check if lib_data exists and actually contains features
			let has_features = false;
			if (geo_obj.lib_data && Array.isArray(geo_obj.lib_data)) {
				for (const layer of geo_obj.lib_data) {
					const ldata = layer.layer_data as any;
					if (ldata && ldata.features && Array.isArray(ldata.features) && ldata.features.length > 0) {
						has_features = true;
						break;
					}
				}
			}

			
			if (has_features) {
				// Path 1: lib_data already present and has valid features → pass through
				layer_array.push(...geo_obj.lib_data!);
			} else {
				// Path 2: Build GeoJSON from lat/lon because either no lib_data or features are empty
				const geojson = build_geojson_layer(geo_obj);
				if (geojson) layer_array.push(geojson);
			}
		}

		if (layer_array) {
			result.push({
				...item,
				value: layer_array
			});
		}
	}

	return result.length > 0 ? result : null;
}


/**
 * BUILD_GEOJSON_LAYER
 * Constructs a GeoJSON layer array from raw lat/lon.
 * Returns null for missing coordinates or PHP default test values.
 *
 * @param geo_obj - Raw geo value object
 * @returns GeoJSON layer object or null
 */
function build_geojson_layer(geo_obj: geo_value): geo_layer | null {
	const feature = build_single_feature(geo_obj);
	if (!feature) return null;

	return {
		layer_id:   1,
		text:       '',
		layer_data: {
			type:     'FeatureCollection',
			features: [feature]
		}
	};
}

/**
 * BUILD_SINGLE_FEATURE
 * Constructs a single GeoJSON Feature from raw lat/lon.
 * Returns null for missing coordinates or PHP default test values.
 */
function build_single_feature(geo_obj: geo_value): any | null {
	if (!geo_obj.lat || !geo_obj.lon) return null;

	// Normalise to string with '.' decimal separator (mirrors PHP str_replace(',', '.', …))
	const lat_str = String(geo_obj.lat).replace(',', '.');
	const lon_str = String(geo_obj.lon).replace(',', '.');

	// Skip PHP default test coordinates
	if (lat_str === DEFAULT_TEST_LAT && lon_str === DEFAULT_TEST_LON) return null;

	const lat = parseFloat(lat_str);
	const lon = parseFloat(lon_str);

	if (isNaN(lat) || isNaN(lon)) return null;

	return {
		type:       'Feature',
		properties: {},
		geometry:   {
			type:        'Point',
			coordinates: [lon, lat]	// GeoJSON order: [longitude, latitude]
		}
	};
}
