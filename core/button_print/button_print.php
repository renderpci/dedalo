<?php
	
	# CONTROLLER
	$tipo 					= $this->get_tipo();
	$section_tipo 			= $this->get_section_tipo();
	$target_section_tipo	= $this->RecordObj_dd->get_parent();
	$id						= NULL;
	$modo					= $this->get_modo();
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo, $tipo);
	$html_title				= "Info about $tipo";		
	

	switch($modo) {
		
		case 'edit'	:
				break;
						
		case 'list'	:
				break;

		default: 
				return null;
	}
		
	
	$page_html = 'html/' . get_class($this) . '_' . $modo . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>