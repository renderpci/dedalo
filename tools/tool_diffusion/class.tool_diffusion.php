<?php
// includes. Include another files if need
	// include( dirname(__FILE__) . '/additional/class.additional.php');



/**
* CLASS TOOL_DIFFUSION
* Manages Dédalo diffusion features
*
*/
class tool_diffusion extends tool_common {



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
			$skip_publication_state_check = $_SESSION['dedalo']['config']['skip_publication_state_check'] ?? 0;

		// result info
			$result = (object)[
				'resolve_levels'				=> $resolve_levels,
				'diffusion_map'					=> $diffusion_map,
				// 'groups'						=> $groups,
				'skip_publication_state_check'	=> $skip_publication_state_check
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

		// options
			$mode					= $options->mode ?? 'edit';
			$section_tipo			= $options->section_tipo ?? null;
			$section_id				= $options->section_id ?? null;
			$diffusion_element_tipo	= $options->diffusion_element_tipo;
			$resolve_levels			= $options->resolve_levels ?? 1;

		// export_options
			$export_options = (object)[
				'section_tipo'				=> $section_tipo ?? null,
				'section_id'				=> $section_id ?? null,
				'diffusion_element_tipo'	=> $diffusion_element_tipo,
				'resolve_levels'			=> $resolve_levels ?? 1
			];

		// response
			$response = ($mode==='list')
				? tool_diffusion::export_list( $export_options ) // list mode (based on session sqo)
				: tool_diffusion::export_edit( $export_options ); // edit mode only one record


		return $response;
	}//end export



	/**
	* EXPORT_EDIT
	* Export selected record
	* @param object $options
	* @return object $response
	*/
	public static function export_edit(object $options) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$section_tipo			= $options->section_tipo;
			$section_id				= $options->section_id;
			$diffusion_element_tipo	= $options->diffusion_element_tipo;
			$resolve_levels			= $options->resolve_levels;

		// fix levels on each call
			$_SESSION['dedalo']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS'] = isset($resolve_levels)
				? $resolve_levels
				: (defined('DEDALO_DIFFUSION_RESOLVE_LEVELS') ? DEDALO_DIFFUSION_RESOLVE_LEVELS : 2);

		// time_limit set
			$minutes = 5;
			$seconds = 60 * $minutes;
			set_time_limit($seconds); // Avoid some infinite loop cases when data is bad formed

		// Write session to unlock session file
			session_write_close();

		// export_record
			try{

				// exec export from current record
				$export_result = tool_diffusion::export_record(
					$section_tipo,
					$section_id,
					$diffusion_element_tipo,
					true, // bool resolve_references
					[] // array ar_records
				);

				$response->result	= $export_result->result;
				$response->msg		= $export_result->msg;

				// Update schema data always
				// $publication_schema_result = tool_diffusion::update_publication_schema($diffusion_element_tipo);

			}catch (Exception $e) {
				$response->result = false;
				$response->msg 	  = 'EXCEPTION [export_edit]: ' . $e->getMessage();
			}


		return $response;
	}//end export_edit



	/**
	* EXPORT_LIST
	* Export all SQO filtered records
	* @param object $options
	* @return object $response
	*/
	public static function export_list(object $options) : object {

		// time_limit set
			$minutes = 20;
			$seconds = 60 * $minutes;
			set_time_limit($seconds); // Prevent some infinite loop cases when data is bad formed

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$section_tipo			= $options->section_tipo;
			$section_id				= $options->section_id ?? null;
			$diffusion_element_tipo	= $options->diffusion_element_tipo;
			$resolve_levels			= $options->resolve_levels;

		// fix levels on each call
			$_SESSION['dedalo']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS'] = !empty($resolve_levels)
				? $resolve_levels
				: (defined('DEDALO_DIFFUSION_RESOLVE_LEVELS') ? DEDALO_DIFFUSION_RESOLVE_LEVELS : 2);

		// Write session to unlock session file
			session_write_close();

		// export_record
			try{

				// diffusion_element
					$RecordObj_dd			= new RecordObj_dd($diffusion_element_tipo);
					$propiedades			= $RecordObj_dd->get_propiedades(true);
					$diffusion_class_name	= $propiedades->diffusion->class_name;

				// reset msg
					$response->msg = '';

				// sqo
					$sqo_id			= implode('_', ['section', $section_tipo]);
					$sqo_session	= $_SESSION['dedalo']['config']['sqo'][$sqo_id] ?? null;
					if ( empty($sqo_session) ) {

						// error case
						$response->msg = ' Not sqo_session found from id: '.$sqo_id;
						debug_log(__METHOD__." $response->msg ", logger::ERROR);
						return $response;

					}else{

						// OK case
						$sqo = clone($sqo_session);
							$sqo->limit		= 'ALL';
							$sqo->offset	= 0;
							$sqo->order		= false;

						$search		= search::get_instance($sqo);
						$rows_data	= $search->search();
					}

				$resolve_references		= true;
				$n_records_published	= 0;
				foreach ((array)$rows_data->ar_records as $row) {

					$section_id		= (int)$row->section_id;
					$section_tipo	= (string)$row->section_tipo;

					// exec export from current record
						$export_result = tool_diffusion::export_record(
							$section_tipo,
							$section_id,
							$diffusion_element_tipo,
							$resolve_references, // bool resolve_references
							$rows_data->ar_records // array ar_records
						);
						if($export_result->result==true) {
							$n_records_published++;
						}else{
							$response->msg .= $export_result->msg;
							debug_log(__METHOD__." export_result ".to_string($export_result), logger::ERROR);
						}

					// diffusion_rdf case
						if ($diffusion_class_name==='diffusion_rdf') {
							break; // Only one iteration is needed
						}
				}//end foreach ((array)$rows_data->ar_records as $row)

				// response info
					$response->n_records_published = $n_records_published;
					if ($n_records_published>0) {
						$response->result = true;
						if ($diffusion_class_name==='diffusion_rdf') {
							$response->msg .= to_string($export_result->msg);
						}else{
							$response->msg .= sprintf("Published %s records successfully", $n_records_published);
						}

					}else{
						$response->result = false;
						$response->msg .= "Error on publish records: response->result is false. n_records_published: $n_records_published";
						debug_log(__METHOD__
							."  ".$response->msg
							, logger::ERROR
						);
					}

				// Update schema data always
				// $publication_schema_result = tool_diffusion::update_publication_schema($diffusion_element_tipo);

			}catch (Exception $e) {
				$response->result	= false;
				$response->msg		= 'EXCEPTION caught [export_list]: ' . $e->getMessage();
				debug_log(__METHOD__
					."  ".$response->msg
					, logger::ERROR
				);
			}

		// debug
			// if(SHOW_DEBUG===true) {
			// 	$debug = new stdClass();
			// 		$debug->exec_time	= exec_time_unit($start_time,'secs')." secs";
			// 		foreach($vars as $name) {
			// 			$debug->{$name} = $$name;
			// 		}
			// 		// $debug->publication_schema = $publication_schema_result;
			// 	$response->debug = $debug;
			// }


		return $response;
	}//end export_list



	/**
	* EXPORT_RECORD
	* Call the required diffusion class and exec a generic 'update_record'
	* @param string $section_tipo
	* @param int $section_id
	* @param string $diffusion_element_tipo
	* @param bool $resolve_references = true
	* @param array $ar_records = []
	* @return object $response
	*/
	public static function export_record(string $section_tipo, int $section_id, string $diffusion_element_tipo, bool $resolve_references=true, array $ar_records=[]) : object {
		// $start_time = start_time();

		// response default
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error on export_record '.$section_tipo;

		// empty records case
			// if (empty($ar_records)) {
			// 	$response->msg .= ' Empty records received!';
			// 	return $response;
			// }

		// ar_diffusion_map_elements
			$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);
			if (!isset($ar_diffusion_map_elements[$diffusion_element_tipo])) {
				debug_log(__METHOD__
					. " Error. Skipped diffusion_element '$diffusion_element_tipo' not found in ar_diffusion_map " . PHP_EOL
					. ' ar_diffusion_map_elements: '.to_string($ar_diffusion_map_elements)
					, logger::ERROR
				);
				$response->msg .= "Error. Skipped diffusion_element $diffusion_element_tipo not found in ar_diffusion_map";
				return $response;
			}

		// obj_diffusion_element
			$obj_diffusion_element = $ar_diffusion_map_elements[$diffusion_element_tipo];

		// diffusion class. Each diffusion element is managed with their own class that extends the main diffusion class
			$diffusion_class_name = $obj_diffusion_element->class_name;

			// include class file
				require_once(DEDALO_CORE_PATH . '/diffusion/class.'.$diffusion_class_name.'.php');

			// class instance
				$diffusion				= new $diffusion_class_name();
				$diffusion->ar_records	= $ar_records;

			// update record
				$diffusion_options = new stdClass();
					$diffusion_options->section_tipo			= $section_tipo;
					$diffusion_options->section_id				= (int)$section_id;
					$diffusion_options->diffusion_element_tipo	= $diffusion_element_tipo;
					$diffusion_options->resolve_references		= $resolve_references;

				$update_record_result = $diffusion->update_record($diffusion_options);

			// check result
			if ($update_record_result && $update_record_result->result) {

				// success
				$response->result = true;

				$max_recursions	= isset($_SESSION['dedalo']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS'])
					? $_SESSION['dedalo']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS']
					: (defined('DEDALO_DIFFUSION_RESOLVE_LEVELS') ? DEDALO_DIFFUSION_RESOLVE_LEVELS : 2);

				$response->msg = sprintf("Published record ID %s successfully (levels: ".$max_recursions.")", $section_id);
				debug_log(__METHOD__." $response->msg ", logger::DEBUG);
			}else{

				// error case
				$response->result	= false;
				$response->msg		= "Error. Error on publish record $section_id";
				debug_log(__METHOD__
					. " $response->msg " .PHP_EOL
					. 'update_record_result: ' . to_string($update_record_result)
					, logger::ERROR
				);
			}

		// msg. Add specific messages
			if (isset($update_record_result->msg)) {
				$update_record_result_msg = array_reduce((array)$update_record_result->msg, function($carry, $item){
					if (!empty($item)) {
						return $item;
					}
					return $carry;
				});
				$response->msg .= ' ' . $update_record_result_msg;
			}

		// debug
			// if(SHOW_DEBUG===true) {
			// 	$response->debug = $update_record_result;
			// 	if (function_exists('bcdiv')) {
			// 		$memory_usage = bcdiv(memory_get_usage(), 1048576, 3);
			// 	}else{
			// 		$memory_usage = memory_get_usage();
			// 	}
			// 	// $response->msg .= " Exec in ".exec_time_unit($start_time,'secs')." secs - MB: ". $memory_usage ."";
			// }


		return $response;
	}//end export_record



}//end class diffusion
