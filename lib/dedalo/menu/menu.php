<?php
	
	# CONTROLLER

	$modo 				= $this->modo;
	$all_sections		= self::get_all_sections();
	$file_name			= $modo;
	

	switch($modo) {
		
		case 'edit'	:
				$file_name 	= 'list';
				break;
						
		case 'list'	:
				$file_name 	= 'list';
				break;
	}
	

	$page_html	= dirname(__FILE__) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	include($page_html);
?>