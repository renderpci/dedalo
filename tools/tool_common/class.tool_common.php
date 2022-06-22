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
	public function __construct($section_id, string $section_tipo) {

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
	* @return object $json
	*/
	public function get_json(object $request_options=null) : object {

		// options parse
			$options = new stdClass();
				$options->get_context	= true;
				$options->get_data		= true;
				if($request_options!==null) foreach($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

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
	* Parse a tool context
	* @return dd_object $dd_object
	*/
	public function get_context() : dd_object {

		// check valid name
			if ($this->name==='tool_common') {
				throw new Exception("Error. Tool name is wrong. Check your tool call using toll model", 1);
			}

		// tool name. Fixed on construct
			$name = $this->name;

		// component dato simple_tool_obj (dd1353)
			$component_tipo			= tools_register::$simple_tool_obj_component_tipo;
			$model					= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$simple_tool_component	= component_common::get_instance(
				$model,
				$component_tipo,
				$this->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$this->section_tipo
			);
			$simple_tool_obj_dato	= $simple_tool_component->get_dato();
			$tool_object			= reset($simple_tool_obj_dato);

		// $name = $tool_object->name;

		// label. (JSON list) Try match current lang else use the first lang value
			$tool_label = array_find($tool_object->label, function($el){
				return $el->lang===DEDALO_DATA_LANG;
			})->value ?? reset($tool_object->label)->value;

		// description. (text_area) Try match current lang else use the first lang value
			$description = array_find((array)$tool_object->description, function($el){
				return $el->lang===DEDALO_DATA_LANG;
			})->value[0] ?? reset($tool_object->description)->value[0];

		// labels. take care of empty objects like '{}'
			$labels = [];
			if(!empty($tool_object->labels) && !empty((array)$tool_object->labels)) {

				// add label with lang fallback
				foreach ($tool_object->labels as $key => $current_label_value) {

					$label_name = $current_label_value->name;
					if(!isset($labels[$label_name])) {

						$all_langs_label = array_filter((array)$tool_object->labels, function($el) use($label_name) {
							return $el->name===$label_name;
						});
						foreach ($all_langs_label as $item) {
							if ($item->lang===DEDALO_DATA_LANG) {
								$labels[$label_name] = $item;
								continue 2;
							}
						}

						// fallback lang. Get the first one as fallback value setting as lang current lang
						$fallback_label = reset($all_langs_label);
						$fallback_label->lang = DEDALO_DATA_LANG; // inject current lang to prevent find errors
						$labels[$label_name] = $fallback_label;
					}
				}

				// remove keys
				$labels = array_values($labels);
			}

		// properties
			$properties = empty($tool_object->properties)
				? null
				: $tool_object->properties; // object|array

		// config. Add if exists config data for current tool
			$ar_config		= tools_register::get_all_config_tool_client();
			$config_data	= array_find($ar_config, function($el) use($name) {
				return $el->name===$name;
			});

		// lang
			$lang = DEDALO_DATA_LANG;

		// css
			$css = (object)[
				'url' => DEDALO_TOOLS_URL . '/' . $name . '/css/' .$name. '.css'
			];

		// icon
			$icon = DEDALO_TOOLS_URL . '/' . $name . '/img/icon.svg';

		// context
			$dd_object = new dd_object((object)[
				'name'				=> $name,
				'label'				=> $tool_label,
				'tipo'				=> $component_tipo,
				'section_tipo'		=> $tool_object->section_tipo,
				'section_id'		=> $tool_object->section_id,
				'model'				=> $name,
				'lang'				=> $lang,
				'mode'				=> 'edit',
				'properties'		=> $properties,
				'css'				=> $css,
				'icon'				=> $icon,
				'labels'			=> $labels,
				'description'		=> $description,
				'show_in_inspector'	=> $tool_object->show_in_inspector ?? null,
				'show_in_component'	=> $tool_object->show_in_component ?? null,
				'config'			=> !empty($config_data) ? $config_data->config : null
			]);


		return $dd_object;
	}//end get_context



	/**
	* CREATE_TOOL_SIMPLE_CONTEXT
	* Parse a tool context from a simple_tool_object
	* @param object $tool_object (simple_tool_object from tool record JSON component dd1353)
	* @param object $tool_config (from properties)
	* @return dd_object $tool_simple_context
	*/
	public static function create_tool_simple_context(object $tool_object, object $tool_config=null, string $tipo=null, string $section_tipo=null) : dd_object {

		// old way. (!) Unification with context in progress..
			// label. (JSON list) Try match current lang else use the first lang value
				$tool_label = array_find($tool_object->label, function($el){
					return $el->lang===DEDALO_DATA_LANG;
				})->value ?? reset($tool_object->label)->value;

			// description. (text_area) Try match current lang else use the first lang value
				$description = array_find((array)$tool_object->description, function($el){
					return $el->lang===DEDALO_DATA_LANG;
				})->value[0] ?? reset($tool_object->description)->value[0];

			// css
				$css = (object)[
					'url' => DEDALO_TOOLS_URL . '/' . $tool_object->name . '/css/' .$tool_object->name. '.css'
				];

			// icon
				$icon = DEDALO_TOOLS_URL . '/' . $tool_object->name . '/img/icon.svg';

			// context
				$tool_simple_context = new dd_object((object)[
					'name'					=> $tool_object->name,
					'label'					=> $tool_label,
					// 'tipo'				=> $component_tipo,
					'section_tipo'			=> $tool_object->section_tipo,
					'section_id'			=> $tool_object->section_id,
					'model'					=> $tool_object->name,
					// 'lang'				=> $lang,
					'mode'					=> 'edit',
					'properties'			=> $tool_object->properties,
					'css'					=> $css,
					'icon'					=> $icon,
					// 'labels'				=> $labels,
					// 'description'		=> $description,
					// 'show_in_inspector'	=> $tool_object->show_in_inspector ?? null,
					'show_in_component'		=> $tool_object->show_in_component ?? null,
					// 'config'				=> !empty($config_data) ? $config_data->config : null
				]);

		// new way. (!) Unification with context in progress..
			// // short vars
			// 	$section_id		= $tool_object->section_id;
			// 	$section_tipo	= $tool_object->section_tipo;
			// 	$model			= $tool_object->name;

			// // tool construct and get JSON context
			// 	$element = new $model($section_id, $section_tipo);
			// 	// element JSON
			// 	$get_json_options = new stdClass();
			// 		$get_json_options->get_context	= true;
			// 		$get_json_options->get_data		= false;
			// 	$element_json = $element->get_json($get_json_options);
			// 	$context = $element_json->context;

			// // tool_simple_context
			// 	$tool_simple_context = $context;
			// 		// dump($tool_simple_context, ' ++ ============================== tool_simple_context ++ '.to_string($section_tipo.'-'.$section_id));
			// 		// dump($context, ' ++ ============================== context ++ '.to_string($section_tipo.'-'.$section_id));


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
							// set translatable to true or false
							$el->translatable = RecordObj_dd::get_translatable($el->tipo);

							$el->label = RecordObj_dd::get_termino_by_tipo($el->tipo, DEDALO_APPLICATION_LANG, true, true);

							return $el;
						}, $tool_config->ddo_map);
					}

				// set parsed tool_config
					$tool_simple_context->tool_config = $tool_config;
			}//end if (!empty($tool_config))



		return $tool_simple_context;
	}//end create_tool_simple_context



	/**
	* GET_REGISTERED_TOOLS
	* Get the full or filtered list data of current registered tools in database
	*
	* @param array $ar_tools
	* 	If defined, is used as filter list for tool names
	* @return array $registered_tools
	*/
	public static function get_client_registered_tools(array $ar_tools=null) : array {

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

					// fix cache static
					$client_registered_tools_records = $result->ar_records;
			}
		// get all tools config sections
			$ar_config = tools_register::get_all_config_tool_client();

		// get the simple_tool_object
			foreach ($client_registered_tools_records as $record) {

				$section		= section::get_instance($record->section_id, $record->section_tipo);
				$section_dato	= $record->datos;
				$section->set_dato($section_dato);
				$section->set_bl_loaded_matrix_data(true);

				$component_tipo	= 'dd1353';
				$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
				$component		= component_common::get_instance(
					$model,
					$component_tipo,
					$record->section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$record->section_tipo
				);
				$dato = $component->get_dato();
				if (empty($dato)) {
					debug_log(__METHOD__." Ignored empty dato of  $record->section_tipo - $component_tipo - $record->section_id ".to_string($model), logger::WARNING);
					continue;
				}

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
	public static function get_config(string $tool_name) : ?object {

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
	public static function read_files(string $dir, array $valid_extensions=['csv']) : array {

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
	* Reads given csv file as array of data.
	* Note that expected encoding is UTF-8 and
	* the locale settings are taken into account by php fgetcsv function.
	* If LC_CTYPE is e.g. en_US.UTF-8, files in one-byte encodings may be read wrongly by fgetcsv.
	* When file encoding is different from UTF-8, a conversion try will be made.
	* @param string $file
	* @param bool $skip_header
	* @param string $csv_delimiter
	* @param string $enclosure
	* @param string $escape
	*
	* @return array $csv_array
	* 	An empty array is returned when something wrong happens, like when the file doesn't exist
	*/
	public static function read_csv_file_as_array(string $file, bool $skip_header=false, string $csv_delimiter=';', string $enclosure='"', string $escape='"') : array {

		// file not found case
			if(!file_exists($file)) {
				debug_log(__METHOD__." File not found ".to_string($file), logger::ERROR);
				return [];
			}

		// auto_detect_line_endings
			$is_php81 = (version_compare(PHP_VERSION, '8.1.0') >= 0);
			if (!$is_php81) {
				ini_set('auto_detect_line_endings', true);
			}

		// open file in read mode
			$f = fopen($file, "r");

		// read contents line by line and store data
			$csv_array			= array();
			$convert_to_utf8	= false;
			$i=0;
			while (($line = fgetcsv($f, 0, $csv_delimiter, $enclosure, $escape)) !== false) {

				// skip header case
					if ($skip_header && $i===0) {
						$i++;
						continue;
					}

				// safe array type
					if (!is_array($line)) {
						$line = [$line];
					}

				// encoding check . Only UFT-8 is valid. Another encodings will be conteverted to UTF-8
					// $sample = reset($line);
					$sample = is_array($line) ? implode(', ', $line) : (string)$line;
					if ($convert_to_utf8===true || !mb_check_encoding($sample, 'UTF-8')) {
						foreach ($line as $key => $current_value) {
							$line[$key] = utf8_encode($current_value);
						}
						$convert_to_utf8 = true; // prevent to check more than once
					}

				// iterate line cells (columns from split text line by $csv_delimiter)
					foreach ($line as $cell) {
						$csv_array[$i][] = trim($cell);
					}

				$i++;
			}//end while

		// close file a end
			fclose($f);

		// auto_detect_line_endings
			if (!$is_php81) {
				ini_set('auto_detect_line_endings', false);
			}


		return $csv_array;
	}//end read_csv_file_as_array



	/**
	* CALL_COMPONENT_METHOD
	* Call component method
	* @param object $request_options
	* @return object $response
	*/
	public static function call_component_method(object $request_options) : object {

		// Working here... (!)

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$$options = new stdClass();
				$options->component_tipo	= null;
				$options->section_id		= null;
				$options->section_tipo		= null;
				$options->method			= null;
				$options->method_arguments	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$tipo				= $options->tipo;
			$section_tipo		= $options->section_tipo;
			$section_id			= $options->section_id;
			$method				= $options->method;
			$method_arguments	= $options->method_arguments;

		// component
			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance($model,
														 $tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
			if (method_exists($component, $method)) {

				// call component
					$call_result = $component->{$method}($method_arguments);

				// response
					$result = isset($call_result->result)
						? $call_result->result
						: $call_result;
					$response->msg = isset($call_result->msg)
						? $call_result->msg
						: 'Request done ['.__FUNCTION__.']';

			}else{

				// response error
					$response->result	= false;
					$response->msg		.= '. Method does not exists: '.$method .' in '.$model;
			}


		return $response;
	}//end call_component_method



	/**
	* GET_USER_TOOLS
	* Get filtered user authorized tools
	* (Filtered by profiles security_tools data)
	* @param int $user_id
	* @return array $user_tools
	*/
	public static function get_user_tools(int $user_id) : array {

		$user_tools = [];

		// empty or zero user case
			if (empty($user_id)) {
				return $user_tools;
			}

		// all unfiltered tools
			$registered_tools = tool_common::get_client_registered_tools();

		// user_tools
			if ($user_id==DEDALO_SUPERUSER) {

				$user_tools = $registered_tools;
			}else{

				// tool permissions (DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO)
					$security_tools_dato = (function() use($user_id) {

						$user_profile = security::get_user_profile($user_id);
						if (empty($user_profile)) {
							return $user_tools; // empty array
						}
						$user_profile_id		= (int)$user_profile->section_id;
						$security_tools_model	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO, true);
						$component	= component_common::get_instance(
							$security_tools_model,
							DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO,
							$user_profile_id,
							'list',
							DEDALO_DATA_NOLAN,
							DEDALO_SECTION_PROFILES_TIPO
						);
						// dato
						return $component->get_dato();
					})();

				// allowed tools
					$ar_allowed_id = array_map(function($el){
						return $el->section_id;
					}, $security_tools_dato);

				// filter user authorized tools
					foreach ($registered_tools as $tool) {
						if(in_array($tool->section_id, $ar_allowed_id)) {
							$user_tools[] = $tool;
						}
					}
			}


		return $user_tools;
	}//end get_user_tools



}//end class tool_common
