<?php
/**
* CLASS TOOL_PROPAGATE_COMPONENT_DATA
* Manages Dédalo propagation data
*
*/
class tool_propagate_component_data extends tool_common {



	/**
	* PROPAGATE_COMPONENT_DATA
	* Exec a custom action called from client
	* Note that tool config is stored in the tool section data (tools_register)
	* @param object $options
	* @return object $response
	*/
	public static function propagate_component_data( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options
			$section_tipo			= $options->section_tipo;
			$component_tipo			= $options->component_tipo;
			$action					= $options->action;
			$lang					= $options->lang;
			$propagate_data_value	= $options->propagate_data_value ?? null;
			$process_label			= $options->process_label ?? null;

		// short vars
			$mode			= 'list';
			$model			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$with_relations	= in_array($model, component_relation_common::get_components_with_relations());

		// components mono-value case. Prevent to propagate 'add'
			if ($action==='add' && in_array($model, component_common::$components_monovalue)) {
				$response->msg = 'Sorry, action \'add\' is not allowed for this component';
				return $response;
			}

		// RECORDS. Use actual list search options as base to build current search
			$sqo_id	= section::build_sqo_id($section_tipo);
			if (empty($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {

				// sqo create
					$sqo = new search_query_object();
						$sqo->set_mode($mode);
						$sqo->set_section_tipo([$section_tipo]);

				debug_log(__METHOD__
					. " Auto-created SQO from section: $section_tipo" . PHP_EOL
					. to_string($sqo)
					, logger::WARNING
				);

			}else{

				// sqo from session
				$original_sqo	= $_SESSION['dedalo']['config']['sqo'][$sqo_id];
				$sqo			= clone($original_sqo);
			}
			// reset sqo limit/offset
			$sqo->limit		= 0;
			$sqo->offset	= 0;

		// search
			$search		= search::get_instance($sqo);
			$rows_data	= $search->search();

		// short vars
			$counter			= 0;
			$total				= count($rows_data->ar_records);
			$section_label		= RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_APPLICATION_LANG, true);
			$component_label	= RecordObj_dd::get_termino_by_tipo($component_tipo, DEDALO_APPLICATION_LANG, true);

		// CLI process data
			if ( running_in_cli()===true ) {
				$pdata = new stdClass();
					$pdata->msg				= (label::get_label('processing') ?? 'Processing') . ' ' . $action .': '. $component_label;
					$pdata->counter			= $counter;
					$pdata->total			= $total;
					$pdata->section_label	= $section_label;
				// send to output
				print_cli($pdata);
			}

		// PROCESS
			// create new process section
				$process_section = section::get_instance(
					null, // string|null section_id
					DEDALO_PROCESS_SECTION_TIPO // string section_tipo
				);
				$process_section->Save();

			// get the process_id as the section_id of the section process
				$process_id = $process_section->get_section_id();

			// Save the process name into the process section
				$process_label_component = component_common::get_instance(
					'component_input_text', // string model
					DEDALO_PROCESS_LABEL_TIPO, // string tipo
					$process_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					DEDALO_PROCESS_SECTION_TIPO // string section_tipo
				);
				$process_label_component->set_dato($process_label);
				$process_label_component->Save();

		// result records iterate
			foreach ($rows_data->ar_records as $row) {

				$counter++;

				// section_id
					$current_section_id	= $row->section_id;

				// CLI process data
					if ( running_in_cli()===true ) {
						$pdata->counter	= $counter;
						$pdata->current	= (object)[
							'section_tipo'	=> $section_tipo,
							'section_id'	=> $current_section_id
						];
						// calculate memory in multiples of 1000
						if($counter%1000==0){
							$pdata->memory = dd_memory_usage();
						}
						// send to output
						print_cli($pdata);
					}

				// current component
					$current_component = component_common::get_instance(
						$model,
						$component_tipo,
						$current_section_id,
						'list',
						$lang,
						$section_tipo
					);
					$current_dato = $current_component->get_dato();

				// final_dato. Build final_dato based on action type
					$final_dato = $current_dato ?? [];
					$save = true;
					switch ($action) {

						case 'replace':

							$final_dato = $propagate_data_value;
							$save = true;
							break;

						case 'delete':

							foreach ((array)$propagate_data_value as $current_value) {

								$key = ($with_relations===true)
									? locator::get_key_in_array_locator($current_value, $final_dato, ['section_tipo','section_id'])
									: array_search($current_value, $final_dato);
								if (false!==$key) {
									unset($final_dato[$key]);
								}
							}
							$final_dato = array_values($final_dato);

							$save = ($final_dato!==$current_dato)
								? true
								: false ;
							break;

						case 'add':

							foreach ((array)$propagate_data_value as $current_value) {
								if (!in_array($current_value, $final_dato)) {
									$final_dato[] = $current_value;
								}
							}

							$save = ($final_dato!==$current_dato)
								? true
								: false;
							break;
					}

				// set and save changes
					if ($save) {
						// set the process_id to save it into time_machine
						// this allow to revert the bulk import
						$current_component->set_process_id($process_id);
						$current_component->set_dato($final_dato);
						$current_component->Save();

						debug_log(__METHOD__
							." Updated dato of $section_tipo - $current_section_id - $component_tipo "
							, logger::DEBUG
						);
					}
			}//end foreach ($records_data->result as $key => $ar_value)

		// response
			$response->result			= true;
			$response->msg				= "$action data of '$component_label' in section '$section_tipo' successfully.";
			$response->action			= $action;
			$response->section_label	= $section_label;
			$response->total			= $total;
			$response->counter			= $counter;
			$response->memory			= dd_memory_usage();


		return $response;
	}//end propagate_component_data



}//end class tool_propagate_component_data
