<?php declare(strict_types=1); // NOT IN UNIT TEST !
/**
* CLASS TOOL_DIFFUSION
* Manages Dédalo diffusion features
*
*/
class tool_diffusion extends tool_common {



	public static $last_update_record_response;



	/**
	* GET_DIFFUSION_INFO
	* Collect basic tool info needed to create user options
	* Is called on tool build by client
	* @param object $options
	* {
	* 	section_tipo: string
	* }
	* @return object $response
	* 	{ result: [{}], msg: '' }
	*/
	public static function get_diffusion_info(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// options
			$section_tipo = $options->section_tipo ?? null;

		// levels default from config
			$resolve_levels = diffusion::get_resolve_levels();

		// diffusion_map
			$diffusion_map = diffusion::get_diffusion_map(
				DEDALO_DIFFUSION_DOMAIN,
				true // bool connection_status
			);

		// tool_config. Look for 'EXCLUDE_DIFFUSION_ELEMENTS' definition in the tool config (section dd996 filtered by tool name)
			$tool_config = tool_common::get_config('tool_diffusion');
			// EXCLUDE_DIFFUSION_ELEMENTS sample:
			// {
			// 	"EXCLUDE_DIFFUSION_ELEMENTS" : ["navarra97","navarra67"]
			// }
			$EXCLUDE_DIFFUSION_ELEMENTS = isset($tool_config->config->EXCLUDE_DIFFUSION_ELEMENTS) && is_array($tool_config->config->EXCLUDE_DIFFUSION_ELEMENTS)
				? $tool_config->config->EXCLUDE_DIFFUSION_ELEMENTS
				: null;
			// fallback to config EXCLUDE_DIFFUSION_ELEMENTS
			if (!$EXCLUDE_DIFFUSION_ELEMENTS) {
				// try with Dédalo config file definition
				$EXCLUDE_DIFFUSION_ELEMENTS = defined('EXCLUDE_DIFFUSION_ELEMENTS') && is_array(EXCLUDE_DIFFUSION_ELEMENTS)
					? EXCLUDE_DIFFUSION_ELEMENTS
					: null;
			}

		// safe diffusion_map
			if (!empty($EXCLUDE_DIFFUSION_ELEMENTS)) {

				$safe_diffusion_map = [];
				$changed = false;
				foreach ($diffusion_map as $diffusion_group => $diffusion_items) {

					$safe_diffusion_items = [];
					foreach ($diffusion_items as $current_item) {
						if (empty($current_item->element_tipo) || in_array($current_item->element_tipo, $EXCLUDE_DIFFUSION_ELEMENTS)) {
							debug_log(__METHOD__
								. " Excluded diffusion element '$current_item->element_tipo'. Included in config EXCLUDE_DIFFUSION_ELEMENTS values" . PHP_EOL
								. ' EXCLUDE_DIFFUSION_ELEMENTS: ' . to_string($EXCLUDE_DIFFUSION_ELEMENTS)
								, logger::WARNING
							);
							$changed = true;
							continue;
						}
						$safe_diffusion_items[] = $current_item;
					}

					// add if not empty
					if (!empty($safe_diffusion_items)) {
						$safe_diffusion_map[$diffusion_group] = $safe_diffusion_items;
					}
				}
				if ($changed) {
					// replace
					$diffusion_map = $safe_diffusion_map;
				}
			}

		// ar_data. Get data about table and fields of current section diffusion target
			$ar_data = [];
			$final_diffusion_map = [];
			foreach ($diffusion_map as $diffusion_group => $diffusion_items) {

				// check diffusion_group model
				$current_model = ontology_node::get_model_name_by_tipo($diffusion_group, true);
				if ($current_model!=='diffusion_group') {
					debug_log(__METHOD__
						. ' Ignored non diffusion group element' . PHP_EOL
						. ' model: ' . to_string($current_model) . PHP_EOL
						. ' diffusion_group: ' . to_string($diffusion_group)
						, logger::WARNING
					);
					continue;
				}

				// diffusion_group without children case
				if (empty($diffusion_items) || empty($diffusion_items[0])) {
					debug_log(__METHOD__
						. ' Ignored empty diffusion group' . PHP_EOL
						. ' diffusion_group: ' . to_string($diffusion_group) . PHP_EOL
						. ' diffusion_items: ' . to_string($diffusion_items)
						, logger::WARNING
					);
					continue;
				}

				// diffusion_element_tipo
				$diffusion_element_tipo = $diffusion_items[0]->element_tipo ?? null; // like oh63 - Historia oral web
				if (!$diffusion_element_tipo) {
					debug_log(__METHOD__
						. " Invalid empty element_tipo " . PHP_EOL
						. ' diffusion_items: ' . to_string($diffusion_items)
						, logger::ERROR
					);
					$response->errors[] = 'Invalid empty element_tipo';
					continue;
				}

				// config: based on class_name and config.php definitions
					$class_name = $diffusion_items[0]->class_name ?? null;
					$config = null;
					switch ($class_name) {
						case 'diffusion_socrata':
							// add config values
							if (defined('SOCRATA_CONFIG') && is_array(SOCRATA_CONFIG)) {
								$config = (object)[
									'server'	=> SOCRATA_CONFIG['server'] ?? null,
									'mode'		=> SOCRATA_CONFIG['mode'] ?? null
								];
							}
							break;
						default:
							$config = null;
							break;
					}

				// Check if current diffusion element have the current section in some item
				// If not, skip non applicable diffusion map element (excluded from $final_diffusion_map array)
					$ar_related = diffusion::get_diffusion_sections_from_diffusion_element(
						$diffusion_element_tipo,
						$class_name
					);
					if(!in_array($section_tipo, $ar_related)) {
						continue;
					}

				// section_tables_map
					$diffusion_element_tables_map	= diffusion_sql::get_diffusion_element_tables_map( $diffusion_element_tipo );
					$section_tables_map				= $diffusion_element_tables_map->{$section_tipo} ?? (object)[
						'database_name'	=> null,
						'name'			=> null
					];

				// table_fields
					if (empty($diffusion_element_tables_map)) {
						$table_fields_info	= null;
						$table_fields		= [];
					}else{
						$table_fields_info	= diffusion::get_table_fields($diffusion_element_tipo, $section_tipo);
						$table_fields		= array_map(function($el){
							return $el->label;
						}, (array)$table_fields_info);
						// add related terms
						foreach ($table_fields_info as $info_item) {
							// $ar_related = common::get_ar_related_by_model('component', $info_item->tipo, false);
							$ar_related = ontology_node::get_relation_nodes($info_item->tipo, true, true);
							if (isset($ar_related[0])) {
								$current_name				= ontology_node::get_term_by_tipo($ar_related[0], null, true, true);
								$info_item->related_tipo	= $ar_related[0];
								$info_item->related_label	= $current_name;
								$info_item->related_model	= ontology_node::get_legacy_model_name_by_tipo($ar_related[0]);
							}
							// add model
							$info_item->model = ontology_node::get_model_name_by_tipo($info_item->tipo, true);
						}
					}

				$table_tipo = isset($section_tables_map->from_alias) && $section_tables_map->from_alias
					? $section_tables_map->from_alias
					: ($section_tables_map->table ?? null);

				$data_item = (object)[
					'database'				=> $section_tables_map->database_name ?? null,
					'database_tipo'			=> $section_tables_map->database_tipo ?? null,
					'table'					=> $section_tables_map->name,
					'table_tipo'			=> $table_tipo,
					'fields'				=> $table_fields,
					'section_tables_map'	=> $section_tables_map,
					'table_fields_info'		=> $table_fields_info,
					'config'				=> $config
				];
				$ar_data[] = $data_item;

				// safe_diffusion_map add
				$final_diffusion_map[$diffusion_group] = $diffusion_items;
			}//end foreach ($diffusion_map as $diffusion_group => $diffusion_items)

		// skip_publication_state_check
			$skip_publication_state_check = isset($_SESSION['dedalo']['config']['skip_publication_state_check'])
				? (int)$_SESSION['dedalo']['config']['skip_publication_state_check']
				: 1;

		// result info
			$result = (object)[
				'resolve_levels'				=> $resolve_levels,
				'skip_publication_state_check'	=> $skip_publication_state_check,
				'diffusion_map'					=> $final_diffusion_map,
				'ar_data'						=> $ar_data
			];

		// response
			$response->result	= $result;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning. request done with errors';


		return $response;
	}//end get_diffusion_info



	/**
	* EXPORT
	* Redirects to proper export manager based on mode (edit/list)
	* @param object $options {
	*	@property string $section_tipo
	*	@property int|string|null $section_id
	*	@property string $diffusion_element_tipo
	*	@property int|null $resolve_levels
	*	@property bool|null $skip_publication_state_check
	* 	@property object|null $additions_options
	* }
	* @return object $response
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
	* Export all SQO filtered records
	* @param object $options
	* @return object $response
	*/
	public static function export_list(object $options) : object {
		$start_time=start_time();

		// time_limit set
			$minutes = 20;
			$seconds = 60 * $minutes;
			set_time_limit($seconds); // Avoiding some cases of infinite loop when data are badly formed

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
			require_once DEDALO_CORE_PATH . '/diffusion/class.'.$diffusion_class_name.'.php';

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
				$chunk_n_rows = 1000;
				// fix limit of SQO to prevent large sets with PHP memory implications
				$sqo->limit = $chunk_n_rows; // chunk results <= 1000 rows
				// reset offset
				$sqo->offset = 0;

				// BULK PROCESS ID
					// create new process section
						$bulk_process_section = section::get_instance(
							null, // string|null section_id
							DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
						);
						$bulk_process_section->Save();

					// get the bulk_process_id as the section_id of the section process
						$bulk_process_id = $bulk_process_section->get_section_id();

					// Save the process name into the process section
						$bulk_process_label_component = component_common::get_instance(
							'component_input_text', // string model
							DEDALO_BULK_PROCESS_LABEL_TIPO, // string tipo
							$bulk_process_id, // string section_id
							'list', // string mode
							DEDALO_DATA_NOLAN, // string lang
							DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
						);
						$bulk_process_label_component->set_dato(['publication']);
						$bulk_process_label_component->Save();
						//set the static var with the bulk_process_id, it will be use to save last publication date
						diffusion::$bulk_process_id = $bulk_process_id;// bulk process id to group the section published.

				// iterate as long as search records are found
				while (true) {

					// search
					$rows_data		= $search->search();
					$found_records	= count($rows_data->ar_records);
					if ($found_records<1) {
						break;
					}

					// iterate chunk of <=1000 records
					$chunk_response = tool_diffusion::iterate_rows(
						$rows_data->ar_records, // rows
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
			$response->diffusion_data	= array_merge(...$diffusion_data); // flatten array
			$response->msg[]			= ($total_errors > 0)
				? 'Warning. Request done with some errors: ' . $total_errors
				: 'OK. Request done successfully';
			$response->memory			= dd_memory_usage();
			$response->last_update_record_response	= tool_diffusion::$last_update_record_response ?? null;


		return $response;
	}//end export_list



	/**
	* ITERATE_ROWS
	* Simple records chunk iterator
	* Group in max 1000 rows
	* @param array $rows
	* @param string $diffusion_element_tipo
	* @param string $diffusion_class_name
	* @param int &$counter Process counter
	* @param object &$pdata Process data
	* @return object $response
	* 	{
	* 		data: [{}]
	* 		errors: []
	* 	}
	*/
	public static function iterate_rows(array $rows, string $diffusion_element_tipo, string $diffusion_class_name, int &$counter, object &$pdata) : object {

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
		}//end foreach ((array)$rows_data->ar_records as $row)

		// response object
		$response = new stdClass();
			$response->diffusion_data	= array_merge(...$diffusion_data); // flatten data array of arrays
			$response->errors			= $errors;


		return $response;
	}//end iterate_rows



}//end class diffusion
