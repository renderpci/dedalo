<?php
require_once( dirname(dirname(__FILE__)) . '/tool_lang/class.tool_lang.php');
/*
* CLASS TOOL_LANG_MULTI
*
*
*/
class tool_lang_multi extends tool_common {



	/**
	* AUTOMATIC_TRANSLATION
	* Alias of tool_lang mthod
	* Exec a translation request against the translator service given (babel, google, etc.)
	* and save the result to the target component in the target lang.
	* Note that translator config is stored in the tool section data (tools_register)
	* @param object $request_options
	* @return object $response
	*/
	public static function automatic_translation(object $request_options) : object {

		return tool_lang::automatic_translation($request_options);
	}//end automatic_translation



}//end class tool_lang_multi
