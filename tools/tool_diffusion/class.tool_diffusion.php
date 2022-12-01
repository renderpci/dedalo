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
	* UPDATE_CACHE
	* Exec a custom action called from client
	* Note that tool config is stored in the tool section data (tools_register)
	* @param object $request_options
	* @return object $response
	*/
	public static function update_cache(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->section_tipo		= null;
				$options->ar_component_tipo	= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$section_tipo		= $options->section_tipo;
			$ar_component_tipo	= $options->ar_component_tipo;

		// Disable logging activity and time machine # !IMPORTANT
			logger_backend_activity::$enable_log = false;
			RecordObj_time_machine::$save_time_machine_version = false;

		// RECORDS. Use actual list search options as base to build current search
			$sqo_id	= implode('_', ['section', $section_tipo, 'list']); // cache key sqo_id
			if (empty($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {
				$response->msg .= ' section session sqo is not found!';
				return $response;
			}
			$sqo			= $_SESSION['dedalo']['config']['sqo'][$sqo_id];
			$sqo->limit		= 0;
			$sqo->offset	= 0;

		// search
			$search		= search::get_instance($sqo);
			$rows_data	= $search->search();

		// result records iterate
			foreach ($rows_data->ar_records as $key => $row) {

				$section_id = $row->section_id;

				foreach ($ar_component_tipo as $current_component_tipo) {

					// model
						$model = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
						if (strpos($model, 'component_')===false) {
							debug_log(__METHOD__." Skipped element '$model' tipo: $current_component_tipo (is not a component) ".to_string(), logger::DEBUG);
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

					// regenerate data
						$current_component->get_dato(); # !! Important get dato before regenerate
						$result = $current_component->regenerate_component();
						if ($result!==true) {
							debug_log(__METHOD__." Error on regenerate component $model - $current_component_tipo - $section_tipo - $section_id ".to_string(), logger::ERROR);
						}

				}//end foreach ($related_terms as $current_component_tipo)

			}//end foreach ($records_data->result as $key => $ar_value)


		// Enable logging activity and time machine # !IMPORTANT
			logger_backend_activity::$enable_log = true;
			RecordObj_time_machine::$save_time_machine_version = true;

		// response
			$response->result	= true;
			$response->msg		= "Updated cache of section $section_tipo successufully. Total records: ".count($rows_data->ar_records)." where components count: ".count($ar_component_tipo);


		return $response;
	}//end update_cache



	/**
	* GET_DIFFUSION_INFO
	* List of components ready to update cache
	*
	* @return object $response
	* 	->result = array of objects
	*/
	public static function get_diffusion_info(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->section_tipo	= null;
				$options->lang			= DEDALO_DATA_LANG;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$section_tipo	= $options->section_tipo;
			$lang			= $options->lang;

		// levels
			$resolve_levels = isset($_SESSION['dedalo4']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS'])
				? $_SESSION['dedalo4']['config']['DEDALO_DIFFUSION_RESOLVE_LEVELS']
				: (defined('DEDALO_DIFFUSION_RESOLVE_LEVELS') ? DEDALO_DIFFUSION_RESOLVE_LEVELS : 2);

		// diffusion_map
			$ar_diffusion_map = diffusion::get_ar_diffusion_map(DEDALO_DIFFUSION_DOMAIN);

			// groups
				// $groups = [];
				// foreach ($ar_diffusion_map as $diffusion_group_tipo => $ar_diffusion_element) {

				// 	$have_section_diffusion = tool_diffusion::have_section_diffusion( $section_tipo, $ar_diffusion_element );
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
			$skip_publication_state_check = $_SESSION['dedalo4']['config']['skip_publication_state_check'] ?? 0;

		// result info
			$result = (object)[
				'resolve_levels'				=> $resolve_levels,
				'ar_diffusion_map'				=> $ar_diffusion_map,
				// 'groups'						=> $groups,
				'skip_publication_state_check'	=> $skip_publication_state_check
			];

		// response
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end get_diffusion_info



	// acc methods



	/**
	* HAVE_SECTION_DIFFUSION
	* Return correspondence of current section in diffusion domain
	* Note: For better control, sections are TR of diffusion_elements. This correspondence always must exists in diffusion map
	* @return bool true/false
	*/
	public static function have_section_diffusion(string $section_tipo, array $ar_diffusion_map_elements=null) : bool {

		$have_section_diffusion = false;

		if (is_null($ar_diffusion_map_elements)) {
			# calculate all
			$ar_diffusion_map_elements = diffusion::get_ar_diffusion_map_elements(DEDALO_DIFFUSION_DOMAIN);
		}
		// dump($ar_diffusion_map_elements, ' ar_diffusion_map_elements ++ '.to_string($section_tipo).' - DEDALO_DIFFUSION_DOMAIN:'.DEDALO_DIFFUSION_DOMAIN);
		foreach ($ar_diffusion_map_elements as $diffusion_group_tipo => $obj_value) {

			$diffusion_element_tipo = $obj_value->element_tipo;

			$ar_related = self::get_diffusion_sections_from_diffusion_element($diffusion_element_tipo, $obj_value->class_name);
			if(in_array($section_tipo, $ar_related)) {
				$have_section_diffusion = true;
				break;
			}
		}

		return $have_section_diffusion;
	}//end have_section_diffusion



	/**
	* GET_DIFFUSION_SECTION
	* @param string $diffusion_element_tipo
	* @return array $ar_diffusion_sections
	*/
	public static function get_diffusion_sections_from_diffusion_element(string $diffusion_element_tipo, string $class_name) {

		if(SHOW_DEVELOPER!==true) {
			if( isset($_SESSION['dedalo4']['config']['ar_diffusion_sections'][$diffusion_element_tipo]) ) {
				return $_SESSION['dedalo4']['config']['ar_diffusion_sections'][$diffusion_element_tipo];
			}
		}

		include_once(DEDALO_CORE_PATH . '/diffusion/class.'.$class_name.'.php');

		$ar_diffusion_sections = $class_name::get_diffusion_sections_from_diffusion_element($diffusion_element_tipo);

		# Store in session
		$_SESSION['dedalo4']['config']['ar_diffusion_sections'][$diffusion_element_tipo] = $ar_diffusion_sections;

		return $ar_diffusion_sections;
	}//end get_diffusion_sections_from_diffusion_element



}//end class diffusion
