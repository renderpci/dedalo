<?php
/*
* CLASS TOOL_TS_PRINT
*
*
*/
class tool_ts_print extends tool_common {


	protected $section_obj;



	/**
	* __CONSTRUCT
	*/
	public function __construct($section_obj, $modo='button') {

		# Fix modo
		$this->modo = $modo;

		# Fix current media component
		$this->section_obj = $section_obj;


		return true;
	}//end __construct



	/**
	* BUILD_TS_DATA
	* @return json object
	*/
	public static function build_ts_data( $section_tipo, $ar_root=null ) {

		if (empty($ar_root)) {
			$ar_root = self::get_root_terms_of_section($section_tipo);
		}

		# Get all section records
		$ar_all_section_records = section::get_ar_all_section_records_unfiltered($section_tipo);
			#dump($ar_all_section_records, ' ar_all_section_records ++ '.to_string());

		$ar_data_node = [];
		foreach ($ar_all_section_records as $key => $section_id) {

			$data_node = self::build_data_node( $section_tipo, $section_id );

			$ar_data_node[] = $data_node;

			# Related terms. Resolve value as component
			# Check if all related terms are from same section. If not, resolve and add to ar_data_node
			$ar_related = array_filter($data_node->relations, function($element) {
				return ($element->from_component_tipo===DEDALO_THESAURUS_RELATED_TIPO); // $element->from_component_tipo===DEDALO_THESAURUS_DESCRIPTOR_TIPO
			});
			# dump($ar_related, ' ar_related ++ '.to_string());
			if (!empty($ar_related)) foreach ($ar_related as $related_locator) {
				if ($related_locator->section_tipo!==$section_tipo) {

					$external_data_node = self::build_data_node( $related_locator->section_tipo, $related_locator->section_id );
					$ar_data_node[] 	= $external_data_node;
					debug_log(__METHOD__." Added extenal data node of related term ".to_string($related_locator), logger::DEBUG);
				}
			}
		}

		$context_name = '@context';

		$ts_data = new stdClass();
			$ts_data->$context_name = self::build_data_context($section_tipo);
			$ts_data->components 	= $ar_data_node;
			$ts_data->ar_root 		= $ar_root;


		return $ts_data;
	}//end build_ts_data



	/**
	* GET_ROOT_TERMS_OF_SECTION
	* @return array $ar_roots
	*/
	public static function get_root_terms_of_section( $section_tipo, $model=false ) {

		$ar_roots = [];

		$ar_hierachies = area_thesaurus::get_active_hierarchy_sections();

		$ar_result = array_filter($ar_hierachies, function($element) use($section_tipo) {
			return ($element->{DEDALO_HIERARCHY_TARGET_SECTION_TIPO} === $section_tipo);
		});
		if (empty($ar_result)) {
			debug_log(__METHOD__." No hierarchy found for section tipo $section_tipo !!! ".to_string(), logger::ERROR);
			return $ar_roots;
		}

		$hierarchy = reset($ar_result);

		# Childrens
		$tipo 		 = ($model===true) ? DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO : DEDALO_HIERARCHY_CHILDREN_TIPO;
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 	 = component_common::get_instance($modelo_name,
													  $tipo,
													  $hierarchy->section_id,
													  'list',
													  DEDALO_DATA_NOLAN,
													  $hierarchy->section_tipo);
		$ar_roots = $component->get_dato();


		return $ar_roots;
	}//end get_root_terms_of_section



	/**
	* GET_CHILDREN
	* @return
	*//*
	public static function get_children( $locator ) {

		$section_tipo 	= $locator->section_tipo;
		$section_id 	= $locator->section_id;
		$lang 			= DEDALO_DATA_LANG;
		$ar_current 	= array();

		# Search component_relation_children in current section
		$ar_children_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo,
																					$ar_modelo_name_required=array('component_relation_children'),
																					$from_cache=true,
																					$resolve_virtual=true,
																					$recursive=true,
																					$search_exact=true,
																					$ar_tipo_exclude_elements=false);
		# Get component children's dato
		$tipo 			= reset($ar_children_tipo);
		$modelo_name 	= 'component_relation_children';
		$component_relation_children 	= component_common::get_instance($modelo_name,
																		 $tipo,
																		 $section_id,
																		 $modo='list',
																		 $lang,
																		 $section_tipo);
		$ar_childrens   = $component_relation_children->get_dato();



		# Iterate all recursively
		if (!empty($ar_childrens)) {

			foreach ($ar_childrens as $key => $children_locator) {
				# Recursive call
				$ar_temp = self::get_children($children_locator);

				$pseudo_locator = $children_locator->section_tipo .'_'. $children_locator->section_id;

				$term_obj = new stdClass();
					$term_obj->term_id  = $pseudo_locator;
					$term_obj->term 	= 'patata';
					$term_obj->ar_ch 	= $ar_temp;

				$ar_current[] = $term_obj;
			}

			return $ar_current;
		}

		$term_obj = new stdClass();
			$term_obj->term_id  = $section_tipo.'_'.$section_id;
			$term_obj->term 	= 'patata';
			$term_obj->ar_ch 	= [];

		return $term_obj;
	}//end get_children */



	/**
	* BUILD_DATA_NODE
	* @return
	*/
	public static function build_data_node( $section_tipo, $section_id ) {

		$section 		= section::get_instance($section_id, $section_tipo);
		$section_dato 	= $section->get_dato();
			#dump($section_dato, ' section_dato ++ '.to_string());

		# Relations
			$relations = [];
			if (isset($section_dato->relations)) {
				$relations = array_filter($section_dato->relations, function($element) {
					return ($element->type === DEDALO_RELATION_TYPE_CHILDREN_TIPO ||
							$element->type === DEDALO_RELATION_TYPE_RELATED_TIPO); // $element->from_component_tipo===DEDALO_THESAURUS_DESCRIPTOR_TIPO
				});
			}

		# Components
			$components = [];
			if (isset($section_dato->components)) {
				foreach ($section_dato->components as $current_tipo => $component_obj) {

					foreach ($component_obj->dato as $current_lang => $current_dato) {

						$value = is_string($component_obj->valor_list->$current_lang) ? nl2br($component_obj->valor_list->$current_lang) : $component_obj->valor_list->$current_lang;

						$node_obj = new stdClass();
							$node_obj->from_component_tipo 	= $current_tipo;
							$node_obj->lang 				= $current_lang;
							$node_obj->data 				= $current_dato;
							$node_obj->value 				= $value;

						$components[] = $node_obj;
					}
				}
			}

		# Es descriptor. Resolve value as component
			if (isset($section_dato->relations)) {
				$ar_descriptor = array_filter($section_dato->relations, function($element) {
					return ($element->from_component_tipo===DEDALO_THESAURUS_DESCRIPTOR_TIPO); // $element->from_component_tipo===DEDALO_THESAURUS_DESCRIPTOR_TIPO
				});
				$is_descriptor = true; // Default
				if (!empty($ar_descriptor)) {
					$descriptor_locator = reset($ar_descriptor);
					if ($descriptor_locator->section_id==NUMERICAL_MATRIX_VALUE_NO) {
						$is_descriptor = false;
					}
				}
				$node_obj = new stdClass();
					$node_obj->from_component_tipo 	= DEDALO_THESAURUS_DESCRIPTOR_TIPO;
					$node_obj->lang 				= DEDALO_DATA_NOLAN;
					$node_obj->data 				= reset($ar_descriptor);
					$node_obj->value 				= $is_descriptor;
				array_unshift($components, $node_obj);
			}


		# Data node
		$data_node = new stdClass();
			$data_node->section_tipo	= $section_tipo;
			$data_node->section_id 		= $section_id;
			$data_node->data 			= $components;
			$data_node->relations 		= array_values($relations);


		return $data_node;
	}//end build_data_node



	/**
	* BUILD_DATA_CONTEXT
	* @return array of objects $data_context
	*/
	public static function build_data_context( $section_tipo ) {

		#
		# Section and components
		$ar_terms = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo,
																			$ar_modelo_name_required=['component'],
																			$from_cache=true,
																			$resolve_virtual=true,
																			$recursive=true,
																			$search_exact=false,
																			$ar_tipo_exclude_elements=false );
		# Add section_tipo too
		$ar_terms[] = $section_tipo;

		#
		# Relations
		$relation_types_tipo = 'dd427';
		$ar_childrens 		 = RecordObj_dd::get_ar_recursive_childrens($relation_types_tipo,
																		$is_recursion=false,
																		$ar_exclude_models=false,
																		$order_by=null);
		foreach ($ar_childrens as $key => $children_tipo) {
			$ar_terms[] = $children_tipo;
		}
		#dump($ar_terms, ' ar_terms ++ '.to_string());

		$lang_name = '@language';

		$ar_obj = [];
		foreach ($ar_terms as $key => $current_tipo) {
			$RecordObj_dd = new RecordObj_dd($current_tipo);

			# Descriptors
			$all_descriptors_langs = RecordObj_descriptors_dd::get_all_descriptors_langs_by_tipo($current_tipo);
				#dump($all_descriptors_langs, ' all_descriptors_langs ++ '.to_string());

			foreach ($all_descriptors_langs as $key => $current_lang) {
				$current_obj = new stdClass();
					$current_obj->tipo 		 	= $current_tipo;
					$current_obj->$lang_name	= $current_lang;
					$current_obj->term 		 	= RecordObj_dd::get_termino_by_tipo($current_tipo, $current_lang, $from_cache=true, $fallback=false);
					$current_obj->model 	 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
					#$current_obj->properties 	=

				$ar_obj[] = $current_obj;
			}
		}

		$data_context = $ar_obj;

		return $data_context;
	}//end build_data_context




}//end tool_ts_print
?>
