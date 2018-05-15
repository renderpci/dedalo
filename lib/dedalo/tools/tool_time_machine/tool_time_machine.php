<?php

	# CONTROLLER TOOL TIME MACHINE

	$id 					= $this->source_component->get_id();
	$tipo 					= $this->source_component->get_tipo();
	$parent 				= $this->source_component->get_parent();
	$section_tipo			= $this->source_component->get_section_tipo();
	$lang 					= $this->source_component->get_lang();
	if (!empty($_REQUEST['lang'])) {
	$lang 					= $_REQUEST['lang'];
	}
	$lang_name 				= lang::get_name_from_code( $lang, 'lg-eng' );
	$label 					= $this->source_component->get_label();
	$traducible 			= $this->source_component->get_traducible();
	$component_name			= get_class($this->component_obj);
	$tool_name 				= get_class($this);

	# SOURCE COMPONENT
	$source_component 		= $this->source_component;
	
	$modo 					= $this->get_modo();
	$file_name 				= $modo;


	# TOOL CSS / JS MAIN FILES
	if (strpos($modo,'button')===false) {
		css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
		js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
	}


	#dump($modo,"modo");
	switch($modo) {

		#
		# PAGE . Estructural TM page
		case 'page':

				# Because components are loaded by ajax, we need prepare js/css elements from tool
				#
				# CSS
					css::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/css/$component_name.css";
				#
				# JS includes
					js::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/js/$component_name.js";

				# Configure component
				# In case relation, set current_tipo_section as received value by url GET
				#$current_tipo_section = common::setVar('current_tipo_section');
				$current_tipo_section = $this->section_tipo;
					#dump($current_tipo_section,"current_tipo_section");

				if(!empty($current_tipo_section)) {
					#$source_component->set_current_tipo_section($current_tipo_section);
					# Set variant for id
					$source_component->set_variant( tool_time_machine::$preview_variant );		
				}
				#dump($source_component,' $source_component');
				
				# Build source html
				$this->set_modo('source');	# change temp
				$source_html = $this->get_html();
				$this->set_modo('page');	# restore modo

				# Build preview html
				#$this->set_modo('preview');	# change temp
				$preview_html = 'Loading..';#$this->get_html();	// Loaded by ajax !
				#$this->set_modo('page');	# restore modo

				# Build rows html
				$this->set_modo('rows');	# change temp
				$rows_html = $this->get_html();
				$this->set_modo('page');	# restore modo

				#$source_component_html 			= $source_component->get_html();
				#$component_obj_time_machine_html= 'Loading last time machine saved data..';					
				break;

		# ROWS . Records of current componet existing in 'matrix_time_machine'
		case 'rows':

				$limit  = isset($this->limit) ? $this->limit : 10;
				$offset = isset($this->offset) ? $this->offset : 0;
				
				# ROWS ARRAY 
				$ar_component_time_machine	= tool_time_machine::get_ar_component_time_machine($tipo, $parent, $lang, $section_tipo, $limit, $offset);
					#dump($ar_component_time_machine,"ar_component_time_machine");die();

				#add name resolution to the row
				foreach ((array)$ar_component_time_machine as $tm_obj) {
					$userID					= $tm_obj->get_userID();
					if($userID == -1){
						$tm_obj->user_name = 'Admin debuger';
					}else{
						$obj_user_name	= component_common::get_instance('component_input_text',
																		 DEDALO_FULL_USER_NAME_TIPO,
																		 $userID,
																		 'edit',
																		 DEDALO_DATA_NOLAN, DEDALO_SECTION_USERS_TIPO);
						$user_name = $obj_user_name->get_valor();
						$tm_obj->user_name =$user_name;
					}						
				}

				#$ar_source_langs = common::get_ar_all_langs_resolved();
				$ar_source_langs = $this->get_source_langs();
					#dump($ar_source_langs, ' $ar_source_langs ++ '.to_string());

				# current_tipo_section is needed for relation tm !
				$ar_rel_locator_for_current_tipo_section 	= array();
				$current_tipo_section 						= common::setVar('current_tipo_section');
				if ( !empty($current_tipo_section) ) {
					# Estamos en el time machine de una relación
					# Calcularemos los registros relacionados para excluir aquellos en que no aparece la sección actual
					#$component_relation = new component_relation($current_tipo_section,$parent);
					$component_relation = component_common::get_instance('component_relation', $current_tipo_section, $parent, 'edit', DEDALO_DATA_NOLAN);

					$component_relation->set_current_tipo_section($current_tipo_section);								

					$ar_rel_locator_for_current_tipo_section = $component_relation->get_ar_section_relations_for_current_tipo_section('ar_rel_locator');
						#dump($ar_rel_locator_for_current_tipo_section,'$ar_rel_locator_for_current_tipo_section'," for id: $id - tipo_section:$current_tipo_section");
				}

				$permissions = common::get_permissions($section_tipo,$tipo);
					#dump($permissions," permissions");				
				break;
		
		# SOURCE . Actual component source composed from current record of 'matrix' about current component
		case 'source':
				# Configure component
				# In case relation, set current_tipo_section as received value by url GET
				$current_tipo_section = common::setVar('current_tipo_section');
	
				// Force update component lang (can be overwrited with get value) Important !
				$source_component->set_lang($lang);
				

				if(!empty($current_tipo_section)) {
					$source_component->set_current_tipo_section($current_tipo_section);					

				}
				#dump($source_component,' $source_component');
				
				# Set variant for id
				#$source_component->set_variant( tool_time_machine::$preview_variant );
				$source_component->set_variant( tool_time_machine::$actual_variant );	
					
					#dump($source_component, ' source_component ++ '.to_string( tool_time_machine::$actual_variant  ));

				# COMPONENT CONTEXT SET
				$context = new stdClass();
					$context->context_name = 'tool_time_machine';
				$source_component->set_context($context);

				# Detect original lang if defined. Else use current lang
				/*
				$original_lang 	= component_text_area::force_change_lang($this->source_component->get_tipo(),
																		 $this->source_component->get_parent(),
																		 $this->source_component->get_modo(),
																		 $this->source_component->get_lang(),
																		 $this->source_component->get_section_tipo());
				$this->source_component->set_lang($original_lang);
				*/

				$source_component_html = $source_component->get_html();
				break;

		# PREVIEW . Component preview composed from last record of 'matrix_time_machine' about current component
		case 'preview':

				# Assigned previously in trigger time machine
				$id_time_machine 		= $this->get_id_time_machine();
				$version_date 			= $this->get_version_date();
				#$current_tipo_section 	= $this->get_current_tipo_section();				
					#dump($id_time_machine,'id_time_machine'); #die();

				/*
				# CURRENT TIPO SECTION
				# Si se recibe section_tipo, configuramos el objeto para que tenga ese parámeto asignado
				# Por ejemplo, en relaciones, se requiere para discriminar qué seccion queremos actualizar	
				#$current_tipo_section 						= common::setVar('current_tipo_section');
				if (!empty($current_tipo_section)) {
					$source_component->current_tipo_section = $current_tipo_section;
				}
				#dump($current_tipo_section,'$current_tipo_section');
				*/
				if (empty($id_time_machine)) {
					# Buscamos en matrix_time_machine el último registro de este componente
					$ar_time_machine_of_this 	= RecordObj_time_machine::get_ar_time_machine_of_this($tipo, $parent, $lang, $section_tipo);
					$id_time_machine 			= current($ar_time_machine_of_this);
				}

				if (empty($id_time_machine)) {					
					$component_for_time_machine_html = "<br><div class=\"warning\">No history exists for this component</div>";
					echo $component_for_time_machine_html;
					return NULL;
					#exit("No history exists for this component"); #throw new Exception("Error Processing Request: Unable load_preview_component ! (Few vars2)", 1);

				}else{
					
					# Extraemos el dato del registro solicitado de matrix_time_machine
					$RecordObj_time_machine = new RecordObj_time_machine($id_time_machine);
					$dato 					= $RecordObj_time_machine->get_dato();
					$timestamp 				= $RecordObj_time_machine->get_timestamp();					

					# Override component dato information with time machine dato (Warning: dato is always string in matrix_time_machine. Manage properly in each component)
					$source_component->set_dato($dato);
						#dump($dato, "set dato for id_time_machine:$id_time_machine ");

					#$source_component->set_modo('tool_time_machine');

					# Set variant for id
					$source_component->set_variant( tool_time_machine::$preview_variant );


					# Set time machine version date
					$version_date 			= component_date::timestamp_to_date($timestamp,true);
					#$source_component->set_version_date($timestamp);

					# COMPONENT CONTEXT SET
					$context = new stdClass();
						$context->context_name = 'tool_time_machine';
					$source_component->set_context($context);


					# Detect original lang if defined. Else use current lang
					/*
					$original_lang 	= component_text_area::force_change_lang($this->source_component->get_tipo(),
																			 $this->source_component->get_parent(),
																			 $this->source_component->get_modo(),
																			 $this->source_component->get_lang(),
																			 $this->source_component->get_section_tipo());
					$this->source_component->set_lang($original_lang);
					*/

					# Get component html
					$component_for_time_machine_html = $source_component->get_html();						#dump($source_component->get_dato(),'TM $source_component->get_dato()');

				}				
				break;
		
		# BUTTON FOR SECTION ROWS LIST . TM FOR LIST
		case 'button_section_list':
				
				$html_time_machine= '';				

				$current_tipo_section 		= $source_component->get_tipo();
				$current_tipo_section_name 	= $source_component->get_label();

				# ACTIVITY : Avoid show time machine for activity section
				if($current_tipo_section===DEDALO_ACTIVITY_SECTION_TIPO) {
					return null;
				}

				# Restrictions
				$user_can_recover_sections = tool_time_machine::user_can_recover_sections( $current_tipo_section, navigator::get_user_id() );
					#dump($user_can_recover_sections, 'user_can_recover_sections', array());
				if ($user_can_recover_sections===false) {
					return null;
				}
					
				break;
		
		/* DEPRECATED
		# SECTION ROWS LIST . Records of current section existing in 'matrix_time_machine' with status 'deleted'
		case 'section_rows':
				
				$section_tipo = $this->source_component->get_tipo();
					dump($section_tipo,"section_tipo");die();

				# SECTION ROWS ARRAY 
				$ar_sections_time_machine	= $this->get_ar_sections_time_machine($section_tipo);
					#dump($ar_sections_time_machine, "ar_sections_time_machine");

				# SECTION . Creamos una sección pasándole como array de id's los calculados previamente (ar_sections_time_machine)
				$section = section::get_instance(NULL,$section_tipo,'list');
				$section_html = $section->get_html();
				return $section_html;
				break;		
		*/
	}#end switch

	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
	
?>