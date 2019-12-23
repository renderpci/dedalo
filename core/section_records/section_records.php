<?php
	
	# CONTROLLER

	$tipo					= $this->get_tipo();
	$permissions			= common::get_permissions($tipo,$tipo);
	$search_options 		= $this->search_options;
	$modo					= $search_options->modo;
	$context 				= $search_options->context;	// ??
	$file_name				= $modo;
	$records_data 			= $this->records_data;
	$search_query_object 	= $search_options->search_query_object;
	$section_tipo 			= $search_query_object->section_tipo;
	
	# Add section records self css/js libs
	$cwd = basename(__DIR__);
	#css::$ar_url[] = DEDALO_LIB_BASE_URL."/$cwd/css/$cwd.css";
	#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$cwd/js/$cwd.js";


	# SEARCH_OPTIONS_JSON
	# Ecode options JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES 
	$search_options_json = json_encode($search_options);
	
	
	switch($modo) {

		case 'edit':

				#
				# PAGINATOR HTML
					include_once(DEDALO_LIB_BASE_PATH . '/search/records_navigator/class.records_navigator.php');
					$rows_paginator_html= '';

					// CONTEXT
					$context_name = common::get_request_var('context_name');

					switch (true) {
						case (isset($search_options->save_handler) && $this->search_options->save_handler!=='database'):
							# ignore paginator when save_handler is not 'database'
							break;
						case $context_name==='list_in_portal':
							# nothing to do (avoid show paginator when portal tool is opened)
							break;						
						default:	
							$rows_paginator 	 = new records_navigator($search_query_object, $modo, $context, null);
							$rows_paginator_html = $rows_paginator->get_html();
							break;
					}

				
				#
				# ROW HTML
					include_once(DEDALO_LIB_BASE_PATH . '/section_records/record/class.record.php');
					$record_html 	= '';
					$record 		= new record($this, $modo);
					$record_html	= $record->get_html();
				break;

		case 'list_tm':

				$file_name = 'list';

		case 'list':
				
				# Section list propiedades
				# Fix section_list propiedades (for use later)				
				$propiedades  		= null;
				$section_list_tipo 	= null;
				$ar_section_list = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, 'section_list');
				if (!empty($ar_section_list[0])) {
					$section_list_tipo = $ar_section_list[0];
					$RecordObj_dd = new RecordObj_dd($section_list_tipo);
					$propiedades  = json_decode($RecordObj_dd->get_propiedades());
				}
				$this->section_list_tipo = $section_list_tipo;
				$this->propiedades 		 = $propiedades;
				

				# Add list specific controllers
				#include(DEDALO_LIB_BASE_PATH . '/section_records/rows_header/class.rows_header.php');
				include(DEDALO_LIB_BASE_PATH . '/section_records/rows/class.rows.php');
				
				#			
				# BUTTON DELETE 
					if (!$this->button_delete_permissions) {
						$ar_children_tipo_by_modelo_name_in_section = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo, 'button_delete', $from_cache=true, $resolve_virtual=true);
						if (!empty($ar_children_tipo_by_modelo_name_in_section[0])) {
							// Set current button_delete
							$current_button_tipo = $ar_children_tipo_by_modelo_name_in_section[0];
							$this->button_delete = new button_delete($current_button_tipo,null,$tipo);
							$this->button_delete_permissions = security::get_security_permissions( $tipo, $current_button_tipo);
						}
					}	
					
				#
				# PAGINATOR HTML
					$rows_paginator 	 = new records_navigator($search_query_object, $modo, $context, $propiedades);
					$rows_paginator_html = $rows_paginator->get_html();					
				
				#
				# ROWS TABLE HTML
					
					# HEADER HTML (TH)
					#$rows_header 			= new rows_header($this, $modo);
					#$rows_header_html		= $rows_header->get_html();
					$rows_header_html = '';
					if (!empty($records_data->ar_records)) {
						ob_start();
						include(dirname(__FILE__) . '/rows_header/rows_header.php' );
						$rows_header_html = ob_get_clean();
					}					
					

					# ROWS HTML (TD)
					$rows 		= new rows($this, $modo);
					$rows_html	= $rows->get_html();

				
				#
				# ADDITIONAL CSS/JS
				if (common::get_request_var('m')!=='list') {
					# Nothing to load
				}else{
					#
					# CSS
						css::$ar_url[] = NVD3_URL_CSS;
						css::$ar_url[] = DEDALO_LIB_BASE_URL.'/diffusion/diffusion_section_stats/css/diffusion_section_stats.css';

					#
					# JS includes
						js::$ar_url[] = D3_URL_JS;
						js::$ar_url[] = NVD3_URL_JS;
						js::$ar_url[] = DEDALO_LIB_BASE_URL.'/diffusion/diffusion_section_stats/js/diffusion_section_stats.js';
						#js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/jquery/jquery.resizableColumns.min.js';
						#js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/store.js-master/store.min.js';
				}


				#
				# ACTIVITY DEDALO_ACTIVITY_SECTION_TIPO
					#if ($tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
					#	$file_name = 'list_activity';
					#}
				
				break;

	}//end switch($modo)

	


	# LOAD PAGE	
	$page_html	= 'html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $modo</div>";
	}	
?>