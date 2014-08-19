<?php
	
	# CONTROLLER

	$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();		#dump($this);
	if($modo != 'simple')
	$permissions			= common::get_permissions($tipo); 	
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $id";		
	$html_tools				= '';
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	#$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();


	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	
	
	switch($modo) {
		
		case 'tool_lang':
						$file_name = 'edit';

		case 'edit'	:	$ar_css		= $this->get_ar_css();
						$id_wrapper = 'wrapper_'.$identificador_unico;
						$input_name = "{$tipo}_{$id}";
						$aditional_css  = $this->get_element_aditional_css();
											
						if (empty($dato)) { # && $traducible=='si'
							$dato_reference_lang = $this->get_dato_default_lang();#$this->get_ejemplo();	#RecordObj_ts::get_termino_by_tipo($tipo,DEDALO_DATA_LANG_DEFAULT);						
						}
														
						break;

		case 'tool_time_machine'	:	
						$ar_css		= $this->get_ar_css();
						$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
						$input_name = "{$tipo}_{$id}_tm";	
						# Force file_name
						$file_name  = 'edit';
						break;
						
		case 'portal_list':						
		case 'list_tm' :
						$file_name = 'list';
						
		case 'list'	:	$ar_css		= false;
						break;
						
		case 'list_of_values'	:
						$ar_css		= false;
						break;

		case 'relation':# Force file_name to 'list'
						$file_name  = 'list';
						$ar_css		= false;
						break;
						
		case 'lang'	:	$ar_css		= $this->get_ar_css();						
						break;
		
		case 'search':	$ar_css		= false;		
						break;
										
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);
?>