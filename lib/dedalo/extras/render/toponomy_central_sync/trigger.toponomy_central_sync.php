<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))).'/config/config4.php');
require_once( dirname(__FILE__).'/class.toponomy_central_sync.php');
/*
    TOPONOMY_CENTRAL_SYNC TRIGGER
*/

# set vars
$vars = array('options');
    foreach($vars as $name) $$name = common::setVar($name);


if (empty($options)) {
	exit('Error. Empty options');
}
$options = rawurldecode($options);

if( !$options = json_decode($options) ) {
	exit('Error. Invalid json options');
}

if (!is_object($options)) {
	exit('Error. Invalid options object');
}


#
# ADD ENVIROMENTAL OPTIONS
$options->ip 	= isset($_SERVER['REMOTE_ADDR']) ? $_SERVER["REMOTE_ADDR"] : false;
$options->date 	= date('Y-m-d H:i:s');

#echo to_string($options);
#dump($options, ' options ++ '.to_string()); die();



#
# TOPONOMY_CENTRAL_SYNC CLASS
$toponomy_central_sync = new toponomy_central_sync();

#
# DEDALO LOGIN
$toponomy_central_sync->dedalo_login();


switch ($options->update_type) {
	case 'jer':
		#
		# INSERT JER_XX
		$response = $toponomy_central_sync->insert_ts( $options );
		break;

	case 'descriptors':
		#
		# UPDATE DESCRIPTORS
		$response = $toponomy_central_sync->update_ts( $options );
		break;

	default:
		$response = 'Unsupported update_type';
		break;
}

//print_r($response);
//dump($response, ' response ++ '.to_string());

echo json_encode($response);
exit();
?>