<?php

	# CONTROLLER TOOL SECTION

	$tool_name 		= get_class($this);
	$section_tipo 	= $this->section_tipo;
	$section_id 	= $this->section_id;
	$modo 			= $this->modo;
	$file_name		= $modo;
	$tool_name		= get_class($this);
	$section_label	= RecordObj_dd::get_termino_by_tipo($section_tipo);
	$tool_tipo		= $this->get_tool_tipo();


/*
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
*/

	switch($modo) {
		
		case 'button':
			$contain_references = search_development2::have_inverse_relations($section_tipo, $section_id);
			break;

		case 'page':

			$ar_elements = $this->get_ar_elements();

			$section_groups = array_filter($ar_elements, function($element){
				return ($element->model==='section_group');
			});

			$ar_components = array_filter($ar_elements, function($element){
				return strpos($element->model, 'component_')!==false;
			});
			
			# Propiedaes
			$RecordObj_dd 	= new RecordObj_dd($tool_tipo);
			$propiedades 	= json_decode($RecordObj_dd->get_propiedades());
				#dump($propiedades, ' propiedades ++ '.to_string());				

			# TOOL CSS / JS MAIN FILES			
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


			# CUSTOM_CSS_FILE_PATH
			# To specify a custom css file for manage current tool css, create a css file named like 'numisdata201.css' (tool_tipo.css) in tool css dir
			#$custom_css_file_path = DEDALO_LIB_BASE_PATH.'/tools/'.$tool_name.'/css/'.$tool_tipo.'.css';
			#if (file_exists($custom_css_file_path)) {
			#	css::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/'.$tool_name.'/css/'.$tool_tipo.'.css';
			#}

			# Inverse_code
				$inverse_code = tool_common::get_inverse_element('code', $section_id, $section_tipo);
	
			# skip_components
				$skip_components = isset($propiedades->context->skip_components) ? (array)$propiedades->context->skip_components : [];

			break;		
	}//end switch

	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}

?>