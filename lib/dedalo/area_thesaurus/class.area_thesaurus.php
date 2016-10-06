<?php
/**
* AREA_THESAURUS
* Manage whole thesaurus hierarchies
*
*/
class area_thesaurus extends area {

	static $typologies_section_tipo = 'hierarchy13';
	static $typologies_name_tipo 	= 'hierarchy16';


	/**
	* GET_HIERARCHY_TyPOLOGIES
	* @return array $active_hierarchies
	*/
	public function get_hierarchy_typologies() {

		$section_tipo 	= area_thesaurus::$typologies_section_tipo;
		$matrix_table   = common::get_matrix_table_from_tipo($section_tipo);

		# LAYOUT_MAP
		# Build a custom layout map with our needs
		$layout_map=array();
		$layout_map[$section_tipo] = array(
			area_thesaurus::$typologies_name_tipo			
			);

		# OPTIONS SEARCH . Prepares options to get search
		$options = new stdClass();
			$options->section_tipo 		= $section_tipo;
			$options->section_real_tipo = $section_tipo;
			$options->matrix_table 		= $matrix_table;
			$options->layout_map 		= $layout_map;			
			$options->offset_list 		= 0;
			$options->limit 			= null; // Not limit amount of results (use null) 
			#$options->filter_custom 	= $filter_custom;			
			$options->modo 				= 'edit'; // edit dont need define layout map
			$options->context 			= '';
			$options->search_options_session_key = 'area_thesaurus';
				#dump($options, ' options ++ '.to_string());

		$rows_data = search::get_records_data($options);
		# dump($rows_data, ' $rows_data ++ '.to_string());

		return (object)$rows_data;
	}//end get_hierarchy_typologies	



	/**
	* GET_OPTIONS_FOR_SEARCH_HIERARCHIES
	* @return object $options
	*/
	public function get_options_for_search_hierarchies( $tipology_section_tipo, $tipology_section_id ) {

		$section_tipo 	= DEDALO_HIERARCHY_SECTION_TIPO;
		$matrix_table   = common::get_matrix_table_from_tipo($section_tipo);

		# LAYOUT_MAP
		# Build a custom layout map with our needs
		$layout_map=array();
		$layout_map[DEDALO_HIERARCHY_SECTION_TIPO] = array(			
			DEDALO_HIERARCHY_TERM_TIPO,
			DEDALO_HIERARCHY_CHIDRENS_TIPO,
			DEDALO_HIERARCHY_TLD2_TIPO
			);
			/*
				
				DEDALO_HIERARCHY_ORDER_TIPO,
				DEDALO_HIERARCHY_ACTIVE_TIPO,
				DEDALO_HIERARCHY_LANG_TIPO,
				DEDALO_HIERARCHY_TIPOLOGY_TIPO,
				DEDALO_HIERARCHY_TLD2_TIPO,		
				*/

		# FILTER_BY_SEARCH . Uses a search similar as sections do
		$filter_by_search = new stdClass();

			# Locator 'YES'
			$locator = new locator();
				$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			$locator_json = json_encode($locator);
			# Add to filter
			$filter_by_search->{$section_tipo.'_'.DEDALO_HIERARCHY_ACTIVE_TIPO} = (string)$locator_json;

			# Locator 'filter section'
			$locator = new locator();
				$locator->set_section_tipo($tipology_section_tipo);
				$locator->set_section_id($tipology_section_id);
			$locator_json = json_encode($locator);
			# Add to filter
			$filter_by_search->{$section_tipo.'_'.DEDALO_HIERARCHY_TIPOLOGY_TIPO} = (string)$locator_json;
				#dump($locator_json, ' locator ++ '.to_string(DEDALO_HIERARCHY_TIPOLOGY_TIPO));

		# OPTIONS SEARCH . Prepares options to get search
		$options = new stdClass();
			$options->section_tipo 		= $section_tipo;
			$options->section_real_tipo = $section_tipo;
			$options->matrix_table 		= $matrix_table;
			$options->layout_map 		= $layout_map;
			$options->layout_map_list 	= $options->layout_map;
			$options->offset_list 		= 0;
			$options->limit 			= null; // Not limit amount of results (use null) 
			$options->filter_by_search	= $filter_by_search;
			#$options->filter_custom 	= $filter_custom;			
			$options->modo 				= 'list_thesaurus';
			$options->context 			= '';
			$options->tipo_de_dato 		= 'dato';
			$options->search_options_session_key = 'area_thesaurus';
				#dump($options, ' options ++ '.to_string());

		return (object)$options;
	}//end get_options_for_search_hierarchies



}//end area_thesaurus
?>