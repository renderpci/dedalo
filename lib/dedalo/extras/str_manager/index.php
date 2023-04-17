<?php
/**
* STR_MANAGER
* Get requested str_data from extras dir and send as download file
* Used for master entity for get structure files
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/backup/class.backup.php');

session_write_close();

// DATA . The only one var received is a json encoded var called "data"
	$data = json_decode($_REQUEST['data']);

// CODE auth. Check valid code match, received with config defined STRUCTURE_SERVER_CODE
// If not is the same, return error code 401 and exit
	$valid_codes = defined('STRUCTURE_SERVER_CODE_OTHERS')
		? STRUCTURE_SERVER_CODE_OTHERS
		: [];
	$valid_codes[] = STRUCTURE_SERVER_CODE;	 // add main code
	if (!$data || !in_array($data->code, $valid_codes)) {
		http_response_code(401); // Unauthorized
		exit();
	}

// Check connection only
	if (property_exists($data, "check_connection")) {
		http_response_code(200); // Ok
		exit();
	}

// SELECTED_OBJ. Get local str files info (paths, names, etc.) to find the requested
	$selected_obj  = null;
	$all_str_files = backup::collect_all_str_files();
	foreach ($all_str_files as $key => $obj) {
		if ($data->name === $obj->name) {
			$selected_obj = $all_str_files[$key];
			break;
		}
	}
	if (is_null($selected_obj)) {
		http_response_code(400); // Bad request
		exit();
	}

// file info
	$file_name 	= $selected_obj->name;
	$file_path 	= $selected_obj->path .'/'. $selected_obj->name;

// check file
	$file_found = file_exists($file_path);
	if (!$file_found) {
		debug_log(__METHOD__." Trying to get structure from a non-existing file: ".to_string($file_path), logger::ERROR);
	}

// file size in bytes
	$fsize = ($file_found)
		? filesize($file_path)
		: 0;

// set headers
	header("Pragma: public");
	header("Expires: 0");
	header("Cache-Control: must-revalidate, post-check=0, pre-check=0");
	header("Cache-Control: public");
	header("Content-Type: application/octet-stream");
	//header("Content-Description: File Transfer");
	//header("Content-Disposition: attachment; filename=\"$file_name\"");
	header("Content-Transfer-Encoding: binary");
	header("Content-Length: " . $fsize);

// download
	$file = @fopen($file_path,"rb");
	if ($file) {
		while(!feof($file)) {
			print(fread($file, 1024*8));
			flush();
			if (connection_status()!=0) {
				@fclose($file);
				die();
			}
		}
		@fclose($file);
	}
