<?php declare(strict_types=1);
/**
 * CLASS TOOL_TC
 * Tool for managing timecode operations in media transcriptions
 *
 * Processes timecode tags embedded in text content and applies consistent
 * offset adjustments across all occurrences. Supports batch timecode transformation
 * with precision timecode formatting.
 *
 * Key features:
 * - Extract and parse timecode tags using regex patterns (format: [TC_HH:MM:SS.mmm_TC])
 * - Apply offset adjustments (add/subtract seconds) to all timecodes
 * - Prevent negative timecodes (clamps to 0)
 * - Optional per-element filtering by data key
 * - Bidirectional processing (reverse order for positive offsets)
 * - Component integration for data persistence
 *
 * Dependencies:
 * - OptimizeTC: Timecode conversion utilities (TC2seg, seg2tc)
 * - TR: Text processing and mark pattern generation
 * - component_common: Component instantiation and data management
 *
 * @package Dedalo
 * @subpackage Media
 */
class tool_tc extends tool_common {

	/**
	 * CHANGE_ALL_TIMECODES
	 * Apply offset adjustment to all timecode tags in component data
	 *
	 * Workflow:
	 * 1. Instantiate component and retrieve language-specific data
	 * 2. Iterate through data elements (may be filtered by key)
	 * 3. For each element, extract and transform all timecode tags
	 * 4. Apply offset adjustment (seconds) to each timecode
	 * 5. Persist modified data back to component
	 * 6. Return mapping of original→transformed timecodes
	 *
	 * Timecode format: [TC_HH:MM:SS.mmm_TC]
	 * Example: [TC_00:01:37.960_TC] with offset +4 seconds → [TC_00:01:41.960_TC]
	 *
	 * @param object $options Options containing:
	 *                         - component_tipo (required): Component type
	 *                         - section_tipo (required): Section type
	 *                         - section_id (required): Section ID
	 *                         - lang (required): Language code for data retrieval
	 *                         - offset_seconds (required): Offset in seconds (can be negative)
	 *                         - key (optional): Filter to specific data key (null = process all)
	 * @return object $response Response object with:
	 *                           - result: array mapping original→transformed timecodes or false on error
	 *                           - msg: operation status message
	 *                           - errors: array of error messages
	 * @throws Exception If component instantiation fails or data save fails
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	public static function change_all_timecodes(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		try {
			// options with validation
			$component_tipo = $options->component_tipo ?? null;
			$section_tipo = $options->section_tipo ?? null;
			$section_id = $options->section_id ?? null;
			$lang = $options->lang ?? null;
			$offset_seconds = $options->offset_seconds ?? null;
			$key = $options->key ?? null;

			// validate required parameters
			if (empty($component_tipo) || empty($section_tipo) || empty($section_id) || empty($lang)) {
				$missing = [];
				if (empty($component_tipo)) $missing[] = 'component_tipo';
				if (empty($section_tipo)) $missing[] = 'section_tipo';
				if (empty($section_id)) $missing[] = 'section_id';
				if (empty($lang)) $missing[] = 'lang';
				
				throw new Exception('Missing required parameters: ' . implode(', ', $missing));
			}

			if ($offset_seconds === null) {
				throw new Exception('offset_seconds parameter is required');
			}

			$offset_seconds = (int)$offset_seconds;

			// component
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
			$data_raw_text = $component->get_data_lang($lang);
			if ($data_raw_text === null) {
				throw new Exception("Failed to retrieve component data for lang: $lang");
			}

			// iterate through data elements
			$new_data = [];
			$ar_replaced = [];
			
			foreach ($data_raw_text as $raw_key => $data_element) {

				$raw_text = $data_element->value ?? '';

				// filter by key optional
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

				$new_element = clone $data_element;
				$new_element->value = $final_raw_text;

				$new_data[] = $new_element;
			}//end foreach ($data_raw_text as $key => $raw_text)

			// save component new data
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
	 * Extract and transform all timecode tags in text using regex pattern matching
	 *
	 * Processes all timecodes matching the standard format [TC_HH:MM:SS.mmm_TC]:
	 * 1. Extract timecodes using regex pattern
	 * 2. Convert each timecode to seconds using OptimizeTC::TC2seg()
	 * 3. Apply offset adjustment (clamped to minimum 0)
	 * 4. Convert back to timecode format using OptimizeTC::seg2tc()
	 * 5. Replace all occurrences in original text
	 * 6. Return transformation map for audit/logging
	 *
	 * Processing order is reversed for positive offsets to prevent
	 * replacement conflicts.
	 *
	 * @param string $raw_text Text content containing timecode tags
	 * @param int $offset_seconds Offset in seconds (can be negative)
	 * @return object $result Result object containing:
	 *                         - raw_text: transformed text with updated timecodes
	 *                         - ar_replaced: map of original→transformed timecodes
	 * @throws Exception If timecode conversion fails
	 *
	 * @package Dedalo
	 * @subpackage Media
	 */
	private static function replace_tc_codes(string $raw_text, int $offset_seconds) : object {

		try {
			// short vars
			$tc_pattern = TR::get_mark_pattern(
				'tc', // string mark
				false // bool standalone
			);

			if (empty($tc_pattern)) {
				throw new Exception("Failed to retrieve timecode pattern from TR class");
			}

			// time codes. Get all time codes (tc tags as [TC_00:01:57.960_TC])
			preg_match_all($tc_pattern, $raw_text, $matches_tc, PREG_PATTERN_ORDER);

			// matches iterate
			$ar_final = [];
			if (!empty($matches_tc[1])) {
				foreach ($matches_tc[1] as $current_tc) {

					$secs = OptimizeTC::TC2seg($current_tc); // returns float
					$new_secs = $secs + $offset_seconds;

					if ($new_secs < 0) {
						$new_secs = 0;
					}

					$new_tc = OptimizeTC::seg2tc($new_secs);

					$ar_final[$current_tc] = $new_tc;
				}

				// reverse array order for positive offsets to prevent replacement conflicts
				if ($offset_seconds > 0) {
					$ar_final = array_reverse($ar_final, true);
				}
			}

			// final_raw_text
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
			return (object)[
				'raw_text' => $raw_text,
				'ar_replaced' => []
			];
		}
	}//end replace_tc_codes

}//end tool_tc
