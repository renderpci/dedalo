<?php

	# CONTROLLER TOOL_ADD_COMPONENT_DATA

	$component_tipo 		= $this->component_obj->get_tipo();
	$section_id 			= $this->component_obj->get_parent();
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$traducible 			= $this->component_obj->get_traducible();	
	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$valor 					=  $this->component_obj->get_valor();
	$file_name 				= $modo;


	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

	switch($modo) {
		
	
		case 'button':
					
					$line_lenght = 90;	// Default value is 90

					break;
		
		case 'page':
					$total_records = (int)$this->search_options->search_query_object->full_count;

					$user_id 			= navigator::get_user_id();
					$temp_id 			= DEDALO_SECTION_ID_TEMP.'_'.$section_id.'_'.$user_id;

					$temp_section = section::get_instance($temp_id, $section_tipo, 'edit');

					# Layout map formatted
					$custom_layout_map = array();
					$custom_layout_map[$component_tipo] = array();
				
					# Add custom layout map of current component
					if (!empty($custom_layout_map)) {
						$temp_section->layout_map = $custom_layout_map;	// Inject custom layout map
					}		
					$temp_section->show_inspector = (bool)false;

					$temp_section_html = $temp_section->get_html();

					#$this->propagate_data();	
					break;
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>