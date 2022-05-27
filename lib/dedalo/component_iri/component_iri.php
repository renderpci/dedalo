<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();
	$section_tipo 			= $this->get_section_tipo();
	$propiedades			= $this->get_propiedades();	
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$file_name				= $modo;
	
	if($permissions===0) return null;
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return null ;

	switch($modo) {		
		
		case 'edit_in_list':
				// Fix always edit as modo / filename
				$modo 			= 'edit';
				$file_name		= 'edit';

				$wrap_style 	= '';	// 'width:100%'; // Overwrite possible custon component structure css
				// Dont break here. Continue as modo edit
		
		case 'tool_lang':
				$file_name 		= 'edit';
		case 'edit'	:

				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$dato 			= $this->get_dato();
				$dato_json 		= json_encode($dato);
				$component_info = $this->get_component_info('json');

				$input_name 	= "{$tipo}_{$parent}";
				#$dato_json 		= json_handler::encode($dato);
				#$dato 			= htmlentities($dato);
				
				# DATO_REFERENCE_LANG
				$default_component = null;
				
				if (strpos($parent, DEDALO_SECTION_ID_TEMP)===false &&  empty($dato) && $traducible==='si') {
					$default_component = $this->get_default_component();
				}

				$valor	= '';
				if(isset($dato->iri) || isset($dato->title)) {
					$dd_iri	= new dd_iri($dato);
					$valor	= component_iri::get_valor( $dd_iri );
				}

				$mandatory 		= (isset($propiedades->mandatory) && $propiedades->mandatory===true) ? true : false;
				$use_title 		= (isset($propiedades->use_title) && $propiedades->use_title===false) ? false : true;
				$multiple_value = (isset($propiedades->multiple_value) && $propiedades->multiple_value===false) ? false : true;
				$source_for_component = (isset($propiedades->source_for_component)) ? $propiedades->source_for_component : false;

				$mandatory_json = json_encode($mandatory);

				#
				# DATAFRAME MANAGER	
				$ar_dataframe_obj = array();
				$ar_dataframe = isset($propiedades->dataframe) ? $propiedades->dataframe : false;
				if($ar_dataframe !==false){
					foreach ($ar_dataframe as $key => $current_dataframe) {
						if ($current_dataframe->tipo!==false) {
							$dataframe_obj = new dataframe($current_dataframe->tipo, $current_dataframe->type, $this, 'dataframe_edit', $key);
							$ar_dataframe_obj[] = $dataframe_obj;
						}	
					}
				}			
				break;

		case 'print' :
				#$dato = htmlentities($dato);
				break;

		case 'tool_time_machine'	:	
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";	
				# Force file_name
				$file_name  = 'edit';
				break;
				
		case 'portal_list':
				$dato 	= $this->get_dato();
				if(empty($dato)) return null;
				break;

		case 'list_tm' :
				$file_name = 'list';
				# use list file to render value
										
		case 'list'	:
				if(empty($valor)) return null;	
				break;
						
		case 'list_of_values':
				break;

		case 'relation':
				$file_name  = 'list';
				break;
						
		case 'lang'	:									
				break;
		
		case 'search':
				# dato is injected by trigger search wen is needed
				$dato 	= $this->get_dato();
				$valor 	= $this->get_valor();

				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= $tipo.'_'.$parent;

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;
						
		case 'list_thesaurus':
				$render_vars = $this->get_render_vars();				
				$icon_label  = isset($render_vars->icon) ? $render_vars->icon : '';
				break;						
	}
	

	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}


