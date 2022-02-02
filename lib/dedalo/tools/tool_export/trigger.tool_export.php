<?php
$start_time=microtime(1);
set_time_limit ( 259200 );  // 3 dias
$session_duration_hours = 72;
include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* EXPORT_DATA
*
*/
function export_data($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('section_tipo','columns','encoding','data_format','section_list_custom');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='section_list_custom') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$tool_export  = new tool_export($section_tipo, 'edit', $data_format);

	// layout_map
		$layout_map = tool_export::columns_to_layout_map($columns, $section_tipo);
		if (empty($layout_map)) {
			$response->msg = "Error: layout_map is empty";
			return $response;
		}

	// custom section list
		$tool_export->section_list_custom = $section_list_custom;

	// data_format
		$response->data_format = $data_format;

	// Get records to export
		$records = $tool_export->get_records( $layout_map );
			// dump($records, ' records ++ '.to_string());

	// Result parsed as final string
		$result_string = $tool_export->export_to('csv', $records, $encoding='UTF-8', $section_tipo);
		#dump(dd_memory_usage(), ' dd_memory_usage fin export_to ++ '.to_string());
		#error_log($result_string);

	// Write result to file (UTF8)
		$write_result = $tool_export->write_result( $result_string );
		#dump($write_result, ' write_result ++ '.to_string());


	if ($write_result->result===true ) {

		// html table. Get csv file as table. ($file, $header=false, $delimiter=null, $standalone=false)
			$table = tool_export::read_csv_file_as_table( $write_result->path, true, null, false, $data_format );

		// Build excel version (ISO-8859-1)
		// Write result to file (excel ISO-8859-1)
			if ($data_format!=='dedalo') {
				$change_encodig_to_ISO  = $tool_export->change_encoding_from_uft8($result_string,'ISO-8859-1');
				$write_result_ISO 		= $tool_export->write_result($change_encodig_to_ISO, 'excel_','csv');

				// ADD UTF8 with BOM
				$export_str_data = chr(239) . chr(187) . chr(191) . $table;
				$write_result_HTML 		= $tool_export->write_result($export_str_data, 'html_','html');
			}

		// response
			$response->result 	= true;						// E.g. 'ok'
			$response->table 	= $table; 					// Table is created reading exported file
			$response->msg 		= $write_result->msg;		// E.g. 'Exported successfully'
			$response->url 		= $write_result->url; 		// E.g. 'http://mydomain/path/file.csv'

			if ($data_format!=='dedalo') {

				// excel version
					$change_encodig_to_ISO  = $tool_export->change_encoding_from_uft8($result_string,'ISO-8859-1');
					// BOM. Prepend utf8 BOM for easy read from excel
					$export_str_data 		= chr(239) . chr(187) . chr(191) . $change_encodig_to_ISO;
					$write_result_ISO 		= $tool_export->write_result($export_str_data, 'excel_','csv');
					$response->url_excel 	= $write_result_ISO->url; 	// E.g. 'http://mydomain/path/excel_file.csv'

				// html for excel version
					// BOM. Prepend utf8 BOM for easy read from excel
					$export_str_data 		= chr(239) . chr(187) . chr(191) . $table;
					$write_result_HTML 		= $tool_export->write_result($export_str_data, 'html_','html');
					$response->url_html 	= $write_result_HTML->url; 	// E.g. 'http://mydomain/path/excel_file.csv'
			}

	}else{

		// response
			$response->msg 		= 'Error on write file: '.$write_result->msg;
	}


	// debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


	return (object)$response;
}//end export_data



?>
