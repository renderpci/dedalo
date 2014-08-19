<?php
	
	# CONTROLLER
	$modo 			= $this->modo;
	$check_cache 	= null;
	$file_name 		= $modo;	

	$section_id 	= navigator::get_selected('id');
	$section_tipo 	= navigator::get_selected('area');
	$section_label	= RecordObj_ts::get_termino_by_tipo($section_tipo) ;#$section->get_label();

		#dump($section_id,'$section_id');
		#dump($section_tipo,'$section_tipo');
	
	$fixed_tools 	= false;

	switch($modo) {		
		
		case 'edit' :

				# LOADED COMPONENTS 
				
				$ar_loaded_modelos_name = array_unique(common::$ar_loaded_modelos_name);
				#$ar_loaded_modelos = common::get_ar_loaded_modelos_resolved();	#dump($ar_loaded_modelos,'$ar_loaded_modelos');#dump(common::get_ar_loaded_modelos());


				# FIXED TOOLS 
				# TOOL_RELATION
				# When component_relations is loaded, inspector load fixed tool_relation for current section record
				# Load button to open dialog tool window and list of records related to current section
				$tool_relation_button_html 	= '';
				$relation_list_html 		= '';
				if (in_array('component_relation', $ar_loaded_modelos_name)) {
					# tool_relation
					$tool_relation_button_html = $this->get_tool_relation_button_html();
					$fixed_tools = true;
				}

				# DATA LANGS OF CURRENT SECTION
				if(empty($section_tipo)) {
					throw new Exception("Error Processing Request. Error. section_tipo undefined ! ", 1);
				}
				$section 				= new section($section_id,$section_tipo);
				$ar_all_project_langs 	= $section->get_ar_all_project_langs();

	

				# RELATION LIST OF CURRENT SECTION (FIXED)
				if(SHOW_DEBUG) $start_time = start_time();
				# List of related sections to current section
				$current_section_id_matrix 		= navigator::get_selected('id');
				# Compound rel_locator ($id_section.'.0.0';)
				$rel_locator					= component_common::build_locator_relation($current_section_id_matrix, $component_tipo=0, $tag_id=0);
				$ar_relation_reverse_records	= component_relation::get_relation_reverse_records_from_id_section( $rel_locator, $section_tipo );

				# Recorremos todos los tipos					
				foreach ($ar_relation_reverse_records as $tipo => $ar_values) {

					#$sections_text 	= implode(', ',$ar_values);
					$section_name 	= RecordObj_ts::get_termino_by_tipo($tipo,DEDALO_APPLICATION_LANG);
					$relation_list_html .= "<div class=\"title_group_relation_reverse_records text_shadow_inset\">$section_name</div>";							
					
					$section_ob = new section(NULL, $tipo, 'relation_reverse_sections');			#dump($ar_values,'$ar_values'," tipo -> $tipo");
					# le asignamos los valores al objeto
					$section_ob->ar_id_section_custom 	= $ar_values;
					$section_ob->rel_locator 			= $rel_locator;
					$section_ob->tag 					= null;
						#dump($section_ob->ar_id_section_custom,'$section_ob->ar_id_section_custom'); 
						
					$relation_list_html .= $section_ob->get_html();
						#dump($section_ob,'section_ob');							
				}
				if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, 'INSPECTOR RELATION LIST OF CURRENT SECTION'. ' ' );
				

				# PHP : Info version
				$php_info = phpversion();

				# PHP CACHE : Detect cache
				include_once( DEDALO_LIB_BASE_PATH . '/common/class.DetectOpCodeCache.php');
				$php_check_cache = DetectOpCodeCache::checkAll();

				# MYSQL : Info version
				$mysql_info = mysqli_get_server_info(DBi::_getConnection());
					#dump(DBi::_getConnection(),'DBi::_getConnection()');				

				break;

		case 'list'	:	
				$ar_css		= false;
				break;
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';			#dump($page_html,'page_html');
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);
?>