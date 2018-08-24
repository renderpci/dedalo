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
			#$ar_loaded_modelos_name = array_unique(common::$ar_loaded_modelos_name);

			if(SHOW_DEBUG) {
				#$section = section::get_instance($section_id, $section_tipo);
			}			


			# FIXED TOOLS 
			# TOOL_RELATION
			# When component_relations is loaded, inspector load fixed tool_relation for current section record
			# Load button to open dialog tool window and list of records related to current section
			#$relation_list_html 	= $this->get_relation_list_button_html();
			$section_id 		= $this->section->get_section_id();

			$relation_list_button_html = '';
			$relation_list_tipo = $this->get_relation_list();
			if($relation_list_tipo){
				$relation_list 		= new relation_list($relation_list_tipo, $section_id, $section_tipo, $modo='button');
				$relation_list_button_html = $relation_list->get_html();
			}
			

			
			

			//dump($relation_list,'$relation_list_button_html');

			//$relation_list_name = RecordObj_dd::get_termino_by_tipo($relation_list,DEDALO_APPLICATION_LANG, true);

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