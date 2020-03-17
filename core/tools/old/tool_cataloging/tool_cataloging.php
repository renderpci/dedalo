<?php

	# CONTROLLER TOOL_CATALOGING

	$tool_name 			= get_class($this);
	$source_list 		= $this->source_list;
	$source_thesaurus 	= $this->source_thesaurus;
	$modo 				= $this->modo;
	$file_name			= $modo;
	$tool_tipo 			= $this->button_trigger_tipo;
	$tool_label 		= label::get_label('cataloging');

	$RecordObj_dd		= new RecordObj_dd($tool_tipo);
	$properties 		= $RecordObj_dd->get_propiedades(true);


	switch($modo) {
		
		case 'button':
			
			break;

		case 'page':

			// get the thesaurus configuration in structure 
				if(!isset($properties->source_thesaurus)){
					$msg  = '<h3 class="raw_msg">Error.missing the source_thesaurus in the structure, please config it.  ';
					$msg .= $tool_tipo;
					$msg .= '</h3>';
					echo html_page::get_html($msg, true);
					exit();
				}
				$source_thesaurus = $properties->source_thesaurus;
			
			// check if the thesaurus is hierarchy_types or hierarchy_sections and select the correct config 
				$hierarchy_types_filter = false;
				if (isset($source_thesaurus->hierarchy_types)) {
					$hierarchy_types_filter = $source_thesaurus->hierarchy_types;
				}
				$hierarchy_sections_filter = false;
				if (isset($source_thesaurus->hierarchy_sections)) {
					$hierarchy_sections_filter = $source_thesaurus->hierarchy_sections;
				}
			
			// create the area_thesarurus 
				$area_thesaurus = new area_thesaurus(DEDALO_TESAURO_TIPO);

				$total_hierarchy_sections = $area_thesaurus->get_hierarchy_sections($hierarchy_types_filter, $hierarchy_sections_filter);

				$hierarchy_sections = [];

				foreach ($total_hierarchy_sections as $current_hierachy) {

					//Get permisions for the curent_hierarchy
					$hierarchy_target_section_tipo = $current_hierachy->hierarchy_target_section_tipo;
					$current_permissions = common::get_permissions( $hierarchy_target_section_tipo, $hierarchy_target_section_tipo);

					// if the user don't have permisions don't add to the final array
					if ($current_permissions<2) {
						continue;
					}

					// add the hierarchy_section_tipo and the node_type (root for the main node of the hierarchy)
					$current_hierachy->hierarchy_section_tipo 	= DEDALO_HIERARCHY_SECTION_TIPO;
					$current_hierachy->hierarchy_childrens_tipo	= DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO;
					$current_hierachy->hierarchy_node_type 		= "root";

					$hierarchy_sections[] = $current_hierachy;
				}

			// page options
				$data = new stdClass();
					$data->context_data = $this->get_context_data();
					$data->data 		= $this->get_data();

				$options = new stdClass();
					$options->data 		 			= $data;
					$options->hierarchy  			= $hierarchy_sections;
					$options->new_thesaurus_value 	= $properties->set_new_thesaurus_value;
					$options->icon_show 			= $properties->icon_show;
					$options->update_component 		= $properties->update_component;
		
				$options_json = json_encode($options);
					
				// additional js / css
					// css					
						css::$ar_url[] = DEDALO_CORE_URL."/section/css/section.css";
						css::$ar_url[] = DEDALO_CORE_URL."/component_portal/css/component_portal.css";
						css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
					// js
						js::$ar_url[]  = DEDALO_CORE_URL."/search/js/search2.js";
						js::$ar_url[]  = DEDALO_CORE_URL."/component_portal/js/component_portal.js";
						js::$ar_url[]  = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";					
						
						// render_component js
							js::$ar_url[] = DEDALO_CORE_URL."/component_input_text/js/render_component_input_text.js";
							js::$ar_url[] = DEDALO_CORE_URL."/component_portal/js/render_component_portal.js";
							js::$ar_url[] = DEDALO_CORE_URL."/component_image/js/render_component_image.js";
							js::$ar_url[] = DEDALO_CORE_URL."/component_text_area/js/render_component_text_area.js";

							// test
								if(SHOW_DEBUG===true) {
									js::$ar_url[] = DEDALO_CORE_URL."/component_select/js/render_component_select.js";
								}
									

					// ts_object 
						$element_name = 'ts_object';
						css::$ar_url[] = DEDALO_CORE_URL."/$element_name/css/$element_name.css";
						js::$ar_url[]  = DEDALO_CORE_URL."/$element_name/js/$element_name.js";

					// diffusion_index_ts
						$element_name = 'diffusion_index_ts';
						css::$ar_url[] = DEDALO_CORE_URL."/diffusion/$element_name/css/$element_name.css";
						#js::$ar_url[]  = DEDALO_CORE_URL."/$element_name/js/$element_name.js";

			break;
	}//end switch

	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_CORE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}