<?php

	# CONTROLLER TOOL TIME MACHINE

	$id 					= $this->source_component->get_id();
	$tipo 					= $this->source_component->get_tipo();
	$parent 				= $this->source_component->get_parent();	
	$lang 					= $this->source_component->get_lang();
	$label 					= $this->source_component->get_label();
	$traducible 			= $this->source_component->get_traducible();

	# SOURCE COMPONENT
	$source_component 		= $this->source_component;
	
	$modo 					= $this->get_modo();
	$file_name 				= $modo;							#dump($this->source_component,'$this->source_component->current_tipo_section');

	
	switch($modo) {
		
		# BUTTON TM . Only show TM button (normally inside inspector) to open dialog window
		case 'button':

				if ($id<1) return null;

				# Relation specific data
				$current_tipo_section 		= null;
				$current_tipo_section_name 	= null;
				if (!empty($source_component->current_tipo_section)) {
					$current_tipo_section 		= $source_component->current_tipo_section;
					$current_tipo_section_name 	= RecordObj_ts::get_termino_by_tipo($current_tipo_section,DEDALO_DATA_LANG);
				}
				#dump($current_tipo_section," $current_tipo_section - $current_tipo_section_name")	;				
				break;

		# PAGE . Estructural TM page
		case 'page':

				/**/
				# Configure component
				# In case relation, set current_tipo_section as received value by url GET
				$current_tipo_section = common::setVar('current_tipo_section');	
				if(!empty($current_tipo_section)) {
					#$source_component->set_current_tipo_section($current_tipo_section);
					# Set variant for id
					$source_component->set_variant( tool_time_machine::$preview_variant );		
				}
				#dump($source_component,' $source_component');
				
				# Build rows html
				$this->set_modo('rows');	# change temp
				$rows_html = $this->get_html();
				$this->set_modo('page');	# restore modo

				# Build source html
				$this->set_modo('source');	# change temp
				$source_html = $this->get_html();
				$this->set_modo('page');	# restore modo

				# Build preview html
				$this->set_modo('preview');	# change temp
				$preview_html = 'Loading..';#$this->get_html();
				$this->set_modo('page');	# restore modo

				#$source_component_html 			= $source_component->get_html();
				#$component_obj_time_machine_html= 'Loading last time machine saved data..';					
				break;

		# ROWS . Records of current componet existing in 'matrix_time_machine'
		case 'rows':
				
				# ROWS ARRAY 
				$ar_component_time_machine	= tool_time_machine::get_ar_component_time_machine($id, $lang);

				# current_tipo_section is needed for relation tm !
				$ar_rel_locator_for_current_tipo_section 	= array();
				$current_tipo_section 						= common::setVar('current_tipo_section');
				if ( !empty($current_tipo_section) ) {
					# Estamos en el time machine de una relación
					# Calcularemos los registros relacionados para excluir aquellos en que no aparece la sección actual
					$component_relation = new component_relation($id, $current_tipo_section);	#$id=NULL, $tipo=false, $modo='edit', $parent=NULL, $lang=NULL)	

					$component_relation->set_current_tipo_section($current_tipo_section);								

					$ar_rel_locator_for_current_tipo_section = $component_relation->get_ar_section_relations_for_current_tipo_section('ar_rel_locator');
						#dump($ar_rel_locator_for_current_tipo_section,'$ar_rel_locator_for_current_tipo_section'," for id: $id - tipo_section:$current_tipo_section");
				}				
				break;
		
		# SOURCE . Actual component source composed from current record of 'matrix' about current component
		case 'source':
				# Configure component
				# In case relation, set current_tipo_section as received value by url GET
				$current_tipo_section = common::setVar('current_tipo_section');	
				if(!empty($current_tipo_section)) {
					$source_component->set_current_tipo_section($current_tipo_section);

					# Set variant for id
					$source_component->set_variant( tool_time_machine::$preview_variant );		
				}
				#dump($source_component,' $source_component');
				$source_component_html 			= $source_component->get_html();

				break;

		# PREVIEW . Component preview composed from last record of 'matrix_time_machine' about current component
		case 'preview':

				# Assigned previously in trigger time machine
				$id_time_machine 		= $this->get_id_time_machine();
				$current_tipo_section 	= $this->get_current_tipo_section();
				$version_date 			= $this->get_version_date();
					#dump($id_time_machine,'id_time_machine');

				# CURRENT TIPO SECTION
				# Si se recibe section_tipo, configuramos el objeto para que tenga ese parámeto asignado
				# Por ejemplo, en relaciones, se requiere para discriminar qué seccion queremos actualizar	
				#$current_tipo_section 						= common::setVar('current_tipo_section');
				if (!empty($current_tipo_section)) {
					$source_component->current_tipo_section = $current_tipo_section;
				}
				#dump($current_tipo_section,'$current_tipo_section');
				
				if (empty($id_time_machine)) {
					# Buscamos en matrix_time_machine el último registro de este componente
					$ar_time_machine_of_this 	= RecordObj_time_machine::get_ar_time_machine_of_this($id, $lang);
					$id_time_machine 			= current($ar_time_machine_of_this);
				}

				if (empty($id_time_machine)) {

					return NULL;
					$component_for_time_machine_html = "<br><div class=\"warning\">No history exists for this component</div>";
					#exit("No history exists for this component"); #throw new Exception("Error Processing Request: Unable load_preview_component ! (Few vars2)", 1);

				}else{
					
					# Extraemos el dato del registro solicitado de matrix_time_machine
					$RecordObj_time_machine = new RecordObj_time_machine($id_time_machine);
					$dato 					= $RecordObj_time_machine->get_dato();
					$timestamp 				= $RecordObj_time_machine->get_timestamp();

					# Override component dato information with time machine dato
					$source_component->set_dato($dato);
						#dump($dato, "set dato for id_time_machine:$id_time_machine ");

					#$source_component->set_modo('tool_time_machine');

					# Set variant for id
					$source_component->set_variant( tool_time_machine::$preview_variant );

					# Set time machine version date
					$version_date 			= component_date::timestamp_to_date($timestamp,true);
					#$source_component->set_version_date($timestamp);

					# Get component html
					$component_for_time_machine_html = $source_component->get_html();						#dump($source_component->get_dato(),'TM $source_component->get_dato()');

				}				
				break;

		
		# BUTTON FOR SECTION ROWS LIST . TM FOR LIST
		case 'button_section_list':
		
				$html_time_machine= '';

				$current_tipo_section 		= $source_component->get_tipo();
				$current_tipo_section_name 	= $source_component->get_label();#RecordObj_ts::get_termino_by_tipo($current_tipo_section,DEDALO_DATA_LANG);

				# ACTIVITY : Avoid show time machine for activity section
				if($current_tipo_section==DEDALO_ACTIVITY_SECTION_TIPO) {
					return null;
				}
					
				break;

		# SECTION ROWS LIST . Records of current section existing in 'matrix_time_machine' and no existing in 'matrix'
		case 'section_rows':
				
				$section_tipo = $this->source_component->get_tipo();

				# SECTION ROWS ARRAY 
				$ar_sections_time_machine	= $this->get_ar_sections_time_machine($section_tipo);
					#dump($ar_sections_time_machine, "ar_sections_time_machine");

				# SECTION . Creamos una sección pasándole como array de id's los calculados previamente (ar_sections_time_machine)
				$section = new section(NULL,$section_tipo,'list');
				$section_html = $section->get_html();
				return $section_html;
				break;		
		
	}#end switch

	$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	include($page_html);
	
?>