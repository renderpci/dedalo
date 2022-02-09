<?php
$start_time=microtime(1);
include( dirname(dirname(dirname(__FILE__))) .'/config/config.php');

// trigger_manager. Add trigger_manager to receive and parse requested data
	// options. Set options source as 'GET' when we need override default 'php://input' input
	// (!) Note that this set, converts url vars like 'mode=download_file&quality=404&tipo=rsc35&section_tipo=rsc167&section_id=1'
	// to an Dédalo standard json object like
	// {
	//     "mode": "download_file",
	//     "quality": "404",
	//     "tipo": "rsc35",
	//     "section_tipo": "rsc167",
	//     "section_id": "1"
	// }
	// and call the function that matchs 'mode' value
	$options = new stdClass();
		$options->source = 'GET';

	common::trigger_manager($options);



/**
* DOWNLOAD_FILE
* @param object $json_data
*/
function download_file($json_data) {
	global $start_time;

	// unlock session file
		session_write_close();

	// security
		// If hotlinking not allowed then make hackers think there are some server problems
		if (!isset($_SERVER['HTTP_REFERER']) || strpos(strtoupper($_SERVER['HTTP_REFERER']), strtoupper(DEDALO_HOST))===false) {
			die("Internal server error. Please contact system administrator (err1).");
		}

	// short vars
		$tipo			= $json_data->tipo;
		$section_tipo	= $json_data->section_tipo;
		$section_id		= $json_data->section_id;
		$quality		= $json_data->quality;

	// component
		$model			= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component_av	= component_common::get_instance(	$model, // component_av expected
															$tipo,
															$section_id,
															'list',
															DEDALO_DATA_NOLAN,
															$section_tipo);
	// file path
		$file_path = ($quality==='original')
			? $component_av->get_original_file_path($quality)
			: $component_av->get_path($quality);

	// extension
		$extension = pathinfo($file_path, PATHINFO_EXTENSION);

	// mime type
		$mime_type = (function() use($file_path) {
			$finfo		= new finfo(FILEINFO_MIME_TYPE);
			$file_mime	= $finfo->file($file_path);

			return $file_mime;
		})();
	// saved file name
		$download_name = 'dedalo_download_' . $component_av->get_id() .'_'. $quality .'.'. $extension;
	// file size in bytes
		$file_bytes_size = filesize($file_path);

	// headers
		header("Pragma: public");
		header("Expires: 0");
		header("Cache-Control: must-revalidate, post-check=0, pre-check=0");
		header("Cache-Control: public");
		header("Content-Description: File Transfer");
		header("Content-Type: $mime_type");
		header("Content-Disposition: attachment; filename=\"$download_name\"");
		header("Content-Transfer-Encoding: binary");
		header("Content-Length: " . $file_bytes_size);

		// download
		$file = @fopen($file_path,"rb");
		if ($file) {
			while(!feof($file)) {
				print(fread($file, 1024*8));
				flush();
				if (connection_status()!=0) {
					@fclose($file);
					die();
				}
			}
			@fclose($file);
		}

	// debug
		$exec_time	= exec_time_unit($start_time,'ms')." ms";
		debug_log(__METHOD__." Downloaded file $download_name in ".$exec_time, logger::DEBUG);

	return true;
}//end download_file


