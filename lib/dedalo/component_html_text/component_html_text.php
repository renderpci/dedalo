<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato(); 
	$caller_id 				= navigator::get_selected('caller_id');		
	$caller_tipo 			= navigator::get_selected('caller_tipo');
	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";	
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang(); 
	#$lang_name				= $this->get_lang_name();
	$traducible 			= $this->get_traducible();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$dato_raw 				= '';//tools::truncate_text(htmlspecialchars($valor),300);	#tools::truncate_text($string, $limit, $break=" ", $pad="...")	
	$context 				= $this->get_context();
	$context_name 			= isset($context->context_name) ? $context->context_name : null;

	# Propiedades puede asignar valores de configuración del editor de texto (tinyMCE)
	$propiedades 		= $this->get_propiedades();
	$propiedades_json 	= json_encode($propiedades);
	if ($propiedades_json==null) {
		$clean_obj = new stdClass();
		$propiedades_json = json_encode($clean_obj);
	}

	if($permissions===0) return null;

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	

	$file_name = $modo;


	js::$ar_url[]  = TEXT_EDITOR_URL_JS; # tinyMCE
	js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/component_html_text/js/component_html_text_editor.js';
	js::$ar_url[]  = DEDALO_ROOT_WEB."/lib/tinymce/plupload/js/plupload.full.min.js";
		
	
	switch($modo) {
		
		#case 'portal_list'	:
						#$file_name = 'edit';
		case 'edit'	:
					$id_wrapper 		= 'wrapper_'.$identificador_unico;
					$input_name 		= "{$tipo}_{$parent}";
					$text_area_tm 		= NULL;
					$component_info 	= $this->get_component_info('json');
					
					# DATO_REFERENCE_LANG
					/*
					$dato_reference_lang= NULL;
					if (empty($dato) && $traducible==='si') { # && $traducible=='si'
						#$dato_reference_lang = $this->get_dato_default_lang();
						$default_component = $this->get_default_component();
							#dump($default_component,'$default_component');
					}*/									
					break;
		
		case 'tool_lang' :
					#$id_wrapper 		= 'wrapper_'.$identificador_unico.'_tool_lang';
					$id_wrapper 		= 'wrapper_'.$identificador_unico;
					$input_name 		= "{$tipo}_{$parent}";
					$text_area_tm 		= NULL;
					$dato_reference_lang= NULL;
					# Force file_name
					#$file_name  = 'edit';
					break;
		
		case 'tool_time_machine' :
					# Asignado al componente en trigger time machine
					#$version_date 		= $this->get_version_date();	#dump($version_date,'version_date');

					$id_wrapper 		= 'wrapper_'.$identificador_unico.'_tm';
					$input_name 		= "{$tipo}_{$parent}_tm";
					$text_area_tm 		= 'text_area_tm';
					$dato_reference_lang= NULL;												
					if (empty($dato)) { # && $traducible=='si'
						$dato_reference_lang = $this->get_dato_default_lang();		
					}						
					# Force file_name
					$file_name  = 'edit';	
					break;
		
		case 'search' :
					# dato is injected by trigger search wen is needed
					$dato = isset($this->dato) ? $this->dato : null;

					# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
					# and recovered in component_common->get_search_input_name()
					# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
					$search_input_name = $this->get_search_input_name();		
					break;					
		
		case 'portal_list'	:
					if(empty($dato)) return null;
					$file_name = 'list';			
		case 'list_tm' :
					$file_name = 'list';						
		case 'list'	:
					$max_char = 256;
					#if(strlen($valor)>$max_char) $valor = substr($valor,0,$max_char).'..';
					$fragmento_text = tools::truncate_text($valor,$max_char);
					echo $fragmento_text;
					return;
					break;						
		
		case 'lang'	:
					break;
		case 'diffusion' :
					break;	
	}



	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}


?>