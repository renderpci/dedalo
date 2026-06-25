<?php declare(strict_types=1);
/**
* CLASS TOOL_LANG
* Server-side handler for the Dédalo multilingual translation tool.
*
* Provides a single API action — `automatic_translation` — that reads a
* component's data in a source language, calls an external translation service,
* and persists the translated text back to the same component in the target
* language.  The class owns only the server path; the UI (language selectors,
* progress overlay, translator picker) lives entirely in the JS layer
* (tool_lang.js / render_tool_lang.js / browser_translation.js).
*
* Supported translation engines:
* - babel         — Apertium-based server; called via class.babel.php (cURL).
*                   Included lazily on demand to avoid loading it for browser-only
*                   requests.
* - google_translation — stub; not yet implemented (returns an error response).
* - browser_transformer — client-side AI model (TranslateGemma 4B / ONNX);
*                   this case must NEVER reach the server and is intercepted early
*                   with an explicit error to prevent silent failures.
*
* Configuration (translator_config array):
*   Stored in the tool's configuration record (section dd996 / dd1324, component
*   dd999 / dd1633) as a JSON object. The relevant structure consumed here is:
*     {
*       "translator_config": {
*         "type": "array",
*         "value": [
*           { "name": "babel", "uri": "https://…/babel_engine/", "key": "…" },
*           { "name": "google_translation", "uri": "…", "key": "…" }
*         ]
*       }
*     }
*   Retrieved at runtime by tool_common::get_config() (two-tier: dd996 wins over
*   dd1324 default).
*
* Security gates (SEC-024):
*   - tipo-level write permission asserted via security::assert_tipo_permission()
*     before reading or writing any component data.
*   - Per-record scope asserted via security::assert_record_in_user_scope() when
*     a concrete section_id is supplied.
*
* Data flow for a successful translation:
*   1. Resolve translator config (URI + key) from tool_common::get_config().
*   2. Instantiate source component in source_lang; call get_data_lang() to get
*      the array of {value, lang} objects for that language.
*   3. For each element, call the appropriate translator (babel::translate()).
*   4. Re-instantiate the same component in target_lang; map translated strings
*      back to {value, lang} objects; call set_data_lang() + save().
*
* Relationships:
*   - Extends tool_common (base class for all Dédalo tools).
*   - Delegates actual HTTP translation calls to class.babel.php (loaded via
*     include_once when the 'babel' engine is selected).
*   - Called by dd_tools_api::tool_request() which enforces the API_ACTIONS
*     allowlist before dispatching.
*   - The JS counterpart (tool_lang.prototype.automatic_translation_server)
*     constructs the rqo and calls dd_tools_api with action='tool_request'.
*
* @package Dedalo
* @subpackage Tools
*/
class tool_lang extends tool_common {



	/**
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`.
	*
	* Only 'automatic_translation' is exposed. Browser-side engines
	* (browser_transformer) are intentionally absent — they run entirely in the
	* browser and must never be dispatched to this server handler.
	*/
	public const API_ACTIONS = [
		'automatic_translation'
	];



	/**
	* AUTOMATIC_TRANSLATION
	* Translate a component's source-language data and save the result in the
	* target language, using the configured external translation service.
	*
	* Workflow:
	*   1. Validate required parameters (component_tipo, section_tipo).
	*   2. Assert tipo-level write permission (SEC-024 §9.2) and, when a
	*      section_id is present, per-record scope (SEC-024 §9.4).
	*   3. Resolve the translator configuration (URI + API key) from the tool
	*      config stored in section dd996 (user config) or dd1324 (default).
	*   4. Load the source component via component_common::get_instance() in
	*      'list' mode and retrieve its per-language data array with get_data_lang().
	*   5. Translate each element through the selected engine (currently only
	*      'babel' is fully implemented).
	*   6. Save the translated values back to the same component in target_lang
	*      via set_data_lang() + save().
	*
	* Empty translation result:
	*   When the translator returns an empty array, the save step is skipped and
	*   a warning message is returned.  Nothing is persisted in that case.
	*
	* Quota detection:
	*   The Babel engine returns a plain-text "Sorry. Quota exceeded" prefix when
	*   the API key is exhausted.  This is detected by a str_starts_with() check
	*   on the first translated value before attempting to save.
	*
	* Debug mode:
	*   When SHOW_DEBUG===true, the response carries a 'debug' object with the
	*   translated_data array and the raw response from the translator service.
	*
	* @param object $options Translation request configuration.
	*   {
	*     source_lang    : string  — Source lang code (default: DEDALO_DATA_LANG).
	*     target_lang    : string  — Target lang code (required).
	*     component_tipo : string  — Ontology tipo of the component to translate.
	*     section_id     : int     — Record ID containing the component.
	*     section_tipo   : string  — Ontology tipo of the section.
	*     translator     : string  — Engine name: 'babel' | 'google_translation'
	*                                | 'browser_transformer'.
	*     config         : object  — (optional) Client-side config hint; not used
	*                                server-side (server always reads from dd996/dd1324).
	*   }
	*
	* @return object Response stdClass.
	*   {
	*     result : bool   — True when translation was saved successfully.
	*     msg    : string — Human-readable status or error description.
	*     errors : array  — Array of short error-code strings; empty on success.
	*     debug  : object — (only when SHOW_DEBUG===true)
	*       {
	*         translated_data : array  — Translated string values.
	*         raw_result      : string — Raw response from translator service.
	*       }
	*   }
	*
	* @throws Exception When security::assert_tipo_permission() or
	*   security::assert_record_in_user_scope() fail (throws before returning).
	*/
	public static function automatic_translation(object $options) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors	= [];

		// options
			$source_lang	= $options->source_lang		?? DEDALO_DATA_LANG;
			$target_lang	= $options->target_lang		?? null;
			$component_tipo	= $options->component_tipo	?? null;
			$section_id		= $options->section_id		?? null;
			$section_tipo	= $options->section_tipo	?? null;
			$translator		= $options->translator		?? null;

		// SEC-024 (§9.2): WRITE gate. automatic_translation reads source-lang
		// data and writes target-lang data on the same (section_tipo,
		// component_tipo) pair.
			if (empty($component_tipo) || empty($section_tipo)) {
				$response->msg		= 'Error. Missing required parameters: component_tipo, section_tipo';
				$response->errors[]	= 'invalid_request';
				return $response;
			}
			security::assert_tipo_permission($section_tipo, $component_tipo, 2, __METHOD__);
		// SEC-024 (§9.4): per-record gate.
			if (isset($section_id) && $section_id !== null) {
				security::assert_record_in_user_scope(
					$section_tipo,
					(int)$section_id,
					__METHOD__
				);
			}

		// config
			// get all tools config sections
			$tool_name	= get_called_class();
			$config = tool_common::get_config($tool_name) ?? new stdClass();

		// config JSON . Must be compatible with tool properties translator_engine data
			// $ar_translator_configs is the 'value' array from:
			//   config->config->translator_config->value
			// Shape: [ {name, uri, key}, … ]  — one entry per registered engine.
			$ar_translator_configs	= $config->config->translator_config->value ?? [];
			$translator_name		= $translator;
			// search current translator config in tool config (stored in database, section 'dd996' Tools configuration)
			$translator_config = array_find($ar_translator_configs, function($item) use($translator_name) {
				return $item->name===$translator_name;
			}) ?? new stdClass();

			// check config
				// URI and key are required for all server-side engines.
				// Browser-only engines (browser_transformer) are intercepted below
				// before these checks are reached, so a missing URI/key here means
				// the admin has not configured a server engine in dd996/dd1324.
				if (empty($translator_config->uri)) {
					$msg = 'Translator config URI is not defined';
					$response->msg .= ' ' . $msg;
					$response->errors[] = $msg;
					return $response;
				}
				if (empty($translator_config->key)) {
					$msg = 'Translator config key is not defined';
					$response->msg .= ' ' . $msg;
					$response->errors[] = $msg;
					return $response;
				}

		// data from options translator
			$uri = $translator_config->uri;
			$key = $translator_config->key;

		// Source text . Get source text from component (source_lang)
			// 'list' mode is used here to get the raw stored data without UI
			// rendering overhead; the result is consumed via get_data_lang()
			// which returns the per-language filtered slice.
			$model		= ontology_node::get_model_by_tipo($component_tipo,true);
			$component	= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				$source_lang,
				$section_tipo
			);
			$data_lang = $component->get_data_lang($source_lang);

		// iterate component array data
			// $translated_data accumulates one translated string per element of $data_lang.
			// Shape matches what set_data_lang() expects after the array_map below:
			//   [ {value: string, lang: string}, … ]
			$translated_data = [];
			$translate = null; // Initialize to prevent undefined variable in debug section
			foreach ($data_lang as $data_element) {

			switch ($translator_name) {

				case 'browser_transformer':
					// browser_transformer is a client-side AI engine (TranslateGemma ONNX)
					// that runs in a Web Worker.  It is never dispatched to this server
					// endpoint; the JS layer calls automatic_translation_browser() instead.
					// Guard here so a mis-routed request gets an explicit error rather than
					// falling through to the babel default.
					$response->msg = "Browser transformer is client-side only. This server path should not be reached.";
					$response->errors[] = 'Client-side engine called on server';
					return $response;
					break;

				case 'google_translation':
						// Not implemented yet
						$response->msg = "Sorry. '{$translator_name}' is not implemented yet"; // error msg
						$response->errors[] = 'Tool not implemented';
						return $response;

				case 'babel':
				default:
					// Lazy-load the Babel adapter only when this engine is actually used.
					// class.babel.php wraps the cURL call to the Apertium-based service,
					// handles SSRF validation, HTML-entity decoding, and tag sanitization.
					include_once( dirname(__FILE__) . '/translators/class.babel.php');
					$translate = babel::translate((object)[
						'uri'			=> $uri,
						'key'			=> $key,
						'source_lang'	=> $source_lang,
						'target_lang'	=> $target_lang,
						'text'			=> $data_element->value ?? '',
					]);
					$result	= $translate->result;
					if ($result===false) {
						// Truncate long error messages from the translation service
						// (e.g. full HTML error pages) to avoid flooding the response.
						$msg = strlen($translate->msg)>512 ? substr($translate->msg, 0, 512).'..' : $translate->msg;
						$response->msg = $msg; // error msg
						return $response;
						}
						break;
				}

				$translated_data[] = $result ?? null;
			}//end foreach ($data_lang as $data_element)


		// Save result on target component (target_lang)
			if (empty($translated_data)) {

				// skip save empty values
				// An empty result most commonly indicates the source component had no data
				// in source_lang.  Nothing is persisted; the caller is notified via msg.
				debug_log(__METHOD__." Skip empty received translation value ", logger::ERROR);
				$response->msg = 'Ignored empty result. Nothing is saved!';

			}else{

				// Quota detection: Babel returns a leading "Sorry. Quota exceeded" string
				// when the API key has no remaining credits.  Bail out before saving to
				// avoid persisting the error text as translated content.
				$first_translated_data = $translated_data[0] ?? '';
				if ( str_starts_with($first_translated_data, 'Sorry. Quota exceeded') ) {
					debug_log(__METHOD__." ERROR: $first_translated_data ", logger::ERROR);
					$response->msg = 'Sorry. Quota exceeded';
					return $response;
				}

				// Re-instantiate the component in target_lang so that set_data_lang()
				// writes to the correct language slot in the database.  Using the same
				// $model avoids a redundant ontology lookup.
				$component = component_common::get_instance(
					$model,
					$component_tipo,
					$section_id,
					'list',
					$target_lang,
					$section_tipo
				);

				// Map translated strings back to the {value, lang} shape expected by
				// set_data_lang(); one object per element preserving original order.
				$component_data = array_map(function($item) use($target_lang) {
					return (object)[
						'value' => $item,
						'lang' => $target_lang
					];
				}, $translated_data);
				$component->set_data_lang($component_data, $target_lang);
				$component->save();

				// response OK
					$response->result	= true;
					$response->msg		= 'OK. Request done ['.__FUNCTION__.']';
			}

		//  debug
			if(SHOW_DEBUG===true) {
				$response->debug = new stdClass();
				$response->debug->translated_data	= $translated_data;
				// $translate may be null if every engine returned early (e.g. browser_transformer guard).
				// The null-coalescing prevents an undefined-property notice in those cases.
				$response->debug->raw_result		= $translate->raw_result ?? null;
			}


		return $response;
	}//end automatic_translation



}//end class tool_lang
