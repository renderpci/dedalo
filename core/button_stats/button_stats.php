<?php
	
	# CONTROLLER
	
	$tipo 					= $this->get_tipo();
	$context_tipo			= $this->get_context_tipo();
	$section_tipo			= $this->get_section_tipo();
	$id						= NULL;
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();

	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo, $tipo);
	$html_title				= "Info about $tipo";	
	$file_name 				= $modo;

	# CSS / JS MAIN FILES
	css::$ar_url[] = NVD3_URL_CSS;
	css::$ar_url[] = DEDALO_CORE_URL."/diffusion/diffusion_section_stats/css/diffusion_section_stats.css";	
	
	js::$ar_url[]  = D3_URL_JS;
	js::$ar_url[]  = NVD3_URL_JS;
	js::$ar_url[]  = DEDALO_CORE_URL."/diffusion/diffusion_section_stats/js/diffusion_section_stats.js";

	switch($modo) {		
						
		case 'list'	:	
				break;

		case 'edit'	:
				return null;
				break;

		default:
				return null;
	}
		
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>