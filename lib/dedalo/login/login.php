<?php
	
	# CONTROLLER
	$id						= NULL;
	$modo					= $this->get_modo();
	$tipo 					= $this->get_tipo();
	
	$ar_tools_obj			= false;
	$ar_components_obj		= $this->load_components();						
	$tipo_active_account	= $this->get_tipo_active_account();
	
	$file_name				= $modo;
	


	# LANG JUMP
	$dedalo_aplication_langs_selector_html = html_page::get_dedalo_aplication_langs_selector_html();

	
	# USERNAME
	$tipo_username	= NULL;
	$html_username 	= '';
	$name			= 'username';
	if(isset($ar_components_obj[$name]) && is_object($ar_components_obj[$name])) {		
		$ar_components_obj[$name]->set_id($name);
		$tipo_username	= $ar_components_obj[$name]->get_tipo();
		$html_username 	= $ar_components_obj[$name]->get_html();			#var_dump($ar_components_obj[$name]);		 
	}
	
	# PASSWORD
	$tipo_password	= NULL;
	$html_password 	= '';
	$name			= 'password';
	if(isset($ar_components_obj[$name]) && is_object($ar_components_obj[$name])) {
		$tipo_password	= $ar_components_obj[$name]->get_tipo();	#dump($ar_components_obj[$name],"[$name]");
		$ar_components_obj[$name]->set_id($name);
		$html_password = $ar_components_obj[$name]->get_html();		
	}
	
	# EMAIL
	$html_email 	= '';
	$name			= 'email';
	if(isset($ar_components_obj[$name]) && is_object($ar_components_obj[$name])) {
		$ar_components_obj[$name]->set_ejemplo(NULL);
		$ar_components_obj[$name]->set_id($name);
		$html_email		= $ar_components_obj[$name]->get_html();			#var_dump($html_password);
	}
	
	# BUTTON LOGIN (SEND) 
	$html_button_login 	= '';
	$name			= 'button_login';
	if(isset($ar_components_obj[$name]) && is_object($ar_components_obj[$name])) {
		$ar_components_obj[$name]->set_ejemplo(NULL);
		$html_button_login		= $ar_components_obj[$name]->get_html();	#dump($ar_components_obj[$name]);
			#dump($html_button_login);
	}
	
	
	
	switch($modo) {
		
		case 'edit'		:	$ar_css		= $this->get_ar_css();							
							break;

		case 'simple'	:	$ar_css		= $this->get_ar_css();	
							$file_name  = 'edit';					
							break;
						
		case 'recover'	:	$ar_css		= $this->get_ar_css();							
							break; false;
	}
		
	$page_html	= 'html/' . get_class($this) . '_' . $file_name . '.phtml';		#dump($page_html);
	include($page_html);
?>