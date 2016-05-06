<?php
	
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
				
				#$file_name	= 'edit';								
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
				$ar_comparison_operators 	= $this->build_search_comparison_operators();
				$ar_logical_operators 		= $this->build_search_logical_operators();	
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