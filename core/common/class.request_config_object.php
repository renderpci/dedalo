<?php
/**
* REQUEST_CONFIG_OBJECT
* Defines an object with normalized properties and checks

	// STRUCTURE
		api_engine	: engine for manage the request. Default is 'dedalo' but could be external like 'zenon'
		type 		: type of the requests, string that the components can use to define his own requests and modifiers. by default will be 'main'
		sqo			: search query object active width DDBB
		show		: layout_map and sqo_config
			(it will create the search and choose, when these objects are not sended)
		search	: layout_map and sqo_config
			(it modify the show and it will create the choose, when these object is not sended)
		choose	: layout_map
			(it modify search)

	// REQUEST_CONFIG SAMPLE (request configuration for Dédalo API or others API):
		[
			{
				"api_engine" : "dedalo",
				"type"		:"main",
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
										"name": "Usable in indexing",
										"modelo": "component_radio_button",
										"section_tipo": "hierarchy20",
										"component_tipo": "hierarchy24"
									}
								],
								"q":
									{
										"type": "dd151",
										"section_id": "2",
										"section_tipo": "dd64",
										"from_component_tipo": "hierarchy24"
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
							"source" : "component_dato",
							"value" : [{
								"q" : {"value":"numisdata36"},
								"q_operator" : null
							}],
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
					[{"section_tipo":"self","tipo":"numisdata309","mode":"list"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list"}]
				]},
				"choose":{
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



	/**
	* __CONSTRUCT
	* @param object $data = null
	*/
	public function __construct( ?object $data=null ) {

		if (is_null($data)) {
			return;
		}

		// set all data properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}
	}//end __construct



	/**
	* SET_API_ENGINE
	*/
	public function set_api_engine(string $value) {

		$this->api_engine = $value;
	}//end set_api_engine



	/**
	* SET_TYPE
	*/
	public function set_type(string $value) {

		$this->type = $value;
	}//end set_type



	/**
	* SET_SQO
	*/
	public function set_sqo(object $value) {

		$this->sqo = $value;
	}//end set_sqo



	/**
	* SET_SHOW
	*/
	public function set_show(object $value) {

		$this->show = $value;
	}//end set_show



	/**
	* SET_SEARCH
	*/
	public function set_search(object $value) {

		$this->search = $value;
	}//end set_search



	/**
	* SET_CHOOSE
	*/
	public function set_choose(object $value) {

		$this->choose = $value;
	}//end set_choose



	/**
	* GET METHODS
	* By accessors. When property exits, return property value, else return null
	*/
	// final public function __call(string $strFunction, $arArguments) {

	// 	$strMethodType		= substr($strFunction, 0, 4); # like set or get_
	// 	$strMethodMember	= substr($strFunction, 4);
	// 	switch($strMethodType) {
	// 		#case 'set_' :
	// 		#	if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
	// 		#	return($this->SetAccessor($strMethodMember, $arArguments[0]));
	// 		#	break;
	// 		case 'get_' :
	// 			return($this->GetAccessor($strMethodMember));
	// 			break;
	// 	}
	// 	return(false);
	// }
	// private function GetAccessor(string $variable) {
	// 	if(property_exists($this, $variable)) {
	// 		return (string)$this->$variable;
	// 	}else{
	// 		return false;
	// 	}
	// }
	final public function __get($name) {

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



}//end request_config_object
