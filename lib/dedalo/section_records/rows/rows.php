<?php
	
	# CONTROLLER


	$modo	 		= $this->section_records_obj->options->modo;
	$result	 		= $this->section_records_obj->rows_obj->result;
	$tipo			= $this->section_records_obj->get_tipo();
	$permissions 	= common::get_permissions($tipo,$tipo);
	
	$ar_component_resolved = array();
	$button_delete_permissions = (int)$this->section_records_obj->button_delete_permissions;
		#dump($button_delete_permissions, ' button_delete_permissions ++ '.to_string());
		#dump($this->section_records_obj, ' result ++ '.to_string());

	#
	# CONTEXT
	# inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
	$context = (object)$this->section_records_obj->rows_obj->options->context; 
	if (!isset($context->context_name)) {
		$context->context_name = false;
	}
	#dump($context,"context");
	#dump($this, '$this->section_records_ob ++ '.to_string());

	switch($modo) {		
		
		#
		# EDIT
		#
		case 'edit_OLD':
				#dump($this->section_records_obj->rows_obj, " var ".to_string());

				#
				# FIRST RECORD (AND THE ONLY ONE RECORD)
				# Get the only one (limit 1) record found in data->result
					$first_record = reset($result[0]); #dump($first_record, " first_record ".to_string());
					if (!isset($first_record)) {
						return null;
					}
					$section_id = (int)$first_record['section_id'];
						#dump($section_id, " section_id ".to_string($tipo));
					if($section_id<1) {
						if(SHOW_DEBUG) {
							dump($section_id, "DEBUG WARNING: section_id is <1 in result: ".to_string($result));;
						}
						return null;
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
					$permissions			= common::get_permissions($tipo);
						$section->set_permissions($permissions);	// Fix permissions for current element (important)

				#
				# SECURITY
				# Verify current record is authorized for current user. If not, force set permissions to 0
					$is_authorized_record = (bool)filter::is_authorized_record($section_id, $tipo);
						#dump($is_authorized_record,"is_authorized_record");
					if (!$is_authorized_record) {
						$permissions = 0;
						$section->set_permissions( $permissions ); // Fix permissions for current element (important)
						$this->set_permissions( $permissions ); // Fix permissions for current element (important)
					}

				#
				# RECORD_LAYOUT_HTML
				# Render record components html based on current layout
					$record_layout_html = '';

					#
					# SECTION VIRTUAL CASE
					# Special vars config when current is a virtual section
						if ($section->section_virtual==true ) {
							# Clone current  section obj
							$current_section_obj  = clone $section;
							# Inject real tipo to section object clone sended to layout when mode is edit
							$current_section_obj->set_tipo($section_real_tipo);

							# 
							# EXCLUDE ELEMENTS of current layout edit.
							# Exclude elements can be overwrite with get/post request
								if (!empty($_REQUEST['exclude_elements'])) {
									# Override default exclude elements
									$exclude_elements_tipo = trim($_REQUEST['exclude_elements']);
								}else{
									# Localizamos el elemento de tipo 'exclude_elements' que será hijo de la sección actual
									$ar_exclude_elements_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section->get_tipo(),'exclude_elements',true,false); //section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true																	
									$exclude_elements_tipo 	  = reset($ar_exclude_elements_tipo);
										#dump($ar_exclude_elements_tipo,"exclude_elements_tipo for tipo: $section->tipo - $exclude_elements_tipo");
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
							#dump($ar_exclude_elements,'ar_exclude_elements '.$section->tipo);
						}#end if ($section->section_virtual==true )

					#
					# LAYOUT MAP : PENDIENTE UNIFICAR MAQUETACIÓN CON LAYOUT MAP A PARTIR DEL MODO EDIT <------
					# Consulta el listado de componentes a mostrar en el listado / grupo actual
						#dump($current_section_obj,"current_section_obj");die();					
						$layout_map = component_layout::get_layout_map_from_section($current_section_obj); # Important: send obj section with REAL tipo to allow resolve structure
							#dump($layout_map,"layout ".$current_section_obj->tipo);
							#dump($section->permissions, ' $section->permissions');
						
						
						if ((int)$section->permissions>0) {									
							# WALK : Al ejecutar el walk sobre el layout map podemos excluir del rendeo de html los elementos (section_group, componente, etc.) requeridos (virtual section)
							if(SHOW_DEBUG) {
								global$TIMER;$TIMER['component_layout::walk_layout_map'.'_IN_'.$section->get_tipo().'_'.$section->get_modo().'_'.microtime(1)]=microtime(1);
							}
							$ar = array();
							$current_section_obj->set_tipo( $section->get_tipo() ); # Restore section tipo (needed for virtual sections resolution)
								#dump($this, ' this');
							# ROWS_SEARCH
							#$records_search = new records_search($this, $modo);
							#$record_layout_html .= $records_search->get_html();
							#dump($section->get_tipo(),"section_list"); #die();						

							$record_layout_html .= component_layout::walk_layout_map($current_section_obj, $layout_map, $ar, $ar_exclude_elements); 
								#dump($ar_exclude_elements,"layout ".$current_section_obj->tipo);							

							if(SHOW_DEBUG) {
								global$TIMER;$TIMER['component_layout::walk_layout_map'.'_OUT_'.$section->get_tipo().'_'.$section->get_modo().'_'.microtime(1)]=microtime(1);
							}
						}//end if ($this->permissions===0) {

						#dump($record_layout_html, " record_layout_html ".to_string());

				
				#
				# SEARCH FORM . ROWS_SEARCH 
				# Render search form html. NOTA: COMO NO SE RECARGA VIA AJAX, LO DEJAMOS EN section_edit.phtml
					#$search_form_html 	= '';
					#$records_search 	= new records_search($section, 'edit');
					#$search_form_html 	= $records_search->get_html();
								

				#
				# INSPECTOR HTML
				# Render inspector html . NOTA: COMO NO SE RECARGA VIA AJAX, LO DEJAMOS EN section_edit.phtml
					/*
					$inspector_html = '';
					$show_inspector	= $section->get_show_inspector();
					if ($show_inspector) {						
						$inspector 		= new inspector($modo, $tipo);
						$inspector_html = $inspector->get_html();
					}
					*/					
				
				# LOAD HTML FOR CURRENT ROW
					$row_html_file	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $modo .'.phtml';
					include($row_html_file);

				break;

		
		#
		# LIST
		#	
		case 'list':
				
				$section_tipo 		= $this->section_records_obj->rows_obj->options->section_tipo;
				$section_list_tipo 	= key($this->section_records_obj->rows_obj->options->layout_map);					
				$ar_columnas_tipo 	= reset($this->section_records_obj->rows_obj->options->layout_map);					

				$RecordObj_dd = new RecordObj_dd($section_list_tipo);
				$propiedades  = json_decode($RecordObj_dd->get_propiedades());				

					# Needed for portal_list_in_list . See portal_list_in_list html
					$n_records = count($result);
					$i =1;

				# NO RECORDS FOUND CASE. Stop and return null
				if ($n_records<1) {
					#echo "<div class=\"no_results_msg\"></div>"; # No results found
					return;
				}

				$notify  =false;
				$ar_valor=array();
				$offset  = (int)$this->section_records_obj->rows_obj->options->offset;

				foreach ($result as $key => $table_rows) {	#dump($table_rows,"table rows for $key");						
				foreach ($table_rows as $current_id => $rows) {

					

					# REL_LOCATOR : The current_id can be id matrix or locator like object
					$rel_locator = $current_id;		 # Temporal. Luego se sobreescribe 				
						#dump($rel_locator,"rel_locator");
					
					if (isset($rows['lc_object'])) { // Locator object
						$rel_locator = $rows['lc_object'];
						$rel_locator = json_handler::encode($rel_locator);
					}
					#dump($rel_locator,"locator_object");

					# ROW		
					#$id = $rows['section_id'];	#dump($id,"id - $current_id");
					if($section_tipo == DEDALO_ACTIVITY_SECTION_TIPO){
						$id = $rows['id'];
						$section_id = $id;
					}else{
						$id = $rows['section_id'];
						$section_id = $rows['section_id'];
					}

					if (empty($id)) {
						debug_log(__METHOD__." It received a row id 0 in rows.php. It has been omitted, but something goes wrong, probably a project created by mistake with parent 0 ".to_string(), logger::ERROR);
						continue;
					}

					


					#
					# COLUMNS
					#
					#dump($ar_columnas_tipo,"ar_columnas_tipo");						
					foreach($ar_columnas_tipo as $current_component_tipo) {

						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);							
						
						# NOTIFY : Notificamos la carga del elemento a common
						if (!$notify) {
							common::notify_load_lib_element_tipo($current_component_tipo, $modelo_name, 'edit');	#dump($notify, '$notify');								
						}
						
						$value = $rows[$current_component_tipo];
							#dump($value, ' value ++ '.to_string());
							
						/**/
						// Override db value with component value interpretation 'render_list_value'
						$value = $modelo_name::render_list_value($value, // value string from db
																 $current_component_tipo, // current component tipo
																 $section_id, // current row section id
																 'list', // mode fixed list
																 DEDALO_DATA_LANG, // current data lang
																 $section_tipo, // current section tipo
																 $id);
						
						$ar_valor[$current_component_tipo] = (string)$value;

					}#end foreach($ar_data as $section_dato => $ar_component_obj)


					# FILENAME : Varios modos comparten el script del controlador por lo que sólo cambiamos el fichero html final
					switch ($modo) {
						#case 'portal_list':
						#	$file_name = 'list';
						#	break;							
						case 'portal_list_in_list':
							$file_name = 'portal_list_in_list';
							break;
						default:
							$file_name = $modo;
							break;
					}

					# ACTIVITY DEDALO_ACTIVITY_SECTION_TIPO
					if ($section_tipo==DEDALO_ACTIVITY_SECTION_TIPO) {
						$file_name = 'activity';
					}

							
					# LOAD HTML FOR EVERY ROW
					$row_html_file	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
					include($row_html_file);
					
					$notify=true;

					# Offset global of current record inside result. Used for send var to edit page
					$offset++;

				}#end if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data)
				}

				#dump($ar_valor,"ar_valor");
				#foreach ($ar_valor as $key => $value) {
				#	echo "<hr><b>key</b> $key - <b>value</b> $value ";
				#}
				break;

		#
		# LIST_TM
		#		
		case 'list_tm':
				$section_tipo 		= $this->section_records_obj->rows_obj->options->section_tipo;
				$section_list_tipo 	= key($this->section_records_obj->rows_obj->options->layout_map);						
				$ar_columnas_tipo 	= reset($this->section_records_obj->rows_obj->options->layout_map);
					#dump($ar_columnas_tipo," ar_columnas_tipo");						
				
				$RecordObj_dd 	= new RecordObj_dd($section_list_tipo);
				$propiedades  	= json_decode($RecordObj_dd->get_propiedades());				
	
				$ar_valor=array();
				#dump($result," result");
				foreach ($result as $key => $table_rows) {
				foreach ($table_rows as $current_id => $rows) {

					# REL_LOCATOR : The current_id can be id matrix or locator like object
					$rel_locator = $current_id;

					# ROW		
					$id = $rows['id'];	#dump($id,"id - $current_id");
		

					$section_id = $rows['section_id'];
					foreach($ar_columnas_tipo as $current_component_tipo) {
						
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
							#dump($modelo_name,"modelo_name ");					
							#dump($rows[$current_component_tipo]," $current_component_tipo - $modelo_name");
						switch (true) {
							
							case ($modelo_name=='component_portal'):
									/*
									#
									# COMPONENT_PORTAL
									# Filter modo = list, avoid recursion on portal list

									# calculamos su valor (será un list)
									$portal_valor = $rows[$current_component_tipo];
										#dump($portal_valor,"portal_valor $current_component_tipo");#die();

									$ar_records = (array)json_handler::decode($portal_valor);
										#dump($ar_records,"ar_records for portal $current_component_tipo - id:$id");#die();
									
									if (empty($ar_records)) {
										# Empty portal 
										$ar_valor[$current_component_tipo] = '';
									}else{
										# Portal with locators

											# Calculamos su list
											#$section = section::get_instance(NULL, $section_tipo)
											#
											$relacionados = (array)RecordObj_dd::get_ar_terminos_relacionados($current_component_tipo, $cache=false, $simple=true);
												#dump( $relacionados,"relacionados $current_component_tipo");die();

											foreach ($relacionados as $key => $current_tipo) {
												$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
													#dump($modelo_name,"modelo_name $modelo");
												if ($modelo_name=='section') {
													$portal_section_tipo = $current_tipo;
													unset($relacionados[$key]);
													break;
												}
											}

											$layout_map_virtual = array($current_component_tipo=>$relacionados);
												#dump( $layout_map_virtual,"layout_map_virtual - $portal_section_tipo");die();										

											$search_options_session_key = 'TM_'.$current_id.'_'.$current_component_tipo.'_'.$portal_section_tipo.'_'.$section_id. '_' .TOP_TIPO;	#'portal_list_in_list';
											if (!empty($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
												$options = $_SESSION['dedalo4']['config']['search_options'][$search_options_session_key];
												#$options->full_count = false; # Force update count records on non ajax call
											}else{
												$options = new stdClass();
												$options->section_tipo 	= $portal_section_tipo;
												$options->filter_by_id 	= $ar_records;
												$options->layout_map 	= $layout_map_virtual;
												$options->modo   		= 'portal_list_in_list';
												$options->limit   		= 1;
												$options->search_options_session_key = $search_options_session_key;
													#dump($options,"options");
											}
										
										
										$section_list_portal 	= new section_records($current_component_tipo, $options);
										$rows_html 		 		= $section_list_portal->get_html();
										$component_html 		= $rows_html;
											#dump($component_html,"html");

										$ar_valor[$current_component_tipo] = $component_html;
											#dump($current_component_tipo,"portal: current_component_tipo");

									}
									*/
									# Portal with locators
									$parent 		 = null;
									$component_portal = component_common::get_instance('component_portal',$current_component_tipo,$parent,'list',DEDALO_DATA_NOLAN, $section_tipo);
									$component_portal->html_options->rows_limit	= 1;
									if ($parent===null) {
										# Use already query calculated values for speed
										$ar_records   = (array)json_handler::decode($rows[$current_component_tipo]);	#dump($ar_records,"ar_records for portal $current_component_tipo - id:$id");#die();
										$component_portal->set_dato($ar_records);
										$component_portal->set_identificador_unico($component_portal->get_identificador_unico().'_'.$id); // Set unic id for build search_options_session_key used in sessions
									}
									$component_html = $component_portal->get_html();
									$ar_valor[$current_component_tipo] = $component_html;
									break;#end portal
							
							case ($modelo_name=='component_text_area'):
									#
									# COMPONENT_TEXT_AREA
									# Discriminate if we want a text fragment or whole									
									$obj_value = json_decode($rows[$current_component_tipo]); # Evitamos los errores del handler accediendo directamente al json_decode de php
									$current_tag = 0;
									if (is_object($obj_value) && isset($obj_value->$current_tag)) {
										$ar_valor[$current_component_tipo] = $obj_value->$current_tag;
									}else{
										$ar_valor[$current_component_tipo] = $rows[$current_component_tipo];
									}
									break;#end text area
							
							case ($modelo_name=='component_av'):
							case ($modelo_name=='component_image'):
							case ($modelo_name=='component_image'):
									$image_value = (string)$rows[$current_component_tipo];
										#dump($ar_valor[$current_component_tipo], '$ar_valor[$current_component_tipo] ++ '.to_string());	
									$image_value = component_image::image_value_in_time_machine( $image_value );
									$ar_valor[$current_component_tipo] = $image_value;																	
									break;

							case ( $modelo_name=='component_autocomplete_ts' ):
									#
									# COMPONENT_AUTOCOMPLETE_TS :
									$ar_valor[$current_component_tipo] = (string)$rows[$current_component_tipo];
									break;

							case ( $modelo_name=='component_autocomplete' ): //&& ($modo=='list' || $modo=='portal_list') 
							case ( $modelo_name=='component_radio_button' ):
							case ( $modelo_name=='component_check_box' ):
							case ( $modelo_name=='component_select' ):
							case ( $modelo_name=='component_relation' ):
							case ( $modelo_name=='component_publication' ):
									#
									# COMPONENT_AUTOCOMPLETE : With locators
									$parent 		   = $section_id;	//null;
									$current_component = component_common::get_instance($modelo_name, $current_component_tipo, $parent, 'list', DEDALO_DATA_NOLAN, $section_tipo);								
									
									# Use already query calculated values for speed
									$ar_records   = (array)json_handler::decode($rows[$current_component_tipo]);	#dump($ar_records,"ar_records for portal $current_component_tipo - id:$id");#die();
									$current_component->set_dato($ar_records);
									$current_component->set_identificador_unico($current_component->get_identificador_unico().'_'.$id); // Set unic id for build search_options_session_key used in sessions
									
									$component_html = $current_component->get_valor(DEDALO_DATA_LANG);
									$ar_valor[$current_component_tipo] = $component_html;
									break;

							case ($modelo_name=='component_filter'):
							case ($modelo_name=='component_filter_master'):
									$current_valor  = $rows[$current_component_tipo];
									$ar_val 		= json_decode($current_valor);
									$component = component_common::get_instance($modelo_name, $current_component_tipo, null, 'list', DEDALO_DATA_LANG, $section_tipo);
									$component->set_dato($ar_val);
									$ar_valor[$current_component_tipo] = (string)$component->get_valor();
									break;

							default:
									#
									# OTHER DEFAULT.
									#dump($this->section_records_obj->rows_obj->columns_to_resolve->$current_component_tipo," ");
									if (isset($this->section_records_obj->rows_obj->columns_to_resolve->$current_component_tipo)) {
										$columns_to_resolve = $this->section_records_obj->rows_obj->columns_to_resolve->$current_component_tipo;
											#dump($columns_to_resolve," columns_to_resolve");

										$current_component_to_resolve_tipo = $columns_to_resolve->rel;
											#dump($current_component_to_resolve_tipo," ");
										
										# CÁLCULO MEDIANTE COMPONENTE.
										# NOTA: Se puede hacer también mediante sección si es necesario + velocidad
										# $start_time=microtime(1);
										$current_valor = $rows[$current_component_tipo];
										if (!empty($current_valor)) {
											#dump($current_valor," valor");
											$component = component_common::get_instance(null, $current_component_to_resolve_tipo, (int)$current_valor, 'list', DEDALO_DATA_LANG, $section_tipo);
												
											$current_valor_final = $component->get_valor();
												#dump($current_valor_final," $current_component_to_resolve_tipo - $section_tipo");
											$ar_valor[$current_component_tipo] = (string)$current_valor_final;
										}else{
											$ar_valor[$current_component_tipo] = (string)$rows[$current_component_tipo];
										}#echo $time=round(microtime(1)-$start_time,4).'<br>';											

									}else{
										$ar_valor[$current_component_tipo] = (string)$rows[$current_component_tipo];
									}
									break;
						}
																			
					}#end foreach($ar_data as $section_dato => $ar_component_obj)
					#dump($ar_valor,"ar_valor ");


					# FILENAME : Varios modos comparten el script del controlador por lo que sólo cambiamos el fichero html final
					$file_name = $modo;
							
					# LOAD HTML FOR EVERY ROW
					$row_html_file	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
					include($row_html_file);
				
				}#end if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data)
				}
				break;

	}#end switch($modo)




?>