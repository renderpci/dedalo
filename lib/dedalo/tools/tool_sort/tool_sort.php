<?php

	# CONTROLLER TOOL_CATALOGING

	$tool_name 			= get_class($this);
	$modo 				= $this->modo;
	$file_name			= $modo;	
	$tool_label 		= label::get_label($tool_name);


	switch($modo) {
		
		case 'button':
			
			break;

		case 'page':

			/*
				// page options
					$data = new stdClass();
						$data->context_data = $this->get_context_data();
						$data->data 		= $this->get_data();

					$options = new stdClass();
						$options->data 		 			= $data;
						#$options->hierarchy  			= $hierarchy_sections;
						#$options->new_thesaurus_value 	= $properties->set_new_thesaurus_value;
						#$options->icon_show 			= $properties->icon_show;
						#$options->update_component 	= $properties->update_component;
			
					$options_json = json_encode($options);
					

					// additional js / css
						// css					
							css::$ar_url[] = DEDALO_LIB_BASE_URL."/section/css/section.css";
							css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_portal/css/component_portal.css";
							css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
						// js
							js::$ar_url[]  = DEDALO_LIB_BASE_URL."/search/js/search2.js";
							js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_portal/js/component_portal.js";
							js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";					
							
							// render_component js
								js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_input_text/js/render_component_input_text.js";
								js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_portal/js/render_component_portal.js";
								js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_image/js/render_component_image.js";
								js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_text_area/js/render_component_text_area.js";

								// test
									if(SHOW_DEBUG===true) {
										js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_select/js/render_component_select.js";
									}

						# // ts_object 
						# 	$element_name = 'ts_object';
						# 	css::$ar_url[] = DEDALO_LIB_BASE_URL."/$element_name/css/$element_name.css";
						# 	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";
						# 
						# // diffusion_index_ts
						# 	$element_name = 'diffusion_index_ts';
						# 	css::$ar_url[] = DEDALO_LIB_BASE_URL."/diffusion/$element_name/css/$element_name.css";
						# 	#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$element_name/js/$element_name.js";
					*/

			// source portal
				$source_component_obj = $this->component_obj;
				$source_html 		  = $source_component_obj->get_html();

			// target portal
				$target_modelo_name   = RecordObj_dd::get_modelo_name_by_tipo($this->target_component_tipo,true);
				$target_component_obj = component_common::get_instance( $target_modelo_name,
																		$this->target_component_tipo,
																		$source_component_obj->get_parent(),
																		$source_component_obj->get_modo(),
																		DEDALO_DATA_LANG,
																		$source_component_obj->get_section_tipo() );
				$target_html 		  = $target_component_obj->get_html();


			// additional js / css
				// css	
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_portal/css/component_portal.css";
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_image/css/component_image.css";
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_input_text/css/component_input_text.css";
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
				// js
				js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_portal/js/render_component_portal.js";
				js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_image/js/render_component_image.js";
				js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_input_text/js/render_component_input_text.js";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
			

			break;
	}//end switch

	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}