<?php
/*
* CLASS CALCULATION
*
*
*/
class calculation extends widget_common {



	/**
	* GET_DATO
	* @param array ipo
	* can be configured with need of the widget
	* for standard calculations data_souce need to be configured with two params:
	* 	@param object $input
	* 	indicate the way to get the data from sections and components
	* 	data will be calculated before apply the logic
	* 	the result of the obtain the data return components with var_name defined
	* 	that will be used to convert to php variables
	* 	@param object $process
	* 	indicate the where can find the method to be used for calculate the data
	* 	file indicate the file with the functions
	* 	fn indicate the function name inside the file
	* 	options are params that will be send to the function with the result data
	* 	example of structure config for calculation widget with the logic parameters
	* 	@param array $output
	* 	the output format to be parse to html, every object will be a span node
	* 	with label_before, data, label_after
	*  "widgets": [
	*    {
	*      "widget_name": "calculation",
	*      "widget_info": "sum calc.",
	*      "path": "/calculation",
	*      "ipo": [
	*        {
	*          "input": {
	*            "section_tipo": "current",
	*            "section_id": "current",
	*            "filter": false,
	*            "value": "sum",
	*            "components": [
	*              {
	*                "tipo": "test139",
	*                "var_name": "number"
	*              },
	*              {
	*                "tipo": "test140",
	*                "var_name": "fields_separator"
	*              }
	*            ]
	*          },
	*          "process": {
	*            "file": "/mdcat/calculation/mdcat.php",
	*            "fn": "to_euros",
	*            "options": {
	*              "label": true,
	*              "years": true,
	*              "months": true,
	*              "days": true,
	*              "separator": ", ",
	*              "total": false
	*            }
	*          },
	*		"output": [
	*      		{
	*           "id": "total",
	*            "value": "float",
	*            "label_after": "euros"
	*           }
	*         ]
	*	  ]
	*  }
	* @return
	*/
	public function get_dato() : array {

		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo;

		$dato = [];
		foreach ($ipo as $key => $ipo) {

			// input
			$data_input = $this->resolve_data($ipo->input);

			// process
			if(isset($ipo->process) ){
				$process = $ipo->process;
				$result = $this->resolve_logic($process, $data_input);
			}

			// output
			foreach ($ipo->output as $data_map) {
				$current_id = $data_map->id;
				$found = array_find($result ?? [], function($item) use($current_id){
					return $item->id===$current_id;
				});
				if (is_object($found)) {

					$value = $found->value;

					$current_data = new stdClass();
						$current_data->widget	= get_class($this);
						$current_data->key		= $key;
						$current_data->id		= $current_id;
						$current_data->value	= $value;

					$dato[] = $current_data;
				}
			}
		}

		return $dato;
	}//end get_dato



	/**
	* RESOLVE_DATA_FOR_FORMULA
	* @param object $data
	*	properties formula->data
	* @return object $data_resolved
	*/
	public function resolve_data(object $data) : ?object {

		if(empty($data)) {
			return null;
		}

		$data_resolved = new StdClass();

		// set the section tipo
			switch ($data->section_tipo) {
				case 'current':
					$section_tipo = $this->section_tipo;
					break;
				default:
					$section_tipo = $data->section_tipo ;
			}

		// set the section id
			switch ($data->section_id) {
				case 'current':
					$section_id = $this->section_id;

					foreach ($data->components as $current_component) {
						$component_tipo	= $current_component->tipo;
						$var_name		= $current_component->var_name;
						$options		= isset($current_component->options) ? $current_component->options : null;
						$model_name		= ontology_node::get_model_name_by_tipo($component_tipo,true);
						$lang			= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

						$current_component = component_common::get_instance(
							$model_name,
							$component_tipo,
							$section_id,
							'edit',
							$lang,
							$section_tipo
						);

						$data_resolved->{$var_name} = $current_component->get_calculation_data($options);
					}// end foreach ($data->component_tipo as $component_tipo)
					break;

				case 'all':

					foreach ($data->components as $current_component) {
						$component_tipo	= $current_component->tipo;
						$var_name		= $current_component->var_name;
						$options		=  isset($current_component->options) ? $current_component->options : null;
						$model_name		= ontology_node::get_model_name_by_tipo($component_tipo,true);
						$lang			= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

						$search_options = new StdClass;
							$search_options->section_tipo	= $section_tipo;
							$search_options->component_tipo	= $component_tipo;

						$data_resolved->{$var_name} = $this->get_sum_from_component_tipo($search_options);
					}
					break;

				case 'search_session':

					foreach ($data->components as $current_component) {
							$component_tipo	= $current_component->tipo;
							$var_name		= $current_component->var_name;
							$options		=  isset($current_component->options) ? $current_component->options : null;
							$model_name		= ontology_node::get_model_name_by_tipo( $component_tipo,true );
							$lang			= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

							$search_options = new StdClass;
								$search_options->section_tipo	= $section_tipo;
								$search_options->component_tipo	= $component_tipo;

							if($data->value ==='value'){
								$data_resolved->{$var_name} = $this->get_values_from_component_tipo($search_options, $data);
									#dump($data_resolved, ' data_resolved'.to_string());
							}else if($data->value ==='sum'){
								$data_resolved->{$var_name} = $this->get_sum_from_component_tipo($search_options);
							}
						}
					break;

				default:
					$section_id = $data->section_id;
					break;
			}

		// filter true
			if (isset($data->filter) && $data->filter===true) {

				$section_id = $this->section_id;
				foreach ($data->components as $current_component) {

					$component_tipo	= $current_component->tipo;
					$var_name		= $current_component->var_name;
					$options		= isset($current_component->options) ? $current_component->options : null;

					// Component (component_json) where is stored source data, a json search_query_object
						$model_name			= ontology_node::get_model_name_by_tipo( $component_tipo,true );
						$lang				= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
						$current_component	= component_common::get_instance(
							$model_name,
							$component_tipo,
							$this->section_id,
							'edit',
							$lang,
							$this->section_tipo
						);
						$dato	= $current_component->get_dato();
						$dato	= is_array($dato) ? $dato : [$dato]; // Array always

						if (empty($dato) || !isset($dato[0]->data)) {
							continue; // Skip empty
						}

						// exec_dato_filter_data
							$result = [];
							foreach ((array)$dato as $dato_item) {
								$result[] = self::exec_dato_filter_data($dato_item);
							}

					// Set result
						$data_resolved->{$var_name} = $result;

				}//end foreach ($data->component_tipo as $component_tipo)
			}//end if (isset($data->filter) && $data->filter===true)

		// true. set the value of true variable
			switch (true) {
				case isset($data->true) && isset($data->true->ar_locators):
					// $ar_locators = json_decode( str_replace("'", '"', $data->true->ar_locators) );
					//
					// $options = new stdClass();
					// 	$options->lang 				= DEDALO_DATA_LANG;
					// 	$options->data_to_be_used 	= 'valor';
					// 	$options->ar_locators 		= $ar_locators;
					// 	$options->records_separator 	= isset($data->true->records_separator) ? $data->true->records_separator : false;
					// 	$options->fields_separator 	= isset($data->true->fields_separator) ? $data->true->fields_separator : false;
					//
					// 	$valor_from_ar_locators 	= $this->get_valor_from_ar_locators($options);
					// 		#dump($valor_from_ar_locators, ' valor_from_ar_locators');$valor_from_ar_locators->result
					// 	$data_resolved->true = $valor_from_ar_locators->result;
					break;
				case isset($data->true):
					$data_resolved->true = $data->true;
					break;
			}

		// false. set the value of false variable
			switch (true) {
				case isset($data->false) && isset($data->false->ar_locators):
					// $ar_locators = json_decode( str_replace("'", '"', $data->false->ar_locators) );
					//
					// $options = new stdClass();
					// 	$options->lang 				= DEDALO_DATA_LANG;
					// 	$options->data_to_be_used 	= 'valor';
					// 	$options->ar_locators 		= $ar_locators;
					// 	$options->records_separator 	= isset($data->false->records_separator) ? $data->false->records_separator : false;
					// 	$options->fields_separator 	= isset($data->false->fields_separator) ? $data->false->fields_separator : false;
					//
					// $valor_from_ar_locators 	= $this->get_valor_from_ar_locators($options);
					// 		#dump($valor_from_ar_locators, ' valor_from_ar_locators');$valor_from_ar_locators->result
					// $data_resolved->false = $valor_from_ar_locators->result;
					break;
				case isset($data->false):
					$data_resolved->false = $data->true;
					break;
			}

		// set the filter
		// NEED TO BE DEFINED


		return $data_resolved;
	}//end resolve_data



	/**
	* EXEC_DATO_FILTER_DATA
	* @return object $result
	*/
	public static function exec_dato_filter_data(object $dato_item) : object {

		$ar_search_query_object = !is_array($dato_item->data) ? [$dato_item->data] : $dato_item->data; // Always array

		// Exec search with search_query_object
			$ar_result = [];
			foreach ($ar_search_query_object as $search_query_object) {

				// Search
					$search 		= search::get_instance($search_query_object);
					$search_data 	= $search->search();
					$ar_records 	= $search_data->ar_records;

				// Result map. If result_map exists, parse result rows
					$result_map = isset($search_query_object->result_map) ? $search_query_object->result_map : false;
					if (!empty($result_map)) {

						$ar_rows_mapped = [];
						foreach ($ar_records as $key => $row) {

							$new_row = new stdClass();
							foreach ($result_map as $map_item) {

								if (isset($row->{$map_item->column})) {

									// Process value
										$value = $row->{$map_item->column};
										if (isset($map_item->process)) {
											//$value = $map_item->process($value);
											#$value = call_user_func_array($map_item->process, $value);
											$value = call_user_func_array($map_item->process, array($value));
										}

									// Set mapped property
										$new_row->{$map_item->key} = (array)$value;
								}
							}
							$ar_rows_mapped[] = $new_row;
						}

						// Overwrite data property
						$ar_records = $ar_rows_mapped;
						#dump($ar_rows_mapped, ' ar_rows_mapped ++ '.to_string());
					}

				// Add and merge parsed rows
				$ar_result = array_merge($ar_result, $ar_records);
			}//end foreach ($ar_search_query_object as $search_query_object


		// Add dato object properties
			$result = new StdClass();
			foreach ($dato_item as $key => $value) {
				if ($key==='result_map') continue; # Skip some reserved properties
				// Add property
				if ($key==='data') {
					$result->data = $ar_result; # calculated
				}else{
					$result->{$key} = $value; # literal
				}
			}

		return $result;
	}//end exec_dato_filter_data



	/**
	* GET_SUM_FROM_COMPONENT_TIPO
	* @param object $search_options
	* @return int|float $total
	*/
	public function get_sum_from_component_tipo(object $search_options) : int|float {

		$current_section_tipo	= $search_options->section_tipo;
		$current_tipo			= $search_options->component_tipo;
		$model_name				= ontology_node::get_model_name_by_tipo($current_tipo,true);
		$lang					= ontology_node::get_translatable( $current_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		# section_id filter
		$section_id_filter = '';
		if (isset($search_options->section_id)) {

			$section_id_filter = '
			{
				"q": "'.$search_options->section_id.'",
                "path": [
                    {
                        "model": "component_section_id"
                    }
                ],
                "component_path": [
                    "section_id"
                ]
			}
			';
		}

		$search_query_object = json_decode('{
		    "id": "sum_from_component_tipo",
		    "mode": "list",
		    "section_tipo": ["'.$current_section_tipo.'"],
		    "limit": 0,
		    "parsed" : false,
		    "filter": {
		        "$and": [
		            {
		                "q": "*",
		                "q_operator": null,
		                "path": [
		                    {
		                        "section_tipo": "'.$current_section_tipo.'",
		                        "component_tipo": "'.$current_tipo.'",
		                        "model": "'.$model_name.'",
		                        "name": "Sum",
		                        "lang": "'.$lang.'"
		                    }
		                ]
		            }'.$section_id_filter.'
		        ]
		    },
		    "select": [
		        {
		            "path": [
		                {
		                    "section_tipo": "'.$current_section_tipo.'",
		                    "component_tipo": "'.$current_tipo.'",
		                    "model": "'.$model_name.'",
		                    "name": "Sum",
		                    "selector": "dato",
		                    "lang": "'.$lang.'"
		                }
		            ]
		        }
		    ]
		}');
		#dump($search_query_object, ' $search_query_object ++ '.to_string()); exit();
		#dump(null, ' search_query_object ++ '.json_encode($search_query_object, JSON_PRETTY_PRINT)); #exit(); // , JSON_UNESCAPED_UNICODE | JSON_HEX_APOS


		# Search records
		$search 		= search::get_instance($search_query_object);
		$search_result 	= $search->search();
		$ar_records 	= $search_result->ar_records;

		$ar_values = [];
		foreach ($ar_records as $key => $row) {
			$value = $row->{$current_tipo};
			$ar_values[] = (int)$value;
		}

		$total = array_sum($ar_values);

		return $total;
	}//end get_sum_from_component_tipo



	/**
	* GET_VALUES_FROM_COMPONENT_TIPO
	* @return array $ar_values
	*/
	public function get_values_from_component_tipo(object $search_options, object $data) : array {

		$current_section_tipo	= $search_options->section_tipo;
		$current_tipo			= $search_options->component_tipo;
		$lang					= ontology_node::get_translatable($current_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		if(!isset($_SESSION['dedalo']['config']['search_options'][$current_section_tipo])) {

			#$q_op 	 = '$and';
			#$filter_obj = new stdClass();
				#$filter_obj->{$q_op} = [];

			$search_query_object = new stdClass();
				$search_query_object->id  	   		= 'new_temp';
				$search_query_object->section_tipo 	= $current_section_tipo;
				$search_query_object->filter  		= [];
				$search_query_object->select  		= [];

		}else{

			$search_query_object = clone $_SESSION['dedalo']['config']['search_options'][$current_section_tipo]->search_query_object;
		}

		# Select
		$select = [];
		$path   = search::get_query_path($current_tipo, $current_section_tipo, false);
		$element = new stdClass();
			$element->path = $path;
			$element->component_path = ["components",$current_tipo,"dato",$lang];

		$select[] = $element;

		$search_query_object->select 	 = $select;
		$search_query_object->limit  	 = 0;
		$search_query_object->offset 	 = 0;
		$search_query_object->parsed 	 = false;
		$search_query_object->full_count = false;


		# Filter element optional
		if(isset($data->component_filter_dato)) {

			$q_op 	 = '$and';
			$q_op_or = '$or';

			if (!empty($search_query_object->filter)) {

				$current_filter = json_decode(json_encode($search_query_object->filter));

				$filter_obj = new stdClass();
					$filter_obj->{$q_op} = [$current_filter];

				$search_query_object->filter = $filter_obj;
			}

			$component_filter_dato = $data->component_filter_dato;
			foreach ($component_filter_dato as $search) {
				foreach ($search as $current_component_tipo => $q) {

					$path    = search::get_query_path($current_component_tipo, $current_section_tipo, false);
					$element = new stdClass();
						$element->path = $path;
						$element->q    = $q;

					if (isset($search_query_object->filter->{$q_op})) {
						$search_query_object->filter->{$q_op}[] = $element;
					}else{

						$filter_element = new stdClass();
							$filter_element->{$q_op}[] = $element;

						$current_filter = json_decode(json_encode($search_query_object->filter));
						if (isset($current_filter->{$q_op_or}) && !empty($current_filter->{$q_op_or})) {
							$filter_element->{$q_op}[] = $current_filter;
						}

						$search_query_object->filter = $filter_element;
					}
				}
			}
		}
		#dump($search_query_object, ' search_query_object ++ '.to_string()); #exit();
		#dump(null, ' search_query_object ++ '.json_encode($search_query_object, JSON_PRETTY_PRINT)); exit();

		# Search records
		$search 		= search::get_instance($search_query_object);
		$search_result 	= $search->search();
		$ar_records 	= $search_result->ar_records;


		$ar_values = [];
		foreach ($ar_records as $key => $row) {

			$component_dato = $row->{$current_tipo};

			$ar_values[] = $component_dato;
		}


		return $ar_values;
	}//end get_values_from_component_tipo



	/**
	* RESOLVE_LOGIC
	* @param object $process
	* the paths to the file and method that will be used for process the calculation
	* @param object $data
	* the pre-calculated data, with the name of the variable and the value
	* {"number":5}
	* @return
	*/
	private function resolve_logic(object $process, $data) {

		// path to the file with the functions, defined in structure
		$file 	= DEDALO_WIDGETS_PATH . $process->file;
		// function name, defined in structure
		$fn		= $process->fn;
		// merge the process->options defined in structure and the pre-processed data
		// in a unique object, for simplify the call
		$arg 	= (object)[
			'caller_section_tipo'	=> $this->section_tipo,
			'data'					=> $data,
			'options'				=> $process->options ?? new stdClass()
		];

		switch ($process->engine) {
			case 'php':
			default:

				// require load the file with the functions in the path
					include_once($file);
				// execute the function in the $file (as summarize in formulas.php)
					if(!function_exists($fn)){
						return null;
					}
					$result = $fn($arg);

				break;
		}//end switch ($process->engine)


		return $result;
	}//end resolve_logic



}//end class calculation
