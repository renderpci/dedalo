<?php
	
	# CONTROLLER
		
	$tipo 					= $this->get_tipo();
	$modo					= $this->get_modo();
	$parent					= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$lang					= $this->get_lang();		
	$dato 					= $this->get_dato();
	$dato_string 			= $this->get_dato_as_string();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $parent";
	$component_name			= get_class($this);
	$dato_string			= $this->get_dato_as_string();
	$called_class			= get_called_class();
	$identificador_unico	= $this->get_identificador_unico();
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;


	$file_name				= $modo ;
	
	#die(' die here...');



	switch($modo) {			

		case 'edit':

					# Necesitamos 'current_tipo_section' para poder crear la sección
					# Este dato debe ser añadido al objeto cuando ya se ha creado (en load component) 
					# y debe estar definido en el wrapper de destino
					$current_tipo_section = $this->get_current_tipo_section();
						#dump($current_tipo_section,'relation obj',"current_tipo_section:$current_tipo_section");
					
					if (empty($current_tipo_section)) {
						$msg  = "Error Processing Request: current_tipo_section is not defined! parent:$parent, tipo:$tipo ". $called_class ;
						$msg .= "<br>Is possible that the section group type is not correct. For a relation must be 'section_group_relation' check data structure please";
						#error_log($msg);	
						throw new Exception($msg, 1);											
					}

					# Creamos una nueva sección con el tipo de sección recibido ($current_tipo_section) y el modo actual (relation)
					$section_obj 	= section::get_instance(NULL, $current_tipo_section, 'relation');
					
					# CONFIGURE SECTION
					# Set caller_id in current section (IMPORTANT)
					$section_obj->set_caller_id($parent);
					$section_obj->set_caller_tipo($tipo);
					# Set relation_dato in current section (IMPORTANT)
					$ar_section_relations_for_current_tipo_section = $this->get_ar_section_relations_for_current_tipo_section();
						#dump($ar_section_relations_for_current_tipo_section,'$ar_section_relations_for_current_tipo_section'." - current_tipo_section:$current_tipo_section - dato:".print_r($dato,true));
					$section_obj->set_ar_section_relations_for_current_tipo_section($ar_section_relations_for_current_tipo_section);
						#dump($section_obj,'$section_obj');

					# Get html of actual section (rows list in relation mode)
					$section_html 	= $section_obj->get_html();		
						#dump($section_obj,"section_obj para current_tipo_section:$current_tipo_section");
						#dump($section_html,'$section_html');

					# Lo envolvemos con un section group
					$section_group = new section_group($current_tipo_section, 'edit', $section_html);

					# recuperamos el html decorado por el section_group
					$section_group_html = $section_group->get_html();

					$section_name	= RecordObj_dd::get_termino_by_tipo($current_tipo_section,DEDALO_APPLICATION_LANG,true);

					$caller_id 		= $parent;
					$id_wrapper 	= 'wrap_relation_list_'.$current_tipo_section.'_'.$caller_id;		#dump($id_wrapper,'caller_id');
					$component_info 	= $this->get_component_info('json');

					/*
					# Selector
					$this->modo = 'selector';
					$selector_html					= $this->get_html();
					# Lo envolvemos con un section group
					$section_group_selector 		= new section_group($current_tipo_section, 'edit', $selector_html);
					$section_group_selector_html	= $section_group_selector->get_html();
					$this->modo = 'edit';	
					*/
					break;

		case 'tool_time_machine'	:

					# Necesitamos 'current_tipo_section' para poder crear la sección
					# Este dato debe ser añadido al objeto cuando ya se ha creado (en load component) 
					# y debe estar definido en el wrapper de destino
					$current_tipo_section = $this->get_current_tipo_section();
						#dump($this,'relation obj',"current_tipo_section:$current_tipo_section");
					
					if (empty($current_tipo_section)) {
						$msg = "TM Error Processing Request: current_tipo_section is not defined! parent:$parent, tipo:$tipo ". $called_class ;
						error_log($msg);	
						throw new Exception($msg, 1);												
					}
					# Creamos una nueva sección con el tipo de sección recibido ($current_tipo_section) y el modo actual (relation)
					$section_obj 	= section::get_instance(NULL, $current_tipo_section, 'relation');


					
					# CONFIGURE SECTION
					# Set caller_id in current section (IMPORTANT)
					$section_obj->set_caller_id($parent);
					# Set relation_dato in current section (IMPORTANT)
					$ar_section_relations_for_current_tipo_section = $this->get_ar_section_relations_for_current_tipo_section();
					$section_obj->set_ar_section_relations_for_current_tipo_section($ar_section_relations_for_current_tipo_section);
					

					# Get html of actual section (rows list in relation mode)
					$section_html 	= $section_obj->get_html();		
						#dump($section_obj,'$section_obj', "para current_tipo_section:$current_tipo_section");

					# Lo envolvemos con un section group
					$section_group = new section_group($current_tipo_section, 'edit', $section_html);

					# recuperamos el html decorado por el section_group
					$section_group_html = $section_group->get_html();

					$section_name	= RecordObj_dd::get_termino_by_tipo($current_tipo_section,DEDALO_APPLICATION_LANG,true);

					$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
					$file_name  = 'edit';

					break;

		case 'selector':
				
					# NEW RELATIONS SELECTOR HTML
					$ar_sections 	= $this->get_all_authorized_content_sections();			
						#dump($ar_sections ,'$ar_sections', "BEFORE");

					# Order sections
					# POR HACER: ORDENAR ARRAY MULTIDIMENSIONAL MULTIBYTE...
					##sort($ar_sections);
					#echo setlocale(LC_ALL, "es_ES.UTF-8");							 
					array_multisort($ar_sections, SORT_ASC, SORT_LOCALE_STRING);
					$current_tipo_section = $this->get_current_tipo_section();			#dump($current_tipo_section);

					$caller_id = $parent;					
					break;


		case 'search' :	
					return print "<br> $component_name. working here..";
					break;

		case 'list_tm' :
					$file_name = 'list';

		case 'list'	:
					break;
						
		case 'tool_time_machine'	:	
					#$file_name  = 'edit';	
					break;


		case 'portal_list'	:
					return print "working here.. modo:$modo";						
					break;				
								
	}

	
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>