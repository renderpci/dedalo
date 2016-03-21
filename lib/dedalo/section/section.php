<?php
	
	# CONTROLLER
		
	$tipo					= $this->get_tipo();
	$parent					= $this->get_parent();
	$lang					= $this->get_lang();
	$dato					= $this->dato;	

	$permissions			= common::get_permissions($tipo);
	$this->set_permissions($permissions);	// Fix permissions for current element (important)

	$label					= $this->get_label();
	$modo					= $this->get_modo();				
	$ar_css					= $this->get_ar_css();
	$component_name			= get_class($this);
	$identificador_unico	= $this->get_identificador_unico();	
	$caller_id 				= $this->get_caller_id();
	
	$context 				= $this->get_context();	
	$file_name 				= $modo;


	# Test is a complete section or process
	$is_process_section = (isset($_REQUEST['t']) && $_REQUEST['t']!= $tipo) ? true : false;

	

	# COMPONENTS HTML
	$html_section_add  ='';
	
	
	switch($modo) {

		case 'edit':
				
				$section_id 			= $this->get_section_id();
				$section_info 			= $this->get_section_info('json');
				$current_section_obj  	= $this;
				$ar_exclude_elements  	= array(); #array('dd1106');
				$section_real_tipo  	= $this->get_section_real_tipo();	# Important: Fija $this->section_real_tipo que es necesario luego
					#dump($section_real_tipo,"section_real_tipo ");
				$id_wrapper 			= 'wrap_section_'.$identificador_unico;


				#
				# CSS includes
					$propiedades = $this->get_propiedades();
						#dump($propiedades, ' $propiedades ++ '.to_string());
					if (isset($propiedades->aditional_css)) {
						css::$ar_url[] = DEDALO_LIB_BASE_URL . $propiedades->aditional_css;
					}
					
				
					
				#
				# SEARCH FORM . ROWS_SEARCH 
				# Render search form html
				/*	
					$search_form_html 	= '';
					$records_search 	= new records_search($this, 'edit');
					$search_form_html 	= $records_search->get_html();
						#dump($search_form_html, " search_form_html ".to_string());
				*/
							

				#
				# RECORDS_HTML
				# Render search form html using search.
				# We know the current record id but we search like a list filtered by id for maintain always the same criterion
					if (!isset($_REQUEST['offset'])) {
						
						$search_options_session_key = 'current_edit';
						$locator = new locator();
							$locator->set_section_tipo($this->tipo);
							$locator->set_section_id($this->section_id);

						#$layout_map = (array)component_layout::get_layout_map_from_section( $this ); 	#dump($layout_map, ' layout_map'.to_string());

						# Create new options object
							$options = new stdClass();
								$options->section_tipo 				 = $this->tipo;
								$options->section_real_tipo 		 = $section_real_tipo;
								$options->context 					 = '';
								$options->modo						 = 'edit';
								$options->layout_map 				 = array();
								$options->search_options_session_key = $search_options_session_key;
								$options->filter_by_id 				 = array($locator);
							
					}else{

						$search_options_session_key = 'section_'.$this->tipo;
							#dump($search_options_session_key, " search_options_session_key ".to_string($context));
						
							$offset = isset($_REQUEST['offset']) ? (int)$_REQUEST['offset'] : 0;						
							
							if (isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
								
								# Clone existent options object to get all properties
								$options = $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key];
									#dump($options, " options ".to_string());		
							
							}else{
								
								# Create new options object
								$options = new stdClass();
									$options->section_tipo 				 = $this->tipo;
									$options->section_real_tipo 		 = $section_real_tipo;
									$options->context 					 = '';
							}
						
						# Set / Override some specific edit options
							$options->modo						 = 'edit';
							$options->limit 					 = 1;
							$options->offset 					 = $offset;					
							$options->layout_map 				 = array();							
							$options->search_options_session_key = $search_options_session_key;


							if(SHOW_DEBUG) {
								#dump($options, ' options');
							}

					}//end if (empty($_REQUEST['offset'])) {

					
					#$records_data =	search::get_records_data($options);
						#dump($records_data, ' records_data');die();


				#
				# SAVE_HANDLER ADDS
				# Send save_handler across classes
				$options->save_handler = $this->save_handler;
				
			
				$section_records 	  = new section_records($this->tipo, $options);				
				$section_records_html = $section_records->get_html();
					
					#dump($section_records->rows_obj->result, ' section_records->rows_obj->result ++ '.to_string());

				#
				# INSPECTOR HTML
				# Render inspector html
					$inspector_html = '';
					$show_inspector	= $this->get_show_inspector();
					if ($show_inspector && !empty($section_records->rows_obj->result)) {
						
						# Change modo temporally to get inspector html
						#$this->modo 	= 'edit_inspector';
						#$inspector_html = $this->get_html();
						# Restore original modo and continue
						$this->modo 	= 'edit';
						
						$inspector 		= new inspector($modo, $tipo);
						$inspector_html = $inspector->get_html();
					}



				# OLD MODE
					/*
					#
					# PAGINATOR HTML
						$rows_paginator 		= new records_navigator($records_data, $modo);
						$rows_paginator_html	= $rows_paginator->get_html();

						
						#die();
					
						#
						# SECURITY
						# Verify current record is authorized for current user. If not, force set permissions to 0
							$is_authorized_record = (bool)filter::is_authorized_record($this->section_id, $this->tipo);
								#dump($is_authorized_record,"is_authorized_record");
							if (!$is_authorized_record) {
								$permissions = 0;
								$this->set_permissions( $permissions ); // Fix permissions for current element (important)
							}

						#
						# RECORD_LAYOUT_HTML
						# Render record components html based on current layout
							$record_layout_html = '';

							#
							# SECTION VIRTUAL CASE
							# Special vars config when current is a virtual section
								if ($this->section_virtual==true ) {
									# Clone current  section obj
									$current_section_obj  = clone $this;
									# Inject real tipo to section object clone sended to layout when mode is edit
									$current_section_obj->tipo = $this->section_real_tipo;

									# 
									# EXCLUDE ELEMENTS of current layout edit.
									# Exclude elements can be overwrite with get/post request
										if (!empty($_REQUEST['exclude_elements'])) {
											# Override default exclude elements
											$exclude_elements_tipo = trim($_REQUEST['exclude_elements']);
										}else{
											# Localizamos el elemento de tipo 'exclude_elements' que será hijo de la sección actual
											$ar_exclude_elements_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($this->tipo,'exclude_elements',true,false); //section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true																	
											$exclude_elements_tipo 	  = reset($ar_exclude_elements_tipo);
												#dump($ar_exclude_elements_tipo,"exclude_elements_tipo for tipo: $this->tipo - $exclude_elements_tipo");
										}							

										if (!empty($exclude_elements_tipo)) {
											# Localizamos los elementos a excluir que son los términos relacionados con este elemento ('exclude_elements')
											$ar_related = RecordObj_dd::get_ar_terminos_relacionados($exclude_elements_tipo, $cache=false, $simple=true);
												#dump($ar_related,'$ar_related');
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
									#dump($ar_exclude_elements,'ar_exclude_elements '.$this->tipo);
								}#end if ($this->section_virtual==true )

							#
							# LAYOUT MAP : PENDIENTE UNIFICAR MAQUETACIÓN CON LAYOUT MAP A PARTIR DEL MODO EDIT <------
							# Consulta el listado de componentes a mostrar en el listado / grupo actual
								#dump($current_section_obj,"current_section_obj");die();					
								$layout_map = component_layout::get_layout_map_from_section($current_section_obj); # Important: send obj section with REAL tipo to allow resolve structure
									#dump($layout_map,"layout ".$current_section_obj->tipo);
									#dump($this->permissions, ' $this->permissions');
								
								
								if ((int)$this->permissions>0) {									
									# WALK : Al ejecutar el walk sobre el layout map podemos excluir del rendeo de html los elementos (section_group, componente, etc.) requeridos (virtual section)
									if(SHOW_DEBUG) {
										global$TIMER;$TIMER['component_layout::walk_layout_map'.'_IN_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
									}
									$ar = array();
									$current_section_obj->tipo = $this->tipo; # Restore section tipo (needed for virtual sections resolution)															

									$record_layout_html .= component_layout::walk_layout_map($current_section_obj, $layout_map, $ar, $ar_exclude_elements); 
										#dump($ar_exclude_elements,"layout ".$current_section_obj->tipo);							

									if(SHOW_DEBUG) {
										global$TIMER;$TIMER['component_layout::walk_layout_map'.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
									}
								}//end if ($this->permissions===0) {


						#
						# SEARCH FORM . ROWS_SEARCH 
						# Render search form html
							#$search_form_html 	= '';
							#$records_search 	= new records_search($this, 'edit');
							#$search_form_html 	= $records_search->get_html();


						#
						# INSPECTOR HTML
						# Render inspector html
							$inspector_html = '';
							$show_inspector	= $this->get_show_inspector();
							if ($show_inspector) {
								
								# Change modo temporally to get inspector html
								#$this->modo 	= 'edit_inspector';
								#$inspector_html = $this->get_html();
								# Restore original modo and continue
								$this->modo 	= 'edit';
								
								$inspector 		= new inspector($modo, $tipo);
								$inspector_html = $inspector->get_html();
							}
				*/					

				break;

		case 'list'	:
						
				#
				# ROWS_LIST . SECTION LIST
				# Render rows html from section_rows
					$rows_list_html 	= '';
					#$search_options_session_key = $this->tipo.'_'.$this->modo.'_'.TOP_TIPO;	//get_class().'_'.
					$search_options_session_key = 'section_'.$this->tipo;

					# SESSION_KEY OVERRIDES DEFAULT IN SOME CONTEXTS
					switch (true) {
						case ( isset($_REQUEST['m']) && $_REQUEST['m']=='tool_portal' ):
							#
							# TOOL PORTAL CASE
							# Override on tool_portal context 
							#$search_options_session_key = 'tool_portal_'.$this->tipo;
							$search_options_session_key = $context->search_options_session_key; // Get from tool portal context like 'tool_portal_oh1';
							break;
						case ( isset($this->context->context_name) && $this->context->context_name=='section_tool' && isset($this->context->tool_section_tipo) ):
							#
							# SECTION TOOL CASE
							# When current section is 'section_tool', $section_obj->context->section_tool was set with section_tool propiedades. In this case
							# section list of referenced 'tool_section_tipo' is used for create this session_key
							$search_options_session_key = 'section_'.$this->context->tool_section_tipo;
							break;
					}					


					if ( !empty($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]) ) {						
						
						$options = (object)$_SESSION['dedalo4']['config']['search_options'][$search_options_session_key];
							$options->full_count = false; # Force update count records on non ajax call
							if(SHOW_DEBUG) {
								#error_log("Section: Search options precalculado en sesión key $search_options_session_key");
							}

						if (!empty($options->layout_map_list)) {
							$options->layout_map = $options->layout_map_list;
								#dump($options->layout_map, " options->layout_map ++".to_string());
						}
						if (empty($options->layout_map)) {
							$options->layout_map = false; // Force calculate layout map in search class
						}
						if (!empty($options->offset_list)) {
							$options->offset = $options->offset_list;
						}
						if (!empty($options->limit_list)) {
							$options->limit = $options->limit_list;
						}

	
					}else{						
						
						$options = new stdClass();
							$options->section_tipo 		= $this->tipo;
							$options->section_real_tipo = $this->get_section_real_tipo(); # es mas rápido calcularlo aquí que en la estática;
							$options->layout_map 		= component_layout::get_layout_map_from_section( $this );
							$options->layout_map_list 	= $options->layout_map;
							$options->offset_list 		= (int)0;
							#$options->modo 			= $modo;
							$options->context 			= $this->context;	# inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
							$options->search_options_session_key = $search_options_session_key;
								#dump($options);#die();

							# OPTIONS CUSTOM
							switch (true) {
								case (isset($_REQUEST['m']) && $_REQUEST['m']=='tool_portal'):
									#
									# FILTER_BY_SECTION_CREATOR_PORTAL_TIPO
									# When received request 'm=tool_portal', options is set with param filter_by_section_creator_portal_tipo=$portal_tipo
									$portal_tipo = $_REQUEST['t'];
									$options->filter_by_section_creator_portal_tipo = $portal_tipo;
									break;
								case ( isset($this->context->context_name) && $this->context->context_name=='section_tool' && isset($this->context->top_tipo) ):
									#
									# SECTION TOOL CASE
									# When current section is 'section_tool', $section_obj->context->section_tool was set with section_tool propiedades. In this case
									# section list of referenced 'tool_section_tipo' is used for create this session_key
									$options->filter_by_inverse_locators = array('section_tipo' => $this->context->top_tipo);
									break;
								default:
									# code...
									break;
							}
							

							#
							# ACTIVITY CASE
							if ($this->tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
								$options->tipo_de_dato 			= 'dato';
								$options->tipo_de_dato_order	= 'dato';
								$options->order_by				= 'id DESC';	#section_id ASC
								$options->limit					= DEDALO_MAX_ROWS_PER_PAGE*3;
							}

							#dump($options->layout_map_list, '$options->layout_map_list ++ '.to_string());
					}

					# Override some specific options
						$options->modo	= $modo;
						//dump($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key], "$search_options_session_key ".to_string());
							#dump($options, ' options ++ '.to_string());

					$section_rows 	= new section_records($this->tipo, $options);
					$rows_list_html = $section_rows->get_html();
						#dump($section_rows, " section_rows ".to_string());
						#dump($this->tipo, ' this->tipo ++ '.to_string());
						#dump($_REQUEST['t'], ' tipo ++ '.to_string());

				#
				# SEARCH FORM . ROWS_SEARCH 
				# Render search form html
					$search_form_html 	= '';
					$records_search 	= new records_search($this, 'list');
					$search_form_html 	= $records_search->get_html();	

				#
				# TIME_MACHINE_HTML
				# Render tool time machine content
					$time_machine_html='';
					if(isset($context->context_name)) {
						switch ($context->context_name) {
							case 'list_into_tool_portal':
								# nothing to do
								$time_machine_html='';
								break;
						}
					}else{
						$tool_time_machine	= new tool_time_machine($this,'button_section_list');
						$time_machine_html 	= $tool_time_machine->get_html();	
					}

				#
				# BUTTONS
				# Calculate and prepare current section buttons to use as : $this->section_obj->ar_buttons
					$ar_buttons = (array)$this->get_ar_buttons();
					if(SHOW_DEBUG) {
						#dump($ar_buttons,"ar_buttons");
					}
				
				break;

		case 'list_tm':

				#
				# ROWS_LIST_HTML
				# CALLED FROM TRIGGER (trigger.tool_time_machine)
				# var options is a object passed in get_html call as argument 
					$rows_list_html='';
					if (!is_object($options) || empty($options) || !isset($options->filter_by_id)) {
						error_log("Error: Wrong options received for tm list");
						return false;
					}					
					
					$layout_map = component_layout::get_layout_map_from_section( $this );
						#dump($layout_map,"layout_map");
					
					#$options = new stdClass(); 
						$options->section_tipo 		= $this->tipo;
						$options->section_real_tipo = $this->get_section_real_tipo(); # es mas rápido calcularlo aquí que en la stática;
						$options->layout_map 		= $layout_map;
						$options->modo 				= $modo;
						$options->context 			= $this->context;	# inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
							#dump($options);die();

						$options->matrix_table  = 'matrix_time_machine';
						$options->json_field 	= 'dato';			
					
					$section_list 	= new section_records($this->tipo, $options);
					$rows_list_html = $section_list->get_html();

				break;
	
		case 'relation':
					#if(is_array($ar_section_list_obj)) foreach($ar_section_list_obj as $section_list) {
					#	$html_section_add	.= $section_list->get_html();
					#}					
					return false;
						$html_section_add = $generated_content_html;	
					break;
		case 'relation_reverse_sections':
					$file_name = 'relation_reverse';
		case 'relation_reverse':
					#if(is_array($ar_section_list_obj)) foreach($ar_section_list_obj as $section_list) {
					#	$html_section_add	.= $section_list->get_html();
					#}
					$html_section_add = $generated_content_html;
					break;		

		default:  echo "<blockquote> Error: modo '$modo' is not valid! </blockquote>"; return;
	}
		

		
	 
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';	
	include($page_html);

?>