<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$dato 					= $this->get_dato();
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	if($modo != 'simple')
	$permissions			= $this->get_component_permissions();	
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";	
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$propiedades 			= $this->get_propiedades();

	if($permissions===0) return null;


	$file_name = $modo;

						dump($modo, ' modo +--------------+ '.to_string());
	switch($modo) {		

		case 'tool_lang':
				$file_name = 'edit';
		case 'edit_in_list':
				$file_name = 'edit';

		case 'edit'	:
				if ($this->get_filter_authorized_record()===false) return NULL;
				
				// Add library js
					js::$ar_url[] = DEDALO_ROOT_WEB . "/lib/json-logic/logic.js";	
					#js::$ar_url[] = DEDALO_ROOT_WEB . '/lib/dedalo/extras/mdcat/calculation/mdcat.js'; //DEDALO_LIB_BASE_URL . "/extras/ "+custom.file;
				
				// Edit vars
					$valor 			= $this->get_valor();
					$dato 			= htmlentities($valor);
					$id_wrapper 	= 'wrapper_'.$identificador_unico;
					$input_name 	= $tipo .'_'. $parent;
					$component_info = $this->get_component_info('json');
							
				// Dato_reference_lang
					$dato_reference_lang = null;

				// default_component
					if (empty($dato) && $this->get_traducible()==='si') { 
						$default_component = $this->get_default_component();
					}

				// components_formula . get the components that has the values to process
					$ar_components_formula = $this->get_ar_components_formula();
					$ar_components_formula = json_encode($ar_components_formula);

				// aditional_save_event . propiedades aditional_save_event components
					$aditional_save_event = (isset($propiedades->aditional_save_event)) ? (array)$propiedades->aditional_save_event : [];
				
				// preprocess_formula
					$preprocess_formula = $this->preprocess_formula();
					$preprocess_formula = json_encode($preprocess_formula, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE);				
				break;

		case 'print' :
				$dato = htmlentities($dato);
				break;

		case 'tool_time_machine':				
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";	
				# Force file_name
				$file_name  = 'edit';
				break;
				
		case 'portal_list':
				if(empty($valor)) return null;					
		case 'list_tm' :
				$file_name = 'list';						
		case 'list'	:
				$valor = $this->get_valor();
				break;
						
		case 'list_of_values':				
				break;

		case 'relation':
				# Force file_name to 'list'
				$file_name  = 'list';				
				break;
						
		case 'lang'	:														
				break;
		
		case 'search':
				# dato is injected by trigger search wen is needed
				$dato = isset($this->dato) ? $this->dato : '';

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();				
				break;
						
		case 'simple':				
				break;						
	}
	

	#$page_html	= DEDALO_LIB_BASE_PATH .'/'. $component_name . '/html/' . $component_name . '_' . $file_name . '.phtml';
	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
