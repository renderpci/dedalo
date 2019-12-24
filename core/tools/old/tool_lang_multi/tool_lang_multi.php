<?php

	# CONTROLLER TOOL LANG MULTI
	
	$component_tipo 		= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$section_id 			= $parent;
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$permissions			= common::get_permissions($section_tipo,$component_tipo);
	$lang 					= $this->component_obj->get_lang();	
	$label 					= $this->component_obj->get_label();
	$traducible 			= $this->component_obj->get_traducible();
	#$section_label 			= RecordObj_dd::get_termino_by_tipo($section_tipo);		
	#$tool_locator			= DEDALO_TOOL_INVESTIGATION_SECTION_TIPO.'_'.DEDALO_TOOL_TRANSLATE_ID;//
	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;


	switch($modo) {

		case 'page':
					#
					# CSS						
						css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
					#
					# JS includes						
						js::$ar_url[]  = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

					$modelo_name = get_class($this->component_obj);				
					break;		
	}#end switch	



	# INCLUDE FILE HTML
	$page_html	= DEDALO_CORE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}

?>