<?php declare(strict_types=1);
/**
* CLASS COMPONENT_DATAFRAME
* extends component_portal
*/
class component_dataframe extends component_portal {



	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = ['type','section_id','section_tipo','from_component_tipo','section_id_key','section_tipo_key','main_component_tipo'];



	// /**
	// * SET_DATO
	// * @return bool
	// */
	// public function set_dato($dato) : bool {

	// 	// on set empty data, delete old data target sections
	// 		if (empty($dato)) {
	// 			$current_dato = $this->get_dato();
	// 			if (!empty($current_dato)) {
	// 				// delete target sections
	// 				foreach ($current_dato as $current_locator) {
	// 					$section = section::get_instance(
	// 						$current_locator->section_id, // string|null section_id
	// 						$current_locator->section_tipo // string section_tipo
	// 					);
	// 					$section->Delete('delete_record');
	// 				}
	// 			}
	// 		}

	// 	return parent::set_dato($dato);
	// }//end set_dato



	/**
	* GET_DATO_FULL
	* Returns dato from container 'relations', not for component dato container
	* @return array $all_data
	*	$dato is always an array of locators or an empty array
	*/
	public function get_all_data() : array {

		$my_section			= $this->get_my_section();
		$relations			= $my_section->get_relations();
		$caller_dataframe	= $this->get_caller_dataframe();

		// filtered data
		$all_data = [];

		if(!isset($caller_dataframe)){
			debug_log(__METHOD__
				." empty caller dataframe getting all component data "
				, logger::WARNING
			);
			return parent::get_all_data();
		}

		// iterate relations filtering match values
		$relations_size = sizeof($relations);
		for ($i=0; $i < $relations_size; $i++) {

			$locator = $relations[$i];

			if(	isset($locator->from_component_tipo)
				&& isset($locator->section_id_key)
				&& isset($locator->section_tipo_key)
				&& isset($locator->main_component_tipo)
				&& $locator->from_component_tipo	=== $this->tipo
				&& (int)$locator->section_id_key	=== (int)$caller_dataframe->section_id_key
				&& $locator->section_tipo_key		=== $caller_dataframe->section_tipo_key
				&& $locator->main_component_tipo	=== $caller_dataframe->main_component_tipo
			) {
				$all_data[] = $locator;
			}
		}

		return $all_data;
	}//end get_all_data



	/**
	* GET_VALOR
	* V5 diffusion compatibility
	* @param ?string $lang=DEDALO_DATA_LANG
	* @param $format='string'
	* @param $fields_separator=', '
	* @param $records_separator='<br>'
	* @param $ar_related_terms=false
	* @param $data_to_be_used='valor'
	* @return mixed $valor
	*/
	public function get_valor( ?string $lang=DEDALO_DATA_LANG, $format='string', $fields_separator=', ', $records_separator='<br>', $ar_related_terms=false, $data_to_be_used='valor' ) {

		return json_encode( $this->get_dato() );
	}//end get_valor



	/**
	* REMOVE_LOCATOR_FROM_DATO
	* Removes from dato one or more locators that accomplish given locator equality
	* (!) Not save the result
	* @param object $locator_to_remove
	* @param array $ar_properties = []
	* @return bool
	*/
	public function remove_locator_from_dato( object $locator_to_remove, array $ar_properties=[] ) : bool {

		// caller_dataframe. fixed on construct
			$caller_dataframe = $this->get_caller_dataframe();

			if (empty($caller_dataframe)) {
				debug_log(__METHOD__
					. " Error : caller_dataframe is empty. Always call this component using caller_dataframe " . PHP_EOL
					. ' locator_to_remove: '.to_string($locator_to_remove) . PHP_EOL
					. ' tipo: '. $this->tipo . PHP_EOL
					. ' section_tipo: '. $this->section_tipo . PHP_EOL
					. ' section_id: '. $this->section_id . PHP_EOL
					, logger::ERROR
				);
				return false;
			}

		// locator_to_remove. add custom properties from caller_dataframe
			$locator_to_remove->section_id_key		= $caller_dataframe->section_id_key;
			$locator_to_remove->section_tipo_key	= $caller_dataframe->section_tipo_key;
			$locator_to_remove->main_component_tipo	= $caller_dataframe->main_component_tipo;

		// locator_properties_to_check
			$locator_properties_to_check = $this->get_locator_properties_to_check();

		// exec remove (return bool)
			$removed = parent::remove_locator_from_dato(
				$locator_to_remove,
				$locator_properties_to_check
			);


		return $removed;
	}//end remove_locator_from_dato



	/**
	* GET_LOCATOR_PROPERTIES_TO_CHECK
	* Return the properties to be check to compare locators on delete locator
	* @return array
	*/
	public function get_locator_properties_to_check() {

		// return ['type','section_id','section_tipo','from_component_tipo','section_id_key','section_tipo_key'];
		return $this->test_equal_properties;
	}//end get_locator_properties_to_check



	/**
	* EMPTY_FULL_DATA_ASSOCIATED_TO_MAIN_COMPONENT
	* Removes all dataframe locators and save
	* @return true
	*/
	public function empty_full_data_associated_to_main_component() : true {

		$section = $this->get_my_section();
		$options = (object)[
			'component_tipo' => $this->tipo
		];
		$section->remove_relations_from_component_tipo($options);

		return true;
	}//end empty_full_data_associated_to_main_component



	/**
	* SET_TIME_MACHINE_DATA
	*
	* @return bool
	*/
	public function set_time_machine_data( array $data ) : bool {

		// remove all previous data
		$this->empty_full_data_associated_to_main_component();

		// Remove the time machine to save the dataframe
		// this set will be saved by main component.
		$section = $this->get_my_section();
		$section->save_tm = false;
		$this->set_dato( $data );
		$this->Save();
		// re activate the time machine
		$section->save_tm = true;

		return true;
	}//end set_time_machine_data



	/**
	* GET_DIFFUSION_VALUE
	* @param string|null $lang = DEDALO_DATA_LANG
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=DEDALO_DATA_LANG, ?object $option_obj=null ) : ?string {

		$diffusion_value = $this->get_value();


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_MAIN_COMPONENT_TIPO
	* Get the component parent tipo of the dataframe
	* @return string $main_component_tipo
	*/
	public function get_main_component_tipo() : string {

		$main_component_tipo = $this->caller_dataframe->main_component_tipo ?? null;

		if( empty($main_component_tipo) ){
			// default
			$RecordObj_dd			= new RecordObj_dd( $this->get_tipo() );
			$main_component_tipo	= $RecordObj_dd->get_parent();
		}else{
			// Check valid main_component_tipo
			$model = RecordObj_dd::get_modelo_name_by_tipo($main_component_tipo,true);
			if ($model!=='component_iri') {
				$RecordObj_dd				= new RecordObj_dd( $this->get_tipo() );
				$test_main_component_tipo	= $RecordObj_dd->get_parent();
				if ($test_main_component_tipo!==$main_component_tipo) {
					debug_log(__METHOD__
						. " Wrong main_component_tipo. " . PHP_EOL
						. ' received main_component_tipo: ' . to_string($main_component_tipo) . PHP_EOL
						. ' calculated test_main_component_tipo: ' . to_string($test_main_component_tipo)
						, logger::ERROR
					);
				}
			}
		}

		return $main_component_tipo;
	}//end get_main_component_tipo



	/**
	* GET_MAIN_COMPONENT_DATA
	* Create the main component and return its data
	* @return array|null $main_componenet_data
	*/
	public function get_main_component_data() : ?array {

		$main_component_tipo = $this->get_main_component_tipo();

		$model	= RecordObj_dd::get_modelo_name_by_tipo( $main_component_tipo );
		$lang	= RecordObj_dd::get_translatable($main_component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
		$main_component = component_common::get_instance(
			$model, // string model
			$main_component_tipo, // string tipo
			$this->get_section_id(), // string section_id
			'list', // string mode
			$lang, // string lang
			$this->get_section_tipo() // string section_tipo
		);

		$relation_component = component_relation_common::get_components_with_relations();

		// if the main component is a relation component get the full data
		// if the main component is a literal component get its data (don't use the full data because is an object with lang that as key instead an array)
		$main_component_data = in_array($model, $relation_component)
			? $main_component->get_dato_full()
			: $main_component->get_dato();

		return $main_component_data;
	}//end get_main_component_data



	/**
	* GET_TIME_MACHINE_DATA_TO_SAVE
	* 1 Get all component data, not use the section_id_key
	* because the time_machine not save dataframe data separated from main data.
	* 2 Get the main component data
	* 3 mix both data and return it.
	* @return array|null $time_machine_data_to_save
	*/
	public function get_time_machine_data_to_save() : ?array {

		$dataframe_data = parent::get_all_data();

		$main_component_data = $this->get_main_component_data();

		$time_machine_data_to_save = is_array($main_component_data)
			? array_merge($main_component_data, $dataframe_data)
			: $dataframe_data;


		return $time_machine_data_to_save;
	}//end get_time_machine_data


	/**
	* UPDATE_DATO_VERSION
	* Is fired by area_maintenance update_data to transform
	* component data between different versions or upgrades
	* @see update::components_update
	* @param object $options
	* {
	* 	update_version: array
	* 	dato_unchanged: mixed
	* 	reference_id: string|int
	* 	tipo: string
	* 	section_id: string|int
	* 	section_tipo: string
	* 	context: string (default: 'update_component_dato')
	* }
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version( object $options ) : object {

		// options
			$update_version	= $options->update_version ?? null;
			$dato_unchanged	= $options->dato_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_dato';



		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '6.4.3':
				// Update the locator to add section_tipo_key to previous data dataframe .
				// in version <6.4.3 the component_dataframe is linked to components that only point to 1 section
				// in those cases the bound between main and dataframe is set by section_id_key
				// in 6.4.3 the dataframe is updated to link with section_id_key and section_tipo_key
				// it able to create components dataframe for components with multiple target section_tipo
				// this update get the target_section of the main component to assign it to the dataframe data.
				if (!empty($dato_unchanged) && is_array($dato_unchanged)) {
					$RecordObj_dd			= new RecordObj_dd($tipo);
					$main_component_tipo	= $RecordObj_dd->get_parent();

					// create the main component to obtain his data
						$model	= RecordObj_dd::get_modelo_name_by_tipo( $main_component_tipo );
						$lang	= RecordObj_dd::get_translatable($main_component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
						$main_component = component_common::get_instance(
							$model, // string model
							$main_component_tipo, // string tipo
							$section_id, // string section_id
							'list', // string mode
							$lang, // string lang
							$section_tipo // string section_tipo
						);
						// get the main component data
						$main_componenet_data = $main_component->get_dato_full();

						if(empty($main_componenet_data)){
							debug_log(__METHOD__
								. " The main component doesn't has data ------||----- using target_section_tipo. " . PHP_EOL
								. ' main tipo without data: '  . to_string($main_component_tipo) . PHP_EOL
								. ' options: '  . to_string($options)
								, logger::ERROR
							);

							$section_tipo_key = $main_component->get_ar_target_section_tipo()[0];

						}else{
							$section_tipo_key = $main_componenet_data[0]->section_tipo;
						}


					$new_dato		= [];
					$need_to_be_updated	= false;
					foreach ((array)$dato_unchanged as $current_locator) {
						// id the data has section_tipo_key do not change
						if(isset($current_locator->section_tipo_key)){
							continue;
						}

						$current_locator->section_tipo_key = $section_tipo_key;
						// remove the old tipo_key not used anymore
						unset( $current_locator->tipo_key );

						$need_to_be_updated = true;

						$new_dato[] = $current_locator;
					}//end foreach ((array)$dato_unchanged as $key => $current_locator)


					if ($need_to_be_updated === true) {

						// section update and save locators
							$section_to_save = section::get_instance(
								$section_id, // string|null section_id
								$section_tipo, // string section_tipo
								'list', // string mode
								false // bool bool
							);
							$remove_options = new stdClass();
								$remove_options->component_tipo			= $tipo;
								$remove_options->relations_container	= 'relations';

							$section_to_save->remove_relations_from_component_tipo( $remove_options );
							foreach ($new_dato as $current_locator) {
								$section_to_save->add_relation($current_locator);
							}
							$section_to_save->Save();
							debug_log(__METHOD__." ----> Saved ($section_tipo - $section_id) ".to_string($new_dato), logger::WARNING);

						$response = new stdClass();
							$response->result	= 3;
							$response->new_dato	= $new_dato;
							$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					}else{

						$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."

					}// end if($need_to_be_updated === true)
				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}//end (!empty($dato_unchanged) && is_array($dato_unchanged))
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_dato_version




}//end class component_dataframe
