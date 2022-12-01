<?php
/**
* CLASS TOOL_UPDATE_CACHE
* Manages Dédalo cache clean actions
*
*/
class tool_update_cache extends tool_common {



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
							debug_log(__METHOD__." Error on regenerate componet $model - $current_component_tipo - $section_tipo - $section_id ".to_string(), logger::ERROR);
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
	* GET_COMPONENT_LIST
	* List of components ready to update cache
	*
	* @return object $response
	* 	->result = array of objects
	*/
	public static function get_component_list(object $request_options) : object {

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

		# All section components
			$related_terms = section::get_ar_children_tipo_by_modelo_name_in_section(
				$section_tipo, // section_tipo
				['component_'], // ar_modelo_name_required
				true, // from_cache
				true, // resolve_virtual
				true, // recursive
				false, // search_exact
				false // ar_tipo_exclude_elements
			);

		// Only section list defined components
			// $ar_section_list_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['section_list'], true);
			// if (!isset($section_list_tipo[0])) {
			// 	// throw new Exception("Error Processing Request. Section list not found for $section_tipo", 1);
			// 	$msg = " Error Processing Request. Section list not found for section_tipo: $section_tipo";
			// 	trigger_error($msg);
			// 	$response->msg .= $msg;
			// 	return $response;
			// }
			// $section_list_tipo	= $ar_section_list_tipo[0];
			// $RecordObj_dd		= new RecordObj_dd($section_list_tipo);
			// $related_terms		= $RecordObj_dd->get_ar_terminos_relacionados($section_list_tipo, $cache=true, $simple=true);

		// component_list
			$component_list = [];
			foreach ($related_terms as $current_component_tipo) {
				$model = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
				if (strpos($model, 'component_')===false) {
					debug_log(__METHOD__." Skipped element '$model' tipo: $current_component_tipo (is not a component) ".to_string(), logger::DEBUG);
					continue;
				}

				$component_list[] = (object)[
					'tipo'	=> $current_component_tipo,
					'model'	=> $model,
					'label'	=> RecordObj_dd::get_termino_by_tipo($current_component_tipo, $lang)
				];
			}

		// response
			$response->result	= $component_list;
			$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end get_component_list



}//end class tool_update_cache
