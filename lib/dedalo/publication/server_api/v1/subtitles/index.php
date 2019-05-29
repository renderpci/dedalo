<?php
/**
* SUBTITLES ENGINE
* 
* Build subtitles on the fly
* @param section_id, tcin, tcout
*
*/

	$start_time=microtime(1);


	// Load class
		$skip_api_web_user_code_verification = true;
		include(dirname(dirname(__FILE__)) .'/config_api/server_config_api.php');
		include_once(dirname(dirname(dirname(dirname(dirname(__FILE__))))).'/tools/tool_subtitles/class.subtitles.php');
		
	// vars
		// av_section_id . Section id of aufiovisual record tape
		$av_section_id = isset($_GET['section_id']) ? (int)$_GET['section_id'] : false;
		if (empty($av_section_id)) {
			exit("Error on build_subtitles. section_id is mandatory");
		}
		// Lang is autoset by server_config_api
		$lang 		 = isset($_GET['lang']) ? $_GET['lang'] : WEB_CURRENT_LANG_CODE;
		preg_match('/^lg-[a-z]{3}$/', $lang, $lang_array);
		if (empty($lang_array)) {
			exit("Error on build_subtitles. Invalid lang. Use format like 'lg-spa' ");
		}
		// TC as float seconds like '132.317'
		$tc_in_secs  = isset($_GET['tc_in'])  ? (int)$_GET['tc_in']  : false;
		$tc_out_secs = isset($_GET['tc_out']) ? (int)$_GET['tc_out'] : false;
	
	// Get reel av data
		$options = new stdClass();
			$options->table 		= (string)TABLE_AUDIOVISUAL;
			$options->ar_fields 	= array(FIELD_VIDEO, FIELD_TRANSCRIPTION, 'duration');
			$options->sql_filter 	= 'section_id = '.(int)$av_section_id;
			$options->lang 			= $lang;
			$options->order 		= null;
			$options->limit 		= 1;
			
		$rows_data = (object)web_data::get_rows_data( $options );
			#dump($rows_data, ' rows_data ++ '.to_string());
		if (empty($rows_data->result)) {
			exit("Error on build_subtitles. Record not found: ".$av_section_id);
		}
		$result = reset($rows_data->result);


		$sourceText_unrestricted = $result[FIELD_TRANSCRIPTION];
		$sourceText 			 = web_data::remove_restricted_text( $sourceText_unrestricted, $av_section_id );
		$total_ms 				 = (int)(OptimizeTC::TC2seg($result['duration']) * 1000);
			
		
	// build_subtitles_text
		$options = new stdClass();
			$options->sourceText 					= $sourceText;
			$options->sourceText_unrestricted 		= $sourceText_unrestricted;
			$options->total_ms 						= $total_ms;
			$options->maxCharLine 					= 144;		# max number of char for subtitle line. Default 144			
			$options->type 							= 'srt';	# File type: srt or xml
			$options->show_debug    				= false;	# Default false
			$options->advice_text_subtitles_title  	= null;  	# Text like "Automatic translation"
			$options->tc_in_secs  					= $tc_in_secs;
			$options->tc_out_secs  					= $tc_out_secs;

		$subtitles_text = subtitles::build_subtitles_text( $options );

	// Debug
		if(SHOW_DEBUG===true) {
			$total = exec_time_unit($start_time,'ms')." ms";
			debug_log(__METHOD__." Created subtitles for section: $av_section_id - time : $total ".to_string(), logger::DEBUG);
		}
		

	// Show text
		header("Access-Control-Allow-Origin: *");
		header('Content-Type: text/vtt');
		echo $subtitles_text;
