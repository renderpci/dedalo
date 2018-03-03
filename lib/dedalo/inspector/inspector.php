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
			
			#
			# LOADED COMPONENTS	
			$ar_loaded_modelos_name = array_unique(common::$ar_loaded_modelos_name);

			if(SHOW_DEBUG) {
				#$section = section::get_instance($section_id, $section_tipo);
				#$inverse_locators = null; // $section->get_inverse_locators();
			}			


			# FIXED TOOLS 
			# TOOL_RELATION
			# When component_relations is loaded, inspector load fixed tool_relation for current section record
			# Load button to open dialog tool window and list of records related to current section
			$tool_relation_button_html 	= '';
			$relation_list_html 		= '';
			if (in_array('component_relation', $ar_loaded_modelos_name)) {
				# tool_relation
				$tool_relation_button_html = '';	# DESACTIVO	#$this->get_tool_relation_button_html();
				$fixed_tools = true;
			}

			#
			# BUTTONS
			# Calculate and prepare current section buttons to use as : $this->section_obj->ar_buttons
				$ar_buttons = (array)$this->section->get_ar_buttons();
					#dump($ar_buttons['button_new'][0], ' ar_buttons ++ '.to_string());

				# Button new 
				$button_new_html = '';
				if (isset($ar_buttons['button_new'][0]) && is_object($ar_buttons['button_new'][0])) {
					$button_new_html = $ar_buttons['button_new'][0]->get_html();
				}

			#
			# PHP : Info version
			#$php_info = phpversion();

			#
			# PHP CACHE : Detect cache
			/*
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
			*/
			
			#
			# DB : Info version
			/*
			$db_info  = 'PostgreSQL ';
			$db_info .= pg_version(DBi::_getConnection())['server'];
				#dump($db_info,'$db_info');
			*/		
			break;

		case 'list'	:
		
			break;
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	include($page_html);
?>