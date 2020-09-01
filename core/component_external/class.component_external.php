<?php
/*
* CLASS COMPONENT_EXTERNAL
* Manage specific component logic
* Common components properties and method are inherited of component_common class that are inherited from common class
*/
class component_external extends component_common {



	/**
	* LOAD_DATA_FROM_REMOTE
	* @return array $row_data
	*/
	public function load_data_from_remote() {

		$section_id		= $this->get_parent();
		$section_tipo	= $this->section_tipo;
		$lang			= DEDALO_DATA_LANG;

		// cache
			static $data_from_remote_cache = [];
			$uid = $section_tipo . '_'. $section_id .'_'. $lang;
			if (isset($data_from_remote_cache[$uid])) {
				#debug_log(__METHOD__." Loaded from cache: $uid ".to_string(), logger::DEBUG);
				return $data_from_remote_cache[$uid];
			}


		$RecordObj_dd		= new RecordObj_dd($section_tipo);
		$section_properties	= $RecordObj_dd->get_properties();

		// format reference
			# {
			#   "external_data": {
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
			if (!isset($section_properties->external_data)) {
				debug_log(__METHOD__." ERROR. Empty properties section external_data".to_string(), logger::ERROR);
				return null;
			}
		
		// properties external_data vars
			$external_data  = $section_properties->external_data;
			$api_url 		= $external_data->api_url;
			$response_map 	= $external_data->response_map;
			$entity 		= $external_data->entity;		
		
			// fields
				$ar_fields = [];
				# get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements=false)
				$ar_component_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component'], true, true, true, false, false);
				foreach ($ar_component_tipo as $component_tipo) {
					$RecordObj_dd 		 	= new RecordObj_dd($component_tipo);
					$component_properties 	= $RecordObj_dd->get_properties();
					if (empty($component_properties)) {
						continue;
					}

					$field_name = array_reduce($component_properties->fields_map, function($carry, $item){
						return ($item->local==='dato') ? $item->remote : $carry;
					});
					if (!empty($field_name)) {
						$ar_fields[] = $field_name;
					}					
				}

			// call entity class to build custom api url
				include_once( dirname(__FILE__) . '/entities/class.'.$entity.'.php' );		

				$options = new stdClass();
					$options->api_url 		= $api_url;
					$options->ar_fields 	= $ar_fields;
					$options->section_id 	= $section_id;
					$options->lang 			= $lang;

				$url = $entity::build_row_request_url($options);
				
				$response = file_get_contents_curl($url);

		// check response
			if (empty($response)) {
				debug_log(__METHOD__." ERROR. Empty response from external_data".to_string(), logger::ERROR);
				return null;
			}

		// decode json response
			if (!$response_obj=json_decode($response)) {
				debug_log(__METHOD__." ERROR. Empty parse json response from external_data".to_string($response), logger::ERROR);
				return null;	
			}

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
	*/
	public function get_dato() {

		//$dato = parent::get_dato();

		// load data from remote
			$row_data = $this->load_data_from_remote();

		// properties
			$properties = $this->get_properties();

		// dato
			$dato = array_reduce($properties->fields_map, function($carry, $item) use($row_data){
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
						debug_log(__METHOD__." Error. Not found key: $name in row_data".to_string(), logger::ERROR);
					}					 
				}
				return $carry;				
			});

		#dump($dato, ' dato ++ '.to_string($this->tipo)); 
		return $dato;
	}//end get_dato



	/**
	*  SET_DATO
	* @param array $dato
	* 	Dato now is multiple. For this expected type is array
	*	but in some cases can be an array json encoded or some rare times a plain string
	*/
	public function set_dato($dato) {
		
		if (is_string($dato)) { # Tool Time machine case, dato is string
			if (strpos($dato, '[')!==false) {
				# dato is json encoded 
				$dato = json_handler::decode($dato);
			}else{
				# dato is string plain value
				$dato = array($dato);
			}
		}

		if(SHOW_DEBUG===true) {
			if (!is_array($dato)) {
				debug_log(__METHOD__." Warning. [$this->tipo,$this->parent]. Received dato is NOT array. Type is '".gettype($dato)."' and dato: '".to_string($dato)."' will be converted to array", logger::DEBUG);
			}
		}

		$safe_dato=array();
		foreach ((array)$dato as $key => $value) {
			if (!is_string($value)) {
				$safe_dato[] = to_string($value);
			}else{
				$safe_dato[] = $value;
			}
		}
		$dato = $safe_dato;
		
		parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET_VALOR
	* Return array dato as comma separated elements string by default
	* If index var is received, return dato element corresponding to this index if exists
	* @return string $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {
		
		$dato  = $this->get_dato();
		$valor = $dato;

		return (string)$valor;
	}//end get_valor



	/**
	* LOAD TOOLS
	*/
	public function load_tools( $check_lang_tools=true ) {

		return false;
	}//end load_tools 
	


}//end class component_external
?>