<?php
	
	# CONTROLLER
	$tipo 					= $this->get_tipo();
	$section_tipo 			= $this->get_section_tipo();
	$target_section_tipo	= $this->RecordObj_dd->get_parent();
	$id						= NULL;
	$mode					= $this->get_mode();
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo, $tipo);
	$html_title				= "Info about $tipo";		
	

	switch($mode) {
		
		case 'edit'	:
				break;
						
		case 'list'	:
				break;

		default: 
				return null;
	}
		
	
	$page_html = 'html/' . get_class($this) . '_' . $mode . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->mode</div>";
	}
?>