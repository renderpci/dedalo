<?php
/**
* REQUEST_CONFIG_OBJECT
* Defines an object with normalized properties and checks

 	// STRUCTURE
		api_engine	: engine for manage the request. Default is 'dedalo' but could be external like 'zenon'
		sqo		: search query object active width DDBB
		show	: layout_map and sqo_config
			(it will create the search and choose, when these objects are not sended)
		search	: layout_map and sqo_config
			(it modify the show and it will create the choose, when these object is not sended)
		choose	: layout_map
			(it modify search)

	// REQUEST_CONFIG SAMPLE (request configuration for Dédalo API or others API):
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
						{"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3","separator_fields" : " | "}, {"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"},
						{"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3","value_with_parents": true}
					],

					"separator_fields" : " | ",
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
class request_config_object {


	/**
	* VARS
	*/
		// $api_engine; // string like 'dedalo'. Default 'dedalo'
		// $sqo; // object search_query_object
		// $show; // object. config of elements to show (ddo_map, sqo_config..)
		// $search; // object. config of elements to show in search mode
		// $choose; // object. config of elements to show in choose mode



	/**
	* __CONSTRUCT
	* @param object $data
	*	optional . Default is null
	*/
	public function __construct( object $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
			// if (!is_object($data)) {
			// 	trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			// 	return false;
			// }

		// set all properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}

		return true;
	}//end __construct



	/**
	* SET_API_ENGINE
	*/
	public function set_api_engine(string $value) {

		$this->api_engine = $value;
	}//end set_api_engine



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



}//end request_config_object
