<?php declare(strict_types=1);
/**
* CLASS COMPONENT_GEOLOCATION
*
*
*/
class component_geolocation extends component_common {



	// data_column. DB column where to get the data.
	protected $data_column = 'geo';



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_LANG, ?string $section_tipo=null, bool $cache=true ) {


		# Force always DEDALO_DATA_NOLAN
		$this->lang = DEDALO_DATA_NOLAN;

		# Build the component
		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);

		# Dato verification, if the dato is empty, build the standard view of the map
		// $dato = $this->get_dato();

		// # if the section_id is not empty and the dato is empty create the basic and standard dato
		// $need_save=false;
		// if((!isset($dato[0]->lat) || !isset($dato[0]->lon)) && $this->parent>0) {
		// 	#####################################################################################################
		// 	# DEFAULT VALUES
		// 	# Store section dato as array(key=>value)
		// 	$dato_new = new stdClass();
		// 		$dato_new->lat		= 39.462571;
		// 		$dato_new->lon		= -0.376295;	# Calle Denia
		// 		$dato_new->zoom		= 12;
		// 		$dato_new->alt		= 16;
		// 		#$dato_new->coordinates	= array();
		// 	# END DEFAULT VALUES
		// 	######################################################################################################

		// 	# Dato
		// 	$this->set_dato([$dato_new]);
		// 	$need_save=true;
		// }

		// #
		// # CONFIGURACIÓN NECESARIA PARA PODER SALVAR
		// # Nothing to do here

		// if ($need_save===true) {
		// 	$result = $this->Save();
		// 	# debug_log(__METHOD__."  Added default component_geolocation data $section_id with: ($tipo, $lang) dato: ".to_string($dato_new), logger::DEBUG);
		// }

		// debug
			// if(SHOW_DEBUG) {
			// 	$translatable = $this->ontology_node->get_is_translatable();
			// 	if ($translatable===true) {
			// 		#throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			// 		trigger_error("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP");
			// 	}
			// }
	}//end __construct



	/**
	* GET_DATO
	* Format [{lat: 39.462571354311095, lon: -0.3763031959533692, zoom: 15, alt: 16}]
	* @return array|null $dato
	*/
	public function get_dato() {

		$dato = parent::get_dato();

		if (!is_null($dato) && !is_array($dato)) {
			$dato = [$dato];
			$this->set_dato($dato);
			debug_log(__METHOD__
				. ' Fixed and set bad format dato to array ' . PHP_EOL
				. ' saved dato: ' . to_string($dato) . PHP_EOL
				. ' section_tipo: ' . $this->get_section_tipo() . PHP_EOL
				. ' section_id: ' . $this->get_section_id() . PHP_EOL
				. ' mode: ' . $this->get_mode()
				, logger::WARNING
			);
			$this->Save();
		}


		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	* @param array|null $dato
	* 	Dato now is multiple. Because this, expected type is array
	* @return bool
	*/
	public function set_dato($dato) : bool {

		// JSON encoded dato case
			if (is_string($dato)) {
				debug_log(__METHOD__
					." Trying to decode string dato ". PHP_EOL
					.' dato: ' . to_string($dato) . PHP_EOL
					. ' section_tipo: ' . $this->get_section_tipo() . PHP_EOL
					. ' section_id: ' . $this->get_section_id() . PHP_EOL
					. ' mode: ' . $this->get_mode()
					, logger::ERROR
				);
				$dato = json_handler::decode($dato);
			}

		// convert to array if is not and not null
			if (!is_null($dato) && !is_array($dato)) {
				debug_log(__METHOD__
					.' Converted non array dato to array '. PHP_EOL
					.' dato: ' . to_string($dato) . PHP_EOL
					. ' section_tipo: ' . $this->get_section_tipo() . PHP_EOL
					. ' section_id: ' . $this->get_section_id() . PHP_EOL
					. ' mode: ' . $this->get_mode()
					, logger::ERROR
				);
				$dato = [$dato];
			}


		return parent::set_dato( $dato );
	}//end set_dato



	/**
	* GET VALOR
	* v5 compatibility
	* @return array|null $valor
	*/
	public function get_valor() {

		$valor = (array)self::get_dato();

		// separator
			$separator = ' ,  ';
			if($this->mode==='list') {
				$separator = '<br>';
			}

		if (is_object($valor)) {
			$valor = array($valor); # Convert JSON obj to array
		}

		if (is_array($valor)) {
			# return "Not string value";
			$string  	= '';
			$n 			= count($valor);
			foreach ($valor as $key => $value) {

				if(is_array($value)) $value = print_r($value,true);
				$string .= "$key : ". to_string($value) . $separator;
			}
			$string = substr($string, 0,-4);
			return $string;

		}else{

			return $valor;
		}
	}//end get_valor



	/**
	* GET_GRID_VALUE
	* Alias of component_common->get_grid_value
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $dd_grid_cell_object
	*/
		// public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// 	$dd_grid_cell_object = parent::get_grid_value($lang, $ddo);

		// 	// map values to JOSN to allow render it in list
		// 		if (!empty($dd_grid_cell_object->value)) {
		// 			$dd_grid_cell_object->value = array_map(function($el){
		// 				return json_encode($el);
		// 			}, $dd_grid_cell_object->value);
		// 		}


		// 	return $dd_grid_cell_object;
		// }//end get_grid_value



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
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$diffusion_value = null;

		$dato = $this->get_dato();
		if (empty($dato)) {
			return $diffusion_value;
		}

		$value = is_array($dato) ? reset($dato) : $dato;
		$diffusion_value = !empty($value)
			? json_encode($value)
			: null;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* BUILD_GEOLOCATION_TAG_STRING
	* Example
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
	*
	* @return string $result
	*/
	public static function build_geolocation_tag_string(string $tag_id, $lon, $lat) : string {
		/*
		$geometry = new stdClass();
			$geometry->type 		= "Point";
			$geometry->coordinates 	= array($lon, $lat)

		$feature = new stdClass();
			$feature->type 		 = "Feature";
			$feature->properties = new stdClass();
			$feature->geometry 	 = $geometry

		$data = new stdClass();
			$data->type 	= 'FeatureCollection';
			$data->features = array( $feature );
		*/
		$result = "[geo-n-".$tag_id."-data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[".$lon.",".$lat."]}}]}:data]";


		return $result;
	}//end build_geolocation_tag_string



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// Force loads dato always !IMPORTANT
		$dato = $this->get_dato();

		if (!is_null($dato) && !is_array($dato)) {
			$this->set_dato([$dato]);
			debug_log(__METHOD__
				. " Changed dato format " . PHP_EOL
				. to_string($dato)
				, logger::ERROR
			);
		}

		// Save component data
		$this->Save();


		return true;
	}//end regenerate_component



	/**
	* GET_LATITUDE
	* Get the latitude of the component, if the data has the default data, return null
	* @return float $latitude
	*/
	public function get_latitude() : ?float {

		$dato = $this->get_dato();
		if (empty($dato) || empty($dato[0]) ) {
			return null;
		}

		$dato			= $dato[0];
		$data_latitude	= $dato->lat ?? null;

		if(empty($data_latitude)){
			return null;
		}
		$latitude	= strval($data_latitude)==='39.462571'
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

		$dato = $this->get_dato();
		if (empty($dato) || empty($dato[0]) ) {
			return null;
		}

		$dato			= $dato[0];
		$data_longitude	= $dato->lon ?? null;

		if(empty($data_longitude)){
			return null;
		}
		$longitude	= strval($data_longitude)==='-0.376295'
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

		$dato = $this->get_dato();
		if (empty($dato) || empty($dato[0]) ) {
			return null;
		}

		$dato			= $dato[0];
		$socrata_data	= 'POINT ('.$dato->lat.', '.$dato->lon.')';

		# {
		#   "type": "Point",
		#   "coordinates": [
		#     -87.653274,
		#     41.936172
		#   ]
		# }

		$geo_json_point = new stdClass();
			$geo_json_point->type 		 = 'Point';
			$geo_json_point->coordinates = [
				floatval($dato->lon),
				floatval($dato->lat)
			];

		#$point = new stdClass();
		#	$point->latitude  = 47.59815;
		#	$point->longitude = -122.334540;

		$diffusion_value_socrata = $geo_json_point;// json_encode($geo_json_point, JSON_UNESCAPED_SLASHES); // json_encode($socrata_data, JSON_UNESCAPED_SLASHES);


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

		$dato = $this->get_dato(); // object as {"alt": 281, "lat": "41.56236346", "lon": "2.01215141", "zoom": 15}

		// select first
		$value = $dato[0] ?? null;

		// check empty
			if (empty($value) || !isset($value->lon) || !isset($value->lat)) {
				return null;
			}

		// default dato test
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
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version	= null;
			$options->dato_unchanged	= null;
			$options->reference_id		= null;
			$options->tipo				= null;
			$options->section_id		= null;
			$options->section_tipo		= null;
			$options->context			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;

		$update_version_string = implode('.', $update_version);
		switch ($update_version_string) {

			case '6.0.0':
				if ( (!empty($dato_unchanged) || $dato_unchanged==='') && !is_array($dato_unchanged) ) {

					//  Change the dato from object to array

					// new dato
						$dato = $dato_unchanged;

					// fix final dato with new format as array
						$new_dato = [$dato];

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version_string). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version



}//end class component_geolocation
