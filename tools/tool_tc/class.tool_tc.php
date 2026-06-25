<?php declare(strict_types=1);
/**
 * CLASS TOOL_TC
 * Bulk-offset tool for timecode tags embedded in AV transcription text
 *
 * tool_tc is a Dédalo v7 tool (extends tool_common) that lets an editor shift
 * every timecode tag in a component's text by a given number of seconds.
 * A typical use-case is correcting a systematic recording-offset error across
 * an entire transcription in a single operation.
 *
 * Responsibilities:
 * - Receive an offset (positive or negative seconds) plus a component locator
 *   (component_tipo / section_tipo / section_id / lang) from the browser tool UI.
 * - Enumerate all timecode tags in the component's language-specific data items,
 *   optionally restricting processing to a single data key.
 * - Add the offset to each timecode (clamping to 0 to prevent negative values).
 * - Persist the modified data back to the component via set_data_lang() + save().
 * - Return a per-key audit map of original → new timecodes so the caller can
 *   display a summary of what changed.
 *
 * Timecode tag format (defined by TR::get_mark_pattern('tc', false)):
 *   [TC_HH:MM:SS.mmm_TC]  e.g. [TC_00:01:37.960_TC]
 * The inner value HH:MM:SS.mmm is what is manipulated; the bracket wrapper is
 * preserved verbatim in the stored text.
 *
 * Tool registration:
 * - Declared in tools/tool_tc/register.json (section dd1340, section_id 13).
 * - Restricted to section type rsc36 (AV transcription sections) via dd1350.
 * - Only one API action is exposed: change_all_timecodes (see API_ACTIONS).
 *
 * Dependencies:
 * - tool_common  : base class; provides constructor, context helpers, registry.
 * - OptimizeTC   : TC2seg() converts 'HH:MM:SS.mmm' → float seconds;
 *                  seg2tc() converts float seconds → 'HH:MM:SS.mmm'.
 * - TR           : get_mark_pattern('tc', false) returns the PCRE pattern that
 *                  captures the inner timecode value from a [TC_…_TC] tag.
 * - component_common : get_instance() factory, get_data_lang(), set_data_lang(),
 *                      save() for reading and writing component data.
 * - security     : assert_tipo_permission() / assert_record_in_user_scope()
 *                  guard the write operation before any data is touched.
 *
 * @package Dédalo
 * @subpackage Tools
 */
class tool_tc extends tool_common {



	/**
	 * Explicit allowlist of methods callable via dd_tools_api::tool_request.
	 * Only actions listed here can be invoked through the public tool API
	 * (SEC-024 §9.2 enforcement). Any method not in this list is blocked at
	 * the API gateway level regardless of visibility.
	 * @var array<string>
	 */
	public const API_ACTIONS = [
		'change_all_timecodes'
	];



	/**
	 * CHANGE_ALL_TIMECODES
	 * Apply a signed second-offset to every timecode tag found in a component's data
	 *
	 * This is the only public API action of tool_tc. It is called by the browser
	 * tool UI after the user supplies an offset value (positive or negative integer
	 * of seconds) and clicks Apply.
	 *
	 * Workflow:
	 * 1. Validate required parameters; return an error response early if any are absent.
	 * 2. Assert write permission on the tipo (SEC-024 §9.2) and assert the record
	 *    belongs to the user's scope (SEC-024 §9.4). Both checks throw a
	 *    permission_exception on failure, which propagates past the try/catch below
	 *    so that dd_manager can handle it uniformly.
	 * 3. Resolve the component model via ontology_node::get_model_by_tipo() and
	 *    instantiate the component in 'edit' mode.
	 * 4. Retrieve the component's language-specific data array via get_data_lang().
	 *    Each element in this array is an object with at least a 'value' string
	 *    property containing the raw transcription text (including [TC_…_TC] tags).
	 * 5. For each data element (optionally filtered by $key), call replace_tc_codes()
	 *    which locates every [TC_…_TC] tag, shifts its value by $offset_seconds,
	 *    clamps negative results to 0, and returns both the rewritten text and a
	 *    map of original → new timecode strings.
	 * 6. Clone each element and replace its 'value' with the rewritten text, then
	 *    write the new data array back with set_data_lang() and save().
	 * 7. Return $ar_replaced (keyed by data-element key, then original→new TC) so
	 *    the UI can display a summary of the changes.
	 *
	 * Example:
	 *   offset_seconds = +4, original tag [TC_00:01:37.960_TC]
	 *   → result tag   [TC_00:01:41.960_TC]
	 *
	 * @param object $options {
	 *   string  $component_tipo  Ontology tipo of the target component (required).
	 *   string  $section_tipo    Ontology tipo of the parent section (required).
	 *   int|string $section_id   Record ID within the section (required).
	 *   string  $lang            Language code, e.g. 'lg-spa' (required).
	 *   int|string $offset_seconds Signed number of seconds to add to each TC (required; cast to int).
	 *   string|null $key         Data-element key to restrict processing to; null = process all (optional).
	 * }
	 * @return object {
	 *   mixed   $result  On success: array<string, array<string,string>> keyed by data-element
	 *                    key, each value being an original→new timecode map. false on error.
	 *   string  $msg     Human-readable status message.
	 *   array   $errors  List of error strings; empty on success.
	 * }
	 */
	public static function change_all_timecodes(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options with validation
		// (!) Kept OUTSIDE the try/catch so that permission_exception bubbles up to
		// dd_manager, which logs and formats auth failures uniformly. Only ordinary
		// operational errors (missing model, failed save, etc.) are caught below.
			$component_tipo = $options->component_tipo ?? null;
			$section_tipo = $options->section_tipo ?? null;
			$section_id = $options->section_id ?? null;
			$lang = $options->lang ?? null;
			$offset_seconds = $options->offset_seconds ?? null;
			$key = $options->key ?? null;

			if (empty($component_tipo) || empty($section_tipo) || empty($section_id) || empty($lang) || $offset_seconds === null) {
				$response->msg		= 'Error. Missing required parameters: component_tipo, section_tipo, section_id, lang, offset_seconds';
				$response->errors[]	= 'invalid_request';
				return $response;
			}

		// Security gates — must run before any data is read or modified.
		// SEC-024 (§9.2): WRITE gate. change_all_timecodes overwrites every
		// timecode tag in the component data; permission level 2 = write.
			security::assert_tipo_permission($section_tipo, $component_tipo, 2, __METHOD__);
		// SEC-024 (§9.4): per-record gate — ensure this specific record is within
		// the authenticated user's section scope.
			security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);

		try {
			// Cast here (after validation) so the === null check above catches
			// a missing key, while string '0' (zero offset) is still accepted.
			$offset_seconds = (int)$offset_seconds;

			// component
			// Resolve the PHP class name that handles this component tipo so that
			// component_common::get_instance() can construct the right subclass.
			$model = ontology_node::get_model_by_tipo($component_tipo, true);
			if (empty($model)) {
				throw new Exception("Unable to determine model for component_tipo: $component_tipo");
			}

			$component = component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'edit',
				$lang,
				$section_tipo
			);

			if ($component === null) {
				throw new Exception("Failed to instantiate component: tipo=$component_tipo, section_id=$section_id");
			}

			// ar_raw_text - retrieve component data
			// get_data_lang() returns an indexed array of stdClass objects, each
			// with at minimum a 'value' string property holding the raw transcription
			// text (including any embedded [TC_…_TC] tags).
			$data_raw_text = $component->get_data_lang($lang);
			if ($data_raw_text === null) {
				throw new Exception("Failed to retrieve component data for lang: $lang");
			}

			// iterate through data elements
			// $new_data accumulates the rewritten elements; $ar_replaced accumulates
			// the audit map for the response (keyed by element index / raw_key).
			$new_data = [];
			$ar_replaced = [];

			foreach ($data_raw_text as $raw_key => $data_element) {

				$raw_text = $data_element->value ?? '';

				// filter by key optional
				// When $key is set, skip elements that do not match. This lets the
				// caller target a single data item (e.g., one paragraph) without
				// touching the others that share the same component.
				if (is_null($key) || $key == $raw_key) {
					$result = self::replace_tc_codes($raw_text, $offset_seconds);
					$final_raw_text = $result->raw_text;
					$ar_replaced[$raw_key] = $result->ar_replaced;

					debug_log(__METHOD__
						. " replaced data " . to_string($ar_replaced)
						, logger::DEBUG
					);
				} else {
					$final_raw_text = $raw_text;
				}

				// Clone to avoid mutating the object returned by get_data_lang(),
				// then overwrite only the 'value' property with the rewritten text.
				$new_element = clone $data_element;
				$new_element->value = $final_raw_text;

				$new_data[] = $new_element;
			}//end foreach ($data_raw_text as $key => $raw_text)

			// save component new data
			// set_data_lang() replaces the in-memory data for $lang; save() then
			// flushes the full component record to the database.
			$component->set_data_lang($new_data, $lang);
			$save_result = $component->save();

			if ($save_result === false) {
				throw new Exception("Failed to save component data");
			}

			// response
			$response->result = $ar_replaced;
			$response->msg = 'OK. Successfully changed all tc tags and saved result to component';

			debug_log(__METHOD__
				. " Completed timecode conversion with offset=$offset_seconds"
				, logger::DEBUG
			);

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Error. ' . $e->getMessage();
			$response->errors[] = $e->getMessage();

			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage() . PHP_EOL
				. ' component_tipo: ' . (string)($options->component_tipo ?? 'unknown') . PHP_EOL
				. ' section_tipo: ' . (string)($options->section_tipo ?? 'unknown') . PHP_EOL
				. ' section_id: ' . (string)($options->section_id ?? 'unknown')
				, logger::ERROR
			);
		}

		return $response;
	}//end change_all_timecodes


	/**
	 * REPLACE_TC_CODES
	 * Locate every timecode tag in text, shift its value, and return rewritten text
	 *
	 * This is the core transformation helper called for each data element. It is
	 * intentionally private: the only caller is change_all_timecodes().
	 *
	 * Algorithm:
	 * 1. Obtain the PCRE pattern for timecode tags from TR::get_mark_pattern('tc', false).
	 *    The pattern captures the inner value (HH:MM:SS.mmm) in capture group 1,
	 *    and matches the full [TC_…_TC] wrapper in group 0.
	 * 2. Run preg_match_all() with PREG_PATTERN_ORDER; $matches_tc[1] holds every
	 *    inner timecode string found in the text.
	 * 3. For each captured timecode:
	 *    a. OptimizeTC::TC2seg() converts 'HH:MM:SS.mmm' to float seconds.
	 *    b. Add $offset_seconds (may be negative).
	 *    c. Clamp to 0 to prevent negative timecodes (negative TCs are invalid in
	 *       media players and would corrupt the transcription).
	 *    d. OptimizeTC::seg2tc() converts the float back to 'HH:MM:SS.mmm'.
	 *    e. Reconstruct the full tag wrapper around the new value and record the
	 *       original → new pair in $ar_final.
	 * 4. For positive offsets, reverse $ar_final before running str_replace().
	 *    Rationale: str_replace() processes keys left-to-right. If two tags share
	 *    the same original value (e.g., two [TC_00:01:00.000_TC] occurrences), a
	 *    forward pass could double-replace a tag that was already rewritten. Reversing
	 *    the map when values grow larger mitigates this for strictly increasing TC
	 *    sequences; it is not a complete solution for duplicate TC values.
	 * 5. Return both the rewritten text and $ar_final so the caller can build the
	 *    audit map without re-parsing.
	 *
	 * Error handling: exceptions are caught internally. On failure the original
	 * $raw_text is returned unchanged and $ar_replaced is empty, so the caller
	 * always receives a well-formed object and no data is lost.
	 *
	 * @param string $raw_text        Text containing zero or more [TC_…_TC] tags.
	 * @param int    $offset_seconds  Signed seconds to add to each timecode.
	 * @return object {
	 *   string $raw_text    Rewritten text (unchanged on error).
	 *   array  $ar_replaced Map of original timecode string → new timecode string
	 *                       (e.g. '00:01:37.960' → '00:01:41.960'). Empty on error.
	 * }
	 */
	private static function replace_tc_codes(string $raw_text, int $offset_seconds) : object {

		try {
			// TC pattern
			// TR::get_mark_pattern('tc', false) returns a PCRE pattern where
			// group 0 is the full tag (e.g. [TC_00:01:57.960_TC]) and
			// group 1 is the inner value (e.g. 00:01:57.960).
			// standalone=false means the pattern is not anchored, allowing it
			// to match tags anywhere inside a longer string.
			$tc_pattern = TR::get_mark_pattern(
				'tc', // string mark
				false // bool standalone
			);

			if (empty($tc_pattern)) {
				throw new Exception("Failed to retrieve timecode pattern from TR class");
			}

			// time codes. Get all time codes (tc tags as [TC_00:01:57.960_TC])
			// PREG_PATTERN_ORDER: $matches_tc[0] = full matches, $matches_tc[1] = group 1 captures.
			preg_match_all($tc_pattern, $raw_text, $matches_tc, PREG_PATTERN_ORDER);

			// matches iterate
			// Build $ar_final as original-inner-value → new-inner-value so that
			// str_replace can swap every occurrence in one pass.
			$ar_final = [];
			if (!empty($matches_tc[1])) {
				foreach ($matches_tc[1] as $current_tc) {

					$secs = OptimizeTC::TC2seg($current_tc); // returns float
					$new_secs = $secs + $offset_seconds;

					// Clamp to 0: negative timecodes are invalid in media players.
					if ($new_secs < 0) {
						$new_secs = 0;
					}

					$new_tc = OptimizeTC::seg2tc($new_secs);

					// Map the inner value string (without brackets) because
					// str_replace below will replace inside the full [TC_…_TC] tag.
					$ar_final[$current_tc] = $new_tc;
				}

				// reverse array order for positive offsets to prevent replacement conflicts
				// When offset is positive, TC values grow larger. Reversing the replacement
				// map reduces the risk of a formerly-replaced value string matching a later
				// key in a str_replace pass when two original TCs produce the same new value.
				// (!) This mitigation is partial: if the text contains duplicate TC tags with
				// the same inner value, str_replace still replaces all occurrences at once,
				// which is the desired behaviour for a bulk-offset operation.
				if ($offset_seconds > 0) {
					$ar_final = array_reverse($ar_final, true);
				}
			}

			// final_raw_text
			// str_replace operates on the full tag text (including [TC_ and _TC] wrappers)
			// because the keys in $ar_final are the inner values and the pattern matched the
			// inner group — but the actual stored string has the full wrapper, so the inner
			// value replacement is safe as long as the inner pattern does not appear elsewhere
			// in the text outside of TC tags.
			$final_raw_text = str_replace(array_keys($ar_final), array_values($ar_final), $raw_text);

			// result
			$result = (object)[
				'raw_text' => $final_raw_text,
				'ar_replaced' => $ar_final
			];

			return $result;

		} catch (Exception $e) {
			debug_log(__METHOD__
				. ' Exception: ' . $e->getMessage() . PHP_EOL
				. ' offset_seconds: ' . $offset_seconds
				, logger::ERROR
			);

			// Return unchanged text on error
			// Returning the original text ensures the caller's element array remains
			// consistent and no partial update is saved; change_all_timecodes will
			// still call save(), but the value for this element is unchanged.
			return (object)[
				'raw_text' => $raw_text,
				'ar_replaced' => []
			];
		}
	}//end replace_tc_codes

}//end tool_tc
