<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config.php');
// include( dirname(__FILE__) .'/class.tool_upload.php');
# TRIGGER_MANAGER. Add trigger_manager to receive and parse requested data
common::trigger_manager();

	// dump(file_get_contents('php://input'), ' file_get_contents(php://input) ++ '.to_string());
	// dump($_REQUEST, ' _REQUEST ++ '.to_string());
	// dump($_FILES, ' _FILES ++ '.to_string());

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
*/
// xhr can´t be a json 'php://input'. Because this, we receive
// a _POST and _FILES request and are transformed to a standard call
if (isset($_POST['mode']) && $_POST['mode']==='upload_file') {

	$json_data = new stdClass();
		// files
		// $json_data->files = $_FILES;
		// post
		foreach ($_POST as $key => $value) {
			$json_data->{$key} = $value;
		}

	return upload_file($json_data);
}
function upload_file($json_data) {
	global $start_time;

	$response = new stdClass();
		$response->result 	= false;
		$response->msg 		= 'Error. Request failed ['.__FUNCTION__.']';

	// post file (sended across $_FILES)
		$uploaded_file_name 		= $_FILES["fileToUpload"]['name'];
		$uploaded_file_type 		= $_FILES["fileToUpload"]['type'];
		$uploaded_file_temp_name	= $_FILES["fileToUpload"]['tmp_name'];
		$uploaded_file_size			= $_FILES["fileToUpload"]['size'];
		$uploaded_file_error		= $_FILES["fileToUpload"]['error'];
		$uploaded_file_error_text 	= tool_upload::error_number_to_text($uploaded_file_error);
		$uploaded_file_extension 	= strtolower(pathinfo($uploaded_file_name, PATHINFO_EXTENSION));

	// set vars
	$vars = array('file_name','target_dir','component_tipo','section_tipo','section_id','quality');
		foreach($vars as $name) {
			$$name = common::setVarData($name, $json_data);
			# DATA VERIFY
			# if ($name==='quality') continue; # Skip non mandatory
			if (empty($$name)) {
				$response->msg = 'Trigger Error: ('.__FUNCTION__.') Empty '.$name.' (is mandatory)';
				return $response;
			}
		}

	dump($json_data, ' json_data +++++++++++++++++++++++++++ '.to_string());
	return $response;


	$source_lang 	= component_text_area::force_change_lang($component_tipo, $section_id, 'lang', $lang, $section_tipo);
	if ($source_lang===$lang) {
		$response->msg 		= "Warning. Lang ($lang) and source lang ($source_lang) are the same..";
		return $response;
	}

	$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
	$component 		= component_common::get_instance($modelo_name,
													 $component_tipo,
													 $section_id,
													 'list',
													 $source_lang,
													 $section_tipo);

	$dato = $component->get_dato();
	$dato = component_text_area::resolve_titles($dato, $component_tipo, $section_tipo, $section_id, null, $source_lang, true);
	$dato = TR::addTagImgOnTheFly($dato);
	$response->result 	= $dato;
	$response->msg = 'OK. Loaded component source lang ($source_lang)';

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
}//end upload_file

