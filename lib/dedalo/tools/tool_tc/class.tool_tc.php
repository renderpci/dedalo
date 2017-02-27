<?php
require_once(DEDALO_LIB_BASE_PATH.'/media_engine/class.OptimizeTC.php');

/*
* CLASS TOOL_TC
*/
class tool_tc extends tool_common {
	
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
	public function change_all_timecodes( $offset_seconds, $save=false ) {
		
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$raw_text = $this->component_obj->get_dato();
		
		# Get all timecodes
		$pattern = TR::get_mark_pattern($mark='tc',$standalone=false);
		# Search math patern tags
		preg_match_all($pattern,  $raw_text,  $matches_tc, PREG_PATTERN_ORDER);
			#dump($matches_tc,"matches_tc ".to_string($pattern)); 

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
		#dump($ar_final, ' ar_final ++ '.to_string());
		
		$raw_text = str_replace(array_keys($ar_final), array_values($ar_final), $raw_text);
			#dump($response->result, ' response->result ++ '.to_string());		

		if ($save===true) {
			$this->component_obj->set_dato($raw_text);
			$this->component_obj->Save();

			$response->msg 	  = 'Changed: '.count($ar_final)." tc tags and saved result to component";
		}else{
			$response->msg 	  = 'Total tc tags changed: '.count($ar_final);
		}

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
	public static function format_text_for_tool( $raw_text ) {
		$options = new stdClass();
			$options->deleteTC = false;
		$raw_text = TR::deleteMarks($raw_text, $options);
		$raw_text = TR::addTagImgOnTheFly($raw_text);

		return $raw_text;
	}//end format_text_for_tool




}//end tool_tc
?>