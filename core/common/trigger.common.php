<?php
$start_time=microtime(1);
include( dirname(dirname(__FILE__)).'/config/config.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
$options = new stdClass();
	$options->test_login = false; # Allow change lang before login
common::trigger_manager($options);



/**
* CHANGE_LANG
* @return object $response
*/
function change_lang($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__METHOD__.']';

	$vars = array('dedalo_data_lang','dedalo_application_lang');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			if ($name==='dedalo_data_lang' || $name==='dedalo_application_lang') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__METHOD__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	if (!empty($dedalo_data_lang)) {
		$dedalo_data_lang = trim( safe_xss($dedalo_data_lang) );
		# Save in session
		$_SESSION['dedalo4']['config']['dedalo_data_lang'] = $dedalo_data_lang;

		$response->msg .= ' Changed dedalo_data_lang to '.$dedalo_data_lang;
	}
	
	if (!empty($dedalo_application_lang)) {
		$dedalo_application_lang = trim( safe_xss($dedalo_application_lang) );
		# Save in session
		$_SESSION['dedalo4']['config']['dedalo_application_lang'] = $dedalo_application_lang;

		$response->msg .= ' Changed dedalo_application_lang to '.$dedalo_application_lang;
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
	debug_log(__METHOD__." response ".to_string($response), logger::DEBUG);

	return (object)$response;
}//end change_lang
?>