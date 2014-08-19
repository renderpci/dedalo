<?php
	
	# CONTROLLER
	
	$tipo				= $this->get_tipo();
	$permissions		= common::get_permissions($tipo);
	$modo				= $this->get_modo();
	#$ar_component_obj	= $this->get_ar_component_obj();

	$ar_label_html		= array();
	$file_name 			= $modo;	

	
	#if(isset($ar_component_obj) && is_array($ar_component_obj)) foreach($ar_component_obj as $tipo => $component_obj) {						
	#	$ar_label_html[$tipo] = $component_obj->get_label();
	#}

	
	if(is_array($this->ar_components_tipo)) foreach($this->ar_components_tipo as $current_tipo) {
		$ar_label_html[$current_tipo] = RecordObj_ts::get_termino_by_tipo($current_tipo, DEDALO_DATA_LANG);
	}
	
	
	switch($modo) {
		

		case 'portal_list' :
						$file_name = 'list';
						#return  null;
						break;

		case 'list'	:	# Nothing too do						
						break;
		
		case 'relation':# Nothing too do
						break;

		case 'list_tm':	$file_name ='list';# Nothing too do
						break;

		case 'relation_reverse_sections': 
						$file_name = 'relation_reverse';
						break;			
	}
					
	# LOAD PAGE FOR EVERY ROW
	$page_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';	
	include($page_html);	
	
	
?>