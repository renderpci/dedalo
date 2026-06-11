<?php declare(strict_types=1);
/**
* CLASS COMPONENT_GEOLOCATION
* Manages geographic coordinate components in Dédalo.
*
* Stores and handles latitude/longitude location data in GeoJSON-compatible format.
* Used for mapping, spatial queries, and geographic visualization of records.
*
* Data format (GeoJSON-like):
* ```
* {
*   "type": "FeatureCollection",
*   "features": [{
*     "type": "Feature",
*     "properties": {},
*     "geometry": {
*       "type": "Point",
*       "coordinates": [longitude, latitude]
*     }
*   }]
* }
* ```
*
* Key features:
* - Latitude and longitude coordinate storage
* - GeoJSON FeatureCollection format for map integration
* - Tag-based location references for text components
* - Support for multiple location points per component
*
* Data is stored in the 'geo' column of matrix tables.
* Always uses DEDALO_DATA_NOLAN (language-neutral) for storage.
*
* Extends component_common for standard component functionality.
*
* @package Dédalo
* @subpackage Core
*/
class component_geolocation extends component_common {



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_LANG, ?string $section_tipo=null, bool $cache=true ) {

		// Force always DEDALO_DATA_NOLAN
		$this->lang = DEDALO_DATA_NOLAN;

		// Build the component
		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* BUILD_GEOLOCATION_TAG_STRING
	* Sample:
	* [geo-n-1-data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.304362542927265,41.82053505145308]}}]}:data]
	* {
	*	"type": "FeatureCollection",
	*	"features": [
	*	    {
	*	      "type": "Feature",
	*	      "properties": {},
	*	      "geometry": {
	*	        "type": "Point",
	*	        "coordinates": [
	*	          2.304362542927265,
	*	          41.82053505145308
	*	        ]
	*	      }
	*	    }
	*	]
	* }
	* @return string $result
	*/
	public static function build_geolocation_tag_string(string $tag_id, string|float $lon, string|float $lat) : string {

		$result = "[geo-n-".$tag_id."-data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[".$lon.",".$lat."]}}]}:data]";


		return $result;
	}//end build_geolocation_tag_string



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load data to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// Force loads data always !IMPORTANT
		$data = $this->get_data();

		// Save component data
		$this->save();


		return true;
	}//end regenerate_component



	/**
	* GET_LATITUDE
	* Get the latitude of the component, if the data has the default data, return null
	* @return float $latitude
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
		$latitude = strval($data_latitude)==='39.462571'
			? null
			: floatval($data_latitude);


		return $latitude;
	}//end get_latitude



	/**
	* GET_LONGITUDE
	* Get the longitude of the component, if the data has the default data, return null
	* @return float $longitude
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
		$longitude = strval($data_longitude)==='-0.376295'
			? null
			: floatval($data_longitude);


		return $longitude;
	}//end get_longitude



	/**
	* GET_DIFFUSION_VALUE_SOCRATA
	* Calculate current component diffusion value for target field in socrata
	* Used by diffusion to unify components diffusion value call to publish in socrata
	* @return object $diffusion_value_socrata
	*
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
	* Sample
		* [
		*    {
		*      "layer_id": 1,
		*      "text": "...",
		*      "layer_data": {
		*        "type": "FeatureCollection",
		*        "features": [
		*          {
		*            "type": "Feature",
		*            "properties": {},
		*            "geometry": {
		*              "type": "Point",
		*              "coordinates": [
		*                2.011618, // longitude
		*                41.562546 // latitude
		*              ]
		*            }
		*          }
		*        ]
		*      }
		*    }
		* ]
	* @see ontology publication use in mdcat4091
	* @return string $value
	* 	Encoded GEOJSON data
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
			$lon = !empty($value->lon)
				? number_format( (float)$value->lon, 16, '.', '')
				: 0; // string as "2.012151410452" (use dot notation to preserve JSON integrity)
			$lat = !empty($value->lat)
				? number_format( (float)$value->lat, 16, '.', '')
				: 0; // string as "41.562363467527" (use dot notation to preserve JSON integrity)

		// GEOJSON
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
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return false;
	}//end get_sortable



	/**
	* CONFORM_IMPORT_DATA
	* Accepted import formats:
	* 1. Full v7 dato (JSON array of items):
	* 	[{"lat":39.4625,"lon":-0.3762,"zoom":16,"alt":0,"lib_data":[{"layer_id":1,"layer_data":{FeatureCollection}}]}]
	* 2. A single bare item (JSON object):
	* 	{"lat":39.4625,"lon":-0.3762}
	* 3. A bare GeoJSON FeatureCollection (JSON object). The map center is taken
	*    from the first 'Point' feature and the collection is stored as lib_data layer 1.
	*    Note that GeoJSON coordinates are [lon, lat]
	* 4. A flat string as 'lat, lon[, zoom[, alt]]' with dot decimals:
	* 	39.4625, -0.3762, 16
	*    Note that, unlike GeoJSON, the flat string order is latitude first (human convention)
	* Empty value returns null (clears the existing component data)
	* @param string $import_value
	* @param string $column_name
	* @return object $response
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
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the data don't need change"
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
