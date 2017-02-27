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
				# ts_object class
				include(DEDALO_LIB_BASE_PATH."/ts_object/class.ts_object.php");

				#
				# Load necessary js /css elements when we in thesaurus
				$element_name = 'ts_object';				
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'component_text_area';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'component_order';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'component_input_text';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'component_input_text_large';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'component_relation_children';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'component_relation_model';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'component_relation_related';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'component_relation_index';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'component_number';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'component_radio_button';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";

				$element_name = 'diffusion_index_ts';
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/diffusion/$element_name/css/$element_name.css";
				#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";


				#
				# HIERARCHY_TYPES
				$hierarchy_types 	= null;
				if (isset($_GET['hierarchy_types'])) {
					$hierarchy_types 	= json_decode($_GET['hierarchy_types']);
				}

				#
				# HIERARCHY_SECTIONS
				$hierarchy_sections = null;
				if (isset($_GET['hierarchy_sections'])) {
					$hierarchy_sections = json_decode($_GET['hierarchy_sections']);
				}

				#
				# SEARCH FORM . ROWS_SEARCH 
				# Render search form html DEDALO_LANGS_SECTION_TIPO
				$section = section::get_instance(null, DEDALO_THESAURUS_SECTION_TIPO,'list');
					$search_form_html 	= '';
					$records_search 	= new records_search($section, 'list');
					$search_form_html 	= $records_search->get_html();
						#dump($records_search, ' $records_search ++ '.to_string());
				
				#
				# ACTIVE HIERARCHIES
				$ar_hierarchy_typologies = $this->get_hierarchy_typologies();
					#dump($ar_hierarchy_typologies, ' ar_hierarchy_typologies ++ '.to_string());


				# When request var 'model' is set, use models target section, else use regular target section
				if (isset($_GET['model'])) {

					$model_view 				= true;
					$target_section_tipo 		= DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;
					$hierarchy_childrens_tipo	= DEDALO_HIERARCHY_CHIDRENS_MODEL_TIPO;
					$_SESSION['dedalo4']['config']['thesaurus_view_mode'] = 'model';

					#dump($hierarchy_childrens_tipo, '$hierarchy_childrens_tipo ++ '.to_string($target_section_tipo));
				}else{

					$model_view 				= false;
					$target_section_tipo 		= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
					$hierarchy_childrens_tipo	= DEDALO_HIERARCHY_CHIDRENS_TIPO;
					$_SESSION['dedalo4']['config']['thesaurus_view_mode'] = 'thesaurus';
				}

				#
				# List mode
				$thesaurus_list_mode = 'list'; // Default
				if(!empty($_GET['term'])) {
					$thesaurus_list_mode = 'search';
				}
			
				break;
	}
	
	
	# LOAD PAGE	
	$page_html	= dirname(__FILE__) . '/html/' . $area_name . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>