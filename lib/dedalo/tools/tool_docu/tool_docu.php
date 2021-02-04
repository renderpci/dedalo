<?php

	# CONTROLLER TOOL DOCU

	$tipo			= $this->component_obj->get_tipo();
	$parent			= $this->component_obj->get_parent();
	$lang			= $this->component_obj->get_lang();
	$label			= $this->component_obj->get_label();
	$section_tipo	= $this->component_obj->get_section_tipo();
	$permissions	= common::get_permissions($section_tipo,$tipo);
	$component_name	= get_class($this->component_obj);
	$tool_name		= get_class($this);
	$button_row		= $this->button_row;
	$modo			= $this->get_modo();
	$file_name		= $modo;
	
	// tool css / js main files
		// css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
		// js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

	
	switch($modo) {
	
		case 'page':

			// component tipo
				$component_tipo = $_GET['component_tipo'] ?? null;
				if (empty($component_tipo)) {
					exit("Error. component_tipo is empty");
				}

			// search section_id by term_id in ontology section
				$section_id = ontology::get_section_id_by_term_id($component_tipo);
				if (empty($section_id)) {
					$section_id = ontology::add_term((object)[
						'term_id' => $component_tipo
					]);
				}
				$section_tipo = ONTOLOGY_SECTION_TIPOS['section_tipo'];

			// redirect current iframe
				header('Location: ' . DEDALO_LIB_BASE_URL . '/main/?t=' . $section_tipo . '&id=' .$section_id .'&m=edit&menu=0');
			
			exit();

			break;
		
	}//end switch
		



	// # INCLUDE FILE HTML
	// $page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	// if( !include($page_html) ) {
	// 	echo "<div class=\"error\">Invalid mode $this->modo</div>";
	// }
