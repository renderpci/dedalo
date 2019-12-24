<?php

	# CONTROLLER TOOL LANG

	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$component_name			= get_class($this->component_obj);
	$tool_name 				= get_class($this);

	$video_id 				= $this->component_obj->get_video_id();		#dump($this->component_obj,"video_id");
	$quality 				= $this->component_obj->get_quality();

	$modo 					= $this->get_modo();
	$file_name 				= $modo;
	
	
	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
	
	switch($modo) {	
		
		case 'button':
					#if (!file_exists( $this->component_obj->get_video_path() )) {
					#	return null;
					#}	
					break;

		case 'page':
					#
					# MEDIA PLAYER - Mode: player_stand_alone)
					$this->component_obj->set_modo('player_stand_alone');
					$player_html = $this->component_obj->get_html();
					
					$ar_quality			= unserialize(DEDALO_AV_AR_QUALITY);

					$video_base_path 	= DEDALO_MEDIA_URL . DEDALO_AV_FOLDER 	;			
					$video_extension 	= DEDALO_AV_EXTENSION;

					$ar_all_files_by_quality = $this->component_obj->get_ar_all_files_by_quality( );
						#dump($ar_all_files_by_quality, ' ar_all_files_by_quality');

					# Because components are loaded by ajax, we need prepare js/css elements from tool
					#					
					# CSS
						css::$ar_url[] = DEDALO_CORE_URL."/$component_name/css/$component_name.css";
						
					#
					# JS includes
						js::$ar_url[] = DEDALO_CORE_URL."/$component_name/js/$component_name.js";

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
	$page_html	= DEDALO_CORE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>