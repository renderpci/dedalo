<?php
	
	# CONTROLLER	
	
	$id					= $this->get_id();
	$tipo				= $this->get_tipo();
	$permissions		= common::get_permissions($tipo);
	$label				= $this->get_label();
	$modo				= $this->get_modo();
	$ar_section			= $this->get_ar_section();
	$selected_section 	= navigator::get_selected('section');
	
	
	$html_section 		 = '';	
	
	# Verificamos que existe. Si no, saltamops a la default	
	if (!isset($selected_section)) {
				
		$default_section 	 = reset($ar_section);
		if(is_object($default_section))
		$html_section 		.= $default_section->get_html();//print_r($key); die();
		
	}else{
				
		if(isset($ar_section[$selected_section]))
		$html_section 		.= $ar_section[$selected_section]->get_html();//var_dump($ar_section[$selected_section]);	
	}

			

	# LOAD PAGE	
	switch($modo) {
		
		case 'edit'		:							
							break;								
						
		case 'list'		:
							break;	
						
	}
		
	$page_html	= 'html/' . get_class($this) . '.phtml';		#dump($page_html);
	include($page_html);
?>