<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','id','parent','dato','tipo','lang','id_time_machine','flag','current_tipo_section');
	if(is_array($vars)) foreach($vars as $name) {
		$$name = common::setVar($name);
	}

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* LOAD ROWS HISTORY
* @param $id (id matrix)
* @param $lang (like 'lg-spa')
*/
/* DEPRECATED (Called directly from cotroller)
if($mode=='load_rows_history') {
	
	if ($id<1) throw new Exception("Error Processing Request: Unable load_rows_history ! (Few vars)", 1);

	$component 			= component_common::load_component($id, $tipo); #($id, $tipo, $modo, $parent, $lang);		#dump($component,'$component');	
	$tool_time_machine 	= new tool_time_machine($component, 'rows');
	$html 				= $tool_time_machine->get_html();
	print $html;
	exit();
}
*/

/**
* LOAD PREVIEW COMPONENT (RIGHT SIDE)
* @param $id
* @param $tipo
* @param $lang (Optional)
* @param $id_time_machine (Optional)
*/
if($mode=='load_preview_component') {
	
	if ($id<1) throw new Exception("Error Processing Request: Unable load_rows_history ! (Few vars)", 1);

	$component 			= component_common::load_component($id, $tipo);	#dump($component,"component lang:$lang parent:$parent"); #($current_id=NULL, $tipo, $modo='edit', $parent=NULL, $lang=NULL, $matrix_table='matrix')
	$tool_time_machine 	= new tool_time_machine($component, 'preview');

	# Configure obj
	$tool_time_machine->set_id_time_machine($id_time_machine);
		#dump($id_time_machine,'$id_time_machine');	
	$tool_time_machine->set_current_tipo_section($current_tipo_section);
		#dump($current_tipo_section,'$current_tipo_section');	
	
	$html 				= $tool_time_machine->get_html();
	print $html;
	exit();
}




/**
* ASSIGN TIME MACHINE VALUE
* @param $id
* @param $id_time_machine
*/
if($mode=='assign_time_machine_value') { 

	if (empty($id) || empty($id_time_machine) || empty($tipo))
		throw new Exception("Error Processing Request: Unable assign_time_machine_value ! (Few vars1)", 1);

	# Extraemos el dato de matrix_time_machine
	$RecordObj_time_machine = new RecordObj_time_machine($id_time_machine);
	$dato_time_machine 		= $RecordObj_time_machine->get_dato();	

	
	# CURRENT TIPO SECTION (RELATION)
	# Si se recibe section_tipo, configuramos el objeto para que tenga ese parámeto asignado
	# Por ejemplo, en relaciones, se requiere para discriminar qué seccion queremos actualizar	
	if (!empty($current_tipo_section)) {

		# COMPONENT	CLON DEL ORIGINAL, DONDE IRÁN LOS DATOS DE MATRIX				
		$component_obj				= component_common::load_component($id, $tipo);		#dump($component_obj, "tipo:$tipo");
		$component_obj->current_tipo_section = $current_tipo_section;
		$dato = $component_obj->get_dato();
			#dump($dato,"Dato original del componente sin modificar",null,true);

		# Calculamos los registros del tipo actual
		$ar_section_relations = $component_obj->get_ar_section_relations_for_current_tipo_section($modo='ar_rel_locator');
			#dump($ar_section_relations,"Calculamos los registros del tipo de la sección actual");

		# Los eliminamos del dato del componente actual
		foreach ($ar_section_relations as $key => $rel_locator) {
			$dato = component_relation::remove_relation_to_dato($rel_locator, $dato);
		}
			#dump($dato,"Dato del componente eliminados los registros de la sección actual");

		# Extraemos el dato de matrix_time_machine
		# Ya extraido previamente

		# Seleccionamos sólo los de la sección actual
		$dato_time_machine_section = component_relation::get_ar_section_relations_for_current_tipo_section_static($modo='ar_rel_locator', $dato_time_machine, $current_tipo_section);
			#dump($dato_time_machine_section,"Dato en time machine");

		# Los insertamos normalmente en el dato del componente
		if(is_array($dato_time_machine_section)) foreach ($dato_time_machine_section as $key => $rel_locator) {			
			$dato = component_common::add_locator_to_dato($rel_locator, $dato);
		}
			#dump($dato,"Dato una vez añadidos los de esta sección incluidos en time machine (FINAL TO SAVE)");

		# El dato ahora está listo para guardase. Sólo se han modificado los registros corrrespondientes a la sección actual
		# Lo nombremos $dato_time_machine para respetar el ciclo habitual
		$dato_time_machine = $dato;
	}
	#dump($current_tipo_section,'$current_tipo_section');


	

	$component_obj_to_save	= component_common::load_component($id, $tipo);
	$component_obj_to_save->set_dato($dato_time_machine);
	$component_obj_to_save->Save();

	print 'ok';
	exit();
}



/**
* SECTION LIST LOAD ROWS HISTORY
* @param $tipo (sectionj tipo)
*/
if($mode=='section_list_load_rows_history') {
	
	if (strlen($tipo)<3) throw new Exception("Error Processing Request: Unable section_list_load_rows_history ! (Few vars)", 1);

	#$component 				= component_common::load_component($id, $tipo); #($id, $tipo, $modo, $parent, $lang);		#dump($component,'$component');	
	$tool_time_machine 			= new tool_time_machine(NULL);
	$ar_sections_time_machine	= $tool_time_machine->get_ar_sections_time_machine($tipo);

	#dump($tipo, 'tipo');
		#dump($ar_sections_time_machine,'$ar_sections_time_machine');
	
	# New section in 'list_tm' mode
	$section = new section(NULL,$tipo,'list_tm');
	# Inject tm records as $key (id time machine) => $value (id matrix)
	$section->ar_id_section_custom = $ar_sections_time_machine;

	# Set caller id (needed for portals)
	#$section->caller_id = 

	$html = $section->get_html();
	print $html;
	#print_r($ar_sections_time_machine);
	exit();
}


/**
* SECTION LIST RECOVER SECTION
* @param $id_time_machine 
*/
if($mode=='section_list_recover_section') {
	
	if ( $id_time_machine<1 ) throw new Exception("Error Processing Request: Unable section_list_recover_section ! (Few vars)", 1);

	# RECOVER RESTRICTIONS
	# Sólo permitiremos recuperar a los administradores
	$current_userID_matrix 			= navigator::get_userID_matrix();
	$is_admin_of_current_area 		= false;

		# Gloabal admin		
		$is_global_admin 			= component_security_administrator::is_global_admin($current_userID_matrix);	

		# Admin of current area
		$ar_authorized_areas_for_user 	= component_security_areas::get_ar_authorized_areas_for_user($current_userID_matrix, $simple_array=false);
		if(is_array($ar_authorized_areas_for_user)) foreach ($ar_authorized_areas_for_user as $key => $value) {
			if ($key == $tipo.'-admin' && $value == 2) {
				$is_admin_of_current_area = true;
			}
		}
	

	if ($is_global_admin===true || $is_admin_of_current_area===true) {
		
		$tool_time_machine 	= new tool_time_machine(NULL);
		$recover 			= $tool_time_machine->recover_section_from_time_machine($id_time_machine);
		
		if($recover) {
			print 'ok';
		}else{
			print 'Error Processing Request: Unable recover section';
		}

	}else{
		# Users not admin error response
		print 'Error: only admin users can recover records. Please contact with your admin';
	}

		
	exit();
}




?>