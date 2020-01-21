<?php
/*
* CLASS COMPONENT_RELATION_COMMON
* Used as common base from all components that works with media
* like component_av, component_image, component_pdf, component_svg, etc..
*/
class component_media_common extends component_common {


	// public $allowed_extensions;



	/**
	* ADD_FILE
	* Receive a file info object from tool upload with data properties as:
	* {
	* 	"name": "montaje3.jpg",
	*	"type": "image/jpeg",
	*	"tmp_name": "/private/var/tmp/php6nd4A2",
	*	"error": 0,
	*	"size": 132898
	* }
	* @return object $response
	*/
	public function add_file($file_data) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.'] ';

		// file info
			$file_extension = strtolower(pathinfo($file_data->name, PATHINFO_EXTENSION));
			$file_id		= $this->get_id();
			$folder_path	= $this->get_target_dir();
			$full_file_name = $file_id . '.' . $file_extension;
			$full_file_path = $folder_path .'/'. $full_file_name;

		// validate extension
			if (!$this->valid_file_extension($file_extension)) {
				$response->msg  = "Error: " .$file_extension. " is an invalid file type ! ";
				$response->msg .= "Allowed file extensions are: ". implode(', ', $allowed_extensions);
				return $response;
			}

		// rename old files when they exists to store a copy before move current an overwrite it
			$renamed = $this->rename_old_files($file_id, $folder_path);
			if ($renamed->result===false) {
				$response->msg .= $renamed->msg;
				return $response;
			}

		// move file to destination
			if($file_extension==='zip'){
				// zip case. If the file is a .zip like in DVD case, create the folder and copy the VIDEO_TS and AUDIO_TS to the destination folder.

				// unzip file and move elements to final destinations
				$move_zip = self::move_zip_file($file_data->tmp_name, $folder_path, $file_id);
				if (false===$move_zip->result) {
					$response->msg .= $move_zip->msg;
					return $response;
				}

			}else{
				// usual case

				// move temporary file to final destination and name
				if (false===move_uploaded_file($file_data->tmp_name, $full_file_path)) {
					$response->msg .= "Error on move temp file to: " . $full_file_path;
					return $response;
				}
			}

		// all is ok
			$response->result 			= true;
			$response->msg 				= 'Ok. Request done ['.__METHOD__.'] ';

			// uploaded ready file info
			$response->ready 			= (object)[
				'full_file_name' => $full_file_name,
				'full_file_path' => $full_file_path
			];


		return $response;
	}//end add_file



	/**
	* MOVE_ZIP_FILE
	* Overwrite this method on each component that's needed it, for example 'component_av'
	* @return object $response
	*/
	public static function move_zip_file($tmp_name, $folder_path, $file_id) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.']. This component don\'t have ZIP files options enable. '.get_called_class();


		return $response;
	}//end move_zip_file



	/**
	* RENAME_OLD_FILES
	* @param $file_id string as 'test175_test65_3'
	* @param $folder_path string
	*/
	protected function rename_old_files($file_id, $folder_path) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.']';

		// deleted dir. Verify / create the dir "deleted"
		if(!file_exists($folder_path . "/deleted")) {
			if(!mkdir($folder_path."/deleted", 0777,true)) {
				$msg = "Error on create dir: $folder_path . Permission denied";
				debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
				$response->msg .= $msg;
				return $response;
			}
		}

		// remove old versions by extension. Iterate all extensions looking for possible files to delete
		$allowed_extensions = $this->get_allowed_extensions();
		$dateMovement 		= date("Y-m-d_Gis"); # like 2011-02-08_182033
		foreach ($allowed_extensions as $current_extension) {

			$current_possible_file = $folder_path .'/'. $file_id .'.'. $current_extension;
			if(file_exists($current_possible_file)) {
					//dump($current_possible_file, ' current_possible_file'.to_string());
				$file_to_move_renamed = $folder_path . '/deleted/'. $file_id . '_deleted_'. $dateMovement . '.' . $current_extension ;
				rename($current_possible_file, $file_to_move_renamed);
			}
		}
		// remove old versions by dirname (dvd for example). Check if dirname with file_id exists and move it if yes
		if(is_dir($folder_path.'/'.$file_id)) {
			$file_to_move_renamed = $folder_path . '/deleted/'. $file_id . '_deleted_'. $dateMovement ;
			rename($folder_path.'/'.$file_id , $file_to_move_renamed);
		}

		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__METHOD__.']';


		return $response;
	}//end rename_old_files



	/**
	* VALID_FILE_EXTENSION
	* @return bool
	*/
	public function valid_file_extension($file_extension) {

		$allowed_extensions = $this->get_allowed_extensions();

		$valid = in_array($file_extension, $allowed_extensions);

		return (bool)$valid;
	}//end valid_file_extension





}//end component_media_common
