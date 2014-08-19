<?php
	
	# CONTROLLER

	$id 					= $this->get_id();				#dump($id,'component_portal id');
	$tipo 					= $this->get_tipo();			#dump($tipo,'component_portal tipo');
	$parent 				= $this->get_parent();			#dump($parent,'component_portal  parent');
	$modo					= $this->get_modo();			#dump($modo,'component_portal  modo');
	$dato 					= $this->get_dato();
	$valor 					= $this->get_dato_as_string();	#dump($valor,'valor');
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();				
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$context				= $this->get_context();

	$propiedades			= $this->RecordObj_ts->get_propiedades();
	$id_wrapper 			= 'wrapper_'.$identificador_unico;

	
	$button_new_html 		= NULL;
	$section_html 			= NULL;
	
	
	$target_section_tipo	= $this->get_target_section_tipo(); 	#dump($target_section_tipo,'$target_section_tipo ++');

	$file_name				= $modo;

		
	#$kk = $this->get_id_by_tipo_parent($tipo, $parent, $lang);	dump($kk," kk for $tipo, $parent, $lang");

	#echo " <span class=\"debug_info\">context:$context</span> ";
	#dump($modo);

	switch($modo) {
		
		# EDIT MODE
		# Build section list from array of section's id stored in component_portal dato
		case 'edit'	:	
						#if($tipo=='dd604' ||$tipo='dd805')
						#dump($this,"this tipo $tipo");
		#dump($modo);

						# fix portal_id
						$this->portal_id = $id;
							#dump($this->portal_id,'$this->portal_id en edit');
							#dump($dato,'$this->portal_id en edit');

						#$current_tipo_section = $this->get_current_tipo_section();
							#dump($current_tipo_section,'$current_tipo_section'," target_section_tipo:$target_section_tipo");


						#
						# SECTION LIST
						#if (is_array($dato) && !empty($dato[0])) {

							# Now we create and configure a new empty section for list ($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
							$section_obj 						= new section(NULL, $target_section_tipo, 'portal_list');	#dump($target_section_tipo,'$target_section_tipo');
							
							# CONFIGURE SECTION
							# Set caller_id in current section (IMPORTANT)
							$section_obj->set_caller_id($id);
							$section_obj->set_caller_tipo($tipo);

							$section_obj->set_portal_tipo($tipo);
							#$section_obj->ar_id_records_from_portal = $dato;
								#dump($section_obj->portal_layout_components,'$section_obj->portal_layout_components');

							# Set relation_dato in current section (IMPORTANT)
							$ar_section_relations_for_current_tipo_section = component_portal::get_ar_section_relations_for_current_tipo_section_static('ar_multiple', $dato);
								#dump($ar_section_relations_for_current_tipo_section,'$ar_section_relations_for_current_tipo_section'." - current_tipo_section:$current_tipo_section - dato:".print_r($dato,true));
							$section_obj->set_ar_section_relations_for_current_tipo_section($ar_section_relations_for_current_tipo_section);
								#dump($section_obj,'$section_obj');

							#
							# section LIST HTML (modo portal_list)
							$section_html = $section_obj->get_html();

							#dump($section_obj,'section_obj');
						#}


						
						$show_button_new		= $this->get_show_button_new();
						#
						# BUTTON NEW (need $tipo, $target_section_tipo, $portal_id)						
						if ($show_button_new==TRUE || !is_array($dato) ) {

							# change temporally modo to get portal button select
							$this->modo 		= 'button_select';		
							$button_select_html = $this->get_html();	#dump($button_select_html,"CREATING BUTTON");

							# change temporally modo to get portal button new 
							$this->modo 		= 'button_new';		
							$button_new_html 	= $this->get_html();	#dump($button_new_html,"CREATING BUTTON");
							

							# restore modo
							#$this->modo 		= 'edit';
							$this->set_modo('edit');
						}
						#dump($dato,"show_button_new:$show_button_new , ".is_array($dato));						

						break;

		# LIST MODE
		# Case component_portal show inside list of sections from component_portal (Recursion)
		case 'list_tm':
		case 'list' :	$file_name = 'portal_list';
		case 'portal_list' :
						
						#
						# SECTION LIST
						if (is_array($dato) && !empty($dato[0])) {

							# Now we create and configure a new empty section for list ($id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=DEDALO_DATA_LANG)
							$section_obj = new section(NULL, $target_section_tipo, 'portal_list');	#dump($target_section_tipo,'$target_section_tipo');
							
				#return null;

							# CONFIGURE SECTION
							# Set caller_id in current section (IMPORTANT)
							$section_obj->set_caller_id($id);
							$section_obj->set_caller_tipo($tipo);

							$section_obj->set_portal_tipo($tipo);
							#$section_obj->ar_id_records_from_portal = $dato;
								#dump($section_obj->portal_layout_components,'$section_obj->portal_layout_components');

							# CONFIGURE SECTION CONTEXT !IMPORTANT
							$section_obj->set_context('component_portal_inside_portal_list');

							# Set relation_dato in current section (IMPORTANT)
							$ar_section_relations_for_current_tipo_section = component_portal::get_ar_section_relations_for_current_tipo_section_static('ar_multiple', $dato);
								#dump($ar_section_relations_for_current_tipo_section,'$ar_section_relations_for_current_tipo_section'." - current_tipo_section:$current_tipo_section - dato:".print_r($dato,true));
							$section_obj->set_ar_section_relations_for_current_tipo_section($ar_section_relations_for_current_tipo_section);
								#dump($section_obj,'$section_obj');

							#
							# section LIST HTML (modo portal_list)
							$section_html = $section_obj->get_html();
						}

						break;

		case 'button_new' :
						# If is not defined 'this->portal_id', get this->portal_id from parent
						if(empty($this->portal_id)) {
							$this->portal_id = $id;
						}
						#dump($this->portal_id,'$this->portal_id en button new');

						#$parent_section_tipo = navigator::get_selected('section');
						#echo " target_section_tipo: ".$target_section_tipo;

						break;	

		case 'search' : # 
						#return print "<br> $component_name. working here..";
						#return null;
						break;	
	}
	

	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);
?>