<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# Write session to unlock session file
session_write_close();



/**
* BUILD_SUBTITLES_TEXT
*/
function build_subtitles_text($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('section_tipo','section_id','component_tipo','line_lenght','lang');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='video_duration_secs') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}	

	// rsc36 text area
	$modelo_name   	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component_obj 	= component_common::get_instance($modelo_name,
													 $component_tipo,
													 $section_id,
													 'edit',
													 $lang,
													 $section_tipo);
	// rsc 35 component_av
	$av_modelo_name = 'component_av';
	$ar_related_av_tipo = common::get_ar_related_by_model($av_modelo_name, $component_tipo);
	if (!isset($ar_related_av_tipo[0])) {
		$response->msg = 'Trigger Error: ('.__FUNCTION__.') Not founded related av component';
		return $response;
	}
	$related_av_tipo	= $ar_related_av_tipo[0];
	$av_component_obj 	= component_common::get_instance($av_modelo_name,
														 $related_av_tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
	$video_duration_secs = $av_component_obj->get_duration_seconds();
	debug_log(__METHOD__." (trigger) video_duration_secs ".to_string($video_duration_secs), logger::DEBUG);


	$tool_subtitles = new tool_subtitles($component_obj);

	$options = new stdClass();
		$options->sourceText  	= $component_obj->get_dato();	# clean text fragment without <p>, [TC], [INDEX] tags		
		$options->maxCharLine 	= $line_lenght;					# max number of char for subtitle line. Default 144		
		$options->total_ms 		= $video_duration_secs * 1000; 	# video duration in ms
		#dump($options, ' options'); die();

	preg_match("/\[TC_[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]_TC\]/", $options->sourceText, $output_array);
	if ( empty($output_array[0]) ) {		
		$response->msg 		= 'Please, save initial and final timecodes at least and try again';	
		return (object)$response;
	}

	$result   = $tool_subtitles->build_subtitles_text( $options );
	$component_av_related_tipo = $component_obj->get_related_component_av_tipo();

	$filename = $component_av_related_tipo.'_'.$section_tipo.'_'.$section_id.'_'.$lang.'.vtt';
	/* WITHOUT FILE OPTION
	header("Content-Type: text/plain");
	header('Content-Disposition: attachment; filename="'.$filename.'"');
	header("Content-Length: " . strlen($result));
	echo $result;
	exit;
	*/
	$base_dir 	= DEDALO_SUBTITLES_FOLDER;
	$target_dir = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . $base_dir ;
	if( !is_dir($target_dir) ) {
		if(!mkdir($target_dir, 0777,true)) throw new Exception("Error on read or create directory. Permission denied \"$target_dir\" (1)");						
	}
	file_put_contents( $target_dir.'/'.$filename, $result );

	
	$response->result 	= true;
	$response->msg 		= 'Ok. Subtitles generated successfully';
	$response->url 		= DEDALO_MEDIA_BASE_URL .DEDALO_AV_FOLDER. $base_dir .'/'. $filename;
	
	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}
			$debug->video_duration_secs = $video_duration_secs;
		$response->debug = $debug;
	}

	return (object)$response;
}//end build_subtitles_text




/**
* ADD_SUBTITLE_TRACK_TO_VIDEO
* @return 
*/
function add_subtitle_track_to_video($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('section_tipo','section_id','component_tipo','lang');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}


	$modelo_name   	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component_obj 	= component_common::get_instance($modelo_name,
													 $component_tipo,
													 $section_id,
													 'edit',
													 $lang,
													 $section_tipo);
	$tool_subtitles = new tool_subtitles($component_obj);

	$component_av_related_tipo = $component_obj->get_related_component_av_tipo();
		#dump($component_av_related_tipo, ' component_av_related_tipo ++ '.to_string());


	$base_dir   = DEDALO_MEDIA_BASE_PATH;
	$target_dir = $base_dir . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER;
	$filename 	= $component_av_related_tipo.'_'.$section_tipo.'_'.$section_id.'_'.$lang.'.vtt';
	$url = DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER .'/'.$filename;
	if(file_exists( $target_dir.'/'.$filename )) {
		$response->result 	 = true;
		$response->msg 		 = "Ok. Subtitles files found";
		$response->url 		 = $url;
		$response->lang 	 = $lang;
		$response->lang_name = lang::get_name_from_code( $lang, DEDALO_APPLICATION_LANG ) ;
	}else{
		$response->result 	 = false;
		$response->msg 		 = "Opss. No subtitles file exists actually as ".$filename;
		$response->url 		 = $url;
		$response->lang 	 = $lang;
		$response->lang_name = lang::get_name_from_code( $lang, DEDALO_APPLICATION_LANG ) ;
	}
	
	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}

	return (object)$response;
}//end add_subtitle_track_to_video



?>