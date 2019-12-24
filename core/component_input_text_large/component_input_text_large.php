<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";		
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	#$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();

	if($permissions===0) return null;
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	
	
	switch($modo) {
		
		case 'tool_lang':
				$file_name = 'edit';
		case 'tool_transcription':
				#$file_name = 'edit';
		case 'edit'	:	
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= "{$tipo}_{$parent}";
				$component_info = $this->get_component_info('json');
				/*			
				if (empty($dato)) { # && $traducible=='si'
					$dato_reference_lang = $this->get_dato_default_lang();#$this->get_ejemplo();	#RecordObj_dd::get_termino_by_tipo($tipo,DEDALO_DATA_LANG_DEFAULT);						
				}
				*/												
				break;

		case 'print' :
			break;

		case 'tool_time_machine' :						
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";	
				# Force file_name
				$file_name  = 'edit';
				break;
						
		case 'portal_list':						
		case 'list_tm' :
				$file_name = 'list';						
		case 'list'	:	
				break;
						
		case 'list_of_values' :						
				break;

		case 'relation':# Force file_name to 'list'
				$file_name  = 'list';
				break;
						
		case 'lang'	:	
				break;
		
		case 'search':
				# dato is injected by trigger search wen is needed
				$dato = isset($this->dato) ? $this->dato : null;
				
				#$ar_comparison_operators 	= $this->build_search_comparison_operators();
				#$ar_logical_operators 		= $this->build_search_logical_operators();

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;
										
	}
	
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>