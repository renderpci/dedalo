<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
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
		
		case 'edit'	:	$ar_css		= $this->get_ar_css();
						#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
						break;
		
		case 'search' :	$ar_css		= false; 							
						break;
						
		case 'list'	:	$ar_css		= false;
						$max_char = 256;
						if(strlen($dato)>$max_char) $dato = substr($dato,0,$max_char).'..';
						break;

		case 'relation':# Force modo list
						$file_name 	= 'list';
						$ar_css		= false;
						$max_char 	= 256;
						if(strlen($dato)>$max_char) $dato = substr($dato,0,$max_char).'..';
						break;
						
		case 'tool_time_machine' :
						$ar_css		= $this->get_ar_css();
						break;
						
		case 'lang'	:	$ar_css		= $this->get_ar_css();
						$ar_tools_obj			= $this->get_ar_tools_obj();	
						$html_tools				= '';
						# load only time machime tool
						foreach($ar_tools_obj as $tool_obj) {
							if( get_class($tool_obj) == 'tool_time_machine') {																		
								$html_tools .= $tool_obj->get_html();								
							}
						}
						break;	
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>