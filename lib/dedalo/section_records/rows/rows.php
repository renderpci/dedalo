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
					if($section_tipo == DEDALO_ACTIVITY_SECTION_TIPO){
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
						if (!$notify) {
							common::notify_load_lib_element_tipo($current_component_tipo, $modelo_name, 'edit');
						}
						
						$value = $rows[$current_component_tipo];
						
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
																 'list', // mode fixed list
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