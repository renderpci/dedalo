<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
	$vars = array('mode');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* BUILD_SUBTITLES_TEXT
*/
if ($mode=='build_subtitles_text') {

	# set vars
	$vars = array('section_tipo','section_id','component_tipo','line_lenght','video_duration_secs','lang');
		foreach($vars as $name) $$name = common::setVar($name);

		if (empty($section_tipo)) {
			return "Error: section_tipo is not defined!";
		}
		if (empty($section_id)) {
			return "Error: section_id is not defined!";
		}
		if (empty($component_tipo)) {
			return "Error: component_tipo is not defined!";
		}
		if (empty($lang)) {
			return "Error: lang is not defined!";
		}
		if (empty($line_lenght)) {
			$line_lenght = 90;
		}

	$modelo_name   	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component_obj 	= component_common::get_instance($modelo_name,
													 $component_tipo,
													 $section_id,
													 'edit',
													 $lang,
													 $section_tipo);
	$tool_subtitles = new tool_subtitles($component_obj);

	$options = new stdClass();
		$options->sourceText  	= $component_obj->get_dato();	# clean text fragment without <p>, [TC], [INDEX] tags		
		$options->maxCharLine 	= $line_lenght;		# max number of char for subtitle line. Default 144		
		$options->total_ms 		= $video_duration_secs * 1000; 		# video duration in ms
		#dump($options, ' options'); die();

	preg_match("/\[TC_[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]_TC\]/", $options->sourceText, $output_array);
	if ( empty($output_array[0]) ) {
		$response = new stdClass();
			$response->result 	= 'error';
			$response->msg 		= 'Please, save initial and final timecodes at least and try again';

		echo json_encode( $response );
		return;
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

	$response = new stdClass();
		$response->result 	= 'ok';
		$response->msg 		= 'Subtitles generated successfully';
		$response->url 		= DEDALO_MEDIA_BASE_URL .DEDALO_AV_FOLDER. $base_dir .'/'. $filename;
	
	echo json_encode($response);

	#dump($result, ' result');
}//end if ($mode=='build_subtitles_text')


/**/
# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo json_encode($result);
}



/**
* ADD_SUBTITLE_TRACK_TO_VIDEO
* @return 
*/
function add_subtitle_track_to_video() {

	// JSON DOCUMENT
	header('Content-Type: application/json');

	# set vars
	$vars = array('section_tipo','section_id','component_tipo','lang');
		foreach($vars as $name) $$name = common::setVar($name);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= '';

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
	if(file_exists( $target_dir.'/'.$filename )) {
		$url = DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER .'/'.$filename;

		$response->result 	 = true;
		$response->msg 		 = "Ok. Subtitles files found";
		$response->url 		 = $url;
		$response->lang 	 = $lang;
		$response->lang_name = lang::get_name_from_code( $lang, DEDALO_APPLICATION_LANG ) ;
	}

	
	return (object)$response;
}//end add_subtitle_track_to_video

?>