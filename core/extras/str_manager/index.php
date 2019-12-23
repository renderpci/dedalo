<?php
/**
* STR_MANAGER
* Get requested str_data from extras dir and send as download file
* Used for master entity for get structure files
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
require_once( DEDALO_LIB_BASE_PATH . '/backup/class.backup.php');

// DATA . The only one var received is a json encoded var called "data"
	$data = json_decode($_REQUEST['data']);

// CODE auth. Check valid code match, received with config defined STRUCTURE_SERVER_CODE
// If not is the same, return error code 401 and exit
	if (!$data || $data->code!==STRUCTURE_SERVER_CODE) {
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

// file size in bytes
	$fsize = filesize($file_path);

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
