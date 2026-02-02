<?php declare(strict_types=1);
require_once( dirname(__FILE__, 2) . '/tool_lang/class.tool_lang.php');
/**
 * CLASS TOOL_LANG_MULTI
 *
 * This tool allows for the automatic translation of content from a source component
 * into multiple target languages simultaneously. It leverages external translation
 * services (like Babel, Google, etc.) configured in Dédalo.
 *
 * It extends tool_common and utilizes methods from tool_lang for the actual
 * translation logic.
 *
 * @package    Dédalo
 * @subpackage Tools
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
