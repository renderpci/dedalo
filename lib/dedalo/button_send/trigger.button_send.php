<?php
/**
* ESTE BOTÓN NO SE USA PARA NADA... ELIMINAR TRAS VERIFICARLO...
*
*/



require_once( dirname(dirname(__FILE__)) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");



# set vars
	$vars = array('mode','id','parent','dato','tipo');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}
	
	
# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");


# NEW	
	if(!$tipo && empty($tipo)) exit("<span class='error'> Trigger: Error Need tipo..</span>");
	
	$html 		= '';	
	$parent		= 0;
	$section_id = 0; # Default value when no section of this tipo exists

	$matrix_table 			= common::get_matrix_table_from_tipo($tipo);
	
	# ID  . Buscamos todos los registro de esta sección (si ya existe alguno)
	$arguments=array();
	$arguments['tipo']		= $tipo;
	$arguments['parent']	= $parent;	
	$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
	$ar_result				= $RecordObj_matrix->search($arguments);
	
	# Si existe alguno, seleccionamos el mayor
	if(count($ar_result)>0) {
		
		$id_matrix			= max($ar_result);	# selecciona el valor mayor en el array 
		$section_obj 		= new section($id_matrix, $tipo);
		$section_id			= $section_obj->get_section_id();
	}
		
	
	# NEW RECORD . Create and save
	$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
	$RecordObj_matrix->set_dato(intval($section_id+1));	
	$RecordObj_matrix->set_parent($parent);
	$RecordObj_matrix->set_tipo($tipo);
	$RecordObj_matrix->set_lang(DEDALO_DATA_LANG);		
	
	$saved 	= $RecordObj_matrix->Save();			
	$id 	= $RecordObj_matrix->get_ID();			#var_dump($RecordObj_matrix);	echo "\n ++++  saved: $saved , get_ID(): $id  ++++ \n";
	
	
	
	# ADMIN : Buscamos por si el boton es de tipo admin	
	$section 			= $tipo;			#var_dump($section);	
	$RecordObj_ts		= new RecordObj_ts($section);
	$hijos 				= $RecordObj_ts->get_ar_recursive_childrens_of_this($section);	#var_dump($hijos);	
	$area_actual 		= navigator::get_selected('area');
	
	if (is_array($hijos)) foreach ($hijos as $terminoID) {
		
		$RecordObj_ts	= new RecordObj_ts($terminoID);
		$modeloID		= $RecordObj_ts->get_modelo();
		$modelo			= RecordObj_ts::get_termino_by_tipo($modeloID);		
		
		switch($modelo) {
			
			case 'component_security_areas' :	
			
							$tipo_security_areas 	= $terminoID;			
							$area[] 				= $area_actual;
							
							$matrix_table 			= common::get_matrix_table_from_tipo($tipo_security_areas);
							$RecordObj_matrix2		= new RecordObj_matrix($matrix_table,NULL);
							
							# If dato is array, convert to json
							$dato = json_encode($area);
							
							$RecordObj_matrix2->set_parent($id);
							$RecordObj_matrix2->set_dato($dato);
							$RecordObj_matrix2->set_tipo($tipo_security_areas);
							$RecordObj_matrix2->set_lang(DEDALO_DATA_LANG);							
							
							$RecordObj_matrix2->Save();
							break;
							
			case 'component_security_access' :	
			
							$tipo_security_access 				= $terminoID;			
							$area_security_access[$area_actual]	= 2;
							
							$matrix_table 		= common::get_matrix_table_from_tipo($tipo_security_access);
							$RecordObj_matrix3	= new RecordObj_matrix($matrix_table,NULL);
							
							# If dato is array, convert to json
							$dato2 = json_encode($area_security_access);
							
							$RecordObj_matrix3->set_parent($id);
							$RecordObj_matrix3->set_dato($dato2);
							$RecordObj_matrix3->set_tipo($tipo_security_access);
							$RecordObj_matrix3->set_lang(DEDALO_DATA_LANG);							
							
							$RecordObj_matrix3->Save();
							break;
							
			case 'filter_master' :
			
						$user_actual 			= navigator::get_userID_matrix();			
						$ar_ts_relacionados		= RecordObj_ts::get_ar_terminos_relacionados($terminoID);
						
						if( is_array ($ar_ts_relacionados) ) foreach($ar_ts_relacionados as $ar_termino_relacionadoID) {
													
							foreach($ar_termino_relacionadoID as $modeloID => $terminoID) {
								
								# Para cada hijo, verificamos su modelo
								$modelo			= RecordObj_ts::get_termino_by_tipo($modeloID);
								
								if ($modelo =='filter_key'){
									
									$ar_ts_relacionados_key		= RecordObj_ts::get_ar_terminos_relacionados($terminoID);
									if( is_array ($ar_ts_relacionados_key) ) foreach($ar_ts_relacionados_key as $ar_termino_relacionadoID_key){
										foreach($ar_termino_relacionadoID_key as $modelo_keyID => $termino_keyID) {
											$modelo_key			= RecordObj_ts::get_termino_by_tipo($modelo_keyID); 
											
											if (strpos($modelo_key,'component_') !== false){
																							
												$arguments=array();										
												$arguments['tipo']		= $termino_keyID;
												$arguments['parent']	= $user_actual;
												
												$matrix_table 			= common::get_matrix_table_from_tipo($termino_keyID);

												$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
												$ar_result				= $RecordObj_matrix->search($arguments);
												
												if(is_array($ar_result) && count($ar_result)>0) {
			
													$id_matrix			= max($ar_result);	# selecciona el valor mayor en el array 
													
													$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$id_matrix);
													$dato_key			= $RecordObj_matrix->get_dato();
												}	
											}
										}
									}
									
								}
							}
						}
						if( is_array ($ar_ts_relacionados) )foreach($ar_ts_relacionados as $ar_termino_relacionadoID) {
							
							foreach($ar_termino_relacionadoID as $modeloID => $terminoID) {
								
								$modelo			= RecordObj_ts::get_termino_by_tipo($modeloID);
								if (strpos($modelo,'component_') !== false){
									
									$matrix_table 		= common::get_matrix_table_from_tipo($terminoID);
									$RecordObj_matrix4	= new RecordObj_matrix($matrix_table,NULL);
									
									# If dato is array, convert to json
									$ar_dato_key[]	= $dato_key[0];
									$dato3			= json_encode($ar_dato_key);
									
									
									$RecordObj_matrix4->set_parent($id);
									$RecordObj_matrix4->set_dato($dato3);
									$RecordObj_matrix4->set_tipo($terminoID);
									$RecordObj_matrix4->set_lang(DEDALO_DATA_LANG);						
									
									$RecordObj_matrix4->Save();
									break;										
					
								}
							}
						}
						break;

		}
				
		
	}#if (is_array($hijos))
	
	
	
	
	# RETURN CREATED RECORD IN MATRIX
	print $id;
		
?>