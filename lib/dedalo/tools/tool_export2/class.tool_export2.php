<?php
/*
* CLASS TOOL_EXPORT

	Export selected records in different formats using section_list as base fields reference

*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');



class tool_export2 extends tool_common {



	public $section_tipo;
	public $section_obj;	# received section
	public $ar_records;		# Array of records to export (section_id) or null
	public $data_format;  	# string 'standard', 'dedalo'

	public static $quotes 	 		  = '"';
	public static $delimiter 		  = ';';
	public static $internal_separator = PHP_EOL;

	public $ar_parsed = [];
	public $columns = [];
	public $composed_rows = [];

	public $counter = 0;
	public $sub_counter = 0;

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
	* GET_INDIRECT_COMPONENTS
	* @return array of model names
	*/
	public function get_indirect_components() {
		return [
			'component_portal',
			'component_autocomplete',
			#'component_filter',
			#'component_publication'
		];
	}//end get_indirect_components



	/**
	* GET_COLUMNS
	* @return array $columns
	*	Array of objects (path items)
	*/
	public function get_columns($ar_paths, $section_tipo) {
		#dump($ar_paths, ' ar_paths ++ '.to_string());
		$columns = [];

		// main section id column
			$path_item = new stdClass();
				$path_item->section_tipo 	= $section_tipo;
				$path_item->component_tipo 	= 'section_id';
				$path_item->modelo 			= 'section_id';
				$path_item->name 			= RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true);

			$columns[] = $path_item;

		$components_with_relations = $this->get_indirect_components();

		// all others
		foreach ($ar_paths as $current_path) {
			foreach ($current_path as $path_item) {

				$found = array_reduce($columns, function($carry, $item) use($path_item){
					return ($item->component_tipo===$path_item->component_tipo &&
							$item->section_tipo===$path_item->section_tipo ) ? $item : $carry;
				}, false);
				if (!$found) {

					if (in_array($path_item->modelo, $components_with_relations)) {
						$path_item->with_relations = true;
						continue;
					}

					$columns[] = $path_item;
				}
			}
		}
		#dump($columns, ' columns ++ '.to_string()); #die();

		// set
		$this->columns = $columns;

		return $columns;
	}//end get_columns



	/**
	* GET_RECORDS
	* @return array|null
	*/
	public function get_records() {

		if (!empty($this->ar_records)) return $this->ar_records;

		// search options (from session)
			$section_tipo 		  = $this->section_tipo;
			$search_options_id 	  = $section_tipo; // section tipo like oh1
			$saved_search_options = section_records::get_search_options( $search_options_id );
			if ($saved_search_options===false) {
				trigger_error("Sorry, search_options [$search_options_id] not exits in section_records::get_search_options");
				return null;
			}

		// search_query_object . Add search_query_object to options
			$search_query_object = $saved_search_options->search_query_object;

		// Select. layout map is used to set columns select in search_query_object
			$search_query_object->select = [];

		// Reset search limit and offset
			$search_query_object->limit  = 0;
			$search_query_object->offset = 0;

		// Search exec
			$search_develoment2  = new search_development2($search_query_object);
			$rows_data 		 	 = $search_develoment2->search();

		// fix result
			$this->ar_records = $rows_data->ar_records;
			#dump($this->ar_records, ' this->ar_records ++ '.to_string()); die();

		return $this->ar_records;
	}//end get_records



	public function parse_records($ar_records, $ar_paths) {

		foreach ($ar_records as $key => $record) {

			$this->counter = ($this->counter + $this->sub_counter)+1;

			$record_key = $record->section_tipo.'_'.$record->section_id;
			$this->ar_parsed[$record_key][] = (object)[
				'value'					=> $record->section_id,
				'model' 				=> 'section_id',
				'component_tipo' 		=> 'section_id',
				'section_tipo' 	 		=> $record->section_tipo,
				'section_label' 		=> RecordObj_dd::get_termino_by_tipo($record->section_tipo, DEDALO_DATA_LANG, true, true),
				'counter' 				=> $this->counter
			];

			foreach ($ar_paths as $key => $path) {

				$path_item = reset($path);

				$model 			= $path_item->modelo;
				$component_tipo	= $path_item->component_tipo;
				$section_tipo 	= $path_item->section_tipo; // end($data_path)->section_tipo; //
				$section_id 	= $record->section_id;
				$lang 			= DEDALO_DATA_LANG;
				$component 		= component_common::get_instance($model, $component_tipo, $section_id, 'list', $lang, $path_item->section_tipo);

				if (in_array($model, $this->get_indirect_components())) {

					$component_dato = $component->get_dato();

					if (!empty($component_dato)) {

						$sub_path = array_slice($path, 1);

						$ar_resolved = $this->resolve_indirect($component_dato, $sub_path);
						$record_key = $record->section_tipo.'_'.$record->section_id;
						foreach ($ar_resolved as $resolved_item) {
							$this->ar_parsed[$record_key][] = $resolved_item;
						}
					}

				}else{

					$value = $component->get_valor_export(null, $lang, false, false);

					$record_key = $record->section_tipo.'_'.$record->section_id;
					$this->ar_parsed[$record_key][] = (object)[
						'value'					=> $value,
						'model' 				=> $model,
						'component_tipo' 		=> $component_tipo,
						'section_tipo' 	 		=> $section_tipo,
						'section_id' 	 		=> $section_id,
						'section_label' 		=> RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true),
						'counter' 				=> $this->counter
					];
				}

			}
		}
		dump($this->ar_parsed, ' this->ar_parsed ++ '.to_string()); die();

		return $this->ar_parsed;
	}//end parse_records



	/**
	* RESOLVE_INDIRECT
	* @return
	*/
	public function resolve_indirect($component_dato, $path) {

		$ar_item_path =[];
		foreach ($component_dato as $key => $locator) {

			$current_path = reset($path);

			$ar_item_path[] = $this->resolve_path($locator, $current_path, $path);

		}

		return $ar_item_path;
	}//end resolve_indirect



	/**
	* RESOLVE_PATH
	* @return array ar_items
	*/
	public function resolve_path($locator, $current_path, $path) {
		$item_obj = null;

		$model 			= $current_path->modelo;
		$component_tipo	= $current_path->component_tipo;
		$section_tipo 	= $current_path->section_tipo; // end($data_path)->section_tipo; //
		$section_id 	= $locator->section_id;
		$lang 			= DEDALO_DATA_LANG;
		$component 		= component_common::get_instance($model, $component_tipo, $section_id, 'list', $lang, $section_tipo);

		if (in_array($model, $this->get_indirect_components())) {

			$new_dato = $component->get_dato();
			if (!empty($new_dato)) {

				$sub_path = array_slice($path, 1);
				#foreach ($new_dato as $current_locator) {
				#	$this->resolve_path($current_locator, $sub_path);
				return	$this->resolve_indirect($new_dato, $sub_path);
				#}
			}
			#break;

		}else{



			$value = $component->get_valor_export(null, $lang, false, false);

			$record_key = $locator->section_tipo.'_'.$locator->section_id;
			$item_obj = (object)[
				'value'					=> $value,
				'model' 				=> $model,
				'component_tipo' 		=> $component_tipo,
				'section_tipo' 	 		=> $section_tipo,
				'section_id' 	 		=> $section_id,
				'section_label' 		=> RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true),
				'counter' 				=> $this->counter
			];

				return $item_obj;
			#

		}
		//break;


	}//end resolve_path


	/*
	public function parse_records($ar_records, $ar_paths, $data_path=[]) {

		foreach ($ar_records as $key => $record) {

			if (empty($data_path)) {
				// add first data_path with current record data
				$data_path[] = (object)[
					'section_tipo' 	=> $record->section_tipo,
					'section_id' 	=> $record->section_id,
					'component_tipo'=> 'section_id',
					'type' 			=> 'FIRST_PATH',
					'value'			=> $record->section_id
				];

				$record_key = $record->section_tipo.'_'.$record->section_id;
				$this->ar_parsed[$record_key][] = (object)[
					'value'					=> $record->section_id,
					'model' 				=> 'section_id',
					'component_tipo' 		=> 'section_id',
					'section_tipo' 	 		=> $record->section_tipo,
					'section_label' 		=> RecordObj_dd::get_termino_by_tipo($record->section_tipo, DEDALO_DATA_LANG, true, true),
					'data_path' 			=> $data_path
				];
			}else{
				// add current record data to the end of existing data_path
				$data_path[] = (object)[
					'section_tipo' 	=> $record->section_tipo,
					'section_id' 	=> $record->section_id,
					'component_tipo'=> 'section_id',
					'type' 			=> 'RECURSION_PATH',
					'value'			=> $record->section_id
				];
			}
			#$this->parse_record($record, $ar_paths, $data_path, $recursion);

			foreach ($ar_paths as $item_path) {
				$this->resolve_path($item_path, $data_path);
			}//end foreach ($this->ar_paths as $key => $item_path)
		}

		return $this->ar_parsed;
	}//end parse_records
	*/


	/**
	* RESOLVE_PATH
	* @return array ar_items
	*//*
	public function resolve_path($item_path, $data_path) {

		$ar_items = [];
		foreach ($item_path as $path_key => $path) {

			// component
				$model 			= $path->modelo;
				$component_tipo	= $path->component_tipo;
				$section_tipo 	= $path->section_tipo; // end($data_path)->section_tipo; //
				$section_id 	= end($data_path)->section_id;
				$lang 			= DEDALO_DATA_LANG;
				$component 		= component_common::get_instance($model, $component_tipo, $section_id, 'list', $lang, $path->section_tipo);

			if (in_array($model, $this->get_indirect_components())) {

				$component_dato = $component->get_dato();
				if (!empty($component_dato)) {

					// add
					$already_inserted = array_reduce($data_path, function($carry, $el) use($section_tipo, $section_id, $component_tipo){
						return ($el->section_tipo===$section_tipo && $el->section_id===$section_id && (isset($el->component_tipo) && $el->component_tipo===$component_tipo)) ? $el : $carry;
					}, false);
					if (!$already_inserted) {
						$data_path[] = (object)[
							'section_tipo' 	 => $section_tipo,
							'section_id' 	 => $section_id,
							'component_tipo' => $component_tipo,
							'type'			 => 'ITERMEDIATE_PATH',
							'value'			 => array_map(function($item){
								return $item->section_id;
							}, $component_dato)
						];
					}

					$sub_path = array_slice($item_path, $path_key+1);
					foreach ($component_dato as $key => $locator) {
					#	// add current record data to the end of existing data_path
					#	$data_path[] = (object)[
					#		'section_tipo' 	=> $locator->section_tipo,
					#		'section_id' 	=> $locator->section_id,
					#		'component_tipo'=> 'section_id',
					#		'type' 			=> 'RECURSION_PATH',
					#		'value'			=> $locator->section_id,
					#	];
					#	$this->resolve_path($sub_path, $data_path);
						$this->parse_records([$locator], [$sub_path], $data_path, true);
					}
					#$this->parse_records($component_dato, [$sub_path], $data_path, true);
				}
				break;

			}else{

				// add
				$value = $component->get_valor_export(null, $lang, false, false);
				$record_key = reset($data_path)->section_tipo.'_'.reset($data_path)->section_id;

				$data_path[] = (object)[
					'section_tipo' 	 => $section_tipo,
					'section_id' 	 => $section_id,
					'component_tipo' => $component_tipo,
					'type'			 => 'END_PATH',
					'value'			 => $value
				];
				$this->ar_parsed[$record_key][] = (object)[
					'value'				=> $value,
					'model' 			=> $model,
					'component_tipo' 	=> $component_tipo,
					'section_tipo' 	 	=> $path->section_tipo,
					'section_label' 	=> RecordObj_dd::get_termino_by_tipo($path->section_tipo, DEDALO_DATA_LANG, true, true),
					'component_label' 	=> RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true),
					'data_path' 		=> $data_path
				];
			}
		}

		return $ar_items;
	}//end resolve_path
	*/


	/**
	* CREATE_ROWS_FROM_PARSED
	* @return array $ar_final
	*/
	public function create_rows_from_parsed() {

		$parsed = $this->ar_parsed;
			#dump($parsed, ' parsed ++ '.to_string());

		$ar_final = [];
		foreach ($parsed as $row_key => $row_items) {

			$multi_row = $this->build_multi_row($row_items);
				#dump($multi_row, ' multi_row ++ '.to_string());

			$ar_final = array_merge($ar_final, $multi_row);
		}
		#dump($ar_final, ' ar_final ++ '.to_string());


		return $ar_final;
	}//end create_rows_from_parsed



	/**
	* BUILD_MULTI_ROW
	* @return array $ar_rows
	*/
	public function build_multi_row($row_items) {
			dump($row_items, ' row_items ++ '.to_string()); die();

		$rows = [];

		// mix data_paths
			$full_data_path = [];
			foreach ($row_items as $item) {
				foreach ($item->data_path as $data_path_item) {
					#if (!in_array($data_path_item, $full_data_path)) {
						$full_data_path[] = $data_path_item;
					#}
				}
			}
			dump($full_data_path, ' full_data_path ++ '.to_string()); die();

			#function cmp($a, $b) {
			#    return !strcmp($a->component_tipo, $b->component_tipo);
			#}
			#usort($full_data_path, "cmp");
			#dump($full_data_path, ' full_data_path usort ++ '.to_string()); #die();

		// filled_gaps recursive
			function fill_gaps($full_data_path, $base_row=[]) {

				$row = $base_row;
				$prev_item = null;
				foreach ($full_data_path as $key => $data_path_item) {

					#if ($data_path_item->type==='FIRST_PATH') {
					#	$row[] = $data_path_item;
					#	$prev_item = $data_path_item;
					#	continue;
					#}
					#if ($prev_item) {
					#	# code...
					#}


					// already added to row ?
					$ar_found = array_filter($row, function($item) use($data_path_item){
						return  $item->component_tipo===$data_path_item->component_tipo
							 && $item->section_tipo===$data_path_item->section_tipo;
					});
					if (empty($ar_found)) {
						// not exists
						$row[] = $data_path_item;
					}else{


					}
				}
				$rows[] = $row;

				// remove already used
					$buffer = [];
					foreach ($full_data_path as $key => $data_path_item) {
						if (!in_array($data_path_item, $row)) {
							$buffer[] = $data_path_item;
						}
					}
					if (!empty($buffer)) {
						$base_row = [];
						foreach ($row as $rkey => $rvalue) {

							$ar_found = array_filter($buffer, function($item) use($rvalue){
								return  $item->component_tipo===$rvalue->component_tipo
									 && $item->section_tipo===$rvalue->section_tipo;
							});
							if (empty($ar_found)) {
								$base_row[] = $rvalue;
							}
						}
							#dump($buffer, ' buffer ++ '.to_string());
							#dump($base_row, ' base_row ++ '.to_string());
						$others = fill_gaps($buffer, $base_row);
						foreach ($others as $key => $other) {
							$rows[] = $other;
						}
					}

				return $rows;
			}
			$filled_gaps = fill_gaps($full_data_path);
				dump($filled_gaps, ' filled_gaps ++ '.to_string()); die();

		// final rows normalized with columns
			$rows_normalized = [];
			foreach ($filled_gaps as $key => $row) {

				$row_clean = [];

				// colums normalize
				foreach ($this->columns as $column) {
					$found = array_reduce($row, function($carry, $item) use($column){
						return ($item->component_tipo===$column->component_tipo &&
								$item->section_tipo===$column->section_tipo ) ? $item : $carry;
					}, false);

					$value = $found ? $found->value : '';

					$row_clean[] = (object)[
						'value' 		 => $value,
						'section_tipo' 	 => $column->section_tipo,
						'component_tipo' => $column->component_tipo
					];
				}

				$rows_normalized[] = $row_clean;
			}
			#dump($rows_normalized, '$rows_normalized ++ '.to_string());

		return $rows_normalized;
	}//end build_multi_row



	/**
	* GET_RECORDS
	* @return array|null
	*//*
	public function get_records_OLD( $ar_paths=null ) {

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
		$search_query_object->select = [];
		#$path_element = json_decode('{
		#	"path": [
		#		{
		#		  "name": "section_id",
		#		  "modelo": "component_section_id",
		#		  "section_tipo": "'.$section_tipo.'",
		#		  "component_tipo": "section_id"
		#		}
		#	],
		#	"component_path" : []
		#}');
		#$search_query_object->select[] = $path_element;
			#dump($search_query_object, ' search_query_object ++ '.to_string()); //die();

		# Reset search limit and offset
		$search_query_object->limit  = 0;
		$search_query_object->offset = 0;

		# SEARCH
		$search_develoment2  = new search_development2($search_query_object);
		$rows_data 		 	 = $search_develoment2->search();

		$this->ar_records = $rows_data->ar_records;
			#dump($this->ar_records, ' this->ar_records ++ '.to_string()); die();

		return $this->ar_records;
	}//end get_records
	*/




	/**
	* PARSE_RECORDS
	*	Iterate records and call parse_record for every one
	* @return array $this->ar_parsed
	*//*
	public function parse_records($ar_records, $ar_paths, $record_key=null, $recursion=false, $from_section_tipo=null, $from_section_id=null) {

		foreach ($ar_records as $key => $record) {

			if ($recursion===false) {
				$record_key = $record->section_tipo.'_'.$record->section_id;
			}
			$this->parse_record($record, $ar_paths, $record_key, $recursion, $from_section_tipo, $from_section_id);
		}

		return $this->ar_parsed;
	}//end parse_records
	*/


	/**
	* PARSE_RECORD
	* @return array $record_parsed
	*//*
	public function parse_record($row, $ar_paths, $record_key, $recursion=false, $from_section_tipo, $from_section_id) {

		$section_id 	= $row->section_id;
		$section_tipo 	= $row->section_tipo;

		// section inject for speed
			#$datos	 = json_decode($row->datos);
			#$section = section::get_instance($section_id, $section_tipo, 'list', true);
			#$section->set_dato($datos);
			#$section->set_bl_loaded_matrix_data(true);

		// base column id on first call
		if ($recursion===false) {
			$this->ar_parsed[$record_key][] = (object)[
				'value'					=> $section_id,
				'section_id' 			=> $section_id,
				'section_tipo' 			=> $section_tipo,
				'model' 				=> 'section_id',
				'component_tipo' 		=> 'section_id',
				'from_section_id' 		=> $from_section_id,// ?? $section_id,
				'from_section_tipo' 	=> $from_section_tipo,// ?? $section_tipo,
				#'from_component_tipo' 	=> null,
				'is_root_column' 		=> true,
				'section_label' 		=> RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true)
			];

			$from_section_tipo 	= $section_tipo;
			$from_section_id 	= $section_id;
		}

		foreach ($ar_paths as $key => $item_path) {
			$current_items = $this->resolve_path($item_path, $section_tipo, $section_id, $record_key, $from_section_tipo, $from_section_id);
		}//end foreach ($this->ar_paths as $key => $item_path)


		return true;
	}//end parse_record
	*/


	/**
	* RESOLVE_PATH
	* @return
	*//*
	public function resolve_path($item_path, $section_tipo, $section_id, $record_key, $from_section_tipo, $from_section_id) {

		$components_with_relations = $this->get_indirect_components();

		$ar_items = [];
		foreach ($item_path as $path_key => $path) {

			$model 			= $path->modelo;
			$component_tipo	= $path->component_tipo;
			$lang 			= DEDALO_DATA_LANG;
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 'list',
															 $lang,
															 $path->section_tipo);

			if (in_array($model, $components_with_relations)) {

				$component_dato = $component->get_dato();
				if (!empty($component_dato)) {

					$sub_path = array_slice($item_path, $path_key+1);
					$this->parse_records($component_dato, [$sub_path], $record_key, true, $section_tipo, $section_id);
				}
				break;

			}else{
				// add
				$this->ar_parsed[$record_key][] = (object)[
					'value'					=> $component->get_valor_export(null, $lang, false, false),
					'section_id' 			=> $section_id,
					'section_tipo' 			=> $section_tipo,
					'model' 				=> $model,
					'component_tipo' 		=> $component_tipo,
					'from_section_id' 		=> $from_section_id,// ?? $section_id,
					'from_section_tipo' 	=> $from_section_tipo,// ?? $section_tipo,
					#'from_component_tipo' 	=> null,
					'is_root_column' 		=> false,
					'section_label' 		=> RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true),
					'component_label' 		=> RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true)
				];
			}
		}

		return $ar_items;
	}//end resolve_path
	*/



	/**
	* CREATE_ROWS_FROM_PARSED
	* @return array $ar_final
	*//*
	public function create_rows_from_parsed() {

		$parsed = $this->ar_parsed;
			dump($parsed, ' parsed ++ '.to_string());

		// parsed hierarchyzed
			#foreach ($parsed as $row_key => $row_items) {
			#	foreach ($row_items as $item_key => $item) {
			#
			#		$item_parent = array_reduce($row_items, function($carry, $el) use($item) {
			#			if ($el->section_tipo===$item->from_section_tipo && $el->section_id===$item->from_section_id) {
			#				return $el;
			#			}
			#			return $carry;
			#		}, false);
			#		#dump($item_found, ' item_found ++ '.to_string($item));
			#
			#		if ($item_parent!==false) {
			#			$item_parent->childrens[] = $item;
			#			unset($parsed[$row_key][$item_key]);
			#		}
			#
			#	}
			#}
			#dump($parsed, ' parsed 2 ++ '.to_string());



		$ar_final = [];
		foreach ($parsed as $row_key => $row_items) {

			$multi_row = $this->build_multi_row($row_items);
				dump($multi_row, ' multi_row ++ '.to_string());

			#$ar_final[$row_key] = $multi_row;
			$ar_final = array_merge($ar_final, $multi_row);
		}
		#dump($ar_final, ' ar_final ++ '.to_string());


		return $ar_final;
	}//end create_rows_from_parsed
	*/



	/**
	* BUILD_MULTI_ROW
	* @return array $ar_rows
	*//*
	public function build_multi_row($row_items) {

		$last_items = [];
		foreach ($row_items as $key => $current_item) {

			// search elements that they have me as parent
			$ar_item_match = array_filter($row_items, function($item) use($current_item){
				return ($item->from_section_tipo===$current_item->section_tipo
					 && $item->from_section_id===$current_item->section_id
					 //&& !empty($item->from_section_id)
				);
			});	#dump($ar_item_match, ' ar_item_match ++ '.to_string());
			if ( empty($ar_item_match) && $current_item->is_root_column!==true ) { //  || $current_item->is_root_column!==true , && empty($item->from_section_id)
				$last_items[] = $current_item;
			}
		}
		dump($last_items, ' last_items ++ '.to_string());
		$ar_rows = [];

		if (empty($last_items)) {
			// All columns are from main self section

			// normalized order and gaps by colums
			$row_normalized = [];
			foreach ($this->columns as $current_column) {

				$found = array_reduce($row_items, function($carry, $row_item) use($current_column){
					return ($row_item->component_tipo===$current_column->component_tipo &&
							$row_item->section_tipo===$current_column->section_tipo ) ? $row_item : $carry;
				}, false);
				if ($found!==false) {
					$row_normalized[] = $found;
				}else{
					$empty_item = clone $current_column;
						$empty_item->value = ' ';
					$row_normalized[] = $empty_item;
				}
			}
			$ar_rows[] = $row_normalized; // array_reverse($row);

		}else{
			// Indirect columns are found (portals, etc.)

			// remove duplycities


			#$ar_solved_keys = [];
			foreach ($last_items as $key => $current_item) {

				#$solved_key = $current_item->section_tipo.'_'.$current_item->section_id;
				#if (in_array($solved_key, $ar_solved_keys)) {
				#	continue;
				#}
				#$ar_solved_keys[] = $solved_key;

				// self
					$row = [$current_item];

				// parents
					$ar_parents = $this->recursive_parents($current_item, $row_items);
						#dump($ar_parents, ' ar_parents ++ '.to_string($current_item->component_tipo));
					foreach ($ar_parents as $key => $parent) {
						$row[] = $parent;
					}

				// others in the previous level
					#$ar_item_others = array_filter($row_items, function($item) use($current_item){
					#	return (
					#		 $item->from_section_tipo===$item->section_tipo
					#		 && $item->from_section_id===$item->section_id
					#		 && $item->is_root_column!==true
					#
					#		 //&& $item->from_section_id===$current_item->from_section_id
					#		 //&& $item->is_root_column!==true
					#	);
					#});
					#foreach ($ar_item_others as $key => $item_others) {
					#	$row[] = $item_others;
					#}

				// normalized order and gaps by colums
				$row_normalized = [];
				foreach ($this->columns as $current_column) {

					$found = array_reduce($row, function($carry, $row_item) use($current_column){
						return ($row_item->component_tipo===$current_column->component_tipo &&
								$row_item->section_tipo===$current_column->section_tipo ) ? $row_item : $carry;
					}, false);
					if ($found!==false) {
						$row_normalized[] = $found;
					}else{
						$empty_item = clone $current_column;
							$empty_item->value = ' ';
						$row_normalized[] = $empty_item;
					}
				}

				$ar_rows[] = $row_normalized; // array_reverse($row);


			}
		}

		#dump($ar_rows, ' ar_rows ++ '.to_string());
		#dump($last_items, ' last_items ++ '.to_string());

		return $ar_rows;
	}//end build_multi_row
	*/



	/**
	* RECURSIVE_PARENTS
	* @return
	*/
	public function recursive_parents($current_item, $row_items) {

		$ar_parents = [];

		$ar_parent = array_filter($row_items, function($item) use($current_item){
			return ($current_item->from_section_tipo===$item->section_tipo && $current_item->from_section_id===$item->section_id);
		});
		$parent = reset($ar_parent);

		if (!empty($parent)) {
			$ar_parents[] = $parent;
			$ar_parents   = array_merge($ar_parents, $this->recursive_parents($parent, $row_items));
		}

		return $ar_parents;
	}//end recursive_parents



	/**
	* BUILD_ROW
	* @return
	*//*
	public function build_row($row_items) {

		$row_columns = array_map(function($column){
			return clone $column;
		}, $this->columns);

		$resolve_childrens = [];
		$add_resolve = [];
		foreach ($row_columns as $k =>$column) { // current row is a row formed by menu columns

			// search match column tipo
			$ar_column_match = array_filter($row_items, function($item) use($column){
				return ($item->component_tipo===$column->component_tipo && $item->section_tipo===$column->section_tipo);
			});	#dump($ar_column_match, ' ar_found ++ '.to_string());

			$n = count($ar_column_match);
			if ($n==0) {
				$column->value = 'XXX';
			}else if ($n==1){
				$column->value = reset($ar_column_match)->value;
			}else{
				foreach ($ar_column_match as $fkey => $fvalue) {
					// search childrens
					$ar_childrens = array_filter($row_items, function($item) use($fvalue){
						return ($item->from_section_tipo===$fvalue->section_tipo && $item->from_section_id===$fvalue->section_id);
					});	#dump($ar_childrens, ' ar_childrens ++ '.to_string());
					$add_resolve = [
						reset($row_columns),
						$fvalue
					];
					array_unshift($ar_childrens, reset($row_columns), $fvalue);
					$resolve_childrens[] = $ar_childrens;
				}
			}
		}
		$this->composed_rows[] = $row_columns;

		if (!empty($resolve_childrens)) foreach ($resolve_childrens as $ar_childrens) {

			foreach ($ar_childrens as $key => $children) {
				$to_resolve = [
					reset($row_columns),
					$children
				];
				$this->build_row($to_resolve);
			}
		}


		return true;
	}//end build_row
	*/



	/**
	* PARSE_RECORDS
	* @return array $ar_columns
	*//*
	public function parse_records__OLD($ar_records, $ar_paths, $from_section_id=null, $from_section_tipo=null, $from_component_tipo=null, $parent_path=null, $root_id=null) {

		static $rows;

		$components_with_relations = component_relation_common::get_components_with_relations();
			#dump($ar_paths, ' ar_paths ++ '.to_string()); #die();

		$ar_items = [];
		foreach ($ar_records as $rkey => $row) {
			#dump($row, ' row ++ '.to_string());

			// section
				$section_id 	= $row->section_id;
				$section_tipo 	= $row->section_tipo;
				$datos 			= json_decode($row->datos);

				$section = section::get_instance($section_id, $section_tipo, 'list', true);
				$section->set_dato($datos);
				$section->set_bl_loaded_matrix_data(true);

				$root_id = $from_section_tipo.'_'.$from_section_id;

			// base column id
				if (empty($parent_path)) {
				$ar_items[] = (object)[
					'root_id' 				=> $root_id,
					'model' 				=> 'section_id',
					'component_tipo' 		=> 'section_id',
					'section_tipo' 			=> $section_tipo,
					'section_id' 			=> $section_id,
					'from_section_id' 		=> $from_section_id,
					'from_section_tipo' 	=> $from_section_tipo,
					'from_component_tipo' 	=> $from_component_tipo,
					'section_label' 		=> RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true),
					'value'					=> $section_id
					#'x' => $component_tipo . ' ' . RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true),
					#'y' => $from_section_tipo . '_' . $from_section_id . '_' . $path->section_tipo . '_' . $section_id,
					#'current_path' => json_encode($parent_path)
				];
				}
				#dump($ar_paths, ' ar_paths ++ '.to_string());

			// components
				foreach ($ar_paths as $pkey => $current_path) {
					#dump($current_path, ' current_path ++ '." $section_tipo - $section_id");

					// path_lock (store untouched copy of current path)
						$current_path_lock = [];
						foreach ($current_path as $lock_value) {
							$current_path_lock[] = $lock_value;
						}

					foreach ($current_path as $pkey => $path) {

						$model 			= $path->modelo;
						$component_tipo	= $path->component_tipo;
						$modo 			= 'list';
						$lang 			= DEDALO_DATA_LANG;

						$component 		= component_common::get_instance($model,
																		 $component_tipo,
																		 $section_id,
																		 $modo,
																		 $lang,
																		 $path->section_tipo);

						if (in_array($model, $components_with_relations)) {

							$component_dato = $component->get_dato();
							if (!empty($component_dato)) {

								#$ar_group = [];
								#foreach ($component_dato as $locator) {
								#	$crow = $this->resolve_row_deep($locator, $current_path, $ar_group);
								#		#dump($crow, ' crow ++ '.to_string($locator));
								#}
								#dump($ar_group, ' ar_group ++ '.to_string());
								#continue 2; // skip other elements of path

								$ar_section_id = array_map(function($element){
									return $element->section_id;
								}, (array)$component_dato);

								$ar_target_section_tipo = $component->get_ar_target_section_tipo();
								$target_section_tipo 	= reset($ar_target_section_tipo);
									#dump($ar_section_id, ' ar_section_id ++ '.to_string($path->section_tipo)." - $component_tipo - ".$target_section_tipo);

								// search_query_object
									$search_query_object = json_decode('{
									  "id": "temp",
									  "section_tipo": ["'.$target_section_tipo.'"],
									  "offset": 0,
									  "filter": {
									    "$or": [
									      {
									        "q": "'.implode(',', $ar_section_id).'",
									        "q_operator": null,
									        "path": [
									          {
									            "section_tipo": "'.$target_section_tipo.'",
									            "component_tipo": "component_section_id",
									            "modelo": "component_section_id",
									            "name": "ID"
									          }
									        ]
									      }
									    ]
									  }
									}');
								// Order . Below 1000 locators
									if (count($component_dato)<=1000) {
										$order_values = array_map(function($locator){
											return (int)$locator->section_id;
										}, $component_dato);
										$item = new stdClass();
											$item->column_name 	 = 'section_id';
											$item->column_values = $order_values;
										$search_query_object->order_custom = [$item];
									}
								#dump($search_query_object, ' search_query_object ++ '.to_string());
								$search_develoment2  = new search_development2($search_query_object);
								$rows_data 		 	 = $search_develoment2->search();
								$current_ar_records  = $rows_data->ar_records;
								#	dump($current_ar_records, ' current_ar_records ++ '.to_string());

								$sub_path = array_slice($current_path, $pkey+1);
									#dump($sub_path, ' output ++ '.to_string());

								#foreach ($ar_section_id as $ar_section_id_value) {
								#	// column id
								#	$ar_items[] = (object)[
								#		'model' 				=> 'section_id',
								#		'component_tipo' 		=> $component_tipo,
								#		'section_tipo' 			=> $section_tipo,
								#		'section_id' 			=> $section_id,
								#		'from_section_id' 		=> $section_id,
								#		'from_section_tipo' 	=> $section_tipo,
								#		'from_component_tipo' 	=> $from_component_tipo,
								#		'section_label' 		=> RecordObj_dd::get_termino_by_tipo($target_section_tipo, DEDALO_DATA_LANG, true, true),
								#		'value'					=> $ar_section_id_value,
								#		'EXTRA' 				=> 'XXXXXXX'
								#		#'x' => $component_tipo . ' ' . RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true),
								#		#'y' => $from_section_tipo . '_' . $from_section_id . '_' . $path->section_tipo . '_' . $section_id,
								#		#'current_path' => json_encode($parent_path)
								#	];
								#}


								$current_ar_items = $this->parse_records($current_ar_records, [$sub_path], $section_id, $section_tipo, $component_tipo, $current_path_lock, $root_id);
								$ar_items = array_merge($ar_items, $current_ar_items);

							}//end if (!empty($ar_section_id))

							continue 2; // skip other elements of path

						}else{

							$value = $component->get_valor_export(null, $lang, false, false); // $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id
							#$value = $component->get_valor($lang);
								#dump($value, ' value ++ '.to_string());

							$ar_items[] = (object)[
								'root_id' 				=> $root_id,
								'model' 				=> $model,
								'component_tipo' 		=> $component_tipo,
								'section_tipo' 			=> $path->section_tipo,
								'section_id' 			=> $section_id,
								'from_section_id' 		=> $from_section_id ?? $section_id,
								'from_section_tipo' 	=> $from_section_tipo ?? $section_tipo,
								'from_component_tipo' 	=> $from_component_tipo,
								'section_label' 		=> RecordObj_dd::get_termino_by_tipo($path->section_tipo, DEDALO_DATA_LANG, true, true),
								'value'					=> $value
								#'x' => $component_tipo . ' ' . RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true),
								#'y' => $from_section_tipo . '_' . $from_section_id . '_' . $path->section_tipo . '_' . $section_id,
								#'current_path' => json_encode($parent_path)
							];
						}

					}//end foreach ($current_path as $pkey => $path)

				}//end foreach ($ar_paths as $current_path)

		}//end foreach ($ar_records as $rkey => $row)
		#dump($ar_items, ' ar_columns ++ '.to_string());


		return $ar_items;
	}//end parse_records
	*/



	/**
	* RESOLVE_ROW_DEEP
	* @return
	*//*
	public function resolve_row_deep($locator, $path, &$ar_group=[]) {

		$ar_items = [];

		#dump($locator, ' locator ++ '.to_string());
		#dump($path, ' path ++ '.to_string($locator));

		$section_id 	= $locator->section_id;
		$section_tipo 	= $locator->section_tipo;

		$components_with_relations = component_relation_common::get_components_with_relations();

		foreach ($path as $pkey => $path_item) {

			if($pkey===0) {
				continue;
			}

			$model 			= $path_item->modelo;
			$component_tipo	= $path_item->component_tipo;
			$modo 			= 'list';
			$lang 			= DEDALO_DATA_LANG;
			$component 		= component_common::get_instance($model,
															 $component_tipo,
															 $section_id,
															 $modo,
															 $lang,
															 $path_item->section_tipo);

			if (in_array($model, $components_with_relations)) {

				$sub_dato = $component->get_dato();
				foreach ($sub_dato as $sub_locator) {
					$sub_path = array_slice($path, $pkey);
					$ar_items = array_merge($ar_items, $this->resolve_row_deep($sub_locator, $sub_path));
					#$ar_items = $this->resolve_row_deep($sub_locator, $sub_path, $ar_group);
					#break;
					#$ar_group[] = $ar_items;
				}

			}else{

				$value = $component->get_valor_export(null, $lang, false, false);
				$ar_items[] = (object)[
					'model' 				=> $model,
					'component_tipo' 		=> $component_tipo,
					'section_tipo' 			=> $path_item->section_tipo,
					'section_id' 			=> $section_id,
					'from_section_id' 		=> $from_section_id ?? $section_id,
					'from_section_tipo' 	=> $from_section_tipo ?? $section_tipo,
					'from_component_tipo' 	=> $path[$pkey-1]->component_tipo ?? null,
					'section_label' 		=> RecordObj_dd::get_termino_by_tipo($path_item->section_tipo, DEDALO_DATA_LANG, true, true),
					'value'					=> $value
					#'x' => $component_tipo . ' ' . RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true),
					#'y' => $from_section_tipo . '_' . $from_section_id . '_' . $path_item->section_tipo . '_' . $section_id,
					#'current_path' => json_encode($parent_path)
				];
			}
			break;
		}
		$ar_group[] = $ar_items;

		return $ar_items;
	}//end resolve_row_deep
	*/



	/**
	* PARSE_RECORDS
	* @return array $ar_columns
	*//*
	public function parse_records($ar_records, $ar_paths, $from_section_id=null, $from_section_tipo=null, $from_component_tipo=null, $parent_path=null, $i=1) {

		$components_with_relations = component_relation_common::get_components_with_relations();
			#dump($ar_paths, ' ar_paths ++ '.to_string()); #die();

		$ar_items = [];
		foreach ($ar_records as $rkey => $row) {
			#dump($row, ' row ++ '.to_string());

			// section
				$section_id 	= $row->section_id;
				$section_tipo 	= $row->section_tipo;
				$datos 			= json_decode($row->datos);

				$section = section::get_instance($section_id, $section_tipo, 'list', true);
				$section->set_dato($datos);
				$section->set_bl_loaded_matrix_data(true);

			// base column id
				if (empty($parent_path)) {
				$ar_items[] = (object)[
					'i' 					=> $i,
					'model' 				=> 'section_id',
					'component_tipo' 		=> 'section_id',
					'section_tipo' 			=> $section_tipo,
					'section_id' 			=> $section_id,
					'from_section_id' 		=> $from_section_id,
					'from_section_tipo' 	=> $from_section_tipo,
					'from_component_tipo' 	=> $from_component_tipo,
					'section_label' 		=> RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true),
					'value'					=> $section_id
					#'x' => $component_tipo . ' ' . RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true),
					#'y' => $from_section_tipo . '_' . $from_section_id . '_' . $path->section_tipo . '_' . $section_id,
					#'current_path' => json_encode($parent_path)
				];
				}
				#dump($ar_paths, ' ar_paths ++ '.to_string());

			// components
				foreach ($ar_paths as $pkey => $current_path) {
					#dump($current_path, ' current_path ++ '." $section_tipo - $section_id");

					// path_lock (store untouched copy of current path)
						$current_path_lock = [];
						foreach ($current_path as $lock_value) {
							$current_path_lock[] = $lock_value;
						}

					foreach ($current_path as $pkey => $path) {

						$model 			= $path->modelo;
						$component_tipo	= $path->component_tipo;
						$modo 			= 'list';
						$lang 			= DEDALO_DATA_LANG;

						$component 		= component_common::get_instance($model,
																		 $component_tipo,
																		 $section_id,
																		 $modo,
																		 $lang,
																		 $path->section_tipo);

						if (in_array($model, $components_with_relations)) {

							$component_dato = $component->get_dato();
							if (!empty($component_dato)) {

								$ar_section_id = array_map(function($element){
									return $element->section_id;
								}, (array)$component_dato);

								$ar_target_section_tipo = $component->get_ar_target_section_tipo();
								$target_section_tipo 	= reset($ar_target_section_tipo);
									#dump($ar_section_id, ' ar_section_id ++ '.to_string($path->section_tipo)." - $component_tipo - ".$target_section_tipo);

								// search_query_object
									$search_query_object = json_decode('{
									  "id": "temp",
									  "section_tipo": ["'.$target_section_tipo.'"],
									  "offset": 0,
									  "filter": {
									    "$or": [
									      {
									        "q": "'.implode(',', $ar_section_id).'",
									        "q_operator": null,
									        "path": [
									          {
									            "section_tipo": "'.$target_section_tipo.'",
									            "component_tipo": "component_section_id",
									            "modelo": "component_section_id",
									            "name": "ID"
									          }
									        ]
									      }
									    ]
									  }
									}');
								// Order . Below 1000 locators
									if (count($component_dato)<=1000) {
										$order_values = array_map(function($locator){
											return (int)$locator->section_id;
										}, $component_dato);
										$item = new stdClass();
											$item->column_name 	 = 'section_id';
											$item->column_values = $order_values;
										$search_query_object->order_custom = [$item];
									}
								#dump($search_query_object, ' search_query_object ++ '.to_string());
								$search_develoment2  = new search_development2($search_query_object);
								$rows_data 		 	 = $search_develoment2->search();
								$current_ar_records  = $rows_data->ar_records;
								#	dump($current_ar_records, ' current_ar_records ++ '.to_string());

								$sub_path = array_slice($current_path, $pkey+1);
									#dump($sub_path, ' output ++ '.to_string());

								#foreach ($ar_section_id as $ar_section_id_value) {
								#	// column id
								#	$ar_items[] = (object)[
								#		'model' 				=> 'section_id',
								#		'component_tipo' 		=> $component_tipo,
								#		'section_tipo' 			=> $section_tipo,
								#		'section_id' 			=> $section_id,
								#		'from_section_id' 		=> $section_id,
								#		'from_section_tipo' 	=> $section_tipo,
								#		'from_component_tipo' 	=> $from_component_tipo,
								#		'section_label' 		=> RecordObj_dd::get_termino_by_tipo($target_section_tipo, DEDALO_DATA_LANG, true, true),
								#		'value'					=> $ar_section_id_value,
								#		'EXTRA' 				=> 'XXXXXXX'
								#		#'x' => $component_tipo . ' ' . RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true),
								#		#'y' => $from_section_tipo . '_' . $from_section_id . '_' . $path->section_tipo . '_' . $section_id,
								#		#'current_path' => json_encode($parent_path)
								#	];
								#}

								$current_ar_items = $this->parse_records($current_ar_records, [$sub_path], $section_id, $section_tipo, $component_tipo, $current_path_lock, $i);
								$ar_items = array_merge($ar_items, $current_ar_items);

							}//end if (!empty($ar_section_id))

							continue 2; // skip other elements of path

						}else{

							$value = $component->get_valor_export(null, $lang, false, false); // $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id
							#$value = $component->get_valor($lang);
								#dump($value, ' value ++ '.to_string());

							$ar_items[] = (object)[
								'i' 					=> $i,
								'model' 				=> $model,
								'component_tipo' 		=> $component_tipo,
								'section_tipo' 			=> $path->section_tipo,
								'section_id' 			=> $section_id,
								'from_section_id' 		=> $from_section_id ?? $section_id,
								'from_section_tipo' 	=> $from_section_tipo ?? $section_tipo,
								'from_component_tipo' 	=> $from_component_tipo,
								'section_label' 		=> RecordObj_dd::get_termino_by_tipo($path->section_tipo, DEDALO_DATA_LANG, true, true),
								'value'					=> $value
								#'x' => $component_tipo . ' ' . RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_DATA_LANG, true, true),
								#'y' => $from_section_tipo . '_' . $from_section_id . '_' . $path->section_tipo . '_' . $section_id,
								#'current_path' => json_encode($parent_path)
							];
						}
						$i++;
					}//end foreach ($current_path as $pkey => $path)

				}//end foreach ($ar_paths as $current_path)

		}//end foreach ($ar_records as $rkey => $row)
		#dump($ar_items, ' ar_columns ++ '.to_string());


		return $ar_items;
	}//end parse_records
	*/



	/**
	* CREATE_ROWS
	* @return array $rows
	*//*
	public function create_rows($parsed, $records, $columns) {

		$rows = [];
		foreach ($records as $row_object) {

			$section_tipo 	= $row_object->section_tipo;
			$section_id 	= $row_object->section_id;

			// first level
			$multi_row = array_merge($rows, self::create_multi_row($section_tipo, $section_id, $parsed, $columns));
			#$multi_row = self::create_multi_row([], $section_tipo, $section_id, $parsed, $columns);
			#	dump($multi_row, ' multi_row ++ '." $section_tipo - $section_id ");

			foreach ($multi_row as $row) {
				$rows[] = $row;
			}
		}//end foreach ($records as $row_object)
		#dump($rows, ' rows ++ '.to_string());

		return $rows;
	}//end create_rows
	*/


	/*
	public static function create_multi_row_DES($row=[], $section_tipo, $section_id, $parsed, $columns) {

		static $final_rows = [];

		$row = [];
		foreach ($columns as $column_key => $column_item) {

			#$ckey = $column_item->section_tipo.'_'.$column_item->component_tipo;

			$ar_found_in_parsed = array_filter($parsed, function($item) use($section_tipo, $section_id, $column_item){
				return (   $item->component_tipo===$column_item->component_tipo
						&& $item->section_tipo===$column_item->section_tipo
						//&& $item->section_id===$section_id
					);
			});
			#dump($ar_found_in_parsed, ' ar_found_in_parsed ++ '.to_string());
			if (empty($ar_found_in_parsed)) {
				$empty_item = clone $column_item;
					$empty_item->value = 'XXX';
				$row[] = $empty_item;
			}else{
				$i=0; foreach ($ar_found_in_parsed as $fkey => $fvalue) {
					if ($i===0) {
						$row[] = $fvalue;
						unset($parsed[$fkey]);
					}else{
						#$final_rows = array_merge($final_rows, self::create_multi_row([], $section_tipo, $section_id, $parsed, $columns));
						self::create_multi_row([], $section_tipo, $section_id, $parsed, $columns);
					}
					$i++;
				}
				#$row[] = reset($ar_found_in_parsed);
			}

			#foreach ($ar_found_in_parsed as $fkey => $f_item) {
			#	$rows = array_merge($rows, self::create_row($f_item, $parsed, $columns));
			#}

		}
		$final_rows[] = $row;

		#dump($final_rows, ' final_rows ++ '.to_string());

		return $final_rows;
	}//end create_multi_row
	*/



	/**
	* CREATE_ROW
	* @return
	*//*
	public static function create_row($f_item, $parsed, $columns) {

		// check my childrens
		$ar_childrens_found_in_parsed = array_filter($parsed, function($citem) use($f_item){
			return (	$citem->from_section_tipo===$f_item->section_tipo
					&& 	$citem->from_section_id===$f_item->section_id
					//&& 	$f_item->component_tipo!=='section_id'
				);
		});

		$row = [];
		foreach ($columns as $column_key => $column_item) {

			if ($column_item->section_tipo===$f_item->section_tipo && 	$column_item->component_tipo===$f_item->component_tipo) {

				$row[] = $f_item; // section_id column

			}else{

				foreach ($ar_childrens_found_in_parsed as $fkey => $fvalue) {
					$row[] = self::create_row($fvalue, $parsed, $columns);
				}
			}
		}
		dump($row, ' row ++ '.to_string());

		return $row;
	}//end create_row
	*/



	/**
	* CREATE_MULTI_ROW
	* Recursive function to obtain a full row with all columns resolved
	* Builds a representation of current resolved record with all related values (portals, etc.)
	* If more than one value is found, additional rows are created
	* @param string $section_tipo
	*	Current db record section_tipo
	* @param int $section_id
	*	Current db record estion_id
	* @param array $parsed
	*	Array of objects (resolved values of requested components)
	* @param array $columns
	*	Array of objects containing all mandatory columns for the row
	* @param object | bool false $reference_row
	*	Reference row for give previous column values when no value is found in additional rows iterations
	*
	* @return array $row_multi
	* For columns without value, we will try to use values from previous rows of this record
	*//*
	public static function create_multi_row($section_tipo, $section_id, $parsed, $columns, $reference_row=false) {

		$row 			 = [];
		$additional_rows = [];
		foreach ($columns as $column_key => $column_item) {

			// Search data for this row in whole parsed values
				$ar_found_in_parsed = array_filter($parsed, function($item) use($section_tipo, $section_id, $column_item){
					return ($item->component_tipo===$column_item->component_tipo &&
							$item->section_tipo===$column_item->section_tipo);
				});

			$total = count($ar_found_in_parsed);
			if ($total===0) {
				// no resolved items found
				if ($reference_row && isset($reference_row[$column_key]) ) {
					$row[] = $reference_row[$column_key]; // copy value from same column in previous row
				}else{
					$empty_item = clone $column_item; // create a minimal emty object from column info
						$empty_item->value = null;
					$row[] = $empty_item;
				}
			}else{
				// one or more items found
				foreach ($ar_found_in_parsed as $fkey => $fvalue) {
					$row[] = $fvalue;

					// check my childrens
					$ar_childrens_found_in_parsed = array_filter($parsed, function($citem) use($fvalue){
						return ($citem->from_section_tipo===$fvalue->section_tipo &&
								$citem->from_section_id===$fvalue->section_id);
					});
					#dump($ar_childrens_found_in_parsed, ' ar_childrens_found_in_parsed ++ '.to_string());
					#if (empty($ar_childrens_found_in_parsed)) {
						// remove already resolved item from parsed
						unset($parsed[$fkey]);
					#}
					break; // only first element by row
				}

				// additional data generate additional_rows (note var $parsed is reduced in each iteration, removing already used items)
				if ($total>1) {
					$additional_rows = self::create_multi_row($section_tipo, $section_id, $parsed, $columns, $row);
				}
			}
		}

		// row_multi . Build final result with one or more rows
		$row_multi = [];
		if (empty($additional_rows)) {
			$row_multi[] = $row;
		}else{
			$row_multi[] = $row;
			foreach ($additional_rows as $current_row) {
				$row_multi[] = $current_row;
			}
		}

		return $row_multi;
	}//end create_multi_row
	*/



	/**
	* BUILD_FILE
	* @return string $export_string
	*	CSV strig with columns data seppared by ';' and rows data by '\n'
	*/
	public function build_file($columns, $rows) {

		$delimiter		= tool_export::$delimiter; // Normally ';'
		$line_breaker	= PHP_EOL;

		$export_string = '';

		$this->data_format = $this->data_format ?? 'standard';

		// header row
			$ar_cells = array_map(function($item){

				$column_name = $item->name;

				// remove the html tags
					$column_name = strip_tags($column_name);

				// normalize_quotes
					$column_name = self::normalize_quotes($column_name);

				// safe_cell_string
					$column_name = self::safe_cell_string($column_name);

				return $column_name;
			}, $columns);
			// main id column
			//array_unshift($ar_cells, self::safe_cell_string('oh1'));
			$export_string .= implode($delimiter, $ar_cells) . $line_breaker;

		// data rows
			foreach ($rows as $key => $row) {
				$ar_cells = array_map(function($item){

					$current_value = $item->value;

					// safe_cell_string
						$current_value = self::safe_cell_string($item->value);

					// remove html in standard mode (after safe_cell_string is made)
						if ($this->data_format==='standard') {
							$current_value = strip_tags($current_value);
						}

					return $current_value;
				}, $row);
				$export_string .= implode($delimiter, $ar_cells) . $line_breaker;
			}
			#dump($export_string, ' export_string ++ '.to_string());

		return $export_string;
	}//end build_file




	/**
	* EXPORT_TO
	* @return string $export_str_data
	*/
	public function export_to( $format, $ar_records=null, $encoding='UTF-8', $section_tipo) {

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
			$ar_records_deep_resolved[$section_id] = $this->deep_resolve_row($row);
		}
		#dump($ar_records_deep_resolved, ' $ar_records_deep_resolved ++ '.to_string());
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
											$h_item->component_tipo 	  = $item->component_tipo;
											$h_item->section_tipo   	  = $item->section_tipo;
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
								}

							}
						}else{
							$column_name = $current_tipo;

							// from_section label
								if ($h_item->from_section_tipo!==$h_item->section_tipo) {
									$column_name = RecordObj_dd::get_termino_by_tipo($h_item->section_tipo, DEDALO_DATA_LANG, true, true) . $internal_separator . $column_name;
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
								$current_value = reset($ar_found)->value;
							}else{
								$current_value = ' ';
							}

							// breakdown
								if ($breakdown===true) {

									// prepare array with iteration keys
										$current_value = is_array($current_value) ? $current_value : array($current_value);
										foreach ($current_value as $value_key => $cvvalue) {
											$ar_columns_keys[] = [
												'header_key' => $h_key,
												'header_tipo'=> $h_item->component_tipo,
												'value_key'  => $value_key,
												'value' 	 => $cvvalue
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
									$ar_group = tool_export::group_by($ar_columns_keys, 'value_key');
									foreach ($ar_group as $_ar_items) {

										$ar_cells = [];
										foreach ($header_tipos as $h_key => $h_item) {

											$ar_found = array_filter($_ar_items, function($element) use($h_item){
												return $element['header_tipo']===$h_item->component_tipo;
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

			if ($key==='id' || $key==='section_tipo') continue;
			if ($key==='section_id') {
				if($this->data_format==='dedalo') {
					#$row_deep_resolved[$key] = $quotes.$value.$quotes;
					$current_value = $value;
					$row_item = new stdClass();
						$row_item->component_tipo		= $component_tipo;
						$row_item->section_tipo 		= $section_tipo;
						$row_item->from_component_tipo	= $component_tipo;
						$row_item->from_section_tipo 	= $section_tipo;
						$row_item->value 				= $current_value;

					$row_deep_resolved[] = $row_item;
				}
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
			if($this->data_format==='dedalo') {

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
			}else{

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
																												  $from_section_tipo=$section_tipo,
																												  $from_component_tipo=$component_tipo,
																												  $valor_export,
																												  false));
						#dump($row_deep_resolved, ' row_deep_resolved ++ '.$modelo_name.' '.to_string($component_tipo));
					}
			}


		}//end foreach ($record as $component_tipo => $value) {
		#dump($row_deep_resolved, ' row_deep_resolved ++++++++++++++++ '.to_string());

		return (array)$row_deep_resolved;
	}//end deep_resolve_row



	/**
	* RECURSIVE_VALUE_RESOLVE
	* @return array $ar_values
	*/
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
							return $element->component_tipo===$item->component_tipo && $element->from_section_tipo===$item->from_section_tipo && $element->from_component_tipo===$item->from_component_tipo;
						});
						if (!empty($ar_found)) {

							// Update existing object value mixed with new
								$found_obj 			= reset($ar_found);
								#$current_value 	= $found_obj->value . $internal_separator . self::format_valor_csv_export_string($item->value);
								$current_value 		= is_array($found_obj->value) ? $found_obj->value : array($found_obj->value);
								$current_value[] 	= self::format_valor_csv_export_string($item->value);
								$found_obj->value 	= $current_value;

						}else{

							// create new and add
								$current_value 	= tool_export::format_valor_csv_export_string($item->value); // $item->value;
								$row_item = new stdClass();
									$row_item->component_tipo		= $item->component_tipo;
									$row_item->section_tipo 		= $item->section_tipo;
									$row_item->from_section_tipo 	= $item->from_section_tipo;
									$row_item->from_component_tipo 	= $item->from_component_tipo;
									$row_item->value 				= $current_value;

								$ar_values[] = $row_item;
						}
				}

			}//end foreach ($valor_export as $item)

		}else{

			// vertical format
				$ar_found = array_filter($ar_values, function($element) use($component_tipo, $from_section_tipo, $from_component_tipo){
					return $element->component_tipo===$component_tipo && $element->from_section_tipo===$from_section_tipo && $element->from_component_tipo===$from_component_tipo;
				});
				if (!empty($ar_found)) {

					// Update existing object value mixed with new
						$found_obj 			= reset($ar_found);
						#$current_value 	= $found_obj->value . $internal_separator . self::format_valor_csv_export_string($valor_export);
						$current_value 		= is_array($found_obj->value) ? $found_obj->value : array($found_obj->value);
						$current_value[] 	= self::format_valor_csv_export_string($valor_export);
						$found_obj->value 	= $current_value;

				}else{

					// create new and add
						$current_value 	= tool_export::format_valor_csv_export_string($valor_export); // $valor_export;
						$row_item = new stdClass();
							$row_item->component_tipo		= $component_tipo;
							$row_item->section_tipo 		= $section_tipo;
							$row_item->from_section_tipo	= $from_section_tipo;
							$row_item->from_component_tipo 	= $from_component_tipo;
							$row_item->value 				= $current_value;

						$ar_values[] = $row_item;
				}
		}
		#dump($ar_values, ' ar_values ++ '.to_string($component_tipo));


		return $ar_values;
	}//end recursive_value_resolve



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
	*//*
	public static function get_ar_columns($section_tipo, $from_component_tipo=false, $include_info_fields=false) {

		$ar_modelo_name_required = array('component');
		#$with_childrens 		 = component_relation_common::get_components_with_relations();
		$with_childrens 		 = [
			'component_autocomplete',
			#'component_autocomplete_hi',
			'component_check_box',
			#'component_filter',
			#'component_filter_master',
			'component_portal',
			#'component_publication',
			'component_radio_button',
			#'component_relation_children',
			#'component_relation_index',
			#'component_relation_model',
			#'component_relation_parent',
			#'component_relation_related',
			#'component_relation_struct',
			'component_select',
			#'component_select_lang'
		];

		$ar_elements = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true);
			#dump($ar_elements, ' $ar_elements ++ '.to_string($section_tipo));

		$ar_columns=array();
		foreach ($ar_elements as $key => $current_tipo) {

			$model 			= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			$have_childrens = in_array($model, $with_childrens);
			if ($have_childrens===true) {
				$ar_target_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, 'section', 'termino_relacionado', true);
				$target_section_tipo 	= reset($ar_target_section_tipo);
				if (!empty($target_section_tipo)) {
					$target_section_label = RecordObj_dd::get_termino_by_tipo($target_section_tipo, DEDALO_DATA_LANG, true, true);
				}
			}

			$ar_columns[] = (object)[
				'tipo' 					=> $current_tipo,
				'section_tipo' 			=> $section_tipo,
				'section_label' 		=> RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true),
				'model' 				=> $model,
				'from_component_tipo' 	=> $from_component_tipo,
				'have_childrens'		=> $have_childrens,
				'target_section_tipo'	=> $target_section_tipo ?? false,
				'target_section_label'	=> $target_section_label ?? false,
				'label' 				=> RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_DATA_LANG, true, true)
			];
		}

		// aditional section info fields. dd196
			if ($include_info_fields===true) {

				$parent_tipo 	= DEDALO_SECTION_INFO_SECTION_GROUP;
				$RecordObj_dd 	= new RecordObj_dd($parent_tipo);
				$childrens 		= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($parent_tipo, 'component_', 'children', $search_exact=false);
				foreach ($childrens as $current_tipo) {

					$model = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);

					$ar_columns[] = (object)[
						'tipo' 					=> $current_tipo,
						'section_tipo' 			=> $section_tipo,
						'section_label' 		=> RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true),
						'model' 				=> $model,
						'from_component_tipo' 	=> $from_component_tipo,
						'have_childrens'		=> false,
						'label' 				=> RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_DATA_LANG, true, true)
					];
				}
			}

		#dump($ar_columns, ' ar_columns ++ '.to_string());

		return $ar_columns;
	}//end get_ar_columns
	*/



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
