<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* SAVE
* Save component data in DB
* @return object $response
*/
function Save($json_data) {
	global $start_time;

	# Write session to unlock session file
	#session_write_close();
	#dump($maintenance_mode, ' maintenance_mode ++ '.to_string());
	#debug_log(__METHOD__." maintenance_mode ".to_string($maintenance_mode), logger::DEBUG);

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


	$vars = array('parent','tipo','lang','modo','section_tipo','dato','top_tipo','top_id','caller_dataset');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='dato' || $name==='top_id' || $name==='caller_dataset') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	
	# DATO . JSON DECODE TRY
	if (!$dato_clean = json_decode($dato)) {
		$dato_clean = $dato;
	}
	#dump($dato_clean, ' dato_clean ++ lang: '.to_string($dato_clean)); #die();
	
	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);

	# CALLABLE : Verify component name is callable
	if (!class_exists($modelo_name)) {
		#throw new Exception("Trigger Error: class: $modelo_name not found", 1);
		$response->msg = "Trigger Error: Nothing is saved. class: '$modelo_name' not found in Dédalo";
		return $response;
	}
	
	# PERMISSIONS
	$permissions  = common::get_permissions($section_tipo, $tipo);
	if ($permissions<2) {
		$response->msg = "Trigger Error: Nothing is saved. Invalid user permissions for this component. ($permissions)";
		return $response;
	}
	
	# COMPONENT : Build component as construct ($id=NULL, $tipo=false, $modo='edit', $parent=NULL)
	$component_obj = component_common::get_instance($modelo_name,
													$tipo,
													$parent,
													$modo,
													$lang,
													$section_tipo);
	
	# CALLER_DATASET optional
	if (!empty($caller_dataset)) {
		if ($caller_dataset = json_decode($caller_dataset)) {
			$component_obj->caller_dataset = $caller_dataset;
		}

		$old_dato 	= 'impossible data';

	}else{

		$old_dato 	= $component_obj->get_dato();
	}
	
	
		#dump($old_dato, ' $old_dato ++ '.to_string());
	
	# Assign received dato to component
	$component_obj->set_dato( $dato_clean );
	#debug_log(__METHOD__." dato_clean ".to_string($dato_clean), logger::DEBUG);		

	# Check if dato is changed 
	$new_dato	= $component_obj->get_dato();
	#debug_log(__METHOD__." new_dato (get_dato) ".to_string($new_dato), logger::DEBUG);

	if ($new_dato===$old_dato) {
		
		$response->result 	= $parent;
		$response->msg 		= 'Ok. Request done [Save]. Data is not changed. Is not necessary update component db data';
	
	}else{

		# Call the specific function of the current component that handles the data saving with your specific preprocessing language, etc ..
		$section_id = $component_obj->Save();
		#debug_log(__METHOD__." current (get_dato) ".to_string($component_obj->get_dato()), logger::DEBUG);	

		# Return id
		$response->result 	= $section_id;
		$response->msg 		= 'Ok. Request done [Save]';

	}	
	

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time 	= exec_time_unit($start_time,'ms')." ms";
			$debug->modelo_name = $modelo_name;
			$debug->label 		= $component_obj->get_label();
			$debug->tipo 		= $tipo;
			$debug->section_tipo= $section_tipo;
			$debug->section_id 	= $parent;
			$debug->lang 		= $lang;
			$debug->modo 		= $modo;

		$response->debug = $debug;
	}

	# DEDALO_MAINTENANCE_MODE
	if (DEDALO_MAINTENANCE_MODE===true && (isset($_SESSION['dedalo4']['auth']['user_id']) && $_SESSION['dedalo4']['auth']['user_id']!=DEDALO_SUPERUSER)) {
		# Unset user session login
		# Delete current Dédalo session
		unset($_SESSION['dedalo4']['auth']);

		$response->maintenance = true;
	}

	# Write session to unlock session file
	#session_write_close();
	

	return (object)$response;
}//end Save



/**
* LOAD COMPONENT BY AJAX
* load ajax html component
* Cargador genérico de componentes. Devuelve el html costruido del componente resuelto y en el modo recibido
*/
#if ($mode=='load_component_by_ajax') {
function load_component_by_ajax($json_data) {
	global $start_time;


	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('parent','tipo','lang','modo','section_tipo','current_tipo_section','context_name','arguments','top_tipo','top_id');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='current_tipo_section' || $name==='context_name' || $name==='arguments' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}


	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
	$component_obj 	= component_common::get_instance($modelo_name,
													 $tipo,
													 $parent,
													 $modo,
													 $lang,
													 $section_tipo);
	#
	# CURRENT_TIPO_SECTION
	# Si se recibe section_tipo, configuramos el objeto para que tenga ese parámetro asignado
	# Por ejemplo, en relaciones, se requiere para discriminar qué seccion querenmos actualizar
	if (!empty($current_tipo_section)) {
		$component_obj->current_tipo_section = $current_tipo_section;
	}

	#
	# CONTEXT_NAME : CONTEXT OF COMPONENT
	if (!empty($context_name)) {
		$context = new stdClass();
			$context->context_name = $context_name;
		$component_obj->set_context($context);
		#dump($context_name,"context_name");
	}

	#
	# ARGUMENTS
	if (!empty($arguments)) {
		$component_obj->set_arguments($arguments);
	}
	
	# Get component html
	$html = $component_obj->get_html();
	#echo $html;

	# Write session to unlock session file
	#session_write_close();

	$response->result 	= $html;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time 	= exec_time_unit($start_time,'ms')." ms";
			$debug->modelo_name = $modelo_name;
			$debug->label 		= $component_obj->get_label();
			$debug->tipo 		= $tipo;
			$debug->section_tipo= $section_tipo;
			$debug->section_id 	= $parent;
			$debug->lang 		= $lang;
			$debug->modo 		= $modo;

		$response->debug = $debug;
	}
	

	return (object)$response;
}//end load_component_by_ajax



/**
* GET_COMPONENT_JSON_DATA
* Load ajax json component
*/
function get_component_json_data($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [get_component_json_data]';	
	
	$vars = array('section_id','section_tipo','component_tipo','lang','dato','modo','max_records','offset','top_tipo','top_id'); // ,'current_tipo_section','context_name','arguments')		
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='max_records' || $name==='offset' || $name==='dato' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = "Trigger Error: (get_component_json_data) Empty ".$name." (is mandatory)";
				return $response;
			}
		}

	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component_obj 	= component_common::get_instance($modelo_name,
													 $component_tipo,
													 $section_id,
													 $modo,
													 $lang,
													 $section_tipo);
	# Portal config
	if ($max_records) {
		$component_obj->set_max_records($max_records);
	}
	if ($offset) {
		$component_obj->set_offset($offset);
	}

	# If dato is received, inject dato to current component (portal time machine case for example)
	if ($dato) {
		$component_obj->set_dato($dato);
	}

	# Get component html
	$json = $component_obj->get_from_json();
	

	$response->result 	= $json;
	$response->msg 		= 'Ok. Request done [get_component_json_data]';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time 	= exec_time_unit($start_time,'ms')." ms";
			$debug->modelo_name = $modelo_name;
			$debug->label 		= $component_obj->get_label();
			$debug->tipo 		= $component_tipo;
			$debug->section_tipo= $section_tipo;
			$debug->section_id 	= $section_id;
			$debug->lang 		= $lang;
			$debug->modo 		= $modo;

		$response->debug = $debug;
	}
	

	return (object)$response;
}//get_component_json_data



?>