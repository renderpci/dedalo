<?php
// Turn off output buffering
ini_set('output_buffering', 'off');
// header print as json data
header('Content-Type: application/json');

$str_json = file_get_contents('php://input');
$options = !empty($str_json) ? json_decode($str_json) : null;


$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');



// key_dir. Contraction of tipo + section_tipo, like: 'rsc29_rsc176'
	$key_dir = $options->key_dir ?? null;



// tool_import_files
	$tool_import_files = new tool_import_files();
	$tool_import_files->set_up($key_dir);

	// dir
		$upload_dir = TOOL_IMPORT_FILES_UPLOAD_DIR; // like /xxx/dedalo/media/upload/temp/files/user_2/rsc56/';
		$upload_url = TOOL_IMPORT_FILES_UPLOAD_URL;

	// read files dir
		$files		= [];
		$files_raw	= scandir($upload_dir);
		foreach ($files_raw as $file_name) {
			$file_path = $upload_dir . $file_name;
			if (strlen($file_name) > 0 && $file_name[0]!=='.' && is_file($file_path)) {

				$info			= pathinfo($file_name);
				$basemane		= basename($file_name,'.'.$info['extension']);

				$files[] = (object)[
					'url'	=> $upload_url .'/thumbnail/'. $basemane . '.jpg',
					'name'	=> $file_name,
					'size'	=> filesize($file_path)
				];
	        }
		}



	// output
		echo json_encode($files, JSON_PRETTY_PRINT);

