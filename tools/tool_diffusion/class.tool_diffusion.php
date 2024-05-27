<?php
declare(strict_types=1); // NOT IN UNIT TEST !
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
	* @return object $response
	* { result: [{}], msg: '' }
	*/
	public static function get_diffusion_info(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$section_tipo = $options->section_tipo ?? null;

		// levels default from config
			$resolve_levels = diffusion::get_resolve_levels();

		// diffusion_map
			$diffusion_map = diffusion::get_diffusion_map(
				DEDALO_DIFFUSION_DOMAIN,
				true // bool connection_status
			);

		// ar_data. Get data about table and fields of current section diffusion target
			$ar_data = [];
			foreach ($diffusion_map as $diffusion_group => $diffusion_items) {

				$diffusion_element_tipo = $diffusion_items[0]->element_tipo; // like oh63 - Historia oral web

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
							$ar_related = RecordObj_dd::get_ar_terminos_relacionados($info_item->tipo, true, true);
							if (isset($ar_related[0])) {
								$current_name					= RecordObj_dd::get_termino_by_tipo($ar_related[0], null, true, true);
								$info_item->related_tipo		= $ar_related[0];
								$info_item->related_label		= $current_name;
								// $info_item->related_model	= RecordObj_dd::get_modelo_name_by_tipo($ar_related[0],true);
								$info_item->related_model		= RecordObj_dd::get_legacy_model_name_by_tipo($ar_related[0]);
							}
							// add model
							$info_item->model = RecordObj_dd::get_modelo_name_by_tipo($info_item->tipo, true);
						}
					}

				$data_item = (object)[
					'database'				=> $section_tables_map->database_name,
					'table'					=> $section_tables_map->name,
					'fields'				=> $table_fields,
					'section_tables_map'	=> $section_tables_map,
					'table_fields_info'		=> $table_fields_info
				];
				$ar_data[] = $data_item;
			}

		// groups
			// $groups = [];
			// foreach ($diffusion_map as $diffusion_group_tipo => $ar_diffusion_element) {

			// 	$have_section_diffusion = diffusion::have_section_diffusion( $section_tipo, $ar_diffusion_element );
			// 	if ($have_section_diffusion===false) {
			// 		continue; # ignore
			// 	}

			// 	foreach ($ar_diffusion_element as $obj_value) {

			// 		$item = (object)[
			// 			'section_tipo'				=> $section_tipo,
			// 			'mode'						=> 'export_list',
			// 			'diffusion_element_tipo'	=> $obj_value->element_tipo,
			// 			'label'						=> RecordObj_dd::get_termino_by_tipo($obj_value->element_tipo, DEDALO_DATA_LANG, true, false),
			// 			'database_name'				=> $obj_value->database_name ?? MYSQL_DEDALO_DATABASE_CONN,
			// 			'levels'					=> $resolve_levels
			// 		];
			// 		$groups[] = $item;
			// 	}
			// }

		// skip_publication_state_check
			$skip_publication_state_check = isset($_SESSION['dedalo']['config']['skip_publication_state_check'])
				? (int)$_SESSION['dedalo']['config']['skip_publication_state_check']
				: 0;

		// result info
			$result = (object)[
				'resolve_levels'				=> $resolve_levels,
				'skip_publication_state_check'	=> $skip_publication_state_check,
				'diffusion_map'					=> $diffusion_map,
				'ar_data'						=> $ar_data
			];

		// response
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end get_diffusion_info



	/**
	* EXPORT
	* Redirects to proper export manager based on mode (edit/list)
	* @param object $options
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
				'resolve_levels'			=> $resolve_levels
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

						$sqo_id			= section::build_sqo_id($section_tipo, 'list');
						$sqo_session	= $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;
						if ( empty($sqo_session) ) {

							// error case
							$response->msg[]	= 'Not sqo_session found from id: '.$sqo_id;
							$response->error[]	= 'no sqo session found';
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
						// send to output
						print_cli($pdata);
					}

				// chunk_n_rows. Set maximum number of records we get from search at once
				$chunk_n_rows = 1000;
				// fix limit of SQO to prevent large sets with PHP memory implications
				$sqo->limit = $chunk_n_rows; // chunk results <= 1000 rows
				// reset offset
				$sqo->offset = 0;

				// iterate as long as search records are found
				while (true) {

					// search
					$rows_data		= $search->search();
					$found_records	= count($rows_data->ar_records);
					if ($found_records<1) {
						break;
					}

					// iterate chunk of <=1000 records
					$chunk_errors = tool_diffusion::iterate_rows(
						$rows_data->ar_records, // rows
						$diffusion_element_tipo,
						$diffusion_class_name,
						$counter, // passed by reference
						$pdata // passed by reference
					);

					// store errors if occurred
					if (!empty($chunk_errors)) {
						$response->errors = array_merge($response->errors, $chunk_errors);
						// CLI process data
						if ( running_in_cli()===true ) {
							$pdata->errors = $response->errors;
							// send to output
							print_cli($pdata);
						}
					}

					// CLI process data
					if ( running_in_cli()===true ) {
						// update memory usage on each chunk group
						$pdata->memory	= dd_memory_usage();
						// send to output
						print_cli($pdata);
					}

					// (!) update offset on every loop
					$sqo->offset = $sqo->offset + $chunk_n_rows;

					// clean memory
					// wait for 15 milliseconds every 1000 records
					usleep(15000);
					// Forces collection of any existing garbage cycles
					gc_collect_cycles();
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

		// response OK
			$response->result						= true;
			$response->msg[]						= 'OK. Request done successfully';
			$response->memory						= dd_memory_usage();
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
	* @param int &$counter
	* @param object &$pdata
	* @return array $errors
	*/
	public static function iterate_rows(array $rows, string $diffusion_element_tipo, string $diffusion_class_name, int &$counter, object &$pdata) : array {

		// errors
		$errors = [];

		// class diffusion instance
		$diffusion = new $diffusion_class_name();

		foreach ($rows as $row) {
			$start_time=start_time();

			$counter++;

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

			// update record
			$update_record_response = $diffusion->update_record((object)[
				'section_tipo'				=> $section_tipo,
				'section_id'				=> (int)$section_id,
				'diffusion_element_tipo'	=> $diffusion_element_tipo,
				'resolve_references'		=> true
			]);

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
				// send to output
				print_cli($pdata);
			}
		}//end foreach ((array)$rows_data->ar_records as $row)


		return $errors;
	}//end iterate_rows



}//end class diffusion
