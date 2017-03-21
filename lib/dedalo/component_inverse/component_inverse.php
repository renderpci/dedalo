<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$html_title				= "Info about $tipo";		
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$file_name				= $modo;
	
	if($permissions===0) return null;
	
	switch($modo) {		
	
		case 'edit':
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= "{$tipo}_{$parent}";				
				$component_info = $this->get_component_info('json');
				$dato_json 		= json_encode($dato);
			
				# Propiedades custom config
    			$propiedades  = $this->get_propiedades();
    			$inverse_show = $propiedades->inverse_show;
				break;

		case 'print':
				$dato = intval($dato);
				break;
		
		case 'portal_list':
				if(empty($valor)) return null;		
				break;

		case 'list'	:
				$dato_json 		= json_encode($dato);
				
				# Propiedades custom config
    			$propiedades  = $this->get_propiedades();
    			$inverse_show = $propiedades->inverse_show;	
				break;

		case 'search':
				# Showed only when permissions are >1
				if ($permissions<1) return null;
				
				if ($dato<1) {
					$dato = null;
				}

				$ar_comparison_operators = $this->build_search_comparison_operators();
				$ar_logical_operators 	 = $this->build_search_logical_operators();

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;					
	}
	

	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>