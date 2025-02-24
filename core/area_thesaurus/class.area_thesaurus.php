<?php declare(strict_types=1);
/**
* AREA_THESAURUS
* Manage whole thesaurus hierarchies
*/
class area_thesaurus extends area_common {



	/**
	* CLASS VARS
	* @var
	*/
	static $typologies_section_tipo	= DEDALO_HIERARCHY_TYPES_SECTION_TIPO; // 'hierarchy13'
	static $typologies_name_tipo	= DEDALO_HIERARCHY_TYPES_NAME_TIPO;	// 'hierarchy16'

	// Default vars for use in thesaurus mode (set GET['model']=true to change this vars in runtime)
	protected $model_view = false;

	// thesaurus_mode
	public $thesaurus_mode = null;



	/**
	* GET_HIERARCHY_SECTION_TIPO
	* @return string $section_tipo
	*/
	public function get_hierarchy_section_tipo() : string {

		$hierarchy_section_tipo = DEDALO_HIERARCHY_SECTION_TIPO; // 'hierarchy1'

		return $hierarchy_section_tipo;
	}//end get_hierarchy_section_tipo



	/**
	* GET_MAIN_TABLE
	* @return string
	*/
	public function get_main_table() {

		return hierarchy::$main_table; // matrix_hierarchy_main
	}//end get_main_table



	/**
	* GET_HIERARCHY_TYPOLOGIES
	* Get an array of all section_id from records of current section
	* @return array $hierarchy_typologies
	*/
	public function get_hierarchy_typologies() : array {

		$hierarchy_typologies = section::get_ar_all_section_records_unfiltered(
			self::$typologies_section_tipo
		);

		return $hierarchy_typologies;
	}//end get_hierarchy_typologies



	/**
	* GET_HIERARCHY_SECTIONS
	* @param array|null $hierarchy_types_filter = null
	* @param array|null $hierarchy_sections_filter = null
	* @param bool $terms_are_model = false
	* 	This param comes from rqo->source->build_options->terms_are_model sent by the client from
	* 	area_thesaurus when building and self.thesaurus_view_mode==='model'
	* @return array $ar_items
	*/
	public function get_hierarchy_sections( ?array $hierarchy_types_filter=null, ?array $hierarchy_sections_filter=null, bool $terms_are_model=false ) : array {

		$hierarchy_children_tipo = $terms_are_model ? DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO : DEDALO_HIERARCHY_CHILDREN_TIPO;

		// get all hierarchy sections
		$class_name = get_called_class()=== 'area_thesaurus' ? 'hierarchy' : 'ontology';
		$active_elements = $class_name::get_active_elements();

		$ar_items = [];
		foreach ($active_elements as $element) {

			// typology data
				if (empty($element->typology_id)) {
					debug_log(__METHOD__." Skipped hierarchy without defined typology. section_id: $element->section_id ", logger::WARNING);
					continue; // Skip
				}

			// Skip filtered types when defined
				if (!empty($hierarchy_types_filter) && !in_array($element->typology_id, $hierarchy_types_filter)) {
					continue; // Skip
				}

			// Skip filtered sections when defined
				if (!empty($hierarchy_sections_filter) && !in_array($element->target_section_tipo, $hierarchy_sections_filter)) {
					continue; // Skip
				}

			// item
				$item = new stdClass();
					$item->section_id			= $element->section_id; //*
					$item->section_tipo			= $element->section_tipo; //*
					$item->target_section_tipo	= $element->target_section_tipo;//*
					$item->target_section_name	= $element->name;//*
					$item->typology_section_id	= $class_name==='ontology' ? '14' : $element->typology_id;//*
					$item->order				= $element->order;//*
					$item->type					= 'hierarchy';
					$item->children_tipo		= $hierarchy_children_tipo;
					$item->active_in_thesaurus	= $element->active_in_thesaurus;

			$ar_items[] = $item;
		}//end foreach ($active_elements as $key => $row)


		return $ar_items;
	}//end get_hierarchy_sections


	/**
	* GET_TYPOLOGY_DATA
	* @param int|string int|string $section_id
	* @return object|null $locator
	*/
	public function get_typology_data( int|string $section_id ) : ?object {

		$tipo			= DEDALO_HIERARCHY_TYPOLOGY_TIPO; // 'hierarchy9' component_select
		$section_tipo	= $this->get_hierarchy_section_tipo(); // hierarchy1
		$model_name		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component		= component_common::get_instance(
			$model_name,
			$tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);

		$dato		= $component->get_dato();
		$locator	= $dato[0] ?? null;

		return $locator;
	}//end get_typology_data



	/**
	* GET_TYPOLOGY_NAME
	* Resolve typology name from section_id
	* @param int $typology_section_id
	* @return string $typology_name
	*/
	public function get_typology_name( int|string $typology_section_id ) : string {

		// cache Store for speed
			static $typology_names;
			if (isset($typology_names[$typology_section_id])) {
				return $typology_names[$typology_section_id];
			}

		// component
			$tipo			= DEDALO_HIERARCHY_TYPES_NAME_TIPO;
			$model_name		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$parent			= $typology_section_id;
			$mode			= 'list';
			$lang			= DEDALO_DATA_LANG;
			$section_tipo	= self::$typologies_section_tipo;

			$component		= component_common::get_instance(
				$model_name,
				$tipo,
				$parent,
				$mode,
				$lang,
				$section_tipo
			);
			$value = $component->get_valor($lang);

		$typology_name = empty($value)
			? component_common::extract_component_value_fallback($component)
			: $value;

		if (empty($typology_name)) {
			$typology_name = 'Typology untranslated ' . $tipo .' '. $parent;
		}

		// cache. Store for speed
		$typology_names[$typology_section_id] = $typology_name;


		return $typology_name;
	}//end get_typology_name



	/**
	* GET_TYPOLOGY_ORDER
	* @param int|string $typology_section_id
	* @return int $order_value
	*/
	public function get_typology_order( int|string $typology_section_id ) : int {

		// cache. Store for speed
			static $typology_order_values;
			if (isset($typology_order_values[$typology_section_id])) {
				return $typology_order_values[$typology_section_id];
			}

		$tipo			= DEDALO_HIERARCHY_TYPES_ORDER;
		$model_name		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$parent			= $typology_section_id;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;
		$section_tipo	= self::$typologies_section_tipo;
		$component		= component_common::get_instance(
			$model_name,
			$tipo,
			$parent,
			$mode,
			$lang,
			$section_tipo
		);
		$dato			= $component->get_dato();
		$order_value	= $dato[0] ?? 0;

		// cache
			$typology_order_values[$typology_section_id] = $order_value;


		return (int)$order_value;
	}//end get_typology_order



	/**
	* GET_HIERARCHY_NAME
	* @param string|int $hierarchy_section_id
	* @return string $hierarchy_name
	*/
	public function get_hierarchy_name( int|string $hierarchy_section_id ) : string {

		# Store for speed
		static $hierarchy_names;
		if (isset($hierarchy_names[$hierarchy_section_id])) {
			return $hierarchy_names[$hierarchy_section_id];
		}


		$tipo 			 = DEDALO_HIERARCHY_TERM_TIPO;
		$model_name 	 = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$parent 		 = $hierarchy_section_id;
		$mode 			 = 'list';
		$lang 			 = DEDALO_DATA_LANG;
		$section_tipo 	 = $this->get_hierarchy_section_tipo();

		$component 		 = component_common::get_instance(
			$model_name,
			$tipo,
			$parent,
			$mode,
			$lang,
			$section_tipo
		);
		$value = $component->get_valor($lang);

		if (empty($value)) {
			$hierarchy_name = component_common::extract_component_value_fallback($component);
		}else{
			$hierarchy_name = $value;
		}

		if (empty($hierarchy_name)) {
			$hierarchy_name = 'Hierarchy untranslated ' . $tipo .' '. $parent;
		}

		# Store for speed
		$hierarchy_names[$hierarchy_section_id] = $hierarchy_name;


		return (string)$hierarchy_name;
	}//end get_hierarchy_name



	/**
	* SEARCH_THESAURUS
	* Exec the given SQO search adding recursive parents as path for each term
	* In Area Ontology calls, all parents children are added to the result for easy edit
	* @param object $search_query_object
	* @return object $response
	*/
	public function search_thesaurus( object $search_query_object ) : object {
		$start_time = start_time();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';
				$response->errors	= [];

		// terms_are_model. This value comes from rqo->source->build_options->terms_are_model
			// sent by the client from area_thesaurus when building and self.thesaurus_view_mode==='model'
			$terms_are_model				= $this->build_options->terms_are_model ?? false;
			$hierarchy_from_component_tipo	= $terms_are_model
				? DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO
				: DEDALO_HIERARCHY_CHILDREN_TIPO;

			$hierarchy_section_tipo = $this->get_hierarchy_section_tipo();

		// Search records
			$search			= search::get_instance($search_query_object);
			$search_result	= $search->search();
			$ar_records		= $search_result->ar_records;

		// ar_path_mix . Calculate full path of each result
			$ar_path_mix	= [];
			$found			= [];
			foreach ($ar_records as $row) {

				$section_tipo	= $row->section_tipo;
				$section_id		= $row->section_id;

				$found[] = [
					'section_tipo'	=> $section_tipo,
					'section_id'	=> $section_id
				];

				// properties children_search check (case rsc197 persons)
					$RecordObj_dd		= new RecordObj_dd($section_tipo);
					$section_properties	= $RecordObj_dd->get_properties();

					switch (true) {
						case (!empty($section_properties) && isset($section_properties->children_search)):

							// defined section properties 'children_search' case

							$ar_path = [];

							// root locator
							$root_locator	= self::get_root_locator($section_tipo, $hierarchy_section_tipo);
							$ar_path[]		= $root_locator;
							break;

						default:

							// default case

							$ar_parents = component_relation_parent::get_parents_recursive(
								$section_id,
								$section_tipo,
								// (object)[
								// 	'skip_root'						=> false,
								// 	'search_in_main_hierarchy'		=> true,
								// 	'main_table'					=> $this->get_main_table(),
								// 	'hierarchy_from_component_tipo'	=> $hierarchy_from_component_tipo
								// ]
							);
							// add
							$ar_path = array_reverse($ar_parents);

							// add parents direct children (only area_ontology for now)
							if (get_called_class()==='area_ontology') {
								// resolve every children (one level) of current term parents
								$ar_path_mix = array_merge(
									$ar_path_mix,
									$this->get_parents_children(
										$ar_parents,
										$section_tipo,
										$section_id,
										$hierarchy_from_component_tipo
									)
								);
							}
							break;
					}//end switch (true)

				// add self at end
					$locator = new locator();
						$locator->set_section_tipo($section_tipo);
						$locator->set_section_id($section_id);
					$ar_path[] = $locator;

				$ar_path_mix[] = $ar_path;
			}

		// AR_DATA_COMBINED
			$ar_data_combined = $this->combine_ar_data($ar_path_mix);

		// result. Walk ar_data
			$result = self::walk_hierarchy_data($ar_data_combined);

		// total_records count
			$total_records = count($ar_records);

		// response
			$response->msg		= 'Records found: ' . $total_records;
			$response->result	= $result;
			$response->total	= $total_records;
			$response->found	= $found;

		// debug
			if(SHOW_DEBUG===true) {
				$response->strQuery = $search_result->strQuery;
				$response->debug[] = exec_time_unit($start_time);
			}


		return $response;
	}//end search_thesaurus



	/**
	* GET_PARENTS_CHILDREN
	* Resolve term parents children (first level only) creating
	* a standard path usable in thesaurus search results.
	* It is used by Area Ontology search only, to allow display
	* a useful list of parents for easy edit like v5 editor do.
	* This resolution is slow. But it is worth it for ontology.
	* @param array $ar_parents
	* @param string $section_tipo
	* @param string|int $section_id
	* @param string $hierarchy_from_component_tipo
	* @return array $ar_path_mix
	*/
	private function get_parents_children( array $ar_parents, string $section_tipo, string|int $section_id, string $hierarchy_from_component_tipo) : array {
		$start_time=start_time();

		$ar_path_mix = [];

		foreach ($ar_parents as $current_parent) {

			// get first level children of each parent
			$ar_children = component_relation_children::get_children(
				$current_parent->section_id,
				$current_parent->section_tipo,
				null, // component_tipo
			);

			foreach ($ar_children as $current_child) {

				// exclude already added self term
				if ($current_child->section_tipo===$section_tipo && $current_child->section_id==$section_id) {
					continue;
				}

				// get parents recursive of each child to fill the path
				$ar_child_parents = component_relation_parent::get_parents_recursive(
					$current_child->section_id,
					$current_child->section_tipo,
					// (object)[
					// 	'skip_root'						=> false,
					// 	'search_in_main_hierarchy'		=> true,
					// 	'main_table'					=> $this->get_main_table(),
					// 	'hierarchy_from_component_tipo'	=> $hierarchy_from_component_tipo
					// ]
				);

				// reverse order to create a compatible search results path
				$child_array = array_reverse($ar_child_parents);

				// add self
					$locator = new locator();
						$locator->set_section_tipo($current_child->section_tipo);
						$locator->set_section_id($current_child->section_id);
					$child_array[] = $locator;

				// add child array group
				$ar_path_mix[] = $child_array;
			}
		}

		// debug
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__
					. " time to resolve parents children: "
					. exec_time_unit($start_time).' ms' . PHP_EOL
					.' total parents: ' . count($ar_parents) . PHP_EOL
					.' total ar_path_mix: ' . count($ar_path_mix)
					, logger::DEBUG
				);
			}


		return $ar_path_mix;
	}//end get_parents_children



	/**
	* GET_ROOT_LOCATOR
	* Builds a root locator from section_tipo
	* searching hierarchy with target section tipo match
	* and return a standard locator
	* @param string $section_tipo
	* @return object locator $root_locator
	*/
	public static function get_root_locator( string $section_tipo, string $hierarchy_section_tipo ) : locator {

		static $hierarchy_section_id = [];

		// root locator. Calculate once from current section_tipo
		if (!isset($hierarchy_section_id[$section_tipo])) {
			$hierarchy_section_id[$section_tipo] = hierarchy::get_hierarchy_section(
				$section_tipo,
				DEDALO_HIERARCHY_TARGET_SECTION_TIPO
			);
		}

		// root_locator
		$root_locator = new locator();
			$root_locator->section_tipo	= $hierarchy_section_tipo; // 'hierarchy1'
			$root_locator->section_id	= $hierarchy_section_id[$section_tipo];


		return $root_locator;
	}//end get_root_locator



	/**
	* COMBINE_AR_DATA
	* Build a global array hierarchized with all elements
	* @param array $ar_path_mix
	* @return array $ar_combine
	*/
	public static function combine_ar_data( array $ar_path_mix ) : array {

		/*
			REFERENCE ar_simple
			Simplify array keys

			[0] => ts1_65
            [1] => ts1_73
            [2] => ts1_74
        */
		$ar_simple=array();	foreach ($ar_path_mix as $key => $ar_value) {
			foreach ($ar_value as $i => $locator) {
				$ckey = $locator->section_tipo.'_'.$locator->section_id;
				$ar_simple[$key][$i] = $ckey;
			}
		}

		// REFERENCE ar_hierarchy
			// Hierarchize the simple plain array in revere order
			// [0] => Array
			//       (
			//           [ts1_65] => Array
			//               (
			//                   [ts1_73] => Array
			//                       (
			//                           [ts1_74] => Array
			//                               (
			//                               )
			//                       )
			//               )
			//       )
			//    [1] => Array
			//        (
			//            [ts1_65] => Array
			//                (
			//                    [ts1_66] => Array
			//                        (
			//                            [ts1_67] => Array
			//                                (
			//                                )
			//                        )
			//                )
			//        )
			//    )

		$ar_hierarchy=array(); foreach ($ar_simple as $key => $ar_value) {
			# iterate array values in reverse order
			foreach (array_reverse($ar_value) as $ckey => $cvalue) {


				if(empty($ar_hierarchy[$key])) {
					// Último elemento (estará vacío porque es el que estamos buscando)
					$ar_hierarchy[$key][$cvalue] = array();

				}else{
					// Elementos intermendios descendentes
					$ar_hierarchy[$key] = array($cvalue => $ar_hierarchy[$key]);


					# Add siblings
					/*
					if (strpos($cvalue, 'hierarchy')===false) {
						$ar_children = self::get_siblings($cvalue, $ar_value);
						if(!empty($ar_children)) foreach ($ar_children as $s_key => $s_value) {
							$ar_hierarchy[$key][$cvalue][$s_key]	= array();
						}
					}
					*/
				}
			}
		}

		// REFERENCE ar_combine
			// Combines hierarchized arrays to obtain one global array with combined values

			// [ts1_65] => Array
			//       (
			//           [ts1_73] => Array
			//               (
			//                   [ts1_74] => Array
			//                       (
			//                       )
			//               )
			//           [ts1_66] => Array
			//               (
			//                   [ts1_67] => Array
			//                       (
			//                       )
			//               )
			//       )

		$ar_combine=array(); foreach ($ar_hierarchy as $key => $ar_value) {
			$ar_combine = array_merge_recursive($ar_combine, $ar_value);
		}


		return (array)$ar_combine;
	}//end combine_ar_data



	/**
	* GET_SIBLINGS
	* @param string $ckey
	* @return array $ar_siblings
	*/
	public static function get_siblings( string $ckey ) : array {

		$ar_parts 		= explode('_', $ckey);
		$section_tipo 	= $ar_parts[0];
		$section_id 	= $ar_parts[1];

		$tipo 			= DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO;
		$model_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true); // 'component_relation_children';
		$mode 			= 'list';
		$component_relation_children = component_common::get_instance(
			$model_name,
			$tipo,
			$section_id,
			$mode,
			DEDALO_DATA_NOLAN,
			$section_tipo
		);
		$dato = $component_relation_children->get_dato();

		$ar_siblings = [];
		foreach ((array)$dato as $s_locator) {
			if ($s_locator->section_id==$section_id && $s_locator->section_tipo===$section_tipo) {
				// exclude
			}else{
				$ar_siblings[$s_locator->section_tipo.'_'.$s_locator->section_id] = [];
			}
		}


		return $ar_siblings;
	}//end get_siblings



	/**
	* WALK_HIERARCHY_DATA
	* Walk recursively $ar_data_combined resolving ts_object and add children as 'heritage'
	* @param array $ar_data_combined
	* Sample assoc array:
	* [
	* 	"ts1_1" => {
	* 		"ts1_258": []
	* 		"ts1_259": []
	* 	}
	* ]
	* @return array $ar_mix
	*/
	public static function walk_hierarchy_data( array $ar_data_combined ) : array {

		$ar_mix = array();
		foreach ($ar_data_combined as $key => $ar_values) {

			// Parent
			$ar_parts				= explode('_', $key);
			$current_section_tipo	= $ar_parts[0];
			$current_section_id		= $ar_parts[1];
			$ts_object				= new ts_object($current_section_id, $current_section_tipo);
			$child_data				= $ts_object->get_child_data();

			# Add to array
			$ar_mix[$key] = $child_data;

			# Add children in container heritage
			if (!empty($ar_values)) {
				$ar_mix[$key]->heritage = self::walk_hierarchy_data( $ar_values );
			}
		}


		return $ar_mix;
	}//end walk_hierarchy_data



	/**
	* GET_HIERARCHY_TERMS_SQO
	* @param array $hierarchy_terms
	* @return object $sqo
	* 	Full Search query object
	*/
	public function get_hierarchy_terms_sqo( array $hierarchy_terms ) : object {

		// filter_custom. hierarchy_terms
		$filter_custom = null;

		// Reset $ar_section_tipos to use only filter sections
			$ar_section_tipos = [];

			$filter_custom = new stdClass();

			$filter_custom->{OP_OR} = [];

			$path = new stdClass();
				$path->component_tipo	= 'hierarchy22';
				$path->model			= 'component_section_id';
				$path->name				= 'Id';

			$path_section = new stdClass();
				$path_section->model	= 'section';
				$path_section->name		= 'Section tipo column';

		// hierarchy_terms
			foreach ($hierarchy_terms as $current_term) {
				foreach ($current_term->value as $item) {

					$current_section_tipo	= $item->section_tipo;
					$current_section_id		= $item->section_id;

					# Update path section tipo
					$path->section_tipo		= $current_section_tipo;

					# Add to ar_section_tipos
					$ar_section_tipos[] = $current_section_tipo;

					$filter_item = new stdClass();
						$filter_item->q		= $current_section_id;
						$filter_item->path	= [$path];

					$filter_item_section = new stdClass();
						$filter_item_section->q		= $current_section_tipo;
						$filter_item_section->path	= [$path_section];

					$group = new stdClass();
						$group->{OP_AND} = [$filter_item, $filter_item_section];

					$filter_custom->{OP_OR}[] = $group;

				}
			}

		// search_query_object. Add search_query_object to options
			$search_query_object = new search_query_object();
				$search_query_object->id			= 'thesaurus';
				$search_query_object->section_tipo	= $ar_section_tipos;
				$search_query_object->limit			= 100;
				$search_query_object->filter		= $filter_custom ?? null;
				$search_query_object->select		= [];


		return $search_query_object;
	}//end get_hierarchy_terms_sqo



}//end area_thesaurus
