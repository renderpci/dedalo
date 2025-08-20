<?php declare(strict_types=1);
/*
* REQUEST_CONFIG_OBJECT
* Defines an object with normalized properties and checks

	// STRUCTURE
		api_engine	: engine for manage the request. Default is 'dedalo' but could be external like 'zenon'
		type 		: type of the requests, string that the components can use to define his own requests and modifiers. by default will be 'main'
		sqo			: search query object active width DDBB
		show		: layout_map and sqo_config
			(it will create the search and choose, when these objects are not sent)
		search	: layout_map and sqo_config
			(it modify the show and it will create the choose, when these object is not sent)
		choose	: layout_map
			(it modify search)
		hide	: layout_map
			(component to resolve to use as internal use data)

	// REQUEST_CONFIG SAMPLE (request configuration for Dédalo API or others API):
		[
			{
				"api_engine" : "dedalo",
				"type" :"main",
				"sqo" : {
					"section_tipo" : [
						{"source" : "hierarchy_types", "value": [2]},
						{"source" : "section", "value":["on1"]},
						{"source" : "self"}
					],
					"filter_by_list" : [
						{"section_tipo": "numisdata3", "component_tipo":"numisdata309"}
					],
					"fixed_filter" : [
						{
							"source" : "fixed_dato",
							"value" : [
							{
								"path": [
									{
										"name"				: "Usable in indexing",
										"model"				: "component_radio_button",
										"section_tipo"		: "hierarchy20",
										"component_tipo"	: "hierarchy24"
									}
								],
								"q":
									{
										"type"					: "dd151",
										"section_id"			: "2",
										"section_tipo"			: "dd64",
										"from_component_tipo"	: "hierarchy24"
									},
									2,
									"abc"
									}
								,
								"q_operator": null
							}]
							,"operator":"$and"
						},
						{
							"source" : "component_data",
							"value" : [
                                {
                                    "q": "rsc423", // the component to get data, it should to be the last component into ddo chain
                                    "path": [
                                        {
                                            "name": "Id",
                                            "model": "component_section_id",
                                            "section_tipo": "rsc420",
                                            "component_tipo": "rsc414"
                                        }
                                    ],
                                    "ddo_map": [
                                        {
                                            "tipo": "numisdata1379",
                                            "parent": "self",
                                            "section_tipo": "numisdata1374"
                                        },
                                        {
                                            "tipo": "rsc423",
                                            "parent": "numisdata1379",
                                            "section_tipo": "rsc197"
                                        }
                                    ],
                                    "q_operator": null,
                                    "search_section_id": true
                                }
                            ],
							"operator" : "$or"
						},
						{
							"source" : "hierarchy_terms",
							"value" : [
								{"section_tipo":"on1","section_id":"2705", "recursive":true},
								{"section_tipo":"on1","section_id":"2748","recursive":true}
							],
							"operator":"$or"
						}
					],
					"filter_by_locators": [{locator},{locator}]
				},
				"show":{
					"get_ddo_map": {
						"model": "section_map",
						"columns": [
							[
								"thesaurus",
								"term"
							]
						]
					},
					"ddo_map":[
						{"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": false},
						{"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3","fields_separator" : " | "}, {"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"},
						{"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3","value_with_parents": true}
					],

					"fields_separator" : " | ",
					"records_separator" : "<br>",
					"sqo_config": {
						 "operator": "$or",
						 "limit" : 5
					}
				},
				"search":{
					"ddo_map": [
						{"section_tipo":"self","tipo":"numisdata309","mode":"list"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list"}
				]},
				"choose":{
					"ddo_map":[
						{"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": true},
						{"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"}
						{"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3"}
				]},
				"hide":{
					"ddo_map":[
						{"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": true},
						{"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"}
						{"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3"}
				]},
			},
			{
				"api_engine": "zenon_engine",
				"sqo" : {
					"section_tipo": [{"source":"section", "value":["zenon1"]}]
				},
				"show": {
					"ddo_map": [
						{"section_tipo":"zenon1","tipo":"zenon3", "parent": "zenon1"},
						{"section_tipo":"zenon1","tipo":"zenon4", "parent": "zenon1"},
						{"section_tipo":"zenon1","tipo":"zenon5", "parent": "zenon1"},
						{"section_tipo":"zenon1","tipo":"zenon6", "parent": "zenon1"}
					]
				}
			}
		]

*/
class request_config_object extends stdClass {



	/**
	* VARS
	*/
		// $api_engine; // string like 'dedalo'. Default 'dedalo'
		public $api_engine;
		// string $type . (main*|secondary)
		public $type;
		// $sqo; // object search_query_object
		public $sqo;
		// $show; // object. config of elements to show (ddo_map, sqo_config..)
		public $show;
		// $search; // object. config of elements to show in search mode
		public $search;
		// $choose; // object. config of elements to show in choose mode
		public $choose;
		// api_config object|null
		public $api_config;



	/**
	* __CONSTRUCT
	* @param object|null $data = null
	*/
	public function __construct( ?object $data=null ) {

		if (is_null($data)) {
			return;
		}

		// set all data properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				if (!method_exists($this, $method)) {
					debug_log(__METHOD__
						. " Ignored non existing method " . PHP_EOL
						. ' method: ' . to_string($method)
						, logger::ERROR
					);
					continue;
				}
				$this->{$method}($value);
			}
	}//end __construct



	/**
	* SET_API_ENGINE
	* @param string $value
	* @return void
	*/
	public function set_api_engine(string $value) {

		$this->api_engine = $value;
	}//end set_api_engine



	/**
	* SET_TYPE
	* @param string $value
	* @return void
	*/
	public function set_type(string $value) {

		$this->type = $value;
	}//end set_type



	/**
	* SET_SQO
	* @param object $value
	* @return void
	*/
	public function set_sqo(object $value) {

		$this->sqo = $value;
	}//end set_sqo



	/**
	* SET_SHOW
	* @param object $value
	* @return void
	*/
	public function set_show(object $value) {

		$this->show = $value;
	}//end set_show



	/**
	* SET_SEARCH
	* @param object $value
	* @return void
	*/
	public function set_search(object $value) {

		$this->search = $value;
	}//end set_search



	/**
	* SET_CHOOSE
	* @param object $value
	* @return void
	*/
	public function set_choose(object $value) {

		$this->choose = $value;
	}//end set_choose


	/**
	* SET_HIDE
	* @param object $value
	* @return void
	*/
	public function set_hide(object $value) {

		$this->hide = $value;
	}//end set_hide



	/**
	* SET_API_CONFIG
	* @param object|null $value
	* @return void
	*/
	public function set_api_config(object|null $value) {

		$this->api_config = $value;
	}//end set_api_config



	/**
	* PARSE_REQUEST_CONFIG_ITEM
	* Parses normalized request_config objects resolving 'self' vars
	* and adding label, model, etc. to complete usable ddo_map elements.
	* Used frequently to parse Layout map user presets.
	* Based on common->get_ar_request_config method ddo_map parser for view, search, chose and hide
	* @see request_config_presets::get_all_request_config()
	* @return object $parsed_request_config
	* @working
	*/
	public static function parse_request_config_item( object $request_config_object, string $section_tipo) : object {

		// TODO: implement this method to atomize the big common->get_ar_request_config method
		// Working on
		throw new Error('This method is not implement yet');

		// clone deeply to preserve the original object
		$parsed_request_config = json_decode( json_encode($request_config_object) );

		// resolve self vars
		$ar_ddo_self_list = ['show','hide','search','choose'];
		foreach ($ar_ddo_self_list as $ddo_name) {
			$ddo_map = $parsed_request_config->{$ddo_name}->ddo_map ?? null;
			if ($ddo_map) {

				$final_ddo_map = [];

				foreach ($ddo_map as $current_ddo) {

					// check mandatory tipo
						if (!isset($current_ddo->tipo)) {
							debug_log(__METHOD__
								.' ERROR. Ignored current_ddo: don\'t have tipo: '
								.' section_tipo: ' . to_string($section_tipo) . PHP_EOL
								.' current_ddo: ' . to_string($current_ddo) . PHP_EOL
								.' ddo_map type: ' . gettype($ddo_map) . PHP_EOL
								.' ddo_map: ' . json_encode($ddo_map, JSON_PRETTY_PRINT)
								, logger::ERROR
							);
							continue;
						}

					// check valid tipo (The model is unsolvable)
						$tipo_is_valid = ontology_node::check_tipo_is_valid( $current_ddo->tipo );
						if ( $tipo_is_valid === false ) {
							debug_log(__METHOD__
								.' WARNING. Ignored current_ddo: is invalid '
								.' current_ddo->tipo: ' . to_string($current_ddo->tipo) . PHP_EOL
								.' current_ddo: ' . to_string($current_ddo) . PHP_EOL
								.' ddo_map type: ' . gettype($ddo_map) . PHP_EOL
								.' ddo_map: ' . json_encode($ddo_map, JSON_PRETTY_PRINT) . PHP_EOL
								.' section_tipo: ' . $section_tipo . PHP_EOL
								.' current_model: ' . ontology_node::get_modelo_name_by_tipo($current_ddo->tipo)
								, logger::WARNING
							);
							continue;
						}

					// check if the ddo is active into the ontology
						$is_active = ontology_node::check_active_tld($current_ddo->tipo);
						if( $is_active === false ){
							debug_log(__METHOD__
								. " Removed ddo from ddo_map->show definition because the tld is not installed " . PHP_EOL
								. to_string($current_ddo)
								, logger::WARNING
							);
							continue;
						}

					// model. Calculated always to prevent errors
						$current_ddo->model = ontology_node::get_modelo_name_by_tipo($current_ddo->tipo, true);

					// label. Add to all ddo_map items
						if (!isset($current_ddo->label)) {
							$current_ddo->label = ontology_node::get_termino_by_tipo($current_ddo->tipo, DEDALO_APPLICATION_LANG, true, true);
						}

					// section_tipo. Set the default "self" value to the current section_tipo (the section_tipo of the parent)
						if (isset($current_ddo->section_tipo) && $current_ddo->section_tipo==='self') {
							$current_ddo->section_tipo = $section_tipo;
						}

					// parent. Set the default "self" value to the current tipo (the parent)
						if (isset($current_ddo->parent) && $current_ddo->parent==='self') {
							$current_ddo->parent = $section_tipo;
						}

					// fixed_mode. When the mode is set in properties or is set by tool or user templates
					// set the fixed_mode to true, to preserve the mode across changes in render process
						if( isset($current_ddo->mode) ) {
							$current_ddo->fixed_mode = true;
						}

					// permissions check
						if($current_ddo->model==='section') {
							$check_section_tipo = is_array($current_ddo->section_tipo) ? reset($current_ddo->section_tipo) : $current_ddo->section_tipo;
							$permissions = common::get_permissions($check_section_tipo, $current_ddo->tipo);
							if($permissions<1){
								continue;
							}
						}

					$final_ddo_map[] = $current_ddo;
				}

				// update current ddo_map ('show','hide','search','choose')
				$parsed_request_config->{$ddo_name}->ddo_map = $final_ddo_map;
			}
		}


		return $parsed_request_config;
	}//end parse_request_config_item



	/**
	* GET METHODS
	* By accessors. When property exits, return property value, else return null
	* @param string $name
	*/
	final public function __get(string $name) {

		if (isset($this->$name)) {
			return $this->$name;
		}

		$trace = debug_backtrace();
		debug_log(
			__METHOD__
			.' Undefined property via __get(): '.$name .
			' in ' . $trace[0]['file'] .
			' on line ' . $trace[0]['line'],
			logger::DEBUG);
		return null;
	}
	// final public function __set($name, $value) {
	// 	$this->$name = $value;
	// }



}//end request_config_object
