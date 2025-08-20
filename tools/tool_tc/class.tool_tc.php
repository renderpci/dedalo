<?php
/**
* CLASS TOOL_TC
*
*/
class tool_tc extends tool_common {



	/**
	* CHANGE_ALL_TIMECODES
	* Replaces all found tc tags adding/subtracting the
	* offset given in seconds like [TC_00:01:37.960_TC] to [TC_00:01:41.960_TC]
	* @param object $options
	* @return object $response
	*/
	public static function change_all_timecodes(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
				$component_tipo		= $options->component_tipo ?? null;
				$section_tipo		= $options->section_tipo ?? null;
				$section_id			= $options->section_id ?? null;
				$lang				= $options->lang ?? null;
				// $offset_seconds	= $options->offset_seconds ?? null;
				// $key				= $options->key ?? null; // optional dato key

		// component
			$model		= ontology_node::get_modelo_name_by_tipo($component_tipo, true);
			$component	= component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'edit',
				$lang,
				$section_tipo
			);

		// ar_raw_text
			$ar_raw_text = $component->get_dato();

		// iterate
			$new_dato		= [];
			$ar_replaced	= [];
			foreach ($ar_raw_text as $raw_key => $raw_text) {

				// filter by key optional
				if(is_null($options->key) || $options->key==$raw_key) {
					$result					= self::replace_tc_codes($raw_text, (int)$options->offset_seconds);
					$final_raw_text			= $result->raw_text;
					$ar_replaced[$raw_key]	= $result->ar_replaced;
					debug_log(__METHOD__
						." replaced data  ".to_string($ar_replaced)
						, logger::DEBUG
					);
				}else{
					$final_raw_text = $raw_text;
				}

				$new_dato[] = $final_raw_text;
			}//end foreach ($ar_raw_text as $key => $raw_text)

		// save component new dato
			$component->set_dato($new_dato);
			$component->Save();

		// response
			$response->msg		= 'Successful changed all tc tags and saved result to component';
			$response->result	= $ar_replaced;


		return (object)$response;
	}//end change_all_timecodes



	/**
	* REPLACE_TC_CODES
	* Replaces (using a regex) all found tc tags adding/subtracting the
	* offset given in seconds like [TC_00:01:37.960_TC] to [TC_00:01:41.960_TC]
	* @param string $raw_text
	* @param int $offset_seconds
	* @return object $result
	*/
	private static function replace_tc_codes(string $raw_text, int $offset_seconds) : object {

		// short vars
			$tc_pattern = TR::get_mark_pattern(
				'tc', // string mark
				false // bool standalone
			);

		// time codes. Get all time codes (tc tags as [TC_00:01:57.960_TC])
			preg_match_all($tc_pattern, $raw_text, $matches_tc, PREG_PATTERN_ORDER);

		// matches iterate
			$ar_final = [];
			if (!empty($matches_tc[1])) {
				foreach ($matches_tc[1] as $current_tc) {

					$secs		= OptimizeTC::TC2seg($current_tc); // returns float
					$new_secs	= $secs + $offset_seconds;

					if ($new_secs<0) {
						$new_secs = 0;
					}

					$new_tc = OptimizeTC::seg2tc($new_secs);

					$ar_final[$current_tc] = $new_tc;
				}

				// reverse array order
					if ($offset_seconds>0) {
						$ar_final = array_reverse($ar_final,true);
					}
			}

		// final_raw_text
			$final_raw_text = str_replace(array_keys($ar_final), array_values($ar_final), $raw_text);

		// result
			$result = (object)[
				'raw_text'		=> $final_raw_text,
				'ar_replaced'	=> $ar_final
			];


		return $result;
	}//end replace_tc_codes



	/**
	* CHANGE_ALL_TIMECODES
	* Apply a offset timecode to all timecode tags in the transcription
	* @return object $response
	*/
		// public function change_all_timecodes(int $offset_seconds) {

		// 	$response = new stdClass();
		// 		$response->result 	= false;
		// 		$response->msg 		= '';

		// 	$raw_text = $this->component_obj->get_dato();

		// 	# Get all timecodes
		// 	$pattern = TR::get_mark_pattern($mark='tc',$standalone=false);
		// 	# Search math patern tags
		// 	//TODO - Currently $raw_text is array instead of string, review this function
		// 	//			first index is currently selected so it can work
		// 	preg_match_all($pattern,  $raw_text[0],  $matches_tc, PREG_PATTERN_ORDER);

		// 	$ar_final=array();
		// 	foreach ($matches_tc[1] as $key => $current_tc) {

		// 		$secs 		= OptimizeTC::TC2seg($current_tc);

		// 		$new_secs 	= $secs + (int)$offset_seconds;

		// 		if ($new_secs<0) {
		// 			$new_secs = 0;
		// 		}

		// 		$new_tc = OptimizeTC::seg2tc($new_secs);

		// 		$ar_final[$current_tc] = $new_tc;
		// 	}

		// 	if ((int)$offset_seconds>0) {
		// 		# reverse array order
		// 		$ar_final = array_reverse($ar_final,true);
		// 	}

		// 	$raw_text = str_replace(array_keys($ar_final), array_values($ar_final), $raw_text);

		// 	$this->component_obj->set_dato($raw_text);
		// 	$this->component_obj->Save();

		// 	$response->msg 	  = 'Changed: '.count($ar_final)." tc tags and saved result to component";

		// 	$response->result = self::format_text_for_tool( $raw_text );


		// 	return (object)$response;
		// }//end change_all_timecodes



	/**
	* GET_ORIGINAL_TEXT
	* @return
	*/
		// public function get_original_text() {

		// 	$raw_text = $this->component_obj->get_dato();
		// 	$raw_text = self::format_text_for_tool( $raw_text );

		// 	return $raw_text;
		// }//end get_original_text



	/**
	* FORMAT_TEXT_FOR_TOOL
	* @return
	*/
		// public static function format_text_for_tool($raw_text) {

		// 	//Currently (v6) raw_text contains an array instead of a string as in previous versions
		// 	foreach ($raw_text as $key => $text) {
		// 		$text = TR::add_tag_img_on_the_fly($text);
		// 	}

		// 	return $raw_text;
		// }//end format_text_for_tool



}//end tool_tc
