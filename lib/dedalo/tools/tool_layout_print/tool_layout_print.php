<?php

	# CONTROLLER TOOL

	$section_obj 		= $this->section_obj;
	$tipo 				= $section_obj->get_tipo();
	$modo 				= $this->get_modo();
	$tool_name 			= get_class($this);
	$context_name		= $_REQUEST['context_name'];
	$section_title 		= $section_obj->get_label();

	$file_name			= $modo;	
	$html_list 			= $html_edit = '';
	


	switch($modo) {

		case 'page': # Default called from main page. We will use upload as html file and script

				

					
				# Context
				switch ($context_name) {
					
					#
					# LIST
					case 'list': # List of available templates

						#
						# TEMPLATES LIST
							$ar_templates_public = $this->get_ar_templates('public');
								#dump($ar_templates_public,"ar_templates_public public");

							$ar_templates_private = $this->get_ar_templates('private');
								#dump($ar_templates_private,"ar_templates_private private");

							# Store resolved data
							$ar_templates_mix = array_merge($ar_templates_public, $ar_templates_private);
							$_SESSION['dedalo4']['config']['ar_templates_mix'] = $ar_templates_mix;
								#dump($ar_templates_mix,"ar_templates_mix");


						# Aditional css / js
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

						if(SHOW_DEBUG) {
							#dump($section_obj," ");
							#dump(reset($_SESSION['dedalo4']['config']['tool_layout_print_records'][$section_obj->get_tipo()])," ");
						}

						#
						#
						# PRINT_SEARCH_OPTIONS fix
							$search_options_session_key = 'section_'.$tipo;
							if (!isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
								throw new Exception("Error Processing Request. current_section_search_options not found", 1);
							}
							# Change some specific print options
							$print_search_options = clone($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);
								$print_search_options->limit = 1;
								$print_search_options->modo  = 'list';
								# layout map full with all section components
								$ar_components = (array)section::get_ar_children_tipo_by_modelo_name_in_section($tipo, 'component_', $from_cache=true, $resolve_virtual=false);	 #dump($ar_recursive_childrens, ' ar_recursive_childrens');
								$print_search_options->layout_map = array($tipo => $ar_components);
							
								$_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo] = (object)$print_search_options;
									#dump($_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo],"current_search_options $tipo");
									#dump($print_search_options,"print_search_options $tipo");

							# Page areas fixed titles
							$public_templates_title  = 'Custom templates';
							$private_templates_title = 'Default templates';

						ob_start();
						include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_'.$context_name.'.phtml' );
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
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_layout_print/css/tool_layout_edit.css";
						
						js::$ar_url[] = TEXT_EDITOR_URL_JS;
						#js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_layout/js/component_layout.js";
						js::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
						js::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_layout_print/js/tool_layout_edit.js";						
							
	
						# Is set in search::get_records_data. NOTE: Only contain records in last visualized list page
						if (!isset($_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo])) {
							echo "Please select template"; return ;
						}
						$search_options = clone($_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo]);
						$ar_records		= search::get_records_data($search_options);
							#dump($ar_records, ' ar_records');

						#$tool_layout_print_records = $_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo]->last_ar_id;
						$tool_layout_print_records = reset($ar_records->result);
						if (empty($tool_layout_print_records)) {
							$msg = "<div class=\"error\">Sorry. No records found</div>";
							print dd_error::wrap_error($msg);
							return;
						}
							#dump($tool_layout_print_records, ' tool_layout_print_records');	# die();
							#dump($tool_layout_print_records," tool_layout_print_records");
							#dump(reset($tool_layout_print_records)," tool_layout_print_records");
						
						#dump($_SESSION['dedalo4']['config']['ar_templates_mix']," ");

						# Components from this section (left side)
						$ar_section_resolved	= $this->get_ar_components($tipo, reset($tool_layout_print_records));
						
						#$ar_section_resolved['all_sections'][]= $tipo;
						if(SHOW_DEBUG) {
							#dump($context_name, " context_name ".to_string());
							#dump($ar_section_resolved,'$ar_section_resolved');
						}

						$section_layout_tipo 	= (string)$_GET['template_tipo'];
						$section_layout_id 		= (string)$_GET['template_id'];	
						$ar_templates_mix 		= (array)$_SESSION['dedalo4']['config']['ar_templates_mix']; # Set in previous step (context_name=list)
							#dump($ar_templates_mix," ar_templates_mix");
						
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
						
							#dump($current_template, ' current_template'.to_string());						
					
						$section_layout_label 	= isset($template_obj->label) ? $template_obj->label : '';
						$component_layout_tipo 	= $template_obj->component_layout_tipo;

						# component_layout
						$component_layout    = component_common::get_instance('component_layout',$component_layout_tipo,$section_layout_id,'print',DEDALO_DATA_NOLAN,$section_layout_tipo);
						$section_layout_dato = (object)$component_layout->get_dato();
							#dump($section_layout_dato->pages, ' section_layout_dato'); die();

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
							$template_id 	= isset($_REQUEST['template_id']) ? $_REQUEST['template_id'] : null;
							$template_tipo 	= isset($_REQUEST['template_tipo']) ? $_REQUEST['template_tipo'] : null;
							*/
						
						#
						# INFO STATS
						$search_options_session_key = 'section_'.$tipo;
						if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]) 
							&& isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->full_count)) {
							#dump($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key], '$_SESSION ++ '.to_string());
							$n_records = $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]->full_count;
						}
						$n_records 	= isset($n_records) ? $n_records : count($ar_records->result);					
						$n_pages 	= isset($result->ar_pages) ? count($result->ar_pages)*$n_records : '';
						

						ob_start();
						include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_'.$context_name.'.phtml' );
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
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_layout_print/css/tool_layout_edit.css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_layout_print/css/tool_layout_render.css";
						
						js::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

						
						#
						# AR_RECORDS
							$search_options_session_key = 'section_'.$tipo;
							if (!isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
								echo "Please select template"; return ;
							}
							# Change some specific print options
							$print_search_options = clone($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);							
								$print_search_options->modo = 'list';
								$print_search_options->limit = false;
								# layout map full with all section components
								$ar_components = (array)section::get_ar_children_tipo_by_modelo_name_in_section($tipo, 'component_', $from_cache=true, $resolve_virtual=false);	 #dump($ar_recursive_childrens, ' ar_recursive_childrens');
								$print_search_options->layout_map = array($tipo => $ar_components);
							
							$ar_records		= search::get_records_data($print_search_options);
								#dump($ar_records, ' ar_records '); exit();
						

						#
						# TEMPLATE
							$section_layout_tipo 	= (string)$_GET['template_tipo'];
							$section_layout_id 		= (string)$_GET['template_id'];	
							$ar_templates_mix 		= (array)$_SESSION['dedalo4']['config']['ar_templates_mix']; # Set in previous step (context_name=list)
								#dump($ar_templates_mix," ar_templates_mix");
							
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
								#dump($section_layout_dato->pages, ' section_layout_dato'); die();

						#
						# RENDER PAGES . Render with first record of $tool_layout_print_records
							#dump($ar_records->result, '$ar_records->result'.to_string());
							$ar_2 = array();
							foreach ((array)$ar_records->result as $key => $current_record) {
								#dump($current_record, ' current_record'.to_string());
								$ar_2[] = reset($current_record);
							}//end foreach ((array)$ar_records->result as $key => $current_record) {
								#dump($ar_2, ' ar_2'.to_string());die();

								#$current_record = (object)reset($current_record);	
								$pages_rendered = '';
								if (isset($section_layout_dato->pages)) {
									$options = new stdClass();
										$options->pages 		= $section_layout_dato->pages;
										$options->records 		= $ar_2;
										$options->render_type 	= 'render';
										$options->tipo 			= $tipo;

									$result = tool_layout_print::render_pages( $options );
										#dump($result, ' result'.to_string()); die(); // key format: [2_oh1_2] 
									#$pages_rendered = implode('', $result->ar_pages);
									
								}//end if (isset($section_layout_dato->pages)) {
								#dump($result->header_html, ' header_html ++ '.to_string());
							
							
						#
						# SAVE PAGES . Save html files to disk
						$user_id 		 	= $_SESSION['dedalo4']['auth']['user_id'];
						$print_files_path	= '/print/'.$tipo.'/'.$user_id;
						$pages_html_temp 	= DEDALO_MEDIA_BASE_PATH .$print_files_path;
						if(!file_exists($pages_html_temp)) mkdir($pages_html_temp, 0777,true);
						
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
								$request_options->css_links  = css::build_tag( 'http://'.DEDALO_HOST.DEDALO_LIB_BASE_URL."/tools/tool_layout_print/css/tool_layout_render.css" );
								$request_options->js_links   = js::build_tag(  'http://'.DEDALO_HOST.DEDALO_LIB_BASE_URL."/tools/tool_layout_print/js/wkhtmltopdf.js" );									
							$current_page_complete = tool_layout_print::create_full_html_page( $request_options );
							$footer_html_file_name = 'footer.html';
							file_put_contents($pages_html_temp.'/'.$footer_html_file_name, $current_page_complete);
							$footer_html_url = 'http://'.DEDALO_HOST . DEDALO_MEDIA_BASE_URL . $print_files_path .'/'. $footer_html_file_name.'';
							//$footer_html_url = 'http://'.DEDALO_HOST . DEDALO_MEDIA_BASE_URL . $print_files_path .'/footer_source.html';
							
						
						#
						# INFO STATS
						$n_records 	= count($ar_records->result);
						$n_pages 	= count($result->ar_pages);
						
							
						$ar_command 	 = $this->get_ar_command( $urls_group_by_section, $print_files_path, $pages_html_temp, $footer_html_url );
						$render_pdf_data = $ar_command;


						ob_start();
						include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_'.$context_name.'.phtml' );
						$html_render = ob_get_clean();	
						break;




					#
					# RENDER
					case 'render__OLD': # Final rendered pages for pdf or print
						
						# Verify vars set in previous step (context_name=list)
						if( !isset($_SESSION['dedalo4']['config']['ar_templates_mix']) ||
							!isset($_GET['template_tipo']) ||
							!isset($_GET['template_id'])
						  ) throw new Exception("Error Processing Request. Please, got to list and select one option ($tipo)", 1);

						$section_layout_tipo = (string)$_GET['template_tipo'];
						$section_layout_id 	 = (string)$_GET['template_id'];
						$section_tipo 		 = (string)$tipo;

							#dump($_SESSION['dedalo4']['config']['search_options'], "ar_templates_search_options ".to_string()); die();
						#
						# SEARCH OPTIONS
						$key = 'section_'.$tipo;
						$search_options = clone($_SESSION['dedalo4']['config']['search_options'][$key]);	//ar_templates_search_options
						$search_options->limit = false;
						$ar_records		= search::get_records_data($search_options);
							#dump($ar_records, " ar_records ".to_string());

						#
						# TEMPLATE_OBJ
						$array_key 	  = $section_layout_tipo .'_'. $section_layout_id;
						$template_obj = clone($_SESSION['dedalo4']['config']['ar_templates_mix'][$array_key]);

						#
						# WRITES DATA TO DISK TO BE RECREATED WHEN THE DAEMON ACCESS
							$data = new stdClass();
								$data->search_options 		= $search_options;
								$data->template_obj 		= $template_obj;
									#dump($data, ' data'.to_string()); die();
								$data = json_encode($data);
							
							$folder_path 	= dirname(__FILE__).'/data/'.$_SESSION['dedalo4']['auth']['user_id'];
							$data_file_name = $folder_path.'/'.$section_layout_tipo.'_'.$section_layout_id.'.data';
							if( !is_dir($folder_path) ) {
								if(!mkdir($folder_path, 0700,true)) {
									throw new Exception(" Error on read or create print data directory. Permission denied");
								}
							}
							if( !file_put_contents($data_file_name, $data) ) {
								if(SHOW_DEBUG) {
									dump($data_file_name, ' data_file_name'.to_string());
								}
								throw new Exception("Error Processing Request. Folder print data is not accessible", 1);
							}

						# Set special php global options
						ob_implicit_flush(true);
						set_time_limit ( 259200 );  // 3 dias
						
						# Disable logging activity and time machine # !IMPORTANT
						logger_backend_activity::$enable_log = false;
						RecordObj_time_machine::$save_time_machine_version = false;


						#dump($ar_records->result, "ar_records ".to_string());die();
						$ar_command = array();
						foreach ($ar_records->result as $key => $current_record) {
							#dump($current_record, " current_record ".to_string());
							
							$current_record = (object)reset($current_record);
							$section_id 	= (int)$current_record->section_id;	

							#
							# PDF generation								
								$pdf_target_path  = DEDALO_LIB_BASE_PATH . "/tools/tool_layout_print/print_pdf/".$tipo.'_'.$section_id.'.pdf';
								$javascript_delay = 2000;																
															
								$ar_vars 	= array(
												'template_tipo' => $section_layout_tipo,
												'template_id' 	=> $section_layout_id,
												'section_tipo' 	=> $section_tipo,
												'section_id' 	=> $section_id,
												'user_id' 		=> $_SESSION['dedalo4']['auth']['user_id'],
												);								
								$url = "http://".DEDALO_HOST.DEDALO_LIB_BASE_URL."/tools/tool_layout_print/print.php?".http_build_query($ar_vars);
								 	#dump($url, " url ".to_string()); #die();

								
								$command  = DEDALO_PDF_RENDERER ;	//. " --no-stop-slow-scripts --debug-javascript --javascript-delay $javascript_delay ";	
								$command .= " '$url'";
								$command .= " '$pdf_target_path' ";

								$ar_command[] = $command;
								#$command_exc = exec($command, $output);

								/*
								if(SHOW_DEBUG) {
									$msg = "<br>Generating pdf file from to $pdf_target_path with command: \n$command";
									//error_log($msg);							
									print "command: $command";
									#dump($output, '$output'.to_string());
								}	
								*/							

						}//end foreach ($ar_records as $key => $current_record) {

						#
						# EXEC COMMANDS GROUPED
						$command_group='';
						$i=1;
						$max=2;
						echo "Total: ".count($ar_command);
						foreach ($ar_command as $key => $current_command) {							
							/*
							if(SHOW_DEBUG) $start_time = start_time();
							#echo "<br>i:$i ". htmlspecialchars($current_command);
							if ($i<$max && end($ar_command)!=$current_command) {
								$command_group .= $current_command ."; ";
							}else{
								#$command_group = substr($command_group, 0,-4);
								#echo "<hr>i:$i ".htmlspecialchars($command_group); 
								
								$output = shell_exec($command_group);
								echo "output: <pre>$output</pre>";
								
								echo "<br>Building pdf from group ($i)";
								if(SHOW_DEBUG) {
									echo "<pre>$command_group</pre>";
									echo "<div>".htmlspecialchars($command_group)."</div>";
								}
								$command_group=''; # reset	
								$i=0; # reset

								if(SHOW_DEBUG) {
									$total=round(microtime(true)-$start_time,3);
									echo "<br>Time: $total ms";
								}
								#break; // temporal...
							}							
							$i++;
							*/
							$output = shell_exec($current_command);
								echo "output: <pre>$output</pre>";
						}


						# Enable logging activity and time machine # !IMPORTANT
						logger_backend_activity::$enable_log = true;
						RecordObj_time_machine::$save_time_machine_version = true;

						return;

						ob_start();
						include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_'.$context_name.'.phtml' );
						$html_render = ob_get_clean();
						echo $html_render;
						#throw new Exception("Error Processing Request", 1);
						break;
				}

				break;	
	
	
	}#end switch modo



	#dump($target_folder_path,'$target_folder_path');
	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' .get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>