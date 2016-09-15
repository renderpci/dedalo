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
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";		
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$propiedades 			= $this->get_propiedades();
	$file_name				= $modo;
	
	
	switch($modo) {
		
		case 'tool_lang':
						$file_name = 'edit';

		#case 'portal_edit'	:
		#case 'portal_list'	:
						#$file_name = 'edit';
		case 'edit'	:	
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return NULL ;
				
				$id_wrapper = 'wrapper_'.$identificador_unico;
				$input_name = "{$tipo}_{$parent}";

				$dato = htmlentities($dato);
				
				# DATO_REFERENCE_LANG
				$dato_reference_lang= NULL;												
				if (empty($dato) && $this->get_traducible()=='si') { # && $traducible=='si'
					#$dato_reference_lang = $this->get_dato_default_lang();
					$default_component = $this->get_default_component();
						#dump($default_component,'$default_component');			
				}
				$component_info 	= $this->get_component_info('json');
												
				break;
		case 'print' :
				$dato = htmlentities($dato);

				break;
		case 'tool_time_machine'	:	
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
				break;
						
		case 'list_of_values'	:
				break;

		case 'relation':
				# Force file_name to 'list'
				$file_name  = 'list';
				break;
						
		case 'lang'	:									
				break;
		
		case 'search':
				$dato = empty($dato) ? '' : $dato;

				# Search input name
				$search_input_name = $section_tipo.'_'.$tipo;		
				break;
						
		case 'list_thesaurus':
				$render_vars = $this->get_render_vars();
				$icon_label = isset($render_vars->icon) ? $render_vars->icon : '';
				break;					
	}
	

	#$page_html	= DEDALO_LIB_BASE_PATH .'/'. $component_name . '/html/' . $component_name . '_' . $file_name . '.phtml';
	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>