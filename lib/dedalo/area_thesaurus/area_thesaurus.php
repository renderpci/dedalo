<?php
	
	# CONTROLLER	
	
	$tipo					= $this->get_tipo();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();

	$label					= $this->get_label();
	$permissions			= common::get_permissions($tipo,$tipo);
	$area_name				= get_class($this);
	$visible				= $this->get_visible();
	$ar_children_areas 		= $this->get_ar_ts_children_areas_recursive($tipo);
		#dump($ar_children_areas,'$ar_children_areas');
	
	$file_name 				= $modo;

	switch($modo) {
		
		case 'list':
				# List
				include(DEDALO_LIB_BASE_PATH.'/section_records/row_thesaurus/class.row_thesaurus.php');

				#
				# ACTIVE HIERARCHIES
				$ar_hierarchy_typologies = $this->get_hierarchy_typologies();
					#dump($ar_hierarchy_typologies, ' ar_hierarchy_typologies ++ '.to_string());

				/*
					$section_tipo 	= DEDALO_HIERARCHY_SECTION_TIPO;
					$matrix_table   = common::get_matrix_table_from_tipo($section_tipo);

					# LAYOUT_MAP
					# Build a custom layout map with our needs
					$layout_map=array();
					$layout_map[DEDALO_HIERARCHY_SECTION_TIPO] = array(
						DEDALO_HIERARCHY_ACTIVE_TIPO,
						DEDALO_HIERARCHY_ORDER_TIPO,
						DEDALO_HIERARCHY_TERM_TIPO,
						DEDALO_HIERARCHY_LANG_TIPO,
						DEDALO_HIERARCHY_TIPOLOGY_TIPO,
						DEDALO_HIERARCHY_TLD2_TIPO,					
						);

					# Locator 'YES'
					$locator = new locator();
						$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
						$locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
					$locator_json = json_encode($locator);

					# FILTER_BY_SEARCH . Uses a search similar as sections do
					$filter_by_search = new stdClass();
						$filter_by_search->{DEDALO_HIERARCHY_ACTIVE_TIPO} = (string)$locator_json;

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
						$options->order_by 			= DEDALO_HIERARCHY_ORDER_TIPO.' ASC';
						$options->modo 				= 'list_thesaurus';
						$options->context 			= '';
						$options->search_options_session_key = 'area_thesaurus';
					$section_rows 	= new section_records($section_tipo, $options);
					$rows_list_html = $section_rows->get_html();
					*/
				break;
	}
	
	
	# LOAD PAGE	
	$page_html	= dirname(__FILE__) . '/html/' . $area_name . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>