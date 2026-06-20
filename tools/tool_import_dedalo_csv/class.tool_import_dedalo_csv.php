<?php declare(strict_types=1);
/**
* CLASS TOOL_IMPORT_DEDALO_CSV
* Bulk-imports section records from semicolon-delimited CSV files into Dédalo.
*
* This is the server-side controller for the CSV import tool. It is paired with
* `js/tool_import_dedalo_csv.js` (UI) and `js/render_tool_import_dedalo_csv.js`
* (report rendering). It extends `tool_common` and follows the v7 tool conventions
* (register.json, API_ACTIONS allowlist, BACKGROUND_RUNNABLE allowlist).
*
* Round-trip invariant: a file exported by `tool_export` in 'dedalo_raw' format and
* re-imported through this class MUST reproduce the exact stored datos for every
* component. This is enforced by `test_import_files_raw_export_round_trip`.
*
* Accepted CSV cell formats (per-component conform_import_data() handles each):
* - dedalo_data wrapper: {"dedalo_data": <dato>} — the shape produced by the raw
*   export chokepoint (component_common::get_raw_value). Unwrapped by
*   component_common::unwrap_dedalo_data() before conforming.
* - v7 dato (canonical): JSON array of objects, e.g. [{"value":"hello"}] for
*   text/number/email, [{"start":{"year":2023}}] for dates, [{"iri":"https://..."}]
*   for IRI, locator objects for relations, [{"lat":39.46,"lon":-0.37}] for geolocation.
* - v6 dato (legacy, auto-normalized): JSON array of plain scalars, e.g. ["hello"]
*   or [104, -75.35]. Each component's conform_import_data() upgrades these.
* - Multi-language JSON object: {"lg-eng":[...],"lg-spa":[...]} — iterated and saved
*   per language via set_data_lang().
* - Flat strings: plain text, numbers, emails ('a@b.com | c@d.com'), date ranges
*   ('2023/10/26<>2023/10/27'), IRI records ('label, https://... | https://...'),
*   relation section_id lists ('1,4,6'), geolocation ('lat, lon[, zoom[, alt]]'),
*   lang codes ('lg-spa, lg-eng'). Parsing rules are per-component.
* The 'id' and 'lang' item properties are auto-assigned on save; callers must not
* supply them (except 'id' for component_iri, which pairs a value with its dataframe).
*
* Empty-cell semantics: an empty CSV cell conforms to null and CLEARS the existing
* component data for that record (and that language, when the component is translatable).
*
* Report channels: failed_rows (value rejected — not imported) and warning_rows (value
* imported but needs user attention, e.g. a select_lang code not in the project langs).
*
* Column-name suffixes in the CSV header are significant: tipo_dmy|mdy|ymd encodes the
* date-field order; tipo_sectiontipo scopes a relation column. The header MUST match the
* column-map 'tipo' exactly; mismatches are silently skipped.
*
* Upload staging area: DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH/<user_id>/
* (typically DEDALO_MEDIA_PATH/import/files/<user_id>/).
*
* Bulk-process tracking: every import run creates a record in the bulk-process section
* (DEDALO_BULK_PROCESS_SECTION_TIPO = dd800) so that individual component changes can be
* attributed to the run and reverted via the time machine if needed.
*
* @package Dédalo
* @subpackage Tools
*/
class tool_import_dedalo_csv extends tool_common {



	/**
	* API_ACTIONS
	* Explicit allowlist of methods callable via dd_tools_api::tool_request (SEC-024 §9.2).
	*
	* Only these five actions are reachable through the public API. Internal helpers
	* (import_dedalo_csv_file, verify_csv_map, get_files_path) are intentionally absent
	* — they are invoked only by the public actions above, never directly by API callers.
	* @var array<string> $API_ACTIONS
	*/
	public const API_ACTIONS = [
		'get_csv_files',
		'delete_csv_file',
		'import_files',
		'process_uploaded_file',
		'get_section_components_list'
	];

	/**
	* BACKGROUND_RUNNABLE
	* Explicit allowlist for process_runner.php (SEC-024 §9.1b).
	*
	* Only import_files is flagged background_running:true from the JS client (see
	* tools/tool_import_dedalo_csv/js/tool_import_dedalo_csv.js). The remaining
	* actions (get_csv_files, delete_csv_file, get_section_components_list,
	* process_uploaded_file) are interactive helpers that must never reach the
	* background runner because they depend on the real-time HTTP context.
	* @see core/base/process_runner.php
	* @var array<string> $BACKGROUND_RUNNABLE
	*/
	public const BACKGROUND_RUNNABLE = [
		'import_files'
	];



	/**
	* GET_FILES_PATH
	* Returns the per-user CSV staging directory, creating it and its access-control
	* files (.htaccess, .nginx.conf, index.html) on first use.
	*
	* The base path is set by DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH (typically
	* DEDALO_MEDIA_PATH/import/files). The returned path is always scoped to the
	* currently logged-in user: base_dir/<user_id>. Directory creation uses 0775 so
	* that the web-server group can write while others cannot.
	*
	* (!) This method is intentionally absent from API_ACTIONS. It is called only by
	* other methods in this class that already enforce the caller's identity, so it
	* must never be callable directly from the API.
	* @return string $files_path - absolute path to the user's upload directory
	*/
	public static function get_files_path() : string {

		$base_dir = DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH;
		if (!is_dir($base_dir)) {
			mkdir($base_dir, 0775, true);
		}

		// Directory protection (Apache)
		// Deny direct HTTP access to the upload staging area. Written once on first use.
		$htaccess_file = $base_dir . '/.htaccess';
		if (!file_exists($htaccess_file)) {
			$htaccess_content = "# Protect files and directories from prying eyes\nRequire all denied\n";
			file_put_contents($htaccess_file, $htaccess_content);
		}

		// Directory protection (NGINX)
		// Equivalent deny directive for NGINX configurations.
		$nginx_file = $base_dir . '/.nginx.conf';
		if (!file_exists($nginx_file)) {
			$nginx_content = "# NGINX protection\ndeny all;\n";
			file_put_contents($nginx_file, $nginx_content);
		}

		// Directory protection (directory listing fallback)
		// Prevents index exposure on servers that serve directory listings by default.
		$index_file = $base_dir . '/index.html';
		if (!file_exists($index_file)) {
			file_put_contents($index_file, "<html><head><title>Forbidden</title></head><body><h1>Forbidden</h1></body></html>");
		}

		$files_path = $base_dir .'/'. logged_user_id();

		return $files_path;
	}//end get_files_path



	/**
	* GET_CSV_FILES
	* Scans the current user's CSV staging directory and returns metadata and preview
	* data for every .csv file found there.
	*
	* For each file the method:
	* 1. Parses the header row (row 0) via tool_common::read_csv_file_as_array().
	* 2. Builds an ar_columns_map by resolving each column header through the ontology
	*    (label + model). The special 'section_id' column is mapped with model 'section_id'.
	*    Column headers that carry a suffix (e.g. 'test145_dmy') have the suffix stripped
	*    before the ontology lookup — the full original header name is kept in 'tipo' so
	*    that import_dedalo_csv_file can match it exactly against the CSV header row.
	* 3. Validates up to 10 data rows as a JSON-format sanity check (sample_data_errors).
	* 4. Returns a summary object per file: row/column counts, column map, and sample rows.
	*
	* (!) files_path from the client options is intentionally ignored (TOOLS-02): always
	* confines to the authenticated caller's per-user directory to prevent arbitrary-file-read.
	*
	* @param object $options = new stdClass() - currently unused; reserved for future filters
	* @return object $response
	*   - result  array<object> $files_info — one item per discovered .csv file, each
	*             containing: dir, name, n_records, n_columns, file_info (header row),
	*             ar_columns_map, sample_data (up to 10 data rows), sample_data_errors
	*   - msg     string — summary or "No files found" message
	*   - errors  array<string> — per-file read errors; a file with an error is skipped
	*/
	public static function get_csv_files(object $options=new stdClass()) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			// TOOLS-02: ignore any client-supplied files_path. Reading arbitrary
			// directories is an authenticated arbitrary-file-read; always scope to
			// the caller's own per-user import dir.
			$dir = tool_import_dedalo_csv::get_files_path();

		// read_files
			$files_list	= tool_common::read_files(
				$dir,
				['csv'] // array $valid_extensions
			);

		// files info
			$files_info = [];
			foreach ($files_list as $current_file_name) {

				$file = $dir .'/'. $current_file_name;

				try {

					// data . extract csv data from file
					$ar_data = tool_common::read_csv_file_as_array(
						$file, // file string
						false, // skip_header bool
						';', // csv_delimiter string
						'"', // enclosure string
						'"' // escape string
					);

					if (empty($ar_data) || empty($ar_data[0])) {
						debug_log(__METHOD__
							. ' Error on read file 1. The file will be ignored' .PHP_EOL
							. ' file: ' .to_string($file)
							, logger::ERROR
						);
						$response->errors[] = 'error reading file';
						continue;
					}

					$file_info	= (array)$ar_data[0];
					$n_records	= count($ar_data)-1;
					$n_columns	= count($file_info);

					// ar_columns_map
						$ar_columns_map = array_map(function($el) use($file_info){

							if ( empty($el) ) {
								debug_log(__METHOD__
									. " Empty tipo found in file_info " . PHP_EOL
									. " tipo: " . to_string($el). PHP_EOL
									. ' file_info: ' . json_encode($file_info, JSON_PRETTY_PRINT)
									, logger::ERROR
								);
								return null;
							}

							// column `section_id` case
							if($el==='section_id') {
								return (object)[
									'tipo'	=> 'section_id',
									'label'	=> 'Section ID',
									'model'	=> 'section_id'
								];
							}

							// suffix stripping for date-format and relation-target columns
					// Column headers may carry a suffix such as 'test145_dmy' (date field
					// order) or 'rsc85_rsc197' (relation target). The ontology lookup must
					// use only the base tipo, but 'tipo' in the returned object keeps the
					// full original header so that import_dedalo_csv_file can match it
					// exactly against the CSV header row during the column-map comparison.
						$el_base = $el;
						if (strpos($el, '_')!==false) {
							$el_base = substr($el, 0, strpos($el, '_'));
						}

							$safe_tipo = safe_tipo($el_base);

							if (empty( $safe_tipo )) {
								debug_log(__METHOD__
									. " Invalid tipo found in file_info " . PHP_EOL
									. " tipo: " . to_string($el). PHP_EOL
									. ' file_info: ' . json_encode($file_info, JSON_PRETTY_PRINT)
									, logger::ERROR
								);
								return null;
							}

							$label = ontology_node::get_term_by_tipo($safe_tipo, DEDALO_APPLICATION_LANG, true);
							$model = ontology_node::get_model_by_tipo($safe_tipo, true);

							return (object)[
								'tipo'	=> $el,
								'label'	=> $label,
								'model'	=> $model
							];
						}, $file_info);

				} catch (Exception $e) {

					$response->errors[] =  'Error on read file: '.to_string($file);

					debug_log(__METHOD__
						. ' Error on read file 2:  The file will be ignored' .PHP_EOL
						. ' file: ' .to_string($file) .PHP_EOL
						. ' exception: ' .$e->getMessage()
						, logger::ERROR
					);
					continue;
				}

				// sample data — JSON-format sanity check on the first n data rows
				// Only validates that cells starting with '[' or '{' are parseable JSON.
				// Malformed JSON here would cause silent failures during import, so we
				// surface them early in the file listing so the user can fix the file
				// before attempting a full import run.
					$sample_data		= [];
					$sample_data_errors	= [];
					$preview_max		= 10;
					foreach ($ar_data as $dkey => $current_line) {

						if (empty($current_line)) {
							continue;
						}

						foreach ($current_line as $value) {
							if (empty($value)) {
								continue;
							}

							$value = str_replace('U+003B', ';', $value);

							# Test valid JSON
							if (strpos($value,'[')===0 || strpos($value,'{')===0) {

								$test = json_decode($value);

								if ($test===null) {
									debug_log(__METHOD__
										." ERROR!! BAD JSON FORMAT  " . PHP_EOL
										.' value: ' . to_string($value)
										, logger::ERROR
									);

									$sample_data_errors[] = $current_line;
								}

								if(json_last_error()!==JSON_ERROR_NONE){
									debug_log(__METHOD__
										." JSON decode error has occurred:" . PHP_EOL
										.' json_last_error_msg: '. json_last_error_msg()
										, logger::ERROR
									);
								}
							}
						}

						// add skipping header line
							if ($dkey>0) {
								$sample_data[] = $current_line;
							}

						// Stop on reach limit
						if ($dkey>=$preview_max) break;
					}//end foreach ($ar_data as $dkey => $current_line)

				// files_info
					$item = (object)[
						'dir'					=> $dir,
						'name'					=> $current_file_name,
						// TOOLS-07: do not ship the full parsed contents of every CSV in the
						// listing response — clients use 'sample_data' for preview and load
						// full rows only at import time.
						'n_records'				=> $n_records,
						'n_columns'				=> $n_columns,
						'file_info'				=> $file_info,
						'ar_columns_map'		=> $ar_columns_map,
						'sample_data'			=> $sample_data,
						'sample_data_errors'	=> $sample_data_errors
					];

					$files_info[] = $item;
			}//end foreach ($files_list as $current_file_name)


		// response
			$response->result	= $files_info;
			$response->msg		= !empty($files_info)
				? "Found ".count($files_info)." files"
				: "No files found at $dir";


		return $response;
	}//end get_csv_files



	/**
	* DELETE_CSV_FILE
	* Moves a named CSV file from the user's staging directory to a 'deleted' subdirectory.
	*
	* The file is not permanently erased: it is renamed with a datestamped suffix and
	* placed in <staging_dir>/deleted/ so it can be recovered if a deletion was accidental.
	*
	* Security (TOOLS-01):
	* - client-supplied files_path is ignored; always scoped to the authenticated user's
	*   directory via get_files_path().
	* - file_name is validated through safe_upload_target() before any filesystem use;
	*   path-traversal attempts (e.g. '../other_user/file.csv') are rejected.
	* - The target is checked with is_file() to ensure a directory cannot be deleted.
	*
	* @param object $options
	*   - file_name string — basename of the .csv file to delete, e.g. 'export_oh1.csv'
	*   - files_path string (ignored) — kept for API symmetry; always overridden
	* @return object $response
	*   - result  bool   — true on success
	*   - msg     string — human-readable outcome
	*   - errors  array<string> — non-empty on failure (invalid name, permission error, etc.)
	*/
	public static function delete_csv_file(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options
			$file_name	= $options->file_name ?? '';
			// TOOLS-01: ignore any client-supplied files_path and confine to the
			// per-user import dir; basename-confine the file name so '../' cannot
			// rename/delete files outside the user's own staging area.
			$dir		= tool_import_dedalo_csv::get_files_path();

		// remove file is exists
			try {
				$file_full_path = safe_upload_target($dir, $file_name, false);
			} catch (\Throwable $e) {
				$response->msg = 'Error. Invalid file name';
				$response->errors[] = 'invalid file name';
				debug_log(__METHOD__ .' Rejected unsafe file_name: '. $e->getMessage(), logger::ERROR);
				return $response;
			}
			if (file_exists($file_full_path)) {

				// check is file (prevent to delete directories accidentally)
				if (!is_file($file_full_path)) {
					$response->msg = 'Error. This path does not correspond to a file. Ignored delete_csv_file action';
					$response->errors[] = 'invalid file path';
					debug_log(__METHOD__
						." response->msg: $response->msg" . PHP_EOL
						.' file_full_path: ' .$file_full_path
						, logger::ERROR
					);
					return $response;
				}

				// create deleted folder
				$deleted_dir = $dir . '/deleted';
				if (!file_exists($deleted_dir)) {
					if (!mkdir($deleted_dir, 0775, true)) {
						$response->msg = 'Error. Unable to create deleted folder';
						$response->errors[] = 'unable to create deleted folder';
						return $response;
					}
				}

				$date = date('Y-m-d_H-i-s');
				$pathinfo = pathinfo($file_name);
				$filename = $pathinfo['filename'];
				$extension = isset($pathinfo['extension']) ? '.' . $pathinfo['extension'] : '';
				
				$deleted_file_path = $deleted_dir . '/' . $filename . '_deleted_' . $date . $extension;

				if( rename($file_full_path, $deleted_file_path) ) {

					$response->result 	= true;
					$response->msg 		= 'OK. Request file '.$file_name.' is moved to deleted folder';
					debug_log(__METHOD__
						." response->msg: $response->msg"
						, logger::DEBUG
					);

				}else{

					$response->msg = 'Error. File exists but you don\'t have permissions to delete this file';
					$response->errors[] = 'insufficient permissions';
					debug_log(__METHOD__
						." response->msg: $response->msg" . PHP_EOL
						.' file_full_path: ' .$file_full_path
						, logger::ERROR
					);
				}
			}


		return $response;
	}//end delete_csv_file



	/**
	* IMPORT_FILES
	* Orchestrates the bulk import of one or more CSV files in a single API call.
	*
	* This is the only BACKGROUND_RUNNABLE action: the JS client dispatches it with
	* background_running:true so it runs under process_runner.php, which emits
	* progress events the client polls. ignore_user_abort(true) prevents the PHP process
	* from dying if the browser disconnects mid-run.
	*
	* For each file in options->files:
	* 1. Asserts write permission (level >=2) on the target section_tipo (SEC-024 §9.2).
	* 2. Consolidates the section counter so newly created records get sequential IDs.
	* 3. Delegates to import_dedalo_csv_file() which handles the row-by-row work.
	*
	* The files_path option may be supplied as a fallback but is not sanitised here;
	* the real staging directory is always derived from get_files_path() when absent.
	*
	* @param object $options
	*   - files             array<object>  — file descriptors; each carries:
	*                                        file (string basename), section_tipo (string),
	*                                        ar_columns_map (array<object>),
	*                                        bulk_process_label (string)
	*   - time_machine_save bool           — when true, saves a time-machine snapshot per
	*                                        component change so the run can be reverted
	*   - files_path        string|null    — optional override for the staging directory
	* @return object $response
	*   - result  array<object> — one per-file response object from import_dedalo_csv_file();
	*             each carries result, msg, created_rows, updated_rows, failed_rows,
	*             warning_rows, errors, time, file, section_tipo
	*   - msg     string — 'Request done'
	*   - debug   object (only when SHOW_DEBUG===true): exec_time, options
	*/
	public static function import_files(object $options) : object {
		$start_time = start_time();

		// Ignore user close browser
			ignore_user_abort(true);

		// options
			$files				= $options->files ?? [];
			$time_machine_save	= $options->time_machine_save ?? null;
			$dir				= $options->files_path ?? tool_import_dedalo_csv::get_files_path();

		// SEC-024 (§9.2): WRITE gate per file. Each file targets a different
		// section_tipo. Caller must have write (>=2) on every requested target.
			foreach ((array)$files as $current_file_obj) {
				$st = $current_file_obj->section_tipo ?? null;
				if (!empty($st)) {
					security::assert_section_permission($st, 2, __METHOD__);
				}
			}

		// process information
			$process_info = new stdClass();
				$process_info->msg = null;

		// import each file
			$import_response=[];
			foreach ((array)$files as $current_file_obj) {

				$current_file		= $current_file_obj->file; // string like 'exported_oral-history_-1-oh1.csv'
				$section_tipo		= $current_file_obj->section_tipo; // string like 'oh1'
				$ar_columns_map		= $current_file_obj->ar_columns_map; // array of objects like [{checked: false, label: "", mapped_to: "", model: "", tipo: "section_id"}]
				$bulk_process_label	= $current_file_obj->bulk_process_label; // string like 'exported_oral-history_-1-oh1.csv'

				// CLI. print the process_info
					if ( running_in_cli()===true ) {
						$process_info->msg			= label::get_label('reading');
						$process_info->current_file	= $current_file;
						print_cli($process_info);
					}

				// file
					$file = $dir . '/' . $current_file;
					if (!file_exists($file)) {
						$current_file_response = new stdClass();
							$current_file_response->result			= false;
							$current_file_response->msg				= "Error. File not found: ".$file;
							$current_file_response->file			= $current_file;
							$current_file_response->section_tipo	= $section_tipo;
						$import_response[] = $current_file_response;
						continue;
					}
					$ar_csv_data = tool_common::read_csv_file_as_array(
						$file, // string file
						false, // bool skip_header
						';' // string csv delimiter
					);

				// counter consolidation
				// Before inserting any rows, advance the section's auto-increment counter
				// to the highest existing section_id. This prevents gaps or collisions when
				// the CSV contains explicit section_id values that were already in the DB.
					$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
					// Ignore invalid empty matrix tables
					// An empty matrix_table means the section_tipo is not mapped — likely
					// a misconfigured CSV. Skip entirely rather than risk a corrupt counter.
					if (empty($matrix_table)) {
						debug_log(__METHOD__
							. " ERROR: Ignored invalid empty matrix table. Unable to resolve if section tipo exists! " . PHP_EOL
							. ' section_tipo: ' . $section_tipo . PHP_EOL
							. ' current_file_obj: ' . to_string($current_file_obj)
							, logger::ERROR
						);
						continue;
					}
					counter::consolidate_counter(
						$section_tipo, $matrix_table
					);

				// import exec
					$import_csv_options = new stdClass();
						$import_csv_options->section_tipo		= $section_tipo;
						$import_csv_options->ar_csv_data		= $ar_csv_data;
						$import_csv_options->time_machine_save	= $time_machine_save;
						$import_csv_options->ar_columns_map		= $ar_columns_map;
						$import_csv_options->current_file		= $current_file;
						$import_csv_options->bulk_process_label	= $bulk_process_label;

					$current_file_response = (object)tool_import_dedalo_csv::import_dedalo_csv_file($import_csv_options);
					$current_file_response->file			= $current_file;
					$current_file_response->section_tipo	= $section_tipo;

				$import_response[] = $current_file_response;
			}//end foreach ((array)$files as $current_file_obj)

		// response
			$response = new stdClass();
				$response->result	= $import_response;
				$response->msg		= 'Request done';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
					$debug->options		= $options;
				$response->debug = $debug;
			}


		return (object)$response;
	}//end import_files


	/**
	* IMPORT_DEDALO_CSV_FILE
	* Core import engine: processes a pre-parsed CSV data array row by row, writing
	* each mapped cell to its target component.
	*
	* This method is intentionally absent from API_ACTIONS and BACKGROUND_RUNNABLE —
	* it is invoked only by import_files() after the security gate has passed.
	*
	* Per-row lifecycle:
	* 1. Read section_id from the column identified as 'section_id' / 'component_section_id'.
	*    Rows with a missing or zero section_id are skipped and logged.
	* 2. Call section_record::exists_in_the_database(); create a new record (honouring the
	*    CSV's explicit section_id) when the section does not yet exist.
	* 3. For each checked, mapped column:
	*    a. Decode the U+003B escape (literal semicolons escaped by tool_export).
	*    b. Unwrap the dedalo_data envelope via component_common::unwrap_dedalo_data().
	*    c. Call $component->conform_import_data() to normalize the cell to a v7 dato.
	*    d. Dispatch through the metadata / multi-lang-object / flat-multi-lang / default
	*       branch (see class header for branch descriptions).
	*    e. Call $component->import_save(); failure pushes to $failed_rows.
	*    f. If the unwrapped value carried a dataframe envelope, write it via
	*       $component->import_dataframe_data() after the main data is saved.
	*
	* Side effects:
	* - activity logging is disabled for the duration (logger_backend_activity::$enable_log=false)
	*   and restored in the finally block.
	* - tm_record::$save_tm is set to the time_machine_save flag; restored to true in finally.
	* - diffusion propagation is disabled per component ($update_diffusion_info_propagate_changes=false)
	*   to avoid expensive inverse-locator updates during bulk runs.
	* - gc_collect_cycles() is called every 100 rows to avoid memory bloat.
	* - A bulk-process section record (dd800) is created at run start, storing the file
	*   name (dd797) and label (dd796) for time-machine attribution.
	*
	* @param object $options
	*   - section_tipo       string         — destination section tipo, e.g. 'oh1'
	*   - ar_csv_data        array<array>   — parsed CSV rows; row 0 is the header
	*   - time_machine_save  bool           — whether to record time-machine history
	*   - ar_columns_map     array<object>  — column-map from get_csv_files(); each entry:
	*                                         tipo, label, model, checked, map_to, column_name,
	*                                         optional decimal (component_number)
	*   - current_file       string         — original CSV filename (stored in bulk-process record)
	*   - bulk_process_label string         — human-readable label for the bulk-process record
	* @return object $response
	*   - result       bool          — true when at least one row was created or updated
	*   - msg          string        — 'Section: X. Total records created:N - updated:M - failed:F - warnings:W'
	*   - created_rows array<int>    — section_ids of newly inserted records
	*   - updated_rows array<int>    — section_ids of updated records
	*   - failed_rows  array<object> — rows/columns rejected; each: section_id, data, component_tipo, msg
	*   - warning_rows array<object> — rows imported but flagged (same shape as failed_rows)
	*   - time         string        — execution time in milliseconds
	*   - errors       array<string> — fatal errors (e.g. empty CSV, missing section_id column)
	*/
	public static function import_dedalo_csv_file(object $options) : object {
		$start_time = start_time();

		$section_tipo		= $options->section_tipo;
		$ar_csv_data		= $options->ar_csv_data;
		$time_machine_save	= $options->time_machine_save;
		$ar_columns_map		= $options->ar_columns_map;
		$current_file		= $options->current_file;
		$bulk_process_label	= $options->bulk_process_label;

		// (!) Disable activity logging for the duration of the import
		// Bulk imports would otherwise flood the activity log with one entry per component
		// save. The original state is restored in the finally block regardless of outcome.
		$original_log_state = logger_backend_activity::$enable_log;
		logger_backend_activity::$enable_log = false;

		try {
			// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->errors	= [];

			// csv_map
				$csv_map = $ar_columns_map;
				// Verify csv_map
				$verify_csv_map = self::verify_csv_map($csv_map, $section_tipo);
				if ($verify_csv_map->result!==true) {

					$response->result	= false;
					$response->msg		= 'Error. Current CSV file first row (headers) is invalid (1): '.$verify_csv_map->msg;

					return $response;
				}

			// section_id key column
			// Locate the column index that holds the record's section_id. The column may
			// be mapped as 'section_id' (virtual, added by get_csv_files) or as
			// 'component_section_id' (the actual model for newer exports). Without this
			// key we cannot identify which DB record to create/update, so a missing column
			// is a fatal error for the whole file.
			$columns		= array_column($csv_map, 'model');
			$section_id_key	= array_search('section_id', $columns);
			if ($section_id_key === false) {
				// Fallback to try 'component_section_id'
				$section_id_key = array_search('component_section_id', $columns);
			}
			if ($section_id_key === false) {
				throw new Exception("component_section_id column not found in CSV mapping");
			}

			// metadata section tipos
			// These are the fixed system-level metadata components shared by every section
			// (dd199 created_date, dd201 modified_date, dd200 created_by_user, dd197
			// modified_by_user). They require special handling: their values must also be
			// pushed directly onto the section object via set_created_date() etc. so that
			// the DB columns (not just the component dato) are updated correctly.
				$metadata_definition = section::get_metadata_definition();
					$created_by_user	= $metadata_definition->created_by_user; 	// object ('tipo'=>'dd200', 'model'=>'component_select');
					$created_date		= $metadata_definition->created_date; 		// object ('tipo'=>'dd199', 'model'=>'component_date');
					$modified_by_user	= $metadata_definition->modified_by_user; 	// object ('tipo'=>'dd197', 'model'=>'component_select');
					$modified_date		= $metadata_definition->modified_date; 		// object ('tipo'=>'dd201', 'model'=>'component_date');

			// process information
				$process_info = new stdClass();
					$process_info->msg				= null;
					$process_info->section_tipo		= $section_tipo;
					$process_info->section_id		= null;
					$process_info->component_tipo	= null;
					$process_info->component_label	= null;
					$process_info->current_file		= $current_file;

			// rows info statistics
				$created_rows	= [];
				$updated_rows	= [];
				$failed_rows	= [];
				$warning_rows	= [];

			$counter		= 0;
			if (empty($ar_csv_data)) {
				throw new Exception("CSV data is empty");
			}
			$csv_head_row	= $ar_csv_data[0];

			// PROCESS
				// create new process section
					$bulk_process_section = section::get_instance(
						DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
					);
					$bulk_process_id = $bulk_process_section->create_record();

				// get the bulk_process_id as the section_id of the section process
					// $bulk_process_id = $bulk_process_section->get_section_id();

				// Save the file name into the process section
					$bulk_file_component = component_common::get_instance(
						'component_input_text', // string model
						DEDALO_BULK_PROCESS_FILE_TIPO, // string tipo
						$bulk_process_id, // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
					);
					$bulk_file_component_data = new stdClass();
						$bulk_file_component_data->value = $current_file;
					$bulk_file_component->set_data([$bulk_file_component_data]);
					$bulk_file_component->save();

				// Save the process name into the process section
					$bulk_process_label_component = component_common::get_instance(
						'component_input_text', // string model
						DEDALO_BULK_PROCESS_LABEL_TIPO, // string tipo
						$bulk_process_id, // string section_id
						'list', // string mode
						DEDALO_DATA_NOLAN, // string lang
						DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
					);
					$bulk_process_label_data = new stdClass();
						$bulk_process_label_data->value = $bulk_process_label;
					$bulk_process_label_component->set_data([$bulk_process_label_data]);
					$bulk_process_label_component->save();

				// time machine flag
				// (!) tm_record::$save_tm is a global static that controls whether any
				// subsequent component save records a time-machine snapshot. Setting it
				// to false here suppresses snapshots for the entire run when the user
				// has not requested history (import checkbox 'Save time machine history').
				// The finally block unconditionally restores it to true.
					tm_record::$save_tm = ($time_machine_save===true)
						? true
						: false;

			foreach ($ar_csv_data as $rkey => $columns) {

				// header row
					if($rkey===0) continue; // Skip first row, the header row

				// section_id (cast to int the section_id of the row)
					$section_id = !empty($columns[$section_id_key]) ? (int)$columns[$section_id_key] : null;
					if (empty($section_id)) {
						$error = "ERROR on get MANDATORY section_id. SKIPPED record (section_tipo: $section_tipo - rkey: $rkey - section_id: $section_id)";
						debug_log(__METHOD__
							." $error". PHP_EOL
							.' section_id: '. to_string($section_id),
							logger::ERROR
						);
						$response->errors[] = $error;
						continue;
					}

					$section_record = section_record::get_instance( $section_tipo, $section_id );
					$exists = $section_record->exists_in_the_database();
					// create missing record
					// When the CSV contains a section_id not yet in the DB, insert a new
					// record with that explicit ID. This preserves relations and IDs from the
					// source system. The counter was consolidated before the row loop so it
					// will not later re-issue this same ID.
					if( $exists===false ){
						$section = section::get_instance( $section_tipo );
						$section->create_record( (object)[
							'section_id' => $section_id ? (int)$section_id : null
						]);
					}

				// set the information about the process
					$process_info->section_id = $section_id;
					$process_info->msg = ($exists===true)
						? label::get_label('updating') ?? 'Updating'
						: label::get_label('creating') ?? 'Creating';

				// Iterate fields/columns
					foreach ($columns as $key => $value) {

						$column_map = $csv_map[$key];
						// column_map sample:
							// {
							// 	"tipo": "dd197",
							// 	"label": "Modified by user",
							// 	"model": "component_select",
							// 	"column_name": "dd197",
							// 	"checked": true,
							// 	"map_to": "dd197"
							// 	"decimal": "."
							// }

						// column exclusion filters
							// by name — section_id is used only for record lookup, never written
							if($column_map->model === 'section_id' || $column_map->model === 'component_section_id') {
								continue; # Skip section_id value column
							}
							// by checked property — user may have deselected columns in the UI
							if(!isset($column_map->checked) || $column_map->checked=== false || !isset($column_map->map_to)) {
								continue;
							}
							// by head comparison
							// Verify the column-map entry aligns with the actual CSV header at
							// this key position. A mismatch indicates the column map was built
							// for a different CSV layout; skip silently rather than write to
							// the wrong component.
							$current_csv_head_column = $csv_head_row[$key];
							if($current_csv_head_column !== $column_map->tipo) {
								continue;
							}

						// value general fixes
							// Prevent wrong final return problems
							$value = trim($value);
							// Remove delimiter escape (U+003B for ;)
							$value = str_replace('U+003B', ';', $value);

						// component_tipo
							$component_tipo	= $column_map->map_to;
							// check if the component_tipo is empty, forgotten case.
							if (empty($component_tipo)) {
								debug_log(__METHOD__
									. " Error: !!!!!!!! ignored empty component_tipo on csv_map key: $key ". PHP_EOL
									. " csv_map: ".to_string($csv_map)
									, logger::ERROR
								);
								continue;
							}

						// component instantiation
						// cache=false: we must get a fresh instance per row so that a prior
						// row's dato does not contaminate the current one (no request-cache
						// bleed, cf. audit-2026-06-worker-state-bleed). Lang is resolved from
						// the ontology translatable flag: nolan for non-translatable components
						// so their data is stored once without language discrimination.
							$model_name		= ontology_node::get_model_by_tipo($component_tipo, true);
							$translate		= ontology_node::get_translatable($component_tipo); //==='si' ? true : false;
							$lang			= $translate===false ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;
							$component		= component_common::get_instance(
								$model_name,
								$component_tipo,
								$section_id,
								'list',
								$lang,
								$section_tipo,
								false, // cache
							);
							// set the bulk_process_id to save it into time_machine
							// this allow to revert the bulk import
							$component->set_bulk_process_id($bulk_process_id);

							if($model_name==='component_number' && isset($column_map->decimal)){
								$component->decimal = $column_map->decimal;
							}

							// with_lang_versions
								$with_lang_versions	= $component->with_lang_versions;

							// configure component
								// (!) Disable diffusion propagation for this component during import.
								// Propagating inverse-locator changes is expensive when a section has
								// many relations; for bulk imports it is unnecessary because the diffusion
								// system is rebuilt separately after the import run completes.
								$component->update_diffusion_info_propagate_changes = false;

						// unwrap the dedalo_data wrapper when present
						// raw exported data ('dedalo_raw' format) is wrapped as {"dedalo_data": <dato>}
						// to identify externally that the value is Dédalo format data.
						// Plain (un-wrapped) v6/v7 values are returned unchanged.
							$unwrap_response = component_common::unwrap_dedalo_data($value);
							$value = $unwrap_response->value;
							// the flag allows components as component_json to disambiguate
							// a v7 envelope from a literal JSON value with the same shape
							$component->import_data_is_wrapped = $unwrap_response->wrapped;
							// dataframe envelope: frames paired with the component items,
							// written after the component data is set (see import_dataframe_data)
							$import_dataframe	= $unwrap_response->dataframe ?? null;
							$import_has_dato	= $unwrap_response->has_dato ?? true;

						// conform imported value with every component rules.
							$conform_import_data_response = $component->conform_import_data($value, $column_map->column_name);
							// if the component has warnings (non fatal), include them into warning rows
							if(!empty($conform_import_data_response->warnings)){
								foreach ($conform_import_data_response->warnings as $current_warning) {
									$warning_rows[] = $current_warning;
								}
							}
							// if the component has errors, include it into failed rows
							if(!empty($conform_import_data_response->errors)){
								foreach ($conform_import_data_response->errors as $current_error) {
									$failed_rows[] = $current_error;
								}
								// continue 2; // go to next row
								continue; // go to next column
							}

						// conformed_value. value conformed replacement
							$conformed_value = $conform_import_data_response->result;

						switch (true) {

							// Branch 1 — metadata dates (dd199 created_date, dd201 modified_date)
						// Writing these components requires a dual update: the component dato
						// AND the section's dedicated DB column (set_created_date / set_modified_date).
						// For modified_date: save_modified must also be forced to false so the
						// section's on-save hook does not overwrite the imported timestamp with 'now'.
							case ($component_tipo===$created_date->tipo): // dd199
							// modified_date. Place it at end columns to prevent overwrite
							case ($component_tipo===$modified_date->tipo): // dd201

								// section set_created_date add
									if (isset($conformed_value[0]) && isset($conformed_value[0]->start)) {
										$dd_date	= new dd_date($conformed_value[0]->start);
										$timestamp	= $dd_date->get_dd_timestamp();
										// set value to section
										if ($component_tipo===$created_date->tipo) {
											$component->get_my_section()->set_created_date($timestamp);
										}elseif ($component_tipo===$modified_date->tipo) {
											$component->get_my_section()->set_modified_date($timestamp);
										}
									}

								// save_modified. Only for modified_date, set section save_modified to false
									if ($component_tipo===$modified_date->tipo) {
										$component->get_my_section()->save_modified = false; // (!) important set to false
								}

							// component save
								$component->set_data($conformed_value);
								$component->import_save();
							break;

						// Branch 2 — metadata users (dd200 created_by_user, dd197 modified_by_user)
						// Same dual-update pattern: component dato + section DB column via
						// set_created_by_userID / set_modified_by_userID. For modified_by_user:
						// save_modified must be false to suppress the automatic 'modified' stamp.
						case ($component_tipo===$created_by_user->tipo): // dd200
						// modified_by_user. Place it at end columns to prevent overwrite
						case ($component_tipo===$modified_by_user->tipo): // dd197

							// section set_created_by_userID/set_modified_by_userID add
								if (isset($conformed_value[0]) && isset($conformed_value[0]->section_id)) {
									// set value to section
									if ($component_tipo===$created_by_user->tipo) {
										$component->get_my_section()->set_created_by_userID(
											(int)$conformed_value[0]->section_id
										);
									}elseif ($component_tipo===$modified_by_user->tipo) {
										$component->get_my_section()->set_modified_by_userID(
											(int)$conformed_value[0]->section_id
										);
									}
								}

							// save_modified. Only for modified_by_user, set section save_modified to false
								if ($component_tipo===$modified_by_user->tipo) {
									$component->get_my_section()->save_modified = false; // (!) important set to false
								}

							// component save
								$component->set_data($conformed_value);
								$component->import_save();
							break;

						default:

							// Branch 3a — multi-language object: {"lg-eng":[...],"lg-spa":[...]}
							// When the conformed value is a plain object (not array) and the component
							// supports translation or lang variants, iterate the lang keys and save
							// each subset with set_data_lang() so every language is persisted
							// independently. Each save call merges only that language's items and
							// leaves other languages untouched.
							if (($translate===true || $with_lang_versions===true) && is_object($conformed_value)) {

								debug_log(__METHOD__
									. " Parsing multi-language value [$component_tipo - $section_tipo - $section_id]: " .PHP_EOL
									. ' value:' . to_string($conformed_value)
									, logger::DEBUG
								);
								foreach ($conformed_value as $v_key => $v_value) {

									if (strpos($v_key, 'lg-')===0) {
										// Use set_data_lang() instead of set_data() to ensure 'lang' property
										// is assigned on all data items (including pre-existing objects from conform_import_data)
										$component->set_data_lang( $v_value, $v_key );
										$save_result = $component->import_save();
										if ($save_result===false) {
											$failed = new stdClass();
												$failed->section_id		= $section_id;
												$failed->data			= $v_value;
												$failed->component_tipo	= $component->get_tipo();
												$failed->msg			= 'IGNORED: component rejected the data on save (lang: '.$v_key.')';
											$failed_rows[] = $failed;
										}
									}else{
										debug_log(__METHOD__
											. " ERROR ON IMPORT VALUE FROM $model_name [$component_tipo]"
											. ' value:' . to_string($conformed_value)
											, logger::ERROR
										);
									}
								}
							}else{

								// check every locator to be sure is valid!!
									if( !empty($conformed_value) &&
										in_array($model_name, component_relation_common::get_components_with_relations())
										) {
										foreach ((array)$conformed_value as $current_locator) {
											if (empty($current_locator->section_tipo) || empty($current_locator->section_id)) {
												$error = empty($current_locator->section_id)
													? 'section_id is not valid'
													: 'section_tipo is not valid';
												$failed = new stdClass();
													$failed->section_id		= $section_id;
													$failed->data			= $current_locator;
													$failed->component_tipo	= $component->get_tipo();
													$failed->msg			= 'IGNORED: malformed locator '. $error;
												$failed_rows[] = $failed;
												continue 3;
											}
										}
									}//end if(!empty($conformed_value))

								// nolan-keyed object unwrap
								// Some non-translatable components (e.g. component_geolocation via
								// a legacy export path) may arrive wrapped as {"lg-nolan": [items]}.
								// Unwrap to the raw array before the flat-multi-lang grouping step.
									if (is_object($conformed_value) && property_exists($conformed_value, 'lg-nolan')) {
										$nolan				= 'lg-nolan';
										$conformed_value	= $conformed_value->{$nolan};
									}

								// multi-language flat array check
								// v7 stored data is a flat array where every item carries its own lang, as:
								// [{"value":"hello","lang":"lg-eng"},{"value":"hola","lang":"lg-spa"}]
								// it is the format produced by the raw export (dedalo_data wrapper).
								// When the items define langs, group them by lang and save each lang
								// separately with set_data_lang() to preserve all the translations
								// (the default set_data action would force every item to the import lang)
									$ar_lang_groups = [];
									if ($translate===true && is_array($conformed_value)) {
										$has_lang_items = false;
										foreach ($conformed_value as $current_item) {
											$item_lang = (is_object($current_item) && !empty($current_item->lang))
												? $current_item->lang
												: $component->get_lang();
											if (is_object($current_item) && !empty($current_item->lang)) {
												$has_lang_items = true;
											}
											$ar_lang_groups[$item_lang][] = $current_item;
										}
										if ($has_lang_items===false) {
											// no lang defined in any item: use the default set dato path
											$ar_lang_groups = [];
										}
									}

								if (!empty($ar_lang_groups)) {

									// set every lang group separately
									foreach ($ar_lang_groups as $group_lang => $group_items) {
										$component->set_data_lang($group_items, $group_lang);
									}

									// Save of course
									$save_result = $component->import_save();
									if ($save_result===false) {
										$failed = new stdClass();
											$failed->section_id		= $section_id;
											$failed->data			= $conformed_value;
											$failed->component_tipo	= $component->get_tipo();
											$failed->msg			= 'IGNORED: component rejected the data on save';
										$failed_rows[] = $failed;
									}
								}else{

									// set dato (Branch 3c — default path)
								// When the raw export contained a dataframe-only envelope (no
								// main dato), skip writing the component data entirely — only
								// the frames will be written below. Otherwise, push the value
								// via update_data_value (the unified API path that also updates
								// the observable and handles component_relation_related correctly).
									if ( $import_dataframe!==null && $import_has_dato===false ) {
										// dataframe-only envelope: the component data is not
										// touched, only the frames are written below
									}else{

										// Removed direct call
										// unified with API calls with changed_data_item object
											// $component->set_data( $conformed_value );
											// $component->observable_dato = ($component->model === 'component_relation_related')
											// 	? $component->get_data_with_references()
											// 	: $conformed_value;

										// added changed data object to set data and observable data
										$changed_data_item = new stdClass();
											$changed_data_item->action = 'set_data';
											$changed_data_item->value = $conformed_value;

										$component->update_data_value($changed_data_item);
									}

									// Save of course
										$save_result = $component->import_save();
										if ($save_result===false) {
											$failed = new stdClass();
												$failed->section_id		= $section_id;
												$failed->data			= $conformed_value;
												$failed->component_tipo	= $component->get_tipo();
												$failed->msg			= 'IGNORED: component rejected the data on save';
											$failed_rows[] = $failed;
										}
								}

								// dataframe envelope: write the frames pairing the
								// (already saved) component items
									if (!empty($import_dataframe)) {
										$dataframe_result = $component->import_dataframe_data($import_dataframe);
										if ($dataframe_result===false) {
											$failed = new stdClass();
												$failed->section_id		= $section_id;
												$failed->data			= $import_dataframe;
												$failed->component_tipo	= $component->get_tipo();
												$failed->msg			= 'IGNORED: component rejected the dataframe data on save';
											$failed_rows[] = $failed;
										}
									}
							}
							break;
					}//end switch (true)


					// set the information about the process
					$process_info->component_tipo = $component_tipo;
					$process_info->component_label = ontology_node::get_term_by_tipo($component_tipo,DEDALO_APPLICATION_LANG, true);

					// print the process_info
					if ( running_in_cli()===true ) {
						print_cli($process_info);
					}
				}//end foreach ($columns as $key => $value)

			// action add for statistics (BUG FIX: use !$exists instead of undefined $create_record)
				if(!$exists) {
					$created_rows[] = $section_id;
				}else{
					$updated_rows[] = $section_id;
				}

			// Forces collection of any existing garbage cycles
				$counter++;
				if ($counter===100) {
					$counter = 0;
					gc_collect_cycles();
				}
		}//end foreach ($ar_csv_data as $key => $value)

		// response
			if (!empty($updated_rows) || !empty($created_rows)) {
				$response->result		= true;
				$response->msg			= 'Section: '.$section_tipo.'. Total records created:'.count($created_rows).' - updated:'.count($updated_rows).' - failed:'.count($failed_rows).' - warnings:'.count($warning_rows);
				$response->created_rows	= $created_rows;
				$response->updated_rows	= $updated_rows;
				$response->failed_rows	= $failed_rows;
				$response->warning_rows	= $warning_rows;
			}
			$response->time = exec_time_unit($start_time,'ms');

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'CSV import failed: ' . $e->getMessage();
			$response->errors[] = $e->getMessage();
			debug_log(__METHOD__ . " CSV import failed with exception: " . $e->getMessage(), logger::ERROR);
		} finally {
			// (!) Always restore global state regardless of success or exception.
			// Failure to restore would leave activity logging disabled or the time-machine
			// suppressed for all subsequent requests in the same worker process.
			logger_backend_activity::$enable_log = $original_log_state;
			// back to set time machine to true for the next savings.
			tm_record::$save_tm = true;
		}

		return $response;
	}//end import_dedalo_csv_file



	/**
	* VERIFY_CSV_MAP
	* Validates that every 'checked' + 'map_to' column in a CSV column map refers to a
	* component that actually exists in the target section (or in the system metadata group).
	*
	* The method resolves the complete tree of component tipos available in $section_tipo
	* (including virtual and recursive children) and checks each mapped target against that
	* list. Synthetic targets ('section_id', 'created_by_user', 'created_date',
	* 'modified_by_user', 'modified_date', plus any tipo in DEDALO_SECTION_INFO_SECTION_GROUP)
	* are allowed unconditionally because they are handled by special branches in
	* import_dedalo_csv_file() rather than by ontology lookup.
	*
	* Returns early with result=false (not an exception) when a mapped tipo is not found, so
	* the caller can report the specific invalid tipo to the user.
	*
	* (!) This method is absent from API_ACTIONS — it is a private validation helper
	* called only by import_dedalo_csv_file().
	*
	* @param array $csv_map - array<object> column-map from get_csv_files() / the JS client;
	*                         each entry must have at minimum: checked (bool), map_to (string)
	* @param string $section_tipo - the destination section tipo to validate against
	* @return object $response
	*   - result bool   — true when all checked/mapped tipos are valid for the section
	*   - msg   string  — 'OK. Request done successfully' on success; error description on failure
	*/
	public static function verify_csv_map(array $csv_map, string $section_tipo) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// ar_section_info — system metadata tipos shared by all sections
		// These tipos (dd199, dd200, dd197, dd201, and more) live in the
		// DEDALO_SECTION_INFO_SECTION_GROUP and are valid targets in every section.
		// Previously the list was hard-coded (the commented-out array above); now it is
		// resolved dynamically from the ontology so it stays in sync automatically.
			// $ar_section_info = [
			// 	'dd200',
			// 	'dd199',
			// 	'dd197',
			// 	'dd201',
			// 	'dd271',
			// 	'dd1223',
			// 	'dd1224',
			// 	'dd1225'
			// ];
			$ar_section_info = ontology_node::get_ar_children(DEDALO_SECTION_INFO_SECTION_GROUP);

		// ar_component_tipo — all component tipos reachable in this section
		// resolve_virtual=true and recursive=true ensure that components living in
		// virtual sections (e.g. portal groups) are included in the allowed set.
			$ar_possible_component_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo, // section_tipo
				['component_'], // ar_model_name
				true, // from_cache
				true, // resolve_virtual
				true, // recursive
				false // search_exact
			);

		// early exit — no column is actually mapped, nothing to validate
			$map_to		= array_column($csv_map, 'map_to');
			$non_empty	= array_filter($map_to);
			if(empty($non_empty)) {
				return $response;
			}

		// csv_map iterate
			foreach ($csv_map as $column_map) {

				// skip unchecked / unmapped columns — not an error; the user simply
				// deselected these columns in the import UI
				if(!isset($column_map->checked) || $column_map->checked ===false || empty($column_map->map_to) ){
					continue;
				}

				// sample item (from ar_columns_map)
					// {
					// 	"tipo": "dd199",
					// 	"label": "Creation date",
					// 	"model": "component_date",
					// 	"checked": true,
					// 	"map_to": "dd199"
					// }

				$component_tipo = $column_map->map_to;

				// allow synthetic / metadata targets without an ontology check
				// These are either virtual keys ('section_id') that do not exist in the
				// ontology or metadata tipos from DEDALO_SECTION_INFO_SECTION_GROUP that
				// are valid in every section regardless of its own component tree.
					if(	   $component_tipo==='section_id'
						|| $component_tipo==='created_by_user'
						|| $component_tipo==='created_date'
						|| $component_tipo==='modified_by_user'
						|| $component_tipo==='modified_date'
						|| in_array($component_tipo, $ar_section_info)
					) continue;

				// error case (ar_possible_component_tipo)
					if (!in_array($component_tipo, $ar_possible_component_tipo)) {

						$model_name = ontology_node::get_model_by_tipo($component_tipo, true);

						$response->result	= false;
						$response->msg		= "Sorry, component tipo: $component_tipo (model: $model_name) not found in section: $section_tipo";
						debug_log(__METHOD__
							. " $response->msg " . PHP_EOL
							. ' component_tipo: ' .$component_tipo
							, logger::ERROR
						);
						return $response;
					}
			}

		// response
			$response->result	= true;
			$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end verify_csv_map



	/**
	* BUILD_USER_LOCATOR
	* (DEAD CODE — method body is commented out; kept for reference)
	* Was: build a safe locator from a CSV cell for user-type components (created_by_user,
	* modified_by_user). Accepted either a plain int section_id or a full JSON locator object.
	* Superseded by component_select::conform_import_data() which handles user locators directly.
	* @param string $value - raw CSV cell value (int or JSON locator)
	* @param string $from_component_tipo - the component tipo that owns the relation
	* @return object|null $locator - full locator object, or null on empty/invalid input
	*/
		// public static function build_user_locator(string $value, string $from_component_tipo) : ?object {

		// 	$value = trim($value);

		// 	// no value case
		// 		if (empty($value)) {
		// 			return null;
		// 		}

		// 	// try to JSON decode (null on not decode)
		// 	$value_json = json_handler::decode($value);
		// 	if (!$value_json) {

		// 		// old format (section_id)
		// 		// is int. Builds complete locator and set section_id from value
		// 		$locator = new locator();
		// 			$locator->set_type(DEDALO_RELATION_TYPE_LINK);
		// 			$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
		// 			$locator->set_from_component_tipo($from_component_tipo);
		// 			$locator->set_section_id($value);
		// 	}else{

		// 		// locator or array of locators is received
		// 			$locator_base = is_array($value_json)
		// 				? reset($value_json)
		// 				: $value_json;

		// 		// is full locator. Inject safe fixed properties to avoid errors
		// 			$locator = new locator($locator_base);
		// 				if (!property_exists($locator_base, 'type')) {
		// 					$locator->set_type(DEDALO_RELATION_TYPE_LINK);
		// 				}
		// 				if (!property_exists($locator_base, 'section_tipo')) {
		// 					$locator->set_section_tipo(DEDALO_SECTION_USERS_TIPO);
		// 				}
		// 				if (!property_exists($locator_base, 'from_component_tipo')) {
		// 					$locator->set_from_component_tipo($from_component_tipo);
		// 				}
		// 	}

		// 	// fail case
		// 		if (!isset($locator) || !isset($locator->section_id)) {
		// 			debug_log(__METHOD__
		// 				. " Error on get user locator value" .PHP_EOL
		// 				. ' value: ' . json_encode($value, JSON_PRETTY_PRINT)
		// 				, logger::ERROR
		// 			);
		// 			return null;
		// 		}

		// 	return $locator;
		// }//end build_user_locator


	/**
	* BUILD_AR_LOCATORS
	* (DEAD CODE — method body is commented out; kept for reference)
	* Was: build an array of locators from a CSV cell for relation components. Handled
	* both plain comma-separated section_id lists ('1,4,6') and full JSON locator arrays.
	* Superseded by component_relation_common::conform_import_data() which now covers all
	* these cases directly.
	* @param object $options - type, column_name, section_tipo, value
	* @return array|null $locator - array of locator objects, or null on empty/invalid input
	*/
		// public static function build_ar_locators(object $options) : ?array {

		// 	// options
		// 		$type			= $options->type;
		// 		$column_name	= $options->column_name;
		// 		$section_tipo	= $options->section_tipo;
		// 		$value			= $options->value;

		// 	// no value case
		// 		if (empty($value)) {
		// 			return null;
		// 		}

		// 	// return value
		// 		$ar_locators = [];

		// 	// column name could be only the tipo as "rsc85" or a identifier as "rsc85_rsc197"
		// 	// the component tipo are always the first tipo in the column name
		// 	$ar_tipos				= explode(locator::DELIMITER, $column_name);
		// 	$from_component_tipo	= $ar_tipos[0];
		// 	$target_section_tipo	= $ar_tipos[1] ?? null;

		// 	// check if the value is not a valid json or if it's a int,
		// 	// cases: 1 || 4,5
		// 	// 1 is an int and 4,5 is string
		// 	// but not the locator [{"section_tipo":"oh1","section_id":"1"}] it's valid json
		// 	if (is_string($value) || is_int($value)) {

		// 		// $target_section_tipo
		// 			if( empty($target_section_tipo)) {
		// 				$model_name	= ontology_node::get_model_by_tipo($from_component_tipo);
		// 				$component	= component_common::get_instance(
		// 					$model_name, // string model
		// 					$from_component_tipo, // string tipo
		// 					null, // string section_id
		// 					'list', // string modo
		// 					DEDALO_DATA_LANG, // string lang
		// 					$section_tipo // string section_tipo
		// 				);

		// 				$ar_target_section_tipo = $component->get_ar_target_section_tipo();

		// 				if(count($ar_target_section_tipo)>1){
		// 					debug_log(__METHOD__
		// 						." Trying to import multiple section_tipo without clear target" .PHP_EOL
		// 						.' ar_target_section_tipo: ' . json_encode($ar_target_section_tipo, JSON_PRETTY_PRINT)
		// 						, logger::ERROR
		// 					);
		// 					return null;
		// 				}
		// 				$target_section_tipo = reset($ar_target_section_tipo);
		// 			}

		// 		$ar_values	= explode(',', $value);
		// 		foreach ($ar_values as $section_id) {
		// 			// old format (section_id)
		// 			// is int. Builds complete locator and set section_id from value
		// 			$locator = new locator();
		// 				$locator->set_type($type);
		// 				$locator->set_section_tipo($target_section_tipo);
		// 				$locator->set_from_component_tipo($from_component_tipo);
		// 				$locator->set_section_id(trim($section_id));

		// 			$ar_locators[] = $locator;
		// 		}
		// 	}else{

		// 		// Locator case
		// 		foreach ((array)$value as $current_locator) {

		// 		// is full locator. Inject safe fixed properties to avoid errors
		// 			$locator = new locator($current_locator);
		// 				if (!property_exists($current_locator, 'type')) {
		// 					$locator->set_type($type);
		// 				}
		// 				if (!property_exists($current_locator, 'from_component_tipo')) {
		// 					$locator->set_from_component_tipo($from_component_tipo);
		// 				}

		// 			$ar_locators[] = $locator;
		// 		}
		// 	}

		// 	return $ar_locators;
		// }//end build_ar_locators



	/**
	* BUILD_DATE_FROM_VALUE
	* (DEAD CODE — method body is commented out; kept for reference)
	* Was: parse a raw CSV string into a dd_date object suitable for component_date.
	* Accepted either a JSON date object ({"start":{year,month,day,...}}) or a plain
	* Unix timestamp string. Superseded by component_date::conform_import_data() which
	* handles all accepted date formats directly.
	* @param string $value - raw CSV cell value (JSON date object or Unix timestamp string)
	* @return object|null $date - {component_dato: object, timestamp: int}, or null on failure
	*/
		// public static function build_date_from_value(string $value) : ?object {

		// 	$value = trim($value);

		// 	// empty case
		// 		if (empty($value)) {
		// 			return null;
		// 		}

		// 	if ( strpos($value, '{')===0 || strpos($value, '[')===0 ) {
		// 		// is full date. Check object to avoid errors

		// 		# Format
		// 		# {
		// 		#   "start": {
		// 		#     "day": 24,
		// 		#     "hour": 12,
		// 		#     "time": 64891630498,
		// 		#     "year": 2018,
		// 		#     "month": 12,
		// 		#     "minute": 54,
		// 		#     "second": 58
		// 		#   }
		// 		# }
		// 		if ($value_obj = json_decode($value)) {

		// 			// normalize array and object values as single object always
		// 				$value_obj = is_array($value_obj) ? reset($value_obj) : $value_obj;

		// 			// remove lang
		// 				if (isset($value_obj->{DEDALO_DATA_NOLAN})) {
		// 					$value_obj = is_array($value_obj->{DEDALO_DATA_NOLAN})
		// 						? reset($value_obj->{DEDALO_DATA_NOLAN})
		// 						: $value_obj->{DEDALO_DATA_NOLAN};
		// 				}

		// 			// Add start property if not present
		// 				if (!isset($value_obj->start)) {

		// 					$new_value_obj = new stdClass();
		// 						$new_value_obj->start = $value_obj;

		// 					$value_obj = $new_value_obj; // replace here
		// 					debug_log(__METHOD__
		// 						." Warning. Added property start to data value " . PHP_EOL
		// 						.' value: ' . to_string($value)
		// 						, logger::ERROR
		// 					);
		// 				}

		// 			// Check object mandatory properties
		// 				$ar_properties = ['year','month','day']; // ,'hour','minute','second'
		// 				foreach ($ar_properties as $name) {
		// 					if (!isset($value_obj->start->{$name})) {
		// 						debug_log(__METHOD__
		// 							." Error. ignored invalid date value (property '$name' not found)" . PHP_EOL
		// 							.' value: ' .to_string($value)
		// 							, logger::ERROR
		// 						);
		// 						return null;
		// 					}
		// 				}

		// 			// time property is recalculated always for security
		// 				$dd_date	= new dd_date($value_obj->start);
		// 				$time		= dd_date::convert_date_to_seconds($dd_date);
		// 				$value_obj->start->time = $time;

		// 			// date in timestamp format
		// 				$timestamp = $dd_date->get_dd_timestamp();

		// 			// result
		// 				$result = (object)[
		// 					'component_dato'	=> $value_obj,
		// 					'timestamp'			=> $timestamp
		// 				];
		// 		}else{
		// 			return null;
		// 		}

		// 	}else{
		// 		// is date timestamp. Builds complete date object from value

		// 		$dd_date = dd_date::get_dd_date_from_timestamp( $value );

		// 		$value_obj = new stdClass();
		// 			$value_obj->start = $dd_date;

		// 		// result
		// 			$result = (object)[
		// 				'component_dato'	=> $value_obj,
		// 				'timestamp'			=> $value
		// 			];
		// 	}


		// 	return (object)$result;
		// }//end build_date_from_value



	/**
	* GET_SECTION_COMPONENTS_LIST
	* Returns the full list of component tipos available in a section, including the
	* system metadata group, for use by the JS column-mapping UI.
	*
	* The list merges:
	* - All component tipos in the section tree (virtual + recursive children resolved).
	* - All tipos from DEDALO_SECTION_INFO_SECTION_GROUP (dd199, dd200, dd197, dd201, etc.)
	*   which are present in every section and can be imported but are not enumerated in
	*   the section's own component tree.
	*
	* Requires READ permission (level >=1) on the section_tipo (SEC-024 §9.2). Rejects
	* requests where the resolved model is not 'section' to prevent mapping onto arbitrary
	* ontology nodes.
	*
	* @param object $options
	*   - section_tipo string — the target section tipo, e.g. 'oh1'
	* @return object $response
	*   - result  array<object>|false — each entry: {label: string, value: string, model: string}
	*   - label   string — ontology term for the section_tipo (present on success only)
	*   - msg     string — 'OK. Request done' on success, error description on failure
	*/
	public static function get_section_components_list(object $options) : object {

		// options
			$section_tipo = $options->section_tipo;

		// SEC-024 (§9.2): READ gate.
			if (empty($section_tipo)) {
				return (object)['result'=>false,'msg'=>'Error. Missing section_tipo'];
			}
			security::assert_section_permission($section_tipo, 1, __METHOD__);

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		try {

			// model safe
				$model = ontology_node::get_model_by_tipo($section_tipo, true);
				if ($model!=='section') {
					$response->msg .= ' Invalid model (expected section): '.$model;
					return $response;
				}

			// components_list
				$components_list = section::get_ar_children_tipo_by_model_name_in_section(
					$section_tipo, // section_tipo
					['component'], // ar_model_name_required
					true, // from_cache
					true, // resolve_virtual
					true, // recursive
					false, // search_exact
					false // ar_tipo_exclude_elements (on false, look for 'exclude_elements' model in virtaul section and apply)
				);

			if (!empty($components_list)) {

				// section info components
				$section_info_components = ontology_node::get_ar_children(DEDALO_SECTION_INFO_SECTION_GROUP);
				foreach ($section_info_components as $tipo) {
					$components_list[] = $tipo;
				}

				$result = [];
				foreach ($components_list as $tipo) {
					$result[] = (object)[
						'label'	=> ontology_node::get_term_by_tipo($tipo, DEDALO_APPLICATION_LANG, true),
						'value'	=> $tipo,
						'model'	=> ontology_node::get_model_by_tipo($tipo, true)
					];
				}

				$response->result	= $result;
				$response->label	= ontology_node::get_term_by_tipo($section_tipo, DEDALO_APPLICATION_LANG, true);
				$response->msg		= 'OK. Request done';
			}

		} catch (Exception $e) {
			$response->msg .= ' ' . $e->getMessage();
			debug_log(__METHOD__
				. " $response->msg "
				, logger::ERROR
			);
		}


		return $response;
	}//end get_section_components_list



	/**
	* PROCESS_UPLOADED_FILE
	* Moves a freshly uploaded CSV file from the shared temporary upload directory to
	* the authenticated user's per-user CSV staging directory.
	*
	* Called by the JS client after the 'upload_file_' event fires (i.e. after
	* tool_upload has placed the file in DEDALO_UPLOAD_TMP_DIR/<user_id>/<key_dir>/).
	* This is a separate step from import_files to allow users to review the file
	* (via get_csv_files) before committing the import.
	*
	* Security (TOOLS-03):
	* - key_dir is sanitized via sanitize_key_dir() to prevent directory traversal.
	* - tmp_name and file name are both validated through safe_upload_target() before
	*   any filesystem read or rename; path-traversal attempts are rejected with a
	*   logger::ERROR entry.
	* - The target directory is always the authenticated user's own staging dir
	*   (get_files_path()), never a caller-supplied path.
	*
	* @param object $options
	*   - file_data object — upload metadata emitted by tool_upload:
	*       name      string — original filename, e.g. 'exported_oh1.csv'
	*       type      string — MIME type, e.g. 'text/csv'
	*       key_dir   string — upload caller name, e.g. 'tool_upload'
	*       tmp_name  string — PHP-assigned temp basename, e.g. 'phpJIQq4e'
	*       error     int    — PHP upload error code (0 = success)
	*       size      int    — file size in bytes
	*       extension string — file extension, e.g. 'csv'
	* @return object $response
	*   - result    bool   — true on successful move
	*   - file_name string — final basename in the staging directory (present on success)
	*   - msg       string — 'OK. Request done successfully' on success, error on failure
	*   - debug     object — exec_time (only when SHOW_DEBUG===true)
	*/
	public static function process_uploaded_file(object $options) : object {
		$start_time=start_time();

		// response
			$response = new stdClass();
				$response->result 	= false;
				$response->msg 		= 'Error. Request failed. '.__METHOD__.' ';

		// options
			$file_data = $options->file_data;

		// file_data sample
			// {
			// 	"name": "name-rsc197.csv",
			// 	"type": "text/csv",
			// 	"tmp_dir": "DEDALO_UPLOAD_TMP_DIR",
			// 	"key_dir": "tool_upload",
			// 	"tmp_name": "phpJIQq4e",
			// 	"error": 0,
			// 	"size": 22131522,
			// 	"extension": "csv"
			// }

		// short vars
			// TOOLS-03: name, key_dir and tmp_name are all client-supplied; sanitize
			// key_dir and confine the source path before any filesystem use.
			$name		= $file_data->name; // string original file name like 'name-rsc197.csv'
			$key_dir	= sanitize_key_dir($file_data->key_dir ?? ''); // upload caller name like 'tool_upload'
			$tmp_name	= $file_data->tmp_name; // string like 'phpJIQq4e'

			$user_id = logged_user_id();
			$tmp_dir = DEDALO_UPLOAD_TMP_DIR . '/'. $user_id . '/' . $key_dir;

			try {
				$source_file = safe_upload_target($tmp_dir, $tmp_name, false);
			} catch (\Throwable $e) {
				$response->msg .= ' Invalid source file name.';
				debug_log(__METHOD__ .' Rejected unsafe source: '. $e->getMessage(), logger::ERROR);
				return $response;
			}

		// check source file file
			if (!file_exists($source_file)) {
				$response->msg .= ' Source file not found: ' . basename($source_file);
				debug_log(__METHOD__
					. " $response->msg " .PHP_EOL
					. ' source_file: ' .$source_file
					, logger::ERROR
				);
				return $response;
			}

		// check target directory
			$dir = tool_import_dedalo_csv::get_files_path();
			if (!is_dir($dir)) {
				if(!mkdir($dir, 0775,true)) {
					$response->msg .= " Error on read or create default directory. Permission denied ";
					debug_log(__METHOD__
						. " $response->msg "
						, logger::ERROR
					);
					return $response;
				}
				// success
				debug_log(__METHOD__
					." CREATED DIR: $dir "
					, logger::DEBUG
				);
			}

		// target_file
			// TOOLS-03: confine the client-supplied $name under the per-user dir
			// (computed after the dir exists so realpath confinement applies).
			try {
				$target_file = safe_upload_target($dir, $name, false);
			} catch (\Throwable $e) {
				$response->msg .= ' Invalid target file name.';
				debug_log(__METHOD__ .' Rejected unsafe target: '. $e->getMessage(), logger::ERROR);
				return $response;
			}

		// move file
			$moved = rename($source_file, $target_file);
			if ($moved!==true) {
				debug_log(__METHOD__
					. ' Error on move source file to target_dir' . PHP_EOL
					. ' source_file: ' . $source_file . PHP_EOL
					. ' target_file: ' . $target_file
					, logger::ERROR
				);
				$response->msg .= ' Error on move source file to target_dir';
				return $response;
			}

		// response OK
			$response->result		= true;
			$response->file_name	= $name;
			$response->msg			= 'OK. Request done successfully';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				$response->debug = $debug;
			}


		return $response;
	}//end process_uploaded_file



}//end class tool_import_dedalo_csv
