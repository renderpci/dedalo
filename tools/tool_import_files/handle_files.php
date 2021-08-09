<?php
// Turn off output buffering
ini_set('output_buffering', 'off');
// header print as json data
header('Content-Type: application/json');

$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');


// tipo
	$key_dir = $_REQUEST['key_dir'] ?? null;



// tool_import_files
	$tool_import_files = new tool_import_files();
	$tool_import_files->set_up($key_dir);

	// dir
		$upload_dir = TOOL_IMPORT_FILES_UPLOAD_DIR; // like /xxx/dedalo/media/upload/temp/files/user_2/rsc56/';
		$upload_url = TOOL_IMPORT_FILES_UPLOAD_URL;


	// target_file
		$file_name		= $_FILES['file']['name'];
		$uploaded_file	= $upload_dir . $file_name;

		$info			= pathinfo($file_name);
		$basemane		= basename($file_name,'.'.$info['extension']);

		$thumbnail_file	= $upload_dir . 'thumbnail/' . $basemane . '.jpg';

	// move file
		if (move_uploaded_file($_FILES["file"]["tmp_name"], $uploaded_file )) {
		   $status = 1;

			$target_pixels_width  = 192;
			$target_pixels_height = 96;

			$flags = '-thumbnail '.$target_pixels_width.'x'.$target_pixels_height; //. ' -format jpeg'
			ImageMagick::convert($uploaded_file, $thumbnail_file, $flags);

			$thumbnail_url	= $upload_url . 'thumbnail/' . $basemane . '.jpg';

			$response = (object) [
				'thumbnail_file'	=>	$thumbnail_url,
				'result' 			=> true,
				'msg' 				=> 'Ok'
			];

		   echo json_encode($response);
		}else{

			$response = (object) [
				'thumbnail_file'	=> null,
				'result' 			=> false,
				'msg' 				=> 'Error Processing'
			];

		   echo json_encode($response);
		}