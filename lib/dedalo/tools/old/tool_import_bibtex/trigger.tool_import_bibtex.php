<?php
# SESSION LIFETIME
# Set session_duration_hours before load 'config' file (override default value)
$session_duration_hours = 24;

require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( dirname(__FILE__) .'/class.tool_import_bibtex.php');  # Read constants from here (pass url 'button_tipo' if needed)

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
		#dump($checkbox_values, ' checkbox_values ++ '.to_string()); die();

	# Set special php global options
	#ob_implicit_flush(true);
	set_time_limit ( 32000 );	
	# Disable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = false;
	RecordObj_time_machine::$save_time_machine_version = false;

	$start_time= start_time();

	#
	# SEARCH FOR JSON ZOTERO FILE
	$ar_files = (array)glob(TOOL_IMPORT_BIBTEX_UPLOAD_DIR . '*.bib');		
		if (empty($ar_files[0])) {
			echo "<div class=\"no_bib_file_found\">Sorry. No BIB file exists. Please upload a BIBtex exported file in BIB format.</div>";
			return;
		}
		if (count($ar_files)>1) {
			echo "<div class=\"no_bib_file_found\">Sorry. Only one BIB file can be processed at once. Please, delete additional BIB files </div>";
			return;
		}
		#dump($ar_files, ' ar_files');exit();
		#$file_data = file_get_contents($ar_files[0]);	// @return expected: array of objects 
		$file_data = tool_import_bibtex::parse_bibex($ar_files[0], null);
			#dump($file_data, ' file_data' . to_string($ar_files)); exit();		


	$process_file_result = (array)tool_import_bibtex::process_file($file_data, $checkbox_values);
	#echo "Ok process_file <hr>";
		#dump($process_file_result, ' process_file');#die();
	
	$html='';
	foreach ($process_file_result as $key => $obj_value) {

		$html .= '<table class="table_preview table_process">';
		$html .= '<caption>';		
		if (isset($obj_value->titulo)) {
			$html .= " <span>$obj_value->titulo</span> ";
		}
		$section_id 	= $key;
		$section_tipo 	= BIBLIO_SECTION_TIPO_VIRTUAL_BIBLIOGRAFIA;	# 'rsc205'; # Bibliografia
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

	}//end foreach ($process_file_result as $key => $obj_value) {

	# 
	# JSON FILE DELETE AFTER IMPORT
	if ( !unlink($ar_files[0]) ) {
		$html .= "<div class=\"info_processed_file\"><span class=\"error\">Error on remove BIBtex file ".pathinfo($ar_files[0])['basename']."</span></div>";
	}
	$html .= "<div class=\"info_processed_file\">Deleted BIBtex file ". pathinfo($ar_files[0])['basename']."</div>";


	echo $html;

	
	#
	# EXC INFO
	$exec_time 		= exec_time_unit($start_time, $unit='sec');
	$memory_usage 	= tools::get_memory_usage(false);	
	echo "<div class=\"info_processed_file\">Executing time: $exec_time secs - memory_usage: $memory_usage</div>";


	# Enable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = true;
	RecordObj_time_machine::$save_time_machine_version = true;


	# Custom potprocessing file	
	if (!empty(tool_import_bibtex::$process_script)) {
		$ar_section_id = array_keys($process_file_result);	// Keys are section id of each created/updated record
		include_once(DEDALO_LIB_BASE_PATH.''.tool_import_bibtex::$process_script);
		if (function_exists('custom_process')) {
			custom_process( $ar_section_id );
		}
	}
	
	exit();
	
}#end if( $mode=='process_file' ) 








die("Sorry. Mode ($mode) not supported")
?>