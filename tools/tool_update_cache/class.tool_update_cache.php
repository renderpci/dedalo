<?php declare(strict_types=1);
/**
* CLASS TOOL_UPDATE_CACHE
* Bulk cache-regeneration tool for Dédalo section components.
*
* Allows an operator to select one or more components belonging to a section and
* force-regenerate their stored cache across every record returned by the current
* search (i.e. honouring the active SQO filters). The operation runs in a
* background CLI process to avoid web-request timeouts.
*
* Responsibilities:
* - Validate inputs and enforce write-permission checks before touching any data.
* - Create a bulk-process tracking record (dd800 section) so the run can be
*   identified and reverted if needed.
* - Process matching records in fixed-size chunks (CHUNK_SIZE = 1 000) via the
*   recursive process_chunk() method, calling gc_collect_cycles() between chunks
*   to keep memory stable over large datasets.
* - Suppress activity logging and Time Machine snapshots for the duration of the
*   batch, then restore both on success or failure (via try/finally).
* - Provide get_component_list() as a synchronous helper that enriches an
*   element-context list with each component's get_regenerate_options() result,
*   so the browser UI can offer per-component regeneration flags.
*
* Extends tool_common (tools/tool_common/class.tool_common.php).
*
* Remote API entry-points are controlled by API_ACTIONS (see SEC-024 §9.2).
* Background-runner access is controlled by BACKGROUND_RUNNABLE.
*
* @package Dédalo
* @subpackage Tools
*/
class tool_update_cache extends tool_common {



	/**
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`. Adding a new public-static method does
	* NOT make it remotely callable; it must also be added here.
	* `process_chunk` is intentionally absent because it expects positional
	* args, not an rqo object.
	*/
	public const API_ACTIONS = [
		'update_cache',
		'get_component_list'
	];

	/**
	* SEC-024 / §9.1b: explicit CLI allowlist for `process_runner.php`.
	* Only `update_cache` is invoked with `background_running:true` from the
	* JS side (see `tools/tool_update_cache/js/tool_update_cache.js`).
	* `get_component_list` is a synchronous lookup helper and must not be
	* dispatched through the background runner.
	* @see core/base/process_runner.php
	*/
	public const BACKGROUND_RUNNABLE = [
		'update_cache'
	];




	/**
	* Running counter of records processed in the current update_cache call.
	* Incremented inside process_chunk() after each record's components are
	* regenerated. Reported back to the caller in the response object.
	* @var int $n_records
	*/
	public static int $n_records = 0;

	/**
	* Total number of records matched by the active SQO for the current run.
	* Set once via search::count() before the first chunk call. Used to
	* report progress and calculate remaining work.
	* @var int $total
	*/
	public static int $total = 0;

	/**
	* Number of records fetched per recursive call in process_chunk().
	* 1 000 is chosen to keep peak memory below PHP's limit while still
	* amortising the overhead of repeated DB round-trips.
	* @var int CHUNK_SIZE
	*/
	private const CHUNK_SIZE = 1000;

	/**
	* Maximum wall-clock time (seconds) granted to a single update_cache call.
	* 10 800 s = 3 hours; set via set_time_limit() at the start of update_cache().
	* Adjust in large deployments where full-section rebuilds exceed 3 hours.
	* @var int MAX_EXECUTION_TIME
	*/
	private const MAX_EXECUTION_TIME = 10800;



	/**
	* UPDATE_CACHE
	* Regenerates the stored cache for selected components across every record
	* matched by the current section SQO.
	*
	* Execution flow:
	* 1. Extend the PHP time limit to MAX_EXECUTION_TIME (3 h) and release
	*    the session lock so the browser is not blocked during the long run.
	* 2. Validate inputs (section_tipo, components_selection) and assert write
	*    permission (level >= 2) on the section and each selected component.
	* 3. Create a bulk-process tracking record in dd800 so the run is auditable
	*    and reversible; the label includes section name + component names.
	* 4. Clone the session SQO for the section (keyed by build_sqo_id()), cap
	*    it at CHUNK_SIZE, and count total matching records.
	* 5. Delegate to process_chunk(), which recurses through the full result set
	*    one chunk at a time.
	* 6. Restore logger_backend_activity::$enable_log and tm_record::$save_tm
	*    in a finally block regardless of success or failure.
	*
	* (!) This method is dispatched as a background CLI process. The session is
	*     closed before work begins (session_write_close()), so $_SESSION is
	*     read-only from this point — only the SQO snapshot cloned in step 4 is
	*     used for record retrieval.
	*
	* @param object $options - Must contain:
	*   - section_tipo (string) e.g. 'rsc197'
	*   - components_selection (array) each item: {tipo:string, regenerate_options:object|null}
	* @return object - stdClass with:
	*   result (bool), msg (string), counter (int), total (int), n_components (int)
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

		// Validate required inputs
			if (empty($section_tipo)) {
				$response->msg .= ' section_tipo is required!';
				return $response;
			}
			if (empty($components_selection) || !is_array($components_selection)) {
				$response->msg .= ' components_selection must be a non-empty array!';
				return $response;
			}

		// SEC-024 (§9.2): WRITE gate. update_cache regenerates and persists
		// component data across the section. Caller must have write (>=2) on
		// the section_tipo plus on every component_tipo in
		// components_selection.
			security::assert_section_permission($section_tipo, 2, __METHOD__);
			foreach ($components_selection as $sel) {
				$comp_tipo = $sel->tipo ?? null;
				if (!empty($comp_tipo)) {
					security::assert_tipo_permission($section_tipo, $comp_tipo, 2, __METHOD__);
				}
			}

		// Validate required constants
			if (!defined('DEDALO_BULK_PROCESS_SECTION_TIPO') || !defined('DEDALO_BULK_PROCESS_LABEL_TIPO')) {
				$response->msg .= ' Required bulk process constants are not defined!';
				return $response;
			}

		// Disable logging activity and time machine # !IMPORTANT
		$original_log_state = logger_backend_activity::$enable_log;
		$original_tm_state = tm_record::$save_tm;
		logger_backend_activity::$enable_log = false;
		tm_record::$save_tm = false;

		try {
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
						if (!isset($current_item->tipo)) {
							debug_log(__METHOD__ . " Component item missing tipo property", logger::WARNING);
							continue;
						}
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

			$section_label = ontology_node::get_term_by_tipo($section_tipo, DEDALO_APPLICATION_LANG, true);

			// response
			$response->result		= true;
			$response->msg			= "Updated cache of section $section_label ($section_tipo) successfully";
			$response->counter		= self::$n_records;
			$response->total		= self::$total;
			$response->n_components	= count($components_selection);

		} catch (Exception $e) {
			$response->result = false;
			$response->msg = 'Cache update failed: ' . $e->getMessage();
			debug_log(__METHOD__ . " Cache update failed with exception: " . $e->getMessage(), logger::ERROR);
		} finally {
			// Always restore the original states
			logger_backend_activity::$enable_log = $original_log_state;
			tm_record::$save_tm = $original_tm_state;
		}

		return $response;
	}//end update_cache



	/**
	* PROCESS_CHUNK
	* Processes one CHUNK_SIZE window of records and recurses until the result
	* set is exhausted.
	*
	* For each record in the current window, every component listed in
	* $components_selection is instantiated with cache=false (forcing a fresh
	* load), assigned the $bulk_process_id for revert-tracking, pre-loaded via
	* get_data(), and then regenerated via regenerate_component($options).
	*
	* Recursion contract:
	* - If the search returned at least one row, gc_collect_cycles() is called
	*   to release circular references, the SQO offset is incremented by
	*   CHUNK_SIZE, and process_chunk() calls itself.
	* - When row_count() returns 0 (window is empty), recursion terminates and
	*   true is returned.
	*
	* (!) $sqo is passed by reference semantics within the recursive call: the
	*     offset increment is applied to the same object, so do NOT share the
	*     $sqo object with other concurrent operations.
	*
	* (!) Non-component tipos (portals, sections, etc.) are silently skipped
	*     with an ERROR log entry when the model string does not contain
	*     'component_'. This is an intentional guard, not a silent failure.
	*
	* @param object $sqo                 - Search query object; limit = CHUNK_SIZE, offset advances each call.
	* @param string $section_tipo        - Section tipo identifier, e.g. 'rsc197'.
	* @param array  $components_selection - Items: {tipo:string, regenerate_options:object|null}.
	* @param int    $bulk_process_id     - Section ID of the dd800 bulk-process record; written to
	*                                      each component instance for Time Machine revert support.
	* @return bool - Always true on clean completion; individual component errors are logged, not thrown.
	* @throws Exception If search or component instantiation throws an unhandled exception.
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
	* Returns the full element-context list for the requested section(s) and
	* enriches each component entry with its declared regenerate_options.
	*
	* Delegates structural discovery to common::get_section_elements_context(),
	* which walks the ontology and applies permission filters. For every element
	* of type 'component', this method calls get_regenerate_options() on the
	* corresponding model class (e.g. component_av::get_regenerate_options()) to
	* retrieve the set of boolean/enum flags the component supports during
	* regeneration (such as {delete_normalized_files:true} for media components).
	*
	* If a component model does not implement get_regenerate_options(), a WARNING
	* is logged and $el->regenerate_options is set to null, which the browser UI
	* renders as "no special options available".
	*
	* (!) skip_permissions is forwarded as-is from $options. Callers that pass
	*     skip_permissions:true bypass ontology-permission filtering. Only trusted
	*     internal callers should do so (the JS client passes true for this tool
	*     because the security gate is already satisfied by API_ACTIONS checks).
	*
	* @param object $options - Forwarded to common::get_section_elements_context(); key fields:
	*   - ar_section_tipo (array|null) section tipos to include
	*   - use_real_sections (bool) default false
	*   - skip_permissions (bool) default false
	*   - ar_tipo_exclude_elements (array|null) element tipos to exclude
	*   - ar_components_exclude (array) component tipos to exclude
	* @return object - stdClass with:
	*   result (array) enriched element-context list (each item gains ->regenerate_options),
	*   msg (string) status message.
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
