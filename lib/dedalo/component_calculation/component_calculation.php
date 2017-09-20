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
		$valor					= $this->get_valor();
		$lang					= $this->get_lang();
		$lang_name				= $this->get_lang_name();
		$identificador_unico	= $this->get_identificador_unico();
		$component_name			= get_class($this);
		$visible				= $this->get_visible();
		$propiedades 			= $this->get_propiedades();

		if($permissions===0) return null;

		# VISIBLE
		if ($visible===false) {
			#return null;
		}

		$file_name				= $modo;

		
		switch($modo) {
			
			case 'tool_lang':
					$file_name = 'edit';
			case 'edit'	:
					js::$ar_url[] = DEDALO_ROOT_WEB . "/lib/json-logic/logic.js";	
					# Verify component content record is inside section record filter
					if ($this->get_filter_authorized_record()===false) return NULL ;				
					
					$id_wrapper = 'wrapper_'.$identificador_unico;
					$input_name = "{$tipo}_{$parent}";

					$dato = htmlentities($dato);
					
					# DATO_REFERENCE_LANG
					$dato_reference_lang= NULL;												
					if (empty($dato) && $this->get_traducible()=='si') { 
						$default_component = $this->get_default_component();
							#dump($default_component,'$default_component');			
					}
					$component_info 	= $this->get_component_info('json');
					$preprocess_formula = json_encode($this->preprocess_formula());
													
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
	?>