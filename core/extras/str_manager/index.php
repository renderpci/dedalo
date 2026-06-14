<?php
/**
* STR_MANAGER
* HTTP endpoint served by a Dédalo master (ontology-server) installation that
* streams ontology backup files to authenticated client installations.
*
* Responsibilities:
* - Authenticates the caller via a shared secret (`STRUCTURE_SERVER_CODE`) using
*   a constant-time comparison to resist timing-based probing.
* - Optionally accepts an array of additional valid codes
*   (`STRUCTURE_SERVER_CODE_OTHERS`) to support multi-tenant or migration scenarios.
* - Enforces a minimum Dédalo version gate (>= 6.2.9) because older clients lack
*   the `term` column added to `dd_ontology` in that release.
* - Resolves the requested file name against a known-safe allowlist built by
*   `get_ontology_file_list()` and streams the binary contents in 8 KB chunks,
*   aborting cleanly on client disconnect.
*
* Entry point: called directly as an HTTP script (not via the JSON API).
* The client sends a single JSON-encoded `data` payload in `$_REQUEST['data']`.
*
* Expected `data` properties:
*   - code           (string)  — shared secret defined in config as STRUCTURE_SERVER_CODE
*   - name           (string)  — requested file name (must match an entry in the allowlist)
*   - dedalo_version (string)  — dotted version string, e.g. '7.0.1'
*   - check_connection (any)   — if present, skips file transfer and returns 200 immediately
*
* Related config constants (sample.config.php):
*   STRUCTURE_SERVER_CODE         — primary shared secret
*   STRUCTURE_SERVER_CODE_OTHERS  — optional array of additional accepted secrets
*   DEDALO_BACKUP_PATH_ONTOLOGY   — filesystem root for ontology backup files
*   DEDALO_EXTRAS_PATH            — filesystem root for per-TLD extras directories
*   DEDALO_PREFIX_TIPOS           — array of TLD prefixes recognised by this installation
*
* @package Dédalo
* @subpackage Extras
*/
include dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config.php';

// Session release
// Close the PHP session immediately so that concurrent requests from the same
// client are not blocked by session-file locking during the potentially long
// file transfer that follows.
session_write_close();

// DATA — decode the single JSON payload sent by the client
// The only var received is a JSON-encoded object named "data".
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
	// STRUCTURE_SERVER_CODE_OTHERS is an optional config array that allows multiple
	// installations or migration scenarios to share one ontology server with different secrets.
	if (defined('STRUCTURE_SERVER_CODE_OTHERS') && is_array(STRUCTURE_SERVER_CODE_OTHERS)) {
		$valid_codes = array_merge($valid_codes, STRUCTURE_SERVER_CODE_OTHERS);
	}
	// SEC-020: constant-time comparison to mitigate timing side-channels.
	// hash_equals requires both arguments to be strings of equal length; coerce safely.
	$code_match = false;
	if (is_string($code)) {
		foreach ($valid_codes as $valid_code) {
			if (is_string($valid_code) && hash_equals($valid_code, $code)) {
				$code_match = true;
				// no break: keep iteration constant for additional resistance
			}
		}
	}
	if ($code_match !== true) {
		debug_log(__METHOD__
			. " INVALID CODE ! " . PHP_EOL
			. json_encode($code, JSON_PRETTY_PRINT)
			, logger::ERROR
		);
		http_response_code(403); // Unauthorized
		exit();
	}

// Check connection only
// Clients may ping this endpoint with check_connection to verify reachability
// without triggering a file transfer. Return 200 and exit immediately.
	if (property_exists($data, "check_connection")) {
		http_response_code(200); // OK
		exit();
	}


/**
* GET_ONTOLOGY_FILE_LIST
* Build the complete allowlist of ontology backup files that this server can serve.
*
* Combines a fixed set of core/resource files (always present) with a dynamic
* set derived from the per-TLD extras directories on disk. The result is used
* both to validate that a client's requested file name is in-scope and to
* provide callers (e.g. the maintenance widget) with the full catalogue.
*
* Each returned element is a stdClass with the following shape:
*   - type  (string) — file category; one of:
*       'main_file'           — full Postgres dump (.custom.backup) with all ontology tables
*       'jer_file'            — dd_ontology table copy for a specific TLD (core/resource)
*       'descriptors_file'    — matrix_descriptors_dd copy for a specific TLD (core/resource)
*       'matrix_dd_file'      — matrix_dd copy (shared private list-of-values for dd TLD)
*       'extras_jer_file'     — dd_ontology copy from a per-TLD extras directory
*       'extras_descriptors_file' — matrix_descriptors_dd copy from a per-TLD extras directory
*   - name  (string) — bare filename expected on disk (used for allowlist lookup)
*   - path  (string) — absolute directory path where the file resides
*   - table (string) — source Postgres table (only on *_file types that have it)
*   - tld   (string) — top-level-domain prefix the file belongs to (e.g. 'dd', 'rsc', 'oh')
*
* Results are memoised in a static variable; the function is safe to call
* multiple times within a single request.
*
* @param array|null $ar_tld = null - TLD prefixes to include; defaults to DEDALO_PREFIX_TIPOS
* @return array $ar_files - flat array of stdClass file descriptor objects; empty on directory error
*/
function get_ontology_file_list( ?array $ar_tld=null ) : array {

	// cache results
	// Static memoisation: the file list is computed once per PHP process.
		static $ar_files;
		if (isset($ar_files)) {
			debug_log(__METHOD__
				." Returning previous calculated values "
				, logger::DEBUG
			);
			return $ar_files;
		}

	// safe ar_tld format as ['dd','rsc','hierarchy','oh','ich','test']
	// get_legacy_constant_value reads DEDALO_PREFIX_TIPOS from either the current
	// config constant or its legacy equivalent, returning it as a plain PHP value.
		if (empty($ar_tld)) {
			$ar_tld = (array)get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
		}

	// files to download
		$ar_files = [];

	// BASE - Files
	// The following files are always included regardless of $ar_tld because they
	// carry the core ('dd') and resource ('rsc') ontologies that every installation needs.

		// Always includes main files
		// dedalo_development_str
		// Full pg_dump custom-format backup containing all ontology tables.
		// Stored directly under DEDALO_BACKUP_PATH_ONTOLOGY (not in /str_data).
		$obj = new stdClass();
			$obj->type = 'main_file';
			$obj->name = 'dedalo_development_str.custom.backup';
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY;
		$ar_files[] = $obj;

		// core str file
		// dd_ontology_dd
		// dd_ontology rows belonging to the 'dd' TLD (core Dédalo ontology nodes).
		$obj = new stdClass();
			$obj->type = 'jer_file';
			$obj->name = 'dd_ontology_dd.copy';
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;
		// matrix_descriptors_dd_dd
		// matrix_descriptors_dd rows for the 'dd' TLD (descriptor metadata for core nodes).
		$obj = new stdClass();
			$obj->type = 'descriptors_file';
			$obj->name = 'matrix_descriptors_dd_dd.copy';
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;

		// resources str file
		// dd_ontology_rsc
		// dd_ontology rows belonging to the 'rsc' TLD (resource/model ontology nodes).
		$obj = new stdClass();
			$obj->type = 'jer_file';
			$obj->name = 'dd_ontology_rsc.copy';
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;
		// matrix_descriptors_dd_rsc
		// matrix_descriptors_dd rows for the 'rsc' TLD.
		$obj = new stdClass();
			$obj->type = 'descriptors_file';
			$obj->name = 'matrix_descriptors_dd_rsc.copy';
			$obj->path = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;

		// private list of values
		// matrix_dd
		// matrix_dd holds the shared list-of-values (LOV) used by ontology definitions
		// across all TLDs. It is always scoped to the 'dd' TLD owner but accessed globally.
		$obj = new stdClass();
			$obj->type  = 'matrix_dd_file';
			$obj->name  = 'matrix_dd.copy';
			$obj->table = 'matrix_dd';
			$obj->tld 	= 'dd';
			$obj->path  = DEDALO_BACKUP_PATH_ONTOLOGY . '/str_data';
		$ar_files[] = $obj;

	// EXTRAS - Files
	// Per-TLD ontology files that live under DEDALO_EXTRAS_PATH/<tld>/str_data/.
	// Only TLDs declared in $ar_tld (derived from DEDALO_PREFIX_TIPOS) are eligible.

	// Check extras folder coherence with config ar_tld
	// Ensures every configured TLD has a physical directory before we enumerate them.
	// (!) Returns an empty array if any required directory cannot be created —
	//     the caller should treat an empty result as a configuration error.
		foreach ($ar_tld as $current_tld) {
			$folder_path	= DEDALO_EXTRAS_PATH .'/'. $current_tld;
			$dir_ready		= create_directory($folder_path);
			if( !$dir_ready ) {
				return [];
			}
		}

	// Get extras folders array list filtering existing directories
	// Enumerate all subdirectories under DEDALO_EXTRAS_PATH and keep only those
	// whose basename appears in $ar_tld. Any extras folder not listed in the
	// config (e.g. a leftover from a removed TLD) is silently skipped.
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

	// add every TLD to ar_files list (dd_ontology and matrix_descriptors_dd parts)
	// For each extras TLD, two files are registered: the ontology node snapshot
	// and the descriptor metadata snapshot.
		foreach ($extras_folders as $folder_name) {
			// dd_ontology
			// Per-TLD slice of dd_ontology stored inside the extras folder tree.
			$obj = new stdClass();
				$obj->type  = 'extras_jer_file';
				$obj->table = 'dd_ontology';
				$obj->tld 	= $folder_name;
				$obj->name  = 'dd_ontology_' . $folder_name . '.copy';
				$obj->path  = DEDALO_EXTRAS_PATH .'/'. $folder_name . '/str_data';
			$ar_files[] = $obj;
			// matrix_descriptors_dd
			// Per-TLD slice of matrix_descriptors_dd stored inside the extras folder tree.
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
// Validate $data->name against the known-safe allowlist returned by
// get_ontology_file_list(). Any name not in the list is rejected with 400.
// (!) This is the primary path-traversal guard: clients never supply a raw path.
	$selected_obj	= null;
	// $all_str_files	= backup::get_ontology_file_list();
	// (above: previously called backup::get_ontology_file_list(); now uses the local function)
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
// Parse the dotted version string sent by the client to enforce the minimum
// compatibility gate. Defaults to 5.0.0 if not supplied (which will be rejected).
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
	// versions bellow 6.2.9 must be blocked to update ontology because the new dd_ontology column 'term' is added
	// The `term` column was added to dd_ontology in v6.2.9; clients below that version
	// would import files into a schema that does not yet have this column and would break.
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
	// $version_path is intentionally left empty ('') so paths are built relative to
	// the active backup directory. Version-specific sub-paths are not used in v7.
	$version_path = '';

	error_log('Update Ontology version_path: ' . to_string($version_path));
	error_log('Update Ontology selected_obj: ' . to_string($selected_obj));

// compatibility with old configurations
// Rename legacy v4 file name to the current canonical name before building the path.
// This handles clients that still send the old 'dedalo4_...' prefix.
	if ($selected_obj->name==='dedalo4_development_str.custom.backup') {
		$selected_obj->name = 'dedalo_development_str.custom.backup';
	}

// file info
// The main backup file lives directly under DEDALO_BACKUP_PATH_ONTOLOGY, while
// all other files live in a /str_data subdirectory. The $version_path segment is
// injected between the base path and /str_data to support versioned sub-paths
// (currently always '' — see above).
	$file_name 	= $selected_obj->name;
	$file_path 	= ($selected_obj->name==='dedalo_development_str.custom.backup')
		? $selected_obj->path . $version_path . '/'. $selected_obj->name
		: str_replace('/str_data', $version_path . '/str_data', $selected_obj->path) .'/'. $selected_obj->name;
	// debug
		error_log('Update Ontology file_path: ' . $file_path);

// check file
// A missing file is logged as an error but does not abort the response here;
// $fsize will be set to 0 and the download block will silently send an empty body.
// (!) Clients receive a 0-byte response if the file is absent — no explicit 404.
	$file_found = file_exists($file_path);
	if (!$file_found) {
		debug_log(__METHOD__
			." Trying to get structure from a non-existing file."
			.' file_path: ' . to_string($file_path)
			, logger::ERROR
		);
	}

// file size in bytes
// Sent in Content-Length so the client can track progress and detect truncation.
// Zero when the file is absent (see above).
	$fsize = ($file_found)
		? filesize($file_path)
		: 0;

// set headers
// Force binary/download response — no browser cache, no content sniffing.
// Content-Description and Content-Disposition are intentionally disabled: the
// client reads the raw binary stream and does not need a suggested filename.
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
// Stream the file in 8 KB chunks. After each chunk, connection_status() is
// checked; if the remote client has disconnected, the file handle is closed
// and the script exits immediately to avoid unnecessary I/O.
// (!) The @ error-suppression prefix on fopen/fclose is intentional here:
//     fopen failures are handled by the `if ($file)` guard; suppressing PHP
//     warnings on close avoids spurious output after headers are sent.
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
