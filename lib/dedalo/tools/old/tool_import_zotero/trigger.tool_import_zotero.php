<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
common::trigger_manager();



/**
* PROCESS_FILE
* @return object $response
*/
function process_file($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed '.__METHOD__;

	$vars = array('checkbox_values');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			if (empty($$name)) {
				$response->msg = 'Error. Empty mandatory var '.$name;
				return $response;
			}
		}

	# Read constants from here (pass url 'button_tipo' if needed)
	require_once( dirname(__FILE__) .'/class.tool_import_zotero.php');

	set_time_limit ( 32000 );	
	# Disable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = false;
	RecordObj_time_machine::$save_time_machine_version = false;

	#
	# SEARCH FOR JSON ZOTERO FILE
	$ar_files = (array)glob(TOOL_IMPORT_ZOTERO_UPLOAD_DIR . '*.json');		
		if (empty($ar_files[0])) {
			# echo "<div class=\"no_json_file_found\">Sorry. No JSON file exists. Please upload a zotero export file in JSON format.</div>";
			$response->msg = '<div class="no_json_file_found">Sorry. No JSON file exists. Please upload a zotero export file in JSON format.</div>';
			return $response;
		}
		if (count($ar_files)>1) {
			#echo "<div class=\"no_json_file_found\">Sorry. Only one JSON file can be processed at once. Please, delete additional json files </div>";
			$response->msg = '<div class="no_json_file_found">Sorry. Only one JSON file can be processed at once. Please, delete additional json files </div>';
			return $response;
		}
		$file_data = json_decode(file_get_contents($ar_files[0]));	// @return expected: array of objects 

	$process_file = (array)tool_import_zotero::process_file($file_data, $checkbox_values);
		
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
		$html .= "<div class=\"btn_inside_section_buttons_container button_go_to_file button_go_process\">";
		$html .= " <a href=\"$url\" target=\"_blank\">".label::get_label('ficha');
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

	}//end foreach ($process_file as $key => $obj_value)

	# 
	# JSON FILE DELETE AFTER IMPORT
	if ( !unlink($ar_files[0]) ) {
		$html .= "<div class=\"info_processed_file\"><span class=\"error\">Error on remove JSON file ".pathinfo($ar_files[0])['basename']."</span></div>";
	}
	$html .= "<div class=\"info_processed_file\">Deleted JSON file ". pathinfo($ar_files[0])['basename']."</div>";


	$response->result 	= true;
	$response->msg 	  	= 'Request done successfully';
	$response->html 	= $html;
	
	#
	# EXC INFO
	#$exec_time 		= exec_time_unit($start_time, $unit='sec');
	#$memory_usage 	= tools::get_memory_usage(false);	
	#echo "<div class=\"info_processed_file\">Executing time: $exec_time secs - memory_usage: $memory_usage</div>";


	# Enable logging activity and time machine # !IMPORTANT
	logger_backend_activity::$enable_log = true;
	#RecordObj_time_machine::$save_time_machine_version = true;


	#
	# Custom potprocessing file	
	if (!empty(tool_import_zotero::$process_script)) {
		$ar_section_id = array_keys($process_file);	// Keys are section id of each created/updated record
		include_once(DEDALO_LIB_BASE_PATH.''.tool_import_zotero::$process_script);
		if (function_exists('custom_process')) {
			custom_process( $ar_section_id );
		}
	}


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
}//end process_file



?>