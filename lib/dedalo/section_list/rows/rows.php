<?php
	
	# CONTROLLER
	
	$tipo					= $this->get_tipo();					
	$permissions			= common::get_permissions($tipo);
	$modo					= $this->get_modo();
	$ar_rows				= $this->get_ar_rows();		
		#dump($ar_rows , "AR_ROWS modo:$modo");

	$ar_component_obj_html	= array();
	$section_tipo 			= $this->section_obj->get_tipo();
	$button_delete_html		= '';
	#$ar_section_relations 	= $this->section_obj->get_ar_section_relations();
		#dump($ar_section_relations,"AR_SECTION_RELATIONS - modo.$modo");	

	$file_name 				= $modo;	
	$caller_id				= $this->section_obj->caller_id;		
	$caller_tipo 			= $this->section_obj->caller_tipo;
	$current_section		= navigator::get_selected('section');
	$current_section_id 	= navigator::get_selected('id');
	
	# CONTEXT (puede ser sobre-escrito pasándolo como variable del url)
	$context 				= $this->section_obj->get_context();
		#dump($context,'$context');	
	


	#dump($caller_tipo,'$caller_tipo (necesario para borrar!)');
	#dump($modo);


	
	switch($modo) {
		
		case 'list'	:	# LIST MODE
						if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data) {		
					
							# ROW		
							$id = $id_section;		#dump($id,'id');

							if (empty($id)) {
								#if(SHOW_DEBUG) dump($ar_data,'$ar_data');
								#throw new Exception("Error Processing Request. id is empty in list row ", 1);	
								#dump($ar_data,'$ar_data');
								dump("Se ha recibido un row de id 0 en rows.php. Se ha omitido pero algo va mal, probablemente haya un proyecto de parent 0 creado por error");
								continue;							
							}

							foreach($ar_data as $section_dato => $ar_component_obj) {
								
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

															
							}#end foreach($ar_data as $section_dato => $ar_component_obj)
									
							# LOAD HTML FOR EVERY ROW
							$row_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
							include($row_html);							 
							
						}#end if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data)
						break;				

		case 'list_tm': # LIST TIME MACHINE MODE
						if(empty($ar_rows)) {
							#dump($ar_rows,"ar_rows empty");
							print "No history found";
							return;
						}
						if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data) {		
					
							# ROW		
							$id = $id_section;		#dump($id,'id');

							# Reset every cicle
							$ar_component_obj_html=array();

							# Get ar_id_section_custom from section obj formated as $key (id time machine) => $value (id matrix)
							$ar_id_section_custom 	= $this->section_list_obj->section_obj->get_ar_id_section_custom();	
							# Get record from matrix_time_machine correspondent to current section id
							$id_time_machine 		= array_search($id_section, $ar_id_section_custom);

							foreach($ar_data as $section_dato => $ar_component_obj) {
										
								##
								# Despeja rel locator (identificador del tipo 1217.0.0)
								# requerido para los listados cuando hay caller_id
								#
								$rel_locator				= component_common::build_locator_relation($id, $component_tipo=0, $tag_id=0);
									#dump($rel_locator,'$rel_locator');
								

								# HTML DE LOS COMPONENTES DE ESTE ROW
								if(is_array($ar_component_obj)) foreach($ar_component_obj as $component_obj) {

									#dump($modo,'modo');
									
									$matrix_table 				= $component_obj->get_matrix_table();
									$ar_component_obj_html[] 	= $component_obj->get_html();			
								}								
															
							}#end foreach($ar_data as $section_dato => $ar_component_obj)
									
							# LOAD HTML FOR EVERY ROW
							$row_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
							include($row_html);						
							#unset($ar_component_obj_html);	
							
						}#end if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data) 
						break;		
				
		case 'relation':# RELATION MODE
						$ar_section_relations 	= $this->section_obj->get_ar_section_relations();
						if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data) {		
					
							# ROW		
							$id = $id_section;
								#dump($id_section,"id_section in relation");

							foreach($ar_data as $section_dato => $ar_component_obj) {
								#dump($section_dato,'$section_dato');

								##
								# RELATIONS
								# Como puede haber mas de una relación por sección (por ejemplo 10.0.1, 10.dd63.2, 10.dd63.3, etc..)
								# cotejamos aquí la sección actual con los datos del array de relaciones y desglosamos el row actual si
								# hay varias referencias a ella
								#
								if (!empty($ar_section_relations[$id_section])) foreach ($ar_section_relations[$id_section] as $relation) {
										
									##
									# rel locator (identificador del tipo 1217.0.0)
									# requerido para los listados cuando hay caller_id
									#							
									$rel_locator = $relation;
										#dump($rel_locator,'$rel_locator');

									# Reset every cycle
									$ar_component_obj_html=array();

									# Caso fragmento relacionado
									$fragment_html = NULL;
									if (strpos($rel_locator, '.0.0')===false) {
										$fragment_html 	= component_text_area::get_fragment_text_from_rel_locator( $rel_locator )[0];
											#dump($fragment_html,'fragment_html');
									}
									
									# HTML DE LOS COMPONENTES DE ESTE ROW
									if(is_array($ar_component_obj)) foreach($ar_component_obj as $component_obj) {
										# Forzamos el modo list para los componentes (override current modo 'relation_reverse')
										$component_obj->set_modo('list');
										$ar_component_obj_html[] = $component_obj->get_html();
									}
									
									# HTML BOTONES DE ESTE ROW
									/*
									$button_delete		= $this->get_button_delete($id_section);	#dump($button_delete,'$button_delete');
									if(is_object($button_delete))
									$button_delete_html	= $button_delete->get_html();
									*/
									if(isset($this->section_obj->ar_buttons['button_delete'][0])) {
										$this->section_obj->ar_buttons['button_delete'][0]->set_target($id_section);
										$button_delete_html	= $this->section_obj->ar_buttons['button_delete'][0]->get_html();
									}

									# LOAD HTML OF CURRENT ROW
									$row_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
									include($row_html);	
									#unset($ar_component_obj_html);
								}
							
							}#end foreach($ar_data as $section_dato => $ar_component_obj)
						
						}#end if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data)
						break;


		case 'relation_reverse_sections' :
		case 'relation_reverse':# RELATION REVERSE MODE
						
						if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data) {		
					
							# ROW		
							$id = $id_section;	#dump($id,'id');
								#dump($ar_data,'$ar_data',"data en rows.php");

							$rel_locator = $this->section_obj->get_rel_locator();
							$tag 		 = $this->section_obj->get_tag();		

							foreach($ar_data as $section_dato => $ar_component_obj) {
								#dump($section_dato,'$section_dato');

								# Reset every cycle
								$ar_component_obj_html=array();	
								
								# HTML DE LOS COMPONENTES DE ESTE ROW
								if(is_array($ar_component_obj)) foreach($ar_component_obj as $component_obj) {
									# Forzamos el modo list para los componentes (override current modo 'relation_reverse')
									$component_obj->set_modo('list');
									$ar_component_obj_html[] = $component_obj->get_html();
										#dump($ar_component_obj_html,'$ar_component_obj_html');			
								}
								
								# HTML BOTONES DE ESTE ROW
								/*
								$button_delete		= $this->get_button_delete($id_section);	#dump($button_delete,'$button_delete');
								if(is_object($button_delete))		
								$button_delete_html	= $button_delete->get_html();
								*/
								if(isset($this->section_obj->ar_buttons['button_delete'][0])) {
									$this->section_obj->ar_buttons['button_delete'][0]->set_target($id_section);
									$button_delete_html	= $this->section_obj->ar_buttons['button_delete'][0]->get_html();
								}

								# LOAD HTML OF CURRENT ROW							
								$row_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
								include($row_html);						
								#unset($ar_component_obj_html);			
							}
							
						}#end if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data) 
						break;

		case 'portal_list' :
						$ar_section_relations 	= $this->section_obj->get_ar_section_relations();
						$current_tipo_section 	= $this->section_obj->get_tipo();
							#dump($current_tipo_section , "current_tipo_section - modo:$modo - context:$context");
						$id = NULL;						
						# SWITCH CONTEXT
						switch($context) {

								# CASE CONTEXT COMPONENT_PORTAL_INSIDE_PORTAL_LIST
								case 'component_portal_inside_portal_list':
								case 'list_into_tool_relation':
								case 'list_into_tool_portal':

									$file_name = 'portal_list_inside';		#dump($ar_rows,'$ar_rows');									
									if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data) {		
								
										# ROW		
										$id = $id_section;
											#dump($id_section,"id_section in modo:$modo - context:$context");
											#dump($ar_data , "ar_data MODO:$modo CONTEXT:$context");

										# 'section_dato' es el id consecutivo de la sección para la columna del id
										# 'ar_component_obj' es el array de componentes a pintar como columnas
										foreach($ar_data as $section_dato => $ar_component_obj) {										
											
											#echo " section_dato_id:$section_dato - id_section:$id <br>";

											##
											# REL_LOCATOR ITERATION									
											# Dentro de la iteración de los componentes de esta sección, repetiremos el procesado por cada 'rel_locator' que exista en 
											# la sección actual (como en relaciones) . 
											# Bienvenidos al festival del foreach.
											if (!empty($ar_section_relations[$id_section])) foreach ($ar_section_relations[$id_section] as $rel_locator) {
													
												#dump($rel_locator,'$rel_locator');

												# HTML DE LOS COMPONENTES DE ESTE ROW
												if(is_array($ar_component_obj)) foreach($ar_component_obj as $component_obj) {

													$component_name = get_class($component_obj);
													$component_tipo = $component_obj->get_tipo();

													switch($component_name) {

														# Esto se revisará para cortar fragmentos de video o imágenes cuando los componentes av/image lo implementen
														case 'component_text_area':
																	
																	if (strpos($rel_locator, '.'.$component_tipo.'.')!==false) {
																		# Si el rel_locator refiere un fragmento (ej. 2541.dd20.1) extraemos el contenido del mismo como html del componente actual								
																		$fragment_html 	= component_text_area::get_fragment_text_from_rel_locator( $rel_locator )[0];
																			#dump($fragment_html,'fragment_html'." para rel_locator:$rel_locator");
																		$component_obj_html = $fragment_html;										
																	}else{
																		# Si el rel_locator NO refiere un fragmento (ej. 2541.0.0) extraeremos el componente completo (get->html())
																		$component_obj_html = $component_obj->get_html();
																	}
																	break;

														default:
																	# Default case
																	$component_obj_html = $component_obj->get_html();
																	break;					
													}
													$ar_component_obj_html[$rel_locator][] = $component_obj_html;

												}# /if(is_array($ar_component_obj)) foreach($ar_component_obj as $component_obj)


											}# /if (!empty($ar_section_relations[$id_section])) foreach ($ar_section_relations[$id_section] as $rel_locator)	




										}#end foreach($ar_data as $section_dato => $ar_component_obj)

										
									}# /if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data)

									#dump($ar_component_obj_html,'ar_component_obj_html');

									# LOAD HTML FOR EVERY ROW
									$row_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';		#dump($row_html);
									include($row_html);									
									break;
									

								# NORMAL CASE
								default:
									
									$file_name = 'portal_list';		#dump($ar_rows,'$ar_rows in portal');									
									if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data) {
										
										# ROW		
										$id = $id_section;
											#dump($id_section,"id_section in modo:$modo - context:$context");
											#dump($ar_data , "ar_data MODO:$modo CONTEXT:$context");
										
										foreach($ar_data as $section_dato => $ar_component_obj) {
											
											#dump($section_dato,'$section_dato');
											$n_tds = count($ar_component_obj)+1; 
											
											##
											# REL_LOCATOR ITERATION									
											#
											if (!empty($ar_section_relations[$id_section])) foreach ($ar_section_relations[$id_section] as $rel_locator) {
													
												# LOAD HTML OF CURRENT ROW
												$row_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
												include($row_html);
												#echo " $rel_locator <br> ";
											}else{

											}
										
										}#end foreach($ar_data as $section_dato => $ar_component_obj)

									}# /if(isset($ar_rows) && is_array($ar_rows)) foreach($ar_rows as $id_section => $ar_data)

									break;

							}# /switch($context)
											
							break;					
	}

	
	
?>