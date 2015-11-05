<?php
require_once( dirname(dirname(__FILE__)).'/config/config4.php');
#require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');
#require_once(DEDALO_LIB_BASE_PATH . '/common/class.TR.php');


if(login::is_logged()!==true) die("<span class='error'> Auth error: please login </span>");

	#dump($_REQUEST);

# set vars
	$vars = array('mode','id','id_matrix','parent','dato','tipo','lang','flag','modo','current_tipo_section','caller_tipo','tag','rel_locator','context_name','arguments','propiedades','section_tipo');	
		foreach($vars as $name) $$name = common::setVar($name);

# mode
if(empty($mode)) exit("<span class='error'> Trigger: Error Need mode..</span>");



/**
* SAVE 
*/
if($mode=='Save') {

	# DATA VERIFY
	if(empty($parent)) exit("Trigger Error: Nothing to save.. (parent:$parent)");
	if(empty($tipo) || strlen($tipo)<3) exit("Trigger Error: tipo is mandatory (tipo:$tipo)");

	if(empty($section_tipo) || strlen($section_tipo)<3) exit("Trigger Error: section_tipo is mandatory $tipo");
	
	$component_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

	# CALLABLE : Verify component name is callable
	if (!class_exists($component_name))
		throw new Exception("Trigger Error: class: $component_name not found", 1);

	if (empty($modo)) {
		$modo='edit';
	}
	
	# COMPONENT : Build component as construct ($id=NULL, $tipo=false, $modo='edit', $parent=NULL) 
	# NOTE: singleton instance here ???
	#$component_obj = new $component_name($tipo, $parent, $modo, $lang);
	$component_obj = component_common::get_instance($component_name, $tipo, $parent, $modo, $lang, $section_tipo);

	
	# Assign dato
	$component_obj->set_dato($dato);
 

	# Call the specific function of the current component that handles the data saving with your specific preprocessing language, etc ..
	$id = $component_obj->Save();
		#dump($component_obj, ' component_obj');	

	# Return id
	echo $id;
	exit();

}#end Save




# SAVE_RELATED
if($mode=='Save_related') {

	/* DESACTIVA EN JAVASCRIPT

	# DATA VERIFY
	if(empty($dato)) exit("Error: Trigger. Dato is empty. Nothing to save.. (dato:$dato)");
	if(empty($tipo)) exit("Error: Trigger Need more data! tipo:$tipo");
	if(empty($parent)) exit("Error: Trigger Need more data! parent:$parent");
	if(empty($current_tipo_section)) exit("Error: Trigger Need more data! current_tipo_section:$current_tipo_section");

	#
	# DUPLICATES
	#	
		$dato_already_exists = component_common::dato_already_exists($dato, $tipo, DEDALO_DATA_LANG, $current_tipo_section);
		if ($dato_already_exists) {
			die("");
			throw new Exception("Error Processing Request. Current dato already exists ($dato)", 1);
			die("Warning: Current dato already exists ($dato)");
		}
		

	#
	# SECTION : Create a new section before
	#
		# Calculate section tipo from component tipo
		$section_tipo = component_common::get_section_tipo_from_component_tipo($tipo);
			#dump($section_tipo,'$section_tipo'); die();
		
		$section 	= section::get_instance(NULL, $section_tipo);
		$id_section = $section->Save();
			#dump($id_section,'$id_section');

		# Heritage : Projects
		# Source section
		$parent_section 	 			 = section::get_instance($parent, $current_tipo_section);
		$parent_section_component_filter = $parent_section->get_ar_children_objects_by_modelo_name_in_section('component_filter')[0];
		$source_projects 				 = $parent_section_component_filter->get_dato();
			#dump($source_projects," source_projects on current_tipo_section: $current_tipo_section - parent: $parent - filter_tipo: ".$parent_section_component_filter->get_tipo() );

		# Target section
		# $component_filter_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true);
		$component_filter = $section->get_ar_children_objects_by_modelo_name_in_section('component_filter')[0];
		$component_filter->set_dato($source_projects);
		$component_filter->Save();


		# Heritage : filtered_by
		# $propiedades = '{"filtered_by":{"rsc90":{"36":"2","34":"2"}}}';
		if (!empty($propiedades) && (int)$id_section>0) {
			$propiedades = json_decode($propiedades); 	#dump($propiedades," propiedades");
			# Like {"filtered_by":{"rsc90":{"36":"2","34":"2"}}}
			if (isset($propiedades->filtered_by)) foreach ($propiedades->filtered_by as $key => $value) {

				$component = component_common::get_instance(null, (string)$key, (int)$id_section, 'edit', DEDALO_DATA_LANG, $section_tipo);
				$component->set_dato( $value );
				$component->Save();
					#dump($key," key");	dump($value," value");
			}
		}
		

	#
	# COMPONENT
	#
		# Create new component record dependent of current new section
		$component_name = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);

		# Verify component name is callable
		if (!class_exists($component_name))
			throw new Exception("Error: Trigger class: $component_name not found", 1);
		
		# Build component as construct ($id=NULL, $tipo=false, $modo='edit', $parent=NULL)		
		# $component_obj = new $component_name($tipo, $id_section, 'edit', DEDALO_DATA_LANG);
		$component_obj = component_common::get_instance($component_name,$tipo, $id_section, 'edit', DEDALO_DATA_LANG, $section_tipo);
		
		# Assign dato
		$component_obj->set_dato($dato);
			#dump($component_obj);	die();
		
		# Llama a la función específica del componente actual que se encarga de salvar los datos
		# con su preprocesado específico de idioma, etc..
		$component_obj->Save();


	# Return $id_section
	print $id_section;
	exit();
	*/
}#end Save_related











/*
# LOAD RELATIONS LIST
if($mode=='ajax_load_relations_list') {
	
	if(!$id_matrix) {
		echo "Info not available /n";
		exit();
	}

	#$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component		= component_common::get_instance(null, $tipo, $parent, $modo, $lang);
	
	$html = dump($ar_relation_tags,'$ar_relation_tags');

	exit();
}
*/







# INDEX TERMINO
/*
	DEFINDA EN TRIGGER.COMPONENT RELATION
if($mode=='index_termino') {

	# set vars
	$arguments = array();
	$vars = array('terminoID','section_id','component_tipo','tag_id');	
	foreach($vars as $name) $$name = common::setVar($name);

	component_text_area::process_index_termino($arguments);
	exit();
}
*/

# NEW
/*
if($mode=='New') {
	
	require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');
	
	if(!$tipo && empty($tipo)) exit("<span class='error'> Trigger: Error Need tipo..</span>");
	
	$html 	= '';	
	$parent	= "0";
	
	# buscamos el último registro de esta sección y sacamos su dato, que será el último 'seccion_id'
	$matrix_table 			= common::get_matrix_table_from_tipo($tipo);
	$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
	$arguments=array();		
	$arguments['tipo']		= $tipo;
	$arguments['parent']	= $parent;
	$ar_result				= $RecordObj_matrix->search($arguments);	#var_dump($ar_result);
	if(is_array($ar_result) && count($ar_result)>0) {
		
		$id_matrix			= max($ar_result);	# selecciona el valor mayor en el array 
		$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix	= new RecordObj_matrix($matrix_table,$id_matrix);
		$dato				= $RecordObj_matrix->get_dato();
	}	
	
	//print_r( $dato );		//die();
	
	$matrix_table 		= common::get_matrix_table_from_tipo($tipo);
	$RecordObj_matrix	= new RecordObj_matrix($matrix_table,NULL);
	
	$RecordObj_matrix->set_dato(intval($dato+1));	
	$RecordObj_matrix->set_parent($parent);
	$RecordObj_matrix->set_tipo($tipo);
	$RecordObj_matrix->set_lang(DEDALO_DATA_LANG);		
		
	
	$saved 	= $RecordObj_matrix->Save();			
	$id 	= $RecordObj_matrix->get_ID();			#var_dump($RecordObj_matrix);	echo "\n ++++  saved: $saved , get_ID(): $id  ++++ \n";
	
	
	
	
	exit($id);
}
*/



/**
* LOAD COMPONENT BY AJAX
* load ajax html component
* Cargador genérico de componentes. Devuelve el html costruido del componente resuelto y en el modo recibido
*/
if ($mode=='load_component_by_ajax') {			
	#dump($_REQUEST," ");die();
	
	if(empty($tipo)) {
		$msg = "Error Processing Request (load_component_by_ajax). tipo is not defined!";
		error_log($msg);
		throw new Exception($msg, 1);	
	}
		
	if(empty($parent)) {
		$msg = "Error Processing Request (load_component_by_ajax). parent is not defined!";
		error_log($msg);
		throw new Exception($msg, 1);
	} 
		
	if(empty($modo)) {
		$msg = "Error Processing Request (load_component_by_ajax). modo is not defined!";
		error_log($msg);
		throw new Exception($msg, 1);
	}
	if(empty($section_tipo)) {
		$msg = "Error Processing Request (load_component_by_ajax). section_tipo is not defined!";
		error_log($msg);
		throw new Exception($msg, 1);
	}
	#dump($section_tipo,"section_tipo - tipo:$tipo - modo:$modo, lang:$lang");


	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component_obj 	= component_common::get_instance($modelo_name, $tipo, $parent, $modo, $lang, $section_tipo);
		#$dato= $component_obj->get_dato();
		#dump($dato, ' component_obj - '."$modelo_name - tipo:$tipo - parent:$parent, $modo, $lang, $section_tipo");

	# CURRENT TIPO SECTION
	# Si se recibe section_tipo, configuramos el objeto para que tenga ese parámeto asignado
	# Por ejemplo, en relaciones, se requiere para discriminar qué seccion querenmos actualizar
	if (!empty($current_tipo_section)) {
		$component_obj->current_tipo_section = $current_tipo_section;
	}
	#dump($current_tipo_section,'$current_tipo_section');


	# CONTEXT OF COMPONENT
	$component_obj->set_context($context_name);
		#dump($context_name,"context_name");

	if (!empty($arguments)) {
		$component_obj->set_arguments($arguments);
	}
	
	# Get component html
	$html = $component_obj->get_html();

	echo $html;
	exit();

}//load_component_by_ajax


/**
* LOAD SECTION BY AJAX
* load ajax html component
* Cargador genérico de secciones. Devuelve el html costruido del componente resuelto y en el modo recibido.
*/
if ($mode=='load_section_by_ajax') {
	
	if(empty($id)) {
		$msg = "Error Processing Request. id is not defined!";
		error_log($msg);
		throw new Exception($msg, 1);	
	}		
	if(empty($tipo)) {
		$msg = "Error Processing Request. tipo is not defined!";
		error_log($msg);
		throw new Exception($msg, 1);
	}	
	if(empty($modo)) {
		$msg = "Error Processing Request. modo is not defined!";
		error_log($msg);
		throw new Exception($msg, 1);
	}
	if(empty($context_name)) {
		#$msg = "Error Processing Request. context is not defined!";
		#error_log($msg);
		#throw new Exception($msg, 1);
	}		
	
	
	$section_obj = section::get_instance($id, $tipo);
		#dump($section_obj,'$section_obj');

	#$section_obj->set_caller_id($caller_id);
	$section_obj->set_show_inspector(false);
	$section_obj->set_context($context_name);
		#dump($section_obj,'$section_obj in trigger');
		#error_log('context:'.$context);
	
	# Get component html
	$html = $section_obj->get_html();
	exit($html);

}//load_section_by_ajax






?>