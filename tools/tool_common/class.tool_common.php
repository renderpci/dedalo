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
	* @return object | null
	*/
	public function get_config() {

		$tool_name = $this->name;

		// get all tools config sections
			$ar_config = tools_register::get_all_config_tool();

		// select current from all tool config
			$ar_config = array_filter($ar_config, function($item) use($tool_name){
				if($item->name===$tool_name) {
					return $item;
				}
			});
		
		$config = !empty($ar_config[0])
			? $ar_config[0]->config
			: null;

		// fix value
			$this->config = $config;

		return $config;
	}//end get_config


}
