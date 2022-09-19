<?php
/**
* REQUEST QUERY OBJECT (RQO)
* Defines an object with normalized properties and checks


	// STRUCTURE
		dd_api	: API class that will be used
		action	: API method that will be used (like 'get_menu')
		source	: component, section, menu, etc that made the call
			action	: API method that will be used with the source
		sqo		: search query object active width DDBB
		show	: layout_map and sqo_config
			(it will create the search and choose, when these objects are not sended)
		search	: layout_map and sqo_config
			(it modify the show and it will create the choose, when these object is not sended)
		choose	: layout_map
			(it modify search) List of elements for choose (service_autocomplete)
		data	: object
			(object used like pre-calculated container (datalist, pagination, etc.) to minimize cpu usage on calls to 'save')
		prevent_lock : bool
			(prevent PHP lock the session while the request is working. For example in 'count' calls)

		// info about
			Mandatory	: dd_api, action, source
			Optional	: sqo, show, search, choose

			If you only send a source, the server will create the basic sqo and will get the layout map from user preset or generic layout from ontoloy.


	// DD_REQUEST format
		[
			{

				"dd_api"		: string // the API class to use,
				"action"		: string // the API method to use
				"source"		: {
					"action"		: string || object || array // the API method modifier to use
					"model"			: string // model of the ddo
					"tipo"			: string // tipo of the ddo
					"section_tipo"	: string // section_tipo of the ddo
					"section_id"	: string || int || null // section_id of the ddo
					"mode"			: string (edit || list || search || ...), mode of the ddo
					"lang"			: string // lang of the ddo
					"value"			: array (optional) [{locator}] || ["text"] || [""] // value of the component to resolve, used by portal in search mode
				},
				"sqo"			: {
					// all sqo definition in search_query_object class
				}
				"show"			: {
					"get_ddo_map" 	:
						{
							// if isset this property ddo_map will be calculated. The value is the model of the ontology term to get the ddo_map, such as "section_map", different sections can define a component or multiple component to build common search and common columns (mint, type, es1, fr1, etc)
							model : string // the ontology model to get the information
							path : array // the path of properties into the object to get the information (stored into properties)

						}
					"ddo_map"		: array [{ddo}, {ddo}] // layout map will be used, with specific path, the ddo are linked by parent to create the path
					"sqo_config"	: {
						// specific sqo configuration for the show
					}
					"interface"		:{
						"button_tree" : true || false // control of the input interface button tree
						"button_external" : true || false // control of the refresh button when the data of the portal is external
					}
				},
				"search"		: {
					"ddo_map"		: array [array {ddo}, {ddo}] // layout map will be used, with specific path
					"sqo_config"	: {
						// specific sqo configuration for the search
				},
				"choose"		: {
					"ddo_map"		: array [array {ddo}, {ddo}] // layout map will be used, with specific path
				}
			}
		]


	// REQUEST_CONFIG (request configuration for Dédalo API or others API):
		[
			{
				"api_engine" : "dedalo",
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
								"f_path" : ["numisdata3","numisdata27"],
								"q":
									{
									"value" : ["{\"section_id\":\"2\",\"section_tipo\":\"dd64\",\"type\":\"dd151\",\"from_component_tipo\":\"hierarchy24\"}",
									2,"abc"]
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
					"separator_rows" : "<br>",
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
				"search_engine": "zenon_engine",
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
class request_query_object {



	/**
	* VARS
	*/
		// mandatory
			// string dd_api. name of the API manager ()
			public $dd_api;
			public $action;
			public $source;

		// optional (disabled to prevent null values)
			// object sqo
				// public $sqo;
			// object show
				// public $show;
			// object search
				// public $search;
			// object choose
				// public $choose;
			// object data
				// public $data;
			// bool prevent_lock
				// public $prevent_lock;



	/**
	* __CONSTRUCT
	* @param object $data = null
	*/
	public function __construct( object $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
			// if (!is_object($data)) {
			// 	trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			// 	return false;
			// }

		// default always is 'dedalo'
		$this->set_api_engine = 'dedalo';

		// set all properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}

		return true;
	}//end __construct



	/**
	* SET_DD_API
	*/
	public function set_dd_api(string $value) {

		$this->dd_api = $value;
	}//end set_dd_api



	/**
	* SET_ACTION
	*/
	public function set_action(string $value) {

		$this->action = $value;
	}//end set_action



	/**
	* SET_SOURCE
	*/
	public function set_source(object $value) {

		$this->source = $value;
	}//end set_source



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
	final public function __call(string $strFunction, $arArguments) {

		$strMethodType		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember	= substr($strFunction, 4);
		switch($strMethodType) {
			#case 'set_' :
			#	if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
			#	return($this->SetAccessor($strMethodMember, $arArguments[0]));
			#	break;
			case 'get_' :
				return($this->GetAccessor($strMethodMember));
				break;
		}
		return(false);
	}
	private function GetAccessor(string $variable) {
		if(property_exists($this, $variable)) {
			return (string)$this->$variable;
		}else{
			return false;
		}
	}



}//end request_query_object (RQO)
