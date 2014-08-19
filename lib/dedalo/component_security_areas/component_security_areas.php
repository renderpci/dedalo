<?php
	
	# CONTROLLER
	
	
	/**/
	$id 					= $this->get_id(); 
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_string 			= $this->get_dato_as_string();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_permisions_of_this_area();				
	
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $id";
	$ar_tools_obj			= $this->get_ar_tools_obj();
	$html_tools				= '';
	#$ar_list_of_values		= $this->get_ar_list_of_values();
	
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();	
	$component_name			= get_class($this);
	
	$file_name				= $modo;

	$html_tree 				= NULL;
	
	
	switch($modo) {
		
		case 'tool_time_machine' :	
							$ar_css		= false;	
							#break;
		case 'edit'		:	$ar_css		= $this->get_ar_css();
							#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
							switch($permissions) {												
								case 1 :			 	$html_tree = $this->get_tree($disabled='disabled'); break;												
								case ($permissions>=2):	$html_tree = $this->get_tree($disabled=NULL); 		break;													
							}
							break;
						
		case 'search'	:	# Force file_name to 'list'
							$file_name 	= 'list';
							$ar_css		= false;		
							break;
						
		case 'list'		:	$ar_css		= false;
							$ar_authorized_areas_for_user_as_list =	$this->get_ar_authorized_areas_for_user_as_list();	
								#dump($ar_authorized_areas_for_user_as_list,"ar_authorized_areas_for_user_as_list"," ");
							
							if (empty($dato) || !is_array($dato) || count($dato)<1) {
								echo "<span class=\"error\">Areas is empty.<br>Please set at least one</span>";
								return;
							}
							if(empty($ar_authorized_areas_for_user_as_list)) {
								echo "<span class=\"warning\">Areas is empty.<br>Please set at least one</span>";
								return;
							}

							break;

		case 'relation'	:	$ar_css		= false;
							$file_name  = 'list';	
							break;
						
			
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);
	
?>