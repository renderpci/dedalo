<?php
# SESSION LIFETIME
# Set session_duration_hours before load 'config' file (override default value)
#$session_duration_hours = 2;
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( dirname(__FILE__) .'/class.tool_export.php');

if(login::is_logged()!==true) {
	$string_error = "Auth error: please login";
	print Error::wrap_error($string_error);
	die();
}

# set vars
$vars = array('mode','section_tipo','columns');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode.. </span>");



/**
* EXPORT_DATA
*/
if ($mode=='export_data') {
	
	# Verify mandatory vars
	if (empty($section_tipo) || empty($columns)) {
		exit("Error: Sorry few vars");
	}

	# Write session to unlock session file
	session_write_close();	

	$tool_export  = new tool_export($section_tipo,'edit');

	$layout_map = tool_export::columns_to_layout_map($columns, $section_tipo);
		#dump($layout_map, ' $layout_map ++ '.to_string($columns));
	if (empty($layout_map)) {
		exit("Error: Sorry layout_map is empty");
	}

	$records = $tool_export->get_records( $layout_map );
		#dump($records, ' records ++ '.to_string());

	$result_string = $tool_export->export_to('csv', $records);
		#dump($result, ' result ++ '.to_string());

	$write_result = $tool_export->write_result( $result_string );
		#dump($write_result, ' write_result ++ '.to_string());	
	

	if ($write_result->result=='ok') {

		#
		# GET CSV FILE AS TABLE
		$table = tool_export::read_csv_file_as_table( $write_result->path, true, null, false );		 
		
		$response = new stdClass();
			$response->result 	= 'ok';						// E.g. 'ok'
			$response->msg 		= $write_result->msg;		// E.g. 'Exported successfully'
			$response->url 		= $write_result->url; 		// E.g. 'http://mydomain/path/file.csv'
			$response->table 	= $table; 					// Table is created reading exported file

	}else{

		$response = new stdClass();
			$response->result 	= 'error';	
			$response->msg 		= 'Error on write file: '.$write_result->msg;		
	}

	echo json_encode($response);
	exit();
	

}//end if ($mode=='export_data') {



die("Sorry. Mode ($mode) not supported");
?>