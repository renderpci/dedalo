<?php

	# CONTROLLER TOOL

	$section_obj 		= $this->section_obj;
	$tipo 				= $section_obj->get_tipo();
	$modo 				= $this->get_modo();
	$tool_name 			= get_class($this);
	$section_title 		= $section_obj->get_label();
	$context_name		= safe_xss($_REQUEST['context_name']);
	
	$file_name			= $modo;	
	$html_list 			= $html_edit = '';


	#
	# ADITIONAL_CSS
		$file_extra_css = DEDALO_EXTRAS_PATH .'/'. DEDALO_ENTITY . '/css/layout_print.css';
		if (file_exists($file_extra_css)) {
			css::$ar_url[] = DEDALO_CORE_URL .'/extras/'. DEDALO_ENTITY . '/css/layout_print.css';
		}
	

	switch($modo) {

		case 'page': # Default called from main page. We will use upload as html file and script
					
			# Context
			switch ($context_name) {
				
				#
				# LIST
				case 'list': # List of available templates

					// Aditional css / js 
						css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
						js::$ar_url[]  = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
					
					// Templates list 

						// Public 
							$public_templates_title = 'Custom templates';
							$ar_templates_public  	= $this->get_ar_templates('public');
							$ar_templates_public_js = array_map(function($item){
								$element = [
									'section_id' 	=> $item->section_id,
									'section_tipo'  => $item->section_layout_tipo, //DEDALO_SECTION_LAYOUT_PUBLIC_TIPO,
									'label' 		=> $item->label
								];
								return $element;
							}, $ar_templates_public,[]); // (!) Note second argument '[]' avoid preserve original asociative array keys	
						
						// Private 
							$private_templates_title = 'Default templates';
							$ar_templates_private 	 = $this->get_ar_templates('private');
							$ar_templates_private_js = array_map(function($item){
								$element = [
									'section_id' 	=> $item->section_id,
									'section_tipo'  => $item->section_layout_tipo, //DEDALO_SECTION_LAYOUT_PUBLIC_TIPO,
									'label' 		=> $item->label
								];
								return $element;
							}, $ar_templates_private,[]); // (!) Note second argument '[]' avoid preserve original asociative array keys

						// Store resolved data
							$ar_templates_mix = array_merge($ar_templates_public, $ar_templates_private);
							$_SESSION['dedalo4']['config']['ar_templates_mix'] = $ar_templates_mix;

					// Print_search_options fix
						#$search_options_session_key = 'section_'.$tipo;
						#if (!isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
						#	throw new Exception("Error Processing Request. current_section_search_options not found", 1);
						#}
						# Change some specific print options
						#$print_search_options = clone($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);
						#$print_search_options->limit = 1;
						#	$print_search_options->modo  = 'list';
							# layout map full with all section components
						#	$ar_components = (array)section::get_ar_children_tipo_by_modelo_name_in_section($tipo, 'component_', $from_cache=true, $resolve_virtual=false);
						#	$print_search_options->layout_map = array($tipo => $ar_components);						
						#	$_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo] = (object)$print_search_options;

					// Build html
						ob_start();
						include ( DEDALO_CORE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_list.phtml' );
						$html_list = ob_get_clean();

					break;
				

				#
				# EDIT
				case 'edit': # Edit layout with drag and drop tools

					# Verify vars set in previous step (context_name=list)
					if( !isset($_SESSION['dedalo4']['config']['ar_templates_mix']) ||
						!isset($_GET['template_tipo']) ||
						!isset($_GET['template_id'])
					  ) throw new Exception("Error Processing Request. Please, got to list and select one option", 1);


					# Aditional css / js
					css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
					css::$ar_url[] = DEDALO_CORE_URL."/tools/tool_layout_print/css/tool_layout_edit.css";
					
					js::$ar_url[] = TEXT_EDITOR_URL_JS;
					#js::$ar_url[] = DEDALO_CORE_URL."/component_layout/js/component_layout.js";
					js::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
					js::$ar_url[] = DEDALO_CORE_URL."/tools/tool_layout_print/js/tool_layout_edit.js";						
					
					// Section current search (Like oh1)
						if(SHOW_DEBUG) {
							#dump($_SESSION['dedalo4']['config']['search_options'][$tipo]->search_query_object, '$_SESSION[search_options] ++ '.to_string());
						}
						$section_current_search_query_object = clone $_SESSION['dedalo4']['config']['search_options'][$tipo]->search_query_object;
						// Prepare search_query_object for print purposes
						$section_current_search_query_object->select 	 = [];
						$section_current_search_query_object->full_count = false;
						$section_current_search_query_object->limit 	 = 0;
						$section_current_search_query_object->offset 	 = 0;
						// Re-search
						$search = new search($section_current_search_query_object);
						$result = $search->search();
							#dump($result, ' result ++ '.to_string()); die();
						$ar_records 				= $result->ar_records;
						$tool_layout_print_records 	= $ar_records;
						#$tool_layout_print_records = array_map(function($item){
						#	return $item->section_id;
						#}, (array)$ar_records);
					/*	
					# Is set in search::get_records_data. NOTE: Only contain records in last visualized list page
					if (!isset($_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo])) {
						echo "Please select template"; return ;
					}
					$search_options = clone($_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo]);
					$ar_records		= search::get_records_data($search_options);
						$tool_layout_print_records = reset($ar_records->result);
					*/
							/*# SEARCH_OPTIONS
								$search_options_id    = $tipo; // section tipo like oh1
								$saved_search_options = section_records::get_search_options($search_options_id);
							
							# SEARCH_QUERY_OBJECT
								# Use saved search options (deep cloned to avoid propagation of changes !)
								$search_options 	 = unserialize(serialize($saved_search_options));
								$search_query_object = $search_options->search_query_object;
									#$search_query_object->limit   = 0;  // unset limit
									#$search_query_object->offset  = 0;  // unset offset
									#$search_query_object->order   = false;  // unset order
									#$search_query_object->select  = []; // unset select
							
							# SEARCH
								$search_develoment2  = new search($search_query_object);
								$rows_data 		 	 = $search_develoment2->search();
					
							$tool_layout_print_records = $rows_data->ar_records;*/

					if (empty($tool_layout_print_records)) {
						$msg = "<div class=\"error\">Sorry. No records found</div>";
						print dd_error::wrap_error($msg);
						return;
					}
					

					# Components from this section (left side)
					$ar_section_resolved	= $this->get_ar_components($tipo, reset($tool_layout_print_records));
					
					$section_layout_tipo 	= (string)safe_tipo( safe_xss($_GET['template_tipo']) );
					$section_layout_id 		= (string)safe_section_id( safe_xss($_GET['template_id']) );
					$ar_templates_mix 		= (array)$_SESSION['dedalo4']['config']['ar_templates_mix']; # Set in previous step (context_name=list)
					
					$array_key 	  = $section_layout_tipo .'_'. $section_layout_id;
					if (isset($_SESSION['dedalo4']['config']['ar_templates_mix'][$array_key])) {
						// Existing template
						$template_obj = clone($_SESSION['dedalo4']['config']['ar_templates_mix'][$array_key]);
					}else{
						// New blank template
						$ar_components_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_layout_tipo, 'component_layout', false); #Important cache false							
						$template_obj = new stdClass();
							$template_obj->component_layout_tipo = reset($ar_components_tipo);
					}					
				
					$section_layout_label 	= isset($template_obj->label) ? $template_obj->label : '';
					$component_layout_tipo 	= $template_obj->component_layout_tipo;

					# component_layout
					$component_layout    = component_common::get_instance('component_layout',$component_layout_tipo,$section_layout_id,'print',DEDALO_DATA_NOLAN,$section_layout_tipo);
					$section_layout_dato = (object)$component_layout->get_dato();

					#
					# RENDER PAGES . Render with first record of $tool_layout_print_records
						$pages_rendered = '';
						if (isset($section_layout_dato->pages)) {
							$options = new stdClass();
								$options->pages 		= $section_layout_dato->pages;
								$options->records 		= $tool_layout_print_records;
								$options->render_type 	= 'preview';

							$result 		= tool_layout_print::render_pages( $options );
							$pages_rendered = implode('', $result->ar_pages);
						}//end if (isset($section_layout_dato->pages)) {
					

					# Case new empty template
					if (!isset($component_layout_tipo)) {
						$component_layout_tipo = DEDALO_LAYOUT_PUBLIC_COMPONENT_LAYOUT_TIPO;
					}

					# Fixed type
					$type='pages';

					#
					# FIX REQUEST VARS
						/*
						$template_id 	= isset($_REQUEST['template_id']) ? safe_xss($_REQUEST['template_id']) : null;
						$template_tipo 	= isset($_REQUEST['template_tipo']) ? safe_xss($_REQUEST['template_tipo']) : null;
						*/
					
					#
					# INFO STATS
					/*
					$search_options_session_key = 'section_'.$tipo;
					if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]) 
						&& isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->full_count)) {
						$n_records = $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->full_count;
					}
					*/
					$n_records 	= isset($n_records) ? $n_records : count($ar_records);
					$n_pages 	= '';
					

					ob_start();
					include ( DEDALO_CORE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_edit.phtml' );
					$html_edit = ob_get_clean();	
					break;


				#
				# RENDER
				case 'render':

					# Verify vars set in previous step (context_name=list)
					if( !isset($_SESSION['dedalo4']['config']['ar_templates_mix']) ||
						!isset($_GET['template_tipo']) ||
						!isset($_GET['template_id'])
					  ) throw new Exception("Error Processing Request. Please, got to list and select one option", 1);


					# Aditional css / js
					css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
					css::$ar_url[] = DEDALO_CORE_URL."/tools/tool_layout_print/css/tool_layout_edit.css";
					css::$ar_url[] = DEDALO_CORE_URL."/tools/tool_layout_print/css/tool_layout_render.css";
					
					js::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

					
					#
					# AR_RECORDS
						/*
						$search_options_session_key = 'section_'.$tipo;
						if (!isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
							echo "Please select template"; return ;
						}
						# Change some specific print options
						$print_search_options = clone($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);							
							$print_search_options->modo = 'list';
							$print_search_options->limit = false;
							# layout map full with all section components
							$ar_components = (array)section::get_ar_children_tipo_by_modelo_name_in_section($tipo, 'component_', $from_cache=true, $resolve_virtual=false);
							$print_search_options->layout_map = array($tipo => $ar_components);
						
						$ar_records		= search::get_records_data($print_search_options);
						*/
					// Section current search (Like oh1)
						if(SHOW_DEBUG) {
							#dump($_SESSION['dedalo4']['config']['search_options'][$tipo]->search_query_object, '$_SESSION[search_options] ++ '.to_string());
						}
						$section_current_search_query_object = clone $_SESSION['dedalo4']['config']['search_options'][$tipo]->search_query_object;
						// Prepare search_query_object for print purposes
						$section_current_search_query_object->select 	 = [];
						$section_current_search_query_object->full_count = false;
						$section_current_search_query_object->limit 	 = 0;
						$section_current_search_query_object->offset 	 = 0;
						// Re-search
						$search = new search($section_current_search_query_object);
						$result = $search->search();
							#dump($result, ' result ++ '.to_string()); die();
						$ar_records 				= $result->ar_records;
						$tool_layout_print_records 	= $ar_records;					

					#
					# TEMPLATE
						$section_layout_tipo 	= (string)safe_xss($_GET['template_tipo']);
						$section_layout_id 		= (string)safe_xss($_GET['template_id']);	
						$ar_templates_mix 		= (array)$_SESSION['dedalo4']['config']['ar_templates_mix']; # Set in previous step (context_name=list)
						
						$array_key = $section_layout_tipo .'_'. $section_layout_id;
						if (!isset($_SESSION['dedalo4']['config']['ar_templates_mix'][$array_key])) {							
							throw new Exception("Error Processing Request. Not found ar_templates_mix ", 1);							
						}
						$template_obj 			= clone($_SESSION['dedalo4']['config']['ar_templates_mix'][$array_key]);					
						$section_layout_label 	= isset($template_obj->label) ? $template_obj->label : '';
						$component_layout_tipo 	= $template_obj->component_layout_tipo;

						# component_layout
						$component_layout    = component_common::get_instance('component_layout',$component_layout_tipo,$section_layout_id,'print',DEDALO_DATA_NOLAN,$section_layout_tipo);
						$section_layout_dato = (object)$component_layout->get_dato();

					#
					# RENDER PAGES					
						$pages_rendered = '';
						if (isset($section_layout_dato->pages)) {
							$options = new stdClass();
								$options->pages 		= $section_layout_dato->pages;
								$options->records 		= $ar_records;
								$options->render_type 	= 'render';
								$options->tipo 			= $tipo;

							$result = tool_layout_print::render_pages( $options );
							#$pages_rendered = implode('', $result->ar_pages);							
						}//end if (isset($section_layout_dato->pages)) {
						
						
					#
					# SAVE PAGES . Save html files to disk
					$user_id 		 	= $_SESSION['dedalo4']['auth']['user_id'];
					$print_files_path	= '/print/'.safe_tipo($tipo).'/'.safe_section_id($user_id);
					$pages_html_temp 	= DEDALO_MEDIA_BASE_PATH . $print_files_path;
					if(!file_exists($pages_html_temp)) mkdir($pages_html_temp, 0775,true);
					
					# Remove old files in temp folder
					shell_exec("rm -R $pages_html_temp/*.html");
					shell_exec("rm -R $pages_html_temp/*.pdf");

					#
					# URLS_GROUP_BY_SECTION
					# Array of all pages url by section tipo and section id. Key is like 'oh1_1' => array(page1,page2)
					$urls_group_by_section = $this->get_urls_group_by_section( $result->ar_pages, $tipo, $print_files_path, $pages_html_temp );

					# Generate header and footer files
						/*
						if (isset($result->header_html)) {
							$request_options = new stdClass();
								$request_options->page_html = $result->header_html;
							$current_page_complete = tool_layout_print::create_full_html_page( $request_options );
							$header_html_file_name = 'header.html';								
							file_put_contents($pages_html_temp.'/'.$header_html_file_name, $current_page_complete);
							$header_html_url = 'http://'.DEDALO_HOST . DEDALO_MEDIA_BASE_URL . $print_files_path .'/'. $header_html_file_name.'';
						}
						*/														
						$footer_html = "<div class=\"pagination_info\">". sprintf( label::get_label('number_page_of_total_pages'), "<span class=\"var_pdf_page\">0</span>", "<span class=\"var_pdf_topage\">0</span>"). "</div>";
						$request_options = new stdClass();
							$request_options->page_html  = $footer_html;	//$result->footer_html;tool_layout_print/css/tool_layout_render.css?15102909
							$request_options->css_links  = css::build_tag( 'http://'.DEDALO_HOST.DEDALO_CORE_URL."/tools/tool_layout_print/css/tool_layout_render.css" );
							$request_options->js_links   = js::build_tag(  'http://'.DEDALO_HOST.DEDALO_CORE_URL."/tools/tool_layout_print/js/wkhtmltopdf.js" );									
						$current_page_complete = tool_layout_print::create_full_html_page( $request_options );
						$footer_html_file_name = 'footer.html';
						file_put_contents($pages_html_temp.'/'.$footer_html_file_name, $current_page_complete);
						$footer_html_url = 'http://'.DEDALO_HOST . DEDALO_MEDIA_BASE_URL . $print_files_path .'/'. $footer_html_file_name.'';
						//$footer_html_url = 'http://'.DEDALO_HOST . DEDALO_MEDIA_BASE_URL . $print_files_path .'/footer_source.html';
						
					
					#
					# INFO STATS
					$n_records 	= count($ar_records);
					#$n_pages 	= count($result->ar_pages);
					
						
					$ar_command 	 = $this->get_ar_command( $urls_group_by_section, $print_files_path, $pages_html_temp, $footer_html_url );
					$render_pdf_data = $ar_command;


					ob_start();
					include ( DEDALO_CORE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_render.phtml' );
					$html_render = ob_get_clean();	
					break;

				default:
					trigger_error("Invalid context_name !");
					return null;

			}//end switch ($context_name)
			break;
	
	}#end switch modo
	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_CORE_PATH . '/tools/' .get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>