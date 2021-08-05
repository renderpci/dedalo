<?php
/*
* CLASS TOOL_COMMON
* Add basic methods for general use in tools
*
*/
abstract class tool_common {



	public $name;
	public $config;



	/**
	* __CONSTRUCT
	* @return bool true
	*/
	public function __construct() {

		// set tool name as class name
		$this->name = get_called_class();

		return true;
	}//end __construct



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
