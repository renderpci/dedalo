<?php

	# CONTROLLER TOOL LANG

	$id 					= $this->component_obj->get_id();
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($tipo);

	$image_id 				= $this->component_obj->get_image_id();
	$quality 				= $this->component_obj->get_quality();
	$aditional_path 		= $this->component_obj->get_aditional_path();

	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

		#dump( $this->component_obj->get_image_path() );

	switch($modo) {	
		
		case 'button':
					#if (!file_exists( $this->component_obj->get_image_path() )) {
					#	return null;
					#}
					break;

		case 'page':
					#$js_url = DEDALO_ROOT_WEB .'/lib/jquery/jquery.fullscreen-min.js';

					# THUMB (PLAYER)
					$this->component_obj->set_modo('thumb');
					$thumb_html = $this->component_obj->get_html();
					
					$ar_quality			= unserialize(DEDALO_IMAGE_AR_QUALITY);

					$media_base_path 	= DEDALO_MEDIA_BASE_URL . DEDALO_IMAGE_FOLDER 	; //$this->component_obj->get_media_base_path(); //			
					$media_extension 	= DEDALO_IMAGE_EXTENSION ;
					break;				
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	include($page_html);	
?>