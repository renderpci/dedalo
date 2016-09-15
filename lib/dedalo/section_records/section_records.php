<?php
	
	# CONTROLLER

	$tipo					= $this->get_tipo();
	$permissions			= common::get_permissions($tipo,$tipo);
	$modo					= $this->options->modo;
	$context 				= $this->options->context;	// ??
	$file_name				= $modo;

	$cwd = basename(__DIR__);
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/$cwd/css/$cwd.css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/$cwd/js/$cwd.js";

	
	switch($modo) {

		case 'edit':

				include_once(DEDALO_LIB_BASE_PATH . '/section_records/record/class.record.php');				

				#
				# PAGINATOR HTML					
					include_once(DEDALO_LIB_BASE_PATH . '/search/records_navigator/class.records_navigator.php');
					$rows_paginator_html= '';
					$context_name 		= isset($_GET['context_name']) ? $_GET['context_name'] : false;						
					switch (true) {
						case (isset($this->options->save_handler) && $this->options->save_handler!='database'):
							# ignore paginator when save_handler is not 'database'
							break;
						case $context_name=='list_in_portal':
							# nothing to do (avoid show paginator when portal tool is opened)
							break;						
						default:
							$rows_paginator 		= new records_navigator($this->rows_obj, $modo);
							$rows_paginator_html	= $rows_paginator->get_html();
							break;
					}

				
				#
				# ROW HTML
					$record_html 	= '';
					$record 		= new record($this, $modo);
					$record_html	= $record->get_html();

				break;

		case 'list_tm':

				$file_name='list';

		case 'list':

				include_once(DEDALO_LIB_BASE_PATH . '/section_records/rows_header/class.rows_header.php');
				include_once(DEDALO_LIB_BASE_PATH . '/section_records/rows/class.rows.php');
			
				$section_list_tipo = key($this->rows_obj->options->layout_map);	
				
				/*
				$tool_update_cache = new tool_update_cache($tipo);
				$tool_update_cache->update_cache();
				if(SHOW_DEBUG) {					
					#dump(tool_update_cache::$debug_response,'$tool_update_cache->debug_response');					
				}
				*/
				
				# BUTTON DELETE				
				if (!$this->button_delete_permissions) {
					$ar_children_tipo_by_modelo_name_in_section = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo, 'button_delete', $from_cache=true, $resolve_virtual=true); //$section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false
					# dump($ar_children_tipo_by_modelo_name_in_section, ' ar_children_tipo_by_modelo_name_in_section ++ '.to_string($this->tipo));
					if (!empty($ar_children_tipo_by_modelo_name_in_section[0])) {

						$current_button_tipo = $ar_children_tipo_by_modelo_name_in_section[0];					
						#dump($ar_children_tipo_by_modelo_name_in_section[0], ',$ar_children_tipo_by_modelo_name_in_section[0] ++ '.to_string());						
						$this->button_delete_permissions = security::get_security_permissions( $tipo, $current_button_tipo);
					}
				}
				#dump($file_name, ' file_name ++ '.to_string());
				
				#dump($this);
				#dump($button_delete_permissions," button_delete_permissions");
				if(SHOW_DEBUG) {
					#dump($this->rows_obj->result,"this");
				}
				
					/*	if (empty($this->rows_obj->result)) {
							echo "<div class=\"no_results_msg\">No results found</div>";
							if(SHOW_DEBUG) {
								#dump($this->rows_obj->strQuery,"DEBUG: No results found whit this query");
								#echo "DEBUG: No results found whit this query: ";
								echo "<blockquote><pre>".$this->rows_obj->strQuery."</pre></blockquote>";
							}					
							return;
						}
					*/	
				# BUILD ALL HTML ROWS (PAGINATOR, TH, TD)				
				#$rows_search_html		= '';
					
				#
				# PAGINATOR HTML
					$records_data 			= $this->rows_obj;
					$rows_paginator 		= new records_navigator($records_data, $modo);
					$rows_paginator_html	= $rows_paginator->get_html();
				
				#
				# ROWS TABLE HTML
					
					# HEADER HTML (TH)
					$rows_header 			= new rows_header($this, $modo);
					$rows_header_html		= $rows_header->get_html();

					# ROWS HTML (TD)
					$rows 					= new rows($this, $modo);
					$rows_html				= $rows->get_html();
			
				
				if (isset($_REQUEST['m']) && $_REQUEST['m']!='list') {
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

				# ACTIVITY DEDALO_ACTIVITY_SECTION_TIPO
					if ($tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
						$file_name = 'list_activity';
					}
				
				break;

		case 'list_thesaurus':

				#include_once(DEDALO_LIB_BASE_PATH . '/section_records/rows_header/class.rows_header.php');
				include_once(DEDALO_LIB_BASE_PATH . '/section_records/rows/class.rows.php');
			
				$section_list_tipo = key($this->rows_obj->options->layout_map);				
				
				#
				# ROWS TABLE HTML
					
					# HEADER HTML (TH)
					#$rows_header 			= new rows_header($this, $modo);
					#$rows_header_html		= $rows_header->get_html();
					$rows_header_html 		= $this->options->rows_header_html;
				

					# ROWS HTML (TD)
					$rows 					= new rows($this, $modo);
					$rows_html				= $rows->get_html();
				
				break;

	}//end switch($modo)

	


	# LOAD PAGE	
	$page_html	= 'html/' . get_class($this) . '_' . $file_name . '.phtml';		#dump($page_html);
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $modo</div>";
	}
	
?>