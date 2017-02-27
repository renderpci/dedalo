<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");


# set vars
	$vars = array('mode','id','parent','dato','tipo','lang','id_time_machine','flag','current_tipo_section');
		foreach($vars as $name) $$name = common::setVar($name);


# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");

if(empty($current_tipo_section)) exit("<span class='error'> Trigger: Error Need current_tipo_section..</span>");



/**
* LOAD PREVIEW COMPONENT (RIGHT SIDE)
* @param $parent
* @param $tipo
* @param $lang (Optional)
* @param $id_time_machine (Optional)
*/
if($mode=='load_preview_component') {
	
	if ($parent<1) throw new Exception("Error Processing Request: Unable load_preview_component ! (parent is empty)", 1);
	if (empty($tipo)) throw new Exception("Error Processing Request: Unable load_preview_component ! (tipo is empty)", 1);
	if (empty($current_tipo_section)) throw new Exception("Error Processing Request: Unable load_preview_component ! (current_tipo_section is empty)", 1);

	#
	# COMPONENT
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);	
	$component 		= component_common::get_instance($modelo_name, $tipo, $parent, 'edit', DEDALO_DATA_LANG, $current_tipo_section);
		#dump($component,"component");#die();
	$component->set_identificador_unico( $component->get_identificador_unico().'_preview' );

	#
	# TOOL
	$tool_time_machine 	= new tool_time_machine($component, 'preview');

	# Configure obj
	$tool_time_machine->set_id_time_machine($id_time_machine);
		#dump($id_time_machine,'$id_time_machine');	
	$tool_time_machine->set_current_tipo_section($current_tipo_section);
		#dump($current_tipo_section,'$current_tipo_section');	
	
	$html = $tool_time_machine->get_html();
	print $html;
	exit();
}




/**
* ASSIGN TIME MACHINE VALUE
* @param $id
* @param $id_time_machine
*/
if($mode=='assign_time_machine_value') { 

	if (empty($parent))	throw new Exception("Error Processing Request: Unable assign_time_machine_value ! (parent is mandatory)", 1);
	if (empty($tipo))	throw new Exception("Error Processing Request: Unable assign_time_machine_value ! (tipo is mandatory)", 1);
	if (empty($id_time_machine))	throw new Exception("Error Processing Request: Unable assign_time_machine_value ! (id_time_machine is mandatory)", 1);
	if (empty($current_tipo_section))	throw new Exception("Error Processing Request: Unable assign_time_machine_value ! (current_tipo_section is mandatory)", 1);
	if (empty($lang))	throw new Exception("Error Processing Request: Unable assign_time_machine_value ! (id_time_machine is mandatory)", 1);

	# Extraemos el dato de matrix_time_machine
	$RecordObj_time_machine = new RecordObj_time_machine($id_time_machine);
	$dato_time_machine 		= $RecordObj_time_machine->get_dato();
		#dump($dato_time_machine, ' dato_time_machine ++ '.to_string());

	/* OLD
	# CURRENT TIPO SECTION (RELATION)
	# Si se recibe section_tipo, configuramos el objeto para que tenga ese parámeto asignado
	# Por ejemplo, en relaciones, se requiere para discriminar qué seccion queremos actualizar	
	if (!empty($current_tipo_section)) {

		# COMPONENT	CLON DEL ORIGINAL, DONDE IRÁN LOS DATOS DE MATRIX				
		#$component_obj	= component_common::load_component($id, $tipo);		#dump($component_obj, "tipo:$tipo");
		$component_obj	= component_common::get_instance(null, $tipo, $parent, 'edit', DEDALO_DATA_LANG, $current_tipo_section);
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
	*/
		

	#$component_obj_to_save	= component_common::load_component($id, $tipo);
	$modelo_name 			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true); 
	$component_obj_to_save	= component_common::get_instance($modelo_name,
															 $tipo,
															 $parent,
															 'edit',
															 $lang,
															 $current_tipo_section);
		#dump($component_obj_to_save,"component_obj_to_save");die();

	
	$component_obj_to_save->set_dato($dato_time_machine);
	$component_obj_to_save->Save();
	

	#
	# COMPONENT PORTAL SEARCH_OPTIONS : Clear old data and force recreate
	#dump($_SESSION['dedalo4']['config']['search_options'],"search_options");
	if (get_class($component_obj_to_save)==='component_portal' && isset($_SESSION['dedalo4']['config']['search_options']) ) {		
		$target_section_tipo = $component_obj_to_save->get_ar_target_section_tipo()[0];		
		foreach ($_SESSION['dedalo4']['config']['search_options'] as $key => $value) {
			if ( strpos($key, $target_section_tipo)!==false ) {
				unset($_SESSION['dedalo4']['config']['search_options'][$key]);
				if(SHOW_DEBUG) {
					error_log("trigger.tool_time_machine:assign_time_machine_value deleted search_options session key: $key");
				}
			}
		}
	}

	print 'ok';
	exit();
}








/**
* SECTION LIST LOAD AND SHOW ROWS HISTORY
* @param $current_tipo_section (sectionj tipo)
* Load and show in section list view (when user click on Time Machine icon at bottom), all deleted records with this section tipo that are found in matrix_time_machine 
*/
if($mode=='section_records_load_rows_history') {
	
	if (strlen($current_tipo_section)<3) die("Error Processing Request: Unable section_records_load_rows_history ! (Few vars)");

	# SECTIONS_TIME_MACHINE : Array of tm_id records of current section current_tipo_section with status 'deleted'
	$ar_sections_time_machine	= (array)tool_time_machine::get_ar_sections_time_machine($current_tipo_section);
		#dump($ar_sections_time_machine,'$ar_sections_time_machine');die();

	if (empty($ar_sections_time_machine)) {
		if(SHOW_DEBUG) {
			#dump($ar_sections_time_machine,"ar_sections_time_machine is empty");
		}
		echo "<div class=\"no_results_msg\">No records are deleted</div>";
		exit();
	}
	
	# New section in 'list_tm' mode
	$section = section::get_instance(NULL,$current_tipo_section,'list_tm');	
	

	# AR_LOCATORS : locator build
	# For compatibility with standar section_records way of manage "get_rows_data", we convert tm_id to section_id_matrix inside locator object
	# like '$locator->section_id_matrix = $tm_id'
	$ar_locators=array();
	foreach ($ar_sections_time_machine as $key => $tm_id) {
		$locator = new stdClass();
			$locator->section_id = (string)$tm_id;
		$ar_locators[] = $locator;
		if(SHOW_DEBUG) {
			#error_log(__METHOD__." Review this locator format is compatible with new locator? ".to_string($locator));
		}
	}
	#dump($ar_locators,"ar_locators "); die();
	/*
	# LAYOUT MAP : Same as conventional list for current section	
	$layout_map 		= component_layout::get_layout_map_from_section( $section );
		#dump($layout_map,"layout_map");
	
	$options = new stdClass(); 
		$options->section_tipo 		= $section->get_tipo();
		$options->section_real_tipo = $section->get_section_real_tipo();
		$options->layout_map 		= $layout_map;
		$options->modo 				= 'list_tm';
		$options->filter_by_id 		= $ar_locators;			 # Prepared before with locator object format
		$options->context 			= $section->context;	 # inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
		$options->matrix_table  	= 'matrix_time_machine'; # Search in matrix_time_machine instead matrix
		$options->json_field 		= 'dato';				 # Search in json container 'dato' instead matrix 'datos'	
	
	$section_records 	= new section_records($section->get_tipo(), $options);

	$html_contenido='';
	$html_contenido .= "<div id=\"section_list_rows_content_div_{$tipo}_tm\" class=\"section_list_rows_content_div\" >";
	$html_contenido .= $section_records->get_html();
	$html_contenido .= "</div>";
	*/
	#dump($section,'html_contenido'); die();
	
	$options = new stdClass();
		$options->filter_by_id = $ar_locators;

	$html_contenido = $section->get_html($options);
		
	
	print $html_contenido;
	#print_r($ar_sections_time_machine);
	exit();
}




/**
* SECTION LIST RECOVER SECTION
* @param $id_time_machine 
* @param $current_tipo_section (section_tipo)
*/
if($mode=='section_records_recover_section') {

	#dump($id_time_machine," id_time_machine DEBE SER 16 PARA OH1-16");die();
	
	if ( $id_time_machine<1 ) die("Error Processing Request: Unable section_records_recover_section ! (Few vars)");
	if ( empty($current_tipo_section) )	die("Error Processing Request: section_records_recover_section current_tipo_section is mandatory");

	$id_time_machine = (int)$id_time_machine;
	$section_tipo 	 = (string)$current_tipo_section;

	#
	# RECOVER RESTRICTIONS TEST
	$user_can_recover_sections = (bool)tool_time_machine::user_can_recover_sections( $section_tipo, navigator::get_user_id() );
		#dump($user_can_recover_sections," user_can_recover_sections"); die();	
		if (!$user_can_recover_sections) {
			die("Sorry. Only administrators can recover sections. Please contact with your admin");
		}
	
	#
	# RECOVER SECTION	
	#$tool_time_machine = new tool_time_machine(NULL);
	#$recover 			= $tool_time_machine->recover_section_from_time_machine($id_time_machine);
	$recover = tool_time_machine::recover_section_from_time_machine($id_time_machine);
	
	if($recover) {
		print 'ok';
	}else{
		print 'Error Processing Request: Unable recover section';
	}
		
	exit();
}




?>