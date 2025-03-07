<?php declare(strict_types=1);
/**
* CLASS TS_OBJECT
* Manage thesaurus hierarchical elements. Every element is a section used as thesaurus term
*
*/
class ts_object {



	// int (mandatory)
	protected $section_id;
	// string (mandatory)
	protected $section_tipo;
	// object
	protected $section;
	// mixed object|null (default null)
	protected $options;
	// string (default 'edit')
	protected $mode;
	// int
	public $order;
	// ar_elements
	public $ar_elements;



	/**
	* __CONSTRUCT
	* @param int|string $section_id
	* @param string $section_tipo
	* @param object|null $options
	*	Default null
	* @param string $mode
	*	Default 'edit'
	*/
	public function __construct( int|string $section_id, string $section_tipo, ?object $options=null, string $mode='edit' ) {

		$this->section_id   = $section_id;
		$this->section_tipo = $section_tipo;

		# Build and set current section obj
		$this->section = section::get_instance( $section_id, $section_tipo );

		# Fix options
		$this->options = $options;

		# Fix mode
		$this->mode = $mode;

		# Set default order
		$this->order = 1000; // Default is 1000. When get_html is called, this var is updated with component value if exits and have data
	}//end __construct



	/**
	* GET_AR_ELEMENTS
	* Get elements from section_list_thesaurus -> properties
	* @param string $section_tipo
	* @param boolean|null $model = false
	* @return array $ar_elements
	*/
	public static function get_ar_elements( string $section_tipo, ?bool $model=false ) : array {

		$ar_elements = [];

		// Elements are stored in current section > section_list_thesaurus
		// Search element in current section
			$ar_model_name_required = array('section_list_thesaurus');

		// Search in current section
			$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo, // tipo
				$ar_model_name_required, // ar_modelo_name_required
				true, // from_cache
				false, // resolve_virtual
				false, // recursive
				true // search_exact
			);
			// relation map defined in properties
			$children_tipo	= $ar_children[0] ?? null;
			$properties		= null;
			if ($children_tipo) {
				$RecordObj_dd	= new RecordObj_dd($ar_children[0]);
				$properties		= $RecordObj_dd->get_properties();
			}

			// Fallback to real section when in virtual
			if ( empty($properties) ) {
				$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
				if ($section_tipo!==$section_real_tipo) {
					$ar_children  = section::get_ar_children_tipo_by_model_name_in_section(
						$section_real_tipo,
						$ar_model_name_required,
						true, // from_cache
						false, // resolve_virtual
						false, // recursive
						true // search_exact
					);
					// relation map defined in properties
					if (isset($ar_children[0])) {
						$RecordObj_dd	= new RecordObj_dd($ar_children[0]);
						$properties		= $RecordObj_dd->get_properties();
					}
				}
			}//end if (empty($properties))

		// If element exists (section_list_thesaurus) we get element 'properties' JSON value as array
			if ( isset($properties->show) && isset($properties->show->ddo_map) ) {

				$ddo_map = $properties->show->ddo_map;
				foreach ($ddo_map as $current_ddo) {

					$type = $current_ddo->type ?? null;

					// link children exception
						if ($model===false && $type==='link_children_model') {
							continue;
						}else if ($model===true) {
							if ( $type==='link_children' && ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO || $section_tipo===DEDALO_ONTOLOGY_SECTION_TIPO) ) {
								// unset($properties[$key]);
								continue;
							}else if ( $type==='link_children_model' ) {
								$current_ddo->type = 'link_children';
							}
						}
					// add
					$ar_elements[] = $current_ddo;
				}//end foreach ($properties as $key => $value_obj)
			}


		return $ar_elements;
	}//end get_ar_elements



	/**
	* PARSE_CHILD_DATA
	* Auxiliary function used in dd_ts_api
	* Iterates locators extracting the child data of each one
	* @see get_child_data
	* @param array $locators
	* @param string $area_model='area_thesaurus'
	* @return array $child_data
	*/
	public static function parse_child_data( array $locators, string $area_model='area_thesaurus', ?object $ts_object_options=null ) : array {

		$children_data = [];

		foreach ($locators as $locator) {

			$section_id		= $locator->section_id;
			$section_tipo	= $locator->section_tipo;

			// remove the inactive ontologies in main ontology
			// some children defined in ontology node could be not active and loaded
			// remove they from the children_data to prevent to show it in the tree.
			if ($area_model==='area_ontology') {

				// active ontologies list. Calculate once by session (445 ms)
				if(isset($_SESSION['dedalo']['config']['active_elements'])) {
					$active_elements = $_SESSION['dedalo']['config']['active_elements'];
				}else{
					$active_elements = [];
					foreach (ontology::get_active_elements() as $el) {
						// if ($el->active_in_thesaurus===true) {
							$active_elements[] = (object)[
								'tld'					=> $el->tld,
								'section_tipo'			=> $el->section_tipo,
								'target_section_tipo'	=> $el->target_section_tipo
							];
						// }
					}
					$_SESSION['dedalo']['config']['active_elements'] = $active_elements;
				}

				$found = array_find($active_elements, function($el) use($section_tipo){
					return $el->target_section_tipo===$section_tipo
						|| $el->section_tipo===$section_tipo
						|| get_tld_from_tipo($section_tipo)===$el->tld;
				});
				if (empty($found)) {
					// remove from pagination total count
					if (isset($current_pagination->total)) {
						$current_pagination->total--;
					}
					// ignore this non active tld item
					continue;
				}
			}

			$ts_object		= new ts_object( $section_id, $section_tipo, $ts_object_options );
			$child_object	= $ts_object->get_child_data();

			if (empty($child_object->ar_elements)) {
				$tld = get_tld_from_tipo($locator->section_tipo);
				debug_log(__METHOD__
					. " Empty ar_elements child. Maybe this tld ($tld) is not installed " . PHP_EOL
					. ' locator: ' . to_string($locator)
					, logger::ERROR
				);
			}

			$children_data[] = $child_object;
		}


		return $children_data;
	}//end parse_child_data



	/**
	* GET_CHILD_DATA
	* @return object $child_data
	*/
	public function get_child_data() : object {

		// Global object
		$child_data = new stdClass();
			$child_data->section_tipo				= $this->section_tipo;
			$child_data->section_id					= $this->section_id;
			$child_data->mode						= 'edit';	//'list_thesaurus';
			$child_data->lang						= DEDALO_DATA_LANG;
			$child_data->is_descriptor				= true;
			$child_data->is_indexable				= (bool)self::is_indexable($this->section_tipo, $this->section_id);
			$child_data->permissions_button_new		= $this->get_permissions_element('button_new');
			$child_data->permissions_button_delete	= $this->get_permissions_element('button_delete');
			$child_data->permissions_indexation		= $this->get_permissions_element('component_relation_index');
			$child_data->permissions_structuration	= $this->get_permissions_element('component_relation_struct');
			$child_data->ar_elements				= [];

		// model boolean
			$model = $this->options->model ?? null; // options are set when building the class

		// short vars
			$separator = ' ';

		// elements from 'section_list_thesaurus' properties
		// Sample value:
			// [
			//     {
			//         "tipo": "actv10",
			//         "type": "term"
			//     },
			//     {
			//         "icon": "ND",
			//         "tipo": "actv9",
			//         "type": "icon"
			//     },
			//     {
			//         "icon": "M",
			//         "tipo": "actv6",
			//         "type": "icon"
			//     },
			//     {
			//         "icon": "U",
			//         "tipo": "actv25",
			//         "type": "icon"
			//     },
			//     {
			//         "icon": "CH",
			//         "tipo": "actv23",
			//         "type": "icon"
			//     },
			//     {
			//         "tipo": "actv23",
			//         "type": "link_children"
			//     }
			// ]
		$ar_elements = ts_object::get_ar_elements($this->section_tipo, $model);
		foreach ($ar_elements as $current_object) {

			// sample
				// 	{
				// 	 "icon": "TCHI",
				// 	 "tipo": "tchi59",
				// 	 "type": "icon"
				// 	}

			// element_tipo
				$current_element_tipo = $current_object->tipo ?? null;
				if (empty($current_element_tipo)) {
					debug_log(__METHOD__
						." Warning. Ignored bad formed empty element_tipo in current_object" . PHP_EOL
						.' current_element_tipo:'. to_string($current_element_tipo) . PHP_EOL
						.' current_object:'. to_string($current_object)
						, logger::WARNING
					);
					continue;
				}

			// No descriptors do not have children. Avoid calculate children
				if ($child_data->is_descriptor===false && $current_object->type==='link_children') {
					continue;
				}

			// allow array for terms
				$ar_element_tipo = is_array($current_element_tipo)
					? $current_element_tipo
					: [$current_element_tipo];

			// Each element
				$element_obj = new stdClass();
					$element_obj->type	= $current_object->type;
					$element_obj->tipo	= $current_element_tipo;

			// iterate every tipo
				foreach ($ar_element_tipo as $element_tipo) {

					$model_name = RecordObj_dd::get_modelo_name_by_tipo($element_tipo,true);
					// remove the box elements
					// it could be any old component not used as old component_relation_struct
					if(empty($model_name) || $model_name === 'box elements'){
						continue 2;
					}
					// ignore v5 component_relation_struct
						if ($model_name==='component_relation_index') {
							$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($element_tipo);
							if ($legacy_model==='component_relation_struct') {
								continue 2;
							}
						}

					// component
						$lang		= common::get_element_lang($element_tipo, DEDALO_DATA_LANG);
						$component	= component_common::get_instance(
							$model_name,
							$element_tipo,
							$this->section_id,
							'list_thesaurus',
							$lang,
							$this->section_tipo
						);
						// get the data when the component is not a relation_index
						// relation index get full data when get_dato() is called
						// but this component needs a pagination data
						$dato = ($model_name!=='component_relation_index')
							? $component->get_dato()
							: [];

					// re-format dato in some cases:
						switch (true) {

							case (in_array($element_tipo, hierarchy::$hierarchy_portals_tipo)):
								// Do not change main hierarchy portals data
								break;

							case ($model_name==='component_autocomplete_hi' || $model_name==='component_portal'):
								if (!empty($dato)) {
									$values = [];
									foreach ($dato as $current_locator) {
										$values[] = ts_object::get_term_by_locator(
											$current_locator,
											DEDALO_DATA_LANG,
											true
										);
									}
									$dato = $values;
								}
								break;

							case ($model_name==='component_relation_related'):
								// Add inverse related (bidirectional only)
								$type_rel = $component->get_type_rel();
								if($type_rel!==DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO){
									$component_rel = $component->get_references(); //$component->relation_type_rel
									#$inverse_related = component_relation_related::get_inverse_related($this->section_id, $this->section_tipo, DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO);
									$dato = array_merge($dato, $component_rel);
								}
								break;

							case ($model_name==='component_svg'):
								// file exists check
								$file_path	= $component->get_media_filepath(DEDALO_SVG_QUALITY_DEFAULT);
								$file_url	= (file_exists($file_path)===true)
									? $component->get_url() . '?' . start_time()
									: '';

								$dato = $file_url;
								break;

							default:
								// nothing to do
								break;
						}//end switch (true) re-format dato

					// value
						switch (true) {

							case ($element_obj->type==='term'):
								// term Is translatable and uses lang fallback here
								$element_value = empty($dato)
									? component_common::extract_component_value_fallback($component)
									: $dato;

								$element_obj->value = isset($element_obj->value)
									? to_string($element_obj->value) . $separator . to_string($element_value)
									: to_string($element_value);
								break;

							case ($element_obj->type==='icon'):

								if($current_object->icon==='CH') {
									continue 3;
								}

								// ND element can change term value when 'esdescriptor' value is 'no' (locator of 'no')
									if($current_object->icon==='ND') {
										if (isset($dato[0])
											&& isset($dato[0]->section_id)
											&& (int)$dato[0]->section_id===2) {
											ts_object::set_term_as_nd($child_data->ar_elements);
											$child_data->is_descriptor = false;
										}
										continue 3;
									}

								// icon do not need more info. Value is property 'type'
								$element_obj->value = $current_object->icon;

								if ($model_name==='component_relation_index') {

									// Counts indexation related items
									$count_data_group_by = $this->get_count_data_group_by(
										$component,
										$current_object
									);

									// total 0 case. Nothing to display, skip
									if($count_data_group_by->total === 0){
										continue 3;
									}

									$element_obj->value .= ':' . $count_data_group_by->total;

									// flat key and set label
									array_map(function($item){
										$item->label	= RecordObj_dd::get_termino_by_tipo($item->key[0]);
										$item->key		= $item->key[0]; // flat the key to be more useful in JavaScript, only 1 section is received
									}, $count_data_group_by->totals_group);

									$element_obj->count_result = $count_data_group_by;

								}else{

									// dato check
									$considered_empty_dato = (bool)is_empty_dato($dato);
									if($considered_empty_dato===true) {
										continue 3; // Skip empty icon value links
									}
								}
								break;

							case ($element_obj->type==='link_children'):

								// fix children_tipo
								$child_data->children_tipo = $element_tipo;

								// fix children dato
								$child_data->children = $dato;

								// set has_descriptor_children value
								$child_data->has_descriptor_children = $this->has_children_of_type($dato, 'descriptor')===true;

								// D : Descriptors
								$element_obj->value = ($child_data->has_descriptor_children===true)
									? 'button show children'
									: 'button show children unactive';

								// ND : No descriptors case
								$has_children_of_type_result = $this->has_children_of_type($dato, 'nd');
								if($has_children_of_type_result===true) {

									$nd_element = new stdClass();
										$nd_element->type	= 'link_children_nd';
										$nd_element->tipo	= $element_tipo;
										$nd_element->value	= 'ND';

									$child_data->ar_elements[] = $nd_element;
								}
								break;

							default:
								$element_obj->value = $dato;
								break;
						}//end switch (true) value

					// set model. Only first element if more than one exists (multiple term cases with same model)
						if (!isset($element_obj->model)) {
							$element_obj->model = $model_name;
						}
					// set data_type. set the data_type when is set.
						if (isset($current_object->show_data)) {
							$element_obj->show_data = $current_object->show_data;
						}
				}//end foreach ($ar_element_tipo as $element_tipo)

			// Add
				$child_data->ar_elements[] = $element_obj;
		}//end foreach ($ar_elements as $k_element_tipo => $current_object)

		// debug
			if(SHOW_DEBUG===true) {
				// $total = round( (start_time()-$start_time), 3 );
				#debug_log(__METHOD__." Total ($n): ".exec_time_unit($start_time,'ms')." ms - ratio(total/n): " . ($total/$n), logger::DEBUG);
				// $child_data->total_time = $total;
				// error_log('********************* get_child_data total:'. exec_time_unit($start_time,'ms'));
			}

		return $child_data;
	}//end get_child_data



	/**
	* HAS_CHILDREN_OF_TYPE
	* @param array $ar_children
	* 	Array of locators
	* @param string $type
	* 	As 'descriptor'
	* @return bool
	*/
	public function has_children_of_type( array $ar_children, string $type ) : bool {

		if (empty($ar_children)) {

			// options forced have_children cases (persons for example from trigger.ts_object.php)
			if ($type==='descriptor') {
				return $this->options->have_children ?? false;
			}

			return false;
		}

		$descriptor_value = ($type==='descriptor') ? 1 : 2;  # 1 for descriptors, 2 for non descriptors

		foreach($ar_children as $current_locator) {

			$model = RecordObj_dd::get_modelo_name_by_tipo($current_locator->section_tipo,true);
			if (empty($model)) {
				debug_log(__METHOD__
					. " Ignored non resolved model for section: $current_locator->section_tipo" . PHP_EOL
					. ' Maybe is a non installed TLD : ' . get_tld_from_tipo($current_locator->section_tipo)
					, logger::ERROR
				);
				continue;
			}

			$section_map = section::get_section_map( $current_locator->section_tipo );
			if (empty($section_map) || !isset($section_map->thesaurus->is_descriptor)) {
				debug_log(__METHOD__
					." Invalid section_map 'is_descriptor' property " .PHP_EOL
					.' section_map: ' . json_encode($section_map, JSON_PRETTY_PRINT) . PHP_EOL
					.' Please, define a valid section_map for section ' .$current_locator->section_tipo
					, logger::ERROR
				);
				continue;
			}

			$component_tipo	= $section_map->thesaurus->is_descriptor;
			$model_name		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model_name,
				$component_tipo,
				$current_locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$current_locator->section_tipo
			);
			$dato = $component->get_dato();

			// When first element is found, return true
			if (isset($dato[0])
				&& isset($dato[0]->section_id)
				&& (int)$dato[0]->section_id==$descriptor_value) {
				return true;
			}
		}


		return false;
	}//end has_children_of_type



	/**
	* IS_INDEXABLE
	* @param string $section_tipo
	* @param int $section_id
	* @return bool
	*/
	public static function is_indexable( string $section_tipo, int|string $section_id ) : bool {

		if (strpos($section_tipo, 'hierarchy')===0 || strpos($section_tipo, 'ontology')===0) {
			// Root hierarchies are always false
			return false;
		}

		$model = RecordObj_dd::get_modelo_name_by_tipo($section_tipo,true);
		if (empty($model)) {
			debug_log(__METHOD__
				. " Ignored non resolved model for section: $section_tipo" . PHP_EOL
				. ' Maybe is a non installed TLD : ' . get_tld_from_tipo($section_tipo)
				, logger::ERROR
			);
			return false;
		}

		$section_map = section::get_section_map( $section_tipo );
		if (!isset($section_map->thesaurus->is_indexable)) {
			debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $section_tipo ".to_string($section_map), logger::ERROR);
			return false;
		}

		if ($section_map->thesaurus->is_indexable===false) {
			// properties set as false case
			return false;
		}

		$component_tipo	= $section_map->thesaurus->is_indexable;
		$model_name		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component		= component_common::get_instance(
			$model_name,
			$component_tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);
		$dato = $component->get_dato();

		$indexable_value = 1; // Yes

		// When first element is found, return true
		if (isset($dato[0]) && isset($dato[0]->section_id) && (int)$dato[0]->section_id===$indexable_value) {
			return true;
		}

		return false;
	}//end is_indexable



	/**
	* GET_DESCRIPTORS_FROM_CHILDREN
	* @return
	*/
		// public static function get_descriptors_from_children__DES( $ar_children ) {

		// 	$ar_descriptors = array();

		// 	foreach ((array)$ar_children as $key => $current_locator) {

		// 		$section_map = section::get_section_map( $current_locator->section_tipo );
		// 		#dump($section_map['thesaurus']->is_descriptor, ' $section_map ++ '.to_string($current_locator->section_tipo));

		// 		if (!isset($section_map['thesaurus']->is_descriptor)) {
		// 			debug_log(__METHOD__." Invalid section_map 'is_descriptor' property fro section $current_locator->section_tipo ".to_string($section_map), logger::ERROR);
		// 			continue;
		// 		}

		// 		$component_tipo = $section_map['thesaurus']->is_descriptor;

		// 		$model_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		// 		$component 	 = component_common::get_instance($model_name,
		// 													  $component_tipo,
		// 													  $current_locator->section_id,
		// 													  'list',
		// 													  DEDALO_DATA_NOLAN,
		// 													  $current_locator->section_tipo);
		// 		$dato = $component->get_dato();

		// 		if (isset($dato[0]) && isset($dato[0]->section_id) && (int)$dato[0]->section_id===1) {
		// 			$ar_descriptors[] = $current_locator;
		// 		}
		// 	}


		// 	return $ar_descriptors;
		// }//end get_descriptors_from_children



	/**
	* SET_TERM_AS_ND
	* Modifies received array data on term to set as ND (no descriptor)
	* @return array $ar_elements
	*/
	public static function set_term_as_nd( array &$ar_elements ) : array {

		foreach ($ar_elements as $key => $obj_value) {

			if ($obj_value->type==='term') {

				if (!is_string($obj_value->value)) {
					debug_log(__METHOD__
						."  ".'$obj_value->value ++ EXPECTED STRING. But received type: '.gettype($obj_value->value) . PHP_EOL
						.' obj_value->value type: ' . gettype($obj_value->value) . PHP_EOL
						.' obj_value->value: ' . to_string($obj_value->value)
						, logger::ERROR
					);
				}

				$ar_elements[$key]->value = $obj_value->value; //'<span class="no_descriptor">' .  . '</span>';
				break;
			}
		}

		return $ar_elements;
	}//end set_term_as_nd



	/**
	* GET_TERM_DATO_BY_LOCATOR
	* @param object $locator
	* @return array|null $final_value
	*/
	public static function get_term_dato_by_locator( object $locator ) : ?array {

		// check valid object
			if (!is_object($locator) || !property_exists($locator, 'section_tipo')) {
				if(SHOW_DEBUG===true) {
					#throw new Exception("Error Processing Request. locator is not object: ".to_string($locator), 1);
					debug_log(__METHOD__
						." ERROR on get term. locator is not of type object: ".gettype($locator)." FALSE VALUE IS RETURNED !"
						, logger::ERROR
					);
				}
				return null;
			}

		$section_map	= section::get_section_map($locator->section_tipo);
		$thesaurus_map	= isset($section_map->thesaurus) ? $section_map->thesaurus : false;

		$ar_tipo		= is_array($thesaurus_map->term) ? $thesaurus_map->term : [$thesaurus_map->term];
		$section_id		= $locator->section_id;
		$section_tipo	= $locator->section_tipo;

		$ar_value = [];
		foreach ($ar_tipo as $tipo) {

			$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$dato = (array)$component->get_dato();

			if (!empty($dato)) {
				$ar_value = array_merge($ar_value, $dato);
			}
		}//end foreach ($ar_tipo as $tipo) {

		// final value
			$final_value = $ar_value;


		return $final_value;
	}//end get_term_dato_by_locator



	/**
	* GET_TERM_BY_LOCATOR
	* Resolve locator to string value to show in list etc.
	* @param object $locator
	* @param string $lang = DEDALO_DATA_LANG
	* @param bool $from_cache = false
	*
	* @return string|null $valor
	*/
	public static function get_term_by_locator( object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) : ?string {

		$valor = null;

		// check locator->section_tipo mandatory property
			if (!property_exists($locator, 'section_tipo')) {
				if(SHOW_DEBUG===true) {
					#throw new Exception("Error Processing Request. locator is not object: ".to_string($locator), 1);
					debug_log(__METHOD__
						." ERROR on get term. locator is not of type object: ".gettype($locator)." FALSE VALUE IS RETURNED !"
						, logger::ERROR
					);
				}
				return $valor; // null
			}

		// Cache control (session)
			$cache_uid = $locator->section_tipo.'_'.$locator->section_id.'_'.$lang;
			static $term_by_locator_data;
			if ($from_cache===true && isset($term_by_locator_data[$cache_uid])) {
				return $term_by_locator_data[$cache_uid];
			}

		// thesaurus_map conditional value
			$section_map	= section::get_section_map($locator->section_tipo);
			$thesaurus_map	= isset($section_map->thesaurus) ? $section_map->thesaurus : false;
			if ($thesaurus_map===false) {

				$valor = $locator->section_tipo .'_'. $locator->section_id ;
				if(isset($locator->component_tipo))
					$valor .= '_'. $locator->component_tipo;
				if(isset($locator->tag_id))
					$valor .= '_'. $locator->tag_id;

			}else{

				$term		= is_array($thesaurus_map->term) ? $thesaurus_map->term : [$thesaurus_map->term]; // source could be an array or string
				$ar_valor	= [];
				foreach ($term as $tipo) {

					$parent			= $locator->section_id;
					$section_tipo	= $locator->section_tipo;
					$model_name		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
					// debug
						// if(SHOW_DEBUG===true) {
						// 	$real_model_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
						// 	if ($real_model_name!==$model_name) {
						// 		trigger_error("Error. modelo_name of component $tipo must be $model_name. $#real_model_name is defined");#
						// 	}
						// }
					$component = component_common::get_instance(
						$model_name,
						$tipo,
						$parent,
						'list',
						$lang,
						$section_tipo
					);
					$current_value = $component->get_value();

					if (empty($current_value)) {
						$main_lang = hierarchy::get_main_lang( $locator->section_tipo );
						$dato_full = $component->get_dato_full();
						// get_value_with_fallback_from_dato_full( $dato_full_json, $decorate_untranslated=false, $main_lang=DEDALO_DATA_LANG_DEFAULT)
						$current_value = component_common::get_value_with_fallback_from_dato_full(
							$dato_full,
							true,
							$main_lang,
							$lang
						);
					}

					if (!empty($current_value)) {
						$ar_valor[] = $current_value;
					}
				}
				$valor = implode(', ', $ar_valor);
			}

		/*
			# En proceso. De momento devuelve el locator en formato json, sin resolver..
			if (!isset($valor)) {
				$valor = json_encode($locator);
			}

			if(SHOW_DEBUG===true) {
				$valor .= " <span class=\"debug_info notes\">".json_encode($locator)."</span>";
			}
			*/

		// cache control
			$term_by_locator_data[$cache_uid] = $valor;


		return $valor;
	}//end get_term_by_locator



	/**
	* RESOLVE_LOCATOR
	* Alias of get_term_by_locator
	* @return string|null $valor
	*/
	public function resolve_locator( object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) {
		return ts_object::get_term_by_locator($locator, $lang, $from_cache);
	}//end resolve_locator



	/**
	* GET_COMPONENT_ORDER_TIPO
	* Alias of hierarchy::get_element_tipo_from_section_map
	* @param string $section_tipo
	* @return string|null $element_tipo
	*/
	public static function get_component_order_tipo( string $section_tipo ) : ?string {

		// Calculated way
		$element_tipo = hierarchy::get_element_tipo_from_section_map( $section_tipo, 'order' );


		return $element_tipo;
	}//end get_component_order_tipo



	/**
	* GET_PERMISSIONS_ELEMENT
	* @return int $permissions
	*/
	public function get_permissions_element( string $element_name ) : int {

		switch ($element_name) {
			case 'button_new':
				if ($this->section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
					$tipo = DEDALO_HIERARCHY_BUTTON_NEW_TIPO;
					$permissions = common::get_permissions($this->section_tipo,$tipo);
				}elseif ($this->section_tipo===DEDALO_THESAURUS_SECTION_TIPO) {
					$tipo = DEDALO_THESAURUS_BUTTON_NEW_TIPO;
					$permissions = common::get_permissions($this->section_tipo,$tipo);
				}else{
					$ar_children = section::get_ar_children_tipo_by_model_name_in_section($this->section_tipo, [$element_name], $from_cache=true, $resolve_virtual=true, $recursive=false, $search_exact=true);
					# dump($ar_children, ' ar_children ++ '.to_string());
					if (isset($ar_children[0])) {
						$permissions = common::get_permissions($this->section_tipo, $ar_children[0]);
					}else{
						$permissions = 0;
					}
				}
				break;
			case 'button_delete':
				# hierarchy1 case
				if ($this->section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
					$permissions = 0; // Always is 0
				}elseif ($this->section_tipo===DEDALO_THESAURUS_SECTION_TIPO) {
					$tipo = DEDALO_THESAURUS_BUTTON_DELETE_TIPO;
					$permissions = common::get_permissions($this->section_tipo,$tipo);
				}else{
					$ar_children = section::get_ar_children_tipo_by_model_name_in_section($this->section_tipo, [$element_name], $from_cache=true, $resolve_virtual=true, $recursive=false, $search_exact=true);
					# dump($ar_children, ' ar_children ++ '.to_string());
					if (isset($ar_children[0])) {
						$permissions = common::get_permissions($this->section_tipo, $ar_children[0]);
					}else{
						$permissions = 0;
					}
				}
				break;
			default:
				$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
					$this->section_tipo,
					[$element_name], // ar_model_name
					$from_cache=true,
					$resolve_virtual=true,
					$recursive=true,
					$search_exact=true
				);
				if (isset($ar_children[0])) {
					$permissions = common::get_permissions($this->section_tipo, $ar_children[0]);
				}else{
					$permissions = 0;
					// debug_log(__METHOD__." ERROR. Element not defined: $element_name . Zero value is returned as permissions ".to_string(), logger::DEBUG);
				}
				break;
		}//end switch ($element_name)


		return (int)$permissions;
	}//end get_permissions_element



	/**
	* GET_COUNT_DATA_GROUP_BY
	* Counts indexation related items
	* @param object $component
	* 	component indexation
	* @param object section_list_thesaurus_item
	* sample:
	* {
	*    "icon": "TCHI",
	*    "tipo": "tchi59",
	*    "type": "icon",
	*    "show_data": "children"
	* }
	* @return object $count_data_group_by
	*/
	public function get_count_data_group_by( object $component, object $section_list_thesaurus_item ) : object {

		// cache
			static $resolved_child;

		// filter_locators
			if (isset($section_list_thesaurus_item->show_data)) {

				// filter_by_locator
					$filter_by_locator = new locator();
						$filter_by_locator->set_section_tipo($this->section_tipo);
						$filter_by_locator->set_section_id($this->section_id);

				// sqo
					$sqo = new search_query_object();
						$sqo->set_section_tipo([$this->section_tipo]);
						$sqo->set_limit(0);
						$sqo->set_offset(0);
						$sqo->set_filter_by_locators([$filter_by_locator]);
						$sqo->set_children_recursive(true);

				// search
					// This search is for resolve children recursively
					// Store same sqo search to prevent duplicate queries
					$hash = md5(json_encode($sqo));
					if (isset($resolved_child[$hash])) {
						// return from cache
						$ar_records = $resolved_child[$hash];
					}else{
						$search = search::get_instance(
							$sqo // object sqo
						);
						$response	= $search->search();
						$ar_records	= $response->ar_records;

						// cache
						$resolved_child[$hash] = $ar_records;
					}

				// relation_type is used to filter in relations
				$relation_type = $component->get_relation_type();

				$filter_locators = [];
				foreach ($ar_records as $current_row) {

					// filter_locator
					$filter_locator = new locator();
						$filter_locator->set_type( $relation_type ); // as dd96
						$filter_locator->set_section_tipo($current_row->section_tipo);
						$filter_locator->set_section_id($current_row->section_id);

					$filter_locators[] = $filter_locator;
				}
			}//end if (isset($section_list_thesaurus_item->show_data))

		// count_data_group_by. Get the total sections that are calling and the totals of every specific section
			$count_data_group_by = $component->count_data_group_by(
				['section_tipo'],
				$filter_locators ?? null
			);


		return $count_data_group_by;
	}//end get_count_data_group_by



	# ACCESSORS
	final public function __call(string $strFunction, array $arArguments) {

		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' :
				if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
				return($this->SetAccessor($strMethodMember, $arArguments[0]));
				break;
			case 'get_' :
				return($this->GetAccessor($strMethodMember));
				break;
		}
		return(false);
	}
	# SET
	final protected function SetAccessor(string $strMember, $strNewValue) : bool {

		if(property_exists($this, $strMember)) {

			// fix value
			$this->$strMember = $strNewValue;

			return true;
		}else{
			return false;
		}
	}
	# GET
	final protected function GetAccessor(string $strMember) {

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor



}//end class ts_object
