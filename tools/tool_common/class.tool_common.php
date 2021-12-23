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
		$simple_tool_obj_dato 	= $simple_tool_component->get_dato();
		$tool_object 			= reset($simple_tool_obj_dato);

		// label. (JSON list) Try match current lang else use the first lang value
			$tool_label = array_find($tool_object->label, function($el){
				return $el->lang===DEDALO_DATA_LANG;
			})->value ?? reset($tool_object->label)->value;

		// description. (text_area) Try match current lang else use the first lang value
			$description = array_find((array)$tool_object->description, function($el){
				return $el->lang===DEDALO_DATA_LANG;
			})->value[0] ?? reset($tool_object->description)->value[0];

		// context
			$context = new stdClass();
				$context->section_id			= $tool_object->section_id;
				$context->section_tipo			= $tool_object->section_tipo;
				$context->model					= $tool_object->name;
				$context->name					= $tool_object->name;
				$context->mode					= 'edit';
				$context->label					= $tool_label;
				$context->description			= $description;
				$context->icon					= DEDALO_TOOLS_URL . '/' . $tool_object->name . '/img/icon.svg';
				$context->show_in_inspector		= $tool_object->show_in_inspector ?? null;
				$context->show_in_component		= $tool_object->show_in_component ?? null;
				$context->config				= $tool_object->config ?? null;
				$context->properties 			= $tool_object->properties ?? null;

		return $context;
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

		// get all tools config sections
			$ar_config = tools_register::get_all_config_tool_client();

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

		$search = search::get_instance($sqo_tool_active);
		$result = $search->search();
		// get the simple_tool_object
		foreach ($result->ar_records as $record) {

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
		}//end foreach ($result->ar_records as $record)


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



}//end class tool_common
