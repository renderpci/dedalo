<?php

	# CONTROLLER TOOL_QR
	
	$tool_name		= get_class($this);	
	$modo			= $this->get_modo();
	$file_name		= $modo;


	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


	switch($modo) {
	
		case 'button':
			
			break;
		
		case 'page':

			$metadata_options = defined('DEDALO_IMAGE_METADATA_OPTIONS')
				? DEDALO_IMAGE_METADATA_OPTIONS
				: [
					[
						'name'	=> 'creator',
						'value'	=> ''
					],
					[
						'name'	=> 'title',
						'value'	=> ''
					],
					[
						'name'	=> 'source',
						'value'	=> ''
					],
					[
						'name'	=> 'copyright',
						'value'	=> ''
					],
					[
						'name'	=> 'rights',
						'value'	=> ''
					]				
				];
			$extensions = ['jpg'];
			break;		
	}//end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}