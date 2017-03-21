<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_id 			= $parent;
	$section_tipo			= $this->get_section_tipo();
	$propiedades			= $this->get_propiedades();
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= null;
	$html_title				= "Info about $tipo";
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$context 				= $this->get_context();	
	$file_name 				= $modo;

	if($permissions===0) return null;
	
	if (!defined('DEDALO_FILTER_USER_RECORDS_BY_ID') || DEDALO_FILTER_USER_RECORDS_BY_ID!==true) {
		return null;
	}

	if(SHOW_DEBUG!==true) {
		//return null;
	}
	
	switch($modo) {
		
		case 'edit'	:
		
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return null; //($lang=DEDALO_DATA_LANG, $id_path=false, $referenced_section_tipo=false, $filter_custom=false) 

				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				$input_name 		= "{$tipo}_{$parent}";
				$component_info 	= $this->get_component_info('json');
				$dato 				= $this->get_dato();				
				$dato_string		= json_handler::encode($dato);

				$ar_section_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name('section');
				$ar_sections = array();
				$permissions_user = security::get_permissions_table_of_specific_user($parent);
				foreach ($ar_section_tipo as $current_section_tipo) {
					$section_permissions = isset($permissions_user->$current_section_tipo->$current_section_tipo) ? (int)$permissions_user->$current_section_tipo->$current_section_tipo : 0;
					if ($section_permissions>0) {

						$plain_value = '';
						if (isset($dato[$current_section_tipo])) {
							$plain_value = implode(',', (array)$dato[$current_section_tipo]);
						}

						$label = RecordObj_dd::get_termino_by_tipo($current_section_tipo, DEDALO_DATA_LANG, true, true); //, $terminoID, $lang=NULL, $from_cache=false, $fallback=true					

						$data = array(
							'label' 	  => $label,
							'permissions' => $section_permissions,
							'plain_value' => $plain_value,
							);
						$ar_sections[$current_section_tipo] = $data;
					}					
				}
				# sort by label
				uasort($ar_sections, function($a, $b) {
				    return $a['label'] > $b['label'];
				});
				#dump($ar_sections, ' ar_sections ++ '.to_string($parent)." ".count($ar_sections));
				break;

		case 'tool_time_machine' :
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				$file_name 	= 'edit';
				break;
						
		case 'search':
				# Showed only when permissions are >1
				if ($permissions<1) return null;
							
				$ar_comparison_operators = $this->build_search_comparison_operators();
				$ar_logical_operators 	 = $this->build_search_logical_operators();

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;
					
		case 'portal_list' :
		case 'list_tm' :
				$file_name = 'list';
						
		case 'list'	:
				$valor	= json_encode($this->get_valor());
				break;

		case 'relation':
				# Force file_name to 'list'
				$file_name  = 'list';
				break;
		
		case 'tool_lang':
				return null;
				break;

		case 'print' :
				$valor = $this->get_valor();
				break;

		case 'list_thesaurus':
				$render_vars = $this->get_render_vars();
				$icon_label = isset($render_vars->icon) ? $render_vars->icon : '';
				break;

	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>