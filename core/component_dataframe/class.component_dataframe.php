<?php declare(strict_types=1);
/**
* CLASS COMPONENT_DATAFRAME
* former component_portal
*/
class component_dataframe extends component_portal {



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
				// && isset($locator->tipo_key)
				&& $locator->from_component_tipo	=== $this->tipo
				&& (int)$locator->section_id_key	=== (int)$caller_dataframe->section_id_key
				// && $locator->tipo_key			=== $caller_dataframe->tipo_key
			) {
				$all_data[] = $locator;
			}
		}

		return $all_data;
	}//end get_all_data



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
					, logger::DEBUG
				);
				return false;
			}

		// locator_to_remove. add custom properties from caller_dataframe
			$locator_to_remove->section_id_key	= $caller_dataframe->section_id_key;
			// $locator_to_remove->tipo_key		= $caller_dataframe->tipo_key;

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

		return ['type','section_id','section_tipo','from_component_tipo','section_id_key'];
	}//end get_locator_properties_to_check



	/**
	* EMPTY_FULL_DATA_ASSOCIATED_TO_MAIN_COMPONENT
	* !not used function at 26-04-2024
	* @return bool
	*/
	public function empty_full_data_associated_to_main_component() {

		$all_data = parent::get_all_data();

		$all_data_size = sizeof($all_data);

		for ($i=0; $i < $all_data_size; $i++) {

			$locator = $all_data[$i];
			// remove current locator from component dato

			$caller_dataframe = new stdClass();
				$caller_dataframe->section_id_key	= $locator->section_id_key;
				$caller_dataframe->section_tipo		= $this->section_tipo;

			$this->set_caller_dataframe($caller_dataframe);

			// exec remove (return bool)
			$removed = $this->remove_locator_from_dato(
				$locator
			);
			$this->Save();
		}

		return true;
	}//end empty_full_data_associated_to_main_component



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



}//end class component_dataframe
