<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

# IGNORE_USER_ABORT
ignore_user_abort(true);



/**
* LOAD_ACCESS_ELEMENTS
*/
function load_access_elements($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	$vars = array('tipo','parent');	
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='dato') continue; # Skip non mandatory filled
			if (empty($$name)) {
				exit("Error. ".$$name." is mandatory");
			}
		}
	
	#
	# SECTION ELEMENTS CHILDREN
	$ar_ts_childrens = component_security_access::get_ar_ts_childrens_recursive($tipo);	
		#dump($ar_ts_childrens, ' ar_ts_childrens ++ '.to_string());
		

	#
	# DATO_ACCESS	
	$component_security_access = component_common::get_instance('component_security_access',
																 DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO,
																 $parent,
																 'list',
																 DEDALO_DATA_NOLAN,
																 DEDALO_SECTION_PROFILES_TIPO);
	$dato_access = $component_security_access->get_dato();
		#dump($dato_access, ' dato_access ++ '.to_string());

	$access_arguments=array();
		$access_arguments['dato'] 				= $dato_access;
		$access_arguments['parent'] 			= $parent;
		$access_arguments['dato_section_tipo'] 	= $tipo;
	
	$li_elements_html = component_security_access::walk_ar_elements_recursive($ar_ts_childrens, $access_arguments);
	
	# Write session to unlock session file
	session_write_close();

	$response->result 	= $li_elements_html;
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
}//end load_access_elements


