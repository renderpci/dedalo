<?php
/**
* CLASS TOOL_UPDATE_CACHE
* Manages Dédalo cache clean actions
*
*/
class tool_update_cache extends tool_common {



	static $n_records = 0;
	static $total; // count records search



	/**
	* UPDATE_CACHE
	* Exec a custom action called from client
	* Note that tool config is stored in the tool section data (tools_register)
	* @param object $options
	* {
	* 	section_tipo: string as 'rsc197'
	* 	components_selection: array as [{tipo:'rsc197', regenerate_options:{delete_normalized_files:true}}]
	* }
	* @return object $response
	*/
	public static function update_cache(object $options) : object {

		// set time limit
			set_time_limit( 3600 * 3 );  // 3 hours

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
			logger_backend_activity::$enable_log				= false;
			RecordObj_time_machine::$save_time_machine_version	= false;

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
				$bulk_process_section = section::get_instance(
					null, // string|null section_id
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);
				$bulk_process_section->Save();

			// get the bulk_process_id as the section_id of the section process
				$bulk_process_id = (int)$bulk_process_section->get_section_id();

			// Save the process name into the process section
				$bulk_process_label_component = component_common::get_instance(
					'component_input_text', // string model
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
				$bulk_process_label_component->set_dato($bulk_process_label);
				$bulk_process_label_component->Save();

		// process_chunk
			$sqo			= clone $_SESSION['dedalo']['config']['sqo'][$sqo_id];
			$sqo->limit		= 1000;
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
			logger_backend_activity::$enable_log				= true;
			RecordObj_time_machine::$save_time_machine_version	= true;

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
	* Recursive
	* Chunk the process into chunks by sqo limit
	* @param object object $sqo
	* @param string $section_tipo
	* @param array $components_selection
	* @return bool
	*/
	public static function process_chunk(object $sqo, string $section_tipo, array $components_selection, int $bulk_process_id) : bool {

		$start_time=start_time();

		// search
			$search		= search::get_instance($sqo);
			$rows_data	= $search->search();

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
			foreach ($rows_data->ar_records as $row) {

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
						$current_component->get_dato(); // !! Important get dato before regenerate
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
			if (!empty($rows_data->ar_records)) {

				// Forces collection of any existing garbage cycles
					unset($rows_data);  // ~ 40MB/1000
					gc_collect_cycles();

				$sqo->offset = $sqo->offset + $sqo->limit;

				return tool_update_cache::process_chunk($sqo, $section_tipo, $components_selection, $bulk_process_id);
			}

		// Forces collection of any existing garbage cycles
			unset($rows_data);  // ~ 40MB/1000
			gc_collect_cycles();

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
	* List of components ready to update cache
	* Uses get_section_elements_context to get a full list
	* of elements context including section_groups
	* @see common::get_section_elements_context
	* Note that whole options are passed to method get_section_elements_context
	* @param object $options
	* {
	* 	ar_section_tipo: array|null
	* 	use_real_sections: bool = false
	* 	skip_permissions: bool = false
	* 	ar_tipo_exclude_elements: array (optional)
	* 	ar_components_exclude: array (optional)
	* }
	* @return object $response
	* 	->result = array of objects
	*/
	public static function get_component_list(object $options) : object {

		// filtered_components
			$component_list = common::get_section_elements_context(
				$options
			);

		// add regenerate_options to components
			array_map(function($el){

				if ($el->type==='component') {
					$regenerate_options = call_user_func([$el->model, 'get_regenerate_options']);
				}
				$el->regenerate_options = $regenerate_options ?? null;
			}, $component_list);

		// response
			$response = new stdClass();
				$response->result	= $component_list;
				$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end get_component_list



}//end class tool_update_cache
