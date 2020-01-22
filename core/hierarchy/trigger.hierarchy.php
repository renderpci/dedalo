<?php
$start_time=microtime(1);
include( DEDALO_CONFIG_PATH.'/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

ignore_user_abort(true);



/**
* GENERATE_VIRTUAL_SECTION
* @return object $response
*/
function generate_virtual_section($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('component_parent','section_tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	$options = new stdClass();
		$options->section_id   = $component_parent;
		$options->section_tipo = $section_tipo;
		
	$result = (object)hierarchy::generate_virtual_section( $options );
		#dump($result, ' $result ++ '.to_string());

	switch (true) {
		case isset($result->result) && $result->result===true:
			$class = 'ok';
			break;
		case isset($result->result) && $result->result===false:
			$class = 'warning';
			break;
		default:
			$class = 'warning';
			break;
	}
	if (isset($result->msg)) {

		$msg = '<div class="'.$class.'">'. nl2br($result->msg) .'</div>';

		$response->result 	= true;
		$response->msg 		= $msg;	//'Ok. Request done ['.__FUNCTION__.']';

		# Remove structure cache to reconize new structure sections
		# Delete all session data config except search_options
		foreach ($_SESSION['dedalo']['config'] as $key => $value) {
			if ($key==='search_options') continue;
			unset($_SESSION['dedalo'][$key]);
		}
	}

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
}//end generate_virtual_section



/**
* UPDATE_TARGET_SECTION
* @return object $response
*/
function update_target_section($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	# set vars
	$vars = array('parent');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			#if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}
	

	$options = new stdClass();
		$options->section_tipo = DEDALO_HIERARCHY_SECTION_TIPO;
		$options->section_id   = (int)$parent;

	$response = hierarchy::update_target_section($options);

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
}//end update_target_section



?>