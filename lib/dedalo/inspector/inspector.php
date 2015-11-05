<?php
	
	# CONTROLLER
	$modo 			= $this->modo;
	$check_cache 	= null;
	$file_name 		= $modo;


	$section_id 	= navigator::get_selected('id');
	$section_tipo 	= $this->tipo;	//navigator::get_selected('area');
	$section_label	= RecordObj_dd::get_termino_by_tipo($section_tipo,null,true) ;#$section->get_label();

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
					$tool_relation_button_html = '';	# DESACTIVO	#$this->get_tool_relation_button_html();	#
					$fixed_tools = true;
				}

				# DATA LANGS OF CURRENT SECTION
				/*
				if(empty($section_tipo)) {
					if(SHOW_DEBUG) {
						throw new Exception("Error Processing Request. Error. section_tipo undefined ! ", 1);
					}
					die("Error. section_tipo undefined !");					
				}else
				if (empty($section_id) || $section_id=='scalar') {
					if(SHOW_DEBUG) {
						throw new Exception("Error Processing Request. Error. section_id is wrog ! section_id:'$section_id' ", 1);
					}
					die("Error. section_id is wrog !");		
				}else{
						#dump($section_tipo, ' section_id '.$section_id);
					$section 				= section::get_instance($section_id,$section_tipo);
					$ar_all_project_langs 	= $section->get_ar_all_project_langs();
				}
				*/

	
				# exit("Opción desactiva momentáneamente"); # INVIABLE CALCULARLO (0.480 secs) Haremos un track de las referencias en la sección y sacaremos de ahí el dato resuelto
				/*
				# RELATION LIST OF CURRENT SECTION (FIXED)
				if(SHOW_DEBUG) $start_time = start_time();

					# List of related sections to current section
					$current_section_id_matrix 		= navigator::get_selected('id');
					# Compound rel_locator ($id_section.'.0.0';)
					$rel_locator					= component_common::build_locator_relation($current_section_id_matrix, $component_tipo=0, $tag_id=0);
						
						$options = new stdClass;
							$options->to_find 				= $rel_locator;
							$options->filter_by_modelo_name = 'component_relation';
							$options->tipo 					= $section_tipo;

						$ar_relation_reverse_records	= common::get_references($options);
							#dump($ar_relation_reverse_records,'$ar_relation_reverse_records');
						
						$relation_list_html = '';
						if(!empty($ar_relation_reverse_records)) {
							$relation_list_html .= "\n<div class=\"relaciones_list_title\">" . label::get_label('etiqueta')." $tag_id</div>";
							
							foreach ($ar_relation_reverse_records as $current_section_id => $current_section_tipo) {
								
								$section_name 	= RecordObj_dd::get_termino_by_tipo($current_section_tipo,DEDALO_APPLICATION_LANG,true);
								$relation_list_html .= "<div class=\"title_group_relation_reverse_records text_shadow_inset\">$section_name</div>";
								
								$section_ob 		= section::get_instance($current_section_id, $current_section_tipo, 'relation_reverse');
								# le asignamos los valores al objeto section
								$section_ob->ar_id_section_custom 	= $ar_relation_reverse_records;
								$section_ob->rel_locator 			= $rel_locator;
								$section_ob->tag 					= null;
									#dump($section_ob->ar_id_section_custom,'$section_ob->ar_id_section_custom'

								$relation_list_html .= $section_ob->get_html();
							}
						}
				
				#if(SHOW_DEBUG) $GLOBALS['log_messages'] .= exec_time($start_time, 'INSPECTOR RELATION LIST OF CURRENT SECTION'. ' ' );
				*/

				#
				# PHP : Info version
				$php_info = phpversion();

				#
				# PHP CACHE : Detect cache
				$php_check_cache = 'none';
				if(SHOW_DEBUG) {
					include_once( DEDALO_LIB_BASE_PATH . '/common/class.DetectOpCodeCache.php');				
					$ar_cache_type = array(
						'hasOpCode',
						'hasApc',
						'hasEaccelerator',
						'hasIoncube',
						'hasZend',
						'hasNusphere'
						);
					foreach ($ar_cache_type as $current_function) {					
						$check_cache = \DetectOpCodeCache\DetectOpCodeCache::$current_function();
						if ($check_cache) {
							$php_check_cache = substr($current_function, 3);
							break;
						}
					}
					#dump($php_check_cache, ' php_check_cache'); die();
				}
				
				
				#
				# DB : Info version
				$db_info  = 'PostgreSQL ';
				$db_info .= pg_version(DBi::_getConnection())['server'];
					#dump($db_info,'$db_info');				
				break;

		case 'list'	:	
				$ar_css		= false;
				break;
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	include($page_html);
?>