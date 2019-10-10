<?php


	# CONTROLLER TOOL

	$section_obj 		= $this->section_obj;
	$section_tipo 		= $this->section_tipo; //$section_obj->get_tipo();
	$modo 				= $this->get_modo();
	$button_import_tipo	= $this->button_import_tipo;
	$tool_name 			= get_class($this);
	$file_name			= $modo;
	$temp_section_id 	= $this->get_temp_section_id();

	
	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


	switch($modo) {

		case 'page': # Default called from main page. We will use upload as html file and script				

				# JS adds
					js::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_common/js/dedalo_upload.js';
				

				#
				# FILE
					# Fixed target filename
					$target_file_name = 'kml_uploaded_file.kml';
					# Fixed target file base path
					$target_file_path = DEDALO_MEDIA_BASE_PATH . '/import/files';
					# Full file path
					$file_final_path  = $target_file_path .'/'. $target_file_name;


				#
				# SECTION_TEMP VARS

					# Layout map formatted
					$custom_layout_map = array();
					foreach ((array)$this->button_import_propiedades->layout as $current_component_tipo) {
						$custom_layout_map[$current_component_tipo] = array();
					}	
					#dump($custom_layout_map, ' custom_layout_map ++ '.to_string()); die();
				#
				# SECTION_TEMP FORM (Temporal section)	
					# Note that current section_id received in get url is like 'tmp1'. Section change automatically save_handler (to 'session') for manage this cases as temporal section		
					$section_temp = section::get_instance($temp_section_id, $section_tipo, 'edit');
					$layout_map = $section_temp->get_layout_map();
							
					# Add custom layout map defined in propiedades of current component portal		
					$section_temp->layout_map = $custom_layout_map;	// Inject custom layout map from 'propiedades'
					# Section config custom				
					$section_temp->show_inspector = (bool)false;					


				# Project temporal value
				$filter_locator = new locator();
					$filter_locator->set_section_tipo(DEDALO_FILTER_SECTION_TIPO_DEFAULT);
					$filter_locator->set_section_id(DEDALO_DEFAULT_PROJECT);
					$filter_locator->set_type(DEDALO_RELATION_TYPE_FILTER);
					$filter_locator->set_from_component_tipo($component_tipo);
				$project_dato 		= [$filter_locator];
				$this->project_dato = $project_dato;
				break;

		case 'upload':

				break; #end modo page / upload

		case 'preview':
			
				break; #end modo preview

		case 'process':
			
				break; #end modo process

		case 'report':
			
				break; #end modo report
		
	}#end switch modo
	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' .get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>