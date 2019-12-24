<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();
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

	
	switch($modo) {
		
		# EDIT MODE
		# Build section list from array of section's id stored in component_portal dato
		case 'edit_in_list':
				// Fix always edit as modo / filename
				$modo 			= 'edit';
				$file_name		= 'edit';

				$wrap_style 	= ''; //'width:100%'; // Overwrite possible custon component structure css

				// Dont break here. Continue as modo edit
		#case 'portal_list_view_mosaic':
		#		$file_name		= 'edit';

		case 'tool_description':
				$file_name		= 'edit';			

		case 'edit':

				#
				# SEMANTIC NODES JS/CSS ADD
				js::$ar_url[]  = DEDALO_CORE_URL."/tools/tool_semantic_nodes/js/tool_semantic_nodes.js";
				css::$ar_url[] = DEDALO_CORE_URL."/tools/tool_semantic_nodes/css/tool_semantic_nodes.css";
				

				$dato 			= $this->get_dato();
				$component_info	= $this->get_component_info('json');

				$ar_target_section_tipo 	 = $this->get_ar_target_section_tipo();
				$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
	
				$max_records 	= isset($this->propiedades->max_records) ? (int)$this->propiedades->max_records : 10;
				$offset 		= 0; // Initial is 0
				$n_rows 		= count($dato);
				
				break;

		case 'portal_list' :
		case 'list_tm' :
		
				$file_name		= 'list';

		# LIST MODE
		# Build section list from array of section's id stored in component_portal dato
		case 'list' :

				# Custom propiedades external dato 
				$dato = $this->get_dato();
				if (empty($dato)){
					if(isset($propiedades->source->mode) && $propiedades->source->mode==='external') {
						$this->set_dato_external(false);	// Forces update dato with calculated external dato					
						$dato = $this->get_dato();
						if (empty($dato)) return null;
					}else{
						return null;
					}
				} 
				
				$ar_target_section_tipo 	 = $this->get_ar_target_section_tipo();
				$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
				$filter_by_locator[] 		 = reset($dato);

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
						$search_query_object_options->tipo 				 = $this->tipo;
					$search_query_object = component_portal::build_search_query_object($search_query_object_options);

				# SEARCH
				$search_develoment2  = new search_development2($search_query_object);
				$rows_data 		 	 = $search_develoment2->search();


				# AR_COLUMNS
				$ar_columns = $this->get_ar_columns();
				break;

		# SEARCH MODE
		case 'search':

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				return null;
				break;

		# PRINT MODE
		case 'print':

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
					$ar_target_section_tipo = $this->get_ar_target_section_tipo();
					$filter_by_locator = (array)$dato;

					# OPTIONS
					$options = new stdClass();
						$options->modo  		= 'portal_list';

						# OPTIONS CONTEXT : Configure section context
						$context = new stdClass();
							$context->context_name 	= 'list_in_portal';
							$context->portal_tipo 	= $tipo;
							$context->portal_parent = $parent;

						$options->context = $context;
							#dump($options,"options");									
					

					# SEARCH_QUERY_OBJECT . Add search_query_object to options
					$search_query_object_options = new stdClass();
						#$search_query_object_options->limit 			 = 1;
						$search_query_object_options->filter_by_locator  = $filter_by_locator;
						$search_query_object_options->section_tipo 		 = reset($ar_target_section_tipo);
						$search_query_object_options->tipo 		 		 = $this->tipo;
					$search_query_object = component_portal::build_search_query_object($search_query_object_options);
					# Search
					$search_develoment2  = new search_development2($search_query_object);
					$rows_data 		 	 = $search_develoment2->search();					
				}
				
				$ar_columns = $this->get_ar_columns();	
			
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
						$search_query_object_options->tipo 				 = $this->tipo;
					$search_query_object = component_portal::build_search_query_object($search_query_object_options);
						#dump($search_query_object, ' search_query_object ++ '.to_string());
					
				# SEARCH
				$search_develoment2  = new search_development2($search_query_object);
				$rows_data 		 	 = $search_develoment2->search();


				# AR_COLUMNS
				$ar_columns = $this->get_ar_columns();
				
				!isset($ar_target_section_tipo) ? $ar_target_section_tipo = $this->get_ar_target_section_tipo() : array();
				$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
				break;

		case 'tool_description': // tool_description view_tool_description
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
					$search_query_object_options->tipo 				 = $this->tipo;
				$search_query_object = component_portal::build_search_query_object($search_query_object_options);
				
			# SEARCH
			$search_develoment2  = new search_development2($search_query_object);
			$rows_data 		 	 = $search_develoment2->search();


			# AR_COLUMNS
			$ar_columns = $this->get_ar_columns();
			
			!isset($ar_target_section_tipo) ? $ar_target_section_tipo = $this->get_ar_target_section_tipo() : array();
			$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
			break;
		
	}//end switch($modo) 
	
	
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>