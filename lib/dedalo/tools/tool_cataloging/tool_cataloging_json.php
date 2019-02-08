<?php

	# CONTROLLER TOOL_CATALOGING

	$tool_name 		= get_class($this);
	$source_list 	= $this->source_list;
	$source_thesaurus 	= $this->source_thesaurus;
	$modo 			= $this->modo;
	$file_name		= $modo;

	$tool_tipo 		= $this->button_triguer_tipo;
	$tool_label 	= label::get_label('cataloging');


	switch($modo) {
		
		case 'button':
			
			break;

		case 'page':

			$sections_to_catalog 	= $this->get_sections_to_catalog();
			$filter_html 			= $this->get_filter_html();
			$search_options 		= $this->get_search_options();

			break;		
	}//end switch

?>