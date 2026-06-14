<?php declare(strict_types=1);
/**
* CLASS COMPONENT_DATAFRAME
* This component is used to create a dataframe for a given component.
* extends component_portal
*
* column_name: relation
*/
class component_dataframe extends component_portal {



	// test_equal_properties is used to verify duplicates when add locators
	// id_key is the unified pairing key; section_id_key/section_tipo_key are the legacy pair (dual-read until migration)
	public array $test_equal_properties = ['type','section_id','section_tipo','from_component_tipo','id_key','section_id_key','section_tipo_key','main_component_tipo'];



	/**
	* GET_DATA
	* Returns data from container 'relations', not for component data container
	* @return ?array $all_data
	*	$data is always an array of locators or an empty array
	*/
	public function get_data() : ?array {

		$data				= parent::get_data();
		$caller_dataframe	= $this->get_caller_dataframe();

		if(!isset($caller_dataframe)){
			debug_log(__METHOD__
				." empty caller dataframe getting all component data "
				, logger::WARNING
			);
			return $data;
		}

		// filtered data
		// iterate relations filtering match values with the central predicate
		// (dual-read: id_key unified contract / section_id_key legacy)
		$filtered_data = [];
		if (!empty($data)) {
			foreach ($data as $locator) {
				if( self::dataframe_entry_matches($locator, $caller_dataframe, $this->tipo) ) {
					$filtered_data[] = $locator;
				}
			}
		}

		return $filtered_data;
	}//end get_data



	public function get_data_unfiltered() {
		return parent::get_data();
	}



	/**
	* SET_DATA
	* Caller-aware write: when this instance is paired with one main data item
	* (caller_dataframe), writing must only replace the paired subset of the
	* slot data, PRESERVING the sibling frames of other items. Without this
	* merge, set_data(null) from the remove cascade would wipe every frame of
	* the slot in the record (frames of other rows included).
	* Entries of $data identical to preserved siblings are deduplicated, so
	* full-array flows (update_data_value 'remove' over unfiltered data) work
	* unchanged.
	* @param array|null $data
	* @return bool
	*/
	public function set_data( ?array $data ) : bool {

		$caller_dataframe = $this->get_caller_dataframe();

		if (isset($caller_dataframe)) {

			// siblings: every entry NOT paired with this caller context
			$full_data = $this->get_data_unfiltered() ?? [];
			$others = array_values(array_filter($full_data, function($el) use ($caller_dataframe) {
				return !self::dataframe_entry_matches($el, $caller_dataframe, $this->tipo);
			}));

			// additions: incoming entries not already present as siblings
			$others_signatures = array_map(fn($el) => json_encode($el), $others);
			$additions = array_values(array_filter($data ?? [], function($el) use ($others_signatures) {
				return !in_array(json_encode($el), $others_signatures, true);
			}));

			$data = array_merge($others, $additions);
			if (empty($data)) {
				$data = null;
			}
		}

		return parent::set_data($data);
	}//end set_data



	/**
	* REMOVE_LOCATOR_FROM_DATA
	* Removes from data one or more locators that accomplish given locator equality.
	* Matching is predicate-based (dual-read: id_key unified contract /
	* section_id_key legacy) so pre and post migration shapes are both removable:
	* a data locator is removed when it pairs with the caller context AND points
	* at the same frame target (section_tipo / section_id) as $locator_to_remove.
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

		// iterate the full (unfiltered) component data removing matches
			$removed	= false;
			$new_data	= [];
			$data		= $this->get_data_unfiltered() ?? [];
			foreach ($data as $current_locator) {

				$is_match = is_object($current_locator)
					// pairs with the caller context (this main item, this dataframe slot)
					&& self::dataframe_entry_matches($current_locator, $caller_dataframe, $this->tipo)
					// points at the same frame target record
					&& isset($current_locator->section_tipo) && isset($locator_to_remove->section_tipo)
					&& $current_locator->section_tipo === $locator_to_remove->section_tipo
					&& isset($current_locator->section_id) && isset($locator_to_remove->section_id)
					&& (string)$current_locator->section_id === (string)$locator_to_remove->section_id;

				if ($is_match) {
					$removed = true;
				}else{
					$new_data[] = $current_locator;
				}
			}

		// Updates current data with clean array of locators
			if ($removed===true) {
				$this->set_data( $new_data );
			}


		return $removed;
	}//end remove_locator_from_data



	/**
	* GET_LOCATOR_PROPERTIES_TO_CHECK
	* Return the properties to be check to compare locators on delete locator
	* @return array
	*/
	public function get_locator_properties_to_check() : array {

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
	* @param ?array $data
	* @return bool
	*/
	public function set_time_machine_data( ?array $data ) : bool {

		// remove all previous data
		$this->empty_full_data_associated_to_main_component();

		// Remove the time machine to save the dataframe
		// this set will be saved by main component.
		$section = $this->get_my_section();
		// REL-01: restore $save_tm in finally so a throw does not leave Time
		// Machine capture globally disabled for later saves in the worker.
		$prev_save_tm = tm_record::$save_tm;
		tm_record::$save_tm = false;
		try {
			$this->set_data( $data );
			$this->save();
		} finally {
			// re activate the time machine
			tm_record::$save_tm = $prev_save_tm;
		}

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
			$ontology_node			= ontology_node::get_instance( $this->get_tipo() );
			$main_component_tipo	= $ontology_node->get_parent();

		}else{

			// Check valid main_component_tipo
			// Skip ontology parent validation for non-relation components
			// (component_iri, component_input_text, component_text_area, component_date, etc.)
			// since these may use shared dataframe tipos that are not direct ontology children.
			$model = ontology_node::get_model_by_tipo( $main_component_tipo );
			$relation_components = component_relation_common::get_components_with_relations();
			if (in_array($model, $relation_components)) {
				$ontology_node				= ontology_node::get_instance( $this->get_tipo() );
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

		$dataframe_data = $this->get_data();

		$main_component_data = $this->get_main_component_data();

		$time_machine_data_to_save = is_array($main_component_data)
			? array_merge($main_component_data, $dataframe_data)
			: $dataframe_data;


		return $time_machine_data_to_save;
	}//end get_time_machine_data_to_save


	/**
	* GET_DIFFUSION_DATA
	* Publishes the frame pairing locators of this slot. When the diffusion
	* ddo declares its parent (the main component in the chain), only the
	* frames pairing that main component are published; the chain processor
	* recursion follows the locators into the frame target section records.
	* Published locators carry id_key: the join key against the main
	* component's item ids.
	* @param object $ddo
	* @param string|null $diffusion_element_tipo = null
	* @return array $diffusion_data
	*/
	public function get_diffusion_data( object $ddo, ?string $diffusion_element_tipo=null ) : array {

		// Default diffusion data object
		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $this->tipo,
			'lang'	=> null,
			'value'	=> null,
			'id'	=> $ddo->id ?? null
		]);

		$data = $this->get_data_unfiltered() ?? [];

		// parent scoping: only the frames of the chain's main component
		$parent_tipo = (isset($ddo->parent) && $ddo->parent!=='self')
			? $ddo->parent
			: null;

		$frames = array_values(array_filter($data, function($el) use ($parent_tipo) {
			if (!is_object($el) || !self::is_dataframe_entry($el)) {
				return false;
			}
			return $parent_tipo===null
				|| ($el->main_component_tipo ?? null)===$parent_tipo;
		}));

		$diffusion_data_object->value = empty($frames) ? null : $frames;


		return [$diffusion_data_object];
	}//end get_diffusion_data



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

		$update_version = implode('.', $update_version);
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
