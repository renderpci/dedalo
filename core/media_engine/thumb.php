<?php
/**
* THUMP.PHP
* Genera una miniaura (thumb) a partir del path del fichero recibido en la url
* No debe pasarse en la variable el path completo, ni la calidad, solo el path adicional y el nombre del archivo con la terminación
* tipo '/0/0/75-1.jpg' o 'dd720-1'
*/
require_once( DEDALO_CORE_PATH .'/config.php');

# Write session to unlock session file
session_write_close();

$vars = array('f','initial_media_path');
	foreach($vars as $name)$$name = common::setVar($name);
#list($file,$ext) = explode('.',$_SERVER['QUERY_STRING']);

if(empty($f)) die("Error. Few arguments");


#if(file_exists(DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f)) unlink(DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f);


# THUMB FILE EXISTS TEST : Redirect to real existing image thumb
if (!file_exists( DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f )) {

	include( DEDALO_CORE_PATH . '/media_engine/class.ImageMagick.php');

	# SOURCE FILE
	$source = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_QUALITY_DEFAULT.'/'.$f;
	if (file_exists( $source )) {

		# TARGET FILE
		$target = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f;
		
		# CONVERT
		ImageMagick::dd_thumb('edit',$source, $target, false, $initial_media_path); // dd_thumb( $mode, $source_file, $target_file, $dimensions="102x57", $initial_media_path) 

		# URL THUMB FILE
		$url_thumb_file = DEDALO_MEDIA_BASE_URL.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f;

	}else{
		#throw new Exception("Error Processing Request. Sorry, source file from default quality (".DEDALO_IMAGE_QUALITY_DEFAULT.") not found", 1);
		# URL THUMB FILE
		$url_thumb_file = DEDALO_CORE_URL.'/themes/default/0.jpg';
	}	
}


#echo "<img src=\"$url_thumb_file\" />";die();

#header("HTTP/1.1 301 Moved Permanently"); 
header("Location: $url_thumb_file");
exit();



/*
http://debug:8888/dedalo4/lib/dedalo/media_engine/thumb.php?f=dd750-1.jpg
*/
?>