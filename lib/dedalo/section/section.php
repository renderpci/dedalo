<?php
	
	# CONTROLLER
	
	
	$id						= $this->get_id();
	$section_id 			= $this->get_section_id();
	$created_date			= $this->get_created_date();
	$created_by_user		= $this->get_created_by_user();
	$tipo					= $this->get_tipo();
	$parent					= $this->get_parent();
	$lang					= $this->get_lang();
	$dato					= $this->dato;
	$permissions			= common::get_permissions($tipo);
	$label					= $this->get_label();
	$modo					= $this->get_modo();				
	$ar_css					= $this->get_ar_css();
	$component_name			= get_class($this);
	$identificador_unico	= $this->get_identificador_unico();	
	$caller_id 				= $this->get_caller_id();
	
	$context 				= $this->get_context();
		#dump($context,'context');

	#$ar_section_list_obj	= $this->get_ar_section_list_obj();
		#dump($ar_section_list_obj,'ar_section_list_obj',"ar_section_list_obj en section controller ");
		#dump($ar_section_group_obj,'ar_section_group_obj',"ar_section_group_obj en section controller ");
	
	$file_name			= $modo;	#dump($modo,'modo');

	#dump(filter::$ar_records_unassigned);
	#echo "section modo: $modo";
	

	# COMPONENTS HTML
	$html_section_add  ='';
	
	
	#
	# DEDALO SUPERUSER 
	# Avoid show DEDALO_SUPERUSER to edit
	$table = $this->get_matrix_table();
	if($id==DEDALO_SUPERUSER && $table=='matrix') {		
		$msg="Error Processing Request.";
		if(SHOW_DEBUG) $msg .= "<hr>Current user is not editable : $table";
		throw new Exception($msg, 1);
	}

	
	switch($modo) {		
		

		case 'edit'	:	# If ar_id_records is empty (filter verification ) permissions are set to 0 to prevent current logged user
						# access to current record
						if (empty(static::$ar_id_records)) {
							return null;
							trigger_error("Set permissions to 0 because no records area found in ar_ir_records");
							$permissions = 0;	#You are not authorized to view this content 
						}
 						#dump(static::$ar_id_records);

						$html_section_add = $generated_content_html;

						# INSPECTOR
						$html_inspector = NULL;
						$show_inspector	= $this->get_show_inspector();						
						if ($show_inspector) {
							/*
							# Change modo temporally to get inspector html
							$this->modo 	= 'edit_inspector';
							$html_inspector = $this->get_html();
							# Restore original modo and continue
							$this->modo 	= 'edit';
							*/
							$inspector 		= new inspector($modo);
							$html_inspector = $inspector->get_html();
						}						

						#dump($this->caller_id,'$this->caller_id');
						#if($this->caller_id>0)
						#$file_name = 'portal_edit';

						$id_wrapper 	= 'wrap_section_'.$identificador_unico;						
						break;

		case 'list'	:	#if(is_array($ar_section_list_obj)) foreach($ar_section_list_obj as $section_list) {
						#	$html_section_add	.= $section_list->get_html();
						#}

						# Time machine button
						switch ($context) {
							case 'list_into_tool_portal':
								# nothing to do
								$html_section_tm='';
								break;
							default:									
								$tool_time_machine	= new tool_time_machine($this,'button_section_list');
								$html_section_tm 	= $tool_time_machine->get_html();	
						}						

						$html_section_add = $generated_content_html;						
						break;

		case 'search' :	#foreach ($ar_section_group_obj as $group) {									
						#	$html_section_add	.= $group->get_html($ar_components);	
						#}						
						break;
		
		case 'portal_edit' :
						break;

		case 'portal_list'	:
						#$file_name = 'list';
						$html_section_add = $generated_content_html;					
						break;

		case 'list_tm':	$html_section_add = $generated_content_html;						
						break;
						#$file_name = 'list';
		

		case 'relation':#if(is_array($ar_section_list_obj)) foreach($ar_section_list_obj as $section_list) {
						#	$html_section_add	.= $section_list->get_html();
						#}
						$html_section_add = $generated_content_html;	
						break;

		case 'relation_reverse_sections':
						$file_name = 'relation_reverse';
		case 'relation_reverse':
						#if(is_array($ar_section_list_obj)) foreach($ar_section_list_obj as $section_list) {
						#	$html_section_add	.= $section_list->get_html();
						#}
						$html_section_add = $generated_content_html;
						break;

		case 'time_machineXX':
						$html_section_add = $generated_content_html;	
						break;

		default: return "Error: modo '$modo' is not valid! ";
	}
		

		
	 
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';	
	include($page_html);

?>