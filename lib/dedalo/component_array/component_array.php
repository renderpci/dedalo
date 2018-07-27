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
	$permissions			= $this->get_component_permissions(); 	
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$file_name				= $modo;
		
	if($permissions===0) return null;
	
	switch($modo) {
		
		case 'tool_lang':
				$file_name = 'edit';

		case 'edit'	:	
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return NULL ;				
			
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$component_info	= $this->get_component_info('json');			
				break;
		#case 'print' :
		case 'tool_time_machine' :			
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";	
				# Force file_name
				$file_name  = 'edit';
				break;
				
		case 'portal_list':
				if(empty($valor)) return null;
		case 'print' :
		case 'list_tm' :
				$file_name = 'list';
						
		case 'list'	:	
				break;						
		
		case 'search':
				# Showed only when permissions are >1
				if ($permissions<1) return null;
				
				return null;						
				break;					
	}
	

	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>