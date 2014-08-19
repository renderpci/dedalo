<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PdfObj.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','pdf_id','quality','source_quality','target_quality','tipo','id_matrix','parent');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");






/**
* DELETE VERSION
*/
if($mode=='delete_version') {
	
	if (empty($pdf_id) || strlen($pdf_id)<4) {
		throw new Exception("Error Processing Request. Few vars! (pdf_id)", 1);
	}
	if (empty($quality)) {
		throw new Exception("Error Processing Request. Few vars! (quality)", 1);
	}
	if ( empty($parent) ) {
		throw new Exception("Error Processing Request. Few vars! (parent)", 1);
	}
	if ( empty($id_matrix) ) {
		throw new Exception("Error Processing Request. Few vars! (id_matrix)", 1);
	}
	
	$PdfObj 			= new PdfObj($pdf_id, $quality);		
	$folder_path		= $PdfObj->get_media_path_abs(); # incluye / final
	$folder_path_del	= $folder_path . "deleted/";
	$file				= $folder_path . $pdf_id . '.' . $PdfObj->get_extension();
	
	if(file_exists($file)) {
		
		try{
			
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
			$rename 		= rename($file, $folder_path_del . "/$pdf_id" . '_deleted_' . date("Y-m-d") . '.' . $PdfObj->get_extension() );
			if(!$rename) 	throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");	
			
			# Extract tipo from pdf_id like dd732-1.mp4 => dd732
			$ar 	= explode('-', $pdf_id);
			$tipo 	= $ar[0];

			$top_id 	= $_SESSION['config4']['top_id'];
			$top_tipo 	= $_SESSION['config4']['top_tipo'];
			
			# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'DELETE FILE',
				logger::INFO,
				$tipo,
				NULL,
				array(	"msg"				=> "Deleted pdf file (file is renamed and moved to delete folder)",
						"id" 				=> $id_matrix,
						"tipo"				=> $tipo,
						"parent"			=> $parent,
						"top_id"			=> $top_id,
						"top_tipo"			=> $top_tipo,
						"pdf_id" 			=> $pdf_id,
						"quality" 			=> $quality
					)
			);
			
			echo "File ". $pdf_id . '.' . $PdfObj->get_extension() . " deleted ! "  ;
			
		} catch (Exception $e) {
			echo 'Exception: ',  $e->getMessage(), "\n";
		}
	}		
	exit();	
}#end delete


/**
* FILE EXISTS
* Test if file exist (used to test when proccess version it finish -called every 5 seconds-)
* @param $pdf_id
*/
if($mode=='file_exists') {

	$file_size = 0;

	# PdfObj
	$PdfObj 	= new PdfObj($pdf_id, $quality);
	$file_name	= $PdfObj->get_local_full_path();

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
}#end file exists


/**
* DOWNLOAD FILE
* @param $pdf_id
*/
if($mode=='download_file') {	

	if (empty($pdf_id) || strlen($pdf_id)<4) {
		die("Error: pdf_id is not defined!");
	}
	if (empty($quality)) {
		die("Error: quality is not defined!");
	}
	if ( empty($parent) ) {
		throw new Exception("Error Processing Request. Few vars!", 1);
	}
	if ( empty($id_matrix) ) {
		throw new Exception("Error Processing Request. Few vars!", 1);
	}

	# PdfObj
	$PdfObj = new PdfObj($pdf_id, $quality);

	# LIB DOWNLOAD PREPARE
	# VARS FOR LIB 'donwload.php'
	$base_dir			= $PdfObj->get_media_path_abs();	 #$PdfObj->get_media_path();
	$allowed_referrer	= DEDALO_HOST;
	$file_name			= $PdfObj->get_name() . '.' . $PdfObj->get_extension();
	$file_name_showed	= 'media_downloaded_' . $file_name ;

	# Extract tipo from pdf_id like dd732-1.mp4 => dd732
	$ar 	= explode('-', $pdf_id);
	$tipo 	= $ar[0];

	$top_id 		= $_SESSION['config4']['top_id'];
	$top_tipo 		= $_SESSION['config4']['top_tipo'];

	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	logger::$obj['activity']->log_message(
		'DOWNLOAD',
		logger::INFO,
		$tipo,
		NULL,
		array(	"msg"				=> "Downloaded pdf file",
				"id" 				=> $id_matrix,
				"tipo"				=> $tipo,
				"parent"			=> $parent,
				"top_id"			=> $top_id,
				"top_tipo"			=> $top_tipo,
				"pdf_id" 			=> $pdf_id,
				"quality" 			=> $quality
			)
	);

	# unlock session allows continue brosing
	session_write_close();

	# LOAD LIB 
	$page = DEDALO_LIB_BASE_PATH . '/media_engine/lib/download.php';
	require_once($page);

	exit();
}#end download





?>