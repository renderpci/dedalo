<?php
	
	# CONTROLLER
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	#$dato 					= nl2br($dato);			

	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	if($modo != 'simple')
	$permissions			= common::get_permissions($tipo); 	
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";
	
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$dato_raw 				= tools::truncate_text(htmlspecialchars($dato),300);	#tools:truncate_text($string, $limit, $break=" ", $pad="...")

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	$file_name				= $modo;
	
	switch($modo) {
		
		case 'edit'	:
						break;
		
		case 'search' :						
						break;
						
		case 'list'	:
						$max_char = 256;
						if(strlen($dato)>$max_char) $dato = substr($dato,0,$max_char).'..';
						break;

		case 'relation':# Force modo list
						$file_name 	= 'list';
						$max_char 	= 256;
						if(strlen($dato)>$max_char) $dato = substr($dato,0,$max_char).'..';
						break;
						
		case 'tool_time_machine' :
						break;
						
		case 'lang'	:
						break;	
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>