<?php

	# CONTROLLER TOOL LANG

	$tipo 					= $this->get_tipo();
	$section_id				= $this->get_parent();
	$lang 					= $this->get_lang();
	$label 					= $this->get_label();
	$section_tipo 			= $this->get_section_tipo();
	// $permissions			= common::get_permissions($section_tipo,$tipo);
	$component_name			= get_class($this);
	$name 					= get_class($this);
	// $target_section_tipo 	= $this->target_section_tipo;
	$modo 					= $this->get_modo();
	$file_name 				= $modo;
	$propiedades 			= $this->get_propiedades();
	$row_locator 			= $this->get_row_locator();
	$dato 					= isset($row_locator->ds) ? $row_locator->ds : null;


	# TOOL CSS / JS MAIN FILES
	// loaded by the portal or autocomplete
	// css::$ar_url[] = DEDALO_LIB_BASE_URL."/".$name."/css/".$name.".css";
	// js::$ar_url[]  = DEDALO_LIB_BASE_URL."/".$name."/js/".$name.".js";

	
	switch($modo) {	
				
		case 'edit':
			$semantic_wrapper_id = $tipo.'_'.$row_locator->section_tipo.'_'.$row_locator->section_id;

			$hierarchy_types = isset($propiedades->source->hierarchy_types)
				? $propiedades->source->hierarchy_types
				: [4];

			$hierarchy_types_string = json_encode($hierarchy_types);


			break;

		case 'search':
			$semantic_wrapper_id = $tipo.'_'.$modo;

			$hierarchy_types = isset($propiedades->source->hierarchy_types)
				? $propiedades->source->hierarchy_types
				: [4];

			$hierarchy_types_string = json_encode($hierarchy_types);


			break;
		
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}