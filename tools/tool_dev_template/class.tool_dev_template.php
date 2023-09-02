<?php



/**
* CLASS TOOL_DEV_TEMPLATE
* This tool is intended to be used as a base build for new tools. Do not use as a production tool.
*
*/
class tool_dev_template extends tool_common {



	/**
	* MY_CUSTOM_STATIC_FAKE_METHOD
	* Exec a custom action called from client
	* Note that tool config is stored in the tool section data (tools_register)
	* @param object $request_options
	* @return object $response
	*/
	public static function my_custom_static_fake_method(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$component_tipo	= $options->component_tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$config			= $options->config ?? null;

		// optional config read from config
			// get all tools config sections
				$tool_name	= get_called_class();
				$config		= tool_common::get_config($tool_name);
			// select current from all tool config matching tool name
				// $tool_name	= get_called_class(); // tool_lang
				// $config		= array_find($ar_config, function($el) use($tool_name) {
				// 	return $el->name===$tool_name;
				// });

		// awesome tool process...

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return (object)$response;
	}//end my_custom_static_fake_method



}//end class tool_dev_template
