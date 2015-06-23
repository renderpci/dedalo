<?php
	
	# CONTROLLER


	$modo	 = $this->section_list_obj->options->modo;
	$context = (object)$this->section_list_obj->rows_obj->options->context; # inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
	if (!isset($context->context_name)) {
		$context->context_name = false;
	}
	#dump($context,"context");
	$result	 		= $this->section_list_obj->rows_obj->result;		
	$tipo			= $this->section_list_obj->get_tipo();
	$permissions 	= common::get_permissions($tipo);
	
	$ar_component_resolved = array();
	$button_delete_permissions = (int)$this->section_list_obj->button_delete_permissions;


	switch($modo) {		
		
		#
		# LIST
		#
		case 'list':
				
					$section_tipo = $this->section_list_obj->rows_obj->options->section_tipo;

					$section_list_tipo 	= key($this->section_list_obj->rows_obj->options->layout_map);
						#dump($section_list_tipo,"section_list_tipo");die();
					$ar_columnas_tipo = reset($this->section_list_obj->rows_obj->options->layout_map);
						#dump($columnas_tipo,"columnas_tipo");die();

					$RecordObj_dd = new RecordObj_dd($section_list_tipo);
					$propiedades  = json_handler::decode($RecordObj_dd->get_propiedades());					

						# Needed for portal_list_in_list . See portal_list_in_list html
						$n_records = count($result);
						$i =1;

					# NO RECORDS FOUND
					if ($n_records<1) {
						#echo "<div class=\"no_results_msg\"></div>"; # No results found
						return;
					}

					#dump($result," result");

					$notify=false;
					$ar_valor=array();
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
							dump("Se ha recibido un row de id 0 en rows.php. Se ha omitido pero algo va mal, probablemente haya un proyecto de parent 0 creado por error");
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
							

							switch (true) {
								case ( $modelo_name=='component_portal' ): //&& ($modo=='list' || $modo=='portal_list') 
										#
										# COMPONENT_PORTAL : Portal with locators
										$parent 		 = $section_id;
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
										break;

								case ( $modelo_name=='component_autocomplete' ): //&& ($modo=='list' || $modo=='portal_list') 
								case ( $modelo_name=='component_radio_button' ):
								case ( $modelo_name=='component_check_box' ):
								case ( $modelo_name=='component_select' ):
								case ( $modelo_name=='component_relation' ):
										#
										# COMPONENT_AUTOCOMPLETE : With locators
										$parent 		   = $section_id;	//null;
										$current_component = component_common::get_instance($modelo_name, $current_component_tipo, $parent, 'list', DEDALO_DATA_NOLAN, $section_tipo);										
										
										# Use already query calculated values for speed
										$ar_records   = (array)json_handler::decode($rows[$current_component_tipo]);	#dump($ar_records,"ar_records for portal $current_component_tipo - id:$id");#die();
										$current_component->set_dato($ar_records);
										$current_component->set_identificador_unico($current_component->get_identificador_unico().'_'.$id); // Set unic id for build search_options_session_key used in sessions
									
										$component_html = $current_component->get_valor();
										$ar_valor[$current_component_tipo] = $component_html;
										break;

								case ($modelo_name=='component_text_area'):
										#
										# COMPONENT_TEXT_AREA
										# Discriminate if we want a text fragment or whole
										switch ($modo) {
											/*
											case 'portal_list':
												$ar_parts = explode('.', $current_id);
												if (isset($ar_parts[2]) && $ar_parts[2]==0) {
													##  OJO : Los fragmentos vienen pre-selecionados ya desde section_list. Sólo para el completo hará falta seleccionar el fragmento
													$obj_value = json_handler::decode($rows[$current_component_tipo]);
													$current_tag = 0;
													if (is_object($obj_value) && isset($obj_value->$current_tag)){
														$ar_valor[$current_component_tipo] = $obj_value->$current_tag;	#."++++++ ".$rows[$current_component_tipo]." ".print_r($obj_value,true);
													}else{
														$ar_valor[$current_component_tipo] = $rows[$current_component_tipo];
													}
												}else{
													# Precortado
													$ar_valor[$current_component_tipo] = $rows[$current_component_tipo];
												}
												#break;
											*/
											default:
												$obj_value = json_decode($rows[$current_component_tipo]); # Evitamos los errores del handler accediendo directamente al json_decode de php
												$current_tag = 0;
												if (is_object($obj_value) && isset($obj_value->$current_tag)) {
													$ar_valor[$current_component_tipo] = $obj_value->$current_tag;
												}else{
													$ar_valor[$current_component_tipo] = $rows[$current_component_tipo];
												}
												#break;
										}

										# TRUNCATE ALL FRAGMENTS
										#$ar_valor[$current_component_tipo] = TR::limpiezaFragmentoEnListados($ar_valor[$current_component_tipo],160);
										TR::limpiezaFragmentoEnListados($ar_valor[$current_component_tipo],160);

										#$ar_valor[$current_component_tipo] = $ar_valor[$current_component_tipo]."?????";
										/*
										if (strpos($current_id, '.')) {
											# Precortado
											$ar_valor[$current_component_tipo] = $rows[$current_component_tipo];
										}else{
											$obj_value = json_handler::decode($rows[$current_component_tipo]);
											$current_tag = 0;
											if (isset($obj_value->$current_tag))
												$ar_valor[$current_component_tipo] = $obj_value->$current_tag;
										}										
										#dump($obj_value->$current_tag,"obj_value->$current_tag of $current_tag - $current_id");
										*/
										break;

								case ($modelo_name=='component_av'):
								case ($modelo_name=='component_image'):
								case ($modelo_name=='component_pdf'):
										$ar_valor[$current_component_tipo] = (string)$rows[$current_component_tipo];
										break;
								case ($modelo_name=='component_check_box'):
										# Ex. '{"34": "2", "36": "2"}'
										$current_valor = $rows[$current_component_tipo];
										#if (!empty($current_valor)) {
											$ar_val = json_decode($current_valor);											
											$component = component_common::get_instance($modelo_name, $current_component_tipo, null, 'list', DEDALO_DATA_LANG, $section_tipo);
											$component->set_dato($ar_val);											
											$ar_valor[$current_component_tipo] = (string)$component->get_valor();
										#}else{
										#	$ar_valor[$current_component_tipo] = (string)$rows[$current_component_tipo];
										#}
										break;
								default:
										#
										# OTHER DEFAULT										
										if (isset($this->section_list_obj->rows_obj->columns_to_resolve->$current_component_tipo)) {

											$columns_to_resolve = $this->section_list_obj->rows_obj->columns_to_resolve->$current_component_tipo;
												#dump($columns_to_resolve," columns_to_resolve ($current_component_tipo)");

											$current_component_to_resolve_tipo = $columns_to_resolve->rel;
												#dump($current_component_to_resolve_tipo," $modelo_name");
												#dump(RecordObj_dd::get_modelo_name_by_tipo($current_component_to_resolve_tipo,true), ' RecordObj_dd::get_modelo_name_by_tipo($current_component_to_resolve_tipo,true);');

											
											# CÁLCULO MEDIANTE COMPONENTE.
											# NOTA: Se puede hacer también mediante sección si es necesario + velocidad
											# $start_time=microtime(1);
											$current_valor = $rows[$current_component_tipo];
											if (!empty($current_valor)) {
												if(SHOW_DEBUG) {
													#dump($current_valor," valor");
												}
												
											$component = component_common::get_instance(null, $current_component_to_resolve_tipo, (int)$current_valor, 'edit', DEDALO_DATA_LANG, $section_tipo);
												#$component = component_common::get_instance($modelo_name, $current_component_to_resolve_tipo, (int)$current_valor, 'edit', DEDALO_DATA_LANG, SECTION_TIPO);

													
												$current_valor_final = $component->get_valor();
													#dump($current_valor_final," ");
												$ar_valor[$current_component_tipo] = (string)$current_valor_final;

											}else{
												$ar_valor[$current_component_tipo] = (string)$rows[$current_component_tipo];
											}#echo $time=round(microtime(1)-$start_time,4).'<br>';											

										}else{
											$ar_valor[$current_component_tipo] = (string)$rows[$current_component_tipo];
										}										
										#$ar_valor[$current_component_tipo] = (string)$rows[$current_component_tipo];
										break;

							}//end switch (true) {
							
							

							#dump($ar_valor[$current_component_tipo],"ar_valor[current_component_tipo]");
							#$ar_valor[$current_component_tipo] = $ar_valor[$current_component_tipo]."#### $current_component_tipo ###";

							/*
							#dump($ar_component_obj,'ar_component_obj');

							#
							# Despeja rel locator (identificador del tipo 1217.0.0)
							# requerido para los listados cuando hay caller_id
							#
							#if($caller_id) {
							$rel_locator = component_common::build_locator_relation($id, $component_tipo=0, $tag_id=0);
									#dump($rel_locator,'$rel_locator');	
							#}															

							# Detect current table
							$current_table = $ar_component_obj[0]->get_matrix_table();

							# Html botones de este row								
								#dump($this->section_obj->ar_buttons,'$this->ar_buttons');
							if(isset($this->section_obj->ar_buttons['button_delete'][0])) {
								$this->section_obj->ar_buttons['button_delete'][0]->set_target($id_section);
								$button_delete_html	= $this->section_obj->ar_buttons['button_delete'][0]->get_html();
							}
							*/
														
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
				$section_tipo 		= $this->section_list_obj->rows_obj->options->section_tipo;
				$section_list_tipo 	= key($this->section_list_obj->rows_obj->options->layout_map);						
				$ar_columnas_tipo 	= reset($this->section_list_obj->rows_obj->options->layout_map);
					#dump($ar_columnas_tipo," ar_columnas_tipo");						
				
				#$propiedades 		= json_handler::decode($this->section_list_obj->get_propiedades());
				$RecordObj_dd = new RecordObj_dd($section_list_tipo);
				$propiedades  = json_handler::decode($RecordObj_dd->get_propiedades());				
	
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
										
										
										$section_list_portal 	= new section_list($current_component_tipo, $options);
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
									$ar_valor[$current_component_tipo] = (string)$rows[$current_component_tipo];									
									break;
							default:
									#
									# OTHER DEFAULT.
									#dump($this->section_list_obj->rows_obj->columns_to_resolve->$current_component_tipo," ");
									if (isset($this->section_list_obj->rows_obj->columns_to_resolve->$current_component_tipo)) {
										$columns_to_resolve = $this->section_list_obj->rows_obj->columns_to_resolve->$current_component_tipo;
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