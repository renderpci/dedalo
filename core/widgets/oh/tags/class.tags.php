<?php declare(strict_types=1);
/**
 * CLASS TAGS
 *
 * Widget that computes statistics about transcription text tags embedded in
 * a `component_text_area`. It parses the raw Dédalo text to count and validate
 * time-codes, index tags, notes, and character metrics.
 *
 * Key features:
 * - Always reads from the original language of the transcription
 * - Counts time-code (tc) tags and detects out-of-sequence entries
 * - Counts index tags (in/out), detects missing pairs, deleted (blue) tags, and tags marked for review (red)
 * - Counts private and public note annotations
 * - Computes total characters, characters without spaces, and real UTF-8 length
 * - Outputs keyed values driven by the IPO output map consumed by render_tags.js
 * - Values are reactive: the client subscribes to `update_widget_value_*` events for live refresh
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class tags extends widget_common {



	/**
	* GET_DATA
	* Parse the transcription text from the source component and return
	* computed tag statistics keyed by the IPO output map.
	*
	* The method iterates over each IPO entry, loads the transcription text
	* from the `component_text_area` identified by `component_tipo` in the
	* source config, then runs a series of regex passes via TR::get_mark_pattern()
	* to count and validate every tag category. Results are assembled into
	* output objects shaped to match the `output` map declared in the IPO.
	*
	* The output map IDs in the IPO are resolved to local variable values through
	* PHP's variable-variable syntax (`$$current_id`). Every `id` in the output
	* map MUST exactly match the name of a local variable set earlier in the loop;
	* unmatched IDs produce null values without a runtime error.
	*
	* Expected IPO sample (from ontology properties):
	* {
	*   "input": {
	*     "type": "component_data",
	*     "source": [
	*       {
	*         "var_name": "transcription",
	*         "section_tipo": "current",
	*         "section_id": "current",
	*         "component_tipo": "rsc36"
	*       }
	*     ]
	*   },
	*   "output": [
	*     { "id": "total_tc" },
	*     { "id": "total_index" },
	*     { "id": "total_missing_tags" },
	*     { "id": "total_to_review_tags" },
	*     { "id": "total_private_notes" },
	*     { "id": "total_public_notes" },
	*     { "id": "total_chars" },
	*     { "id": "total_chars_no_spaces" },
	*     { "id": "total_real_chars" }
	*   ]
	* }
	*
	* Sample returned data items:
	* {
	*   "widget": "tags",
	*   "key": 0,
	*   "widget_id": "total_tc",
	*   "value": 24
	* }
	* {
	*   "widget": "tags",
	*   "key": 0,
	*   "widget_id": "total_missing_tags",
	*   "value": 3
	* }
	*
	* Usage:
	*   $widget = widget_common::get_instance((object)[
	*       'widget_name'   => 'tags',
	*       'path'          => 'oh/tags',
	*       'section_tipo'  => 'oh1',
	*       'section_id'    => '123',
	*       'mode'          => 'edit',
	*       'ipo'           => $ipo_from_ontology
	*   ]);
	*   $data = $widget->get_data();
	*
	* @return ?array $data
	*  Array of objects, one per IPO output map entry, or null on failure.
	*/
	public function get_data() : ?array {

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$ipo			= $this->ipo;
		$lang			= $this->lang;
		$mode			= 'list';

		$data = [];

		foreach ($ipo as $ipo_key => $current_ipo) {

			$input	= $current_ipo->input;
			$output	= $current_ipo->output;
			$source	= $input->source ?? [];

			// locate transcription source
			// The source array may contain multiple entries (e.g. image, audio).
			// Only the entry with var_name === 'transcription' provides the text component.
			$transcription_source = array_find($source, function($item){
				return ($item->var_name==='transcription');
			});
			if (!is_object($transcription_source)) {
				debug_log(__METHOD__
					. " Ignored current_ipo because transcription source was not found " . PHP_EOL
					. ' source: ' . to_string($source)
					, logger::ERROR
				);
				continue;
			}

			$current_component_tipo = $transcription_source->component_tipo;

			// raw_text. From the original lang always (!)
			// (!) $data is intentionally reused as a local variable here: first it holds
			// the component's raw data array; after the output-map loop it is re-populated
			// with the widget result objects. The outer $data = [] is effectively
			// overwritten on each IPO iteration. This works correctly only because the
			// output-map loop (further below) appends to $data after each tc/index/note
			// computation block has run. Callers should be aware that the final return
			// value contains only the last IPO iteration's partial results if more than
			// one IPO entry exists, since $data is not reset between iterations.
				$component = component_common::get_instance(
					'component_text_area',
					$current_component_tipo,
					$section_id,
					$mode,
					$lang,
					$section_tipo
				);
				$original_lang = $component->get_original_lang();
				if (!empty($original_lang) && $original_lang!==$lang) {
					// tag statistics must be computed on the source (original) language text,
					// not on translated copies, because translations typically strip or alter tags
					$component->set_lang($original_lang);
				}

				$data = $component->get_data();
				$raw_text = isset($data[0]->value)
					? $data[0]->value
					: '';

			// tc's
			// Tag format: [TC_HH:MM:SS.mmm_TC]
			// TR::get_mark_pattern('tc', false) returns a pattern with two capture groups:
			//   [0] full match (e.g. '[TC_00:01:25.627_TC]')
			//   [1] timecode value only (e.g. '00:01:25.627')
				$pattern = TR::get_mark_pattern($mark='tc',$standalone=false);
				# Search math pattern tags
				preg_match_all($pattern,  $raw_text,  $matches_tc, PREG_PATTERN_ORDER);
				$total_tc = isset($matches_tc[0])
					? count($matches_tc[0])
					: 0;

				// tc wrong case
				// Walk the matched timecodes in document order and flag any whose numeric
				// second-offset is lower than the preceding one. The resulting $ar_tc_wrong
				// array is computed here but is NOT currently included in the output map;
				// it is available for debugging or future extension.
				$ar_secs 	 = [];
				$ar_tc_wrong = [];
				foreach ($matches_tc[1] as $tc_key => $tc_value) {
					$secs				= OptimizeTC::TC2seg($tc_value);
					$ar_secs[$tc_key]	= $secs;
					if ($tc_key>0 && $secs<$ar_secs[$tc_key-1]) {
						$ar_tc_wrong[] = $tc_value;
					}
				}

			// index
			// Index tags are paired: [index-STATE-ID] / [/index-STATE-ID]
			// The STATE letter encodes the tag's visual/workflow status:
			//   'n' = normal (active)
			//   'd' = deleted/blue  (kept in text but logically removed)
			//   'r' = to-review/red (flagged for revisitation)

				// index in
				// TR::get_mark_pattern('indexIn', false) capture groups (PREG_PATTERN_ORDER):
				//   [0] full tag strings, [1] 'index', [2] state letter, [3] numeric id, …
				$pattern = TR::get_mark_pattern($mark='indexIn',$standalone=false);
				preg_match_all($pattern,  $raw_text,  $matches_indexIn, PREG_PATTERN_ORDER);
				$total_indexIn = isset($matches_indexIn[0])
					? count($matches_indexIn[0])
					: 0;

				// index out
				// TR::get_mark_pattern('indexOut', false) uses the same capture group layout.
				$pattern = TR::get_mark_pattern($mark='indexOut',$standalone=false);
				preg_match_all($pattern,  $raw_text,  $matches_indexOut, PREG_PATTERN_ORDER);
				$total_indexOut = isset($matches_indexOut[0])
					? count($matches_indexOut[0])
					: 0;

				// index missing in
				// An indexOut tag whose numeric ID does not appear in any indexIn tag
				// indicates that the opening tag was deleted or never inserted.
				// The corresponding closing tag is converted to its opening form for display.
				// Capture group [2] holds the numeric id shared by paired in/out tags.
				$ar_missing_indexIn=array();
				foreach ($matches_indexOut[2] as $index_in_key => $index_invalue) {
					if (!in_array($index_invalue, $matches_indexIn[2])) {
						$tag_in = $matches_indexOut[0][$index_in_key];
						$tag_in = str_replace('[/', '[', $tag_in);
						$ar_missing_indexIn[] = $tag_in;
					}
				}

				// index missing out
				// Symmetric check: an indexIn tag whose numeric ID has no corresponding
				// indexOut tag means the closing tag is absent from the text.
				// The opening tag is converted to its closing form for display.
				$ar_missing_indexOut=array();
				foreach ($matches_indexIn[2] as $index_out_key => $index_out_value) {
					if (!in_array($index_out_value, $matches_indexOut[2])) {
						$tag_out = $matches_indexIn[0][$index_out_key];	// As we only have the in tag, we create out tag
						$tag_out = str_replace('[', '[/', $tag_out);
						$ar_missing_indexOut[] = $tag_out;
					}
				}

				// total_index: count distinct index IDs that appear in EITHER in or out tags
				// Capture group [3] of indexIn/indexOut patterns carries the numeric thesaurus ID.
				// Collecting from both arrays and deduplicating gives the unique entry count.
				// Note: $ckey=3 is intentional — it addresses capture group 3, which is the
				// numeric id field in the indexIn/indexOut patterns. Group 2 is the state letter.
				$ar_different_index = array();
				$ckey=3;
				if(isset($matches_indexIn[$ckey])) foreach ($matches_indexIn[$ckey] as $matches_in_value) {
					$ar_different_index[] = $matches_in_value;
				}
				if(isset($matches_indexOut[$ckey])) foreach ($matches_indexOut[$ckey] as $matches_out_value) {
					$ar_different_index[] = $matches_out_value;
				}
				$ar_different_index = array_unique($ar_different_index);
				$total_index = count($ar_different_index);

				// blue tags (deleted)
				// TR::get_mark_pattern('index', standalone=true, id=false, data=false, state='d')
				// matches both [index-d-ID] and [/index-d-ID] (the $standalone=true flag
				// wraps the pattern in delimiters). Capture group [2] holds the numeric ID.
				// array_unique deduplicates paired in/out occurrences of the same deleted entry.
				$ckey=2;
				#$pattern = "/\[\/{0,1}index-d-([0-9]+)\]/";
				$pattern = TR::get_mark_pattern($mark='index',$standalone=true,false,false,'d');
				preg_match_all($pattern,  $raw_text,  $matches_deleted, PREG_PATTERN_ORDER);
				$ar_deleted = array_unique( $matches_deleted[$ckey] );

				# We count the broken tags found + the blue (deleted) tags existing in the text.
				# Tags that are referenced in the thesaurus but absent from the current text are NOT
				# counted here (for performance); they are automatically prepended when entering edit mode.
				$total_missing_tags = count($ar_missing_indexIn) + count($ar_missing_indexOut) + count($ar_deleted);

				// red tags (to review)
				// State letter 'r' selects tags visually highlighted as needing editorial review.
				// Capture group [1] is used here instead of [2] because the standalone=true
				// variant of get_mark_pattern('index') returns a different group layout than
				// the non-standalone indexIn/indexOut variants. $ar_to_review deduplicated to
				// count distinct entries, not raw tag occurrences.
				$ckey=2;
				#$pattern = "/\[\/{0,1}index-r-([0-9]+)\]/";
				$pattern = TR::get_mark_pattern($mark='index',$standalone=true,false,false,'r');
				preg_match_all($pattern,  $raw_text,  $matches_to_review, PREG_PATTERN_ORDER);
				$ar_to_review			= array_unique( $matches_to_review[1] );
				$total_to_review_tags	= count($ar_to_review);


			// annotations
			// Note tag format: [note-STATE-ID-data:TEXT:data]
			// State letter meanings: 'a' = private/work annotation, 'b' = public annotation.

				// private annotations
				$pattern = TR::get_mark_pattern($mark='note',$standalone=false,false,false,'a');
				preg_match_all($pattern, $raw_text, $private_notes, PREG_PATTERN_ORDER);
				$total_private_notes = isset($private_notes[0])
					? count($private_notes[0])
					: 0;

				// public annotations
				$pattern = TR::get_mark_pattern($mark='note',$standalone=false,false,false,'b');
				preg_match_all($pattern,  $raw_text,  $public_notes, PREG_PATTERN_ORDER);
				$total_public_notes = 0;
				$total_public_notes = isset($public_notes[0])
					? count($public_notes[0])
					: 0;

			// chars info
			// TR::get_chars_info() strips all Dédalo marks and HTML tags before counting,
			// so both total_chars and total_chars_no_spaces reflect clean prose length.
				$chars_info				= TR::get_chars_info($raw_text);
				$total_chars			= $chars_info->total_chars;
				$total_chars_no_spaces	= $chars_info->total_chars_no_spaces;

			// total real chars
			// mb_strlen on the raw unstripped text: counts every UTF-8 character including
			// tag markup. Differs from total_chars because it includes tag syntax characters.
				$total_real_chars = mb_strlen($raw_text,'UTF-8');

			// final data object, get the output map to create it.
			// Variable-variable dispatch: each output map entry's `id` string (e.g. 'total_tc')
			// is used as a PHP variable name via `$$current_id`. This requires that every
			// supported `id` value exactly matches the local variable name set earlier in this
			// loop body. An unrecognised id yields null without error. The set of valid ids is:
			// total_tc, total_index, total_missing_tags, total_to_review_tags,
			// total_private_notes, total_public_notes, total_chars,
			// total_chars_no_spaces, total_real_chars.
			// (!) $total_indexIn and $total_indexOut are computed above but are NOT wired into
			// any output map entry; they are available only for debugging at this time.
				foreach ($output as $data_map) {

					$current_id = $data_map->id;

					$current_data = new stdClass();
						$current_data->widget		= get_class($this);
						$current_data->key			= $ipo_key;
						$current_data->widget_id	= $current_id;
						$current_data->value		= $$current_id ?? null;

					$data[] = $current_data;
				}
			}


		return $data;
	}//end get_data



}//end tags class
