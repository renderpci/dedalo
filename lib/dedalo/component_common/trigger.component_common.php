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

	// vars
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
	
	// dato . json decode try
		if (!$dato_clean = json_decode($dato)) {
			$dato_clean = $dato;
		}
	
	// caller_dataset check
		if (!empty($caller_dataset)) {
			$caller_dataset = json_decode($caller_dataset);
		}
	
	// permissions
		// case tool user admin (user editing self) 
			$ar_user_allow_tipos = [
				DEDALO_USER_PASSWORD_TIPO, // password
				DEDALO_FULL_USER_NAME_TIPO, // full user name
				DEDALO_USER_EMAIL_TIPO, // email
				DEDALO_USER_IMAGE_TIPO // image
			];
			$user_id = navigator::get_user_id(); // current logged user
			$is_user_admin_edit = (bool)($section_tipo===DEDALO_SECTION_USERS_TIPO && in_array($tipo, $ar_user_allow_tipos) && $parent==$user_id);		
		// switch 
			if ($is_user_admin_edit===true) {
				
				$permissions = 2;
			
			}else{
				if(isset($caller_dataset->component_tipo)) {
					# if the component send a dataset, the tipo will be the component_tipo of the caller_dataset	
					$permissions = common::get_permissions($section_tipo, $caller_dataset->component_tipo);
				}else{
					$permissions = common::get_permissions($section_tipo, $tipo);
				}
			}
		// return on insufficient permissions 
			if ($permissions<2) {
				$response->msg = "Trigger Error: Nothing is saved. Invalid user permissions for this component. ($permissions)";
				debug_log(__METHOD__." $response->msg ".to_string(), logger::DEBUG);
				return $response;
			}

	// model
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($tipo, true);

	// callable : Verify component name is callable
		if (!class_exists($modelo_name)) {
			#throw new Exception("Trigger Error: class: $modelo_name not found", 1);
			$response->msg = "Trigger Error: Nothing is saved. class: '$modelo_name' not found in Dédalo";
			return $response;
		}	
		
	// component : Build component as construct ($id=NULL, $tipo=false, $modo='edit', $parent=NULL)
		$component_obj = component_common::get_instance($modelo_name,
														$tipo,
														$parent,
														$modo,
														$lang,
														$section_tipo);
	
	// unique value server check
		$properties = $component_obj->get_propiedades();
		if(isset($properties->unique->server_check) && $properties->unique->server_check===true){
			$check_dato = (is_array($dato_clean)) ?	reset($dato_clean) : $dato_clean;
			$unique_server_check = $component_obj->unique_server_check($check_dato);
			if($unique_server_check === false){
				// Trigger Error: Nothing is saved.
				$response->msg = label::get_label("value_already_exists");
				return $response;
			}
		}

	// caller_dataset optional
		if (!empty($caller_dataset)) {
			
			# inject component caller_dataset
			$component_obj->caller_dataset = $caller_dataset;		

			# force to save component
			$old_dato 	= 'impossible data' . microtime(true);

		}else{

			# get current dato to compare with received dato
			$old_dato 	= $component_obj->get_dato();
		}

	// Assign received dato to component
		$component_obj->set_dato( $dato_clean );

	// Check if dato is changed 
	$new_dato	= $component_obj->get_dato();

	// Response . Check if new dato is different of current dato. 
	// (!) Important: use operator '==' to allow compare objects properly
		if((is_object($new_dato) && $new_dato==$old_dato) || $new_dato===$old_dato){
			
			$response->result 	= $parent;
			$response->msg 		= 'Ok. Request done [Save]. Data is not changed. Is not necessary update component db data';

		}else{

			# Call the specific function of the current component that handles the data saving with your specific preprocessing language, etc ..
			$section_id = $component_obj->Save();
			#debug_log(__METHOD__." current (get_dato) ".to_string($component_obj->get_dato()), logger::DEBUG);

			if ($section_id>0 || $parent===DEDALO_SECTION_ID_TEMP) {
				# Return id
				$response->result 	= $section_id;
				$response->msg 		= 'Ok. Request done [Save]';
			}else{			
				$response->result 	= false;
				$response->msg 		= 'Error. Received section_id is invalid [Save] '.json_encode($section_id);
			}
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

	// vars 
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

	// component 
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component_obj 	= component_common::get_instance($modelo_name,
														 $tipo,
														 $parent,
														 $modo,
														 $lang,
														 $section_tipo);

	// current_tipo_section
		// Si se recibe section_tipo, configuramos el objeto para que tenga ese parámetro asignado
		// Por ejemplo, en relaciones, se requiere para discriminar qué seccion querenmos actualizar
		if (!empty($current_tipo_section)) {
			$component_obj->current_tipo_section = $current_tipo_section;
		}

	// context_name : context of component
		if (!empty($context_name)) {
			$context = new stdClass();
				$context->context_name = $context_name;
			$component_obj->set_context($context);
			#dump($context_name,"context_name");
		}
	
	// arguments
		if (!empty($arguments)) {
			$component_obj->set_arguments($arguments);
		}

	// tool user admin case
		$user_id = navigator::get_user_id();
		if ( $section_tipo===DEDALO_SECTION_USERS_TIPO && $user_id==$parent && $tipo===DEDALO_USER_IMAGE_TIPO ) {
			$component_obj->permissions = 2;
		}
		
	// html. Get component html
		# $arguments = new stdClass();
		# 	$arguments->permissions = 1;
		# if (isset($arguments->permissions)) {
		# 	// set custom permissions (to load html as read only for example)
		# 		$component_obj->set_permissions($arguments->permissions);
		# }
		$html = $component_obj->get_html();
		# dump($html, ' html ++ '.to_string());

	// write session to unlock session file
		#session_write_close();

	// response
		$response->result 	= $html;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	// debug 
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



function remove_server_dato_of_hidden_components($json_data){
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	// vars 
		$vars = array('section_id','ar_section_group','lang','modo','section_tipo');
			foreach($vars as $name) {
				$$name = common::setVarData($name, $json_data);
				# DATA VERIFY
				if (empty($$name)) {
					$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
					return $response;
				}
			}
	//create the section group

		foreach ($ar_section_group as $current_tipo) {
			//get the childrens of the current section group
			$ar_recursive_childrens = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, 'component_', 'children_recursive', $search_exact=false);

				dump($ar_recursive_childrens);
			foreach ($ar_recursive_childrens as $current_tipo) {
		
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
				$component		= component_common::get_instance($modelo_name,
																 $current_tipo,
																 $section_id,
																 $modo,
																 $lang,
																 $section_tipo);

				$dato_empty = null;
				$component->set_dato($dato_empty);
				$component->Save();
			}										

		}

}



/**
* GET_COMPONENT_JSON_DATA
* Load ajax json component
*//*
function get_component_json_data__DEACTIVATED($json_data) {
	global $start_time;


	# Write session to unlock session file
	session_write_close();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed [get_component_json_data]';	
	
	$vars = array('section_id','section_tipo','component_tipo','lang','dato','modo','max_records','offset','top_tipo','top_id', 'propiedades'); // ,'current_tipo_section','context_name','arguments')		
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='max_records' || $name==='offset' || $name==='dato' || $name==='top_id' || $name==='propiedades') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = "Trigger Error: (get_component_json_data) Empty ".$name." (is mandatory)";
				return $response;
			}
		}

	#debug_log(__METHOD__." propiedades ".json_encode($propiedades, JSON_PRETTY_PRINT), logger::DEBUG);
	
	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component_obj 	= component_common::get_instance($modelo_name,
													 $component_tipo,
													 $section_id,
													 $modo,
													 $lang,
													 $section_tipo);
	# Portal config. Inject custom params
	if ($max_records) {
		$component_obj->set_max_records($max_records);
	}
	if ($offset) {
		$component_obj->set_offset($offset);
	}

	#
	# PROPIEDADES OVERWRITES
	#if ($propiedades) {
	#	$component_obj->set_propiedades($propiedades);
	#}	
	#$component_obj->set_max_records(1);

	# If dato is received, inject dato to current component (portal time machine case for example)
	if ($dato) {
		$component_obj->set_dato($dato);
	}

	# Get component json data
	$component_json_data = $component_obj->get_json();
	if(SHOW_DEBUG===true) {
		#debug_log(__METHOD__." component_obj (modo:$modo) ".json_encode($component_obj, JSON_PRETTY_PRINT), logger::DEBUG);
	}		

	$response->result 	= $component_json_data;
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
*/


?>