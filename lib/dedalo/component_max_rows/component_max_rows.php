<?php
	
	# CONTROLLER

	$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo); 	
	$html_title				= "Info about $id";
	$valor					= $this->get_valor();
		
	
	switch($modo) {		
		
		default:	$ar_css		= false;		
					break;					
						
	}		
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_search.phtml';
	include($page_html);
	
?>