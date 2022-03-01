<?php
/*
* CLASS TOOL_COMMON
* Add basic methods for general use in tools
*
*/
class tool_common {



	public $name;
	public $config;



	/**
	* __CONSTRUCT
	* @return bool true
	*/
	public function __construct($section_id, $section_tipo) {

		// set tool name as class name
		$this->name = get_called_class();

		//set
		$this->section_tipo	= $section_tipo;
		$this->section_id	= $section_id;

		return true;
	}//end __construct



	/**
	* GET_JSON
	* @param object $request_options
	* 	Optional. Default is false
	* @return array $json
	*	Array of objects with data and context (configurable)
	*/
	public function get_json($request_options=false) {

		// options parse
			$options = new stdClass();
				$options->get_context	= true;
				$options->get_data		= true;
				if($request_options!==false) foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// new way
			$json = new stdClass();
				if (true===$options->get_context) {
					$json->context = $this->get_context();
				}
				if (true===$options->get_data) {
					$json->data = $this->get_data();
				}

		return $json;
	}//end get_json



	/**
	* GET_CONTEXT
	* Parse a tool context from a simple_tool_object
	* @param object $tool_object (simple_tool_object from tool record JSON component dd1353)
	* @param object $tool_config (from properties)
	* @return object $tool_simple_context
	*/
	public function get_context() {

		$component_tipo				= tools_register::$simple_tool_obj_component_tipo;

		$model						= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$simple_tool_component		= component_common::get_instance($model,
														 $component_tipo,
														 $this->section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $this->section_tipo);
		$simple_tool_obj_dato	= $simple_tool_component->get_dato();
		$tool_object			= reset($simple_tool_obj_dato);

		// label. (JSON list) Try match current lang else use the first lang value
			$tool_label = array_find($tool_object->label, function($el){
				return $el->lang===DEDALO_DATA_LANG;
			})->value ?? reset($tool_object->label)->value;

		// description. (text_area) Try match current lang else use the first lang value
			$description = array_find((array)$tool_object->description, function($el){
				return $el->lang===DEDALO_DATA_LANG;
			})->value[0] ?? reset($tool_object->description)->value[0];

		// context
			// $context = new stdClass();
			// 	$context->section_id			= $tool_object->section_id;
			// 	$context->section_tipo			= $tool_object->section_tipo;
			// 	$context->model					= $tool_object->name;
			// 	$context->name					= $tool_object->name;
			// 	$context->mode					= 'edit';
			// 	$context->label					= $tool_label;
			// 	$context->description			= $description;
			// 	$context->icon					= DEDALO_TOOLS_URL . '/' . $tool_object->name . '/img/icon.svg';
			// 	$context->show_in_inspector		= $tool_object->show_in_inspector ?? null;
			// 	$context->show_in_component		= $tool_object->show_in_component ?? null;
			// 	$context->config				= $tool_object->config ?? null;
			// 	$context->properties 			= $tool_object->properties ?? null;

			$dd_object = new dd_object((object)[
				'label'				=> $tool_label, // *
				'tipo'				=> $component_tipo,
				'section_tipo'		=> $tool_object->section_tipo, // *
				'model'				=> $tool_object->name, // *
				// 'parent'			=> $parent, // *
				// 'parent_grouper'	=> $parent_grouper,
				// 'lang'			=> $lang,
				'mode'				=> 'edit',
				// 'translatable'	=> $translatable,
				'properties'		=> $tool_object->properties ?? null,
				// 'css'			=> $css,
				// 'permissions'	=> $permissions,
				// 'tools'			=> $tools,
				// 'buttons'		=> $buttons,
				// 'request_config'	=> $request_config,
				// 'columns_map'	=> $columns_map
				'section_id'		=> $tool_object->section_id,
				'name'				=> $tool_object->name,
				'description'		=> $description,
				'icon'				=> DEDALO_TOOLS_URL . '/' . $tool_object->name . '/img/icon.svg',
				'show_in_inspector'	=> $tool_object->show_in_inspector ?? null,
				'show_in_component'	=> $tool_object->show_in_component ?? null,
				'config'			=> $tool_object->config ?? null
			]);


		return $dd_object;
	}//end get_context



	/**
	* CREATE_TOOL_SIMPLE_CONTEXT
	* Parse a tool context from a simple_tool_object
	* @param object $tool_object (simple_tool_object from tool record JSON component dd1353)
	* @param object $tool_config (from properties)
	* @return object $tool_simple_context
	*/
	public static function create_tool_simple_context($tool_object, $tool_config=null, $tipo=null, $section_tipo=null) {

		// label. (JSON list) Try match current lang else use the first lang value
			$tool_label = array_find($tool_object->label, function($el){
				return $el->lang===DEDALO_DATA_LANG;
			})->value ?? reset($tool_object->label)->value;

		// description. (text_area) Try match current lang else use the first lang value
			$description = array_find((array)$tool_object->description, function($el){
				return $el->lang===DEDALO_DATA_LANG;
			})->value[0] ?? reset($tool_object->description)->value[0];

		// context
			$tool_simple_context = new stdClass();
				$tool_simple_context->section_id			= $tool_object->section_id;
				$tool_simple_context->section_tipo			= $tool_object->section_tipo;
				$tool_simple_context->model					= $tool_object->name;
				$tool_simple_context->name					= $tool_object->name;
				$tool_simple_context->mode					= 'edit';
				$tool_simple_context->label					= $tool_label;
				// $tool_simple_context->tool_labels			= $tool_object->labels;
				// $tool_simple_context->description			= $description;
				$tool_simple_context->icon					= DEDALO_TOOLS_URL . '/' . $tool_object->name . '/img/icon.svg';
				// $tool_simple_context->show_in_inspector	= $tool_object->show_in_inspector;
				$tool_simple_context->show_in_component	= $tool_object->show_in_component;
				// $tool_simple_context->config				= $tool_object->config;

		// tool_config add
			if (!empty($tool_config)) {

				// parse and resolve ddo_map self
					if (isset($tool_config->ddo_map)) {
						$tool_config->ddo_map = array_map(function($el) use($tipo, $section_tipo){
							if ($el->tipo==='self') {
								$el->tipo = $tipo;
							}
							if ($el->section_tipo==='self') {
								$el->section_tipo = $section_tipo;
							}
							if (!isset($el->model)) {
								$el->model = RecordObj_dd::get_modelo_name_by_tipo($el->tipo,true);
							}

							$el->label = RecordObj_dd::get_termino_by_tipo($el->tipo, DEDALO_APPLICATION_LANG, true, true);

							return $el;
						}, $tool_config->ddo_map);
					}

				// set parsed tool_config
					$tool_simple_context->tool_config = $tool_config;
			}//end if (!empty($tool_config))
			// dump($tool_simple_context, ' tool_simple_context ++ '.to_string());

		return $tool_simple_context;
	}//end create_tool_simple_context



	/**
	* GET_REGISTERED_TOOLS
	* @return array $registered_tools
	*/
	public static function get_client_registered_tools($ar_tools=null) {

		$registered_tools = [];

		// if(isset($_SESSION['dedalo']['registered_tools'])) {
		// 	return $_SESSION['dedalo']['registered_tools'];
		// } this

		// client_registered_tools_records
			static $client_registered_tools_records;
			if(!isset($client_registered_tools_records)) {

				// get all active and registered tools
					$sqo_tool_active = json_decode('{
						"section_tipo": "dd1324",
						"limit": 0,
						"filter": {
							"$and": [
								{
									"q": {"section_id":"1","section_tipo":"dd64","type":"dd151","from_component_tipo":"dd1354"},
									"q_operator": null,
									"path": [
										{
											"section_tipo": "dd1324",
											"component_tipo": "dd1354",
											"modelo": "component_radio_button",
											"name": "Active"
										}
									]
								}
							]
						},
						"full_count": false
					}');
					$search	= search::get_instance($sqo_tool_active);
					$result	= $search->search();

					// fix cache
					$client_registered_tools_records = $result->ar_records;
			}
		// get all tools config sections
			$ar_config = tools_register::get_all_config_tool_client();

		// get the simple_tool_object
			foreach ($client_registered_tools_records as $record) {

				$section 		= section::get_instance($record->section_id, $record->section_tipo);
				$section_dato 	= $record->datos;
				$section->set_dato($section_dato);
				$section->set_bl_loaded_matrix_data(true);

				$component_tipo	= 'dd1353';
				$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component		= component_common::get_instance($model,
																 $component_tipo,
																 $record->section_id,
																 'list',
																 DEDALO_DATA_NOLAN,
																 $record->section_tipo);
				$dato = $component->get_dato();
				$current_value = reset($dato);
				if(isset($ar_tools) && !in_array($current_value->name, $ar_tools)){
					continue;
				}

				// append config
					$current_config = array_filter($ar_config, function($item) use($current_value){
						if($item->name === $current_value->name) {
							return $item;
						}
					});
					$current_value->config = !empty($current_config[0])
						? $current_config[0]->config
						: null;

				$registered_tools[] = $current_value;
			}//end foreach ($client_registered_tools_records as $record)


		// $_SESSION['dedalo']['registered_tools'] = $registered_tools;
		// write_session_value('registered_tools', $registered_tools);


		return $registered_tools;
	}//end get_client_registered_tools



	/**
	* GET_CONFIG
	* Get all tools and filter them matching tool_name given
	* @return object | null
	*/
	public static function get_config(string $tool_name) {

		// get all tools config sections
			$ar_config = tools_register::get_all_config_tool();

		// select current from all tool config
			$config = array_find($ar_config, function($el) use($tool_name) {
				return $el->name===$tool_name;
			});


		return $config;
	}//end get_config



	/**
	* READ_FILES
	* Read files from directory and return all files array filtered by extension
	* @return array $ar_data
	*/
	public static function read_files($dir, $valid_extensions=['csv']) {

		$ar_data = array();

		// scan dir
			try {
				$root = scandir($dir);
			} catch (Exception $e) {
				debug_log(__METHOD__." Error on read dir ".to_string($dir), logger::ERROR);
				//return($e);
			}

		// error on read the dir or empty result
			if (!$root) {
				return $ar_data; // empty array
			}

		// sort files in natural order
			natsort($root);

		// iterate and get only files. Skip others
			foreach($root as $value) {

				// Skip non valid extensions
					$file_parts = pathinfo($value);
					if(!isset($file_parts['extension']) || !in_array(strtolower($file_parts['extension']), $valid_extensions)) {
						debug_log(__METHOD__." Skipped file: $value", logger::DEBUG);
						continue;
					}

				// Case file
					if(is_file("$dir/$value")) {
						$ar_data[] = $value;
					}

				// Case dir recursive ($recursive=true)
					// if($recursive) foreach(self::find_all_files("$dir/$value", $recursive) as $value) {
					// 	$ar_data[] = $value;
					// }
			}

		# SORT ARRAY (By custom core function build_sorter)
		#usort($ar_data, build_sorter('numero_recurso'));
		#dump($ar_data,'$ar_data');

		return $ar_data;
	}//end read_files



	/**
	* READ_CSV_FILE_AS_ARRAY
	* Open give CSV file and read contents line by line.
	* Return an array with all data
	* @param string $file
	* 	Full file path
	* @param bool $skip_header
	* @param string $csv_delimiter
	* @param string $enclosure
	* @param string $escape
	*
	* @return array $csv_array | bool false
	*/
	public static function read_csv_file_as_array($file, $skip_header=false, $csv_delimiter=';', $enclosure='"', $escape='"') {

		// file do not exists cases
			if(!file_exists($file)) {
				debug_log(__METHOD__." File not found ".to_string($file), logger::ERROR);
				return false;
			}

		// open file in read mode
			$f = fopen($file, 'r');

		// read contents line by line and store data
			$csv_array=[];
			$i=0; while (($line = fgetcsv($f, 0, $csv_delimiter, $enclosure, $escape)) !== false) { //, $enclosure

				if ($skip_header && $i===0) {
					$i++;
					continue;
				}

				foreach ($line as $cell) {
					$csv_array[$i][] = trim($cell);
				}
				$i++;
			}

		// close file a end
		fclose($f);


		return $csv_array;
	}//end read_csv_file_as_array



}//end class tool_common
