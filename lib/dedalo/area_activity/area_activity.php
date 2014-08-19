<?php
	
	# CONTROLLER	
	
	$tipo					= $this->get_tipo();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();

	$label					= $this->get_label();
	$permissions			= common::get_permissions($tipo);
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$ar_children_areas 		= $this->get_ar_children_areas();
	
	$file_name 				= $modo;

	switch($modo) {
		
		case 'list':	
				# List
				break;

	}
	
	
	# LOAD PAGE	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);
?>