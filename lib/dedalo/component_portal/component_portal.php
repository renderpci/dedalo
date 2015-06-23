<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);

	if ($permissions<1) {
		return '';
	}

	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();		#dump($identificador_unico," identificador_unico");
	$component_name			= get_class($this);
	$context				= $this->get_context();


	
	if (isset($context->context_name) && $context->context_name=='tool_time_machine') {
		$this->set_show_button_new(false);
	}

	$propiedades			= $this->RecordObj_dd->get_propiedades();
	$id_wrapper 			= 'wrapper_'.$identificador_unico;	
	$button_new_html 		= NULL;
	$section_html 			= NULL;
	$file_name				= $modo;
	

	# TIME MACHINE SPECIFIC KEY CHANGES
	$id_time_machine_key = isset($_REQUEST['id_time_machine']) ? '_'.$_REQUEST['id_time_machine'] : '';
	# SEARCH_OPTIONS_SESSION_KEY
	$search_options_session_key = $identificador_unico.'_'.TOP_TIPO.'_'.TOP_ID.$id_time_machine_key;		#dump($search_options_session_key," search_options_session_key");

	
	switch($modo) {	
		
		case 'search': 
				#return print "<br> $component_name. working here..";
				return null;
				break;

		case 'print':
				#$component_info = $this->get_component_info('json');
				#$valor			= $this->get_dato_as_string();
				#$show_button_new = $this->get_show_button_new();

				$this->html_options->header 	= true;
				$this->html_options->rows   	= true;
				$this->html_options->id_column 	= false;
				$this->html_options->rows_limit	= false;
				$this->html_options->buttons 	= false;
				$this->html_options->sortable 	= false;

				#$file_name = 'edit';
				#break;

		# EDIT MODE
		# Build section list from array of section's id stored in component_portal dato
		case 'edit':	
				$dato = $this->get_dato();
					#dump($dato," ");
				#if (empty($dato)) return null;

				$valor			= $this->get_dato_as_string();
				$component_info = $this->get_component_info('json');

				$exclude_elements = $this->get_exclude_elements();
					#dump($exclude_elements, ' exclude_elements');
					#dump($dato, ' dato');
				if(SHOW_DEBUG) {
					#dump($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key],"options for $tipo");
					unset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);
				}			
				if (empty($dato)) {

					# Empty object
					$rows_data = new stdClass();
						$rows_data->result = array();

					$this->html_options->header = false;
					$this->html_options->rows 	= false;

				}else{

					if(SHOW_DEBUG) {
						#unset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);
					}					
					if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {						
						$options = $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key];		
						$options->full_count = false; # Force update count records on non ajax call						
						# Set context
						$context = $options->context;
					}else{						
						
						# LAYOUT_MAP : Calculate list for layout map
						# All related terms are selected except section that is unset from the array								
						$layout_map_virtual  = $this->get_layout_map();
						$target_section_tipo = $this->get_target_section_tipo();
							#dump( $layout_map_virtual,"layout_map_virtual - $target_section_tipo"); #die();

						# OPTIONS
						$options = new stdClass();
							$options->section_tipo  = $target_section_tipo;
							$options->filter_by_id  = (array)$dato;
							$options->layout_map  	= $layout_map_virtual;
							$options->modo  		= 'portal_list';
							$options->limit 		= false; # IMPORTANT : No limit is applicated to portal list. All records are viewed always
							$options->search_options_session_key = $search_options_session_key;
								#dump($options," options");					

							# OPTIONS CONTEXT : Configure section context
							$context = new stdClass();
								$context->context_name 	= 'list_in_portal';
								$context->portal_tipo 	= $tipo;
								$context->portal_parent = $parent;

							$options->context = $context;
								#dump($options,"options");									
					}//end if (!empty($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]))		

					$rows_data = section_list::get_rows_data($options);
						#dump($rows_data->result," rows_data result ".to_string($options));
				}
				
					#dump($rows_data," rows_data");
				$ar_columns = $this->get_ar_columns();				
			
				!isset($target_section_tipo) ? $target_section_tipo = $this->get_target_section_tipo() : '';
				$show_button_new = $this->get_show_button_new();					
				
				$propiedades = json_decode($propiedades);
				$dragable_connectWith = isset($propiedades->dragable_connectWith) ? "portal_table_".$propiedades->dragable_connectWith : null ;
				
				break;

		# LIST MODE
		# Build section list from array of section's id stored in component_portal dato
		case 'list' :					
				$dato = $this->get_dato();		#dump($dato); #dump($dato," dato $this->tipo - ". print_r($this,true) );				
				if (empty($dato)) return null;
				
				if(SHOW_DEBUG) {
					#dump($search_options_session_key,"options for $tipo");
					#unset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);
				}

				if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {						
					$options = $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key];		
					$options->full_count = false; # Force update count records on non ajax call						
					# Set context
					$context = $options->context;

				}else{						
					
					# LAYOUT_MAP : Calculate list for layout map
					# All related terms are selected except section that is unset from the array								
					$layout_map_virtual  = $this->get_layout_map();
					$target_section_tipo = $this->get_target_section_tipo();
						#dump( $layout_map_virtual,"layout_map_virtual - $target_section_tipo");#die();
	
					# OPTIONS
					$options = new stdClass();
						$options->section_tipo  = $target_section_tipo;
						$options->filter_by_id  = (array)$dato;
						$options->layout_map  	= $layout_map_virtual;
						$options->modo  		= 'portal_list';
						$options->limit 		= false; # IMPORTANT : No limit is applicated to portal list. All records are viewed always
						$options->search_options_session_key = $search_options_session_key;

						# OPTIONS CONTEXT : Configure section context
						$context = new stdClass();
							$context->context_name 	= 'list_in_portal';
							$context->portal_tipo 	= $tipo;
							$context->portal_parent = $parent;

						$options->context = $context;
							#dump($options,"options");									
				}//end if (!empty($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]))
				
				$rows_data = section_list::get_rows_data($options);
					#dump($rows_data," rows_data");
				$ar_columns = $this->get_ar_columns();					
				
				!isset($target_section_tipo) ? $target_section_tipo = $this->get_target_section_tipo() : '';
				break;
		
		/*
		# Case component_portal show inside list of sections from component_portal (Recursion)
		case 'list_tm':
		#case 'list':	$file_name = 'portal_list';#dump($dato,"dato");
		case 'portal_list':
						
						$dato	= $this->get_dato();
						#$valor	= $this->get_dato_as_string();	#dump($valor,'valor '.$tipo);						
						
						#
						# SECTION LIST
						if (is_array($dato) && !empty($dato[0])) {
							#dump($dato,"dato");

							$target_section_tipo = $this->get_target_section_tipo();

							# Now we create and configure a new empty section for list ($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
							$section_obj = section::get_instance(NULL, $target_section_tipo, 'portal_list');	#dump($target_section_tipo,'$target_section_tipo');
							
			
							# CONFIGURE SECTION
							# Set caller_id in current section (IMPORTANT)
							$section_obj->set_caller_id($parent);
							$section_obj->set_caller_tipo($tipo);

							$section_obj->set_portal_tipo($tipo);
							#$section_obj->ar_id_records_from_portal = $dato;
								#dump($section_obj->portal_layout_components,'$section_obj->portal_layout_components');

							# CONFIGURE SECTION CONTEXT !IMPORTANT
							$context = new stdClass();
							$context->name = 'component_portal_inside_portal_list';
							$section_obj->set_context($context);

							# Set relation_dato in current section (IMPORTANT)
							$ar_section_relations_for_current_tipo_section = component_portal::get_ar_section_relations_for_current_section_tipo_static('ar_multiple', $dato);
								#dump($ar_section_relations_for_current_tipo_section,'$ar_section_relations_for_current_tipo_section'." - current_tipo_section:$current_tipo_section - dato:".print_r($dato,true));
							$section_obj->set_ar_section_relations_for_current_tipo_section($ar_section_relations_for_current_tipo_section);
								#dump($section_obj,'$section_obj');

							#
							# section LIST HTML (modo portal_list)
							$section_html = $section_obj->get_html();
						}
						break;		
		*/
		
	}//end switch($modo) 
	

	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>