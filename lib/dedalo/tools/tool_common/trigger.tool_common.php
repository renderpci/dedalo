<?php
#set_time_limit ( 259200 );  // 3 dias

// JSON DOCUMENT
header('Content-Type: application/json');

#$session_duration_hours = 72;
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');

# Write session to unlock session file
session_write_close();


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

# set vars
$vars = array('mode');
	foreach($vars as $name) $$name = common::setVar($name);

# mode
	if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# CALL FUNCTION
if ( function_exists($mode) ) {
	$result = call_user_func($mode);
	echo json_encode($result);
}


/**
* UPLOAD_FILE
* Received data is like
	[file_to_upload] => Array
    (
        [name] => descriptors.csv
        [type] => text/csv
        [tmp_name] => /private/var/folders/3v/cmt7_czs1pg_3kfp6y85pnm00000gn/T/phpiSaQJ4
        [error] => 0
        [size] => 13355484
    )
*
*/
function upload_file() {

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed upload_file';

	# vars
	$vars = array('target_file_path','target_file_name');
		foreach($vars as $name) $$name = common::setVar($name);
	
		if (empty($target_file_path)) {
			$response->msg = 'Error. Request failed upload_file. Mandatory var is empty: target_file_path ';
			return $response;
		}
		if (empty($target_file_name)) {
			$response->msg = 'Error. Request failed upload_file. Mandatory var is empty: target_file_name ';
			return $response;
		}

	# FILE_VARS
	$file_vars = $_FILES['file_to_upload'];

	$error_number = $file_vars['error'];
	if ($error_number>0) {
		$response->msg = 'Error. Request failed upload_file. error_number '.$error_number;
		return $response;
	}
	
	$file_name 	= $file_vars['name'];
	$file_type 	= $file_vars['type'];
	$file_tmp 	= $file_vars['tmp_name'];
	$file_size 	= $file_vars['size'];

	$file_final_path = $target_file_path .'/'. $target_file_name;

	# Test target folder. Create if not exists
	$folder_path = $target_file_path;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700,true)) {
			$response->msg = 'Error. Error on create dir: '.$folder_path;
			return $response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}

	# Move file
	if (move_uploaded_file($file_tmp, $file_final_path)===false) {
		$response->msg ="Error on move tmp file to: " . $file_final_path;
		return $response;
	}
	/*
	dump($vars, ' vars ++ '.to_string());
	
	dump($_REQUEST, ' $_REQUEST ++ ** '.to_string());
	dump($_FILES, ' _FILES ++ ** '.to_string());
	*/

	$file_size_mb 		= ceil($file_size/1024/1024); 

	$response->result 	= $file_final_path;
	$response->msg 		= "Ok. File uploaded. [MB: $file_size_mb]";

	return $response;
}//end upload_file











?>