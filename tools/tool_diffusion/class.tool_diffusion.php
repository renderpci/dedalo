<?php declare(strict_types=1);
/**
 * CLASS TOOL_DIFFUSION
 * Manages Dédalo diffusion (publication/export) features for records
 *
 * This tool handles the export and publication of Dédalo records to external systems
 * including databases, APIs, and file formats. It supports:
 * - Multiple diffusion targets (SQL databases, Socrata, XML, etc.)
 * - Bulk publication with chunked processing
 * - Reference resolution across related records
 * - Progress tracking for long-running operations
 * - Post-processing actions (e.g., file merging)
 *
 * Key features:
 * - Configurable diffusion maps defining export targets
 * - Chunk-based processing to manage memory
 * - Bulk process tracking for auditing
 * - Support for publication state filtering
 * - CLI progress reporting
 *
 * @package Dedalo
 * @subpackage Tools
 */
class tool_diffusion extends tool_common {

	/**
	 * @var int Default chunk size for processing records
	 */
	private const CHUNK_SIZE = 1000;

	/**
	 * @var int Maximum execution time in seconds (20 minutes)
	 */
	private const MAX_EXECUTION_TIME = 1200;

	/**
	 * @var object|null Stores the last update_record response for debugging
	 */
	public static ?object $last_update_record_response = null;



	/**
	 * EXPORT
	 * Redirects to export_list method for processing diffusion
	 * Main entry point for diffusion operations from the client
	 *
	 * @param object $options Configuration object with:
	 *   - section_tipo: string Section type identifier - REQUIRED
	 *   - section_id: int|string|null Section ID (null for list mode)
	 *   - diffusion_element_tipo: string Diffusion element tipo - REQUIRED
	 *   - resolve_levels: int|null Number of reference resolution levels (default: 1)
	 *   - skip_publication_state_check: bool|null Skip publication state filtering
	 *   - additions_options: object|null Additional processing options
	 *
	 * @return object Response object with:
	 *   - result: bool Success status
	 *   - msg: array Status messages
	 *   - errors: array Error messages
	 *   - diffusion_data: array Exported data
	 *   - time: string Execution time
	 *   - memory: string Memory usage
	 *
	 * @throws Exception If export_list fails
	 */
	public static function export(object $options) : object {
		$start_time=start_time();

		// options
			$section_tipo					= $options->section_tipo ?? null;
			$section_id						= (isset($options->section_id) ? (int)$options->section_id : null);
			$diffusion_element_tipo			= $options->diffusion_element_tipo;
			$resolve_levels					= $options->resolve_levels ?? 1;
			$skip_publication_state_check	= $options->skip_publication_state_check ?? null;
			$additions_options				= $options->additions_options ?? null;

		// CLI process data
			if ( running_in_cli()===true ) {
				print_cli((object)[
					'msg' => (label::get_label('processing_wait') ?? 'Processing... please wait')
				]);
			}

		// skip_publication_state_check
			if (isset($skip_publication_state_check)) {
				$_SESSION['dedalo']['config']['skip_publication_state_check'] = (int)$skip_publication_state_check;
				debug_log(__METHOD__
					. " Set skip_publication_state_check session value: " . json_encode($skip_publication_state_check)
					, logger::DEBUG
				);
			}

		// export_options
			$export_options = (object)[
				'section_tipo'				=> $section_tipo,
				'section_id'				=> $section_id,
				'diffusion_element_tipo'	=> $diffusion_element_tipo,
				'resolve_levels'			=> $resolve_levels,
				'additions_options'			=> $additions_options
			];

		// response
			$response = tool_diffusion::export_list( $export_options );

			$response->time		= exec_time_unit_auto($start_time);
			$response->memory	= dd_memory_usage();


		return $response;
	}//end export



	/**
	 * EXPORT_LIST
	 * Exports all SQO filtered records in chunks to prevent memory issues
	 *
	 * This method:
	 * - Processes records in chunks of CHUNK_SIZE
	 * - Creates bulk process record for tracking
	 * - Iterates through all matching records
	 * - Calls diffusion class update_record for each
	 * - Handles post-processing actions if defined
	 * - Manages memory with gc_collect_cycles()
	 *
	 * @param object $options Configuration object with:
	 *   - section_tipo: string Section type identifier - REQUIRED
	 *   - section_id: int|null Section ID (null for list mode)
	 *   - diffusion_element_tipo: string Diffusion element tipo - REQUIRED
	 *   - resolve_levels: int Number of reference resolution levels
	 *   - additions_options: object|null Additional options including post_actions
	 *
	 * @return object Response object with:
	 *   - result: bool Success status
	 *   - msg: array Status messages
	 *   - errors: array Error messages
	 *   - diffusion_data: array Flattened diffusion data from all records
	 *   - memory: string Memory usage
	 *   - last_update_record_response: object|null Last record's response
	 *
	 * @throws Exception If diffusion element not found or class instantiation fails
	 */
	public static function export_list(object $options) : object {
		$start_time=start_time();

		// time_limit set
			set_time_limit(self::MAX_EXECUTION_TIME); // Avoiding some cases of infinite loop when data are badly formed

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->errors	= [];

		// options
			$section_tipo			= $options->section_tipo;
			$section_id				= $options->section_id ?? null;
			$diffusion_element_tipo	= $options->diffusion_element_tipo;
			$resolve_levels			= $options->resolve_levels;
			$additions_options		= $options->additions_options;

		// diffusion_data init.
		// It is used to store the returned values from the called diffusion class
			$diffusion_data = [];

		// fix levels on each call
			if (!empty($resolve_levels)) {
				$_SESSION['dedalo']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS'] = (int)$resolve_levels;
			}

		// Write session to unlock session file
			session_write_close();

		// calculate main vars
			// ar_diffusion_map_elements
			$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);
			if (!isset($ar_diffusion_map_elements[$diffusion_element_tipo])) {
				debug_log(__METHOD__
					. " Error. Skipped diffusion_element '$diffusion_element_tipo' not found in ar_diffusion_map " . PHP_EOL
					. ' ar_diffusion_map_elements: '.to_string($ar_diffusion_map_elements)
					, logger::ERROR
				);
				$response->msg[]	= "Error. Skipped diffusion_element $diffusion_element_tipo not found in ar_diffusion_map";
				$response->errors[]	= 'diffusion element not found '.$diffusion_element_tipo;
				return $response;
			}

			// obj_diffusion_element
			$obj_diffusion_element = $ar_diffusion_map_elements[$diffusion_element_tipo];

			// diffusion class. Each diffusion element is managed with their own class that extends the main diffusion class
			$diffusion_class_name = $obj_diffusion_element->class_name;

			// include class file once
			require_once DEDALO_DIFFUSION_PATH . '/class.'.$diffusion_class_name.'.php';

		// export_record
			try{

				// sqo
					if(!empty($section_id)) {

						// edit case. One record

						$locator = new locator();
							$locator->set_section_tipo($section_tipo);
							$locator->set_section_id($section_id);

						$sqo = (object)[
							'section_tipo'			=> [$section_tipo],
							'limit'					=> 1,
							'offset'				=> 0,
							'filter_by_locators'	=> [$locator]
						];
					}else{

						// list case

						$sqo_id			= section::build_sqo_id($section_tipo);
						$sqo_session	= $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;
						if ( empty($sqo_session) ) {

							// error case
							$response->msg[]	= 'Not sqo_session found from id: '.$sqo_id;
							$response->errors[]	= 'no sqo session found';
							debug_log(__METHOD__
								."  " . to_string($response->msg)
								, logger::ERROR
							);
							return $response;
						}
						$sqo = clone($sqo_session);
						$sqo->order	= false;
					}

					// search instance
					$search = search::get_instance($sqo);

					// count records
					$count_result	= $search->count();
					$total			= $count_result->total;

				// short vars
					$counter = 0;

				// CLI process data
					if ( running_in_cli()===true ) {
						$pdata = new stdClass();
							$pdata->msg		= (label::get_label('processing') ?? 'Processing');
							$pdata->counter	= $counter;
							$pdata->total	= $total;
							$pdata->current	= new stdClass();
								$pdata->current->section_tipo = $section_tipo;
							$pdata->total_ms = exec_time_unit($start_time);
							$pdata->errors = $response->errors;
						// send to output
						print_cli($pdata);
					}

				// chunk_n_rows. Set maximum number of records we get from search at once
				$chunk_n_rows = self::CHUNK_SIZE;
				// fix limit of SQO to prevent large sets with PHP memory implications
				$sqo->limit = $chunk_n_rows; // chunk results <= CHUNK_SIZE rows
				// reset offset
				$sqo->offset = 0;

				// BULK PROCESS ID
					// create new process section
					// get the bulk_process_id as the section_id of the section process
						$section = section::get_instance(DEDALO_BULK_PROCESS_SECTION_TIPO);
						$bulk_process_id = $section->create_record();

					// Save the process name into the process section
						$bulk_process_label_model = ontology_node::get_model_by_tipo(DEDALO_BULK_PROCESS_LABEL_TIPO, true);
						$bulk_process_label_component = component_common::get_instance(
							$bulk_process_label_model, // string model
							DEDALO_BULK_PROCESS_LABEL_TIPO, // string tipo
							$bulk_process_id, // string section_id
							'list', // string mode
							DEDALO_DATA_NOLAN, // string lang
							DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
						);
						$bulk_process_data = [
							(object)[
								'value'	=> 'publication',
								'lang'	=> $bulk_process_label_component->get_lang()
							]
						];
						$bulk_process_label_component->set_data($bulk_process_data);
						$bulk_process_label_component->save();
						//set the static var with the bulk_process_id, it will be use to save last publication date
						diffusion::$bulk_process_id = $bulk_process_id;// bulk process id to group the section published.

				// iterate as long as search records are found
				while (true) {

					// search
					$db_result = $search->search();
					if ($db_result === false) {
						break;
					}

					$found_records = $db_result->row_count();
					if ($found_records<1) {
						break;
					}

					// iterate chunk of <=1000 records
					$chunk_response = tool_diffusion::iterate_rows(
						$db_result->fetch_all(), // rows
						$diffusion_element_tipo,
						$diffusion_class_name,
						$counter, // passed by reference
						$pdata // passed by reference
					);

					// store diffusion_data
					if (!empty($chunk_response->diffusion_data)) {
						$diffusion_data[] = $chunk_response->diffusion_data;
					}

					// store errors if occurred
					if (!empty($chunk_response->errors)) {
						$response->errors = array_merge($response->errors, $chunk_response->errors);
					}

					// CLI process data
					if ( running_in_cli()===true ) {
						// update memory usage on each chunk group
						$pdata->memory = dd_memory_usage();
						// send to output
						print_cli($pdata);
					}

					// if found records number is lower than limit, we are done
					if ($found_records < $chunk_n_rows) {
						break;
					}

					// (!) update offset on every loop
					$sqo->offset = $sqo->offset + $chunk_n_rows;

					// clean memory
					// wait for 15 milliseconds every 1000 records
					usleep(15000);
					// Forces collection of any existing garbage cycles
					gc_collect_cycles();
				}

				// post_actions
				// This actions are set in the client side and need to be processed at the end of the records iteration.
				// e.g. 'combine_rendered_files' used to merge all rendered XML files nodes into a one single file containing all nodes.
					$post_actions = $additions_options->post_actions ?? false;
					if ($post_actions) {
						$parts	= explode('::', $post_actions);
						if (count($parts) === 2) {
							$class	= $parts[0];
							$method	= $parts[1];
							if (class_exists($class) && method_exists($class, $method)) {

								$post_actions_options = (object)[
									'diffusion_data' => $diffusion_data
								];
								$post_actions_response = $class::$method( $post_actions_options );

								// Check if the response is an object and has the expected properties
								if (is_object($post_actions_response) && $post_actions_response->result && $post_actions_response->diffusion_data) {
									// replace output diffusion_data
									$diffusion_data = $post_actions_response->diffusion_data;
								}else{
									// Log or handle the case where the post_action method's response is not as expected
									error_log("Post action '{$class}::{$method}' did not return an expected response object.");
								}
							}
						}
					}

			}catch (Exception $e) {
				$response->result	= false;
				$response->msg[]	= 'EXCEPTION caught [export_list]: ' . $e->getMessage();
				$response->errors[]	= $e->getMessage();
				debug_log(__METHOD__
					. "  msg: ". to_string($response->msg) . PHP_EOL
					. ' exception message: ' . $e->getMessage()
					, logger::ERROR
				);
			}
			// remove the bulk_process_id
			diffusion::$bulk_process_id = null;

		// errors
			$total_errors = count($response->errors);

		// response OK
			$response->result			= true;
			$response->diffusion_data	= !empty($diffusion_data) ? array_merge(...$diffusion_data) : []; // flatten array
			$response->msg[]			= ($total_errors > 0)
				? 'Warning. Request done with some errors: ' . $total_errors
				: 'OK. Request done successfully';
			$response->memory			= dd_memory_usage();
			$response->last_update_record_response	= tool_diffusion::$last_update_record_response ?? null;


		return $response;
	}//end export_list



	/**
	 * ITERATE_ROWS
	 * Simple records chunk iterator processing up to CHUNK_SIZE rows
	 * Calls diffusion class update_record method for each row
	 *
	 * @param array $rows Array of row objects from search results
	 * @param string $diffusion_element_tipo Diffusion element tipo identifier
	 * @param string $diffusion_class_name Name of diffusion class to instantiate
	 * @param int &$counter Process counter (passed by reference, incremented for each row)
	 * @param object &$pdata Process data object for CLI output (passed by reference)
	 *
	 * @return object Response object with:
	 *   - diffusion_data: array Flattened array of diffusion data from all rows
	 *   - errors: array Error messages from failed operations
	 *
	 * @throws Exception If diffusion class not found
	 */
	private static function iterate_rows(array $rows, string $diffusion_element_tipo, string $diffusion_class_name, int &$counter, object &$pdata) : object {

		// errors
		$errors = [];
		// diffusion_data
		$diffusion_data = [];

		// class diffusion instance
		if (!class_exists($diffusion_class_name)) {
			throw new Exception("Class $diffusion_class_name not found.");
		}
		$diffusion = new $diffusion_class_name( (object)[
			'diffusion_element_tipo' => $diffusion_element_tipo
		]);

		foreach ($rows as $row) {
			$start_time=start_time();

			$counter++;

			if (!isset($row->section_id, $row->section_tipo)) {
				$errors[] = "Invalid row data: missing section_id or section_tipo.";
				continue;
			}

			$section_id		= $row->section_id;
			$section_tipo	= $row->section_tipo;

			// CLI process data. Echo the text msg as line and flush object buffers
			// only if current environment is CLI
			if ( running_in_cli()===true ) {
				$pdata->counter				= $counter;
				$pdata->current->section_id	= $section_id;
				// send to output
				print_cli($pdata);
			}

			// UPDATE_RECORD
			// This is the specific class method that does the hard work.
			$update_record_response = $diffusion->update_record((object)[
				'section_tipo'				=> $section_tipo,
				'section_id'				=> (int)$section_id,
				'diffusion_element_tipo'	=> $diffusion_element_tipo, // compatibility with v5 model
				'resolve_references'		=> true
			]);

			// handle diffusion_data
			// E.g. Array of URL returned by the XML diffusion class as ['file.xml','file2.xml']
			$diffusion_data[] = $update_record_response->diffusion_data ?? [];

			// handle errors
			$response_errors = $update_record_response->errors ?? [];
			foreach ($response_errors as $current_error) {
				// append errors
				$errors[] = $current_error;
			}
			// manage errors
			if ($update_record_response->result===false) {
				if (isset($update_record_response->code) && $update_record_response->code===2) {
					$msg = "Warning [2] on publish record $section_id . Target table is not defined. Skip reference resolution";
					debug_log(__METHOD__
						. '  ' .  $msg . PHP_EOL
						. 'update_record_response: ' . json_encode($update_record_response, JSON_PRETTY_PRINT)
						, logger::WARNING
					);
				}else{
					$msg = "Error on publish record $section_id";
					$errors[] = 'publication record failed '.$section_id;
					debug_log(__METHOD__
						. '  ' . $msg . PHP_EOL
						. 'update_record_response: ' . json_encode($update_record_response, JSON_PRETTY_PRINT)
						, logger::ERROR
					);
				}
			}

			// fix current response as last_update_record_response
			tool_diffusion::$last_update_record_response = $update_record_response;

			// CLI process data. Echo the text msg as line and flush object buffers
			// only if current environment is CLI
			if ( running_in_cli()===true ) {
				$pdata->current->time	= exec_time_unit($start_time, 'ms');
				$pdata->total_ms		= $pdata->total_ms + $pdata->current->time;
				$pdata->errors			= $errors;
				// send to output
				print_cli($pdata);
			}
		}//end foreach ($rows as $row)

		// response object
		$response = new stdClass();
			$response->diffusion_data	= !empty($diffusion_data) ? array_merge(...$diffusion_data) : []; // flatten data array of arrays
			$response->errors			= $errors;


		return $response;
	}//end iterate_rows



}//end class diffusion
