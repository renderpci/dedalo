<?php
	
	# CONTROLLER
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();	
	$html_title				= "Info about $tipo";	
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();	
	$component_name			= get_class($this);	
	$file_name				= $modo;
	
	
	switch($modo) {		

		case 'edit' :

			if ($section_tipo==DEDALO_SECTION_USERS_TIPO) {
				if(SHOW_DEBUG) {
					echo "DEBUG MODE ONLY:";
				}else{
					return null;
				}
			}

			$dato 			= $this->get_dato();
			$permissions	= $this->get_permisions_of_this_area();	
			if(SHOW_DEBUG===true) {
				$permissions	= 3;
			}
			$component_info	= $this->get_component_info('json');

			# HTML_TREE
			$disabled  		= ($permissions<=1) ? 'disabled' : '';	
			$html_tree 		= $this->get_tree($disabled);
			break;	
						
		case 'list' :

			return null;
			/*
			$valor			= $this->get_valor();
			$permissions	= $this->get_permisions_of_this_area();
			
			if (empty($dato)) {
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
			*/
			break;
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
	
?>