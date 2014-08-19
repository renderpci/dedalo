<?php
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.ImageObj.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','image_id','quality','source_quality','target_quality','timecode');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);	
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* GENERATE VERSION
* Build a minor quality version of current file (from 404 to 'audio' for example)
* @param $source_quality
* @param $target_quality
* @param $image_id
*/
if($mode=='generate_version') {

	if (empty($source_quality)) {
		return "Error: source_quality is not defined!";
	}
	if (empty($target_quality)) {
		return "Error: target_quality is not defined!";
	}
	if (empty($image_id) || strlen($image_id)<4) {
		return "Error: image_id is not defined!";
	}

	$quality 	= $target_quality ;
			
	# ImageObj
	$ImageObj			= new ImageObj($image_id, $quality);
	
	# Ffmpeg
	$Ffmpeg			= new Ffmpeg();
	$setting_name	= $Ffmpeg->get_setting_name_from_quality($ImageObj, $quality);		#dump($setting_name,'setting_name'); #die($setting_name);
	$render			= $Ffmpeg->create_av_alternate($ImageObj, $setting_name);

	# Extract tipo from image_id like dd732-1.mp4 => dd732
	$ar 	= explode('-', $image_id);
	$tipo 	= $ar[0];
	
	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	logger::$obj['activity']->log_message(
		'NEW',
		logger::INFO,
		$tipo,
		NULL,
		array("msg"=>"Generating av file $image_id - quality $quality from $source_quality")
	);
	
	
	$html = "Processing media in background (target quality: $quality - setting: $setting_name). You can continue working" ;
	if(SHOW_DEBUG) {
		$html .= "<div class=\"debug_info\">Debug Command response: $render </div>" ;
	}	

	print $html;
	die();
}


/**
* DELETE VERSION
*/
if($mode=='delete_version') {
	
	if (empty($image_id) || strlen($image_id)<4) {
		return "Error: image_id is not defined!";
	}
	if (empty($quality)) {
		return "Error: quality is not defined!";
	}
	
	$ImageObj 			= new ImageObj($image_id, $quality);
	$folder_path		= $ImageObj->get_media_path_abs(); # incluye / final
	$folder_path_del	= $folder_path . "deleted/";
	$file				= $folder_path . $image_id . '.' . $ImageObj->get_extension();
	
	if(file_exists($file)) {
		
		try{
			
			# delete folder exists ?	
			if( !is_dir($folder_path_del) ) {
			$create_dir 	= mkdir($folder_path_del, 0777);
			if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied . The files are not deleted") ;
			}
			
			# delete folder set permissions
			$wantedPerms 	= 0777;
			$actualPerms 	= fileperms($folder_path_del);
			if($actualPerms < $wantedPerms) chmod($folder_path_del, $wantedPerms);
			
			# move / rename file
			$rename 		= rename($file, $folder_path_del . "/$image_id" . '_deleted_' . date("Y-m-d") . '.' . $ImageObj->get_extension() );
			if(!$rename) 	throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");
			
			# DELETE TEMP SH FILE
			$tmp_file		= DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER . "/tmp/".$quality.'_'.$image_id.'.sh';	
			if(file_exists($tmp_file)) {
			$del_sh			= unlink($tmp_file);
			if(!$del_sh) 	throw new Exception(" Error on delete temp file . Temp file is not deleted");
			}

			# Extract tipo from image_id like dd732-1.mp4 => dd732
			$ar 	= explode('-', $image_id);
			$tipo 	= $ar[0];
			
			# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'DELETE',
				logger::INFO,
				$tipo,
				NULL,
				array("msg"=>"Deleted image file $image_id - quality $quality (file is renamed and moved to delete folder)")
			);
			
			echo "File ". $image_id . '.' . $ImageObj->get_extension() . " deleted ! "  ;
			
		} catch (Exception $e) {
			echo 'Exception: ',  $e->getMessage(), "\n";
		}
	}		
	exit();	
}


/**
* FILE EXISTS
* Test if file exist (used to test when proccess version it finish -called every 5 seconds-)
* @param $image_id
* @param $quality
*/
if($mode=='file_exists') {

	$file_size = 0;
	$file_name = DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER . '/' . $quality . '/' . $image_id . '.' . DEDALO_IMAGE_EXTENSION;	

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
	die();
}


/**
* DOWNLOAD FILE
* Donwload phisical file in current quality
* @param $image_id
* @param $quality
*/
if($mode=='download_file') {	

	if (empty($image_id) || strlen($image_id)<4) {
		die("Error: image_id is not defined!");
	}
	if (empty($quality)) {
		die("Error: quality is not defined!");
	}

	$image_id = $image_id;

	# ImageOBJ
	$ImageObj = new ImageObj($image_id, $quality);

	# LIB DOWNLOAD PREPARE
	# VARS FOR LIB 'donwload.php'
	$base_dir			= $ImageObj->get_media_path_abs();	 #$ImageObj->get_media_path(); 	
	$allowed_referrer	= DEDALO_HOST;
	$file_name			= $ImageObj->get_name() . '.' . $ImageObj->get_extension();
	$file_name_showed	= 'media_downloaded_' . $file_name ;

	# Extract tipo from image_id like dd732-1.mp4 => dd732
	$ar 	= explode('-', $image_id);
	$tipo 	= $ar[0];

	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	logger::$obj['activity']->log_message(
		'NEW',
		logger::INFO,
		$tipo,
		NULL,
		array("msg"=>"Download image file $image_id - quality $quality")
	);


	# unlock session allows continue brosing
	session_write_close();

	# LOAD LIB 
	$page = DEDALO_LIB_BASE_PATH . '/media_engine/lib/download.php';
	require_once($page);

	die();
}






?>