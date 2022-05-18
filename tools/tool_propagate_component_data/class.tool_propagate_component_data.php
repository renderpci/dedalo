<?php
// includes. Include another files if need
	// include( dirname(__FILE__) . '/additional/class.additional.php');



/*
* CLASS TOOL_PROPAGATE_COMPONENT_DATA
* Manages Dédalo cache clean actions
*
*/
class tool_propagate_component_data extends tool_common {



	/**
	* propagate_component_data
	* Exec a custom action called from client
	* Note that tool config is stored in the tool section data (tools_register)
	* @param object $request_options
	* @return object $response
	*/
	public static function propagate_component_data(object $request_options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$options = new stdClass();
				$options->section_tipo		= null;
				$options->section_id		= null;
				$options->component_tipo	= null;
				$options->action			= null; // add | delete
				$options->lang				= null;
				foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$component_tipo	= $options->component_tipo;
			$action			= $options->action;
			$lang			= $options->lang;
			$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$with_relations	= in_array($model, component_relation_common::get_components_with_relations());

		// source component
			$source_component = component_common::get_instance(
				$model,
				$component_tipo,
				$section_id,
				'list',
				$lang,
				$section_tipo
			);
			$source_dato = $source_component->get_dato();
			if (empty($source_dato)) {
				$response->msg .= ' Empty dato! Ignored action '.$action;
				return $response;
			}

		// Disable logging activity and time machine # !IMPORTANT
			// logger_backend_activity::$enable_log = false;
			// RecordObj_time_machine::$save_time_machine_version = false;

		// RECORDS. Use actual list search options as base to build current search
			$sqo_id	= implode('_', ['section', $section_tipo]);
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
			foreach ($rows_data->ar_records as $row) {

				// section_id
					$current_section_id	= $row->section_id;
					if ($current_section_id==$section_id) {
						// skip self component
						continue;
					}

				// current component
					$current_component	= component_common::get_instance(
						$model,
						$component_tipo,
						$current_section_id,
						'list',
						$lang,
						$section_tipo
					);
					$current_dato = $current_component->get_dato();

				// final_dato. Build final_dato based on action type
					$final_dato = $current_dato;
					switch ($action) {
						case 'delete':

							foreach ((array)$source_dato as $current_value) {

								$key = ($with_relations===true)
									? locator::get_key_in_array_locator($current_value, $final_dato, $ar_properties=['section_tipo','section_id'])
									: array_search($current_value, $final_dato);

								if (false!==$key) {
									unset($final_dato[$key]);
								}
							}
							$final_dato = array_values($final_dato);
							break;

						case 'add':

							foreach ((array)$source_dato as $current_value) {
								if (!in_array($current_value, $final_dato)) {
									$final_dato[] = $current_value;
								}
							}
							break;
					}

				// set and save changes
					if ($final_dato!==$current_dato) {
						$current_component->set_dato($final_dato);
						$current_component->Save();

						debug_log(__METHOD__." Updated dato of $section_tipo - $current_section_id - $component_tipo ".to_string(), logger::DEBUG);
					}

			}//end foreach ($records_data->result as $key => $ar_value)

		// Enable logging activity and time machine # !IMPORTANT
			// logger_backend_activity::$enable_log = true;
			// RecordObj_time_machine::$save_time_machine_version = true;

		// response
			$response->result	= true;
			$response->msg		= "Updated data (action: $action) of section $section_tipo successufully. Total records: ".count($rows_data->ar_records);


		return $response;
	}//end propagate_component_data



}//end class


