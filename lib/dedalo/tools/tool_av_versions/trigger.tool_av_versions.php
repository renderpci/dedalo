<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.Ffmpeg.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.OptimizeTC.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','video_id','quality','source_quality','target_quality','timecode','tc_in','tc_out','watermark','tag_id','parent','tipo','top_tipo','top_id','file_path');
		foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* GENERATE VERSION
* Build a minor quality version of current file (from 404 to 'audio' for example)
* @param $source_quality
* @param $target_quality
* @param $video_id
* @param $file_path
*/
if($mode=='generate_version') {

	if (empty($source_quality)) {
		throw new Exception("Error Processing Request. Few vars! (source_quality)", 1);
	}
	if (empty($target_quality)) {
		throw new Exception("Error Processing Request. Few vars! (target_quality)", 1);
	}
	if (empty($video_id) || strlen($video_id)<4) {
		throw new Exception("Error Processing Request. Few vars! (video_id)", 1);
	}
	if ( empty($parent) ) {
		throw new Exception("Error Processing Request. Few vars! (parent)", 1);
	}
	if ( empty($tipo)  ) {
		throw new Exception("Error Processing Request. Few vars! (tipo)", 1);
	}

	$reelID		= $video_id ;
	$quality 	= $target_quality ;
			
	# AVObj
	$AVObj		= new AVObj($reelID, $quality);
	
	# Ffmpeg
	$Ffmpeg			= new Ffmpeg();
	$setting_name	= $Ffmpeg->get_setting_name_from_quality($AVObj, $quality);

	if(SHOW_DEBUG) {
		#die("N3 STOP setting_name:$setting_name - reelID:$reelID, quality:$quality");	#dump($setting_name,'setting_name'); die($setting_name);
	}		

	$render			= $Ffmpeg->create_av_alternate($AVObj, $setting_name);

	# Extract tipo from video_id like dd732-1.mp4 => dd732
	$ar 	= explode('-', $video_id);
	$tipo 	= $ar[0];


	
	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	logger::$obj['activity']->log_message(
		'NEW VERSION',
		logger::INFO,
		$tipo,
		NULL,
		array(	"msg"				=> "Generated av file",
				"tipo"				=> $tipo,
				"parent"			=> $parent,
				"top_id"			=> TOP_ID,
				"top_tipo"			=> TOP_TIPO,				
				"video_id" 			=> $video_id,
				"quality" 			=> $quality,
				"source_quality" 	=> $source_quality
			)
	);
	
	
	$html = "Processing media in background (target quality: $quality - setting: $setting_name). You can continue working" ;
	if(SHOW_DEBUG) {
		$html .= "<div class=\"debug_info\">Debug Command response: $render </div>" ;
	}	

	print $html;
	die();
}//end generate_version


/**
* conform_header
*
*/
if($mode=='conform_header') {

	if (empty($quality)) {
		throw new Exception("Error Processing Request. Few vars! (quality)", 1);
	}	
	if (empty($video_id) || strlen($video_id)<4) {
		throw new Exception("Error Processing Request. Few vars! (video_id)", 1);
	}
	if ( empty($parent) ) {
		throw new Exception("Error Processing Request. Few vars! (parent)", 1);
	}
	if ( empty($tipo)  ) {
		throw new Exception("Error Processing Request. Few vars! (tipo)", 1);
	}

	$reelID		= $video_id ;
	$quality 	= $target_quality ;
			
	# AVObj
	$AVObj		= new AVObj($reelID, $quality);
	
	# Ffmpeg
	$Ffmpeg		= new Ffmpeg();
	$render		= $Ffmpeg->conform_header($AVObj);
		#dump($render, " render ".to_string($AVObj));

	if(SHOW_DEBUG) {
		#die("N3 STOP setting_name:$setting_name - reelID:$reelID, quality:$quality");	#dump($setting_name,'setting_name'); die($setting_name);
	}


	# Extract tipo from video_id like dd732-1.mp4 => dd732
	$ar 	= explode('-', $video_id);
	$tipo 	= $ar[0];

	
	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	logger::$obj['activity']->log_message(
		'NEW VERSION',
		logger::INFO,
		$tipo,
		NULL,
		array(	"msg"				=> "conform_header av file",
				"tipo"				=> $tipo,
				"parent"			=> $parent,
				"top_id"			=> TOP_ID,
				"top_tipo"			=> TOP_TIPO,				
				"video_id" 			=> $video_id,
				"quality" 			=> $quality
			)
	);
	
	
	$html = "Processing media in background (target quality: $quality). You can continue working" ;
	if(SHOW_DEBUG) {
		$html .= "<div class=\"debug_info\">Debug Command response: $render </div>" ;
	}	

	print $html;
	die();
}//end conform_header




/**
* DELETE VERSION
*/
if($mode=='delete_version') {
	
	if (empty($video_id) || strlen($video_id)<4) {
		throw new Exception("Error Processing Request. Few vars! (video_id)", 1);
	}
	if (empty($quality)) {
		throw new Exception("Error Processing Request. Few vars! (quality)", 1);
	}
	if ( empty($parent) ) {
		throw new Exception("Error Processing Request. Few vars! (parent)", 1);
	}
	if ( empty($tipo) ) {
		throw new Exception("Error Processing Request. Few vars! (tipo)", 1);
	}
	if ( empty($file_path) ) {
		throw new Exception("Error Processing Request. Few vars! (file_path)", 1);
	}


	$reelID		= $video_id ;
	
	$AVObj 				= new AVObj($reelID, $quality);		
	$folder_path		= $AVObj->get_media_path_abs(); # incluye / final
	$folder_path_del	= $folder_path . 'deleted/';
	#$file				= $folder_path . $reelID . '.' . $AVObj->get_extension();
	$file 				= $file_path;
	
	if(file_exists($file)) {
		
		try{

			/**
			* NOTE
			* @see component_av->remove_component_media_files
			*/
			
			# delete folder exists ?	
			if( !is_dir($folder_path_del) ) {
			$create_dir 	= mkdir($folder_path_del, 0777,true);
			if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied . The files are not deleted") ;
			}
			
			# delete folder set permissions
			$wantedPerms 	= 0777;
			$actualPerms 	= fileperms($folder_path_del);
			if($actualPerms < $wantedPerms) chmod($folder_path_del, $wantedPerms);
			
			# move / rename file
			$file_base_name = pathinfo($file, PATHINFO_BASENAME); // Like rsc15_rsc78_45.mov._original
			$file_ext 		= pathinfo($file, PATHINFO_EXTENSION);// Like mov
			$target_name 	= $folder_path_del . "/$file_base_name" . '_deleted_' . date("Y-m-dHi") . '.' . $file_ext;

			if(!rename($file, $target_name)){				
				throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");
			}
			
			# DELETE TEMP SH FILE
			$tmp_file		= DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . "/tmp/".$quality.'_'.$reelID.'.sh';	
			if(file_exists($tmp_file)) {
			$del_sh			= unlink($tmp_file);
			if(!$del_sh) 	throw new Exception(" Error on delete temp file . Temp file is not deleted");
			}
			
			# DELETE POSTERFRAME IF MEDIA DELETED IS QUALITY DEFAULT
			if($quality==$AVObj->get_quality_default()) {
				$poster_file	= DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER ."/posterframe/{$reelID}.jpg";
				if(file_exists($poster_file)) {
					unlink($poster_file);
				}
			}


			/*
			# DELETE DB HEADERR_DATA OF CURRENT QUALITY
			$RecordObj_reels		= new RecordObj_reels($reelID);	
			$RecordObj_reels->delete_quality_in_header_data($quality);			

			# SAVE OBJ TO DB
			$RecordObj_reels->Save();
			*/

			# Extract tipo from video_id like dd732-1.mp4 => dd732
			$ar 	= explode('-', $video_id);
			$tipo 	= $ar[0];

			
			# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'DELETE FILE',
				logger::INFO,
				$tipo,
				NULL,
				array(	"msg"				=> "Deleted av file (file is renamed and moved to delete folder)",						
						"tipo"				=> $tipo,
						"parent"			=> $parent,
						"top_id"			=> TOP_ID,
						"top_tipo"			=> TOP_TIPO,
						"video_id" 			=> $video_id,
						"quality" 			=> $quality
					)
			);
			
			echo "File ". $reelID . '.' . $AVObj->get_extension() . " deleted ! "  ;
			
		} catch (Exception $e) {
			echo 'Exception: ',  $e->getMessage(), "\n";
		}
	}		
	exit();	
}#END DELETE





/**
* FILE EXISTS
* Test if file exist (used to test when proccess version it finish -called every 5 seconds-)
* @param $video_id
* @param $quality
*/
if($mode=='file_exists') {

	$file_size = 0;
	#$file_name = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . '/' . $quality . '/' . $video_id . '.' . DEDALO_AV_EXTENSION;

	$reelID = $video_id;

	# AVOBJ
	$AVObj 		= new AVObj($reelID, $quality);
	$file_name	= $AVObj->get_local_full_path();

	if(file_exists($file_name)) {

		try {	
			$size		= @filesize($file_name) ;
			if(!$size)	throw new Exception('Unknow size!') ;

			$size_kb		= round($size / 1024) ;
		
			if($size_kb <= 1024) {
				$file_size 	= $size_kb . ' KB' ;
			}else{
				$file_size 	= round($size_kb / 1024) . ' MB' ;
			}
		} catch (Exception $e) {
			if(SHOW_DEBUG)
			echo '',  $e->getMessage(), "\n";
			#trigger_error( __METHOD__ . " " . $e->getMessage() , E_USER_NOTICE) ;			
		}			
	}
	#dump($file_name, "file_size $file_size");
	print $file_size;
	exit();
}#END FILE EXISTS



/**
* DOWNLOAD FILE
* Test if file exist (used to test end proccess version)
* @param $file_name
*/
if($mode=='download_file') {

	if (empty($video_id) || strlen($video_id)<4) {
		die("Error: video_id is not defined!");
	}
	if (empty($quality)) {
		die("Error: quality is not defined!");
	}
	if ( empty($parent) ) {
		throw new Exception("Error Processing Request. Few vars! (parent)", 1);
	}
	if ( empty($tipo) ) {
		throw new Exception("Error Processing Request. Few vars! (tipo)", 1);
	}

	$reelID = $video_id;

	# AVOBJ
	$AVObj = new AVObj($reelID, $quality);

	# LIB DOWNLOAD PREPARE
	# VARS FOR LIB 'donwload.php'
	$base_dir			= $AVObj->get_media_path_abs();	 #$AVObj->get_media_path(); 	
	$allowed_referrer	= DEDALO_HOST;
	$file_name			= $AVObj->get_name() . '.' . $AVObj->get_extension();
	$file_name_showed	= 'media_downloaded_' . $file_name ;

	# Extract tipo from video_id like dd732-1.mp4 => dd732
	$ar 	= explode('-', $video_id);
	$tipo 	= $ar[0];


	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	logger::$obj['activity']->log_message(
		'DOWNLOAD',
		logger::INFO,
		$tipo,
		NULL,
		array(	"msg"				=> "Downloaded av file",
				"tipo"				=> $tipo,
				"parent"			=> $parent,
				"top_id"			=> TOP_ID,
				"top_tipo"			=> TOP_TIPO,
				"video_id" 			=> $video_id,
				"quality" 			=> $quality
			)
	);

	# unlock session allows continue brosing
	session_write_close();

	# LOAD LIB 
	$page = DEDALO_LIB_BASE_PATH . '/media_engine/lib/download.php';
	require_once($page);

	exit();
}#END DOWNLOAD FILE



/**
* DONWLOAD_FRAGMENT
*/
if($mode=='download_fragment') {
	
	if (empty($video_id) || strlen($video_id)<4) {
		die("Error: video_id is not defined!");
	}
	if (empty($quality)) {
		die("Error: quality is not defined!");
	}
	if ( empty($parent) ) {
		throw new Exception("Error Processing Request. Few vars! (parent)", 1);
	}
	if ( empty($tipo) ) {
		throw new Exception("Error Processing Request. Few vars! (tipo)", 1);
	}
	if ( empty($top_tipo) ) {
		throw new Exception("Error Processing Request. Few vars! (top_tipo)", 1);
	}
	if ( empty($top_id) ) {
		throw new Exception("Error Processing Request. Few vars! (top_id)", 1);
	}


	if(empty($watermark)) $watermark = 0;

	$reelID = $video_id;

	# AVOBJ
	$AVObj = new AVObj($reelID, $quality);

	#$target_filename	= $codigo_captacion .'-'. $reelID .'-'. $index .'.'. $config['media']['extension'];
	$target_filename	= $AVObj->get_name() .'-'. $tag_id .'.'. $AVObj->get_extension();
		#dump($target_filename,"target_filename");


	# Ffmpeg
	$Ffmpeg				= new Ffmpeg();
	$command_response	= $Ffmpeg->build_fragment($AVObj, $tc_in, $tc_out, $target_filename, $watermark);
		#dump($command_response,'$command_response');
	
	# Extract tipo from video_id like dd732-1.mp4 => dd732
	$ar 	= explode('-', $video_id);
	$tipo 	= $ar[0];

	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	logger::$obj['activity']->log_message(
		'DOWNLOAD',
		logger::INFO,
		$tipo,
		NULL,
		#array("msg"=>"Downloaded av fragment file $video_id - quality $quality - tc_in:$tc_in : tc_out:$tc_out - tag_id:$tag_id - filename:$target_filename")
		array(	"msg"				=> "Downloaded av fragment",				
				"tipo"				=> $tipo,
				"parent"			=> $parent,
				"top_id"			=> $top_id,
				"top_tipo"			=> $top_tipo,				
				"video_id" 			=> $video_id,
				"quality" 			=> $quality,
				"tc_in" 			=> $tc_in,
				"tc_out" 			=> $tc_out,
				"tag_id" 			=> $tag_id
			)
	);

	if(!empty($command_response)) {
		# LIB DOWNLOAD PREPARE
		# VARS FOR LIB 'donwload.php'
		$base_dir			= $AVObj->get_media_path_abs().'/fragments';	 #$AVObj->get_media_path(); 	
		$allowed_referrer	= DEDALO_HOST;
		$file_name			= $AVObj->get_name() .'-'. $tag_id .'.'. $AVObj->get_extension();
		$file_name_showed	= $file_name ;

		# unlock session allows continue brosing
		session_write_close();

		# LOAD LIB 
		$page = DEDALO_LIB_BASE_PATH . '/media_engine/lib/download.php';
		require_once($page);

		exit();
	}

}#END DONWLOAD_FRAGMENT



?>