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
	$permissions			= $this->get_component_permissions();
	
	if($permissions===0) return null;

	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$context				= $this->get_context();
	if (isset($context->context_name) && $context->context_name==='tool_time_machine') {
		$this->set_show_button_new(false);
	}
	
	$propiedades			= $this->get_propiedades();
	$id_wrapper 			= 'wrapper_'.$identificador_unico;
	$button_new_html 		= NULL;
	$section_html 			= NULL;
	$file_name				= $modo;

	$portal_parent 			= $parent;

	# TIME MACHINE SPECIFIC KEY CHANGES
	#$id_time_machine_key = isset($_REQUEST['id_time_machine']) ? '_'.safe_xss($_REQUEST['id_time_machine']) : '';

	#get the change id_time_machine_key
	#$var_requested 	= common::get_request_var('id_time_machine');
	#$id_time_machine_key = !empty($var_requested) ? '_'.$var_requested : '';

	# SEARCH_OPTIONS_SESSION_KEY
	#$search_options_session_key = 'portal_edit'.$identificador_unico.'_'.TOP_TIPO.'_'.TOP_ID.$id_time_machine_key;
	#$search_options_session_key = 'portal_'.$modo.'_'.$section_tipo.'_'.$tipo.'_'.$parent.'_'.$this->section_list_key;
	#$dato = $this->get_dato();
	#$search_options_session_key = 'portal_'.$modo.'_'.$section_tipo.'_'.$tipo.'_'.$parent.'_'. md5(json_encode($dato)); // En pruebas !!
	#debug_log(__METHOD__." POR RREVISAR A FONDO EL KEY search_options_session_key !!!! ".to_string($this->section_list_key), logger::DEBUG);
		#dump($modo, ' modo ++ '.to_string());


	switch($modo) {
		
		# EDIT MODE
		# Build section list from array of section's id stored in component_portal dato
		case 'edit_in_list':
				// Fix always edit as modo / filename
				$modo 			= 'edit';
				$file_name		= 'edit';

				$wrap_style 	= ''; //'width:100%'; // Overwrite possible custon component structure css

				#dump($modo, ' modo ++ '.to_string());
				// Dont break here. Continue as modo edit
		#case 'portal_list_view_mosaic':
		#		$file_name		= 'edit';

		case 'tool_description':
				$file_name		= 'edit';			

		case 'edit':

				#
				# SEMANTIC NODES
				#if ( !empty($this->semantic_nodes) ) {
					# JS/CSS ADD
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/tool_semantic_nodes/js/tool_semantic_nodes.js";
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_semantic_nodes/css/tool_semantic_nodes.css";
				#}

				#dump($this->generate_json_element, ' file_name ++ '.to_string($this->generate_json_element));
				#debug_log(__METHOD__." tipo:$this->tipo - modo:$modo - generate_json_element:".to_string($this->generate_json_element), logger::DEBUG);

				$dato 			= $this->get_dato();
				$component_info	= $this->get_component_info('json');

				$ar_target_section_tipo 	 = $this->get_ar_target_section_tipo();
				$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
	
				$max_records 	= isset($this->propiedades->max_records) ? (int)$this->propiedades->max_records : 10;
				$offset 		= 0; // Initial is 0
				$n_rows 		= count($dato);

				# extension_autocomplete
				$extension_autocomplete = $this->get_extension_autocomplete();
				if ($extension_autocomplete!==false) {
					# code...
				}

				#if ($this->generate_json_element===true) {

					# tool_description case overrides
					# if ($modo==='tool_description') {
					# 	$file_name 	 = 'edit';
					# 	$max_records = 1;
					# }

					#$json_build_options = json_encode($this->get_json_build_options());
						#dump($json_build_options, ' $json_build_options ++ '.to_string());	return;				
				/*
				}else{

					# Custom propiedades external dato 
					if(isset($propiedades->source->mode) && $propiedades->source->mode === 'external'){
						$this->set_dato_external(true);	// Forces update dato with calculated external dato					
					}

					$dato 				= $this->get_dato();
					$dato_json 			= json_encode($dato);
					$valor				= $this->get_dato_as_string();
					$component_info 	= $this->get_component_info('json');
					$exclude_elements 	= $this->get_exclude_elements();

					$ar_target_section_tipo 	 = $this->get_ar_target_section_tipo();
					$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);


					
					if (isset($propiedades->html_options)) foreach ($propiedades->html_options as $key => $value) {
						$this->html_options->$key = $value;					
					}
		
					$n_rows = count($dato);
					if ($this->html_options->rows_limit!==false && $n_rows >= (int)$this->html_options->rows_limit) {
						$this->html_options->buttons = false;
					}

					#
					# EDIT VIEW CONFIG (propiedades)
					$edit_view 		= 'full'; // Default portal view if nothing is set about
					if(isset($propiedades->edit_view)) {
						$edit_view	= $propiedades->edit_view;
						$file_view 	= $modo.'_'.$edit_view;
					}
					#debug_log(__METHOD__." propiedades - edit_view:$edit_view -  ".to_string($propiedades->edit_view), logger::DEBUG);						
					
					$filter_by_locator = (array)$dato;
					
					if (empty($dato)) {

						# Empty object
						$rows_data = new stdClass();
							$rows_data->ar_records = array();

						$this->html_options->header = false;
						$this->html_options->rows 	= false;

						#throw new Exception("Stopped Processing Request. Empty dato here !", 1);						

					}else{
						
						$context = new stdClass();
							$context->context_name 	= 'list_in_portal';
							$context->portal_tipo 	= $tipo;
							$context->portal_parent = $parent;

	
						# OPTIONS
						#$search_options = new stdClass();
						#	$search_options->modo  		= 'portal_list';
						#	$search_options->context 	= $context;


						# SEARCH_QUERY_OBJECT . Add search_query_object to options
						$search_query_object_options = new stdClass();
							$search_query_object_options->filter_by_locator  = $filter_by_locator;
							$search_query_object_options->section_tipo 		 = reset($ar_target_section_tipo);
							$search_query_object_options->limit 		 	 = 0;
						$search_query_object = $this->build_search_query_object($search_query_object_options);
						
						# Search
						$search_develoment2  = new search_development2($search_query_object);
						$rows_data 		 	 = $search_develoment2->search();

						#
						# COMPONENT STATE DATO					
						#if (isset($this->component_state_tipo)) {
						#
						#	$state_options = $options;
						#	$state_options->tipo_de_dato = 'dato';
						#	$state_options->layout_map 	 = array($this->component_state_tipo);
						#	$rows_data_state = search::get_records_data($state_options);
						#		dump($rows_data_state, ' rows_data_state ++ '.to_string());		
						#	
						#	# STATE UPDATE DATA
						#	$this->update_state($rows_data_state);
						#}						
					}
					#dump($rows_data," rows_data");


					#
					# COLUMNS
					$ar_columns = $this->get_ar_columns($edit_view);
						#dump($ar_columns, ' /////////////////////////////// ar_columns ++ '.to_string($edit_view));
				
					# Buttons new/add
					$show_button_new = $this->get_show_button_new();
					
					# Daggable
					$dragable_connectWith = isset($propiedades->dragable_connectWith) ? "portal_table_".$propiedades->dragable_connectWith : null;

					# max_records
					if (isset($propiedades->max_records) && $this->max_records==null) {
						$this->max_records = $propiedades->max_records;
					}

					$total_records  = count($dato);
					$max_records 	= $this->max_records!==null ? (int)$this->max_records : 5;
					$offset 		= $this->offset!==null ? (int)$this->offset : 0;
	
					# JS ADD
					#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/tool_portal/js/tool_portal.js";
					# tool_description case	

					# tool_description case overrides
					# if ($modo==='tool_description') {
					# 	$edit_view		= 'view_description_tool';
					# 	$file_view 		= 'edit_'.$edit_view;
					# 	$max_records 	= 1;
					# 	$file_name		= $file_view;
					# }
					#debug_log(__METHOD__." file_name: $file_name - file_view: $file_view - modo: $modo".to_string(), logger::DEBUG);

				}//end if ($this->generate_json_element===true)	
				*/
				break;

		case 'portal_list' :
		case 'list_tm' :
		
				$file_name		= 'list';

		# LIST MODE
		# Build section list from array of section's id stored in component_portal dato
		case 'list' :
				$dato = $this->get_dato();
				if (empty($dato)) return null;
				
				$ar_target_section_tipo 	 = $this->get_ar_target_section_tipo();
				$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
				$filter_by_locator 			 = (array)$dato;

				# CONTEXT : Configure section context
				$context = new stdClass();
					$context->context_name 	= 'list_in_portal';
					$context->portal_tipo 	= $tipo;
					$context->portal_parent = $parent;

				# OPTIONS
				$options = new stdClass();
					$options->modo		= 'portal_list';
					$options->context 	= $context;
				
				# SEARCH_QUERY_OBJECT . Add search_query_object to options
					$search_query_object_options = new stdClass();
						$search_query_object_options->limit 			 = 1;
						$search_query_object_options->filter_by_locator  = $filter_by_locator;
						$search_query_object_options->section_tipo 		 = reset($ar_target_section_tipo);
						$search_query_object_options->tipo 				 = $tipo;
					$search_query_object = $this->build_search_query_object($search_query_object_options);
					
				# SEARCH
				$search_develoment2  = new search_development2($search_query_object);
				$rows_data 		 	 = $search_develoment2->search();


				# AR_COLUMNS
				$ar_columns = $this->get_ar_columns();
				break;

		# SEARCH MODE
		case 'search':
				#return print "<br> $component_name. working here..";

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				return null;
				break;

		# PRINT MODE
		case 'print':
				#$component_info = $this->get_component_info('json');
				#$valor			= $this->get_dato_as_string();
				#$show_button_new = $this->get_show_button_new();
				
				#if (is_string($this->html_options->header)) {
				#	$this->html_options->header = json_decode($this->html_options->header);
				#}

				# Defaults		
				$this->html_options->header 	= isset($this->html_options->header) ? $this->html_options->header : true;
				$this->html_options->rows 		= isset($this->html_options->rows) ? $this->html_options->rows : true;
				$this->html_options->id_column 	= false;
				$this->html_options->rows_limit = isset($this->html_options->rows_limit) ? $this->html_options->rows_limit : false;
				$this->html_options->buttons 	= false;
				$this->html_options->sortable 	= isset($this->html_options->sortable) ? $this->html_options->sortable : false;
											

				$dato = $this->get_dato();

				if (empty($dato)) {

					# Empty object
					$rows_data = new stdClass();
						$rows_data->result = array();

					$this->html_options->header = false;
					$this->html_options->rows 	= false;

				}else{										
						
					# LAYOUT_MAP : Calculate list for layout map
					# All related terms are selected except section that is unset from the array								
					#$layout_map_virtual  = $this->get_layout_map();
					$ar_target_section_tipo = $this->get_ar_target_section_tipo();
						#dump( $layout_map_virtual,"layout_map_virtual - $target_section_tipo"); #die();
					$filter_by_locator = (array)$dato;

					# OPTIONS
					$options = new stdClass();
						$options->modo  		= 'portal_list';
						#$options->section_tipo  = $target_section_tipo;
						#$options->filter_by_id  = (array)$dato;
						#$options->layout_map  	= $layout_map_virtual;						
						#$options->limit 		= false; # IMPORTANT : No limit is applicated to portal list. All records are viewed always
						#$options->search_options_session_key = $search_options_session_key;
							#dump($options," options");					

						# OPTIONS CONTEXT : Configure section context
						$context = new stdClass();
							$context->context_name 	= 'list_in_portal';
							$context->portal_tipo 	= $tipo;
							$context->portal_parent = $parent;

						$options->context = $context;
							#dump($options,"options");									
					

					#$rows_data = search::get_records_data($options);
					# SEARCH_QUERY_OBJECT . Add search_query_object to options
					$search_query_object_options = new stdClass();
						#$search_query_object_options->limit 			 = 1;
						$search_query_object_options->filter_by_locator  = $filter_by_locator;
						$search_query_object_options->section_tipo 		 = reset($ar_target_section_tipo);
						$search_query_object_options->tipo 		 		 = $tipo;
					$search_query_object = self::build_search_query_object($search_query_object_options);
					# Search
					$search_develoment2  = new search_development2($search_query_object);
					$rows_data 		 	 = $search_develoment2->search();					
				}
				
					#dump($rows_data," rows_data");
				$ar_columns = $this->get_ar_columns();	
					#dump($ar_columns, ' ar_columns ++ '.to_string());
					#die();				
				break;
		
		case 'portal_list_view_mosaic':
				
				$dato 				= $this->get_dato();
				if (empty($dato)) return null;

				$valor				= $this->get_dato_as_string();
				$component_info 	= $this->get_component_info('json');
				$exclude_elements 	= $this->get_exclude_elements();

				# EDIT VIEW CONFIG (propiedades)
				$edit_view 			= 'full'; // Default portal view if nothing is set about
				if(isset($propiedades->edit_view)) {
					$edit_view		= $propiedades->edit_view;
					$file_view 		= $modo;//.'_'.$edit_view;
					$file_name 		= 'list_view_mosaic';
				}
			
				# LAYOUT_MAP : Calculate list for layout map
				# All related terms are selected except section that is unset from the array								
				$layout_map_virtual  	= $this->get_layout_map($edit_view);
				$ar_target_section_tipo = $this->get_ar_target_section_tipo();
				$filter_by_locator 		= (array)$dato;

				# CONTEXT : Configure section context
					$context = new stdClass();
						$context->context_name 	= 'list_in_portal';
						$context->portal_tipo 	= $tipo;
						$context->portal_parent = $parent;

				# OPTIONS
				$options = new stdClass();
					$options->modo 		= 'portal_list';
					$options->context 	= $context;
			
				
				# SEARCH_QUERY_OBJECT . Add search_query_object to options
					$search_query_object_options = new stdClass();
						#$search_query_object_options->limit 			 = 1;
						$search_query_object_options->filter_by_locator  = $filter_by_locator;
						$search_query_object_options->section_tipo 		 = reset($ar_target_section_tipo);
						$search_query_object_options->tipo 				 = $tipo;
					$search_query_object = self::build_search_query_object($search_query_object_options);
					
				# SEARCH
				$search_develoment2  = new search_development2($search_query_object);
				$rows_data 		 	 = $search_develoment2->search();


				# AR_COLUMNS
				$ar_columns = $this->get_ar_columns();
				
				!isset($ar_target_section_tipo) ? $ar_target_section_tipo = $this->get_ar_target_section_tipo() : array();
				$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
				break;

		case 'tool_description': // tool_description view_tool_description
			#echo "XXXXXXXXXXXXXXXXX XXXXXXXXXXXXXXXXX XXXXXXXXXXXXXXXXX XXXXXXXXXXXXXXXXX XXXXXXXXXXXXXXXXX "; #return;
			$dato 				= $this->get_dato();
			if (empty($dato)) return null;

			$valor				= $this->get_dato_as_string();
			$component_info 	= $this->get_component_info('json');
			$exclude_elements 	= $this->get_exclude_elements();

			# EDIT VIEW CONFIG (propiedades)
			$edit_view 			= 'full'; // Default portal view if nothing is set about
			if(isset($propiedades->edit_view)) {
				$edit_view		= $propiedades->edit_view;
				$file_view 		= $modo;//.'_'.$edit_view;
				$file_name 		= 'list_view_mosaic';
			}
		
			# LAYOUT_MAP : Calculate list for layout map
			# All related terms are selected except section that is unset from the array
			$layout_map_virtual  	= $this->get_layout_map($edit_view);
			$ar_target_section_tipo = $this->get_ar_target_section_tipo();
			$filter_by_locator 		= (array)$dato;

			# CONTEXT : Configure section context
				$context = new stdClass();
					$context->context_name 	= 'list_in_portal';
					$context->portal_tipo 	= $tipo;
					$context->portal_parent = $parent;

			# OPTIONS
			$options = new stdClass();
				$options->modo 		= 'portal_list';
				$options->context 	= $context;
		
			
			# SEARCH_QUERY_OBJECT . Add search_query_object to options
				$search_query_object_options = new stdClass();
					#$search_query_object_options->limit 			 = 1;
					$search_query_object_options->filter_by_locator  = $filter_by_locator;
					$search_query_object_options->section_tipo 		 = reset($ar_target_section_tipo);
					$search_query_object_options->tipo 				 = $tipo;
				$search_query_object = self::build_search_query_object($search_query_object_options);
				
			# SEARCH
			$search_develoment2  = new search_development2($search_query_object);
			$rows_data 		 	 = $search_develoment2->search();


			# AR_COLUMNS
			$ar_columns = $this->get_ar_columns();
			
			!isset($ar_target_section_tipo) ? $ar_target_section_tipo = $this->get_ar_target_section_tipo() : array();
			$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
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

							$target_section_tipo = $this->get_ar_target_section_tipo()[0];

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