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
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`.
	*/
	public const API_ACTIONS = [
		'automatic_translation'
	];



	/**
	* AUTOMATIC_TRANSLATION
	* Alias of tool_lang method.
	* Exec a translation request against the translator service given (babel, google, etc.)
	* and save the result to the target component in the target lang.
	* Note that translator config is stored in the tool section data (tools_register).
	*
	* SEC-085: defence-in-depth permission gate. The downstream
	* `tool_lang::automatic_translation()` already asserts both
	* `security::assert_tipo_permission(...)` and
	* `security::assert_record_in_user_scope(...)`, but the audit calls for
	* the same checks at this entry point so we never depend on the
	* delegate to enforce them. If `tool_lang::automatic_translation()` is
	* ever refactored or replaced, the gate at this layer keeps holding.
	* The method writes target-lang data into the same component, so a
	* level-2 (write) permission is required.
	*
	* @param object $request_options
	* @return object $response
	*/
	public static function automatic_translation(object $request_options) : object {

		// SEC-085: replicate the schema-level authorisation that
		// `tool_lang::automatic_translation` performs on its own. If the
		// payload is missing the required parameters we let the delegate
		// produce its standard error response — only validate when both
		// keys are present, otherwise we would leak a different error
		// surface than the historical contract.
			$component_tipo = $request_options->component_tipo ?? null;
			$section_tipo   = $request_options->section_tipo   ?? null;
			$section_id     = $request_options->section_id     ?? null;
			if (!empty($component_tipo) && !empty($section_tipo)) {
				security::assert_tipo_permission($section_tipo, $component_tipo, 2, __METHOD__);
				if (!empty($section_id)) {
					security::assert_record_in_user_scope(
						$section_tipo,
						(int)$section_id,
						__METHOD__
					);
				}
			}

		return tool_lang::automatic_translation($request_options);
	}//end automatic_translation



}//end class tool_lang_multi
