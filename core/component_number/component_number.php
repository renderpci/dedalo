<?php

	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$propiedades 			= $this->get_propiedades();


	$file_name				= $modo;
	$from_modo				= $modo;

	if($permissions===0) return null;

	switch($modo) {
		case 'edit_in_list':
				$file_name = 'edit';
				$wrap_style 	= '';	// 'width:100%'; // Overwrite possible custon component structure css
				// Dont break here. Continue as modo edit

		case 'tool_lang':
				$file_name = 'edit';

		#case 'portal_edit'	:
		#case 'portal_list'	:
				#$file_name = 'edit';

		case 'edit'	:

				$dato 	= $this->get_dato();
				#$dato 	= $this->set_display_format_from_type($dato);
				$valor	= $this->get_valor();

				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return NULL ;

				#get the change modo from portal list to edit
				$var_requested = common::get_request_var('from_modo');
				if (!empty($var_requested)) {
					$from_modo = $var_requested;
				}

				$id_wrapper  = 'wrapper_'.$identificador_unico;
				$input_name  = "{$tipo}_{$parent}";

				// Converts to print as string formatted with . instead , for decimals
				$dato_string = component_number::number_to_string($dato);
					#dump($dato_text, ' $dato_text ++ '.to_string());

				$component_info = $this->get_component_info('json');
				break;

		case 'print' :
				$dato 		 = $this->get_dato();
				// Converts to print as string formatted with . instead , for decimals
				$dato_string = component_number::number_to_string($dato);
				break;

		case 'tool_time_machine' :
				$dato 	= $this->get_dato();
				$valor	= $this->get_valor();

				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				# Force file_name
				$file_name  = 'edit';
				break;

		case 'portal_list':
		case 'list_tm' :
		case 'list'	:
				$dato 	= $this->get_dato();
				$valor	= $this->get_valor();

				$id_wrapper = 'wrapper_'.$identificador_unico;
				$input_name = "{$tipo}_{$parent}";

				$component_info 	= $this->get_component_info('json');

				#$dato = htmlentities($dato);
				$file_name = 'list';
				break;

		case 'list_of_values':
				break;

		case 'relation':
				# Force file_name to 'list'
				$file_name  = 'list';
				break;

		case 'lang'	:
				break;

		case 'search':
				# dato is injected by trigger search wen is needed
				$dato 	= $this->get_dato();
				$valor	= $this->get_valor();

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;

		case 'list_thesaurus':
				$dato 	= $this->get_dato();
				$valor	= $this->get_valor();
				$render_vars = $this->get_render_vars();
				$icon_label = isset($render_vars->icon) ? $render_vars->icon : '';
				break;
	}


	#$page_html	= DEDALO_CORE_PATH .'/'. $component_name . '/html/' . $component_name . '_' . $file_name . '.phtml';
	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}


