<?php declare(strict_types=1);
/**
* CLASS TOOL_TIME_MACHINE
*
*
*/
class tool_time_machine extends tool_common {



	/**
	* APPLY_VALUE
	* Set user selected value from time machine to current element data
	* @param object $request_options
	* @return object $response
	*/
	public static function apply_value(object $request_options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options get and set
			$options = new stdClass();
				$options->section_tipo		= $request_options->section_tipo ?? null;
				$options->section_id		= $request_options->section_id ?? null;
				$options->tipo				= $request_options->tipo ?? null;
				$options->lang				= $request_options->lang ?? null;
				$options->matrix_id			= $request_options->matrix_id ?? null;
				$options->caller_dataframe	= $request_options->caller_dataframe ?? null;

		// short vars
			$section_tipo		= $options->section_tipo;
			$section_id			= $options->section_id;
			$tipo				= $options->tipo;
			$lang				= $options->lang;
			$matrix_id			= $options->matrix_id;
			$model				= ontology_node::get_model_by_tipo($tipo,true);
			$caller_dataframe	= $options->caller_dataframe;

		// data. extract data from matrix_time_machine table
			$RecordObj_time_machine	= new RecordObj_time_machine($matrix_id);

		// get time machine data with the matrix_id
		// if the component has a dataframe the data will has both data: main data and dataframe data.
			$dato_time_machine = $RecordObj_time_machine->get_dato();

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

					// Save the element (section) with a new updated data from time machine
						$result = $element->Save((object)[
							'forced_create_record' => $section_id
						]);

					// section->Save returns int $section_id on success or null on failure
						if ($result==$section_id) {

							// Set state 'recovered' at matrix_time_machine record (to avoid be showed for recover later)
								$RecordObj_time_machine->set_state('recovered');
								$tm_result = $RecordObj_time_machine->Save();
								if ($tm_result===false) {
									$response->errors[] = 'failed time machine save';
								}

							// reset section session sqo
								$sqo_id	= section::build_sqo_id($section_tipo);
								if (isset($_SESSION['dedalo']['config']['sqo'][$sqo_id])) {
									unset($_SESSION['dedalo']['config']['sqo'][$sqo_id]);
								}

							// section recover media files. Expected array, null on failure
								$restored_result = $element->restore_deleted_section_media_files();
								if (is_null($restored_result)) {
									$response->errors[] = 'failed time machine restore deleted media files';
									debug_log(__METHOD__." Error on restore deleted media files", logger::ERROR);
								}
								// add to response
								$response->restore_deleted_section_media_files = $restored_result;

							// LOGGER ACTIVITY : WHAT(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
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
									],
									logged_user_id() // int
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
							'list', // the component always in list because the edit could fire a save with the dato_default
							$lang,
							$section_tipo,
							false
						);

					// dataframe
					// Change the dataframe first, it will not create new time machine data
					// but the main component will create the time machine with the changes
					// done by its own dataframe component.
						// check if the main component has a dataframe to save his data too
						$dataframe_ddo = $element->get_dataframe_ddo();
						if( !empty($dataframe_ddo) ){

							foreach ( $dataframe_ddo as $current_dataframe_ddo ) {

								$dataframe_tipo = $current_dataframe_ddo->tipo;

								// component dataframe of the component iri
								// here only use the main_component_tipo
								// the dataframe will save all time machine data independent of section_id_key or section_tipo_key
								// and it don't save the revert in Time Machine, as main component does.
								$caller_dataframe = new stdClass();
									$caller_dataframe->main_component_tipo	= $tipo;

								// delete all data of the dataframe
								// it will delete all section_id_key
								// create the dataframe component
									$dataframe_model = ontology_node::get_model_by_tipo($dataframe_tipo);
									$dataframe_component = component_common::get_instance(
										$dataframe_model,
										$dataframe_tipo,
										$section_id,
										'list',
										DEDALO_DATA_NOLAN,
										$section_tipo,
										false,
										$caller_dataframe
									);

								// get the dataframe data from dato, filtering by dataframe_tipo
								if ( is_array($dato_time_machine) ){

									$dataframe_data = array_values( array_filter( $dato_time_machine, function($el) use($dataframe_tipo) {
										return isset($el->from_component_tipo) && $el->from_component_tipo===$dataframe_tipo;
									}));

									// set time machine data, it save the data
									// but the process doesn't create new time machine
									// the change will be set by the main component
										$dataframe_component->set_time_machine_data( $dataframe_data );
								}
							}
						}// end if($has_dataframe === true)

					$relation_components = component_relation_common::get_components_with_relations();
					$relation_components[] = 'component_iri';// add the component_iri, it can handle dataframes
					if ( is_array($dato_time_machine) && in_array( $model, $relation_components) ){

						// Get only the component data. Remove possible dataframe data
						// component_iri exception, it doesn't has from_componnet_tipo to select its own tm data
						if($model==='component_iri'){
							$dato_time_machine = array_values( array_filter( $dato_time_machine, function($el) {
								// return only the objects with iri property
								return property_exists($el, 'iri');;
							}));
						}else{
							// Main component and other components without dataframe
							$dato_time_machine = array_values( array_filter( $dato_time_machine, function($el) use($tipo) {
								return isset($el->from_component_tipo) && $el->from_component_tipo===$tipo;
							}));
						}
					}

					// dataframe caller
						if (!empty($caller_dataframe)) {
							$element->set_caller_dataframe($caller_dataframe);
						}

					// Set data overwrites the data of the current element
						$element->set_dato($dato_time_machine);

					// Save the component with a new updated data from time machine
						$result = $element->Save();

					// LOGGER ACTIVITY
						$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
						logger::$obj['activity']->log_message(
							'RECOVER COMPONENT',
							logger::INFO,
							$section_tipo,
							null,
							[
								'msg'			=> 'Recovered component data from time machine',
								'model'			=> $model,
								'section_id'	=> $section_id,
								'section_tipo'	=> $section_tipo,
								'table'			=> $matrix_table,
								'tm_id'			=> $matrix_id
							],
							logged_user_id() // int
						);
					break;

				default:
					// invalid model

					// error response
					$msg = ' Error on set time machine data. Model is not valid: '.to_string($model);
					debug_log(__METHOD__. $msg, logger::ERROR);

					$response->msg		= $msg;
					$response->errors[]	= 'invalid model';

					return $response;
					break;
			}

		// response
			$response->result	= true;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end apply_value



	/**
	* BULK_REVERT_PROCESS
	* Revert a bulk process done previously
	* Use the bulk_process_id to get all changes done by this process in all sections.
	* Get all changes done in the component affected by the bulk process
	* Revert the component to the previous data of the bulk process.
	* If the component has not previous data, set a empty data.
	* @param object $request_options
	* @return object $response
	*/
	public static function bulk_revert_process(object $request_options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// options get and set
			$options = new stdClass();
				$options->section_tipo				= $request_options->section_tipo ?? null;
				$options->section_id				= $request_options->section_id ?? null;
				$options->tipo						= $request_options->tipo ?? null;
				$options->lang						= $request_options->lang ?? null;
				$options->bulk_process_id			= $request_options->bulk_process_id ?? null;
				$options->bulk_revert_process_label	= $request_options->bulk_revert_process_label ?? null;

		// short vars
			$section_tipo				= $options->section_tipo;
			$section_id					= $options->section_id;
			$tipo						= $options->tipo;
			$lang						= $options->lang;
			$bulk_process_id			= $options->bulk_process_id;
			$bulk_revert_process_label	= $options->bulk_revert_process_label;
			$model						= ontology_node::get_model_by_tipo($tipo,true);

		// get all changes saved in time_machine with the same bulk_process_id
			$strQuery	= "SELECT * FROM \"matrix_time_machine\" WHERE bulk_process_id = $bulk_process_id ORDER BY id DESC";
			$result		= JSON_RecordDataBoundObject::search_free($strQuery);
			if($result===false) {
				$response->msg = "Failed Search bulk_process_id $bulk_process_id. Data is not found.";
				debug_log(__METHOD__
					." ERROR: $response->msg "
					, logger::ERROR
				);
				return $response ;
			}
			$n_rows = pg_num_rows($result);

			if ($n_rows<1) {
				$response->errors[] = 'empty result from matrix_time_machine search';
				return $response;
			}
		// for every found record in time_machine get all component changes saved.
		// 1. create the revert process

			// PROCESS
			// create new process section
				$process_section = section::get_instance(
					null, // string|null section_id
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);
				$process_section->Save();

			// get the bulk_process_id as the section_id of the section process
				$new_bulk_process_id = $process_section->get_section_id();

			// Save the process name into the process section
				$process_label_component = component_common::get_instance(
					'component_input_text', // string model
					DEDALO_BULK_PROCESS_LABEL_TIPO, // string tipo
					$new_bulk_process_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					DEDALO_BULK_PROCESS_SECTION_TIPO // string section_tipo
				);
				$process_label_component->set_dato($bulk_revert_process_label);
				$process_label_component->Save();

		// 2. revert the values in time machine

			while($row = pg_fetch_assoc($result)) {

				$tipo			= $row['tipo'];
				$section_tipo	= $row['section_tipo'];
				$section_id		= $row['section_id'];
				// search all changes of the component
				$sub_strQuery	= "SELECT * FROM \"matrix_time_machine\"
					WHERE tipo 		= '$tipo' AND
					section_tipo 	= '$section_tipo' AND
					section_id 		= '$section_id'
					ORDER BY id DESC"
				;
				$sub_result	= JSON_RecordDataBoundObject::search_free($sub_strQuery);
				// get the total changes,
				// if the component has only 1 change, it will be the bulk change
				// in those cases the data to save into the component will be a empty array
				$sub_n_rows = pg_num_rows($sub_result);

				// next row is the data to be reverted.
				$reverted_next = false;
				while($current_row = pg_fetch_assoc($sub_result)) {
					// get the bulk_process_id to be checked with the global proces_id
					// loop the component data saved in tm one of this has the bulk_process_id to revert
					$current_bulk_process_id	= (int)$current_row['bulk_process_id'];
					$time_machine_data			= $current_row['dato'] === 'null'
						? null
						: $current_row['dato'];

					// if the time_machine doesn't has any other register than the bulk_process_id change
					// the change is a null data because the component has only 1 change and previous change is empty value.
					// set current_bulk_process_id to null, to bypass the next if
					// Set reverted_next as true, because this loop cycle is the last one.
					// set the data as empty array to remove the component data.
					if ($sub_n_rows===1){
						$current_bulk_process_id	= null;
						$reverted_next				= true;
						$time_machine_data			= [];
					}
					// check if the bulk_process_id is the same than current record of the time_machine
					// if the row is the bulk_process_id row, the next record will be the row to be recovery.
					if( $current_bulk_process_id === $bulk_process_id ){
						$reverted_next = true;
						continue;
					}
					// if the row is previous to the bulk_process_id don't process it
					if( $reverted_next === false ){
						continue;
					}
					// process the row (after the row of the bulk_process_id)
					// component. Inject tm data to the component
						$element = component_common::get_instance(
							$model,
							$tipo,
							$section_id,
							'list', // the component always in list because the edit could fire a save with the dato_default
							$lang,
							$section_tipo,
							false
						);

					// set the new_bulk_process_id to save it into time_machine
					// this allow to revert the bulk import
						$element->set_bulk_process_id($new_bulk_process_id);

					// Set data overwrites the data of the current element
						$element->set_dato($time_machine_data);

					// Save the component with a new updated data from time machine
						$saved_id = $element->Save();
						if ($saved_id===false) {
							$response->errors[] = 'failed element save';
						}

					// LOGGER ACTIVITY
						$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
						logger::$obj['activity']->log_message(
							'RECOVER COMPONENT',
							logger::INFO,
							$section_tipo,
							null,
							[
								'msg'			=> 'Recovered component data from time machine',
								'model'			=> $model,
								'section_id'	=> $section_id,
								'section_tipo'	=> $section_tipo,
								'table'			=> $matrix_table,
								'tm_id'			=> $current_row['id']
							],
							logged_user_id() // int
						);

					break;
				}
			}// end while

		// response OK
			$response->result	= true;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time	= exec_time_unit($start_time,'ms').' ms';
				$response->debug = $debug;
			}


		return $response;
	}//end bulk_revert_process



}//end class tool_time_machine
