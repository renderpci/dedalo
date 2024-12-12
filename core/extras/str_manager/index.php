<?php declare(strict_types=1);
/**
* STR_MANAGER
* Get requested str_data from extras dir and send as download file
* Used for master entity for get structure files
*/
include dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config.php';

session_write_close();

// DATA . The only one var received is a JSON encoded var called "data"
	$data = json_decode($_REQUEST['data']);
	if (empty($data)) {
		debug_log(__METHOD__
			. " EMPTY _REQUEST DATA ! " . PHP_EOL
			. to_string($_REQUEST['data'])
			, logger::ERROR
		);
		http_response_code(401); // Unauthorized
		exit();
	}

	// debug
		error_log('Update Ontology request data: ' . PHP_EOL . to_string($data));

// CODE auth. Check valid code match, received with config defined STRUCTURE_SERVER_CODE
// If not is the same, return error code 401 and exit
	$code = $data->code ?? null;
	$valid_codes = [];
	// add main code
	$valid_codes[] = STRUCTURE_SERVER_CODE;
	// add STRUCTURE_SERVER_CODE_OTHERS if exists
	if (defined('STRUCTURE_SERVER_CODE_OTHERS') && is_array(STRUCTURE_SERVER_CODE_OTHERS)) {
		$valid_codes = array_merge($valid_codes, STRUCTURE_SERVER_CODE_OTHERS);
	}
	if (!in_array($code, $valid_codes)) {
		debug_log(__METHOD__
			. " INVALID CODE ! " . PHP_EOL
			. json_encode($code, JSON_PRETTY_PRINT)
			, logger::ERROR
		);
		http_response_code(403); // Unauthorized
		exit();
	}

// Check connection only
	if (property_exists($data, "check_connection")) {
		http_response_code(200); // OK
		exit();
	}

// SELECTED_OBJ. Get local str files info (paths, names, etc.) to find the requested
	$selected_obj	= null;
	$all_str_files	= backup::get_ontology_file_list();
	foreach ($all_str_files as $key => $obj) {
		if ($data->name === $obj->name) {
			$selected_obj = $all_str_files[$key];
			break;
		}
	}
	if (is_null($selected_obj)) {
		trigger_error('Invalid selected_obj');
		debug_log(__METHOD__
			. " Invalid selected obj " . PHP_EOL
			. ' all_str_files: ' . json_encode($all_str_files, JSON_PRETTY_PRINT)
			, logger::ERROR
		);
		http_response_code(400); // Bad request
		exit();
	}

// version path
	$dedalo_version_string	= $data->dedalo_version ?? '';
	$dedalo_version_array	= explode('.', $dedalo_version_string);

	$major_version = isset($dedalo_version_array[0])
		? (int)$dedalo_version_array[0]
		: 5;
	$minor_version = isset($dedalo_version_array[1])
		? (int)$dedalo_version_array[1]
		: 0;
	$patch_version = isset($dedalo_version_array[2])
		? (int)$dedalo_version_array[2]
		: 0;

	// only version >= 6 are supported. v5 is not compatible whit this ontology
	if ($major_version<6) {
		debug_log(__METHOD__
			. " INVALID DEDALO VERSION ! Only >=6 are supported" . PHP_EOL
			. json_encode($dedalo_version_array, JSON_PRETTY_PRINT)
			, logger::ERROR
		);
		http_response_code(403); // Unauthorized
		exit();
	}

	// point of no return: 6.2.9
	// versions bellow 6.2.9 must be blocked to update ontology because the new jer_dd column 'term' is added
	if ( $major_version===6 && ($minor_version<2 || ($minor_version===2 && $patch_version<9)) ) {
		debug_log(__METHOD__
			. " INVALID DEDALO VERSION ! Only >=6.2.9 are supported" . PHP_EOL
			. json_encode($dedalo_version_array, JSON_PRETTY_PRINT)
			, logger::ERROR
		);
		http_response_code(403); // Unauthorized
		exit();
	}

	// Use default active version path
	$version_path = '';

	error_log('Update Ontology version_path: ' . to_string($version_path));
	error_log('Update Ontology selected_obj: ' . to_string($selected_obj));

// compatibility with old configurations
	if ($selected_obj->name==='dedalo4_development_str.custom.backup') {
		$selected_obj->name = 'dedalo_development_str.custom.backup';
	}

// file info
	$file_name 	= $selected_obj->name;
	$file_path 	= ($selected_obj->name==='dedalo_development_str.custom.backup')
		? $selected_obj->path . $version_path . '/'. $selected_obj->name
		: str_replace('/str_data', $version_path . '/str_data', $selected_obj->path) .'/'. $selected_obj->name;
	// debug
		error_log('Update Ontology file_path: ' . $file_path);

// check file
	$file_found = file_exists($file_path);
	if (!$file_found) {
		debug_log(__METHOD__
			." Trying to get structure from a non-existing file."
			.' file_path: ' . to_string($file_path)
			, logger::ERROR
		);
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
	$file = @fopen($file_path, 'rb');
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
