<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');

	// dump($_POST, ' _POST ++ '.to_string());
	// dump(file_get_contents('php://input'), ' file_get_contents(php://input) ++ '.to_string());
	// dump($_FILES, ' _FILES ++ '.to_string());

# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
if (isset($_POST['mode']) && $_POST['mode']==='upload_file') {
	// Note that no header('Content-Type: application/json; charset=utf-8') is applicated here (XMLHttpRequest POST)
	common::trigger_manager(
		(object)[
			'set_json_header' 	=> false,
			'source' 			=> 'POST'
		]
	);
}else{
	// default behavior
	common::trigger_manager();
}



/**
* GET_SYSTEM_INFO
* @param $json_data
*/
function get_system_info($json_data) {
	global $start_time;

	# Write session to unlock session file
	session_write_close();

	# set vars
	$vars = array();

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';


	$response->result = tool_upload::get_system_info();
	$response->msg 	  = 'Ok. Request done ['.__FUNCTION__.']';

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
}//end get_system_info



/**
* UPLOAD_FILE
* @return object $response
* Note:
* XMLHttpRequest can´t be a json 'php://input'. Because this, we receive
* a _POST and _FILES request and are transformed to a standard call by common::trigger_manager
*/
function upload_file($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. '.label::get_label('error_al_subir_el_archivo');

	// set vars
	$vars = array('component_tipo','section_tipo','section_id','quality');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			// if ($name==='quality') continue; # Skip non mandatory
			if (empty($$name) || $$name==='undefined') {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	// file_data. post file (sended across $_FILES)
		// Example of received data:
		// "name": "montaje3.jpg",
		// "type": "image/jpeg",
		// "tmp_name": "/private/var/tmp/php6nd4A2",
		// "error": 0,
		// "size": 132898
		$file_data = new stdClass();
			$file_data->name 		= $_FILES["fileToUpload"]['name'];
			$file_data->type 		= $_FILES["fileToUpload"]['type'];
			$file_data->tmp_name 	= $_FILES["fileToUpload"]['tmp_name'];
			$file_data->error 		= $_FILES["fileToUpload"]['error'];
			$file_data->size 		= $_FILES["fileToUpload"]['size'];
			$file_data->extension 	= strtolower(pathinfo($_FILES["fileToUpload"]['name'], PATHINFO_EXTENSION));

		// check for upload server errors
			$uploaded_file_error		= $_FILES["fileToUpload"]['error'];
			$uploaded_file_error_text 	= tool_upload::error_number_to_text($uploaded_file_error);
			if ($uploaded_file_error!==0) {
				$response->msg .= ' - '.$uploaded_file_error_text;
				return $response;
			}

		// check file is available in temp dir
			if(!file_exists($file_data->tmp_name)) {
				debug_log(__METHOD__." Error on locate temporary file ".$file_data->tmp_name, logger::ERROR);
				$response->msg .= "Uploaded file not found in temporary folder";
				return $response;
			}

	// component
		$model 			= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
		$component 		= component_common::get_instance($model,
														 $component_tipo,
														 $section_id,
														 'edit',
														 DEDALO_DATA_LANG,
														 $section_tipo);

		// fix current component target quality (defines the destination directory for the file, like 'original')
			$component->set_quality($quality);

		// add file
			$add_file = $component->add_file($file_data);
			if ($add_file->result===false) {
				$response->msg = $add_file->msg;
				return $response;
			}
			// dump($add_file, ' add_file ++ '.to_string());

		// postprocessing file (add_file returns final renamed file with path info)
			$process_file = $component->process_uploaded_file($add_file->ready);
			if ($process_file->result===false) {
				$response->msg = 'Upload is complete, but errors occurred on processing file: '.$process_file->msg;
				return $response;
			}

		// preview url. Usually the thumb image or posterframe
			$preview_url = $component->get_preview_url();


	// all is ok
		$response->result 		= true;
		$response->preview_url 	= $preview_url;
		$response->msg 			= 'Ok. '.label::get_label('fichero_subido_con_exito');


	# Debug
	if(SHOW_DEBUG===true) {

		// $response->msg .= '<pre>'.json_encode($add_file, JSON_PRETTY_PRINT).'</pre>';
		// $response->msg .= '<pre>'.json_encode($process_file, JSON_PRETTY_PRINT).'</pre>';

		$debug = new stdClass();
			$debug->exec_time	= exec_time_unit($start_time,'ms')." ms";
			foreach($vars as $name) {
				$debug->{$name} = $$name;
			}
			$debug->file_data = $file_data;
			$debug->add_file  = $add_file;

		$response->debug = $debug;
	}

	// echo json_encode($response);
	// die();

	return (object)$response;
}//end upload_file
