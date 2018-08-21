<?php
	
	# CONTROLLER
	$modo 			= $this->modo;
	$check_cache 	= null;
	$file_name 		= $modo;


	$section_id 	= navigator::get_selected('id');
	$section_tipo 	= $this->tipo;	//navigator::get_selected('area');
	$section_label	= RecordObj_dd::get_termino_by_tipo($section_tipo,null,true) ;#$section->get_label();

	
	$fixed_tools 	= false;

	switch($modo) {		
		
		case 'edit' :
			
			#
			# LOADED COMPONENTS	
			$ar_loaded_modelos_name = array_unique(common::$ar_loaded_modelos_name);

			if(SHOW_DEBUG) {
				#$section = section::get_instance($section_id, $section_tipo);
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

			break;

		case 'list'	:
		
			break;
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	include($page_html);
?>