<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$target_section_tipo	= $this->RecordObj_ts->get_parent();
	$id						= NULL;
	$modo					= $this->get_modo();
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo); 	
	$html_title				= "Info about $tipo";
		
	

	switch($modo) {
		
		case 'edit'	:	$ar_css		= $this->get_ar_css();	
						break;
						
		case 'list'	:	$ar_css		= false;
						break;
	}
		
	
	include('html/' . get_class($this) . '_' . $modo . '.phtml');
?>