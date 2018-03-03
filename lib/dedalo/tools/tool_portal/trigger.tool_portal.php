<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();



/**
* ADD RESOURCE
* Add new locator to portal dato
* @return object $response
*/
function add_resource($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	
	$vars = array('portal_tipo','portal_parent','portal_section_tipo','rel_locator','prev_locator');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='prev_locator') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

		if ($prev_locator==='"null"') {
			$prev_locator = null;
		}
		
	$modelo_name 		= RecordObj_dd::get_modelo_name_by_tipo($portal_tipo, true);
	$component_portal 	= component_common::get_instance($modelo_name,
														 $portal_tipo,
														 $portal_parent,
														 'edit',
														 DEDALO_DATA_NOLAN,
														 $portal_section_tipo);

	#
	# REMOVE PREVIOUS LOCATOR WHEN IS REQUIRED
	# debug_log(__METHOD__." Received prev_locator type: ".gettype($prev_locator), logger::DEBUG);
	# debug_log(__METHOD__." Received prev_locator strlen: ". strlen($prev_locator), logger::DEBUG);
	if (!empty($prev_locator)) {
		
		if ($prev_locator = json_decode($prev_locator)) {
			$remove_locator_result = $component_portal->remove_locator( $prev_locator );
			debug_log(__METHOD__." Removed prev_locator: ". to_string($prev_locator), logger::DEBUG);
		}else{
			debug_log(__METHOD__." Error on json_decode 1 var prev_locator: ".to_string($prev_locator), logger::ERROR);
		}		
		#debug_log(__METHOD__." Removed prev locator ".to_string($prev_locator), logger::DEBUG);

	}//end if (!empty($prev_locator))


	#
	# ADD NEW LOCATOR
	# debug_log(__METHOD__." Received rel_locator type: ".gettype($rel_locator), logger::DEBUG);
	# debug_log(__METHOD__." Received rel_locator: ".to_string($rel_locator), logger::DEBUG);
	$locator_added = false;
	if ($rel_locator = json_decode($rel_locator)) {
		$locator_added = $component_portal->add_locator( $rel_locator );
	}else{
		debug_log(__METHOD__." Error on json_decode 2 var rel_locator: ".to_string($rel_locator), logger::ERROR);
	}
	
	if ($locator_added!==true) {
		$response->msg = "Error : on add locator. Expected response 'true'. Received response: ".to_string($locator_added);
		return $response;
	}

	# Save
	$component_portal->Save();
	#dump($component_portal, ' component_portal ++ '.to_string());


	# State update
	$state = $component_portal->update_state($rel_locator);

	$response->result = true;
	$response->msg 	  = "Added resource successfully";

	
	if(SHOW_DEBUG===true) {
		$debug = new stdClass();
			$debug->exec_time			= exec_time_unit($start_time,'ms')." ms";
			$debug->locator_added 		= $locator_added;
			$debug->state 		  		= $state;
			$debug->portal_tipo 		= $portal_tipo;
			$debug->portal_parent 		= $portal_parent;
			$debug->portal_section_tipo = $portal_section_tipo;
			$debug->rel_locator  		= $rel_locator;
			$debug->prev_locator 		= $prev_locator;
			$debug->request 			= $_REQUEST;
	
		$response->debug = $debug;
	}


	return (object)$response;
}//end add_resource



?>