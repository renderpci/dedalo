<?php declare(strict_types=1);
/**
 * CLASS TOOL_UPDATE_CACHE
 * Manages Dédalo cache clean actions
 *
 * Key features:
 * - Bulk cache regeneration for components
 * - Chunk processing to manage memory usage
 * - Support for selective component regeneration
 * - Progress tracking for long-running operations
 *
 * @package Dedalo
 * @subpackage Tools
 */
class tool_update_cache extends tool_common {



	/**
	 * @var int Number of records processed in current operation
	 */
	public static int $n_records = 0;

	/**
	 * @var int Total number of records to process
	 */
	public static int $total = 0;

	/**
	 * @var int Default chunk size for processing records
	 */
	private const CHUNK_SIZE = 1000;

	/**
	 * @var int Maximum execution time in seconds (3 hours)
	 */
	private const MAX_EXECUTION_TIME = 10800;



	/**
	 * UPDATE_CACHE
	 * Executes cache update for selected components in a section
	 * Processes records in chunks to manage memory usage and prevent timeouts
	 *
	 * This method:
	 * - Disables logging and time machine to improve performance
	 * - Creates a bulk process record for tracking
	 * - Processes records recursively in chunks defined by CHUNK_SIZE
	 * - Re-enables logging after completion
	 *
	 * Note: Tool config is stored in the tool section data (tools_register)
	 * Note: Requires active session with valid sqo (search query object)
	 *
	 * @param object $options Configuration object with the following properties:
	 *   - section_tipo: string Section identifier (e.g., 'rsc197') - REQUIRED
	 *   - components_selection: array Components to update, each with:
	 *     - tipo: string Component tipo
	 *     - regenerate_options: object Options for regeneration (e.g., {delete_normalized_files:true})
	 *
	 * @return object Response object with:
	 *   - result: bool Success status
	 *   - msg: string Status message
	 *   - counter: int Number of records processed
	 *   - total: int Total records found
	 *   - n_components: int Number of components updated
	 *
	 * @throws Exception If session sqo is not found or invalid
	 */
	public static function update_cache(object $options) : object {

		// set time limit
			set_time_limit(self::MAX_EXECUTION_TIME);

		// unlock session
			session_write_close();
			ignore_user_abort(true);

		// options
			$section_tipo			= $options->section_tipo ?? null;
			$components_selection	= $options->components_selection ?? null;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// Disable logging activity and time machine # !IMPORTANT
			logger_backend_activity::$enable_log	= false;
			tm_record::$save_tm						= false;

		// RECORDS. Use actual list search options as base to build current search
			$sqo_id	= section::build_sqo_id($section_tipo);
			if (empty($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {
				$response->msg .= ' Section session sqo not found!';
				debug_log(__METHOD__
					. " $response->msg ". PHP_EOL
					. ' sqo_id: ' .$sqo_id
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					dump($_SESSION['dedalo']['config']['sqo'], '$_SESSION[dedalo][config][sqo] ++ ');
				}
				return $response;
			}

		// PROCESS
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
				$section_name = ontology_node::get_term_by_tipo( $section_tipo );
				$ar_component_names = [];
				foreach ($components_selection as $current_item) {
					$ar_component_names[] = ontology_node::get_term_by_tipo($current_item->tipo) . '['.$current_item->tipo .']';
				}
				$component_names = implode(', ', $ar_component_names);
				$bulk_process_label = 'Update cache | ' . $section_name.'['.$section_tipo .'] | ' . $component_names;
				$bulk_process_data = [
					(object)[
						'value'	=> $bulk_process_label,
						'lang'	=> $bulk_process_label_component->get_lang()
					]
				];
				$bulk_process_label_component->set_data($bulk_process_data);
				$bulk_process_label_component->save();

		// process_chunk
			$sqo			= clone $_SESSION['dedalo']['config']['sqo'][$sqo_id];
			$sqo->limit		= self::CHUNK_SIZE;
			$sqo->offset	= 0;

		// count records
			$search			= search::get_instance($sqo);
			$rows_data		= $search->count();
			self::$total	= $rows_data->total;

		// recursive process_chunk. Chunked by sqo limit to prevent memory issues
			tool_update_cache::process_chunk(
				$sqo,
				$section_tipo,
				$components_selection,
				$bulk_process_id
			);

		// Enable logging activity and time machine # !IMPORTANT
			logger_backend_activity::$enable_log	= true;
			tm_record::$save_tm						= true;

		$section_label = ontology_node::get_term_by_tipo($section_tipo, DEDALO_APPLICATION_LANG, true);

		// response
			$response->result		= true;
			$response->msg			= "Updated cache of section $section_label ($section_tipo) successfully";
			$response->counter		= self::$n_records;
			$response->total		= self::$total;
			$response->n_components	= count($components_selection);


		return $response;
	}//end update_cache



	/**
	 * PROCESS_CHUNK
	 * Recursively processes cache updates in chunks to prevent memory overflow
	 *
	 * This method:
	 * - Searches for records using the provided sqo (limited by CHUNK_SIZE)
	 * - Iterates through each record and selected component
	 * - Regenerates component data with provided options
	 * - Recursively calls itself with incremented offset until no more records
	 * - Calls gc_collect_cycles() between chunks to free memory
	 *
	 * Recursion terminates when row_count() returns 0 (no more records found)
	 *
	 * @param object $sqo Search query object for record retrieval
	 *   Must include: limit (chunk size), offset (current position)
	 * @param string $section_tipo Section type identifier (e.g., 'rsc197')
	 * @param array $components_selection Components to regenerate, each with:
	 *   - tipo: string Component tipo
	 *   - regenerate_options: object|null Options for component regeneration
	 * @param int $bulk_process_id Bulk process section identifier for tracking and reversion
	 *
	 * @return bool True on successful completion of all chunks
	 *
	 * @throws Exception If component instantiation or regeneration fails
	 */
	public static function process_chunk(object $sqo, string $section_tipo, array $components_selection, int $bulk_process_id) : bool {

		$start_time=start_time();

		// search
			$search		= search::get_instance($sqo);
			$db_result	= $search->search();

		// CLI process data
			if ( running_in_cli()===true ) {
				$pdata = new stdClass();
					$pdata->msg		= (label::get_label('processing') ?? 'Processing');
					$pdata->counter	= self::$n_records;
					$pdata->total	= self::$total;
				// send to output
				print_cli($pdata);
			}

		// result records iterate
			foreach ($db_result as $row) {

				$section_id = $row->section_id;

				// print CLI. Echo the text msg as line and flush object buffers
				// only if current environment is CLI
				if ( running_in_cli()===true ) {
					$pdata->counter	= self::$n_records;
					$pdata->current	= (object)[
						'section_tipo'	=> $row->section_tipo,
						'section_id'	=> $section_id
					];
					$pdata->memory = dd_memory_usage();
					// send to output
					print_cli($pdata);
				}

				// iterate components_selection (user selected components)
				foreach ($components_selection as $components_selection_item) {

					$current_component_tipo		= $components_selection_item->tipo;
					$current_regenerate_options	= $components_selection_item->regenerate_options;

					// model
						$model = ontology_node::get_model_by_tipo($current_component_tipo,true);
						if (strpos($model, 'component_')===false) {
							debug_log(__METHOD__
								." Skipped element '$model' tipo: $current_component_tipo (is not a component) "
								, logger::ERROR
							);
							continue;
						}

					// component
						$current_component = component_common::get_instance(
							$model,
							$current_component_tipo,
							$section_id,
							'edit',
							DEDALO_DATA_LANG,
							$section_tipo,
							false // cache
						);
						// set the bulk_process_id
						// this allow to revert the bulk import
						$current_component->set_bulk_process_id($bulk_process_id);

					// regenerate data
						// IMPORTANT: Load component data into memory before regeneration
						// Some regeneration operations depend on existing data being available
						$current_component->get_data();
						// exec component regeneration with options
						$result = $current_component->regenerate_component(
							$current_regenerate_options
						);
						if (!$result) {
							debug_log(__METHOD__
								. ' Error on regenerate component ' .PHP_EOL
								. ' model: ' .$model .PHP_EOL
								. ' current_component_tipo: ' .$current_component_tipo .PHP_EOL
								. ' section_tipo: ' .$section_tipo .PHP_EOL
								. ' section_id: ' .$section_id
								, logger::ERROR
							);
						}
				}//end foreach ($components_selection as $components_selection_item)

				// update records counter
				self::$n_records++;
			}//end foreach ($records_data->result as $key => $ar_value)


		// debug info
			debug_log(__METHOD__
				. ' Updating cache chunk of ('.$sqo->limit.') records' .PHP_EOL
				. ' chunk memory usage: ' . dd_memory_usage() .PHP_EOL
				. ' chunk time secs: ' . exec_time_unit($start_time, 'sec')
				, logger::DEBUG
			);

		// recursion
			if ($db_result->row_count() > 0) {

				// Forces collection of any existing garbage cycles
					gc_collect_cycles();

				$sqo->offset = $sqo->offset + $sqo->limit;

				return tool_update_cache::process_chunk($sqo, $section_tipo, $components_selection, $bulk_process_id);
			}

		// debug info
			debug_log(__METHOD__
				. ' Updating cache finish' .PHP_EOL
				. ' total memory usage: ' . dd_memory_usage()
				, logger::DEBUG
			);


		return true;
	}//end process_chunk



	/**
	 * GET_COMPONENT_LIST
	 * Retrieves list of components available for cache updates
	 * Uses get_section_elements_context to get full element context including section_groups
	 *
	 * This method enriches each component with its regenerate_options by calling
	 * the static method get_regenerate_options() on each component model class.
	 * If the method doesn't exist, a warning is logged and null is set.
	 *
	 * @see common::get_section_elements_context
	 *
	 * @param object $options Configuration options passed to get_section_elements_context:
	 *   - ar_section_tipo: array|null Section types to include
	 *   - use_real_sections: bool Default false
	 *   - skip_permissions: bool Default false
	 *   - ar_tipo_exclude_elements: array (optional) Elements to exclude
	 *   - ar_components_exclude: array (optional) Components to exclude
	 *
	 * @return object Response object with:
	 *   - result: array Component list, each element enriched with:
	 *     - regenerate_options: object|null Options available for component regeneration
	 *   - msg: string Status message
	 *
	 * @throws Exception If get_section_elements_context fails
	 */
	public static function get_component_list(object $options) : object {

		// filtered_components
			$component_list = common::get_section_elements_context(
				$options
			);

		// add regenerate_options to components
			foreach ($component_list as $el) {
				$regenerate_options = null;
				if ($el->type==='component') {
					// Check if the model class has the get_regenerate_options method
					if (method_exists($el->model, 'get_regenerate_options')) {
						$regenerate_options = call_user_func([$el->model, 'get_regenerate_options']);
					} else {
						debug_log(__METHOD__
							. " Method 'get_regenerate_options' not found in model: {$el->model} for tipo: {$el->tipo}"
							, logger::WARNING
						);
					}
				}
				$el->regenerate_options = $regenerate_options;
			}

		// response
			$response = new stdClass();
				$response->result	= $component_list;
				$response->msg		= 'OK. Request done successfully';

		return $response;
	}//end get_component_list



}//end class tool_update_cache
