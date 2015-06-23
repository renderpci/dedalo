<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();				
	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	if($modo != 'simple')
	$permissions			= common::get_permissions($tipo); 	
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";
	$ar_tools_obj			= NULL;	
	$html_tools				= '';
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	
	#dump($valor);
			
	
	switch($modo) {
		
		case 'edit'	:	$ar_css		= $this->get_ar_css();
						$component_info 	= $this->get_component_info('json');															
						break;
						
		case 'list_tm' :
						$file_name = 'list';
						
		case 'list'	:	$ar_css		= false;
						break;
												
	}
	
	$page_html	= 'html/' . get_class($this) . '_' . $modo . '.phtml';		#dump($page_html);
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>