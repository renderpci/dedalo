<?php declare(strict_types=1);
require_once( dirname(__FILE__, 2) . '/tool_lang/class.tool_lang.php');
/**
* CLASS TOOL_LANG_MULTI
* Server-side entry point for the multi-language translation tool.
*
* Responsibilities:
* - Provide a separately registered tool variant (tool_lang_multi) that exposes
*   the same `automatic_translation` action as tool_lang, but operates in a
*   multi-language editing context where all configured project languages are
*   shown simultaneously.
* - Enforce permission checks at this layer (SEC-085 defence-in-depth) before
*   delegating to tool_lang::automatic_translation() for the actual engine call,
*   data retrieval, and persistence.
*
* Why this class exists instead of using tool_lang directly:
*   The Dédalo tools subsystem dispatches API requests to the specific tool class
*   named in the source rqo (via dd_tools_api::tool_request → create_source).
*   tool_lang_multi has its own register.json entry (section dd1340 / dd1324) and
*   its own JS layer (tool_lang_multi.js / render_tool_lang_multi.js) that renders
*   all language slots at once and fires translate-all batch operations. Having a
*   separate PHP class ensures the tool_security allowlist (API_ACTIONS) is
*   maintained independently and the two tools can diverge if needed.
*
* Data flow:
*   Browser (tool_lang_multi.js) → dd_tools_api (action='tool_request')
*     → tool_lang_multi::automatic_translation($request_options)
*       → [SEC-085 permission gates]
*       → tool_lang::automatic_translation($request_options)
*           → babel/google/browser engine
*           → component save (target_lang slot)
*
* Relationships:
* - Extends tool_common (base for all Dédalo tools).
* - Requires class.tool_lang.php (loaded at the top of this file) to access the
*   delegate implementation.
* - JS counterpart: tools/tool_lang_multi/js/tool_lang_multi.js
* - Called exclusively through dd_tools_api::tool_request(), which enforces the
*   API_ACTIONS allowlist before reaching any method here.
*
* @package Dédalo
* @subpackage Tools
*/
class tool_lang_multi extends tool_common {



	/**
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`.
	*
	* Only 'automatic_translation' is permitted. The tool_security middleware
	* rejects any request that names an action not in this list, so adding a
	* method here must be a conscious decision accompanied by the appropriate
	* permission guards inside that method.
	*/
	public const API_ACTIONS = [
		'automatic_translation'
	];



	/**
	* AUTOMATIC_TRANSLATION
	* Permission-gated proxy to tool_lang::automatic_translation().
	*
	* Executes a translation request against the configured external service
	* (babel, google_translation, or browser_transformer) and persists the
	* translated text into the target-language slot of the source component.
	* The translator service URI and API key are read from the tool configuration
	* stored in section dd996 (user/install override) or dd1324 (registry default).
	*
	* SEC-085 defence-in-depth:
	*   tool_lang::automatic_translation() already asserts tipo-level write
	*   permission and per-record scope; however those checks live inside the
	*   delegate and could silently disappear if that method is refactored.
	*   This wrapper replicates both gates at the tool_lang_multi boundary so
	*   that the security posture of this tool does not depend on the delegate's
	*   internals.  The gates are applied only when the required parameters are
	*   present; when they are absent the delegate is still called and produces
	*   its own validation error, preserving the historical error-response contract.
	*
	* Permission levels:
	*   - tipo-level: assert_tipo_permission($section_tipo, $component_tipo, 2, …)
	*     → level 2 = write; required because the result is saved to the component.
	*   - record-level: assert_record_in_user_scope($section_tipo, (int)$section_id, …)
	*     → applied only when $section_id is provided in $request_options.
	*
	* @param object $request_options Request payload forwarded from dd_tools_api.
	*   {
	*     source_lang    : string  — Source language code (default: DEDALO_DATA_LANG).
	*     target_lang    : string  — Target language code.
	*     component_tipo : string  — Ontology tipo of the component to translate.
	*     section_id     : int     — Record ID containing the component.
	*     section_tipo   : string  — Ontology tipo of the section.
	*     translator     : string  — Engine: 'babel' | 'google_translation'
	*                                | 'browser_transformer'.
	*     config         : object  — (optional) Client-side config hint; unused server-side.
	*   }
	* @return object Response stdClass — shape matches tool_lang::automatic_translation():
	*   {
	*     result : bool   — True on success.
	*     msg    : string — Human-readable status or error description.
	*     errors : array  — Short error-code strings; empty on success.
	*     debug  : object — (only when SHOW_DEBUG===true) raw translated data + service response.
	*   }
	* @throws Exception When security::assert_tipo_permission() or
	*   security::assert_record_in_user_scope() detect an authorisation violation.
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
