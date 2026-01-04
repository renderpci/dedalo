<?php declare(strict_types=1);
/**
* CLASS COMPONENT_PORTAL
* Integrates former component_autocomplete
*/
class component_portal extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_LINK;
	protected $default_relation_type_rel	= null;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = ['section_tipo','section_id','type','from_component_tipo'];

	// ar_target_section_tipo
	public $ar_target_section_tipo; // Used to fix section tipo (get the section from relation terms, section can be real or virtual.



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load data to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// External case (inverse portals with data dependency), calculate his data again.
		$properties = $this->get_properties() ?? new stdClass();
		if(isset($properties->source->mode) && $properties->source->mode==='external'){
			$options = new stdClass();
				$options->save				= true; // $mode==='edit' ? true : false;
				$options->changed			= false; // $mode==='edit' ? true : false;
				$options->current_data		= false; // $this->get_data();
				$options->references_limit	= 0; // (!) Set to zero to get all references to enable sort

			$this->set_data_external($options);	// Forces update data with calculated external data

			return true;
		}

		// Force loads data always !IMPORTANT
		$data = $this->get_data();

		debug_log(__METHOD__
			." Ignored regenerate action in this component. USE generate_relations_table_data TO REGENERATE RELATIONS ". PHP_EOL
			.' tipo: '.$this->tipo
			, logger::WARNING
		);

		if(empty($data)) {
			return true;
		}

		// Save component data
			 // $this->Save();


		return true;
	}//end regenerate_component



	/**
	* REMOVE_ELEMENT
	*
	* @param object $options
	* 	sample:
	* {
	* 	locator : object locator,
	* 	remove_mode : delete_link | delete_all
	* }
	* @return object $response
	*/
	public function remove_element( object $options ) : object {

		// options
			$locator		= $options->locator ?? null;
			$remove_mode	= $options->remove_mode ?? 'delete_link'; // delete_link | delete_all (deletes link and resource)

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';

		// Remove locator from data
			$result = $this->remove_locator( $locator );
			if ($result!==true) {
				$response->msg .= " Error on remove locator. Skipped action ";
				return $response;
			}

		// Remove target record
			if ($remove_mode==='delete_all') {

				$section = section::get_instance(
					$locator->section_id, // string section_id
					$locator->section_tipo // string section_tipo
				);
				$delete  = $section->Delete(
					'delete_record' // string delete_mode
				);
				if ($delete!==true) {
					$response->msg .= " Error on remove target section ($locator->section_tipo - $locator->section_id). Skipped action ";
					return $response;
				}
			}

		// Update state
		// DELETE AND UPDATE the component state of this section and his parents
			$this->remove_state_from_locator( $locator );

		// Save current component updated data
			$this->Save();

		// response
			$response->result		= true;
			$response->remove_mode	= $remove_mode;
			$response->msg			= 'OK. Request done '.__METHOD__;


		return $response;
	}//end remove_element



	/**
	* GET_CURRENT_SECTION_FILTER_DATA
	* Gets fast project data of current section
	* Search component filter in current section and get the component data
	* @return array|null $component_filter_data
	*/
	public function get_current_section_filter_data() : ?array {

		// short vars
			$section_id		= $this->get_section_id();
			$section_tipo	= $this->get_section_tipo();

		// default value
			$component_filter_data = null;

		if ($section_tipo===DEDALO_FILTER_SECTION_TIPO_DEFAULT) {

			// Project of projects case : Projects in section portals

			$filter_locator = new locator();
				$filter_locator->set_section_tipo($section_tipo);
				$filter_locator->set_section_id($section_id);
			$component_filter_data = [$filter_locator];

		}else{

			// default case

			$ar_search_model	= ['component_filter'];
			$ar_children_tipo	= section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo, // section_tipo
				$ar_search_model,
				true, // bool from_cache
				true, // bool resolve_virtual
				true, // bool recursive
				true, // bool search_exact
				false // array|bool ar_tipo_exclude_elements
			);

			if (empty($ar_children_tipo[0])) {
				// throw new Exception("Error Processing Request: 'component_filter' is empty 1", 1);
				debug_log(__METHOD__
					. " Error Processing Request: 'component_filter' is empty 1 " . PHP_EOL
					. ' A component filter is needed to use the portals because you need to' . PHP_EOL
					. '	set a filter value for the new records created in the target section' . PHP_EOL
					. ' $ar_children_tipo: '.to_string($ar_children_tipo)
					, logger::ERROR
				);
			}else {

				$component_filter_tipo	= $ar_children_tipo[0];
				$model					= ontology_node::get_model_by_tipo($component_filter_tipo, true);
				$component_filter		= component_common::get_instance(
					$model,
					$component_filter_tipo,
					$section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$data = $component_filter->get_data(); 
				//Remove 'from_component_tipo' and 'type' properties
				$component_filter_data = [];
				foreach ($data as $item) {
					$filter_locator = new locator();
					$filter_locator->set_section_tipo($section_tipo);
					$filter_locator->set_section_id($section_id);
					$component_filter_data[] = $filter_locator;
				}
			}
		}


		return $component_filter_data;
	}//end get_current_section_filter_data



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



	// /**
	// * GET_POLITICAL_TOPONYMY (LEGACY METHOD - DEPRECATED) !
	// * Legacy method used by diffusion cost humà
	// * @param object $options
	// * @return string|null $term
	// */
	// public static function get_political_toponymy( object $options ) : ?string  {

	// 	// options
	// 		$locator	= $options->locator ?? null;
	// 		$lang		= $options->lang ?? DEDALO_DATA_LANG;
	// 		$type		= $options->type ?? 'municipality';

	// 	// empty locator case
	// 		if (empty($locator)) {
	// 			return null;
	// 		}

	// 	// self option
	// 		if ($type==='self') {

	// 			// term plain without parents
	// 				$term = ts_object::get_term_by_locator( $locator, $lang, true );

	// 		}else{

	// 			// section data of current locator
	// 				$section_tipo	= $locator->section_tipo;
	// 				$section_id		= $locator->section_id;

	// 			// political_map
	// 				$political_map = self::get_legacy_political_map($section_tipo);
	// 				if(empty($political_map)){

	// 					debug_log(__METHOD__
	// 						." Empty political_map (ignored resolution by political_map for section: $section_tipo) "
	// 						, logger::WARNING
	// 					);

	// 					return null;

	// 				}else{

	// 					// current_map check
	// 					$current_map = array_reduce($political_map, function($carry, $item) use($type){
	// 						return $item->type===$type ? $item : $carry;
	// 					});
	// 					if (empty($current_map)) {

	// 						debug_log(__METHOD__
	// 							." Empty political_map type (ignored resolution by political_map for type: $type in section: $section_tipo) "
	// 							, logger::WARNING
	// 						);

	// 						return null;
	// 					}
	// 				}

	// 			// component_model_tipo of current section
	// 				$ar_component_model_tipo = section::get_ar_children_tipo_by_model_name_in_section(
	// 					$section_tipo,
	// 					['component_relation_model'],
	// 					true, // from_cache
	// 					true, // resolve_virtual
	// 					true, // recursive
	// 					true // search_exact
	// 				);
	// 				$component_model_tipo = reset($ar_component_model_tipo);
	// 				if (empty($component_model_tipo)) {

	// 					debug_log(__METHOD__
	// 						." Empty section component_model_tipo. Please, review structure of section: '$section_tipo' and add a component_relation_model ) "
	// 						, logger::ERROR
	// 					);

	// 					return null;
	// 				}

	// 			// compare model
	// 				$compare_model = function($section_tipo, $section_id, $component_model_tipo, $current_map) {

	// 					// get model value
	// 						$component_model = ontology_node::get_model_by_tipo($component_model_tipo,true);
	// 						$component_model = component_common::get_instance(
	// 							$component_model, // component_relation_model
	// 							$component_model_tipo,
	// 							$section_id,
	// 							'list',
	// 							DEDALO_DATA_NOLAN,
	// 							$section_tipo
	// 						);
	// 						$model_dato = $component_model->get_dato();
	// 						if (empty($model_dato)) {
	// 							return false;
	// 						}

	// 						$model_locator = reset($model_dato);

	// 					// check match 'section_tipo','section_id'
	// 						$result = locator::compare_locators( $current_map, $model_locator, ['section_tipo','section_id'] );

	// 					return $result;
	// 				};

	// 			// self term check
	// 				if (true===$compare_model($section_tipo, $section_id, $component_model_tipo, $current_map)) {
	// 					// term
	// 						$term = ts_object::get_term_by_locator( $locator, $lang, true );
	// 			// children check
	// 				}else{
	// 					// search in parents recursive
	// 						$parents_recursive = component_relation_parent::get_parents_recursive(
	// 							$locator->section_id,
	// 							$locator->section_tipo
	// 						);
	// 						foreach ($parents_recursive as $current_parent_locator) {
	// 							if (true===$compare_model($current_parent_locator->section_tipo, $current_parent_locator->section_id, $component_model_tipo, $current_map)) {
	// 								// term
	// 									$term = ts_object::get_term_by_locator( $current_parent_locator, $lang, true );
	// 								break;
	// 							}
	// 						}
	// 				}
	// 		}

	// 	// term
	// 		$term = isset($term) ? strip_tags($term) : null;


	// 	return $term;
	// }//end _get_political_toponymy



	// /**
	// * GET_LEGACY_POLITICAL_MAP (LEGACY METHOD - DEPRECATED) !
	// * Legacy method used by diffusion in mdcat2949: Cost humà
	// * Return an array of political map models of each country
	// * This is a legacy function for compatibility with old publication tables
	// * and is NOT a future way of work
	// * @param string $section_tipo
	// * @return array $ar_models
	// */
	// public static function get_legacy_political_map( $section_tipo ) {

	// 	switch ($section_tipo) {
	// 		// Spain
	// 		case 'es1':
	// 			// models
	// 			$ar_models = [
	// 				(object)['type' => 'country', 				'section_tipo' => 'es2', 'section_id' => '8868'],
	// 				(object)['type' => 'autonomous_community', 	'section_tipo' => 'es2', 'section_id' => '8869'],
	// 				(object)['type' => 'province', 				'section_tipo' => 'es2', 'section_id' => '8870'],
	// 				(object)['type' => 'region', 				'section_tipo' => 'es2', 'section_id' => '8871'], // comarca
	// 				(object)['type' => 'municipality', 			'section_tipo' => 'es2', 'section_id' => '8872']
	// 			];
	// 			break;
	// 		// France
	// 		case 'fr1':
	// 			// models
	// 			$ar_models = [
	// 				(object)['type' => 'country', 				'section_tipo' => 'fr2', 'section_id' => '41189'],
	// 				(object)['type' => 'autonomous_community'],
	// 				(object)['type' => 'province', 				'section_tipo' => 'fr2', 'section_id' => '41190'],
	// 				(object)['type' => 'region', 				'section_tipo' => 'fr2', 'section_id' => '41191'], // comarca
	// 				(object)['type' => 'municipality', 			'section_tipo' => 'fr2', 'section_id' => '41193'] // commune
	// 			];
	// 			break;
	// 		// Cuba
	// 		case 'cu1':
	// 			// models
	// 			$ar_models = [
	// 				(object)['type' => 'country', 				'section_tipo' => 'cu2', 'section_id' => '325'],
	// 				(object)['type' => 'autonomous_community'],
	// 				(object)['type' => 'province', 				'section_tipo' => 'cu2', 'section_id' => '326'],
	// 				(object)['type' => 'region', 				'section_tipo' => 'cu2', 'section_id' => '329'], // comarca | reparto
	// 				(object)['type' => 'municipality', 			'section_tipo' => 'cu2', 'section_id' => '327']
	// 			];
	// 			break;
	// 		default:
	// 			$ar_models = [];
	// 			break;
	// 	}


	// 	return $ar_models;
	// }//end get_legacy_political_map



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
	public function get_order_path( string $component_tipo, string $section_tipo ) : array {

		$path = [];

		// no request_config case. @see common::get_section_elements_context
		// sometimes, request_config is not calculated for speed (context simple case)
		// in those cases, order_path is not important and could be ignored
			if (!isset($this->request_config)) {
				return $path;
			}


		// from_section_tipo. If exists and is distinct to section_tipo, build and prepend the caller item
			if (isset($this->from_section_tipo) && $this->from_section_tipo!==$section_tipo) {
				$path[] = (object)[
					'component_tipo'	=> $this->from_component_tipo,
					'model'				=> ontology_node::get_model_by_tipo($this->from_component_tipo,true),
					'name'				=> ontology_node::get_term_by_tipo($this->from_component_tipo),
					'section_tipo'		=> $this->from_section_tipo
				];
			}

		// self component path
			$path[] = (object)[
				'component_tipo'	=> $component_tipo,
				'model'				=> ontology_node::get_model_by_tipo($component_tipo,true),
				'name'				=> ontology_node::get_term_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			];

		// ddo_map. request_config show ddo_map first item is used to sort
		// must be calculated previously by the get_structure_context method
			$request_config			= $this->request_config ?? [];
			$request_config_item	= array_find($request_config, function($el){
				return $el->api_engine==='dedalo';
			});
			// non defined case
			if (empty($request_config_item) && !empty($request_config)) {
				// select first
				$request_config_first_item = reset($request_config);
				if (isset($request_config_first_item->api_engine) && $request_config_first_item->api_engine!=='dedalo') {
					// nothing to do
				}else{
					// set first item as default if no definition exists of api_engine
					$request_config_item = $request_config_first_item;
				}
			}
			$show = $request_config_item->show ?? null;
			if (empty($show)) {

				debug_log(__METHOD__.
					" Ignored empty request_config_item->show (mode:$this->mode) [$this->section_tipo - $this->tipo - "
					. ontology_node::get_term_by_tipo($this->tipo) ."]". PHP_EOL
					. 'request_config: ' . PHP_EOL
					. json_handler::encode($request_config)
					, logger::ERROR
				);

			}else{

				$first_item	= $show->ddo_map[0] ?? null;

				if (empty($first_item)) {
					debug_log(__METHOD__.
						" Ignored show empty first_item (mode:$this->mode) [$this->section_tipo - $this->tipo - ".
						ontology_node::get_term_by_tipo($this->tipo).
						"]. It may be due to a lack of permissions.",
						logger::WARNING
					);
					// dump($show, ' show empty first_item ++++++++ '.to_string($this->tipo));
				}else{
					// target component
					$path[] = (object)[
						'component_tipo'	=> $first_item->tipo,
						'model'				=> ontology_node::get_model_by_tipo($first_item->tipo,true),
						'name'				=> ontology_node::get_term_by_tipo($first_item->tipo),
						// note that section_tipo is used only to give a name to the join item.
						// results are not really filtered by this section_tipo
						'section_tipo'		=> is_array($first_item->section_tipo)
							? reset($first_item->section_tipo)
							: $first_item->section_tipo
					];
				}
			}


		return $path;
	}//end get_order_path



}//end class component_portal
