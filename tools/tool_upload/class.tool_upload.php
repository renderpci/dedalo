<?php declare(strict_types=1);
/**
* CLASS TOOL_UPLOAD
* Post-upload processing bridge between the generic upload service and Dédalo media components.
*
* Responsibilities:
* - Receives the file_data descriptor written by service_upload (the generic HTTP endpoint that
*   streams multipart uploads into DEDALO_UPLOAD_TMP_DIR) and hands it off to the target
*   component so the component can move the file to its quality-specific storage directory and
*   run its own post-processing logic (EXIF extraction, AV probing, PDF text extraction, etc.).
* - Enforces two-tier security: project-scope record gate (assert_record_in_user_scope) first,
*   then a write-level component permission gate (assert_component_permission, level ≥ 2).
* - Writes an UPLOAD COMPLETE activity-log entry immediately before component processing begins,
*   because the generic service_upload endpoint cannot determine when a chunked transfer is
*   complete and therefore cannot log the final completion itself.
* - Supports quality-based file organization by forwarding the caller-supplied quality string
*   to set_quality() on the instantiated component, which changes the destination directory
*   (e.g. 'original', 'web') prior to the add_file() call.
*
* Architecture notes:
* - Extends tool_common, which provides the tool registry, context building, and API dispatch.
* - The only exposed API action is process_uploaded_file(); all other internal steps are private
*   to that method.
* - Currently only the 'component' caller_type is supported; a default branch logs and rejects
*   any unknown value so future caller_types can be added safely.
* - The class carries no instance state; process_uploaded_file() is a static method.
*
* Relationships:
* - Extends tool_common (tools/tool_common/class.tool_common.php).
* - Delegates file staging to component_media_common::add_file(), which applies SEC-063
*   path-confinement checks before touching the filesystem.
* - Delegates media-specific post-processing to component_media_common::process_uploaded_file(),
*   a hook overridden by concrete subclasses (component_image, component_av, component_pdf, …).
*
* @package    Dédalo
* @subpackage Tools
*/
class tool_upload extends tool_common {



	/**
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`. Any method name absent from this list is
	* rejected by tool_security before dispatch, so adding a new public static
	* method here without registering it in API_ACTIONS does not expose it.
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'process_uploaded_file'
	];



	/**
	* PROCESS_UPLOADED_FILE
	* Entry point called after service_upload has placed the file in the temporary staging
	* directory. Orchestrates the complete post-upload lifecycle for a media component:
	* security gating → activity logging → component instantiation → file staging (add_file)
	* → component-specific processing (process_uploaded_file on the component).
	*
	* Workflow (happy path):
	*   1. Extracts and validates required parameters from $options.
	*   2. Calls session_write_close() so the PHP session lock is released immediately,
	*      allowing the browser to keep sending UI requests while this (potentially slow)
	*      processing runs.
	*   3. Applies project-scope record gate via security::assert_record_in_user_scope()
	*      (skipped when section_id is empty, i.e. the target record does not yet exist).
	*   4. Logs an UPLOAD COMPLETE activity-log entry with the JSON-encoded file_data.
	*      This is done here (not in service_upload) because service_upload cannot tell
	*      whether a multipart/chunked transfer is complete.
	*   5. Resolves the component model and instantiates the component via
	*      component_common::get_instance() in 'edit' mode with DEDALO_DATA_NOLAN.
	*   6. Asserts write permission (level ≥ 2) on the instantiated component via
	*      security::assert_component_permission().
	*   7. Forwards the caller-supplied quality string to set_quality() on the component
	*      so add_file() writes the file into the correct quality subdirectory.
	*   8. Calls component->add_file($file_data): validates, path-confines (SEC-063),
	*      and moves the staged upload to its final location. Returns a $ready descriptor.
	*   9. Calls component->process_uploaded_file($ready, $process_options): runs
	*      component-specific post-processing (EXIF, AV probe, text extraction, etc.).
	*      The base implementation (component_media_common) is a no-op hook; concrete
	*      subclasses override it.
	*
	* The method currently supports only caller_type='component'. Unknown caller_type
	* values fall through to the default case which logs and populates $response->errors
	* without throwing so the caller can inspect the structured response.
	*
	* @param object $options {
	*   file_data:       object   — upload descriptor from service_upload (name, type,
	*                              tmp_dir, key_dir, tmp_name, error, size, extension). REQUIRED.
	*   tipo:            string   — ontology tipo of the target component. REQUIRED.
	*   section_tipo:    string   — ontology tipo of the parent section. REQUIRED.
	*   section_id:      int|null — record ID; null/0 for records not yet saved.
	*   caller_type:     string   — dispatch mode; currently only 'component'. REQUIRED.
	*   quality:         string|null — quality level key (e.g. 'original', 'web') forwarded
	*                                  to component->set_quality() before add_file().
	*   process_options: object|null — opaque options forwarded verbatim to the component's
	*                                  process_uploaded_file() hook.
	*   target_dir:      string|null — reserved; extracted but not currently used.
	* }
	* @return object {
	*   result: bool    — true on success, false on any failure.
	*   msg:    string  — human-readable status or error description.
	*   errors: array   — list of individual error strings (empty on full success).
	*   debug?: object  — {exec_time: string} present only when SHOW_DEBUG === true.
	* }
	*/
	public static function process_uploaded_file(object $options) : object {
		$start_time=start_time();

		// release session lock immediately
		// session_write_close() frees the exclusive PHP session lock so the browser
		// can continue sending requests (e.g. progress polls) while this potentially
		// slow media-processing call runs. Without this, all same-session requests
		// would queue behind this call until it returns.
		session_write_close();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed. '.__METHOD__.' ';
				$response->errors = [];

		// options - validate required parameters
			$file_data			= $options->file_data ?? null;
			$process_options	= $options->process_options ?? new stdClass();
			$tipo				= $options->tipo ?? null;
			$section_tipo		= $options->section_tipo ?? null;
			$section_id			= $options->section_id ?? null;
			$caller_type		= $options->caller_type ?? null;
			$quality			= $options->quality ?? null;
			$target_dir			= $options->target_dir ?? null;

		// validate required parameters
			if (empty($file_data)) {
				$response->msg .= 'Missing required parameter: file_data';
				debug_log(__METHOD__ . " {$response->msg}", logger::ERROR);
				$response->errors[] = 'Missing required parameter: file_data';
				return $response;
			}
			if (empty($caller_type)) {
				$response->msg .= 'Missing required parameter: caller_type';
				debug_log(__METHOD__ . " {$response->msg}", logger::ERROR);
				$response->errors[] = 'Missing required parameter: caller_type';
				return $response;
			}
			if (empty($section_tipo)) {
				$response->msg .= 'Missing required parameter: section_tipo';
				debug_log(__METHOD__ . " {$response->msg}", logger::ERROR);
				$response->errors[] = 'Missing required parameter: section_tipo';
				return $response;
			}
			if (empty($tipo)) {
				$response->msg .= 'Missing required parameter: tipo';
				debug_log(__METHOD__ . " {$response->msg}", logger::ERROR);
				$response->errors[] = 'Missing required parameter: tipo';
				return $response;
			}

		// SEC-024 (§9.4): per-record gate
		// Confirms the requested record falls within the user's allowed project scope.
		// Skipped when section_id is empty/zero because the record may not yet exist
		// (e.g. uploading a file before the section record has been saved for the first time).
			if (!empty($section_id)) {
				security::assert_record_in_user_scope($section_tipo, (int)$section_id, __METHOD__);
			}

		// manage uploaded file
			switch ($caller_type) {

				case ('component'):

					// activity log — logged here, not in service_upload
					// service_upload is a generic HTTP endpoint that only knows about
					// individual HTTP parts. It cannot determine when a chunked/multipart
					// transfer is fully complete, so it cannot log "upload done". This is
					// the first point where the full assembled file is confirmed.
						// safe_file_data — escape single quotes in the JSON representation
						// before writing to the activity log. File names like "L'osuna.jpg"
						// would corrupt a naive SQL string if passed unescaped.
						$file_data_encoded = json_encode($file_data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
						if ($file_data_encoded === false) {
							debug_log(__METHOD__ . ' Failed to encode file_data to JSON', logger::WARNING);
							$safe_file_data = 'encoding_failed';
							$response->errors[] = 'Failed to encode file_data to JSON';
						} else {
							$connection = DBi::_getConnection();
							if ($connection) {
								// preferred path: use pg_escape_string() for correct PostgreSQL escaping
								$safe_file_data = pg_escape_string($connection, $file_data_encoded);
							} else {
								// fallback when no DB connection is available; addslashes() is less
								// robust than pg_escape_string() but avoids a log write failure
								debug_log(__METHOD__ . ' Failed to get database connection for escaping', logger::WARNING);
								$safe_file_data = addslashes($file_data_encoded); // Fallback to basic escaping
								$response->errors[] = 'Failed to get database connection for escaping';
							}
						}
						logger::$obj['activity']->log_message(
							'UPLOAD COMPLETE',
							logger::INFO,
							$tipo,
							NULL,
							[
								'msg'			=> 'Upload file complete. Processing uploaded file',
								'file_data'		=> $safe_file_data
								// 'file_name'	=> $file_data->name,
								// 'file_size'	=> format_size_units($file_data->size),
								// 'time_sec'	=> $file_data->time_sec,
								// 'f_error'	=> $file_data->error || null
							],
							logged_user_id() // int
						);

					// instantiate target component
					// get_model_by_tipo() resolves the PHP class name from the ontology tipo.
					// get_instance() creates the component in 'edit' mode with DEDALO_DATA_NOLAN
					// (language-neutral) because media components are not translatable by tipo.
						$model		= ontology_node::get_model_by_tipo($tipo,true);
						$component	= component_common::get_instance(
							$model,
							$tipo,
							$section_id,
							'edit',
							DEDALO_DATA_NOLAN,
							$section_tipo
						);

					// SEC-024 (§9.2): WRITE gate. process_uploaded_file moves the staged
					// upload onto the destination component and triggers post-processing.
					// Caller must have write (>=2) on (component).
						security::assert_component_permission($component, 2);

					// set quality before add_file() to select the destination directory
					// set_quality() validates the value against the component's accepted quality
					// list (get_ar_quality()). If $quality is null or invalid the component
					// falls back to its default (usually 'original'). This must be called before
					// add_file() because add_file() reads $this->quality to build the target path.
						$component->set_quality($quality);

					// stage the file into the component's media directory
					// component_media_common::add_file() applies SEC-063 path-confinement
					// checks (tmp_dir allowlist + realpath guard) before renaming the file.
					// On success $add_file->ready contains the final file descriptor with
					// the resolved path, extension, and size used in the next step.
						$add_file = $component->add_file($file_data);
						if ($add_file->result===false) {
							$response->msg .= $add_file->msg;
							$response->errors[] = $add_file->msg;
							return $response;
						}

					// component-specific post-processing (add_file returns final renamed file with path info)
					// The base implementation in component_media_common is a no-op hook that returns
					// success immediately. Concrete subclasses override it to run media-specific
					// operations (EXIF extraction, AV probing, PDF text extraction, etc.).
						$process_file = $component->process_uploaded_file($add_file->ready, $process_options);
						if ($process_file->result===false) {
							$response->msg .= 'Errors occurred when processing file: '.$process_file->msg;
							$response->errors[] = 'Errors occurred when processing file: '.$process_file->msg;
							return $response;
						}

					// response OK
						$response->result	= true;
						$response->msg		= empty($response->errors)
							? 'OK. File processed successfully'
							: 'Warning. File processed with errors';
					break;

				default:
					debug_log(__METHOD__
						." Error on process uploaded file. Unsupported caller_type: {$caller_type}. options: " . PHP_EOL
						.to_string($options)
						, logger::ERROR
					);
					$response->msg .= "Unsupported caller_type: {$caller_type}. Only 'component' is currently supported.";
					$response->errors[] = "Unsupported caller_type: {$caller_type}. Only 'component' is currently supported.";
					break;
			}//end switch ($caller_type)

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end process_uploaded_file



}//end class tool_upload
