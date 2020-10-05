<?php

	# CONTROLLER TOOL_QR
	
	$tool_name		= get_class($this);	
	$modo			= $this->get_modo();
	$section_tipo 	= $this->section_tipo;
	$file_name		= $modo;


	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


	switch($modo) {
	
		case 'button':
			
			break;
		
		case 'page':

			// info from button trigger (received in request)
				$button_tipo = $_REQUEST['button_tipo'];				

			// saved_search_options					
				$search_options_id		= $section_tipo; // section tipo like oh1
				$saved_search_options	= section_records::get_search_options( $search_options_id );
				if (!isset($saved_search_options->search_query_object)) {
					$msg = '<h3 class="raw_msg">Error. search_query_object is not available.  ';
					$msg .= '<a href="'.DEDALO_LIB_BASE_URL .'/main/?t=' .$section_tipo .'">Load '.RecordObj_dd::get_termino_by_tipo($section_tipo).' ['.$section_tipo.']</a>';
					$msg .= '</h3>';
					echo html_page::get_html($msg, true);
					exit();
				}
				$search_query_object = $saved_search_options->search_query_object;
				
				// Current searched records stats info
					if (!$saved_search_options) {
						trigger_error("Sorry, saved_search_options [$search_options_id] not exits");
					}
					$total_records = isset($search_query_object->full_count) ? $search_query_object->full_count : 0;
					if ($total_records<1) {
						return "Sorry, before set metadata, navigate to section $section_label and then select metadata option";
					}

			// quality available
				$ar_quality = unserialize(DEDALO_IMAGE_AR_QUALITY);

			// metadata_options
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

			// extensions
				$extensions = ['jpg'];
			break;		
	}//end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}