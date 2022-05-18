<?php
$start_time=hrtime(true);
// Turn off output buffering
ini_set('output_buffering', 'off');
// header print as json data
header('Content-Type: application/json');



// config
	include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');
	session_write_close();
	ignore_user_abort();



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

			$thumbnail_url = $upload_url . 'thumbnail/' . $basemane . '.jpg';

			$response = (object)[
				'result'			=> true,
				'msg'				=> 'OK',
				'thumbnail_file'	=> $thumbnail_url
			];

		}else{

			$response = (object)[
				'result'			=> false,
				'msg'				=> 'Error Processing',
				'thumbnail_file'	=> null
			];
		}

// JSON output
	echo json_encode($response);