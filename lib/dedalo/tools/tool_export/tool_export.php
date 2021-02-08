<?php



	# CONTROLLER TOOL
	$section_tipo		= $this->section_tipo;	
	$modo 				= $this->get_modo();
	$var_requested 		= common::get_request_var('context_name');
	$context_name		= !empty($var_requested) ? $var_requested : null;;	
	$tool_name 			= get_class($this);
	$file_name			= $modo;	

	
	switch($modo) {

		case 'button':
			$button_title = label::get_label('tool_export');
			# Show tool button
			/*
			$options = new stdClass();
				$options->section_tipo  = $section_tipo;
				$options->mode 			='export_list';
			$options_json = json_encode($options);
			*/
			$context_name = 'columns';
			break;

		case 'page': # Default called from main page. We will use upload as html file and script

			// tool css / js main files
				css::$ar_url[] 	= DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
				js::$ar_url[]  	= DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

			$var_requested 	= common::get_request_var('button_tipo');
			$button_tipo 	= !empty($var_requested) ? $var_requested : null;
	
			# Context
			switch ($context_name) {

				#
				# COLUMNS
				case 'columns':
					
					#array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);
					js::$ar_url[]  = DEDALO_ROOT_WEB.'/lib/jquery/grids/grids.min.js';

					$section_label = RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_APPLICATION_LANG, true, true);

					# SAVED_SEARCH_OPTIONS					
						$search_options_id 	  = $section_tipo; // section tipo like oh1
						$saved_search_options = section_records::get_search_options( $search_options_id );
						if (!isset($saved_search_options->search_query_object)) {
							$msg = '<h3 class="raw_msg">Error. search_query_object is not available.  ';
							$msg .= '<a href="'.DEDALO_LIB_BASE_URL .'/main/?t=' .$section_tipo .'">Load '.RecordObj_dd::get_termino_by_tipo($section_tipo).' ['.$section_tipo.']</a>';
							$msg .= '</h3>';
							echo html_page::get_html($msg, true);
							exit();
						}
						$search_query_object  = $saved_search_options->search_query_object;

					#
					# Current searched records stats info
					if (!$saved_search_options) {
						trigger_error("Sorry, saved_search_options [$search_options_id] not exits");						
					}
					$total_records = isset($search_query_object->full_count) ? $search_query_object->full_count : 0;
					if ($total_records<1) {
						return "Sorry, before export, navigate to section $section_label and select export option";
					}

					$source_list = $this->get_ar_columns();
					$target_list = array();//$this->get_ar_columns();

					// relation_list. Add if defined in structure
						$ar_relation_list_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['relation_list'], $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true, $ar_tipo_exclude_elements=false);
						if (!empty($ar_relation_list_tipo) && isset($ar_relation_list_tipo[0])) {
							$relation_list_tipo = $ar_relation_list_tipo[0];
							$source_list[$relation_list_tipo] = RecordObj_dd::get_termino_by_tipo($relation_list_tipo, DEDALO_APPLICATION_LANG, true, true);
						}					

					ob_start();
					include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_columns.phtml' );
					$page_content_html = ob_get_clean();
					break;


				default:
					$page_content_html = '';
			}
			break;		
	
	}#end switch modo
	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' .get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>