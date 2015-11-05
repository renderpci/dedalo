<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$modo					= $this->get_modo();
	$label 					= $this->get_label();
	#$debugger				= $this->get_debugger();
	$html_title				= "Info about $tipo";
	$valor					= $this->get_valor();

	# Fixed to 1
	$permissions			= 1; #common::get_permissions($tipo);
	
	switch($modo) {	

		default:			
			break;
	}		
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_'.$modo.'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>