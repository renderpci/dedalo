<?php declare(strict_types=1);
/**
* CLASS COMPONENT_GEOLOCATION
* Manages geographic coordinate components in Dédalo.
*
* Stores one or more map locations per record as structured objects containing
* latitude, longitude, altitude, zoom level, and an optional set of drawn map
* layers (lib_data). The persisted datum array is always language-neutral
* (DEDALO_DATA_NOLAN) because coordinates carry no language dimension.
*
* Stored datum shape (one element per location point):
* ```
* [
*   {
*     "id":      3,
*     "alt":     16,
*     "lat":     28.760289075631214,
*     "lon":    -17.87981450557709,
*     "zoom":    17,
*     "lib_data": [
*       {
*         "layer_id": 1,
*         "layer_data": {
*           "type": "FeatureCollection",
*           "features": [
*             {
*               "type": "Feature",
*               "properties": { "layer_id": 1 },
*               "geometry": {
*                 "type": "Point",
*                 "coordinates": [-17.879337, 28.760041]
*               }
*             }
*           ]
*         }
*       }
*     ]
*   }
* ]
* ```
*
* The magic default coordinates lat=39.462571 / lon=-0.376295 represent the
* factory "no location set" sentinel. Both get_latitude() and get_longitude()
* and get_diffusion_value_as_geojson() treat them as null / absent so that
* un-placed records do not pollute maps or diffusion targets.
*
* The static helper build_geolocation_tag_string() produces an inline text tag
* that embeds a point's GeoJSON inside rich-text component values for
* inline map rendering.
*
* Key responsibilities:
* - Force DEDALO_DATA_NOLAN in the constructor (overrides any caller-supplied lang).
* - Expose lat/lon scalar accessors for consumers that do not parse the full datum.
* - Produce Socrata-compatible and generic GeoJSON diffusion values.
* - Implement conform_import_data() accepting four distinct import formats
*   (full v7 dato array, bare item object, bare FeatureCollection, flat CSV string).
* - Implement update_data_version() as a no-op stub (no migrations required yet).
*
* Extends component_common (the abstract root for all Dédalo components).
* Extended by: none (leaf class).
*
* @package Dédalo
* @subpackage Core
*/
class component_geolocation extends component_common {



	/**
	* __CONSTRUCT
	* Initialises the component and forces language-neutral storage.
	*
	* Geographic coordinates carry no linguistic dimension, so lang is always
	* overridden to DEDALO_DATA_NOLAN before delegating to the parent constructor.
	* Any $lang argument supplied by the caller is silently discarded.
	*
	* @param string $tipo - Ontology tipo identifying this component definition (e.g. 'dd1234').
	* @param mixed $section_id = null - Record identifier within the parent section.
	* @param string $mode = 'list' - Rendering mode ('list', 'edit', 'search', 'tm', …).
	* @param string $lang = DEDALO_DATA_LANG - Ignored; always forced to DEDALO_DATA_NOLAN.
	* @param ?string $section_tipo = null - Ontology tipo of the parent section, when known.
	* @param bool $cache = true - Whether to use the component instance cache.
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_LANG, ?string $section_tipo=null, bool $cache=true ) {

		// Force always DEDALO_DATA_NOLAN
		// (!) Coordinates are language-neutral: overwrite the caller's $lang so
		// the parent stores and retrieves data under the correct matrix column.
		$this->lang = DEDALO_DATA_NOLAN;

		// Build the component
		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* BUILD_GEOLOCATION_TAG_STRING
	* Builds an inline geo-tag string suitable for embedding inside rich-text component values.
	*
	* The tag format is understood by the client renderer to display an inline
	* map pin inside textual content (e.g. oral-history transcripts referencing
	* a specific place). The embedded coordinates follow GeoJSON order
	* [longitude, latitude].
	*
	* Example output:
	* [geo-n-1-data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},
	*   'geometry':{'type':'Point','coordinates':[2.304362542927265,41.82053505145308]}}]}:data]
	*
	* The embedded JSON uses single quotes so the tag delimiters (square brackets
	* and colons) remain unambiguous within the surrounding rich-text string.
	*
	* @param string $tag_id - Numeric identifier for this tag within the text (e.g. '1').
	* @param string|float $lon - Longitude value (GeoJSON x-axis, range −180 … 180).
	* @param string|float $lat - Latitude value (GeoJSON y-axis, range −90 … 90).
	* @return string - The assembled inline geo-tag string.
	*/
	public static function build_geolocation_tag_string(string $tag_id, string|float $lon, string|float $lat) : string {

		$result = "[geo-n-".$tag_id."-data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[".$lon.",".$lat."]}}]}:data]";


		return $result;
	}//end build_geolocation_tag_string



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data.
	* Note that the first action is always load data to avoid save empty content.
	*
	* Called by tool_update_cache when rebuilding cached component data.
	* The explicit get_data() call is mandatory: without it, save() would
	* persist an empty datum, erasing the stored location.
	*
	* @see class.tool_update_cache.php
	* @return bool - Always true (errors are surfaced through exception / logger paths).
	*/
	public function regenerate_component() : bool {

		// Force loads data always !IMPORTANT
		// (!) Do not remove: without this call save() would write null/empty,
		// silently erasing all stored coordinate data for the record.
		$data = $this->get_data();

		// Save component data
		$this->save();


		return true;
	}//end regenerate_component



	/**
	* GET_LATITUDE
	* Returns the latitude scalar from the first stored location datum.
	*
	* Returns null when no data exists, when the datum has no 'lat' property, or
	* when the latitude equals the factory default sentinel value (39.462571),
	* which indicates the record has never had a real location assigned.
	*
	* @return ?float - Latitude in decimal degrees, or null if absent / sentinel.
	*/
	public function get_latitude() : ?float {

		$data = $this->get_data();
		if (empty($data) || empty($data[0]) ) {
			return null;
		}

		$data			= $data[0];
		$data_latitude	= $data->lat ?? null;

		if(empty($data_latitude)){
			return null;
		}
		// Sentinel check
		// The factory default lat=39.462571 / lon=-0.376295 is the "no location set"
		// state written when a component is created without coordinates. Treat it as null
		// so consumers (maps, exports, diffusion) do not display a bogus pin.
		$latitude = strval($data_latitude)==='39.462571'
			? null
			: floatval($data_latitude);


		return $latitude;
	}//end get_latitude



	/**
	* GET_LONGITUDE
	* Returns the longitude scalar from the first stored location datum.
	*
	* Returns null when no data exists, when the datum has no 'lon' property, or
	* when the longitude equals the factory default sentinel value (−0.376295),
	* which indicates the record has never had a real location assigned.
	*
	* @return ?float - Longitude in decimal degrees, or null if absent / sentinel.
	*/
	public function get_longitude() : ?float {

		$data = $this->get_data();
		if (empty($data) || empty($data[0]) ) {
			return null;
		}

		$data			= $data[0];
		$data_longitude	= $data->lon ?? null;

		if(empty($data_longitude)){
			return null;
		}
		// Sentinel check
		// See get_latitude() for the rationale. The pair lat=39.462571 / lon=-0.376295
		// is the factory default; only one of the two needs to match, but in practice
		// both are set together. Returning null here keeps diffusion targets clean.
		$longitude = strval($data_longitude)==='-0.376295'
			? null
			: floatval($data_longitude);


		return $longitude;
	}//end get_longitude



	/**
	* GET_DIFFUSION_VALUE_SOCRATA
	* Produces a GeoJSON Point object for publication to a Socrata open-data endpoint.
	*
	* Socrata's geo column type expects a plain GeoJSON Point object (not a
	* FeatureCollection). Coordinates follow the GeoJSON convention [longitude, latitude].
	* Returns null when no datum is stored or when the datum is missing lon/lat.
	*
	* The commented-out WKT alternative ('POINT (lat, lon)') and the
	* latitude/longitude plain-object alternative are left as reference; they
	* reflect earlier iterations of the Socrata integration.
	*
	* @return ?object - stdClass with {type:"Point", coordinates:[lon, lat]}, or null.
	*/
	public function get_diffusion_value_socrata() : ?object {

		$data = $this->get_data();
		if (empty($data) || empty($data[0]) ) {
			return null;
		}

		$data = $data[0];

		// $socrata_data = 'POINT ('.$data->lat.', '.$data->lon.')';

		// {
		//   "type": "Point",
		//   "coordinates": [
		//     -87.653274,
		//     41.936172
		//   ]
		// }

		$geo_json_point = new stdClass();
			$geo_json_point->type 		 = 'Point';
			$geo_json_point->coordinates = [
				floatval($data->lon),
				floatval($data->lat)
			];

		// $point = new stdClass();
		//	 $point->latitude  = 47.59815;
		//	 $point->longitude = -122.334540;

		// diffusion object
		$diffusion_value_socrata = $geo_json_point;


		return $diffusion_value_socrata;
	}//end get_diffusion_value_socrata



	/**
	* GET_DIFFUSION_VALUE_AS_GEOJSON
	* Produces a JSON-encoded GeoJSON layer array for generic map diffusion targets.
	*
	* The returned string encodes a single-element array containing a layer object
	* with layer_id=1, an empty text field, and a full FeatureCollection wrapping
	* one Point geometry. Coordinates are formatted to 16 decimal places with dot
	* notation to preserve JSON integrity across locales that use comma decimals.
	*
	* Returns null when:
	* - The stored datum is empty or missing lon/lat properties.
	* - The stored lat/lon match the factory default sentinel (39.462571 / -0.376295),
	*   which represents an un-placed record.
	*
	* Output format:
	* ```
	* [
	*   {
	*     "layer_id": 1,
	*     "text": "",
	*     "layer_data": {
	*       "type": "FeatureCollection",
	*       "features": [
	*         {
	*           "type": "Feature",
	*           "properties": {},
	*           "geometry": {
	*             "type": "Point",
	*             "coordinates": [
	*               2.011618, // longitude
	*               41.562546 // latitude
	*             ]
	*           }
	*         }
	*       ]
	*     }
	*   }
	* ]
	* ```
	*
	* @see ontology publication use in mdcat4091
	* @return ?string - JSON-encoded layer array, or null when coordinates are absent/sentinel.
	*/
	public function get_diffusion_value_as_geojson() : ?string {

		$data = $this->get_data(); // object as {"alt": 281, "lat": "41.56236346", "lon": "2.01215141", "zoom": 15}

		// select first
		$value = $data[0] ?? null;

		// check empty
			if (empty($value) || !isset($value->lon) || !isset($value->lat)) {
				return null;
			}

		// default data test
			// default values
			// "alt": 16,
			// "lat": 39.462571,
			// "lon": -0.376295,
			// "zoom": 12
			// Sentinel guard: factory-default coordinates mean "no location set".
			// Normalise comma-decimal locales to dot before string comparison.
			$value_lat_str	= isset($value->lat)
				? strval($value->lat)
				: null;
			$value_lon_str	= isset($value->lon)
				? strval($value->lon)
				: null;
			$value_lat_str	= str_replace(',', '.', $value_lat_str);
			$value_lon_str	= str_replace(',', '.', $value_lon_str);
			if ($value_lat_str==='39.462571' && $value_lon_str==='-0.376295') {
				return null;
			}

		// coordinates. Converts float number to 16 decimals number using '.' separator
			// number_format with '.' decimal separator and '' thousands separator prevents
			// locale-sensitive formatting (e.g. French locale would produce '2,011618')
			// that would break the JSON string assembled by the inline json_decode below.
			$lon = !empty($value->lon)
				? number_format( (float)$value->lon, 16, '.', '')
				: 0; // string as "2.012151410452" (use dot notation to preserve JSON integrity)
			$lat = !empty($value->lat)
				? number_format( (float)$value->lat, 16, '.', '')
				: 0; // string as "41.562363467527" (use dot notation to preserve JSON integrity)

		// GEOJSON
			// Assemble via string interpolation inside a JSON literal then immediately
			// decode+re-encode to normalise trailing zeros in the coordinates.
			$ar_value = json_decode('[
			  {
			      "layer_id": 1,
			      "text": "",
			      "layer_data": {
			        "type": "FeatureCollection",
			        "features": [
			          {
			            "type": "Feature",
			            "properties": {},
			            "geometry": {
			              "type": "Point",
			              "coordinates": ['.$lon.','.$lat.']
			            }
			          }
			        ]
			      }
			  }
			]');

		// value . Encode as cleaned text to publish
			$diffusion_value = json_encode($ar_value);


		return $diffusion_value;
	}//end get_diffusion_value_as_geojson



	/**
	* GET_SORTABLE
	* Declares that this component type does not support column sorting.
	*
	* Geographic data cannot be meaningfully sorted as a flat scalar, so the
	* base class default (true) is overridden to false. The list view uses this
	* to hide the sort affordance for geolocation columns.
	*
	* @return bool - Always false; geolocation components are not sortable.
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* CONFORM_IMPORT_DATA
	* Validates and normalises an import value into the v7 geolocation datum array.
	*
	* Accepts four distinct input formats plus an empty-string sentinel (tried in order):
	*
	* 1. Full v7 dato — JSON array of location item objects:
	*    [{"lat":39.4625,"lon":-0.3762,"zoom":16,"alt":0,
	*      "lib_data":[{"layer_id":1,"layer_data":{FeatureCollection}}]}]
	*
	* 2. Single bare item — JSON object with at minimum lat and lon:
	*    {"lat":39.4625,"lon":-0.3762}
	*    Wrapped into a single-element array before processing.
	*
	* 3. Bare GeoJSON FeatureCollection — JSON object with type="FeatureCollection".
	*    The map center (lat/lon) is derived from the first Point feature found in
	*    features[]. The whole FeatureCollection is stored as lib_data layer 1.
	*    Note: GeoJSON coordinates are [longitude, latitude] — opposite to human order.
	*
	* 4. Flat CSV string — 'lat, lon[, zoom[, alt]]' with dot decimal separators:
	*    "39.4625, -0.3762, 16"
	*    Note: unlike GeoJSON, the flat string places latitude first (human convention).
	*
	* 5. Empty string — result null, which clears the existing component datum.
	*
	* Legacy raw export format detection: if the decoded JSON is a lang-keyed object
	* ({"lg-nolan":[…]}), the first key's value is extracted. This handles round-trips
	* from older export formats.
	*
	* Per-item validation (enforced by the inner $conform_item closure):
	* - lat and lon must be present, numeric, and within valid WGS-84 ranges.
	* - zoom defaults to 16; alt defaults to 0 if missing or non-numeric.
	* - lib_data, when present, must be an array of objects each carrying layer_id
	*   and layer_data as a valid GeoJSON FeatureCollection.
	*
	* @param string $import_value - Raw import cell value.
	* @param string $column_name - Source column name (used for error context by callers).
	* @return object - Standard import response: {result: array|null, errors: array, msg: string}.
	*   result is the normalised datum array on success, or null to clear existing data.
	*   errors contains failed-item objects when validation rejects the input.
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->msg		= 'Error. Request failed';

		// failed factory. Build the standard failed object used by the import tool report
			$build_failed = function(string $msg) use(&$response, $import_value) : object {
				$failed = new stdClass();
					$failed->section_id		= $this->section_id;
					$failed->data			= stripslashes( $import_value );
					$failed->component_tipo	= $this->get_tipo();
					$failed->msg			= $msg;
				$response->errors[] = $failed;
				return $response;
			};

		// conform_item. Validates and normalizes one dato item {lat, lon, zoom, alt, lib_data}
		// Returns null on invalid item (and fills $error_msg)
			$error_msg = null;
			$conform_item = function(object $item) use(&$error_msg) : ?object {

				// lat/lon are mandatory and must be numeric in valid ranges
				if (!isset($item->lat) || !is_numeric($item->lat) ||
					!isset($item->lon) || !is_numeric($item->lon) ) {
					$error_msg = 'lat and lon numeric properties are mandatory';
					return null;
				}
				$lat = (float)$item->lat;
				$lon = (float)$item->lon;
				if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
					$error_msg = 'lat or lon values are out of range';
					return null;
				}
				$item->lat	= $lat;
				$item->lon	= $lon;
				$item->zoom	= isset($item->zoom) && is_numeric($item->zoom) ? (int)$item->zoom : 16;
				$item->alt	= isset($item->alt)  && is_numeric($item->alt)  ? (int)$item->alt  : 0;

				// lib_data. Optional drawn shapes as [{layer_id, layer_data:{FeatureCollection}}]
				if (isset($item->lib_data)) {
					if (!is_array($item->lib_data)) {
						$error_msg = 'lib_data must be an array of layers';
						return null;
					}
					foreach ($item->lib_data as $layer) {
						if (!is_object($layer) || !isset($layer->layer_id) ||
							!isset($layer->layer_data->type) || $layer->layer_data->type!=='FeatureCollection' ||
							!isset($layer->layer_data->features) || !is_array($layer->layer_data->features) ) {
							$error_msg = 'lib_data layers must define layer_id and layer_data as GeoJSON FeatureCollection';
							return null;
						}
					}
				}

				return $item;
			};

		// JSON case
			if(json_handler::is_json($import_value)){

				// try to JSON decode (null on not decode)
				$data_from_json = json_handler::decode($import_value);
				if ($data_from_json===null) {
					return $build_failed('IGNORED: JSON decode failed');
				}

				// lang keyed object case as {"lg-nolan":[{"lat":39.46,...}]} (legacy raw export)
				// component_geolocation is non translatable: extract the first lang value
				if (is_object($data_from_json)) {
					$first_key = array_key_first( (array)$data_from_json );
					if ($first_key!==null && strpos($first_key, 'lg-')===0) {
						$data_from_json = $data_from_json->{$first_key};
						if (empty($data_from_json)) {
							$response->result	= null;
							$response->msg		= 'OK';
							return $response;
						}
					}
				}

				// bare GeoJSON FeatureCollection case
				// build one item taking the center from the first Point feature
				if (is_object($data_from_json) &&
					isset($data_from_json->type) && $data_from_json->type==='FeatureCollection') {

					if (!isset($data_from_json->features) || !is_array($data_from_json->features)) {
						return $build_failed('IGNORED: FeatureCollection without features array');
					}

					// find the first Point feature to use as map center
					$center = null;
					foreach ($data_from_json->features as $feature) {
						if (isset($feature->geometry->type) && $feature->geometry->type==='Point' &&
							isset($feature->geometry->coordinates[0]) && isset($feature->geometry->coordinates[1])) {
							// GeoJSON coordinates are [lon, lat]
							$center = $feature->geometry->coordinates;
							break;
						}
					}
					if ($center===null) {
						return $build_failed('IGNORED: FeatureCollection without any Point feature to set the map center');
					}

					// stamp layer_id in features properties when missing
					foreach ($data_from_json->features as $feature) {
						if (!isset($feature->properties)) {
							$feature->properties = new stdClass();
						}
						if (!isset($feature->properties->layer_id)) {
							$feature->properties->layer_id = 1;
						}
					}

					$item = new stdClass();
						$item->lat		= $center[1];
						$item->lon		= $center[0];
						$item->lib_data	= [(object)[
							'layer_id'		=> 1,
							'layer_data'	=> $data_from_json
						]];

					$conformed = $conform_item($item);
					if ($conformed===null) {
						return $build_failed('IGNORED: malformed data. '.$error_msg);
					}

					$response->result	= [$conformed];
					$response->msg		= 'OK';

					return $response;
				}

				// single bare item case as {"lat":39.4625,"lon":-0.3762}
				if (is_object($data_from_json)) {
					$data_from_json = [$data_from_json];
				}

				// full v7 dato case (array of items)
				if (is_array($data_from_json)) {

					$value = [];
					foreach ($data_from_json as $current_item) {
						if (!is_object($current_item)) {
							return $build_failed('IGNORED: malformed data. Expected object item and get: '.gettype($current_item));
						}
						$conformed = $conform_item($current_item);
						if ($conformed===null) {
							return $build_failed('IGNORED: malformed data. '.$error_msg);
						}
						$value[] = $conformed;
					}

					$response->result	= !empty($value) ? $value : null;
					$response->msg		= 'OK';

					return $response;
				}

				return $build_failed('IGNORED: unrecognized geolocation data');
			}

		// empty case. Result null clears the existing component data
			if(empty($import_value)) {

				$response->result	= null;
				$response->msg		= 'OK';

				return $response;
			}

		// flat string case as 'lat, lon[, zoom[, alt]]'
			// Split on commas and require 2–4 numeric parts.
			// Note the order is lat first (human convention), unlike GeoJSON [lon, lat].
			$ar_parts = array_map('trim', explode(',', $import_value));
			$len_parts = count($ar_parts);
			if ($len_parts < 2 || $len_parts > 4) {
				return $build_failed('IGNORED: malformed coordinates. Expected \'lat, lon[, zoom[, alt]]\' and get: '.to_string($import_value));
			}
			foreach ($ar_parts as $current_part) {
				if (!is_numeric($current_part)) {
					return $build_failed('IGNORED: malformed coordinates. Non numeric value: '.to_string($current_part));
				}
			}

			$item = new stdClass();
				$item->lat = (float)$ar_parts[0];
				$item->lon = (float)$ar_parts[1];
				if (isset($ar_parts[2])) {
					$item->zoom = (int)$ar_parts[2];
				}
				if (isset($ar_parts[3])) {
					$item->alt = (int)$ar_parts[3];
				}

			$conformed = $conform_item($item);
			if ($conformed===null) {
				return $build_failed('IGNORED: malformed coordinates. '.$error_msg);
			}

		$response->result	= [$conformed];
		$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



	/**
	* UPDATE_DATA_VERSION
	* Handles versioned datum migrations triggered by tool_update_cache or similar tools.
	*
	* Result codes (documented here, matching the contract in component_common):
	* - 0: This component type does not implement an update for the requested version.
	* - 1: Update was applied successfully.
	* - 2: Update was attempted but the datum was already in the target format (no change needed).
	*
	* Currently no migration versions are defined for component_geolocation, so all
	* calls fall through to the default branch and return result=0.
	*
	* $request_options recognised keys:
	* - update_version (array)  — version tuple, e.g. [7, 1, 0].
	* - data_unchanged (mixed)  — passed through for caller use.
	* - reference_id   (mixed)  — record identifier context.
	* - tipo           (string) — component tipo being migrated.
	* - section_id     (mixed)  — section record identifier.
	* - section_tipo   (string) — parent section tipo.
	*
	* @param object $request_options - Migration request parameters (see keys above).
	* @return object - {result: int, msg: string}. result=0 means no-op for this version.
	*/
	public static function update_data_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version	= null;
			$options->data_unchanged	= null;
			$options->reference_id		= null;
			$options->tipo				= null;
			$options->section_id		= null;
			$options->section_tipo		= null;
			$options->context			= 'update_component_data';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$data_unchanged	= $options->data_unchanged;
			$reference_id	= $options->reference_id;

		$update_version_string = implode('.', $update_version);
		switch ($update_version_string) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version_string). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



}//end class component_geolocation
