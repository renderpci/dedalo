<?php
/*
* CLASS TOOL_EXPORT

	Export selected records in different formats using section_list as base fields reference

*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');



class tool_export extends tool_common {



	public $section_tipo;
	public $section_obj;	# received section
	public $ar_records;		# Array of records to export (section_id) or null
	public $data_format;  	# string 'standard', 'dedalo'

	public static $quotes 	 		  = '"';
	public static $delimiter 		  = ';';
	public static $internal_separator = PHP_EOL;

	public $section_list_custom;



	/**
	* __CONSTRUCT
	*/
	public function __construct( $section_tipo, $modo, $data_format='standard' ) {

		# Verify type section object
		#if ( get_class($section_obj) !== 'section' ) {
		#	throw new Exception("Error Processing Request. Only sections are accepted in this tool", 1);
		#}

		# NOTA: POR UNIFICAR EL CONSTRUCTOR DE LOS TOOLS QUE USAN SECTION !!!!

		if (is_object($section_tipo)) {
			$section_tipo = $section_tipo->get_tipo();
		}

		$this->section_tipo = $section_tipo;

		# Fix current component/section
		#$this->section_obj = $section_obj;

		# Fix modo
		$this->modo = $modo;

		# Fix data_format
		$this->data_format = $data_format;

		# Fix records
		$this->ar_records = null;

		return true;
	}//end __construct



	/**
	* SET_UP
	*/
	static function set_up() {

		$var_requested = common::get_request_var('button_tipo');
		if (!empty($var_requested)) {
			$button_obj  = new button_import($var_requested, null, $this->section_tipo);
			$propiedades = json_handler::decode($button_obj->RecordObj_dd->get_propiedades());

			// in process..
		}

		return true;
	}//end set_up



	/**
	* GET_RECORDS
	* @return array|null
	*/
	public function get_records( $layout_map ) {

		if (!empty($this->ar_records)) {
			return $this->ar_records;
		}

		#
		# SEARCH_OPTIONS
		$section_tipo 		  = $this->section_tipo;
		$search_options_id 	  = $section_tipo; // section tipo like oh1
		$saved_search_options = section_records::get_search_options( $search_options_id );

		if ($saved_search_options===false) {
			trigger_error("Sorry, search_options [$search_options_id] not exits in section_records::get_search_options");
			return null;
		}

		# SEARCH_QUERY_OBJECT . Add search_query_object to options
		$search_query_object = $saved_search_options->search_query_object;


		# SELECT. layout map is used to set columns select in search_query_object
		$ar_component_tipo = reset($layout_map);
		$search_query_object->select = []; // reset
		foreach ($ar_component_tipo as $key => $component_tipo) {

			$path = search_development2::get_query_path($component_tipo, $section_tipo, false);

			$path_element = new stdClass();
				$path_element->path = $path;
					#dump($path_element, ' path_element ++ '.to_string());

			# Parse current path with component and add
			$search_query_object->select[] = search_development2::component_parser_select($path_element);
		}

		# Reset search limit and offset
		$search_query_object->limit  = 0;
		$search_query_object->offset = 0;

		# SEARCH
		$search_develoment2  = new search_development2($search_query_object);
		$rows_data 		 	 = $search_develoment2->search();


		$this->ar_records = $rows_data->ar_records;


		return $this->ar_records;
	}//end get_records



	/**
	* EXPORT_TO
	* @return string $export_str_data
	*/
	public function export_to($format, $ar_records=null, $encoding='UTF-8', $section_tipo) {

		$quotes 			= tool_export::$quotes;
		$delimiter			= tool_export::$delimiter;
		$internal_separator = ($this->data_format==='html') ? trim('<br>') : tool_export::$internal_separator;

		if (is_null($ar_records)) {
			// Calculate records when not are already received
			$ar_records = $this->get_records();
		}
		#dump($ar_records, ' ar_records ++ '.to_string());

		$ar_records_deep_resolved=array();
		foreach ((array)$ar_records as $key => $row) {
			$section_id = $row->section_id;
			$ar_records_deep_resolved[$section_id] = ($this->data_format==='dedalo') ? $this->deep_resolve_dedalo_row($row) : $this->deep_resolve_row($row);
		}
		// dump($ar_records_deep_resolved, ' $ar_records_deep_resolved ++ '.to_string());
		#$memory_usage = dd_memory_usage();
		#dump($memory_usage, ' memory_usage deep_resolve_row ++ '.to_string());


		// breakdown
			$breakdown = ($this->data_format==='breakdown' || $this->data_format==='breakdown_html') ? true : false;

		switch ($format) {
			// CSV
			case 'csv':
				$export_str_data 	= '';

				// header tipos calculate looking all rows different columns
					$header_tipos = [];
					foreach ($ar_records_deep_resolved as $key => $row) {
						#dump($row, ' row ++ '.to_string());
						foreach ($row as $item) {

							// search for look if already exists
								$ar_found = array_filter($header_tipos, function($element) use($item){
									return $element->component_tipo===$item->component_tipo
											&& $element->section_tipo===$item->section_tipo
											&& $element->from_component_tipo===$item->from_component_tipo
											&& $element->from_section_tipo===$item->from_section_tipo;

								});
							// if not already exists, add
								if (empty($ar_found)) {
									// add
										$h_item = new stdClass();
											$h_item->component_tipo 	  	= $item->component_tipo;
											$h_item->section_tipo   	  	= $item->section_tipo;
											$h_item->from_section_tipo    = $item->from_section_tipo;
											$h_item->from_component_tipo  = $item->from_component_tipo;
										$header_tipos[] = $h_item;
								}
						}
					}
					#dump($header_tipos, ' header_tipos ++ '.to_string()); die();

				// build header row
					$header_columns = [];
					foreach ($header_tipos as $h_item) {

						$current_tipo = $h_item->component_tipo;
						if ($current_tipo!=='id' && $current_tipo!=='section_id' && $current_tipo!=='section_tipo') {
							# Resolve name
							if($this->data_format==='dedalo') {

								$column_name = trim($current_tipo);

							}else{

								#if ($h_item->section_tipo!==$section_tipo) {
									$column_name  = '';
									// from_section label
										if ($h_item->from_section_tipo!==$h_item->section_tipo && $h_item->from_section_tipo!==$section_tipo) {
											$column_name .= ''.RecordObj_dd::get_termino_by_tipo($h_item->from_section_tipo, DEDALO_DATA_LANG, true, true) . $internal_separator ;
										}
									// section label
										#$column_name .= RecordObj_dd::get_termino_by_tipo($h_item->section_tipo, DEDALO_DATA_LANG, true, true) . $internal_separator ;

									// from_component label
										if ($h_item->from_component_tipo!==$h_item->component_tipo) {
											$column_name .= ''.RecordObj_dd::get_termino_by_tipo($h_item->from_component_tipo, DEDALO_DATA_LANG, true, true) . $internal_separator ;
										}
									// component label
										$column_name .= RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_DATA_LANG, true, true);
								#}else{
								#	$column_name = RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_DATA_LANG, true, true);
								#}
								if(SHOW_DEBUG===true) {
									// component tipo
										$column_name .= ' ['.$current_tipo.']';
										#dump($h_item, ' h_item ++ '.to_string($column_name));
								}

							}
						}else{
							$column_name = $current_tipo;

							// from_section label
								if ($h_item->from_section_tipo!==$h_item->section_tipo) {

									$column_name  = '';

									// from_section label
										if ($h_item->from_section_tipo!==$h_item->section_tipo && $h_item->from_section_tipo!==$section_tipo) {
											$column_name .= ''.RecordObj_dd::get_termino_by_tipo($h_item->from_section_tipo, DEDALO_DATA_LANG, true, true) . $internal_separator ;
										}

									#$column_name .= ''.RecordObj_dd::get_termino_by_tipo($h_item->from_section_tipo, DEDALO_DATA_LANG, true, true) . $internal_separator ;
									$column_name .= ''.RecordObj_dd::get_termino_by_tipo($h_item->from_component_tipo, DEDALO_DATA_LANG, true, true) . $internal_separator ;
									#$column_name .= ''.RecordObj_dd::get_termino_by_tipo($h_item->section_tipo, DEDALO_DATA_LANG, true, true) . $internal_separator;
									$column_name .= ''.$current_tipo ;

									if(SHOW_DEBUG===true) {
										// component tipo
											#$column_name .= ' ['.$current_tipo.']';
											#dump($h_item, ' h_item ++ '.to_string($column_name));
									}
								}
						}

						// remove the html tags
							$column_name = strip_tags($column_name);

						// normalize_quotes
							$column_name = self::normalize_quotes($column_name);

						// safe_cell_string
							$column_name = self::safe_cell_string($column_name);

						// header add
							$header_columns[] = $column_name;
					}
					#dump($header_columns, ' header_columns ++ '.to_string()); #die();
					$export_str_data .= implode($delimiter, $header_columns) . PHP_EOL;

				// build rows. parse and fill empty columns
					foreach ($ar_records_deep_resolved as $section_id => $row) {

						$ar_columns = [];
						$ar_columns_keys = [];
						foreach ($header_tipos as $h_key => $h_item) {

							$ar_found = array_filter($row, function($element) use($h_item){
								return $element->component_tipo===$h_item->component_tipo
										&& $element->section_tipo===$h_item->section_tipo
										&& $element->from_component_tipo===$h_item->from_component_tipo
										&& $element->from_section_tipo===$h_item->from_section_tipo;
							});
							if (!empty($ar_found)) {
								if (count($ar_found)>1) {
									$current_ar_value = array_map(function($item){
										return $item->value;
									}, $ar_found);
									$separator = strpos($this->data_format, 'html')!==false ? '<br>' : ' | ';
									$ar_parts = [];
									foreach ($current_ar_value as $cvalue) {
										$ar_parts[] = !is_array($cvalue) ? $cvalue : implode($separator, $cvalue);
									}
									$current_value = implode($separator, $ar_parts);
								}else{
									$current_value = reset($ar_found)->value;
								}
							}else{
								$current_value = ' ';
							}

							// breakdown
								if ($breakdown===true) {

									// prepare array with iteration keys
										$current_value = is_array($current_value) ? $current_value : array($current_value);
										foreach ($current_value as $value_key => $cvvalue) {
											$ar_columns_keys[] = [
												'header_key' 		=> $h_key,
												'header_tipo'		=> $h_item->component_tipo.'_'.$h_item->section_tipo.'_'.$h_item->from_section_tipo.'_'.$h_item->from_component_tipo,#$h_item->component_tipo,
												'value_key'  		=> $value_key,#$value_key.'_'.$h_item->section_tipo.'_'.$h_item->from_section_tipo,#
												'header_model' 	=> RecordObj_dd::get_modelo_name_by_tipo($h_item->component_tipo,true),
												'value' 	 	 		=> $cvvalue
											];
										}
							// default
								}else{

									// flat multiple
										if (is_array($current_value)) {
											$inter_value 	= $internal_separator;
											$current_value 	= implode($inter_value, $current_value);
										}

									// safe format with quotes etc
										$current_value = self::safe_cell_string($current_value);

									// remove html in standard mode
										if ($this->data_format==='standard') {
											$current_value = strip_tags($current_value);
										}

									// add
										$ar_columns[] = $current_value;
								}
						}
						#dump($ar_columns, ' ar_columns ++ '.to_string());
						#dump(count($ar_columns), 'count($ar_columns) ++ '.to_string());
						#dump(count($header_tipos), 'count($header_tipos) ++ '.to_string());
						#dump($ar_columns_keys, ' ar_columns_keys ++ '.to_string());

						// breakdown
							if ($breakdown===true) {
								// group ar_columns_keys by value key. iterate grouped items and write row columns
									#dump($ar_columns_keys, ' ar_columns_keys ++ '.to_string());
									$ar_group = tool_export::group_by($ar_columns_keys, 'value_key');
									#dump($ar_group, ' ar_group ++ '.to_string());

									// section_id_value_item
										$first_item = reset($ar_group);
										$ar_component_section_id = array_filter($first_item, function($element) {
											return $element['header_model']==='component_section_id';
										});
										$section_id_value_item = (!empty($ar_component_section_id)) ? reset($ar_component_section_id) : null;

									foreach ($ar_group as $_ar_items) { // each $_ar_items is a row

										$ar_cells = [];
										foreach ($header_tipos as $h_key => $h_item) {

											$ar_found = array_filter($_ar_items, function($element) use($h_item){
												return $element['header_tipo']===$h_item->component_tipo.'_'.$h_item->section_tipo.'_'.$h_item->from_section_tipo.'_'.$h_item->from_component_tipo;#$element['header_tipo']===$h_item->component_tipo;
											});
											if (!empty($ar_found)) {
												$current_value = reset($ar_found)['value'];
											}else{
												$current_value = ' ';
											}

											// safe format with quotes etc
												$current_value = self::safe_cell_string($current_value);

											// remove html in breakdown mode (not in breakdown_html)
												if ($this->data_format==='breakdown') {
													$current_value = strip_tags($current_value);
												}

											// add
												$ar_cells[] = $current_value;
										}

										// section_id cell check and fill
											if (!is_null($section_id_value_item)) {
												$section_id_value_item_key = $section_id_value_item['header_key'];
												#$first_cell_value = $ar_cells[$section_id_value_item_key];
												#if (empty($first_cell_value) || $first_cell_value==='""') {
													$ar_cells[$section_id_value_item_key] = self::safe_cell_string($section_id_value_item['value']);
												#}
											}

										// row csv
											$export_str_data .= implode($delimiter, $ar_cells) . PHP_EOL;
									}
						// default
							}else{
								// row csv
									$export_str_data .= implode($delimiter, $ar_columns) . PHP_EOL;
							}
					}
				break;

			default:
				trigger_error("Sorry. Format not implemented yet");
				break;
		}


		return (string)$export_str_data;
	}//end export_to



	/**
	* CHANGE_ENCODING_FROM_UFT8
	* @return string $ISO_result_string
	*/
	public function change_encoding_from_uft8($result_string, $encoding='ISO-8859-1') {
		$ISO_result_string= mb_convert_encoding($result_string, $encoding, 'UTF-8'); // ISO-8859-1 default

		return $ISO_result_string;
	}//end change_encoding_from_uft8



	/**
	* DEEP_RESOLVE_ROW
	* @param array $record
	* @param string $lang
	* @return array $row_deep_resolved
	*/
	public function deep_resolve_row($record, $lang=DEDALO_DATA_LANG) {
		#dump($record, ' record ++ '.to_string());

		$quotes = tool_export::$quotes;

		$row_deep_resolved=array();
		foreach ($record as $key => $value) {

			$component_tipo  = $key;
			$section_tipo 	 = $record->section_tipo;

			// skip id, section_tipo, section_id columns
			if ($key==='id' || $key==='section_tipo' || $key==='section_id') continue;

			// component
				$modelo_name 	 	= RecordObj_dd::get_modelo_name_by_tipo($key,true);
				$parent 		 		= $record->section_id;
				$component 	    = component_common::get_instance($modelo_name,
																											  $component_tipo,
																											  $parent,
																											  'list',
																											  $lang,
																											  $section_tipo,
																											  false);

			// section_list_custom
				if ($modelo_name==='component_portal' && !empty($this->section_list_custom)) {
					#dump($this->section_list_custom, ' section_list_custom ++ '.to_string());
					// like
					//	{
					//	   "oh24" : [
					//	      "rsc279",
					//	       "rsc97"
					//	   ]
					//	}
					// override component 'relaciones'
					if (isset($this->section_list_custom->{$component_tipo}) && !empty($this->section_list_custom->{$component_tipo})) {
						$relaciones = array_map(function($item){
							return (object)[
								'dd6' => $item
							];
						}, $this->section_list_custom->{$component_tipo});
						// inject 'relaciones'
						$component->RecordObj_dd->set_relaciones($relaciones);
					}
				}

			// call to component for get valor export
				$valor_export = $component->get_valor_export( $value, $lang, $quotes, $add_id=false );
				#dump($valor_export, ' valor_export ++ '.to_string($modelo_name));
				#debug_log(__METHOD__." valor_export $modelo_name - $component_tipo - $parent +  valor_export: ".to_string($valor_export), logger::DEBUG);
				#$row_deep_resolved = $valor_export;

			// add merged
				$resolve_inside = true;
				if ($resolve_inside===false) {
					$row_deep_resolved = $valor_export;
				}else{
					$row_deep_resolved = array_merge($row_deep_resolved, tool_export::recursive_value_resolve($component_tipo,
																																																	  $section_tipo,
																																																	  $section_tipo, 	// from_section_tipo
																																																	  $component_tipo, 	// from_component_tipo
																																																	  $valor_export,
																																																	  false));
					#dump($row_deep_resolved, ' row_deep_resolved ++ '.$modelo_name.' '.to_string($component_tipo));
				}
				#dump($row_deep_resolved, ' row_deep_resolved ++ '.to_string($component_tipo));

		}//end foreach ($record as $component_tipo => $value) {
		#dump($row_deep_resolved, ' row_deep_resolved ++++++++++++++++ '.to_string());

		return (array)$row_deep_resolved;
	}//end deep_resolve_row



	/**
	* DEEP_RESOLVE_DEDALO_ROW
	* @param array $record
	* @param string $lang
	* @return array $row_deep_resolved
	*/
	public function deep_resolve_dedalo_row($record, $lang=DEDALO_DATA_LANG) {
		#dump($record, ' record ++ '.to_string());

		$quotes = tool_export::$quotes;

		$row_deep_resolved=array();
		foreach ($record as $key => $value) {

			$component_tipo  = $key;
			$section_tipo 	 = $record->section_tipo;

			if ($key==='id' || $key==='section_tipo') continue;
			if ($key==='section_id') {

				$current_value = $value;
				$row_item = new stdClass();
					$row_item->component_tipo		= $component_tipo;
					$row_item->section_tipo 		= $section_tipo;
					$row_item->from_component_tipo	= $component_tipo;
					$row_item->from_section_tipo 	= $section_tipo;
					$row_item->value 				= $current_value;

				$row_deep_resolved[] = $row_item;
				continue;
			}

			$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($key,true);
			$parent 		 = $record->section_id;
			$component 	     = component_common::get_instance($modelo_name,
															  $component_tipo,
															  $parent,
															  'list',
															  $lang,
															  $section_tipo,
															  false);

			// Full source untouched dato
				$valor_export 	 = $this->get_valor_dedalo($component);

			// escape delimiter for avoid breaks
				$valor_export 	 = self::format_valor_csv_export_string($valor_export);

			// store row
				#$row_deep_resolved[$key] = $valor_export;
				$current_value = $valor_export;
				$row_item = new stdClass();
					$row_item->model				= $modelo_name; // for debug info only
					$row_item->component_tipo		= $component_tipo;
					$row_item->section_tipo 		= $section_tipo;
					$row_item->from_component_tipo	= $component_tipo;
					$row_item->from_section_tipo 	= $section_tipo;
					$row_item->value 				= $current_value;

				$row_deep_resolved[] = $row_item;

		}//end foreach ($record as $component_tipo => $value)
		#dump($row_deep_resolved, ' row_deep_resolved ++++++++++++++++ '.to_string());

		return (array)$row_deep_resolved;
	}//end deep_resolve_dedalo_row



	/**
	* RECURSIVE_VALUE_RESOLVE
	* @return array $ar_values
	*/
	public static function recursive_value_resolve($component_tipo, $section_tipo, $from_section_tipo, $from_component_tipo, $valor_export, $is_recursion, $ar_values=[]) {

		#$ar_values = [];

		// quotes . Start and end chars to delimit cell like '"' in "mhy value"
		$quotes = tool_export::$quotes;
		// internal_separator . Internal separator char when multiple values are stored in a one cell like '\n' in "pepe\nandres"
		$internal_separator = tool_export::$internal_separator;


		if (!is_array($valor_export)) {

				$ar_found = array_filter($ar_values, function($element) use($component_tipo, $section_tipo, $from_section_tipo, $from_component_tipo){
					return $element->component_tipo===$component_tipo
							&& $element->section_tipo===$section_tipo
							&& $element->from_section_tipo===$from_section_tipo
							&& $element->from_component_tipo===$from_component_tipo;
				});
				if (!empty($ar_found)) {

					// Update existing object value mixed with new
						$found_obj 					= reset($ar_found);
						#$current_value 		= $found_obj->value . $internal_separator . self::format_valor_csv_export_string($valor_export);
						$current_value 			= is_array($found_obj->value) ? $found_obj->value : array($found_obj->value);
						$current_value[] 		= self::format_valor_csv_export_string($valor_export);
						$found_obj->value 	= $current_value;

				}else{

					// create new and add
						$current_value 	= tool_export::format_valor_csv_export_string($valor_export); // $valor_export;
						$row_item = new stdClass();
							$row_item->component_tipo				= $component_tipo;
							$row_item->section_tipo 				= $section_tipo;
							$row_item->from_section_tipo		= $from_section_tipo;
							$row_item->from_component_tipo 	= $from_component_tipo;
							$row_item->value 								= $current_value;

						$ar_values[] = $row_item;
				}

				return $ar_values;
		}


		foreach ($valor_export as $item) {
			#dump($item, ' item ++ '.to_string($component_tipo));

			$current_component_tipo 			= $item->component_tipo;
			$current_section_tipo 				= $item->section_tipo;
			$current_from_section_tipo 		= $item->section_tipo===$item->from_section_tipo ?	$from_section_tipo : $item->from_section_tipo;#$item->section_tipo;
			$current_from_component_tipo 	= $item->from_component_tipo; // $item->component_tipo;
			$current_value 								= $item->value;

			// $ar_values = array_merge($ar_values, self::recursive_value_resolve($current_component_tipo,
			// 																				$current_section_tipo,
			// 																				$current_from_section_tipo,
			// 																				$current_from_component_tipo,
			// 																				$current_value,
			// 																				true,
			// 																				$ar_values
			// 																			));
			$ar_values_inside = self::recursive_value_resolve($current_component_tipo,
																												$current_section_tipo,
																												$current_from_section_tipo,
																												$current_from_component_tipo,
																												$current_value,
																												true,
																												$ar_values
																											 );
			$ar_values = $ar_values_inside;
		}

		return $ar_values;
	}//end recursive_value_resolve



	/**
	* RECURSIVE_VALUE_RESOLVE
	* @return array $ar_values
	*//*
	public static function recursive_value_resolve($component_tipo, $section_tipo, $from_section_tipo, $from_component_tipo, $valor_export, $is_recursion) {

		$ar_values = [];

		// quotes . Start and end chars to delimit cell like '"' in "mhy value"
		$quotes 			= tool_export::$quotes;
		// internal_separator . Internal separator char when multiple values are stored in a one cell like '\n' in "pepe\nandres"
		$internal_separator = tool_export::$internal_separator;

		if (is_array($valor_export)) {

			foreach ($valor_export as $item) {
				if (is_array($item->value)) {

					// Recursion resolve
						$ar_values = array_merge($ar_values, tool_export::recursive_value_resolve($item->component_tipo,
																								  $item->section_tipo,
																								  $item->from_section_tipo,
																								  $item->from_component_tipo,
																								  $item->value,
																								  true));

				}else{

					// vertical format
						$ar_found = array_filter($ar_values, function($element) use($item){
							return $element->component_tipo===$item->component_tipo
									&& $element->from_section_tipo===$item->from_section_tipo
									&& $element->from_component_tipo===$item->from_component_tipo;
						});
						if (!empty($ar_found)) {

							// Update existing object value mixed with new
								$found_obj 				= reset($ar_found);
								#$current_value 	= $found_obj->value . $internal_separator . self::format_valor_csv_export_string($item->value);
								$current_value 		= is_array($found_obj->value) ? $found_obj->value : array($found_obj->value);
								$current_value[] 	= self::format_valor_csv_export_string($item->value);
								$found_obj->value = $current_value;

						}else{

							// create new and add
								$current_value 	= tool_export::format_valor_csv_export_string($item->value); // $item->value;
								$row_item = new stdClass();
									$row_item->component_tipo				= $item->component_tipo;
									$row_item->section_tipo 				= $item->section_tipo;
									$row_item->from_section_tipo 		= $item->from_section_tipo;
									$row_item->from_component_tipo 	= $item->from_component_tipo;
									$row_item->value 								= $current_value;

								$ar_values[] = $row_item;
						}
				}
			}//end foreach ($valor_export as $item)

		}else{

			// vertical format
				$ar_found = array_filter($ar_values, function($element) use($component_tipo, $from_section_tipo, $from_component_tipo){
					return $element->component_tipo===$component_tipo
							&& $element->from_section_tipo===$from_section_tipo
							&& $element->from_component_tipo===$from_component_tipo;
				});
				if (!empty($ar_found)) {

					// Update existing object value mixed with new
						$found_obj 					= reset($ar_found);
						#$current_value 		= $found_obj->value . $internal_separator . self::format_valor_csv_export_string($valor_export);
						$current_value 			= is_array($found_obj->value) ? $found_obj->value : array($found_obj->value);
						$current_value[] 		= self::format_valor_csv_export_string($valor_export);
						$found_obj->value 	= $current_value;

				}else{

					// create new and add
						$current_value 	= tool_export::format_valor_csv_export_string($valor_export); // $valor_export;
						$row_item = new stdClass();
							$row_item->component_tipo				= $component_tipo;
							$row_item->section_tipo 				= $section_tipo;
							$row_item->from_section_tipo		= $from_section_tipo;
							$row_item->from_component_tipo 	= $from_component_tipo;
							$row_item->value 								= $current_value;

						$ar_values[] = $row_item;
				}
		}
		#dump($ar_values, ' ar_values ++ '.to_string($component_tipo));


		return $ar_values;
	}//end recursive_value_resolve
	*/



	/**
	* FORMAT_VALOR_CSV_EXPORT_STRING
	* @return string $valor_export
	*/
	public static function format_valor_csv_export_string($valor_export) {

		$delimiter  = tool_export::$delimiter;
		$quotes 	= tool_export::$quotes;


		#$valor_export = strip_tags($valor_export);

		// replace hard spaces
			$valor_export = str_replace(['&nbsp;',"\xc2\xa0"], ' ', $valor_export);

		// remove untranstaled tags
			$valor_export = str_replace(['<mark>','</mark>'], '', $valor_export);

		// encode delimiter to avoid breaks
			$valor_export 	 = str_replace(';','U+003B', $valor_export);

		// csv normalize and scape quotes
			$valor_export = self::escape_quotes($valor_export);

		return $valor_export;
	}//end format_valor_csv_export_string



	/**
	* NORMALIZE_QUOTES
	* @return string
	*/
	public static function normalize_quotes(string $str) {
		$chr_map = array(
		   // Windows codepage 1252
		   "\xC2\x82" 		=> "'", // U+0082⇒U+201A single low-9 quotation mark
		   "\xC2\x84" 		=> '"', // U+0084⇒U+201E double low-9 quotation mark
		   "\xC2\x8B" 		=> "'", // U+008B⇒U+2039 single left-pointing angle quotation mark
		   "\xC2\x91" 		=> "'", // U+0091⇒U+2018 left single quotation mark
		   "\xC2\x92" 		=> "'", // U+0092⇒U+2019 right single quotation mark
		   "\xC2\x93" 		=> '"', // U+0093⇒U+201C left double quotation mark
		   "\xC2\x94" 		=> '"', // U+0094⇒U+201D right double quotation mark
		   "\xC2\x9B" 		=> "'", // U+009B⇒U+203A single right-pointing angle quotation mark

		   // Regular Unicode     // U+0022 quotation mark (")
		                          // U+0027 apostrophe     (')
		   "\xC2\xAB"     	=> '"', // U+00AB left-pointing double angle quotation mark
		   "\xC2\xBB"     	=> '"', // U+00BB right-pointing double angle quotation mark
		   "\xE2\x80\x98" 	=> "'", // U+2018 left single quotation mark
		   "\xE2\x80\x99" 	=> "'", // U+2019 right single quotation mark
		   "\xE2\x80\x9A" 	=> "'", // U+201A single low-9 quotation mark
		   "\xE2\x80\x9B" 	=> "'", // U+201B single high-reversed-9 quotation mark
		   "\xE2\x80\x9C" 	=> '"', // U+201C left double quotation mark
		   "\xE2\x80\x9D" 	=> '"', // U+201D right double quotation mark
		   "\xE2\x80\x9E" 	=> '"', // U+201E double low-9 quotation mark
		   "\xE2\x80\x9F" 	=> '"', // U+201F double high-reversed-9 quotation mark
		   "\xE2\x80\xB9" 	=> "'", // U+2039 single left-pointing angle quotation mark
		   "\xE2\x80\xBA" 	=> "'", // U+203A single right-pointing angle quotation mark,
		   '&quot;' 	  	=> '"'
		);
		$chr = array_keys  ($chr_map); // but: for efficiency you should
		$rpl = array_values($chr_map); // pre-calculate these two arrays
		$str = str_replace($chr, $rpl, html_entity_decode($str, ENT_QUOTES, "UTF-8"));

		return $str;
	}//end normalize_quotes



	/**
	* ESCAPE_QUOTES
	* @return string
	*/
	public static function escape_quotes(string $str) {

		// normalize quotes
			$str = self::normalize_quotes($str);

		// escape quotes with csv standard escape (double quotes like "")
			$str = str_replace('"', '""', $str);

		return $str;
	}//end escape_quotes



	/**
	* SAFE_CELL_STRING
	* @return string
	*/
	public static function safe_cell_string($cell_value) {

		$quotes = tool_export::$quotes;

		// avoid break cell when csv parse. safe manage internal column separators
			#$cell_value = str_replace(';', 'U+003B', $cell_value);

		// create final value inside csv quotes
			$cell_value = $quotes . trim($cell_value) . $quotes;

		return $cell_value;
	}//end safe_cell_string



	/**
	* GET_VALOR_DEDALO
	* @return string $valor_dedalo
	*/
	public function get_valor_dedalo($component) {

		$tipo 			= $component->get_tipo();
		$lang 			= $component->get_lang();
		$section_id 	= $component->get_parent();
		$section_tipo 	= $component->get_section_tipo();

		$section  = section::get_instance($section_id, $section_tipo);

		$RecordObj_dd = new RecordObj_dd($tipo);
		$traducible   = $RecordObj_dd->get_traducible();	//==='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;


		$valor_dedalo = '';

		$component_name 				= get_class($component);
		$ar_components_with_relations 	= component_relation_common::get_components_with_relations($component_name);

		if (in_array($component_name, $ar_components_with_relations)) {

			# Relations
			if ($component_name==='component_relation_parent') {
				$ar_valor = $component->get_dato_export();
			}else{
				$ar_valor = $component->get_dato();
			}

		}else{

			#if ($traducible==='no') {
			/*
				$dato = $component->get_dato();
				#$dato = $section->get_component_dato($tipo, $lang, $lang_fallback=false);
				if (!empty($dato)) {
					$valor_dedalo = json_encode($dato, JSON_UNESCAPED_UNICODE) ." +++++++++++++";
				}
			*/
			#}else{

				$ar_valor = [];

				$ar_langs = common::get_ar_all_langs();
				# Add nolan as lang
				$ar_langs[] = DEDALO_DATA_NOLAN;
				foreach ($ar_langs as $current_lang) {

					$dato = $section->get_component_dato($tipo, $current_lang, $lang_fallback=false);
					if (!empty($dato)) {
						$ar_valor[$current_lang] = $dato;
					}
				}
				#dump($ar_valor, ' $ar_valor ++ '.to_string());
				#dump($valor_dedalo, ' $valor_dedalo ++ '.to_string());
			#}
		}

		if (!empty($ar_valor)) {
			$valor_dedalo = json_encode($ar_valor, JSON_UNESCAPED_UNICODE);
		}


		return (string)$valor_dedalo;
	}//end get_valor_dedalo



	/**
	* GET_AR_COLUMNS
	* @return array $ar_columns
	* Get all section fields
	*/
	public function get_ar_columns() {

		$section_tipo 			 = $this->section_tipo;
		$ar_modelo_name_required = array('component');

		$ar_elements = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true);
			#dump($ar_elements, ' $ar_elements ++ '.to_string($section_tipo));

		$ar_columns=array();
		foreach ($ar_elements as $key => $tipo) {

			#$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			#if($modelo_name=='component_section_id') continue; # Skip component_section_id (is fixed data in export)

			$name = RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_DATA_LANG, true, true); // $terminoID, $lang=NULL, $from_cache=false, $fallback=true
			$ar_columns[$tipo] = $name;
		}

		// aditional section info fields. dd196
			$parent_tipo 	= DEDALO_SECTION_INFO_SECTION_GROUP;
			$RecordObj_dd 	= new RecordObj_dd($parent_tipo);
			$childrens 		= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($parent_tipo, 'component_', 'children', $search_exact=false);
			foreach ($childrens as $current_tipo) {
				$name = RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_DATA_LANG, true, true); // $terminoID, $lang=NULL, $from_cache=false, $fallback=true
				$ar_columns[$current_tipo] = $name;
			}

		return $ar_columns;
	}//end get_ar_columns



	/**
	* COLUMNS_TO_LAYOUT_MAP
	* @return array $layout_map
	*/
	public static function columns_to_layout_map($columns, $section_tipo) {

		if (is_string($columns)) {
			$columns = json_decode($columns);
		}

		$layout_map=array();
		foreach ($columns as $tipo => $value) {
			$layout_map[$section_tipo][] = $tipo;
				#dump($tipo, ' tipo ++ '.to_string($value));
		}

		return $layout_map;
	}//end columns_to_layout_map



	/**
	* WRITE_RESULT
	* @param string $result
	* @return object $response
	*/
	public function write_result($result_string, $variant=null, $extension = 'csv') {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$section_tipo	= $this->section_tipo;
		$label 			= RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true);
		$label 			= self::normalize_name($label);
		$filename 		= 'exported_'.$variant.''.$label.'_'.navigator::get_user_id().'-'.$section_tipo.'.'.$extension;

		#$result_string  = str_replace('U+003B', ';', $result_string);

		$target_dir 	= DEDALO_TOOL_EXPORT_FOLDER_PATH;
		if( !is_dir($target_dir) ) {
			if(!mkdir($target_dir, 0777,true)) throw new Exception("Error on read or create directory. Permission denied \"$target_dir\" (1)");
		}
		file_put_contents( $target_dir.'/'.$filename, $result_string);

		$response->result 	= true;
		$response->msg 		= 'Exported successfully';
		$response->path 	= $target_dir.'/'.$filename;
		$response->url 		= DEDALO_TOOL_EXPORT_FOLDER_URL .'/'. $filename;

		return $response;
	}//end write_result



	/**
	* NORMALIZE_NAME
	* Sanitize section name for use in file name
	* @return string $str
	*/
	public static function normalize_name( $str ) {

		$str = strip_tags($str);
	    $str = preg_replace('/[\r\n\t ]+/', ' ', $str);
	    $str = preg_replace('/[\"\*\/\:\<\>\?\'\|]+/', ' ', $str);
	    $str = strtolower($str);
	    $str = html_entity_decode( $str, ENT_QUOTES, "utf-8" );
	    $str = htmlentities($str, ENT_QUOTES, "utf-8");
	    $str = preg_replace("/(&)([a-z])([a-z]+;)/i", '$2', $str);
	    $str = str_replace(' ', '-', $str);
	    $str = rawurlencode($str);
	    $str = str_replace('%', '-', $str);

	    return $str;
	}//end normalize_name



	/**
	* READ_CSV_FILE_AS_TABLE
	* @param string $file
	* @return string $html
	*/
	public static function read_csv_file_as_table($file, $header=false, $delimiter=null, $standalone=false) {

		if (empty($delimiter)) {
			$delimiter = tool_export::$delimiter;
		}

		$html='';

		#
		# TABLE HTML
		$table_html ='';
		if(SHOW_DEBUG===true) {
			$table_html .= "<div class=\"caption no-print\">TABLE FROM: $file</div>";
		}
		$table_html .= "<table class=\"table_csv\">\n\n";
		ini_set('auto_detect_line_endings',TRUE);
		$f = fopen($file, "r");
		$i=0; while (($line = fgetcsv($f, 300000, $delimiter)) !== false) {

				$table_html .= '<tr>';
				foreach ($line as $cell) {
					$table_html .= ($header && $i===0) ? '<th>' : '<td>';
					$cell=nl2br($cell);
					#$cell=htmlspecialchars($cell); // htmlspecialchars_decode($cell);
					#$cell = str_replace("\t", " <blockquote> </blockquote> ", $cell);

					// images . Replace images url to html img tags
						$regex = '/https?\:\/\/[^\\" ]+.(jpg|svg)/i';
						$cell  = preg_replace($regex, "<img src=\"$0\"/>", $cell);

					// unescape separator ;
						$cell  = str_replace('U+003B', ';', $cell);

					// Revove html mark tags
						#$cell = preg_replace('/<\/?mark[^>]*>/i', '', $cell);

					// remove closing quotes
						$cell = trim($cell,'"');

					$table_html .= $cell;
					$table_html .= ($header && $i==0) ? '</th>' : '</td>';
				}
				$table_html .= "</tr>\n";

				$i++;
		}
		fclose($f);
		ini_set('auto_detect_line_endings',FALSE);
		$table_html .= "\n</table>";

		if ($standalone) {
			$css_file = DEDALO_LIB_BASE_URL . '/tools/tool_export/css/tool_export.css';

			$html .= "<html><head>";
			$html .= "<link rel=\"stylesheet\" href=\"$css_file\" type=\"text/css\" />";
			$html .= "</head><body>";
			$html .= $table_html;
			$html .= "</body></html>";
		}else{
			$html .= $table_html;
		}

		return $html;
	}//end read_csv_file_as_table



	/**
	* GROUP_BY
	* Group multidimensional array by a array key
	* @param array $array
	*	Array to group
	* @param string $key
	*	Name of key for group
	* @return array $result
	*/
	public static function group_by($array, $key) {

		$result = array();
		foreach($array as $val) {
			$result[$val[$key]][] = $val;
		}

		return $result;
	}//end group_by



}//end class
