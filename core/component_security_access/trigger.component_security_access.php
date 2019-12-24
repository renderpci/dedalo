<?php
$start_time=microtime(1);
include( DEDALO_CONFIG_PATH.'/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# IGNORE_USER_ABORT
ignore_user_abort(true);



/**
* SAVE 
*/
function Save($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';
	
	$vars = array('parent','tipo','lang','modo','section_tipo','dato');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='dato') continue; # Skip non mandatory filled
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}
	
	# DATO . JSON DECODE TRY
	# dump($dato, ' dato ++ '.to_string());
	if (!$dato_clean = json_decode($dato)) {
		exit("Trigger Error: dato is not valid");
	}
	//dump($dato_clean, ' dato_clean ++ lang: '.to_string($lang)); die();	
	
	# COMPONENT : Build component as construct ($id=NULL, $tipo=false, $modo='edit', $parent=NULL) 
	$modelo_name   = 'component_security_access';
	$component_obj = component_common::get_instance($modelo_name,
													$tipo,
													$parent,
													$modo,
													$lang,
													$section_tipo);


	# Get curren dato in DB
	$current_dato = $component_obj->get_dato();

	$new_dato = component_security_access::merge_dato((array)$current_dato, (array)$dato_clean);
		#dump($current_dato, ' current_dato ++ '.to_string());
		#dump($dato_clean, ' dato_clean ++ '.to_string());
		#dump($new_dato, ' new_dato ++ '.to_string());
		#return false;
	
	# Assign dato
	$component_obj->set_dato( $new_dato ); 
	
	# Call the specific function of the current component that handles the data saving with your specific preprocessing language, etc ..
	$section_id = $component_obj->Save();

	# Write session to unlock session file
	session_write_close();

	$response->result 	= $section_id;
	$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	# Debug
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}

		$response->debug = $debug;
	}

	return (object)$response;
}//end Save



?>