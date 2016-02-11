<?php
	
	# CONTROLLER
	
	
	/**/
	#$id 					= $this->get_id(); 
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_string 			= $this->get_dato_as_string();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();				
	
	$html_title				= "Info about $tipo";
	
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();	
	$component_name			= get_class($this);
	
	$file_name				= $modo;

	$html_tree 				= '';
	

	
	switch($modo) {
		
		case 'tool_time_machine' :
					$ar_css		= false;	
					#break;
		case 'edit' :
					if ($section_tipo==DEDALO_SECTION_USERS_TIPO) {
						if(SHOW_DEBUG) {
							echo "DEBUG MODE ONLY:";
						}else{
							return null;
						}
					}

					$permissions	= $this->get_permisions_of_this_area();		#dump($permissions,"permissions");
					$ar_css			= array();#$this->get_ar_css();
					$component_info	= $this->get_component_info('json');		#dump($component_info,"component_info");
					#$ar_tools_obj	= $this->get_ar_tools_obj();
					#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();

					#dump($this); die("44- $permissions");
					switch($permissions) {												
						case 1 :			 	$html_tree = $this->get_tree($disabled='disabled'); break;												
						case ($permissions>=2):	$html_tree = $this->get_tree($disabled=NULL); 		break;													
					}



					break;
						
		case 'search' :	
					# Force file_name to 'list'
					$file_name 	= 'list';
					$ar_css		= false;	
					break;
						
		case 'list' :	
					$ar_css			= false;
					$permissions	= $this->get_permisions_of_this_area();	

					$dato_array = (array)$dato;
					if (empty($dato_array) || count($dato)<1) {
						echo "<span class=\"error\">Areas selector is empty.<br>Please set at least one (1)</span>";
						return;
					}

					#$is_global_admin 	= component_security_administrator::is_global_admin($user_id);

					$ar_authorized_areas_for_user_as_list =	(array)$this->get_ar_authorized_areas_for_user_as_list();	
						#dump($ar_authorized_areas_for_user_as_list,"ar_authorized_areas_for_user_as_list"," ");

					if(empty($ar_authorized_areas_for_user_as_list)) {
						echo "<span class=\"warning\">Areas selector is empty.<br>Please set at least one (2)</span>";
						return;
					}
					break;

		case 'relation'	:	
					$ar_css		= false;
					$file_name  = 'list';
					break;						
			
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
	
?>