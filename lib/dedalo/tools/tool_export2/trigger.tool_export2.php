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

	$vars = array('section_tipo','columns','encoding','data_format');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	// component paths data are the old 'columns'
		$ar_paths = $columns;

	$tool_export2 = new tool_export2($section_tipo, 'edit', $data_format);

	// columns
		if (empty($columns)) {
			$response->msg = "Error: columns var is empty";
			return $response;
		}

	// data_format
		$response->data_format = $data_format;

	// Get records to export
		// formated an resolved columns from paths
			$columns = $tool_export2->get_columns($ar_paths, $section_tipo);
			#dump($columns, ' columns ++ '.to_string()); #die();
		// records from exec current search query object in session
			$records  = $tool_export2->get_records();
			#dump($records, ' records ++ '.to_string()); die();
		// parse records data and resolve deep inside relations
			$parsed = $tool_export2->parse_records($records, $ar_paths);
			#dump($parsed, ' parsed ++ '.to_string()); die();
		// rows. build multirows from records data
			$rows = $tool_export2->create_rows_from_parsed();
			dump($rows, ' rows ++ '.to_string());
			#die();
		// rows. build multirows from records data
			#$rows = $tool_export2->create_rows($parsed, $records, $columns);
			#dump($rows, ' rows ++ '.to_string());

	// csv string. Result is parsed as final string
		$result_string = $tool_export2->build_file($columns, $rows);

	// Write result to file (UTF8)
		$write_result = $tool_export2->write_result( $result_string );
		#dump($write_result, ' write_result ++ '.to_string());


	#// Result parsed as final string
	#	$result_string = $tool_export2->export_to('csv', $records, $encoding, $section_tipo);
	#	#dump(dd_memory_usage(), ' dd_memory_usage fin export_to ++ '.to_string());
	#	#error_log($result_string);
	#
	#// Write result to file (UTF8)
	#	$write_result = $tool_export2->write_result( $result_string );
	#	#dump($write_result, ' write_result ++ '.to_string());

	if ($write_result->result===true ) {

		// html table. Get csv file as table
			$table = tool_export2::read_csv_file_as_table( $write_result->path, true, null, false );

		// Build excel version (ISO-8859-1)
		// Write result to file (excel ISO-8859-1)
			if ($data_format!=='dedalo') {
				$change_encodig_to_ISO  = $tool_export2->change_encoding_from_uft8($result_string,'ISO-8859-1');
				$write_result_ISO 		= $tool_export2->write_result($change_encodig_to_ISO, 'excel_','csv');

				// ADD UTF8 with BOM
				$export_str_data = chr(239) . chr(187) . chr(191) . $table;
				$write_result_HTML 		= $tool_export2->write_result($export_str_data, 'html_','html');
			}

		// response
			$response->result 	= true;						// E.g. 'ok'
			$response->table 	= $table; 					// Table is created reading exported file
			$response->msg 		= $write_result->msg;		// E.g. 'Exported successfully'
			$response->url 		= $write_result->url; 		// E.g. 'http://mydomain/path/file.csv'

			if ($data_format!=='dedalo') {

				// excel version
					$change_encodig_to_ISO  = $tool_export2->change_encoding_from_uft8($result_string,'ISO-8859-1');
					// BOM. Prepend utf8 BOM for easy read from excel
					$export_str_data 		= chr(239) . chr(187) . chr(191) . $change_encodig_to_ISO;
					$write_result_ISO 		= $tool_export2->write_result($export_str_data, 'excel_','csv');
					$response->url_excel 	= $write_result_ISO->url; 	// E.g. 'http://mydomain/path/excel_file.csv'

				// html for excel version
					// BOM. Prepend utf8 BOM for easy read from excel
					$export_str_data 		= chr(239) . chr(187) . chr(191) . $table;
					$write_result_HTML 		= $tool_export2->write_result($export_str_data, 'html_','html');
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


