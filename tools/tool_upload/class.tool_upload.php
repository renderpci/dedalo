<?php declare(strict_types=1);
/**
 * CLASS TOOL_UPLOAD
 * Manages file upload processing for Dédalo components
 *
 * This tool handles the post-upload processing of files that have been
 * uploaded to temporary storage. It moves files to their final destination
 * and triggers component-specific processing logic.
 *
 * Key features:
 * - Moves uploaded files from temporary to final storage
 * - Triggers component-specific file processing
 * - Logs upload activity for auditing
 * - Supports quality-based file organization
 *
 * @package Dedalo
 * @subpackage Tools
 */
class tool_upload extends tool_common {



	/**
	 * PROCESS_UPLOADED_FILE
	 * This method is called after the file is already uploaded to temporary directory.
	 * Moves the temp file to the final directory and launches the component process method
	 *
	 * Workflow:
	 * 1. Validates required parameters
	 * 2. Closes session to prevent UI blocking
	 * 3. Logs upload activity
	 * 4. Instantiates target component
	 * 5. Moves file to final destination via component->add_file()
	 * 6. Triggers component-specific processing via component->process_uploaded_file()
	 *
	 * @param object $options Configuration object with:
	 *   - file_data: object Uploaded file information (name, size, tmp_name, etc.) - REQUIRED
	 *   - tipo: string Component tipo identifier - REQUIRED
	 *   - section_tipo: string Section tipo identifier - REQUIRED
	 *   - section_id: int|null Section ID (null for new records)
	 *   - caller_type: string Type of caller (currently only 'component' supported) - REQUIRED
	 *   - quality: string|null Quality level for media files (e.g., 'original', 'web')
	 *   - process_options: object|null Additional processing options
	 *   - target_dir: string|null Target directory path (currently unused)
	 *
	 * @return object Response object with:
	 *   - result: bool Success status
	 *   - msg: string Status or error message
	 *   - debug: object|null Debug information (if SHOW_DEBUG is true)
	 *
	 * @throws Exception If component instantiation fails
	 * @throws Exception If file operations fail
	 */
	public static function process_uploaded_file(object $options) : object {
		$start_time=start_time();

		// session close not block user interface
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

		// manage uploaded file
			switch ($caller_type) {

				case ('component'):

					// logger activity. Note that this log is here because generic service_upload
					// is not capable to know if the uploaded file is the last one in a chunked file scenario
						// safe_file_data. Prevent single quotes problems like file names as L'osuna.jpg
						$file_data_encoded	= json_encode($file_data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
						if ($file_data_encoded === false) {
							debug_log(__METHOD__ . ' Failed to encode file_data to JSON', logger::WARNING);
							$safe_file_data = 'encoding_failed';
							$response->errors[] = 'Failed to encode file_data to JSON';
						} else {
							$connection = DBi::_getConnection();
							if ($connection) {
								$safe_file_data = pg_escape_string($connection, $file_data_encoded);
							} else {
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

					// component media
						$model		= ontology_node::get_model_by_tipo($tipo,true);
						$component	= component_common::get_instance(
							$model,
							$tipo,
							$section_id,
							'edit',
							DEDALO_DATA_NOLAN,
							$section_tipo
						);

					// fix current component target quality (defines the destination directory for the file, like 'original')
						$component->set_quality($quality);

					// add file
						$add_file = $component->add_file($file_data);
						if ($add_file->result===false) {
							$response->msg .= $add_file->msg;
							$response->errors[] = $add_file->msg;
							return $response;
						}

					// post processing file (add_file returns final renamed file with path info)
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
			}//end switch (true)

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end process_uploaded_file



}//end class tool_upload
