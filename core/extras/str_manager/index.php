<?php
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


/**
* GET_ONTOLOGY_FILE_LIST
* Calculate the list of files needed to update the Ontology
* using main files and main tld plus the given $ar_tld
* If no value if provided, the whole DEDALO_PREFIX_TIPOS will be used
* @param array|null $ar_tld = null
* @return array $ar_files
*	Array of objects
*/
function get_ontology_file_list( ?array $ar_tld=null ) : array {

	// cache results
		static $ar_files;
		if (isset($ar_files)) {
			debug_log(__METHOD__
				." Returning previous calculated values "
				, logger::DEBUG
			);
			return $ar_files;
		}

	// safe ar_tld format as ['dd','rsc','hierarchy','oh','ich','test']
		if (empty($ar_tld)) {
			$ar_tld = (array)get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
		}

	// files to download
		$ar_files = [];

	// BASE - Files

		// Always includes main files
		// dedalo_development_str
		$obj = new stdClass();
			$obj->type = 'main_file';
			$obj->name = 'dedalo_development_str.custom.backup';
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY;
		$ar_files[] = $obj;

		// core str file
		// jer_dd_dd
		$obj = new stdClass();
			$obj->type = 'jer_file';
			$obj->name = 'jer_dd_dd.copy';
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;
		// matrix_descriptors_dd_dd
		$obj = new stdClass();
			$obj->type = 'descriptors_file';
			$obj->name = 'matrix_descriptors_dd_dd.copy';
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;

		// resources str file
		// jer_dd_rsc
		$obj = new stdClass();
			$obj->type = 'jer_file';
			$obj->name = 'jer_dd_rsc.copy';
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;
		// matrix_descriptors_dd_rsc
		$obj = new stdClass();
			$obj->type = 'descriptors_file';
			$obj->name = 'matrix_descriptors_dd_rsc.copy';
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;

		// private list of values
		// matrix_dd
		$obj = new stdClass();
			$obj->type  = 'matrix_dd_file';
			$obj->name  = 'matrix_dd.copy';
			$obj->table = 'matrix_dd';
			$obj->tld 	= 'dd';
			$obj->path  = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;

	// EXTRAS - Files

	// Check extras folder coherence with config ar_tld
		foreach ($ar_tld as $current_tld) {
			$folder_path	= DEDALO_EXTRAS_PATH .'/'. $current_tld;
			$dir_ready		= create_directory($folder_path);
			if( !$dir_ready ) {
				return false;
			}
		}

	// Get extras folders array list filtering existing directories
		$all_extras_folders	= (array)glob(DEDALO_EXTRAS_PATH . '/*', GLOB_ONLYDIR);
		$extras_folders		= [];
		foreach ($all_extras_folders as $current_dir) {
			$base_dir = basename($current_dir);
			// ar_tld : config tipos verify. 'tipos' not defined in config, will be ignored
			if (!in_array($base_dir, $ar_tld)) {
				continue; // Filter load prefix from config 'ar_tld'
			}
			$extras_folders[] = $base_dir;
		}

	// add every TLD to ar_files list (jer_dd and matrix_descriptors_dd parts)
		foreach ($extras_folders as $folder_name) {
			// jer_dd
			$obj = new stdClass();
				$obj->type  = 'extras_jer_file';
				$obj->table = 'jer_dd';
				$obj->tld 	= $folder_name;
				$obj->name  = 'jer_dd_' . $folder_name . '.copy';
				$obj->path  = DEDALO_EXTRAS_PATH .'/'. $folder_name . '/str_data';
			$ar_files[] = $obj;
			// matrix_descriptors_dd
			$obj = new stdClass();
				$obj->type  = 'extras_descriptors_file';
				$obj->table = 'matrix_descriptors_dd';
				$obj->tld 	= $folder_name;
				$obj->name  = 'matrix_descriptors_dd_' . $folder_name . '.copy';
				$obj->path  = DEDALO_EXTRAS_PATH .'/'. $folder_name . '/str_data';
			$ar_files[] = $obj;
		}


	return $ar_files;
}//end get_ontology_file_list



// SELECTED_OBJ. Get local str files info (paths, names, etc.) to find the requested
	$selected_obj	= null;
	// $all_str_files	= backup::get_ontology_file_list();
	$all_str_files	= get_ontology_file_list();
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
