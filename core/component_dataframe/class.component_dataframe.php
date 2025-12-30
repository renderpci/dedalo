<?php declare(strict_types=1);
/**
* CLASS COMPONENT_DATAFRAME
* extends component_portal
*/
class component_dataframe extends component_portal {



	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = ['type','section_id','section_tipo','from_component_tipo','section_id_key','section_tipo_key','main_component_tipo'];



	/**
	* GET_ALL_DATA
	* Returns data from container 'relations', not for component data container
	* @return array $all_data
	*	$data is always an array of locators or an empty array
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
	* REMOVE_LOCATOR_FROM_DATA
	* Removes from data one or more locators that accomplish given locator equality
	* (!) Not save the result
	* @param object $locator_to_remove
	* @param array $ar_properties = []
	* @return bool
	*/
	public function remove_locator_from_data( object $locator_to_remove, array $ar_properties=[] ) : bool {

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
			$removed = parent::remove_locator_from_data(
				$locator_to_remove,
				$locator_properties_to_check
			);


		return $removed;
	}//end remove_locator_from_data



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
		tm_record::$save_tm = false;
		$this->set_data( $data );
		$this->save();
		// re activate the time machine
		tm_record::$save_tm = true;

		return true;
	}//end set_time_machine_data



	/**
	* GET_MAIN_COMPONENT_TIPO
	* Get the component parent tipo of the dataframe
	* @return string $main_component_tipo
	*/
	public function get_main_component_tipo() : string {

		$main_component_tipo = $this->caller_dataframe->main_component_tipo ?? null;

		if( empty($main_component_tipo) ){
			// default
			$ontology_node			= new ontology_node( $this->get_tipo() );
			$main_component_tipo	= $ontology_node->get_parent();

		}else{
			// Check valid main_component_tipo
			$model = ontology_node::get_model_by_tipo( $main_component_tipo );
			if ($model!=='component_iri') {
				$ontology_node				= new ontology_node( $this->get_tipo() );
				$test_main_component_tipo	= $ontology_node->get_parent();
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

		$model	= ontology_node::get_model_by_tipo( $main_component_tipo );
		$lang	= ontology_node::get_translatable($main_component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		// dataframe_root case (dd555)
		if ( strpos($model, 'component_')===false ) {
			debug_log(__METHOD__
				. " Ignored invalid component " . PHP_EOL
				. ' $main_component_tipo: ' . to_string($main_component_tipo) . PHP_EOL
				. ' $model: ' . to_string($model)
				, logger::WARNING
			);
			return null;
		}

		$main_component = component_common::get_instance(
			$model, // string model
			$main_component_tipo, // string tipo
			$this->get_section_id(), // string section_id
			'list', // string mode
			$lang, // string lang
			$this->get_section_tipo() // string section_tipo
		);

		$main_component_data = $main_component->get_data();

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
	}//end get_time_machine_data_to_save


	/**
	* UPDATE_DATA_VERSION
	* Is fired by area_maintenance update_data to transform
	* component data between different versions or upgrades
	* @see update::components_update
	* @param object $options
	* {
	* 	update_version: array
	* 	data_unchanged: mixed
	* 	reference_id: string|int
	* 	tipo: string
	* 	section_id: string|int
	* 	section_tipo: string
	* 	context: string (default: 'update_component_data')
	* }
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the data don't need change"
	*/
	public static function update_data_version( object $options ) : object {

		// options
			$update_version	= $options->update_version ?? null;
			$data_unchanged	= $options->data_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_data';



		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_data_version




}//end class component_dataframe
