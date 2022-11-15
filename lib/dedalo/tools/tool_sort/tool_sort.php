<?php

	# CONTROLLER TOOL_CATALOGING

	$tool_name 			= get_class($this);
	$modo 				= $this->modo;
	$file_name			= $modo;
	$tool_label 		= label::get_label($tool_name);

	#$section_tipo 	= $this->section_tipo;
	#$section_id 	= $this->section_id;
	$tool_name		= get_class($this);
	#$section_label	= RecordObj_dd::get_termino_by_tipo($section_tipo);
	#$tool_tipo		= $this->get_tool_tipo();

	$section_tipo 	= $this->component_obj->get_section_tipo();
	$section_id 	= $this->component_obj->get_parent();


	switch($modo) {

		case 'button':

			break;

		case 'page':

				// additional js / css
					// css
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/section/css/section.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_portal/css/component_portal.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_image/css/component_image.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_input_text/css/component_input_text.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_text_area/css/component_text_area.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_number/css/component_number.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_relation_related/css/component_relation_related.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_autocomplete/css/component_autocomplete.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
					// js
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/search/js/search2.js";
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_portal/js/component_portal.js";
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

						// render_component js
							js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_portal/js/render_component_portal.js";
							js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_image/js/render_component_image.js";
							js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_input_text/js/render_component_input_text.js";
							js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_number/js/render_component_number.js";
							js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_relation_related/js/render_component_relation_related.js";
							js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_autocomplete/js/render_component_autocomplete.js";
							js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_autocomplete_hi/js/render_component_autocomplete_hi.js";
							js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_section_id/js/render_component_section_id.js";
							js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_text_area/js/render_component_text_area.js";

				//// additional js / css
				//	// css
				//	css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_portal/css/component_portal.css";
				//	css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_image/css/component_image.css";
				//	css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_input_text/css/component_input_text.css";
				//	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
				//	// js
				//	js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_portal/js/render_component_portal.js";
				//	js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_image/js/render_component_image.js";
				//	js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_input_text/js/render_component_input_text.js";
				//	js::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


			// source component
			 	$source_component_obj = $this->component_obj;
			// 		$context = new stdClass();
			// 			$context->context_name = 'tool_sort';
			// 		$source_component_obj->set_context($context);
			//
 			// 	$source_html 		  = $source_component_obj->get_html();
			//


			// section info
			 	#$section_tipo 	= $source_component_obj->get_section_tipo();
 				#$section_id 	= $source_component_obj->get_parent();
				$section_label  = RecordObj_dd::get_termino_by_tipo($section_tipo,DEDALO_APPLICATION_LANG);


			// target portal
				$target_modelo_name   = RecordObj_dd::get_modelo_name_by_tipo($this->target_component_tipo,true);
				$target_component_obj = component_common::get_instance( $target_modelo_name,
																		$this->target_component_tipo,
																		$source_component_obj->get_parent(),
																		$source_component_obj->get_modo(),
																		DEDALO_DATA_LANG,
																		$source_component_obj->get_section_tipo() );
				$target_html 		  = $target_component_obj->get_html();



			// target records to check if already used
				$target_dato = $target_component_obj->get_dato();
				$sub_target_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($this->sub_target_component_tipo,true);
				$ar_used_section_id_box = [];
				foreach ($target_dato as $current_locator) {

					$sub_target_component = component_common::get_instance( $sub_target_modelo_name,
																			$this->sub_target_component_tipo,
																			$current_locator->section_id,
																			'list',
																			DEDALO_DATA_LANG,
																			$current_locator->section_tipo );
					$sub_target_dato = $sub_target_component->get_dato();
						#dump($sub_target_dato, ' sub_target_dato ++ '.to_string());
					foreach ($sub_target_dato as $current_dato) {
						$ar_used_section_id_box[] = $current_dato->section_id;
					}
				}
				$ar_used_section_id = array_values( array_unique($ar_used_section_id_box) );



			// datum
				$datum = new stdClass();
					$datum->context_data = $this->get_context_data();
					$datum->data 		 = $this->get_data();
						#dump($datum, ' datum ++ '.to_string());



			// options init
				$options = new stdClass();
					$options->datum 		 			= $datum;
					# other options
					$options->source_component_tipo		= $source_component_obj->get_tipo();
					$options->target_component_tipo		= $target_component_obj->get_tipo();
					$options->sub_target_component_tipo	= $this->sub_target_component_tipo;
					$options->ar_used_section_id 		= $ar_used_section_id;
					$options->custom_order 				= $this->tool_properties->source_order;

				$options_json = json_encode($options);


			break;
	}//end switch




	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}