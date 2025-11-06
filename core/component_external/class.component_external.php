<?php declare(strict_types=1);
/**
* CLASS COMPONENT_EXTERNAL
* Manage specific component logic
* Common components properties and method are inherited of component_common class that are inherited from common class
* Mainly used in external APIs that manage data such as ZENON
*/
class component_external extends component_common {



	// data_column. DB column where to get the data.
	protected $data_column = 'misc';


	// Property to enable or disable the get and set data in different languages
	protected $supports_translation = false;

	/**
	* LOAD_DATA_FROM_REMOTE
	* @return object|null $row_data
	*/
	public function load_data_from_remote() : ?object {

		// short vars
			$section_id		= $this->get_section_id();
			$section_tipo	= $this->section_tipo;
			$lang			= DEDALO_DATA_LANG;

		// cache
			static $data_from_remote_cache = [];
			$uid = $section_tipo . '_'. $section_id .'_'. $lang;
			if (array_key_exists($uid, $data_from_remote_cache)) {
				return $data_from_remote_cache[$uid];
			}

		// zenon_is_available.
		// If Zenon is not available, is saved in session to prevent to try to load again and again.
		// On user quits, the status is reset and Dédalo try to connect again.
			$zenon_is_available = $_SESSION['dedalo']['config']['zenon_is_available'] ?? null;
			if ($zenon_is_available===false) {
				debug_log(__METHOD__
					." ERROR. Unable to load data from_remote. Remote host (zenon) is unavailable 1. NULL is returned as data. Quit session to try again."
					, logger::ERROR
				);
				return null;
			}

		// section_properties
			$ontology_node		= ontology_node::get_instance($section_tipo);
			$section_properties	= $ontology_node->get_properties();

		// format reference
			# {
			#   "api_config": {
			#     "entity": "zenon",
			#     "api_url": "https://zenon.dainst.org/api/v1/record",
			#     "response_map": [
			#       {
			#         "local": "ar_records",
			#         "remote": "records"
			#       },
			#       {
			#         "local": "msg",
			#         "remote": "status"
			#       }
			#     ]
			#   }
			# }

		// check properties config
			if (!isset($section_properties->api_config)) {
				debug_log(__METHOD__
					." ERROR. Unable to load data from_remote. Empty section properties api_config (1)" .PHP_EOL
					.' tipo: '. $this->tipo .PHP_EOL
					.' section_tipo: '. $section_tipo .PHP_EOL
					.' section_id: '. $section_id .PHP_EOL
					.' section_properties type: ' . gettype($section_properties) .PHP_EOL
					.' section_properties: ' . to_string($section_properties) .PHP_EOL
					// .' bt: ' . to_string( debug_backtrace() )
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					dump(debug_backtrace(), ' debug_backtrace() ++ '.to_string());
				}
				return null;
			}

		// properties api_config vars
			$api_config		= $section_properties->api_config;
			$api_url		= $api_config->api_url;
			$response_map	= $api_config->response_map;
			$entity			= $api_config->entity;

			// ar_fields
				$ar_fields = [];
				$children_tipo = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo,
					['component'],
					true,
					true,
					true,
					false,
					false
				);
				foreach ($children_tipo as $component_tipo) {

					$ontology_node			= ontology_node::get_instance($component_tipo);
					$component_properties	= $ontology_node->get_properties();

					// check component_properties
					if(empty($component_properties) || !isset($component_properties->fields_map)){
						continue;
					}

					$field_name = array_find((array)$component_properties->fields_map, function($el){
						return $el->local==='dato';
					});
					if (is_object($field_name)) {
						$ar_fields[] = $field_name->remote;
					}
				}

			// call entity class to build custom api url
				include_once( dirname(__FILE__) . '/entities/class.'.$entity.'.php' );

				// url build
					$url = $entity::build_row_request_url((object)[
						'api_url'		=> $api_url,
						'ar_fields'		=> $ar_fields,
						'section_id'	=> $section_id,
						'lang'			=> $lang
					]);

				// request
					$request_response = curl_request((object)[
						'url'		=> $url, // string
						'header'	=> false, // bool
						'timeout'	=> 4 // int in secs
					]);
					$response_obj = !empty($request_response->result)
						? json_decode($request_response->result)
						: null;

		// check response
			if (empty($response_obj)) {
				debug_log(__METHOD__
					." ERROR. Unable to load data from_remote. Empty response from api_config:" .PHP_EOL
					.' request_response: ' . to_string($request_response)
					, logger::ERROR
				);
				// Fix Zenon as not available to prevent to try access again and again.
				$_SESSION['dedalo']['config']['zenon_is_available'] = false;

				return null;
			}

		// decode JSON response
			// if (!$response_obj=json_decode($response)) {
			// 	debug_log(__METHOD__." ERROR. Empty parse JSON response from api_config:" .PHP_EOL. to_string($request_response), logger::ERROR);
			// 	return null;
			// }

		// row_data
			$row_data = array_reduce($response_map, function($carry, $item) use($response_obj){
				if ($item->local==='ar_records') {
					$name = $item->remote;
					return isset($response_obj->{$name}) ? reset($response_obj->{$name}) : null;
				}
				return $carry;
			});

		// cache
			$data_from_remote_cache[$uid] = $row_data;


		return $row_data;
	}//end load_data_from_remote



	/**
	* GET DATO
	* @return mixed
	* 	Usually is a string like: ..
	*/
	public function get_dato() {

		// load data from remote returns a object as
			// {
			//     "id": "001327065",
			//     "title": "Arse : Boletín del Centro Arqueológico Saguntino (Sagunto).",
			//     "authors": {
			//         "primary": [],
			//         "secondary": [],
			//         "corporate": []
			//     },
			//     "publicationDates": [
			//         "2011"
			//     ],
			//     "recordPage": "/Record/001327065",
			//     "physicalDescriptions": [
			//         "213 p."
			//     ]
			// }
			$row_data = $this->load_data_from_remote();

		// properties
			$properties = $this->get_properties();

		// dato
			$value = array_reduce($properties->fields_map, function($carry, $item) use($row_data){
				if (empty($row_data)) {
					return $carry;
				}
				if($item->local==='dato') {
					$name = $item->remote;
					if (isset($row_data->{$name})) {

						if (isset($item->format)) {
							switch ($item->format) {
								case 'array_values':
									$value = implode(' | ', $row_data->{$name});
									break;
								case 'zenon_authors':
									$ar_names = [];
									foreach ($row_data->{$name} as $key => $element) {
										if (empty($element)) continue;
										$ar_names[] = $key  .': '. implode(' - ', array_keys((array)$element));
									}
									$value = implode(' | ', $ar_names);
									break;
								default:
									$value = to_string($row_data->{$name});
									break;
							}
						}else{
							$value = $row_data->{$name};
						}
						return $value;
					}else{
						debug_log(__METHOD__
							." Error. Not found key: '$name' in row_data" . PHP_EOL
							.' name: ' .$name . PHP_EOL
							.' row_data type: ' .gettype($row_data) . PHP_EOL
							.' row_data: ' . to_string($row_data)
							, logger::ERROR
						);
					}
				}
				return $carry;
			});

		$dato = is_array($value)
			? $value
			: [$value];


		return $dato;
	}//end get_dato



	/**
	*  SET_DATO
	* @param mixed $dato
	* 	Dato now is multiple. For this expected type is array
	*	but in some cases can be an array JSON encoded or some rare times a plain string
	* @return bool
	*/
	public function set_dato($dato) : bool {

		// string case
			if (is_string($dato)) { # Tool Time machine case, dato is string
				if (strpos($dato, '[')!==false) {
					# dato is JSON encoded
					$dato = json_handler::decode($dato);
				}else{
					# dato is string plain value
					$dato = array($dato);
				}
			}

		// array check
			if(SHOW_DEBUG===true) {
				if (!is_array($dato)) {
					debug_log(__METHOD__
						." Warning. [$this->tipo,$this->parent]. Received dato is NOT array. Type is '".gettype($dato)."' and dato: '".to_string($dato)."' will be converted to array"
						, logger::DEBUG
					);
				}
			}

		// safe_dato
			$safe_dato = [];
			foreach ((array)$dato as $value) {
				if (!is_string($value)) {
					$safe_dato[] = to_string($value);
				}else{
					$safe_dato[] = $value;
				}
			}
			$dato = $safe_dato;


		return parent::set_dato( $dato );
	}//end set_dato



	/**
	* GET_VALOR
	* Return array dato as comma separated elements string by default
	* If index var is received, return dato element corresponding to this index if exists
	* @return string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG) {

		$dato  = $this->get_dato();
		$valor = is_array($dato)
			? reset($dato)
			: '';

		return (string)$valor;
	}//end get_valor



}//end class component_external
