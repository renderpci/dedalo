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
	* Resolves the list of hierarchy section active in thesaurus from the active hierarchies/ontologies.
	* Skips hierarchies/ontologies without root terms.
	* @param array|null $hierarchy_types_filter = null
	* @param array|null $hierarchy_sections_filter = null
	* @param bool $terms_are_model = false
	* 	This param comes from rqo->source->build_options->terms_are_model sent by the client from
	* 	area_thesaurus when building and self.thesaurus_view_mode==='model'
	* @return array $ar_items
	*/
	public function get_hierarchy_sections( ?array $hierarchy_types_filter=null, ?array $hierarchy_sections_filter=null, bool $terms_are_model=false ) : array {

		// get all hierarchy sections
		$class_name = get_called_class()=== 'area_thesaurus' ? 'hierarchy' : 'ontology';
		$active_elements = $class_name::get_active_elements();

		$ar_items = [];
		foreach ($active_elements as $element) {

			// active_in_thesaurus check
				if ($element->active_in_thesaurus===false && $class_name!=='ontology' ) {
					// skip non active in thesaurus sections
					continue;
				}

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
				if ( !empty($hierarchy_sections_filter) && !in_array($element->target_section_tipo, $hierarchy_sections_filter) ) {
					continue; // Skip
				}

			// root terms. The target section elements added to 'General term' portal
				$root_terms = $class_name::get_root_terms( $element->section_tipo, $element->section_id, $terms_are_model );
				if ( empty($root_terms) && $class_name!=='ontology' ) {
					// skip hierarchies without root terms
					continue;
				}

			// children tipo. It is used for fast resolution across API class form client.
				$children_tipo = $class_name==='ontology'
					? ontology::$children_tipo // 'ontology14'
					: section::get_ar_children_tipo_by_model_name_in_section($element->target_section_tipo, ['component_relation_children'], true, true, true, true)[0] ?? null;

			// item
				$item = new stdClass();
					$item->section_id			= $element->section_id; //*
					$item->section_tipo			= $element->section_tipo; //*
					$item->target_section_tipo	= $element->target_section_tipo;//*
					$item->target_section_name	= $element->name;//*
					$item->children_tipo		= $children_tipo;
					$item->typology_section_id	= $class_name==='ontology' ? '14' : $element->typology_id;//*
					$item->order				= $element->order;//*
					$item->type					= 'hierarchy';
					$item->active_in_thesaurus	= $element->active_in_thesaurus;
					$item->root_terms			= $root_terms;

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
		$model_name		= RecordObj_dd::get_model_name_by_tipo($tipo,true);
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
			$model_name		= RecordObj_dd::get_model_name_by_tipo($tipo,true);
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
			? $component->extract_component_value_fallback()
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
		$model_name		= RecordObj_dd::get_model_name_by_tipo($tipo,true);
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
		$model_name 	 = RecordObj_dd::get_model_name_by_tipo($tipo,true);
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
			$hierarchy_name = $component->extract_component_value_fallback();
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
			// $terms_are_model				= $this->build_options->terms_are_model ?? false;
			// $hierarchy_from_component_tipo	= $terms_are_model
			// 	? DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO
			// 	: DEDALO_HIERARCHY_CHILDREN_TIPO;

			// $hierarchy_section_tipo = $this->get_hierarchy_section_tipo();

		// Search records
			$search			= search::get_instance($search_query_object);
			$search_result	= $search->search();
			$ar_records		= $search_result->ar_records;

		// ar_path_mix . Calculate full path of each result
			$ar_ts_objects	= [];
			$found			= [];

			foreach ($ar_records as $row) {

				$section_tipo	= $row->section_tipo;
				$section_id		= $row->section_id;

				$found[] = [
					'section_tipo'	=> $section_tipo,
					'section_id'	=> $section_id
				];

				// properties children_search check (case rsc197 People)
					// $RecordObj_dd		= new RecordObj_dd($section_tipo);
					// $section_properties	= $RecordObj_dd->get_properties();

					// switch (true) {
					// 	case (!empty($section_properties) && isset($section_properties->children_search)):

					// 		// defined section properties 'children_search' case

					// 		$ar_path = [];

					// 		// root locator
					// 		$root_locator	= self::get_root_locator($section_tipo, $hierarchy_section_tipo);
					// 		$ar_path[]		= $root_locator;
					// 		break;

					// 	default:

							// default case

				// get all parents of the node
				$ar_parents = component_relation_parent::get_parents_recursive(
					$section_id,
					$section_tipo
				);

				// reverse the order to get the root term, top term, at first position
				$ar_path = array_reverse($ar_parents);

				// get the ts_objects to built the tree
				foreach ($ar_path as $parent_key => $current_parent) {

					// Children
						// get all children of every parent, first term is the root term
						// therefore get its children, they will given in the correct order
						$parent_tipo = $current_parent->from_component_tipo;

						$children_tipo			= component_relation_parent::get_component_relation_children_tipo( $parent_tipo );
						$children_section_id	= $current_parent->section_id;
						$children_section_tipo	= $current_parent->section_tipo;

						// build the component and get its data
						$children_model		= RecordObj_dd::get_model_name_by_tipo( $children_tipo );
						$component_children	= component_common::get_instance(
							$children_model, // string model
							$children_tipo, // string tipo
							$children_section_id, // string section_id
							'list', // string mode
							DEDALO_DATA_NOLAN, // string lang
							$children_section_tipo // string section_tipo
						);

						$children_data = $component_children->get_dato();

						// built the ts_object with every child data
						foreach ($children_data as $children_key => $child_locator) {
							// find if the current child was resolved and is stored previously.
							// avoid duplicates
							$current_found = array_find($ar_ts_objects, function($el) use($child_locator) {
								return	$el->section_tipo===$child_locator->section_tipo &&
										$el->section_id==$child_locator->section_id;
							});
							// if the child doesn't exist create the ts_object, build it and get its data
							if (!$current_found) {
								// ts_parent. Used to link the child node to its parent in the tree
								$ts_parent = $children_section_tipo.'_'.$children_section_id;
								// set the order number(int) in the ts_options
								$ts_options = new stdClass();
									$ts_options->order = $children_key+1;

								// create the ts_object of the child and get its data
								// to be stored into the full array.
								$ts_object = new ts_object(
									$child_locator->section_id,
									$child_locator->section_tipo,
									$ts_options,
									'list',
									$ts_parent
								);

								$ar_ts_objects[] = $ts_object->get_data();
							}
						}

					// Parent
						// Find if the current parent was resolved previously
						// avoiding duplicates
						// here only root parents will be not stored (and not found)
						// because the previous children resolution will include any others than root.
						// all parents are checked, but only root parent will be processed.
						$current_found = array_find($ar_ts_objects, function($el) use($current_parent) {
							return	$el->section_tipo===$current_parent->section_tipo &&
									$el->section_id==$current_parent->section_id;
						});
						if (!$current_found) {
							// set its parent to link it in the tree
							// if the node is the first one, it is the root node, the top node
							// else the parent is the previous parent in the array
							$ts_parent = ($parent_key === 0)
								? 'root'
								: $ar_path[$parent_key-1]->section_tipo.'_'.$ar_path[$parent_key-1]->section_id;

							// if the parent is the root node, top node, get the order in the main section using the tld
							$root_options = null;
							if($ts_parent==='root'){
								$root_tld	= get_tld_from_tipo($current_parent->section_tipo);

								$root_order	= hierarchy::get_main_order($root_tld);
								if(!empty($root_order)){
									$root_options = new stdClass();
										$root_options->order = $root_order;
								}
							}
							// create the ts_object of the child and get its data
							// to be stored into the full array.
							$ts_object = new ts_object(
								$current_parent->section_id,
								$current_parent->section_tipo,
								$root_options,
								'edit',
								$ts_parent
							);

							$ar_ts_objects[] = $ts_object->get_data();
						}
				}
			}


		// total_records count
			$total_records = count($ar_records);

		// response
			$response->msg		= 'Records found: ' . $total_records;
			$response->result	= $ar_ts_objects;
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
	* GET_HIERARCHY_TERMS_SQO
	* Creates a SQO with a custom filter using hierarchy_terms
	* @param array $hierarchy_terms
	* [
	* 	{
	* 		value : [{"section_tipo":"dd43","section_id":"2"}]
	* 	}
	* ]
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
				$value = $current_term->value ?? [];
				foreach ($value as $item) {

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
