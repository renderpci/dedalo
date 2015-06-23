<?php

	# CONTROLLER TOOL

	$section_obj 		= $this->section_obj;
	$tipo 				= $section_obj->get_tipo();
	$modo 				= $this->get_modo();
	$tool_name 			= get_class($this);
	$context_name		= $_REQUEST['context_name'];
	$section_title 		= $section_obj->get_label();

	$file_name	= $modo;	
	$html_list 	= $html_edit = '';
	
	#dump($_SESSION['dedalo4']['config']['search_options']," search_options");

	# TOOL CSS / JS MAIN FILES
	#css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";


	switch($modo) {

		case 'page': # Default called from main page. We will use upload as html file and script

				$ar_templates_public = $this->get_ar_templates('public');
					#dump($ar_templates_public,"ar_templates_public public");

				$ar_templates_private = $this->get_ar_templates('private');
					#dump($ar_templates_private,"ar_templates_private private");

				# Store resolved data
				$ar_templates_mix = array_merge($ar_templates_public, $ar_templates_private);
				$_SESSION['dedalo4']['config']['ar_templates_mix'] = $ar_templates_mix;
					#dump($ar_templates_mix,"ar_templates_mix");

					
				# Context
				switch ($context_name) {
					
					#
					# LIST
					case 'list': # List of available templates

						# Aditional css / js
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
						js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

						if(SHOW_DEBUG) {
							#dump($section_obj," ");
							#dump(reset($_SESSION['dedalo4']['config']['tool_layout_print_records'][$section_obj->get_tipo()])," ");
						}

						
						/**/
						#
						# AR_TEMPLATES_SEARCH_OPTIONS
						# Fix source search_options for this section (used later for resolve rocords to print)
							$current_search_options = false; $count=0;
							foreach ((array)$_SESSION['dedalo4']['config']['search_options'] as $key => $value) {
								if (strpos($key, $tipo.'_list_'.$tipo)===0) { // Like 'oh1_list_oh1'
									$current_search_options = $value;									
									$count++;
								}
							}
							if($count>1) {
								if(SHOW_DEBUG) {
										dump($_SESSION['dedalo4']['config']['search_options']," search_options");
								}
								throw new Exception("Error Processing Request. More than one search_options found", 1);
							}						
							if (!$current_search_options || !is_object($current_search_options)) throw new Exception("Error Processing Request. current_search_options not found", 1);
							# Change limit (used only to paginate) in options
							$current_search_options->limit = false;
							$_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo] = (object)$current_search_options;
								#dump($current_search_options,"current_search_options $tipo");
						


						$public_templates_title = 'Custom templates';
						$private_templates_title = 'Default templates';

						ob_start();
						include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_'.$context_name.'.phtml' );
						$html_list = ob_get_clean();
						break;
					

					#
					# EDIT
					case 'edit': # Edit layout with drag and drop tools

						# Aditional css / js
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_layout_print/css/tool_layout_edit.css";
						
						js::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
						js::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_layout_print/js/tool_layout_edit.js";
						js::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_layout_print/js/tool_layout_test.js";
						js::$ar_url[] = TEXT_EDITOR_URL_JS;
							
	
						# Is set in section_list::get_rows_data. NOTE: Only contain records in last visualized list page
						$tool_layout_print_records = $_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo]->last_ar_id;
							#dump($tool_layout_print_records," tool_layout_print_records");
							#dump(reset($tool_layout_print_records)," tool_layout_print_records");

						
						# Verify vars set in previous step (context_name=list)
						if( !isset($_SESSION['dedalo4']['config']['ar_templates_mix']) ||
							!isset($_GET['template_tipo']) ||
							!isset($_GET['template_id'])
						  ) throw new Exception("Error Processing Request. Please, got to list and select one option", 1);
	
						#dump($_SESSION['dedalo4']['config']['ar_templates_mix']," ");

						$section_layout_tipo 	= (string)$_GET['template_tipo'];
						$section_layout_id 		= (string)$_GET['template_id'];	
						$ar_templates_mix 		= (array)$_SESSION['dedalo4']['config']['ar_templates_mix']; # Set in previous step (context_name=list)
							#dump($ar_templates_mix," ar_templates_mix");
						$section_layout_label 	= (string)'';
						foreach ((array)$ar_templates_mix as $key => $obj_value) {
							if ( $obj_value->id==$section_layout_id && $obj_value->section_layout_tipo==$section_layout_tipo ) {
								
								$section_layout_label 	= $obj_value->label;
								$component_layout_tipo 	= $obj_value->component_layout_tipo;
								#$section_layout_dato 	= $obj_value->section_layout_dato;
								if(SHOW_DEBUG) {
									#dump($ar_templates_mix," ar_templates_mix");
									#dump($obj_value," obj_value");
								}
								/* No necesario (ya se actualiza al salvar con el trigger)*/
								# DATO : Recalculate dato for update info after save
								# component_layout
								$component_layout    = component_common::get_instance('component_layout',$component_layout_tipo,$section_layout_id,'print',DEDALO_DATA_NOLAN);
								$section_layout_dato = (object)$component_layout->get_dato();

								#
								# RENDER TEMPLATE . Render with first record of $tool_layout_print_records
								#dump($section_layout_dato->edit,"section_layout_dato->edit");
								$section_layout_dato->edit = (string)component_layout::render_template_preview( (string)$section_layout_dato->edit, reset($tool_layout_print_records) ) ;
								break;
							}
						}
						#dump($section_layout_dato," section_layout_label");


						# Case new empty template
						if (!isset($component_layout_tipo)) {
							$component_layout_tipo = DEDALO_LAYOUT_PUBLIC_COMPONENT_LAYOUT_TIPO;
						}

						# Fixed type
						$type='edit';

						#
						# FIX REQUEST VARS
							/*
							$template_id 	= isset($_REQUEST['template_id']) ? $_REQUEST['template_id'] : null;
							$template_tipo 	= isset($_REQUEST['template_tipo']) ? $_REQUEST['template_tipo'] : null;
							*/
						

						# Components from thios section

						$ar_section_resolved	= $this->get_ar_components($tipo, $tool_layout_print_records);
						#$ar_section_resolved['all_sections'][]= $tipo;
						#dump($ar_section_resolved,'$ar_section_resolved');

						ob_start();
						include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_'.$context_name.'.phtml' );
						$html_edit = ob_get_clean();	
						break;


					#
					# RENDER
					case 'render': # Final rendered pages for pdf or print

						# Aditional css / js
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_layout_print/css/tool_layout_edit.css";									
							
	
						# Is set in section_list::get_rows_data. NOTE: Only contain records in last visualized list page
						$tool_layout_print_records = $_SESSION['dedalo4']['config']['ar_templates_search_options'][$tipo]->last_ar_id;


						$section_layout_tipo 	= (string)$_GET['template_tipo'];
						$section_layout_id 		= (string)$_GET['template_id'];	
						$ar_templates_mix 		= (array)$_SESSION['dedalo4']['config']['ar_templates_mix']; # Set in previous step (context_name=list)
							#dump($ar_templates_mix," ar_templates_mix");
						$section_layout_label 	= (string)'';
						foreach ((array)$ar_templates_mix as $key => $obj_value) {
							if ( $obj_value->id==$section_layout_id && $obj_value->section_layout_tipo==$section_layout_tipo ) {
								
								$section_layout_label 	= $obj_value->label;
								$component_layout_tipo 	= $obj_value->component_layout_tipo;
								#$section_layout_dato 	= $obj_value->section_layout_dato;
								if(SHOW_DEBUG) {
									#dump($ar_templates_mix," ar_templates_mix");
									#dump($obj_value," obj_value");
								}
								/* No necesario (ya se actualiza al salvar con el trigger)*/
								# DATO : Recalculate dato for update info after save
								# component_layout
								$component_layout    = component_common::get_instance('component_layout',$component_layout_tipo,$section_layout_id,'print',DEDALO_DATA_NOLAN);
								$section_layout_dato = (object)$component_layout->get_dato();

								#
								# RENDER TEMPLATE . Render with first record of $tool_layout_print_records
								#dump($section_layout_dato->edit,"section_layout_dato->edit");
								$section_layout_dato->edit = (string)component_layout::render_template_full( (string)$section_layout_dato->edit, reset($tool_layout_print_records) ) ;
								break;
							}
						}
						#dump($section_layout_dato," section_layout_dato");

						# Fixed type
						$type='edit';

						ob_start();
						include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/html/'.get_called_class().'_'.$context_name.'.phtml' );
						$html_render = ob_get_clean();
						echo $html_render;
						return ; // STOP NEXT PAGE LOAD
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