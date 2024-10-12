<?php
// ontology custom config file
require_once( dirname(dirname(__FILE__)) .'/config/config_ontology.php' );
$start_time = start_time(); // add always after include config

# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

// /**
// * LOGIN
// */
// $is_logged = login::is_logged();

// if($is_logged!==true) {
// 	$url =  DEDALO_ROOT_WEB;
// 	header("Location: $url");
// 	exit();
// }
// $permissions = (int)security::get_security_permissions(DEDALO_TESAURO_TIPO, DEDALO_TESAURO_TIPO);
// if ($permissions<1) {
// 	$url =  DEDALO_ROOT_WEB;
// 	header("Location: $url");
// 	exit();
// }

// require_once(dirname(dirname(dirname(__FILE__))) . '/db/class.RecordObj_dd.php');
// require_once(dirname(dirname(__FILE__)) . '/class.dd.php');
require_once(dirname(dirname(__FILE__)) . '/class.RecordObj_dd_edit.php');


/**
* GET_PROPERTIES
*/
function get_properties($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	// set vars
		$vars = array('tipo');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			// if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	// term
		$RecordObj_dd = new RecordObj_dd($tipo);

	// properties
		$properties = $RecordObj_dd->get_properties();

	// response
		$response->result 	= $properties;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	// Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


	return (object)$response;
}//end get_properties



/**
* SAVE_PROPERTIES
*/
function save_properties($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	// set vars
		$vars = array('tipo','properties');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			// if ($name==='top_tipo' || $name==='top_id') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	// term
		$RecordObj_dd = new RecordObj_dd_edit($tipo);

	// properties
		$old_properties = $RecordObj_dd->get_properties(); // force open connection
		$RecordObj_dd->set_properties($properties); // update value and ready to save

	// save
		$result = $RecordObj_dd->Save();

	// response
		$response->result 	= $result;
		$response->msg 		= 'Ok. Request done ['.__FUNCTION__.']';

	// Debug
		if(SHOW_DEBUG===true) {
			$debug = new stdClass();
				$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
				foreach($vars as $name) {
					$debug->{$name} = $$name;
				}

			$response->debug = $debug;
		}


	return (object)$response;
}//end save_properties