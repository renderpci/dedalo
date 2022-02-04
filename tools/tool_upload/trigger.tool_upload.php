<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');



// trigger_manager. Add trigger_manager to receive and parse requested data
	if (isset($_POST['mode']) && $_POST['mode']==='upload_file') {
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

	debug_log(__METHOD__." --> received json_data: ".to_string($json_data), logger::DEBUG);

	// check for upload issues
	try {

		$allowed_extensions = json_decode($json_data->allowed_extensions); // like ['jpg']

		// Undefined | Multiple Files | $_FILES Corruption Attack
		// If this request falls under any of them, treat it invalid.
			if (
				!isset($_FILES['fileToUpload']['error']) ||
				is_array($_FILES['fileToUpload']['error'])
			) {
				throw new RuntimeException('Invalid parameters. (1)');
			}

		// Check $_FILES['fileToUpload']['error'] value.
			switch ($_FILES['fileToUpload']['error']) {
				case UPLOAD_ERR_OK:
					break;
				case UPLOAD_ERR_NO_FILE:
					throw new RuntimeException('No file sent.');
				case UPLOAD_ERR_INI_SIZE:
				case UPLOAD_ERR_FORM_SIZE:
					throw new RuntimeException('Exceeded filesize limit.');
				default:
					throw new RuntimeException('Unknown errors.');
			}

		// You should also check filesize here.
			// if ($_FILES['fileToUpload']['size'] > 1000000) {
			// 	throw new RuntimeException('Exceeded filesize limit.');
			// }

		// DO NOT TRUST $_FILES['fileToUpload']['mime'] VALUE !!
		// Check MIME Type by yourself.
			$finfo				= new finfo(FILEINFO_MIME_TYPE);
			$file_mime			= $finfo->file($_FILES['fileToUpload']['tmp_name']); // ex. string 'text/plain'
			$known_mime_types	= tool_upload::get_known_mime_types();
			if (false === $ext = array_search(
				$file_mime,
				$known_mime_types,
				true
			)) {
				// throw new RuntimeException('Invalid file format.');
				debug_log(__METHOD__." Warning. Accepted upload unknow file mime type: ".to_string($file_mime).' - name: '.to_string($_FILES['fileToUpload']['tmp_name']), logger::ERROR);
			}

		// You should name it uniquely.
		// DO NOT USE $_FILES['fileToUpload']['name'] WITHOUT ANY VALIDATION !!
		// On this example, obtain safe unique name from its binary data.
			// if (!move_uploaded_file(
			// 	$_FILES['fileToUpload']['tmp_name'],
			// 	sprintf('./uploads/%s.%s',
			// 		sha1_file($_FILES['fileToUpload']['tmp_name']),
			// 		$ext
			// 	)
			// )) {
			// 	throw new RuntimeException('Failed to move uploaded file.');
			// }

		// File is uploaded successfully
			return tool_upload::upload_file($json_data);

	} catch (RuntimeException $e) {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed. '. $e->getMessage();

		return $response;
	}
}//end upload_file
