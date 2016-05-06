<?php
# SESSION LIFETIME
# Set session_duration_hours before load 'config' file (override default value)
$session_duration_hours = 24;

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( dirname(__FILE__) .'/class.tool_import_zotero.php');  # Read constants from here (pass url 'button_tipo' if needed)

if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print Error::wrap_error($string_error);
	die();
}

# set vars
$vars = array('mode','tipo','parent','checkbox_values');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode.. </span>");





/**
* PROCESS_FILE
* 
*/
if( $mode=='process_file' ) {

	#dump($checkbox_values, ' _REQUEST');die("stop");	
	if(!$checkbox_values) exit('Error: checkbox_values not defined');	
	#$file_data		= (array)$_SESSION['dedalo4']['config']['tool_import_zotero']; # Created on upload complete	(old mode)

	# Set special php global options
	#ob_implicit_flush(true);
	set_time_limit ( 32000 );	
	# Disable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = false;
	RecordObj_time_machine::$save_time_machine_version = false;

	$start_time= start_time();

	#
	# SEARCH FOR JSON ZOTERO FILE
	$ar_files = (array)glob(TOOL_IMPORT_ZOTERO_UPLOAD_DIR . '*.json');		
		if (empty($ar_files[0])) {
			echo "<div class=\"no_json_file_found\">Sorry. No JSON file exists. Please upload a zotero export file in JSON format.</div>";
			return;
		}
		if (count($ar_files)>1) {
			echo "<div class=\"no_json_file_found\">Sorry. Only one JSON file can be processed at once. Please, delete additional json files </div>";
			return;
		}
		#dump($ar_files, ' ar_files');exit();
		$file_data = json_decode(file_get_contents($ar_files[0]));	// @return expected: array of objects 
		#dump($file_data, ' file_data');#exit();

	$process_file = (array)tool_import_zotero::process_file($file_data, $checkbox_values);
	#echo "Ok process_file <hr>";
		#dump($process_file, ' process_file');#die();
	
	$html='';
	foreach ($process_file as $key => $obj_value) {

		$html .= '<table class="table_preview table_process">';
		$html .= '<caption>';		
		if (isset($obj_value->titulo)) {
			$html .= " <span>$obj_value->titulo</span> ";
		}
		$section_id 	= $key;
		$section_tipo 	= ZOTERO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA;	# 'rsc205'; # Bibliografia
		$url='?t='.$section_tipo.'&id='.$section_id;
		#$html .= "<a href=\"$url\" target=\"_blank\">$key</a>";
		$html .= "<div class=\"btn_inside_section_buttons_container button_go_to_file button_go_process\">";
		$html .= " <a href=\"$url\" target=\"_blank\">".label::get_label('ficha');
		#$html .= label::get_label('ver_ficha_existente');
		if(SHOW_DEBUG) {
			$html .= " [$section_id] section_tipo:$section_tipo";
		}
		$html .= "</div>";
		$html .= '</caption>';

		foreach ($obj_value as $key2 => $value) {
			if($key2=='titulo') continue;

			$html .= '<tr>';
			$html .= '<th>';
			$html .= "$key2";
			$html .= '</th>';

			$html .= '<td>';
			$html .= "$value";
			$html .= '</td>';
			$html .= '</tr>';
		}

		$html .= '</table><br>';

	}//end foreach ($process_file as $key => $obj_value) {

	# 
	# JSON FILE DELETE AFTER IMPORT
	if ( !unlink($ar_files[0]) ) {
		$html .= "<div class=\"info_processed_file\"><span class=\"error\">Error on remove JSON file ".pathinfo($ar_files[0])['basename']."</span></div>";
	}
	$html .= "<div class=\"info_processed_file\">Deleted JSON file ". pathinfo($ar_files[0])['basename']."</div>";


	echo $html;

	
	#
	# EXC INFO
	$exec_time 		= exec_time_unit($start_time, $unit='sec');
	$memory_usage 	= tools::get_memory_usage(false);	
	echo "<div class=\"info_processed_file\">Executing time: $exec_time secs - memory_usage: $memory_usage</div>";


	# Enable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = true;
	RecordObj_time_machine::$save_time_machine_version = true;


	#
	# Custom potprocessing file	
	if (!empty(tool_import_zotero::$process_script)) {
		$ar_section_id = array_keys($process_file);	// Keys are section id of each created/updated record
		include_once(DEDALO_LIB_BASE_PATH.''.tool_import_zotero::$process_script);
		if (function_exists('custom_process')) {
			custom_process( $ar_section_id );
		}
	}
	
	exit();
	
}#end if( $mode=='process_file' ) 








/**
* UPLOAD_FILE DESACTIVO
* 
*/
if( $mode=='upload_file DESACTIVO ' ) {

	if(!$tipo) exit('Error: tipo not defined');

	/* $_FILES DATA EXAMPLE
	Array(
	    [fileToUpload] => Array
	        (
	            [name] => My Library.json
	            [type] => application/json
	            [tmp_name] => /Applications/MAMP/tmp/php/phpREKygf
	            [error] => 0
	            [size] => 3826
	        )
	)
	*/

	#
	# File vars
	$f_name 		= $_FILES["fileToUpload"]['name'];
	$f_type 		= $_FILES["fileToUpload"]['type'];
	$f_temp_name	= $_FILES["fileToUpload"]['tmp_name'];
	$f_size			= $_FILES["fileToUpload"]['size'];
	$f_error		= $_FILES["fileToUpload"]['error'];
	$f_error_text 	= tool_upload::error_number_to_text($f_error);
	$f_extension 	= strtolower(pathinfo($f_name, PATHINFO_EXTENSION));

	if (!isset($f_error) || $f_error!==0) {
		exit('Error: upload file error: ['.$f_error.'] '.tool_upload::error_number_to_text($f_error) );
	}

	#
	# Extract json data from file
	$file_data 		= json_decode(file_get_contents($f_temp_name));	// @return expected: array of objects 
	if (empty($file_data) || !is_array($file_data)) {
		throw new Exception("Error Processing Request. Empty or invalid file is loaded [$f_name] type:$f_type, size:$f_size bytes", 1);		
	}

	#
	# Session store array data
	$_SESSION['dedalo4']['config']['tool_import_zotero'] = $file_data;


	if(SHOW_DEBUG) {
		#dump($_SESSION['dedalo4']['config']['tool_import_zotero'], ' file_data');die();
	}
	

	echo "Ok. File '$f_name' uploaded successfully. <br><h1>Please wait for preview..<h1>";
	exit();

}#end if( $mode=='upload_file' ) 







die("Sorry. Mode ($mode) not supported")
?>