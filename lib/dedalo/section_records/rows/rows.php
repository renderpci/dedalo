<?php
	
	# CONTROLLER


	$modo	 		= $this->section_records_obj->options->modo;
	$result	 		= $this->section_records_obj->rows_obj->result;
	$tipo			= $this->section_records_obj->get_tipo();
	$permissions 	= common::get_permissions($tipo,$tipo);
	
	$ar_component_resolved 		= array();

	#
	# Button delete	
	$button_delete_permissions 	= (int)$this->section_records_obj->button_delete_permissions;
	if (isset($this->section_records_obj->button_delete)) {
		$button_delete 				= $this->section_records_obj->button_delete;
		$button_delete_propiedades  = $button_delete->get_propiedades();
	}	
	$button_delete_actions 		= new stdClass();
	if (isset($button_delete_propiedades->delete_action_pre)) {
		$button_delete_actions->delete_action_pre = $button_delete_propiedades->delete_action_pre->method;
	}
	if (isset($button_delete_propiedades->delete_action_post)) {
		$button_delete_actions->delete_action_post = $button_delete_propiedades->delete_action_post->method;
	}
	$button_delete_actions_json = json_encode($button_delete_actions);
	
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
		# LIST
		#
		case 'list':
				
				$section_tipo 		= $this->section_records_obj->rows_obj->options->section_tipo;
				$section_list_tipo 	= key($this->section_records_obj->rows_obj->options->layout_map);
				$ar_columns_tipo 	= reset($this->section_records_obj->rows_obj->options->layout_map);
				
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
					if($section_tipo === DEDALO_ACTIVITY_SECTION_TIPO){
						$id = $rows['id'];
						#$section_id = $id;
						$section_id = $rows['section_id'];
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
					#dump($ar_columns_tipo,"ar_columns_tipo");
					foreach($ar_columns_tipo as $current_component_tipo) {

						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
						
						# NOTIFY : Notificamos la carga del elemento a common
						if ($notify===false) {
							common::notify_load_lib_element_tipo($modelo_name, 'edit');
						}
						
						$db_value = $rows[$current_component_tipo];

						$render_list_mode = 'list';
						# Overwrite defailt list mode when need. Set component propiedades 'elements_list_mode' as you want, like edit..							
						if (isset($propiedades->elements_list_mode->$current_component_tipo->mode)) {
							$render_list_mode = $propiedades->elements_list_mode->$current_component_tipo->mode;
						}
											
						// Override db value with component value interpretation 'render_list_value'
						$value = $modelo_name::render_list_value($db_value, // value string from db
																 $current_component_tipo, // current component tipo
																 $section_id, // current row section id
																 $render_list_mode, // mode fixed list : default 'list'
																 DEDALO_DATA_LANG, // current data lang
																 $section_tipo, // current section tipo
																 $id);
						
						$ar_valor[$current_component_tipo] = (string)$value;


						#
						# PORTALS. Portal with multiple list cases
						if ($modelo_name==='component_portal') {							
							$ar_section_list = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_component_tipo, 'section_list', 'children', true);
							#dump($ar_section_list, ' $ar_section_list ++ '.to_string($current_component_tipo));
							if (count($ar_section_list)>1) foreach ($ar_section_list as $slkey => $current_section_list_tipo) {
								if ($slkey===0) continue; # Skip first default list already calculated

								// Override db value with component value interpretation 'render_list_value'
								$value2 = $modelo_name::render_list_value($db_value, // value string from db
																		 $current_component_tipo, // current component tipo
																		 $section_id, // current row section id
																		 $render_list_mode, // mode fixed list
																		 DEDALO_DATA_LANG, // current data lang
																		 $section_tipo, // current section tipo
																		 $id,
																		 null,
																		 null,
																		 $slkey);
								
								$ar_valor[$current_component_tipo.'_'.$slkey] = (string)$value2;								
							}
						}//end if ($modelo_name==='portal')


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
					if ($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
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
				$ar_columns_tipo 	= reset($this->section_records_obj->rows_obj->options->layout_map);
								
				$RecordObj_dd 		= new RecordObj_dd($section_list_tipo);
				$propiedades  		= json_decode($RecordObj_dd->get_propiedades());
	
				$ar_valor=array();
				#dump($result," result");
				foreach ($result as $key => $table_rows) {
				foreach ($table_rows as $current_id => $rows) {

					# REL_LOCATOR : The current_id can be id matrix or locator like object
					$rel_locator = $current_id;

					# ROW		
					$id = $rows['id'];		

					$section_id = $rows['section_id'];
					foreach($ar_columns_tipo as $current_component_tipo) {
						
						$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
						
						$value = $rows[$current_component_tipo];
						
						// Override db value with component value interpretation 'render_list_value'
						$value = $modelo_name::render_list_value($value, // value string from db
																 $current_component_tipo, // current component tipo
																 $section_id, // current row section id
																 'list_tm', // mode fixed list
																 DEDALO_DATA_LANG, // current data lang
																 $section_tipo, // current section tipo
																 $id);
						
						$ar_valor[$current_component_tipo] = (string)$value;
					
					}#end foreach($ar_data as $section_dato => $ar_component_obj)


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