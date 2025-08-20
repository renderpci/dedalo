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
	* Note that the first action is always load dato to avoid save empty content
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
				$options->current_dato		= false; // $this->get_dato();
				$options->references_limit	= 0; // (!) Set to zero to get all references to enable sort

			$this->set_dato_external($options);	// Forces update dato with calculated external dato

			return true;
		}

		// Force loads dato always !IMPORTANT
		$this->get_dato();

		debug_log(__METHOD__
			." Ignored regenerate action in this component. USE generate_relations_table_data TO REGENERATE RELATIONS ". PHP_EOL
			.' tipo: '.$this->tipo
			, logger::WARNING
		);

		if(empty($dato)) {
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
	* @return array|null $component_filter_dato
	*/
	public function get_current_section_filter_data() : ?array {

		// short vars
			$section_id		= $this->get_section_id();
			$section_tipo	= $this->get_section_tipo();

		// default value
			$component_filter_dato = null;

		if ($section_tipo===DEDALO_FILTER_SECTION_TIPO_DEFAULT) {

			// Project of projects case : Projects in section portals

			$filter_locator = new locator();
				$filter_locator->set_section_tipo($section_tipo);
				$filter_locator->set_section_id($section_id);
			$component_filter_dato = [$filter_locator];

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
				$model					= ontology_node::get_model_name_by_tipo($component_filter_tipo, true);
				$component_filter		= component_common::get_instance(
					$model,
					$component_filter_tipo,
					$section_id,
					'edit',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				$component_filter_dato = $component_filter->get_dato_generic(); // Without 'from_component_tipo' and 'type' properties
			}
		}


		return $component_filter_dato;
	}//end get_current_section_filter_data



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

			case '6.0.0':
				// Update the locator to move old ds and dataframe to v6 dataframe model.
				if (!empty($dato_unchanged) && is_array($dato_unchanged)) {
					$ontology_node			= new ontology_node($tipo);
					$properties				= $ontology_node->get_properties();
					$v6_update_dataframe	= $properties->v6_update_dataframe ?? null;

					$clean_locators		= [];
					$new_dataframe		= [];
					$need_to_be_updated	= false;
					foreach ((array)$dato_unchanged as $key => $current_locator) {

						if(isset($current_locator->ds) || isset($current_locator->dataframe)){
							$need_to_be_updated = true;
							if(empty($v6_update_dataframe)){
								debug_log(__METHOD__
									. " The current component doesn't has defined v6_update_dataframe in preferences (Ontology properties). " . PHP_EOL
									. ' options: '  . to_string($options)
									, logger::ERROR
								);
								throw new Exception("The current component doesn't has defined v6_update_dataframe in preferences (Ontology properties). tipo:".$tipo, 1);
							}

							// ds case
							if(!empty($current_locator->ds)){
								debug_log(__METHOD__
									." ----> Located locator->ds ($section_tipo - $section_id) ".to_string($current_locator->ds)
									, logger::WARNING
								);

								foreach((array)$current_locator->ds as $current_ds) {
									// change to new from_component_tipo
									$current_ds->from_component_tipo	= $v6_update_dataframe->v6->from_component_tipo;
									$current_ds->section_id_key			= (int)$current_locator->section_id;

									$new_dataframe[] = $current_ds;
									// debug_log(__METHOD__." ----> Changed ds locator ($section_tipo - $section_id) ".to_string($current_ds), logger::WARNING);
								}
								// delete old ds
								unset($current_locator->ds);
							}

							// dataframe case
							if(isset($current_locator->dataframe)){
								$old_dataframe = $current_locator->dataframe;
								foreach ($old_dataframe as $current_dataframe) {

									// change to new from_component_tipo
									$current_dataframe->from_component_tipo	= $v6_update_dataframe->v6->from_component_tipo;
									$current_dataframe->type				= $v6_update_dataframe->v6->type;
									$current_dataframe->section_id_key		= (int)$current_locator->section_id;

									unset($current_dataframe->from_key);

									$new_dataframe[] = $current_dataframe;
								}
								// delete old ds
								unset($current_locator->dataframe);
							}
						}
						else if(isset($properties->config_relation) && isset($properties->config_relation->relation_type)) {

							// check if locator relation type is correct
							if (!isset($current_locator->type) || $current_locator->type!==$properties->config_relation->relation_type) {

								$current_locator->type = $properties->config_relation->relation_type;

								$need_to_be_updated	= true;

								debug_log(__METHOD__
									. " Updated locator type from dd151 to dd96 " . PHP_EOL
									. ' component tipo: ' . $tipo . PHP_EOL
									. ' section_tipo: ' . $section_tipo . PHP_EOL
									. ' section_id: ' . $section_id . PHP_EOL
									, logger::DEBUG
								);
							}
						}

						$clean_locators[] = $current_locator;
					}//end foreach ((array)$dato_unchanged as $key => $current_locator)

					if ($need_to_be_updated === true) {

						$ar_locators	= array_merge($clean_locators, $new_dataframe);
						$new_dato		= (array)$ar_locators;

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
							foreach ($ar_locators as $current_locator) {
								$section_to_save->add_relation($current_locator);
							}
							$section_to_save->Save();
							debug_log(__METHOD__." ----> Saved ($section_tipo - $section_id) ".to_string($ar_locators), logger::WARNING);

						$response = new stdClass();
							$response->result	= 3;
							$response->new_dato	= $new_dato;
							$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					}else{

						$legacy_model_name = ontology_node::get_legacy_model_name_by_tipo($tipo);
						if ($legacy_model_name==='component_autocomplete_hi') {
							// force save to regenerate search relations
							$response = new stdClass();
								$response->result	= 3;
								$response->new_dato	= $dato_unchanged;
								$response->msg		= "[$reference_id] Dato is forced to save to regenerate search relations from ".to_string($dato_unchanged).".<br />";

						}else{

							$response = new stdClass();
							$response->result	= 2;
							$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
						}
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

		$legacy_model = ontology_node::get_legacy_model_name_by_tipo($this->tipo);

		$path = DEDALO_CORE_PATH .'/'. __CLASS__ .'/v5_'. $legacy_model .'.php';
		if( !include $path ) {
			debug_log(__METHOD__
				. " Undefined legacy model closure file. Using JSON encoded dato instead." . PHP_EOL
				. ' tipo: ' . to_string($this->tipo). PHP_EOL
				. ' section_tipo: ' . to_string($this->section_tipo). PHP_EOL
				. ' section_id: ' . to_string($this->section_id). PHP_EOL
				. ' model: ' . get_called_class()
				, logger::WARNING
			);
			return json_encode( $this->get_dato() );
		}

		$data_to_be_used = 'dato';

		$valor = Closure::bind($_get_valor, $this)($lang, $format, $fields_separator, $records_separator, $ar_related_terms, $data_to_be_used);


		return $valor;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* @param $valor=null
	* @param $lang=DEDALO_DATA_LANG
	* @param $quotes=null
	* @param $add_id=null
	* @return mixed $valor;
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null ) {

		$legacy_model = ontology_node::get_legacy_model_name_by_tipo($this->tipo);

		// portal valor_export is no longer available
		if ($legacy_model==='component_portal') {
			return 'unavailable';
		}

		$path = DEDALO_CORE_PATH .'/'. __CLASS__ .'/v5_'. $legacy_model .'.php';
		include $path;

		// $_get_valor_export = Closure::bind($_get_valor_export, $this);
		$valor =  Closure::bind($_get_valor_export, $this)( $valor, $lang, $quotes, $add_id );


		return $valor;
	}//end get_valor_export



	/**
	* GET_DIFFUSION_VALUE
	* @param string|null $lang=DEDALO_DATA_LANG
	* @param object|null $option_obj=null
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=DEDALO_DATA_LANG, ?object $option_obj=null ) : ?string {

		$legacy_model = ontology_node::get_legacy_model_name_by_tipo($this->tipo);

		$path = DEDALO_CORE_PATH .'/'. __CLASS__ .'/v5_'. $legacy_model .'.php';
		include $path;

		// $_get_diffusion_value = Closure::bind($_get_diffusion_value, $this);
		$valor = Closure::bind($_get_diffusion_value, $this)( $lang, $option_obj );

		$diffusion_value = (is_array($valor))
			? json_encode($valor)
			: $valor;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_POLITICAL_TOPONYMY (LEGACY METHOD - DEPRECATED) !
	* Legacy method used by diffusion cost humà
	* @param object $options
	* @return string|null $term
	*/
	public static function get_political_toponymy( object $options ) : ?string  {

		// options
			$locator	= $options->locator ?? null;
			$lang		= $options->lang ?? DEDALO_DATA_LANG;
			$type		= $options->type ?? 'municipality';

		// empty locator case
			if (empty($locator)) {
				return null;
			}

		// self option
			if ($type==='self') {

				// term plain without parents
					$term = ts_object::get_term_by_locator( $locator, $lang, true );

			}else{

				// section data of current locator
					$section_tipo	= $locator->section_tipo;
					$section_id		= $locator->section_id;

				// political_map
					$political_map = self::get_legacy_political_map($section_tipo);
					if(empty($political_map)){

						debug_log(__METHOD__
							." Empty political_map (ignored resolution by political_map for section: $section_tipo) "
							, logger::WARNING
						);

						return null;

					}else{

						// current_map check
						$current_map = array_reduce($political_map, function($carry, $item) use($type){
							return $item->type===$type ? $item : $carry;
						});
						if (empty($current_map)) {

							debug_log(__METHOD__
								." Empty political_map type (ignored resolution by political_map for type: $type in section: $section_tipo) "
								, logger::WARNING
							);

							return null;
						}
					}

				// component_model_tipo of current section
					$ar_component_model_tipo = section::get_ar_children_tipo_by_model_name_in_section(
						$section_tipo,
						['component_relation_model'],
						true, // from_cache
						true, // resolve_virtual
						true, // recursive
						true // search_exact
					);
					$component_model_tipo = reset($ar_component_model_tipo);
					if (empty($component_model_tipo)) {

						debug_log(__METHOD__
							." Empty section component_model_tipo. Please, review structure of section: '$section_tipo' and add a component_relation_model ) "
							, logger::ERROR
						);

						return null;
					}

				// compare model
					$compare_model = function($section_tipo, $section_id, $component_model_tipo, $current_map) {

						// get model value
							$component_model = ontology_node::get_model_name_by_tipo($component_model_tipo,true);
							$component_model = component_common::get_instance(
								$component_model, // component_relation_model
								$component_model_tipo,
								$section_id,
								'list',
								DEDALO_DATA_NOLAN,
								$section_tipo
							);
							$model_dato = $component_model->get_dato();
							if (empty($model_dato)) {
								return false;
							}

							$model_locator = reset($model_dato);

						// check match 'section_tipo','section_id'
							$result = locator::compare_locators( $current_map, $model_locator, ['section_tipo','section_id'] );

						return $result;
					};

				// self term check
					if (true===$compare_model($section_tipo, $section_id, $component_model_tipo, $current_map)) {
						// term
							$term = ts_object::get_term_by_locator( $locator, $lang, true );
				// children check
					}else{
						// search in parents recursive
							$parents_recursive = component_relation_parent::get_parents_recursive(
								$locator->section_id,
								$locator->section_tipo
							);
							foreach ($parents_recursive as $current_parent_locator) {
								if (true===$compare_model($current_parent_locator->section_tipo, $current_parent_locator->section_id, $component_model_tipo, $current_map)) {
									// term
										$term = ts_object::get_term_by_locator( $current_parent_locator, $lang, true );
									break;
								}
							}
					}
			}

		// term
			$term = isset($term) ? strip_tags($term) : null;


		return $term;
	}//end _get_political_toponymy



	/**
	* GET_LEGACY_POLITICAL_MAP (LEGACY METHOD - DEPRECATED) !
	* Legacy method used by diffusion in mdcat2949: Cost humà
	* Return an array of political map models of each country
	* This is a legacy function for compatibility with old publication tables
	* and is NOT a future way of work
	* @param string $section_tipo
	* @return array $ar_models
	*/
	public static function get_legacy_political_map( $section_tipo ) {

		switch ($section_tipo) {
			// Spain
			case 'es1':
				// models
				$ar_models = [
					(object)['type' => 'country', 				'section_tipo' => 'es2', 'section_id' => '8868'],
					(object)['type' => 'autonomous_community', 	'section_tipo' => 'es2', 'section_id' => '8869'],
					(object)['type' => 'province', 				'section_tipo' => 'es2', 'section_id' => '8870'],
					(object)['type' => 'region', 				'section_tipo' => 'es2', 'section_id' => '8871'], // comarca
					(object)['type' => 'municipality', 			'section_tipo' => 'es2', 'section_id' => '8872']
				];
				break;
			// France
			case 'fr1':
				// models
				$ar_models = [
					(object)['type' => 'country', 				'section_tipo' => 'fr2', 'section_id' => '41189'],
					(object)['type' => 'autonomous_community'],
					(object)['type' => 'province', 				'section_tipo' => 'fr2', 'section_id' => '41190'],
					(object)['type' => 'region', 				'section_tipo' => 'fr2', 'section_id' => '41191'], // comarca
					(object)['type' => 'municipality', 			'section_tipo' => 'fr2', 'section_id' => '41193'] // commune
				];
				break;
			// Cuba
			case 'cu1':
				// models
				$ar_models = [
					(object)['type' => 'country', 				'section_tipo' => 'cu2', 'section_id' => '325'],
					(object)['type' => 'autonomous_community'],
					(object)['type' => 'province', 				'section_tipo' => 'cu2', 'section_id' => '326'],
					(object)['type' => 'region', 				'section_tipo' => 'cu2', 'section_id' => '329'], // comarca | reparto
					(object)['type' => 'municipality', 			'section_tipo' => 'cu2', 'section_id' => '327']
				];
				break;
			default:
				$ar_models = [];
				break;
		}


		return $ar_models;
	}//end get_legacy_political_map



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
					'model'				=> ontology_node::get_model_name_by_tipo($this->from_component_tipo,true),
					'name'				=> ontology_node::get_term_by_tipo($this->from_component_tipo),
					'section_tipo'		=> $this->from_section_tipo
				];
			}

		// self component path
			$path[] = (object)[
				'component_tipo'	=> $component_tipo,
				'model'				=> ontology_node::get_model_name_by_tipo($component_tipo,true),
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
						'model'				=> ontology_node::get_model_name_by_tipo($first_item->tipo,true),
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
