<?php declare(strict_types=1);
include( dirname(dirname(__FILE__)) . '/shared/class.subtitles.php');
/**
* CLASS SERVICE_SUBTITLES
* HTTP service adapter that exposes subtitle-generation to the Dédalo core API.
*
* This thin wrapper class bridges the core API dispatch layer and the shared
* subtitle-building logic in class.subtitles (shared/class.subtitles.php).
* It does no work of its own; every call is delegated straight to the
* abstract subtitles base class so that the shared logic can also be used
* in the publication server without duplicating code.
*
* Callers:
* - The (now-inactive) service_request dispatcher in class.dd_core_api.php
*   previously loaded this file dynamically and called build_subtitles_text
*   via call_user_func.
* - The publication subtitle endpoint (publication/server_api/v1/subtitles/)
*   calls the shared subtitles class directly and does NOT go through this
*   service adapter.
* - Client JS (service_subtitles.js, tool_subtitles.js, tool_tr_print.js)
*   builds API requests that ultimately reach this class.
*
* Data flow:
*   API request → service_subtitles::build_subtitles_text()
*     → subtitles::build_subtitles_text()   // shared/class.subtitles.php
*       → returns WebVTT-formatted string wrapped in a response object
*
* Note: the include path resolves to core/services/shared/class.subtitles.php,
* which is the canonical shared location used by both core and publication
* contexts.
*
* @package Dédalo
* @subpackage Core
*/
class service_subtitles {



	/**
	* BUILD_SUBTITLES_TEXT
	* Delegates subtitle generation to the shared subtitles abstract class
	* and returns its response, ensuring the return value is always an object.
	*
	* The actual WebVTT text is built by subtitles::build_subtitles_text().
	* On success, $response->result is a WebVTT string ("WEBVTT\n\n…").
	* On failure, $response->result is false and $response->msg describes the
	* error (e.g. missing mandatory fields in $request_options).
	*
	* @param object $request_options - Subtitle generation options forwarded
	*   verbatim to subtitles::build_subtitles_text(). Expected properties:
	*   - string  sourceText                  Clean transcription text (no <p>/[TC]/[INDEX] tags)
	*   - string|null sourceText_unrestricted Full transcript before restricted-text removal
	*   - int|null    total_ms                Total duration in milliseconds (tcout – tcin)
	*   - int         maxCharLine             Maximum characters per subtitle line (default 144)
	*   - string      type                    Output format: 'srt' or 'xml' (default 'srt')
	*   - bool        show_debug              Whether to emit debug output (default false)
	*   - string|null advice_text_subtitles_title  Optional advisory label shown before the first cue
	*   - int|string|false tc_in_secs         Optional start timecode filter (seconds)
	*   - int|string|false tc_out_secs        Optional end timecode filter (seconds)
	* @return object $response
	*   - mixed  result  WebVTT string on success, false on failure
	*   - string msg     Human-readable status or error description
	*/
	public static function build_subtitles_text( object $request_options) : object {

		$response = subtitles::build_subtitles_text($request_options) ;

		return (object)$response;
	}//end build_subtitles_text



}//end class service_subtitles
