<?php



	# CONTROLLER TOOL
	$section_tipo		= $this->section_tipo;	
	$modo 				= $this->get_modo();
	$var_requested 		= common::get_request_var('context_name');
	$context_name		= !empty($var_requested) ? $var_requested : null;;	
	//$context_name		= isset($_REQUEST['context_name']) ? $_REQUEST['context_name'] : null;;	
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

			# TOOL CSS / JS MAIN FILES
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

			$var_requested 		= common::get_request_var('button_tipo');

			//$button_tipo = isset($_GET['button_tipo']) ? $_REQUEST['button_tipo'] : null;
			$button_tipo = !empty($var_requested) ? $var_requested : null;

			# Context
			switch ($context_name) {

				#
				# COLUMNS
				case 'columns':

					#css::$ar_url[] = BOOTSTRAP_CSS_URL;
					array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);
					js::$ar_url[]  = DEDALO_ROOT_WEB.'/lib/jquery/grids/grids.min.js';

					$section_label = RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_APPLICATION_LANG, true, true);

					#
					# Current searched records stats info
					$search_options_session_key = 'section_'.$section_tipo;
					if (!isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
						trigger_error("Sorry, search_options_session_key [$search_options_session_key] not exits in session");						
					}
					$total_records = isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->full_count) ? $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->full_count : 0;
						#dump($options_search, ' options_search ++ '.to_string($total_records)); die();
					if ($total_records<1) {
						return "Sorry, before export, navigate to section $section_label and select export option";
					}

					$source_list = $this->get_ar_columns();
					$target_list = array();//$this->get_ar_columns();

					ob_start();
					include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_'.$context_name.'.phtml' );
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