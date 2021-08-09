<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');



// trigger_manager. Add trigger_manager to receive and parse requested data
	if (isset($_POST['mode']) && $_POST['mode']==='import_files') {
		// Note that no header('Content-Type: application/json; charset=utf-8') is applicated here (XMLHttpRequest POST)
		common::trigger_manager(
			(object)[
				'set_json_header'	=> false,
				'source'			=> 'POST'
			]
		);
	}else{
		// default behavior
		common::trigger_manager();
	}



/**
* UPLOAD_FILE
* @return object $response
* Note:
* XMLHttpRequest can´t be a json 'php://input'. Because this, we receive
* a _POST and _FILES request and they are transformed to a standard call by common::trigger_manager
*/
function upload_file($json_data) {
	global $start_time;

	return tool_import_files::upload_file($json_data);
}//end upload_file
