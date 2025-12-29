<?php declare(strict_types=1);
/**
* CLASS COMPONENT_GEOLOCATION
* Manages 
* data_column_name : 'geo'
*/
class component_geolocation extends component_common {



	// Property to enable or disable the get and set data in different languages
	protected $supports_translation = false;



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
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @see class.diffusion_mysql.php
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*/
	// public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

	// 	$diffusion_value = null;

	// 	$dato = $this->get_dato();
	// 	if (empty($dato)) {
	// 		return $diffusion_value;
	// 	}

	// 	$value = is_array($dato) ? reset($dato) : $dato;
	// 	$diffusion_value = !empty($value)
	// 		? json_encode($value)
	// 		: null;


	// 	return $diffusion_value;
	// }//end get_diffusion_value



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
	public static function build_geolocation_tag_string(string $tag_id, $lon, $lat) : string {
		
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
	* Used for diffusion_mysql to unify components diffusion value call to publish in socrata
	* @return object $diffusion_value_socrata
	*
	* @see class.diffusion_mysql.php
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
	* @see diffusion_sql::build_geolocation_data_geojson
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
