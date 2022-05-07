<?php
// includes. Include another files if need
	// include( dirname(__FILE__) . '/additional/class.additional.php');



/*
* CLASS TOOL_DUMMY
* This tool is intended to be used as a base build for new tools. Do not use as a production tool.
*
*/
class tool_dummy extends tool_common {



	/**
	* MY_CUSTOM_STATIC_METHOD
	* Exec a custom action called from client
	* Note that tool config is stored in the tool section data (tools_register)
	* @param object $request_options
	* @return object $response
	*/
	public static function my_custom_static_method(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->component_tipo	= null;
				$options->section_id		= null;
				$options->section_tipo		= null;
				$options->config			= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// optional config read from config
			// get all tools config sections
				$ar_config = tools_register::get_all_config_tool();
			// select current from all tool config matching tool name
				$tool_name	= get_called_class(); // tool_lang
				$config		= array_find($ar_config, function($el) use($tool_name) {
					return $el->name===$tool_name;
				});

		// awesome tool process...

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return (object)$response;
	}//end my_custom_static_method



}//end class


