<?php
	
	# CONTROLLER
	
	
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_string 			= $this->get_dato_as_string();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo,$tipo);		
	
	$html_title				= "Info about $tipo";
	
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();	
	$component_name			= get_class($this);

	$ar_user_tools 			= $this->get_ar_user_tools();
		#dump($ar_user_tools," ar_user_tools");
	
	$file_name				= $modo;
	
	if($permissions===0) return null;
	
	switch($modo) {

		case 'edit'		:	

				if ($section_tipo==DEDALO_SECTION_USERS_TIPO) {
					if(SHOW_DEBUG) {
						echo "DEBUG MODE ONLY:";
					}else{
						return null;
					}					
				}
				
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= "{$tipo}_{$parent}";					
				$component_info = $this->get_component_info('json');

				$ar_tools = $this->get_ar_tools_resolved();	#dump($ar_tools,'ar_tools');					
				break;	

		case 'list' : 
				return null;	
				break;			
			
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
	
