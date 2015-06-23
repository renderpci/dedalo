<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.Ffmpeg.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','video_id','quality','source_quality','target_quality','timecode', 'parent');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


/**
* GENERATE POSTERFRAME
* Build a posterframe from current video tc
* @param $quality
* @param $video_id
* @param $timecode
*/
if($mode=='generate_posterframe') {

	if (empty($quality)) {
		return "Error: quality is not defined!";
	}
	if (empty($video_id) || strlen($video_id)<4) {
		return "Error: video_id is not defined!";
	}
	if (empty($timecode) || strlen($timecode)<1) {
		return "Error: timecode is not defined!";
	}
	if ( empty($parent) ) {
		throw new Exception("Error Processing Request. Few vars! (parent)", 1);
	}	

	$reelID		= $video_id ;
	$quality 	= $target_quality ;
			
	# AVObj
	$AVObj		= new AVObj($reelID, $quality);
	
	# Ffmpeg
	$Ffmpeg		= new Ffmpeg();
	$render		= $Ffmpeg->create_posterframe($AVObj, $timecode);			#create_posterframe(AVObj $AVObj, $timecode)

	# Extract tipo from video_id like dd732-1.mp4 => dd732
	$ar 	= explode('-', $video_id);
	$tipo 	= $ar[0];

	
	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
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
	);
	
	
	#$html = "Processing media in background (target quality: $quality - setting: $setting_name). You can continue working" ;
	
	print 'Posterframe generated';
	die();
}

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
	$poster_file	= DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER ."/posterframe/{$reelID}.".DEDALO_AV_POSTERFRAME_EXTENSION;
	if(file_exists($poster_file)) {
	$del_poster		= unlink($poster_file);
	if(!$del_poster) exit(" Error on delete posterframe file. Posterframe file is not deleted");
	}
	
	
	# Extract tipo from video_id like dd732-1.mp4 => dd732
	$ar 	= explode('-', $video_id);
	$tipo 	= $ar[0];

	
	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
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
	);
	
	print "Posterframe deleted" ;
	exit();
}


?>