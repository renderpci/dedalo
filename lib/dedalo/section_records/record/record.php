<?php
	
	# CONTROLLER

	/*

		For only one row in edit mode 

	*/
	
	$search_options = $this->section_records_obj->search_options;	
	$modo	 		= $this->section_records_obj->search_options->modo;
	$context 		= (object)$this->section_records_obj->search_options->context; # inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
	if (!isset($context->context_name)) {
		$context->context_name = false;
	}
	if (isset($search_options->layout_map)) {
		$layout_map = $search_options->layout_map;
	}
	$ar_records	 	= $this->section_records_obj->records_data->ar_records;
	$tipo			= $this->section_records_obj->get_tipo();
	$section_tipo 	= $tipo;
	$permissions 	= common::get_permissions($section_tipo, $tipo);
	
	$ar_component_resolved = array();
	$button_delete_permissions = (int)$this->section_records_obj->button_delete_permissions;


	switch($modo) {
		
		#
		# EDIT
		#
		case 'edit':
	
				#
				# FIRST RECORD (AND THE ONLY ONE RECORD)
				# Get the only one (limit 1) record found in data->result
					if ( !isset($ar_records[0]) ) {						
						return null;
					}
					$first_record = $ar_records[0];
					$section_id   = $first_record->section_id;
				
					# record is not valid 
					if($section_id<1 && strpos($section_id, DEDALO_SECTION_ID_TEMP)===false) {
						if(SHOW_DEBUG) {
							dump($section_id, "DEBUG WARNING: section_id is <1 in result: ".to_string($ar_records));				
							return null;
						}
					}

				#
				# SECTION OBJ
				# Create section obj instance and get basic vars for render html
				$section = section::get_instance($section_id, $tipo, $modo);
					$current_section_obj 	= $section;
					$ar_exclude_elements  	= array(); #array('dd1106');
					$section_real_tipo  	= $section->get_section_real_tipo();	# Fija $this->section_real_tipo que es necesario luego
					$identificador_unico	= $section->get_identificador_unico();	
					$id_wrapper 			= 'wrap_section_'.$identificador_unico;
					$lang					= $section->get_lang();
					$parent					= $section->get_parent();
					$label					= $section->get_label();
					$component_name			= get_class($section);
					$section_info 			= $section->get_section_info('json');
					$permissions			= common::get_permissions($tipo, $tipo);
						$section->set_permissions($permissions);	// Fix permissions for current element (important)

				#
				# SECURITY
				# Verify current record is authorized for current user. If not, force set permissions to 0
				# Only test when section_id is nor temp
					/* REMOVED 31-03-2018
					if (strpos($section_id, DEDALO_SECTION_ID_TEMP)===false) {					
						$is_authorized_record = (bool)filter::is_authorized_record($section_id, $tipo);
							#dump($is_authorized_record,"is_authorized_record");
						if (!$is_authorized_record) {
							$permissions = 0;
							$section->set_permissions( $permissions ); // Fix permissions for current element (important)							
						}
					}
					*/
					

				#
				# RECORD_LAYOUT_HTML
				# Render record components html based on current layout
					$record_layout_html = '';

					#
					# SECTION VIRTUAL CASE
					# Special vars config when current is a virtual section
						if ($section->section_virtual===true ) {
							# Clone current  section obj
							$current_section_obj  = clone $section;
							# Inject real tipo to section object clone sended to layout when mode is edit
							$current_section_obj->set_tipo($section_real_tipo);
	
							# 
							# EXCLUDE ELEMENTS of current layout edit.
							# Exclude elements can be overwrite with get/post request
								if (!empty($_REQUEST['exclude_elements'])) {
									# Override default exclude elements
									$exclude_elements_tipo = trim( safe_xss($_REQUEST['exclude_elements']) );
								}else{
									# Localizamos el elemento de tipo 'exclude_elements' que será hijo de la sección actual
									$ar_exclude_elements_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section->get_tipo(),'exclude_elements',true,false); //section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true																	
									$exclude_elements_tipo 	  = reset($ar_exclude_elements_tipo);
								}							

								if (!empty($exclude_elements_tipo)) {
									# Localizamos los elementos a excluir que son los términos relacionados con este elemento ('exclude_elements')
									$ar_related = RecordObj_dd::get_ar_terminos_relacionados($exclude_elements_tipo, $cache=false, $simple=true);
									# Los recorremos y almacenams tanto los directos como los posibles hijos (recuerda que se pueden excluir section groups completos)
									foreach ($ar_related as $current_excude_tipo) {
										# Exclusión directa
										$ar_exclude_elements[] = $current_excude_tipo;

										# Comprobamos si es un section group, y si lo es, excluimos además sus hijos
										$RecordObj_dd 	= new RecordObj_dd($current_excude_tipo);
										$ar_childrens 	= (array)$RecordObj_dd->get_ar_childrens_of_this('si',null,null);
										foreach ($ar_childrens as $current_children) {
											$ar_exclude_elements[] = $current_children;
										}
									}
								}//end if (!empty($exclude_elements_tipo)) {
						}#end if ($section->section_virtual==true )
 

						#
						# REMOVE_EXCLUDE_TERMS : CONFIG EXCLUDES
						# If instalation config value DEDALO_AR_EXCLUDE_COMPONENTS is defined, add to current ar_exclude_elements
						if (defined('DEDALO_AR_EXCLUDE_COMPONENTS')) {
							$DEDALO_AR_EXCLUDE_COMPONENTS = unserialize(DEDALO_AR_EXCLUDE_COMPONENTS);
							$ar_exclude_elements = array_merge($ar_exclude_elements,$DEDALO_AR_EXCLUDE_COMPONENTS);
							debug_log(__METHOD__." DEDALO_AR_EXCLUDE_COMPONENTS: Added terms to ar_exclude_elements: ".to_string($DEDALO_AR_EXCLUDE_COMPONENTS), logger::DEBUG);
						}

					#
					# LAYOUT MAP : PENDIENTE UNIFICAR MAQUETACIÓN CON LAYOUT MAP A PARTIR DEL MODO EDIT <------
					# Consulta el listado de componentes a mostrar en el listado / grupo actual
						if (empty($layout_map)) {
							$layout_map = component_layout::get_layout_map_from_section($current_section_obj); # Important: send obj section with REAL tipo to allow resolve structure
						}						
							
						if ((int)$section->permissions>0) {
							# WALK : Al ejecutar el walk sobre el layout map podemos excluir del rendeo de html los elementos (section_group, componente, etc.) requeridos (virtual section)
							if(SHOW_DEBUG) {
								global$TIMER;$TIMER['component_layout::walk_layout_map'.'_IN_'.$section->get_tipo().'_'.$section->get_modo().'_'.microtime(1)]=microtime(1);
							}
							$ar = array();
							$current_section_obj->set_tipo( $section->get_tipo() ); # Restore section tipo (needed for virtual sections resolution)
							
							# ROWS_SEARCH
							#$records_search = new records_search($this, $modo);
							#$record_layout_html .= $records_search->get_html();

							$record_layout_html .= component_layout::walk_layout_map($current_section_obj, $layout_map, $ar, $ar_exclude_elements);

							if(SHOW_DEBUG) {
								global$TIMER;$TIMER['component_layout::walk_layout_map'.'_OUT_'.$section->get_tipo().'_'.$section->get_modo().'_'.microtime(1)]=microtime(1);
							}
						}//end if ($this->permissions===0) 
				
				
				# LOAD HTML FOR CURRENT ROW
					$row_html_file	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $modo .'.phtml';
					include($row_html_file);
				break;
	
	}#end switch($modo)




?>