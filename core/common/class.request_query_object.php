<?php
/**
* REQUEST QUERY OBJECT (RQO)
* Defines an object with normalized properties and checks


	// STRUCTURE
		dd_api	: API class that will be used
		action	: API method that will be used
		source	: component, section, menu, etc that made the call
			action	: API method that will be used with the source
		sqo		: search query object active width DDBB
		show	: layout_map and sqo_config
			(it will create the search and choose, when these objects are not sended)
		search	: layout_map and sqo_config 
			(it modify the show and it will create the choose, when these object is not sended)
		choose	: layout_map 
			(it modify search)
		
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
					"value"			: array (optional) [{locator}] || ["text"] || [""] // value of the component to resolve, used by portal in seach mode
				},			
				"sqo"			: {
					// all sqo definition in search_query_object class
				}
				"show"			: {
					"ddo_map"		: array [{ddo}, {ddo}] // layout map will be used, with specific path, the ddo are linked by parent to create the path
					"sqo_config"	: {
						// specific sqo configuration for the show
					}
					"interface"		:{
						"button_tree" : true || false // control of the imput interface button tree
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
					"ddo_map":[
						{"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": false},
						{"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3"}, {"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"},
						{"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3","value_with_parents": true}
					],
					"divisor": ", ",
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
	* __CONSTRUCT
	* @param object $data
	*	optional . Default is null
	*/
	public function __construct( $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
		if (!is_object($data)) {
			trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			return false;
		}

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
	* SET_TYPO
	*/
	public function set_typo(string $value) {
		
		$this->typo = $value;
	}//end set_typo



	/**
	* SET_DD_API
	*/
	public function set_dd_api(string $value) {
		
		$this->dd_api = $value;
	}//end set_dd_api



	/**
	* SET_API_ENGINE
	*/
	public function set_api_engine(string $value) {
		
		$this->api_engine = $value;
	}//end set_api_engine



	/**
	* SET_ACTION
	*/
	public function set_action(string $value) {
		
		$this->action = $value;
	}//end set_action



	/**
	* SET_ACTION_OPT
	*/
	// public function set_action_opt($value) {
		
	// 	$this->action_opt = $value;
	// }//end set_action_opt



	/**
	* SET_TIPO
	*/
	public function set_tipo(string $value) {
		if(!RecordObj_dd::get_prefix_from_tipo($value)) {
			throw new Exception("Error Processing Request. Invalid tipo: $value", 1);
		}
		$this->tipo = $value;
	}//end set_tipo



	/**
	* SET_SECTION_TIPO
	*/
	public function set_section_tipo(string $value) {
		
		$this->section_tipo = $value;
	}//end set_section_tipo



	/**
	* SET_SECTION_ID
	*/
	public function set_section_id($value) {
		
		$this->section_id = $value;
	}//end set_section_id



	/**
	* SET_LANG
	*/
	public function set_lang(string $value) {
		if(strpos($value, 'lg-')!==0) {
			throw new Exception("Error Processing Request. Invalid lang: $value", 1);
		}
		$this->lang = $value;
	}//end set_lang



	/**
	* SET_MODE
	*/
	public function set_mode(string $value) {

		$this->mode = $value;
	}//end set_mode



	/**
	* SET_MODEL
	*/
	public function set_model(string $value) {

		$this->model = $value;
	}//end set_model



	/**
	* SET_SQO
	*/
	public function set_sqo($value) {

		$this->sqo = $value;
	}//end set_sqo



	/**
	* SET_SHOW
	*/
	public function set_show($value) {

		$this->show = $value;
	}//end set_show



	/**
	* SET_SEARCH
	*/
	public function set_search($value) {

		$this->search = $value;
	}//end set_search



	/**
	* SET_CHOOSE
	*/
	public function set_choose($value) {

		$this->choose = $value;
	}//end set_choose



	/**
	* GET METHODS
	* By accessors. When property exits, return property value, else return null
	*/	
	final public function __call($strFunction, $arArguments) {
		
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
	private function GetAccessor($variable) {
		if(property_exists($this, $variable)) {
			return (string)$this->$variable;
		}else{
			return false;
		}
	}



}//end request_query_object (RQO)
