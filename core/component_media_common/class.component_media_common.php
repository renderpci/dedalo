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
	public function add_file(object $file_data) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// file_data sample
			// {
			// 	"name": "IMG_3007.jpg",
			// 	"type": "image/jpeg",
			// 	"tmp_dir": "DEDALO_UPLOAD_TMP_DIR",
			// 	"resource_type": "tool_upload",
			// 	"tmp_name": "phpJIQq4e",
			// 	"error": 0,
			// 	"size": 22131522,
			// 	"extension": "jpg"
			// }

		// short vars
			$name			= $file_data->name; // string original file name like 'IMG_3007.jpg'
			$resource_type	= $file_data->resource_type; // string upload caller name like 'tool_upload'
			$tmp_dir		= $file_data->tmp_dir; // constant string name like 'DEDALO_UPLOAD_TMP_DIR'
			$tmp_name		= $file_data->tmp_name; // string like 'phpJIQq4e'

		// source_file
			if (!defined($tmp_dir)) {
				$msg = 'constant is not defined!  tmp_dir: '.$tmp_dir;
				debug_log(__METHOD__." $msg", logger::ERROR);
				$response->msg .= $msg;
				return $response;
			}
			$source_file = constant($tmp_dir) .'/'. $resource_type . '/' . $tmp_name;

		// check source file file
			if (!file_exists($source_file)) {
				$response->msg .= ' Source file not found: ' . basename($source_file);
				return $response;
			}

		// target file info
			$file_extension	= strtolower(pathinfo($name, PATHINFO_EXTENSION));
			$file_id		= $this->get_id();
			$folder_path	= $this->get_target_dir();
			$full_file_name	= $file_id . '.' . $file_extension;
			$full_file_path	= $folder_path .'/'. $full_file_name;

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
				$move_zip = self::move_zip_file($source_file, $folder_path, $file_id);
				if (false===$move_zip->result) {
					$response->msg .= $move_zip->msg;
					return $response;
				}

			}else{
				// usual case

				// move temporary file to final destination and name
				if (false===rename($source_file, $full_file_path)) {
					debug_log(__METHOD__." Error on move temp file to: ".to_string($full_file_path), logger::ERROR);
					$response->msg .= ' Error on move temp file '.basename($tmp_name).' to ' . basename($full_file_name);
					return $response;
				}
			}

		// all is ok
			$response->result	= true;
			$response->msg		= 'OK. Request done ['.__METHOD__.'] ';

			// uploaded ready file info
			$response->ready = (object)[
				'original_file_name'	=> $name,
				'full_file_name'		=> $full_file_name,
				'full_file_path'		=> $full_file_path
			];


		return $response;
	}//end add_file



	/**
	* MOVE_ZIP_FILE
	* Overwrite this method on each component that's needed it, for example 'component_av'
	* @return object $response
	*/
	public static function move_zip_file(string $tmp_name, string $folder_path, string $file_id) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.']. This component don\'t have ZIP files options enable. '.get_called_class();


		return $response;
	}//end move_zip_file



	/**
	* RENAME_OLD_FILES
	* @param $file_id string as 'test175_test65_3'
	* @param $folder_path string
	* @return object $reponse
	*/
	protected function rename_old_files(string $file_id, string $folder_path) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.']';

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

		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__METHOD__.']';


		return $response;
	}//end rename_old_files



	/**
	* VALID_FILE_EXTENSION
	* @return bool
	*/
	public function valid_file_extension(string $file_extension) : bool {

		$allowed_extensions = $this->get_allowed_extensions();

		$valid = in_array($file_extension, $allowed_extensions);

		return (bool)$valid;
	}//end valid_file_extension



	/**
	* PROCESS_UPLOADED_FILE
	* Dummy method. Overwrite it when need
	* @return object $response
	*/
	public function process_uploaded_file(object $file_data) : object {

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'Ok. Request done';

		return $response;
	}//end process_uploaded_file



	/**
	* GET_FILES_INFO
	* Get file info for every quality
	* Used as 'datalist' in component data API response
	* @return array $files_info
	*/
	public function get_files_info(): array {

		$ar_quality = $this->get_ar_quality();

		// files check
			$files_info = [];
			foreach ($ar_quality as $quality) {

				$path = ($quality==='original')
					? $this->get_original_file_path($quality)
					: $this->get_path($quality);

				// file_exist
					$file_exist	= file_exists($path);
						// $this->file_exist($quality);

				// file_size
					$file_size	= ($file_exist===true)
						? (function() use($path) {
							try {
								$size = @filesize($path);
							} catch (Exception $e) {
								trigger_error( __METHOD__ . " " . $e->getMessage() , E_USER_NOTICE);
							}
							return $size ?? null; // in bytes
						  })()
						: null;

				// file_url
					$file_url = ($file_exist===true) //  && $quality!=='original'
						? $this->get_url($quality)
						: null;

				// item
					$files_info[] = (object)[
						'quality'		=> $quality,
						'file_exist'	=> $file_exist,
						'file_size'		=> $file_size,
						'url'			=> $file_url
					];
			}

		return $files_info;
	}//end get_files_info



	/**
	* GET_QUALITY
	* 	Takes quality from fixed value or fallback to default config value
	* @return string $quality
	*/
	public function get_quality() : string {

		$quality = $this->quality ?? $this->get_default_quality();

		return $quality;
	}//end get_quality



	/**
	* DELETE_FILE
	* Remove quality version moving the file to a deleted files dir
	* @see component_image->remove_component_media_files
	*
	* @return object $response
	*/
	public function delete_file(string $quality) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// remove_component_media_files returns bool value
		$result = $this->remove_component_media_files([$quality]);
		if ($result===true) {

			// save To update valor_list
				$this->Save();

			$response->result	= true;
			$response->msg		= 'File deleted successfully. ' . $quality;
		}


		return $response;
	}//end delete_file



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file vinculated to current component (all quality versions)
	* Is triggered wen section tha contain media elements is deleted
	* @see section:remove_section_media_files
	*/
	public function remove_component_media_files(array $ar_quality=[]) : bool {

		$date=date("Y-m-d_Hi");

		// ar_quality
			if (empty($ar_quality)) {
				$ar_quality = $this->get_ar_quality();
			}

		// files remove
			foreach ($ar_quality as $current_quality) {

				// media_path is full path of file like '/www/dedalo/media_test/media_development/svg/standard/rsc29_rsc170_77.svg'
					$media_path = $this->get_path($current_quality);
					if (!file_exists($media_path)) continue; # Skip

				// delete dir
					$folder_path_del = $this->get_target_dir() . 'deleted';
					if( !is_dir($folder_path_del) ) {
						if( !mkdir($folder_path_del, 0777,true) ) {
							trigger_error(" Error on read or create directory \"deleted\". Permission denied");
							return false;
						}
					}

				// move/rename file
					$file_name			= $this->get_id();
					$media_path_moved	= $folder_path_del . '/' . $file_name . '_deleted_' . $date . '.' . $this->get_extension();
					if( !rename($media_path, $media_path_moved) ) {
						trigger_error(" Error on move files to folder \"deleted\" [1]. Permission denied . The files are not deleted");
						return false;
					}

				debug_log(__METHOD__." Moved file \n$media_path to \n$media_path_moved ".to_string(), logger::DEBUG);
			}//end foreach


		return true;
	}//end remove_component_media_files



}//end component_media_common
