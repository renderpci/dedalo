<?php

	# CONTROLLER TOOL TRANSCRIPTION

	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$section_id 			= $parent;
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$section_label 			= RecordObj_dd::get_termino_by_tipo($section_tipo);
	$component_name			= get_class($this->component_obj);
	$tool_locator			= DEDALO_TOOL_INVESTIGATION_SECTION_TIPO.'_'.DEDALO_TOOL_TRANSCRIPTION_ID;//
	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;


	switch($modo) {	
		
		case 'button':
				
				break;

		case 'page':

				# TOOL CSS / JS MAIN FILES			
				css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";			
				js::$ar_url[]  = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

				$properties = $this->component_obj->get_properties();
					dump($properties, ' $properties ++ '.to_string());


				# INVERSE_CODE
					$inverse_code = tool_common::get_inverse_element('code', $parent, $section_tipo);

				# AUTOCOMPLETE_HI


				
				break;		
	}#end switch		


	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_CORE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
	
?>