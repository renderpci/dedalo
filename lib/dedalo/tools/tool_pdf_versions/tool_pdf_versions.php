<?php

	# CONTROLLER TOOL LANG

	#$id 					= $this->component_obj->get_id();
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($tipo);
	$component_name			= get_class($this->component_obj);
	$tool_name 				= get_class($this);

	$pdf_id 				= $this->component_obj->get_pdf_id();
	$quality 				= $this->component_obj->get_quality();
	$aditional_path 		= $this->component_obj->get_aditional_path();
	$initial_media_path 	= $this->component_obj->get_initial_media_path();

	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

	switch($modo) {	
		
		case 'button':
					#if (!file_exists( $this->component_obj->get_image_path() )) {
					#	return null;
					#}
					break;

		case 'page':
					#$js_url = DEDALO_ROOT_WEB .'/lib/jquery/jquery.fullscreen-min.js';

					# Because components are loaded by ajax, we need prepare js/css elements from tool
					#
					# CSS
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/css/$component_name.css";
					#
					# JS includes
						js::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/js/$component_name.js";

					# THUMB (PLAYER)
					$this->component_obj->set_modo('thumb');
					$thumb_html = $this->component_obj->get_html();

					$ar_quality			= unserialize(DEDALO_PDF_AR_QUALITY);					

					$media_base_path 	= DEDALO_MEDIA_BASE_URL . DEDALO_PDF_FOLDER;
					$media_extension 	= DEDALO_PDF_EXTENSION;
					break;				
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>