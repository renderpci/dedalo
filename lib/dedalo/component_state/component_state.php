<?php
	
	# CONTROLLER

	$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();				
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $id";
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$html_tools				= '';	
	$valor					= $this->get_valor();
	$valor_for_checkbox		= $this->get_valor_for_checkbox();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$dato_string			= $this->get_dato_as_string();

	
	
	$ar_list_of_values		= $this->get_ar_list_of_values();		#dump($ar_list_of_values,'ar_list_of_values');

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	
	$file_name				= $modo;



	if ($modo!='edit_tool') {
		# SECURITY RESTRICTIONS. ONLY ADMINS CAN SEE STATE
		$userID_matrix 						= navigator::get_userID_matrix();
		$ar_authorized_admin_areas_for_user = component_security_areas::get_ar_authorized_admin_areas_for_user($userID_matrix, $simple_array=true);
			#dump($ar_authorized_admin_areas_for_user,'$ar_authorized_admin_areas_for_user '.$userID_matrix);
		$section_tipo = navigator::get_selected('area');
		if( !in_array($section_tipo, $ar_authorized_admin_areas_for_user) && component_security_administrator::is_global_admin($userID_matrix)!==true ) {
			return null;
		}
	}

	
	switch($modo) {
		
		case 'edit'		:	$ar_css		= $this->get_ar_css();
							$id_wrapper = 'wrapper_'.$identificador_unico;
							$input_name = "{$tipo}_{$id}";

							#dump($dato,'dato');
							$estado = $this->get_estado();
								#dump($estado,'estado');

							break;

		case 'edit_tool':	$ar_css		= $this->get_ar_css();
							$id_wrapper = 'wrapper_'.$identificador_unico;
							$input_name = "{$tipo}_{$id}";

							# Rotulo
							if(strpos($this->caller_element, ':')!==false) {
								$ar_bits = explode(':', $this->caller_element);
									#dump($ar_bits,'$ar_bits');
								$rotulo	= label::get_label($ar_bits[0]);
								if(strpos($ar_bits[1], 'lg-')!==false) {
									$rotulo 	.= ' : '. RecordObj_ts::get_termino_by_tipo($ar_bits[1]) ;
								}								
							}else{
								$rotulo 	= label::get_label($this->caller_element);
							}

							# Bool estado actual
							$estado 	= $this->map_dato_to_current_element();							

							break;

		case 'tool_time_machine'		:	
							$ar_css		= $this->get_ar_css();
							$file_name 	= 'edit';
							$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
							$input_name = "{$tipo}_{$id}_tm";	
							break;						
						
		case 'search'	:	$ar_css		= false;
							return null;
							break;
						
		case 'portal_list'	:
							$file_name = 'list';

		case 'list_tm' :	
							# En time machine list NO generamos html
							return null;
							break;
							
		case 'list'		:	$ar_css		= false;

							# Bool estado actual
							$estado = $this->get_estado();


							break;

		case 'relation'	:	$file_name 	= 'list';
							$ar_css		= false;
							break;	
						
		
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);
	}
	include($page_html);
?>