<?php


	# CONTROLLER TOOL

	$section_obj 		= $this->section_obj;
	$tipo 				= $section_obj->get_tipo();
	$modo 				= $this->get_modo();		
	$tool_name 			= get_class($this);
	$file_name			= $modo;

	
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
					$target_file_name = 'marc21_uploaded_file.mrc';
					# Fixed target file base path
					$target_file_path = DEDALO_MEDIA_BASE_PATH . '/import/files';
					# Full file path
					$file_final_path  = $target_file_path .'/'. $target_file_name;


				#
				# SECTION_TEMP VARS
					$user_id 			 = navigator::get_user_id();
					$target_section_tipo = $target_section_tipo = tool_import_marc21::MARC21_IMPORT_SECTION_TIPO;		

					# Layout map formatted
					$custom_layout_map = array(
											tool_import_marc21::MARC21_PROJECTS_COMPONENT_TIPO => array()		
										);	
					#dump($custom_layout_map, ' custom_layout_map ++ '.to_string());
				#
				# SECTION_TEMP FORM (Temporal section)	
					# Note that current section_id received in get url is like 'tmp1'. Section change automatically save_handler (to 'session') for manage this cases as temporal section		
					$temp_id = DEDALO_SECTION_ID_TEMP.'_'.$user_id;
					$section_temp = section::get_instance($temp_id, $target_section_tipo, 'edit');
					$layout_map = $section_temp->get_layout_map();
							
					# Add custom layout map defined in propiedades of current component portal		
					$section_temp->layout_map = $custom_layout_map;	// Inject custom layout map from 'propiedades'
					# Section config custom				
					$section_temp->show_inspector = (bool)false;					


				# Project temporal
				$this->project_dato = json_decode('{"'.DEDALO_DEFAULT_PROJECT.'":2}');				
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