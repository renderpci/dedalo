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
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";
	#$ar_tools_obj			= $this->get_ar_tools_obj();	dump($ar_tools_obj," ar_tools_obj");
	$html_tools				= '';
	$valor					= $this->get_valor();				#dump($valor," valor");
	$valor_for_checkbox		= $this->get_valor_for_checkbox(); 	#dump($valor_for_checkbox," valor_for_checkbox");
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$dato_string			= $this->get_dato_as_string();

	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	
	$file_name				= $modo;

return null; # DESACTIVO DE MOMENTO. POR ACABAR ESTE COMPONENTE !!!

	if ($modo!='edit_tool') {
		# SECURITY RESTRICTIONS. ONLY ADMINS CAN SEE STATE
		$user_id 						= navigator::get_user_id();
		$ar_authorized_admin_areas_for_user = component_security_areas::get_ar_authorized_areas_for_user($user_id, $mode_result='admin', DEDALO_COMPONENT_SECURITY_AREAS_USER_TIPO);
			#dump($ar_authorized_admin_areas_for_user,'$ar_authorized_admin_areas_for_user '.$user_id);
		$section_tipo = navigator::get_selected('area');

		if( !in_array($section_tipo, $ar_authorized_admin_areas_for_user) && component_security_administrator::is_global_admin($user_id)!==true ) {
			return null;
		}
	}
	
	
	switch($modo) {
		
		case 'edit'	:	
					$ar_css		= $this->get_ar_css();
					$id_wrapper = 'wrapper_'.$identificador_unico;
					$input_name = "{$tipo}_{$tipo}";

					#dump($dato,'dato');
					$estado = $this->get_estado();
						#dump($estado,'estado');

					$component_info = $this->get_component_info('json');
						#dump($component_info," component_info");
					break;

		case 'edit_tool' :
					$ar_css		= $this->get_ar_css();
					$id_wrapper = 'wrapper_'.$identificador_unico;
					$input_name = "{$tipo}_{$tipo}";

					# Rótulo
					if(strpos($this->caller_element, ':')!==false) {
						$ar_bits = explode(':', $this->caller_element);
							#dump($ar_bits,'$ar_bits');
						$rotulo	= label::get_label($ar_bits[0]);
						if(strpos($ar_bits[1], 'lg-')!==false) {
							$rotulo .= ' : '. RecordObj_ts::get_termino_by_tipo($ar_bits[1],null,true) ;
						}								
					}else{
						$rotulo = label::get_label($this->caller_element);
					}

					# Bool estado actual
					$estado = $this->map_dato_to_current_element();							
						#dump($estado,"estado ");
					break;							
						
		case 'search' :
					return null;
					break;
						
		case 'portal_list' :
					$file_name = 'list';							
		case 'list' :	
					$ar_css		= false;
					# Bool estado actual
					$estado = $this->get_estado();

					break;
		/*
		case 'tool_time_machine'		:	
					$ar_css		= $this->get_ar_css();
					$file_name 	= 'edit';
					$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
					$input_name = "{$tipo}_{$tipo}_tm";	
					break;	
		*/				
		
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>