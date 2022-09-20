<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PdfObj.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* DELETE VERSION
*/
if($mode=='delete_version') {

	// vars
		$vars = array('pdf_id','quality','aditional_path','initial_media_path','tipo','parent','section_tipo');
		if(is_array($vars)) foreach($vars as $name) {
			$$name = common::setVar($name);
		}
		if (empty($pdf_id) || strlen($pdf_id)<4) {
			throw new Exception("Error Processing Request. Few vars! (pdf_id)", 1);
		}
		if (empty($quality)) {
			throw new Exception("Error Processing Request. Few vars! (quality)", 1);
		}
		if (empty($parent)) {
			throw new Exception("Error Processing Request. Few vars! (parent)", 1);
		}
		if (empty($section_tipo)) {
			throw new Exception("Error Processing Request. Few vars! (section_tipo)", 1);
		}

	// folder_path
		$PdfObj				= new PdfObj($pdf_id, $quality, $aditional_path, $initial_media_path);
		$folder_path		= $PdfObj->get_media_path_abs(); # include / final
		$folder_path_del	= $folder_path . 'deleted/';

	// file_exists
		if (defined('DEDALO_PDF_QUALITY_ORIGINAL') && $quality===DEDALO_PDF_QUALITY_ORIGINAL) {
			// component
			$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component		= component_common::get_instance(
				$modelo_name,
				$tipo,
				$parent,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);

			$file_name		= $component->get_original(DEDALO_PDF_QUALITY_ORIGINAL);
			$file			= $folder_path . $file_name;
			$file_exists	= !empty($file_name);

		}else{

			// file
			$file_name		= $PdfObj->get_name() 	 . '.' . $PdfObj->get_extension();
			$file			= $folder_path . $pdf_id . '.' . $PdfObj->get_extension();
			$file_exists	= file_exists($file);
		}

	if($file_exists===true) {

		try{

			# delete folder exists ?
			if( !is_dir($folder_path_del) ) {
			$create_dir = mkdir($folder_path_del, 0777, true);
			if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied . The files are not deleted") ;
			}

			# delete folder set permissions
			$wantedPerms	= 0777;
			$actualPerms	= fileperms($folder_path_del);
			if($actualPerms < $wantedPerms) chmod($folder_path_del, $wantedPerms);

			# move / rename file
			$ext_from_name	= pathinfo($file_name, PATHINFO_EXTENSION);
			$rename_name	= $folder_path_del .''. $pdf_id . '_deleted_' . date("Y-m-d") . '.' . $ext_from_name;
			$rename			= rename($file, $rename_name);
			if(!$rename) 	throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");

			// debug
			debug_log(__METHOD__." Deleted file ".PHP_EOL."$file".PHP_EOL."Renamed and moved to ".PHP_EOL."$rename_name ".to_string(), logger::WARNING);

			# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'DELETE FILE',
				logger::INFO,
				$tipo,
				NULL,
				array(
					'msg'		=> 'Deleted pdf file (file is renamed and moved to delete folder)',
					'tipo'		=> $tipo,
					'parent'	=> $parent,
					'top_id'	=> TOP_ID,
					'top_tipo'	=> TOP_TIPO,
					'pdf_id'	=> $pdf_id,
					'quality'	=> $quality
				)
			);

			echo "File ". $pdf_id . '.' . $PdfObj->get_extension() . " deleted ! "  ;

		} catch (Exception $e) {
			echo 'Exception: ',  $e->getMessage(), "\n";
		}
	}

	exit();
}//end delete


/**
* FILE EXISTS
* Test if file exist (used to test when process version it finish -called every 5 seconds-)
* @param $pdf_id
*/
if($mode=='file_exists') {

	# set vars
	$vars = array('pdf_id','quality','aditional_path','initial_media_path');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

	$file_size = 0;

	# PdfObj
	$PdfObj 	= new PdfObj($pdf_id, $quality, $aditional_path, $initial_media_path);
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
}//end file exists



/**
* DOWNLOAD FILE
* @param $pdf_id
*/
if($mode=='download_file') {

	// vars
		$vars = array('pdf_id','quality','aditional_path','initial_media_path','tipo','parent','section_tipo');
		if(is_array($vars)) foreach($vars as $name) {
			$$name = common::setVar($name);
		}

		if (empty($pdf_id) || strlen($pdf_id)<4) {
			die("Error: pdf_id is not defined!");
		}
		if (empty($quality)) {
			die("Error: quality is not defined!");
		}
		if (empty($parent)) {
			throw new Exception("Error Processing Request. Few vars!", 1);
		}


	# PdfObj
	$PdfObj = new PdfObj($pdf_id, $quality, $aditional_path, $initial_media_path);

	# LIB DOWNLOAD PREPARE
	# VARS FOR LIB 'donwload.php'
	$base_dir			= $PdfObj->get_media_path_abs();	 #$PdfObj->get_media_path();
	$allowed_referrer	= DEDALO_HOST;

	// file
		if (defined('DEDALO_PDF_QUALITY_ORIGINAL') && $quality===DEDALO_PDF_QUALITY_ORIGINAL) {
			// component
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component = component_common::get_instance(
				$modelo_name,
				$tipo,
				$parent,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);

			$file_name = $component->get_original(DEDALO_PDF_QUALITY_ORIGINAL);
		}else{
			$file_name = $PdfObj->get_name() . '.' . $PdfObj->get_extension();
		}
		// file_name_showed
		$file_name_showed = 'media_downloaded_' . $file_name;
		debug_log(__METHOD__." Downloading file $file_name. Renamed as '$file_name_showed' ".to_string(), logger::WARNING);

	# LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
	logger::$obj['activity']->log_message(
		'DOWNLOAD',
		logger::INFO,
		$tipo,
		NULL,
		array(
			'msg'			=> 'Downloaded pdf file',
			'tipo'			=> $tipo,
			'section_tipo'	=> $section_tipo,
			'parent'		=> $parent,
			'top_id'		=> TOP_ID,
			'top_tipo'		=> TOP_TIPO,
			'pdf_id'		=> $pdf_id,
			'quality'		=> $quality
		)
	);

	# unlock session allows continue browsing
	session_write_close();

	# LOAD LIB
	$page = DEDALO_LIB_BASE_PATH . '/media_engine/lib/download.php';
	require_once($page);

	exit();
}//end download
