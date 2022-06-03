<?php
/*
* CLASS TOOL_TIME_MACHINE
*
*
*/
class tool_time_machine {



	/**
	* APPLY_VALUE
	* Set user selected value from time machine to current component data
	* @param object $request_options
	* @return object $response
	*/
	public static function apply_value(object $request_options) : object {
		global $start_time;

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// options get and set
			$options = new stdClass();
				$options->section_tipo	= null;
				$options->section_id	= null;
				$options->tipo			= null;
				$options->lang			= null;
				$options->matrix_id		= null;

				foreach ($request_options as $key => $value) {
					if (property_exists($options, $key)) {
						$options->$key = $value;
					}
				}

		// short vars
			$section_tipo	= $options->section_tipo;
			$section_id		= $options->section_id;
			$tipo			= $options->tipo;
			$lang			= $options->lang;
			$matrix_id		= $options->matrix_id;
			$model			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

		// data. extract data from matrix_time_machine table
			$RecordObj_time_machine = new RecordObj_time_machine($matrix_id);
			$dato_time_machine 		= $RecordObj_time_machine->get_dato();

		// apply time machine data to element and save
			switch (true) {
				case ($model==='section'):
					// recovering section case

					// section. Inject data
						$element = section::get_instance(
							$section_id,
							$tipo,
							'edit',
							false
						);

					// Set data overwrites the data of the current element
						$element->set_dato($dato_time_machine);

					// Save the component with a new updated data from time machine
						$result = $element->Save((object)[
							'forced_create_record' => $section_id
						]);

					// section->Save returns int $section_id on success or null on fail
						if ($result==$section_id) {

							// matrix_time_machine restore state from 'deleted' to 'recovered'

							// Set state 'recovered' at matrix_time_machine record (to avoid be showed for recover later)
								$RecordObj_time_machine	= new RecordObj_time_machine($matrix_id);
									$RecordObj_time_machine->set_state('recovered');

								$tm_result = $RecordObj_time_machine->Save();

							// reset section session sqo
								$sqo_id	= implode('_', [$model, $section_tipo]);
								if (isset($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {
									unset($_SESSION['dedalo']['config']['sqo'][$sqo_id]);
								}

							// section recover media files. Expected array, null on fails
								$restored_result = $element->restore_deleted_section_media_files();
								if (is_null($restored_result)) {
									debug_log(__METHOD__." Error on restore deleted media files ".to_string(), logger::ERROR);
								}
								// add to response
								$response->restore_deleted_section_media_files = $restored_result;

							// LOGGER ACTIVITY : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
								$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
								logger::$obj['activity']->log_message(
									'RECOVER SECTION',
									logger::INFO,
									$section_tipo,
									null,
									[
										'msg'			=> 'Recovered section record from time machine',
										'section_id'	=> $section_id,
										'section_tipo'	=> $section_tipo,
										'top_id'		=> $section_id,
										'top_tipo'		=> $section_tipo,
										'table'			=> $matrix_table,
										'tm_id'			=> $matrix_id
									]
								);
						}
					break;

				case (strpos($model, 'component_')===0):
					// recovering component case

					// component. Inject tm data to the component
						$element = component_common::get_instance(
							$model,
							$tipo,
							$section_id,
							'edit',
							$lang,
							$section_tipo,
							false
						);

					// Set data overwrites the data of the current element
						$element->set_dato($dato_time_machine);

					// Save the component with a new updated data from time machine
						$result = $element->Save();
					break;

				default:
					// invalid model

					// error response
						$msg = ' Error on set time machine data. Model is not valid: '.to_string($model);
						debug_log(__METHOD__. $msg, logger::ERROR);
						$response->msg		= $msg;
						$response->error	= $msg;

					return $response;
					break;
			}




		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__FUNCTION__.']';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				$response->debug = $debug;
			}


		return (object)$response;
	}//end apply_value



}//end class tool_time_machine
