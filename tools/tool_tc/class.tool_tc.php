<?php
require_once(DEDALO_CORE_PATH.'/media_engine/class.OptimizeTC.php');

/*
* CLASS TOOL_TC
*/
class tool_tc {//extends tool_common {
	
	protected $component_obj;

	
	
	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->component_obj = $component_obj;
	}



	/**
	* CHANGE_ALL_TIMECODES
	* Apply a offset timecode to all timecode tags in the transcription
	* @return object $response
	*/
	public function change_all_timecodes($offset_seconds) {
		
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$raw_text = $this->component_obj->get_dato();
		
		# Get all timecodes
		$pattern = TR::get_mark_pattern($mark='tc',$standalone=false);
		# Search math patern tags
		//TODO - Currently $raw_text is array instead of string, review this function
		//			first index is currently selected so it can work	
		preg_match_all($pattern,  $raw_text[0],  $matches_tc, PREG_PATTERN_ORDER);
			
		$ar_final=array();
		foreach ($matches_tc[1] as $key => $current_tc) {

			$secs 		= OptimizeTC::TC2seg($current_tc);

			$new_secs 	= $secs + (int)$offset_seconds;

			if ($new_secs<0) {
				$new_secs = 0;
			}

			$new_tc = OptimizeTC::seg2tc($new_secs);

			$ar_final[$current_tc] = $new_tc;
		}		

		if ((int)$offset_seconds>0) {
			# reverse array order
			$ar_final = array_reverse($ar_final,true);
		}
		
		$raw_text = str_replace(array_keys($ar_final), array_values($ar_final), $raw_text);
		
		$this->component_obj->set_dato($raw_text);
		$this->component_obj->Save();

		$response->msg 	  = 'Changed: '.count($ar_final)." tc tags and saved result to component";
		
		$response->result = self::format_text_for_tool( $raw_text );
			

		return (object)$response;
	}//end change_all_timecodes



	/**
	* GET_ORIGINAL_TEXT
	* @return 
	*/
	public function get_original_text() {
		
		$raw_text = $this->component_obj->get_dato();	
		$raw_text = self::format_text_for_tool( $raw_text );

		return $raw_text;
	}//end get_original_text



	/**
	* FORMAT_TEXT_FOR_TOOL
	* @return 
	*/
	public static function format_text_for_tool($raw_text) {

		//Currently (v6) raw_text contains an array instead of a string as in previous versions
		foreach ($raw_text as $key => $text) {
			$text = TR::addTagImgOnTheFly($text);
		}		

		return $raw_text;
	}//end format_text_for_tool



}//end tool_tc
