<?php


$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();


require_once( DEDALO_CORE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_CORE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once( DEDALO_CORE_PATH . '/media_engine/class.Ffmpeg.php');


// if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


// # set vars
// 	$vars = array('mode','video_id','quality','source_quality','target_quality','timecode','parent','select_val');
// 		foreach($vars as $name) $$name = common::setVar($name);
	

// # mode
// 	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


#nuevo formato
/**
* GENERATE_POSTERFRAME
*
*/
function generate_posterframe($json_data) {

		dump($json_data, ' json_data ++ '.to_string());
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


	# set vars
		$vars = array('component_tipo','section_tipo','section_id','video_id','quality','timecode');

		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}


	// $modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
	// $component_obj 	 = component_common::get_instance($modelo_name,
	// 												  $component_tipo,
	// 												  $section_id,
	// 												  'edit',
	// 												  $lang,
	// 												  $section_tipo);

	// $tool_tc  = new tool_tc($component_obj);

	// $response = (object)$tool_tc ->change_all_timecodes($offset_seconds);


	//aaa
	// if (empty($quality)) {
	// 	return "Error: quality is not defined!";
	// }
	// if (empty($video_id) || strlen($video_id)<4) {
	// 	return "Error: video_id is not defined!";
	// }
	// if (empty($timecode) || strlen($timecode)<1) {
	// 	return "Error: timecode is not defined!";
	// }
	// if ( empty($parent) ) {
	// 	throw new Exception("Error Processing Request. Few vars! (parent)", 1);
	// }


	// $reelID		= $video_id ;
	// $quality 	= $target_quality ;
			
	# AVObj
	$AVObj		= new AVObj($video_id, $quality);
	
	dump($AVObj, ' AVObj ++ '.to_string());

	# Ffmpeg
	$Ffmpeg		= new Ffmpeg();

	dump($Ffmpeg, ' Ffmpeg ++ '.to_string());
	$render		= $Ffmpeg->create_posterframe($AVObj, $timecode);			#create_posterframe(AVObj $AVObj, $timecode)

	dump($render, ' render ++ '.to_string());
	# Extract tipo from video_id like rsc35_rsc167_8.mp4 => rsc35
	$ar 	= explode('_', $video_id);
	$tipo 	= $ar[0];

	
	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	/*
	logger::$obj['activity']->log_message(
		'NEW VERSION',
		logger::INFO,
		$tipo,
		NULL,
		array(	"msg"				=> "Generated posterframe",				
				"tipo"				=> $tipo,
				"parent"			=> $parent,
				"top_id"			=> TOP_ID,
				"top_tipo"			=> TOP_TIPO,				
				"video_id" 			=> $video_id,
				"quality" 			=> $quality,
				"timecode" 			=> $timecode
			)
	);*/
	
	
	#$html = "Processing media in background (target quality: $quality - setting: $setting_name). You can continue working" ;
	
	print 'Posterframe generated';
	die();

	//xxx

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
}//end generate_posterframe




#fin nuevo formato


/**
* GENERATE_POSTERFRAME
* Build a posterframe from current video tc
* @param $quality
* @param $video_id
* @param $timecode
*/

/**
* DELETE POSTERFRAME
*/
if($mode=='delete_posterframe') {
	
	if (empty($quality)) {
		return "Error: quality is not defined!";
	}
	if (empty($video_id) || strlen($video_id)<4) {
		return "Error: video_id is not defined!";
	}
	if ( empty($parent) ) {
		throw new Exception("Error Processing Request. Few vars! (parent)", 1);
	}
	
	$reelID		= $video_id ;
	
	$PosterFrameObj = new PosterFrameObj($reelID);
	
	# verifica que existe		
	if(!$PosterFrameObj->get_file_exists()) exit("Error deleting posterframe. File not found!");
	
	
	# DELETE POSTERFRAME
	$poster_file	= DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER ."/posterframe/{$reelID}.".DEDALO_AV_POSTERFRAME_EXTENSION;
	if(file_exists($poster_file)) {
	$del_poster		= unlink($poster_file);
	if(!$del_poster) exit(" Error on delete posterframe file. Posterframe file is not deleted");
	}
	
	
	# Extract tipo from video_id like dd732-1.mp4 => dd732
	$ar 	= explode('-', $video_id);
	$tipo 	= $ar[0];

	
	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	/*
	logger::$obj['activity']->log_message(
		'DELETE',
		logger::INFO,
		$tipo,
		NULL,		
		array(	"msg"				=> "Deleted posterframe",				
				"tipo"				=> $tipo,
				"parent"			=> $parent,
				"top_id"			=> TOP_ID,
				"top_tipo"			=> TOP_TIPO,
				"video_id" 			=> $video_id,
				"quality" 			=> $quality
			)
	);*/
	
	print "Posterframe deleted" ;
	exit();
}



/**
* GENERATE_IDENTIFYING_IMAGE
* Build a posterframe from current video tc
* @param $quality
* @param $video_id
* @param $timecode
*/
if($mode=='generate_identifying_image') {

	if (empty($quality)) {
		die("Error: quality is not defined!");
	}
	if (empty($video_id) || strlen($video_id)<4) {
		die("Error: video_id is not defined!");
	}
	if (empty($timecode) || strlen($timecode)<1) {
		die("Error: timecode is not defined!");
	}
	if ( empty($parent) ) {
		die("Error Processing Request. Few vars! (parent)");
	}
	if ( empty($select_val) ) {
		die("Error Processing Request. Few vars! (select_val)");
	}
	if (!$select_val = json_decode($select_val)) die("Error Processing Request. Invalid val (select_val)");


	#
	# COMPONENT PORTAL
		$modelo_name 	  = 'component_portal';
		$component_portal = component_common::get_instance($modelo_name,
														   $select_val->component_portal,
														   $select_val->section_id,
														   'edit',
														   DEDALO_DATA_NOLAN,
														   $select_val->section_tipo);

		$portal_section_target_tipo = $component_portal->get_ar_target_section_tipo()[0]; // First only

		$new_element_options  	= new stdClass();
			$new_element_options->section_target_tipo = $portal_section_target_tipo;

		$new_element_response 	= $component_portal->add_new_element($new_element_options);

		if ($new_element_response->result===false) {
			die("Error on create portal new record: ".$new_element_response->msg);
		}
		
		$new_section_id = $new_element_response->section_id;
		$added_locator 	= $new_element_response->added_locator;

		# Check valid new_section_id
		if($new_section_id<1) die("Error on create portal new record");


	#
	# COMPONENT IMAGE
	$modelo_name 	 = 'component_image';
	$component_image = component_common::get_instance($modelo_name,
													  $select_val->component_image,
													  $new_section_id,
													  'edit',
													  DEDALO_DATA_LANG,
													  $portal_section_target_tipo);
	# Desired image is 'original' quality
	$component_image->set_quality(DEDALO_IMAGE_QUALITY_ORIGINAL);

	#
	# IMAGE FROM VIDEO
	$reelID		 = $video_id;
	$target_path = $component_image->get_target_dir();
	$target_file = $component_image->get_image_path();	
	$ar_target 	 = array('target_path' => $target_path,  // Absolute path to image dir
							'target_file' => $target_file,  // Absolute final path of file (included target_path)
							);
	#dump($reelID, ' reelID ++ '.to_string($quality)); die();

	# AVObj
	$AVObj		 = new AVObj($reelID, $quality);
	
	# Ffmpeg create original quality version ('original')
	$Ffmpeg		 = new Ffmpeg();	
	$render		 = $Ffmpeg->create_posterframe($AVObj, $timecode, $ar_target);			#create_posterframe(AVObj $AVObj, $timecode)

	
	#
	# ORIGINAL TO DEFAULT QUALITY CONVERSION
	$source_quality = DEDALO_IMAGE_QUALITY_ORIGINAL;
	$target_quality = DEDALO_IMAGE_QUALITY_DEFAULT;
	$component_image->convert_quality( $source_quality, $target_quality );
	$component_image->Save(); // Force update list value
	
	
	print "Identifying image created from video ($new_section_id)";
	die();
}//end generate_identifying_image


?>