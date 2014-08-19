<?php

	# CONTROLLER TOOL LANG

	$id 					= $this->component_obj->get_id();
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($tipo);

	$video_id 				= $this->component_obj->get_video_id();
	$quality 				= $this->component_obj->get_quality();

	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

		#dump($this->component_obj);

	switch($modo) {	
		
		case 'button':
					#if (!file_exists( $this->component_obj->get_video_path() )) {
					#	return null;
					#}	
					break;

		case 'page':
					# MEDIA (PLAYER)
					$this->component_obj->set_modo('player_stand_alone');
					$player_html = $this->component_obj->get_html();
					
					$ar_quality			= unserialize(DEDALO_AV_AR_QUALITY);

					$video_base_path 	= DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER 	;			
					$video_extension 	= DEDALO_AV_EXTENSION;

					# HEADER TOOL
					$this->set_modo('header');
					$header_html 	= $this->get_html();
					$this->set_modo('page');

					break;

		case 'header':
					# Creamos un componente state
					# Desactivo para este componente de momento
					return null;
					break;			
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	include($page_html);	
?>