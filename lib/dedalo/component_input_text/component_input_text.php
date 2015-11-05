<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();		#dump($this);
	if($modo != 'simple')
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";		
	$html_tools				= '';
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();

	# VISIBLE
	if ($visible===false) {
		#return null;
	}


	

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
				
				$ar_css		= $this->get_ar_css();
				$id_wrapper = 'wrapper_'.$identificador_unico;
				$input_name = "{$tipo}_{$parent}";

				$dato = htmlentities($dato);
					#dump($this, ' dato ++ '.to_string($this->tipo));
				
				# DATO_REFERENCE_LANG
				$dato_reference_lang= NULL;												
				if (empty($dato) && $this->get_traducible()=='si') { # && $traducible=='si'
					#$dato_reference_lang = $this->get_dato_default_lang();
					$default_component = $this->get_default_component();
						#dump($default_component,'$default_component');			
				}
				$component_info 	= $this->get_component_info('json');
				
				#$ar_tools_obj			= $this->get_ar_tools_obj();
				#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
				#$file_name	= 'edit';								
				break;
		case 'print' :
				$dato = htmlentities($dato);

				break;
		case 'tool_time_machine'	:	
				$ar_css		= $this->get_ar_css();
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
				$ar_css		= false;
				break;

		case 'relation':
				# Force file_name to 'list'
				$file_name  = 'list';
				$ar_css		= false;
				break;
						
		case 'lang'	:
				$ar_css = $this->get_ar_css();										
				break;
		
		case 'search':
				$ar_comparison_operators 	= $this->build_search_comparison_operators();
				$ar_logical_operators 		= $this->build_search_logical_operators();
				$ar_css = false;		
				break;
						
		case 'simple':
				$ar_css = false;	
				break;						
	}
	

	#$page_html	= DEDALO_LIB_BASE_PATH .'/'. $component_name . '/html/' . $component_name . '_' . $file_name . '.phtml';
	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>