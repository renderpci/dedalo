<?php
/**
* CLASS COMPONENT_AV
*
*/
class component_av extends component_media_common {



	/**
	* CLASS VARS
	*/
		// string id .file name formatted as 'tipo'-'order_id' like dd732-1
		public $video_url;



	/**
	* GET_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param string $lang = DEDALO_DATA_LANG
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $grid_cell_object
	*/
	public function get_value(string $lang=DEDALO_DATA_LANG, ?object $ddo=null) : dd_grid_cell_object {

		// column_obj
			$column_obj = isset($this->column_obj)
				? $this->column_obj
				: (object)[
					'id' => $this->section_tipo.'_'.$this->tipo
				  ];

		// dato
			$dato = $this->get_dato();

		// quality
			$quality = $this->get_default_quality();

		// data item
			$item  = new stdClass();
				$item->posterframe_url = $this->get_posterframe_url(
					true, // bool test_file
					false, // bool absolute
					false // bool avoid_cache
				);
				$item->video_url = $this->file_exist( $quality )
					? $this->get_url(false)
					: null;

		// label
			$label = $this->get_label();

		// value
			$grid_cell_object = new dd_grid_cell_object();
				$grid_cell_object->set_type('column');
				$grid_cell_object->set_label($label);
				$grid_cell_object->set_ar_columns_obj([$column_obj]);
				$grid_cell_object->set_cell_type('av');
				$grid_cell_object->set_value([$item]);


		return $grid_cell_object;
	}//end get_value



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor_export
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) : string {

		if (empty($valor)) {
			$this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed JSON string as dato
		}

		$av_file_path = $this->get_valor();

		$test_file	= true;	// output dedalo image placeholder when not file exists
		$absolute	= true;	// output absolute path like 'http://myhost/mypath/myimage.jpg'

		$posterframe_file_path	= $this->get_posterframe_url($test_file, $absolute);

		$valor_export = $av_file_path .','. $posterframe_file_path;


		return $valor_export;
	}//end get_valor_export



	/**
	* GET_DEFAULT_QUALITY
	* @return string DEDALO_AV_QUALITY_DEFAULT
	*/
	public function get_default_quality() : string {

		return DEDALO_AV_QUALITY_DEFAULT;
	}//end get_default_quality



	/**
	* GET_URL
	* @param string|null $quality = null
	* @return string $video_url
	*/
	public function get_url( ?string $quality=null ) : string {

		if(empty($quality)) {
			$quality = $this->get_quality();
		}

		$id		= $this->get_id();
		$path	= DEDALO_MEDIA_URL . DEDALO_AV_FOLDER .'/'. $quality . '/';
		$name	= $id .'.'. $this->get_extension();

		// media file av url
		$url = $path . $name;

		return $url;
	}//end get_url



	/**
	* GET_POSTERFRAME_FILE_NAME
	*  like 'rsc35_rsc167_1.jpg'
	* @return string $posterframe_file_name;
	*/
	public function get_posterframe_file_name() : string {

		$posterframe_file_name = $this->get_id() .'.'. DEDALO_AV_POSTERFRAME_EXTENSION;

		return $posterframe_file_name;
	}//end get_posterframe_file_name



	/**
	* GET_POSTERFRAME_PATH
	* Get full file path
	* @return string $posterframe_path
	*/
	public function get_posterframe_path() : string {

		$file_name			= $this->get_posterframe_file_name();
		$posterframe_path	= DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/posterframe/'. $file_name;

		return $posterframe_path;
	}//end get_posterframe_path



	/**
	* GET_POSTERFRAME_URL
	* @return string $posterframe_url
	*/
	public function get_posterframe_url(bool $test_file=true, bool $absolute=false, bool $avoid_cache=false) : string {

		$id			= $this->get_id();
		$file_name	= $this->get_posterframe_file_name();

		$posterframe_url = DEDALO_MEDIA_URL . DEDALO_AV_FOLDER .'/posterframe/'. $file_name;

		# FILE EXISTS TEST : If not, show '0' dedalo image logo
		if ($test_file===true) {
			$file = DEDALO_MEDIA_PATH .DEDALO_AV_FOLDER.'/posterframe/'. $file_name ;
			if(!file_exists($file)) {
				$posterframe_url = DEDALO_CORE_URL . '/themes/default/0.jpg';
			}
		}

		# ABSOLUTE (Default false)
		if ($absolute===true) {
			$posterframe_url = DEDALO_PROTOCOL . DEDALO_HOST . $posterframe_url;
		}

		if ($avoid_cache===true) {
			$posterframe_url .= '?t=' .time();
		}

		return $posterframe_url;
	}//end get_posterframe_url



	/**
	* GET_SUBTITLES_PATH
	*/
	public function get_subtitles_path( string $lang=DEDALO_DATA_LANG ) : string  {

		$subtitles_path = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER.'/'. $this->get_id().'_'.$lang.'.'.DEDALO_AV_SUBTITLES_EXTENSION;

		return $subtitles_path;
	}//end get_subtitles_path



	/**
	* GET_SUBTITLES_URL
	* @return string $subtitles_url
	*/
	public function get_subtitles_url( string $lang=DEDALO_DATA_LANG ) : string {

		$subtitles_url = DEDALO_MEDIA_URL . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER. '/'. $this->get_id().'_'.$lang .'.'.DEDALO_AV_SUBTITLES_EXTENSION;

		return $subtitles_url;
	}//end get_subtitles_url



	/**
	* GET_ORIGINAL_FILE_PATH
	* Returns the full path of the original file if exists
	* Si se sube un archivo de extensión distinta a DEDALO_IMAGE_EXTENSION, se convierte a DEDALO_IMAGE_EXTENSION. Los archivos originales
	* se guardan renombrados pero conservando la terminación. Se usa esta función para localizarlos comprobando si hay mas de uno.
	* @param string $quality
	* @return string|null $result
	*/
	public function get_original_file_path(string $quality) : ?string {

		$result = null;

		// store initial_quality
			// $initial_quality = $this->get_quality();

		// quality. Changes current component quality temporally
			// $this->set_quality($quality);

		// directory do not exists case
			$target_dir = $this->get_media_path($quality);
			if( !file_exists($target_dir) ) {
				debug_log(__METHOD__." Directory '$target_dir' do not exists !. quality: ".to_string($quality), logger::ERROR);
				return null;
			}

		// ar_originals
			$ar_originals	= [];
			$findme			= $this->get_id() . '.';
			if ($handle = opendir($target_dir)) {

				while (false !== ($file = readdir($handle))) {

					// is dir case (DVD files)
					if($this->get_id() == $file && is_dir($target_dir.'/'.$file)){

						// DES
							// $dvd_folder = $target_dir.'/'.$file;
							// # dvd_folder dir set permissions 0777

							// $stat = stat($dvd_folder);
							// 	//dump($stat['uid'], ' stat: '.posix_geteuid() ) ; die();

							// if(posix_geteuid() != $stat['uid']){
							// 	chown($dvd_folder, posix_geteuid());
							// }

							// $wantedPerms = 0777;
							// $actualPerms = fileperms($dvd_folder);
							// if($actualPerms < $wantedPerms) {
							// 	$chmod = chmod($dvd_folder, $wantedPerms);
							// 	if(!$chmod) die(" Sorry. Error on set valid permissions to directory for \"$dvd_folder\".  ") ;
							// }

						$ar_originals[] = $file;
						continue;
					}

					// note that '.' and '..' is returned even
					if( strpos($file, $findme)!==false ) {
						$ar_originals[] = $file;
					}
				}
				closedir($handle);
			}

		$n = count($ar_originals);
		if ($n===0) {
			// nothing found case
		}elseif($n===1) {
			// OK. File found
			#$path = $_FILES['image']['name'];
			#$ext = pathinfo($ar_originals[0], PATHINFO_EXTENSION);
			$result = $target_dir.'/'.$ar_originals[0];
		}else{
			// Error. More than one original found
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." ERROR (DEBUG ONLY): Current quality have more than one file. ".to_string($ar_originals), logger::ERROR);
				dump($ar_originals, "ar_originals ++++++++++++++++++ ".to_string($ar_originals));
			}
		}

		// restore component quality
			// $this->set_quality($initial_quality);


		return $result;
	}//end get_original_file_path



	/**
	* GET_VIDEO SIZE
	* Calculate the current quality file size in the more human readable unit (kilobytes, megabytes, et.)
	* @param string $quality = null
	* @param string $filename = null
	* @return string
	* 	Sample: '35.2 MB'
	*/
	public function get_video_size(string $quality=null, string $filename=null) : ?string {

		// empty filename case
			if (empty($filename)) {
				if(empty($quality)) {
					$quality = $this->get_quality();
				}
				$filename = $this->get_local_full_path($quality);
			}

		// file do not exists case
			if ( !file_exists( $filename )) {
				return null ;
			}

		$size = 0;
		if( is_dir($filename) ) {

			// minimum size of the initial VOB (512KB)
			$vob_filesize = 512*1000;

			if( is_dir($filename.'/VIDEO_TS') ) {

				$handle = opendir($filename.'/VIDEO_TS');
					 while (false !== ($file = readdir($handle))) {
						$extension = pathinfo($file,PATHINFO_EXTENSION);
						if($extension==='VOB' && filesize($filename.'/VIDEO_TS/'.$file) > $vob_filesize) {
							// reset the size of the VOB (for the end files of the video)
							$vob_filesize = 0;
							$size += filesize($filename.'/VIDEO_TS/'.$file);
						}
					 }
				}
		}else{
			try {
				$size		= @filesize($filename) ;
				if(!$size)	throw new Exception('Unknown size!') ;
			} catch (Exception $e) {
				#echo '',  $e->getMessage(), "\n";
				#trigger_error( __METHOD__ . " " . $e->getMessage() , E_USER_NOTICE) ;
				return null;
			}
		}

		// size in unit
			$size_unit = $size <= 1024
				? round($size) . ' KB'
				: round($size / 1024) . ' MB';


		return $size_unit;
	}//end get_video_size



	/**
	* GET_DURATION
	* Get file av duration from file metadata reading attributes
	* Note that this calculation, read fiscally the file and this is slow (about 200 ms)
	* @param string|null $quality
	* @return float $duration
	*/
	public function get_duration( ?string $quality=null ) : float {

		$duration = 0;

		// current quality
			$quality = $quality ?? $this->get_quality();

		// read file
			$path				= $this->get_path($quality);
			$media_attributes	= $this->get_media_attributes($path);
			// expected result sample:
				// {
				// 	"format": {
				// 		"filename": "/../dedalo/media/av/404/rsc35_rsc167_1.mp4",
				// 		"nb_streams": 3,
				// 		"nb_programs": 0,
				// 		"format_name": "mov,mp4,m4a,3gp,3g2,mj2",
				// 		"format_long_name": "QuickTime / MOV",
				// 		"start_time": "0.000000",
				// 		"duration": "172.339000",
				// 		"size": "22126087",
				// 		"bit_rate": "1027095",
				// 		"probe_score": 100,
				// 		"tags": {
				// 			"major_brand": "isom",
				// 			"minor_version": "512",
				// 			"compatible_brands": "isomiso2avc1mp41",
				// 			"encoder": "Lavf59.16.100"
				// 		}
				// 	}
				// }
			if (isset($media_attributes->format->duration) && !empty($media_attributes->format->duration)) {

				$duration = $media_attributes->format->duration;

				// Save data to component as time code
					// $tc[0] = OptimizeTC::seg2tc($duration);
					// $component->set_dato($tc);
					// $component->Save();
			}


		return $duration;
	}//end get_duration



	/**
	* GET_SOURCE_QUALITY_TO_BUILD
	* Iterate array DEDALO_AV_AR_QUALITY (Order by quality big to small)
	* @param string $target_quality
	* @return string|null $current_quality
	*/
	public function get_source_quality_to_build(string $target_quality) : ?string {

		$ar_quality = DEDALO_AV_AR_QUALITY;
		foreach($ar_quality as $current_quality) {

			if($target_quality===DEDALO_AV_QUALITY_ORIGINAL) continue;

			// Current file
			$filename		= $this->get_original_file_path($current_quality);
			$file_exists	= empty($filename)
				? false
				: file_exists($filename);

			if ($current_quality!==$target_quality && $file_exists) {
				return $current_quality;
			}
		}//end foreach($ar_quality as $quality)


		return null;
	}//end get_source_quality_to_build



	/**
	* GET_AR_ALL_FILES_BY_QUALITY
	* @param array $ar_quality optional
	* @return array $ar_all_files_by_quality
	*/
	public function get_ar_all_files_by_quality( array $ar_quality=null ) : array {

		if (empty($ar_quality)) {
			$ar_quality = DEDALO_AV_AR_QUALITY;
		}

		$ar_all_files_by_quality = [];
		foreach ($ar_quality as $current_quality) {
			$ar_all_files_by_quality[$current_quality] = $this->get_original_file_path($current_quality);
		}

		return $ar_all_files_by_quality;
	}//end get_ar_all_files_by_quality



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file linked to current component (all quality versions)
	* Is triggered wen section that contains media elements is deleted
	* @see section:remove_section_media_files
	* @param array $ar_quality = []
	* @param bool $remove_posterframe = true
	* @return bool
	*/
	public function remove_component_media_files(array $ar_quality=[], bool $remove_posterframe=true) : bool {

		$date = date("Y-m-d_Hi");

		// ar_quality
			if (empty($ar_quality)) {
				$ar_quality = $this->get_ar_quality();
			}

		// files remove
			foreach ($ar_quality as $current_quality) {

				// media_path
					$media_path = $this->get_video_path($current_quality);
					if (!file_exists($media_path)) continue; # Skip

				// delete dir
					$folder_path_del = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $current_quality . '/deleted';
					if( !is_dir($folder_path_del) ) {
						$create_dir = mkdir($folder_path_del, 0777, true);
						if(!$create_dir) {
							debug_log(__METHOD__." Error on read or create directory \"deleted\". Permission denied. ".to_string($folder_path_del), logger::ERROR);
							return false;
						}
					}

				// move/rename file
					$reelID				= $this->get_id();
					$media_path_moved	= $folder_path_del . "/$reelID" . '_deleted_' . $date . '.' . $this->get_extension();
					if( !rename($media_path, $media_path_moved) ) {
						debug_log(__METHOD__." Error on move files to folder \"deleted\" . Permission denied . The files are not deleted ".to_string($media_path_moved), logger::ERROR);
						return false;
					}

				debug_log(__METHOD__." Moved file \n$media_path to \n$media_path_moved ", logger::DEBUG);
			}//end foreach ($ar_quality as $current_quality)


		// posterframe remove (default is true)
			if ($remove_posterframe===true) {

				$media_path = $this->get_posterframe_path();
				if (file_exists($media_path)) {

					// delete dir
						$folder_path_del = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/posterframe/deleted';
						if( !is_dir($folder_path_del) ) {
							$create_dir = mkdir($folder_path_del, 0775, true);
							if(!$create_dir) {
								debug_log(__METHOD__." Error on read or create directory \"deleted\". Permission denied ".to_string($folder_path_del), logger::ERROR);
								return false;
							}
						}

					// move/rename file
						$reelID				= $this->get_id();
						$media_path_moved	= $folder_path_del . "/$reelID" . '_deleted_' . $date . '.' . DEDALO_AV_POSTERFRAME_EXTENSION;
						if( !rename($media_path, $media_path_moved) ) {
							debug_log(__METHOD__." Error on move files to folder \"deleted\" . Permission denied . The files are not deleted ".to_string($media_path_moved), logger::ERROR);
							return false;
						}

					debug_log(__METHOD__." Moved file \n$media_path to \n$media_path_moved ", logger::DEBUG);
				}
			}//end if ($remove_posterframe===true)


		return true;
	}//end remove_component_media_files



	/**
	* RESTORE_COMPONENT_MEDIA_FILES
	* "Restore" last version of deleted media files (renamed and stored in 'deleted' folder)
	* Is triggered when tool_time_machine recover a section
	* @see tool_time_machine::recover_section_from_time_machine
	* @return bool
	*/
	public function restore_component_media_files() : bool {

		// AV restore
			$ar_quality = $this->get_ar_quality();;
			foreach ($ar_quality as $current_quality) {

				$media_path		= $this->get_video_path($current_quality);
				$media_path		= pathinfo($media_path, PATHINFO_DIRNAME).'/deleted';
				$id				= $this->get_id();
				$file_pattern	= $media_path .'/'. $id .'_*.'. $this->get_extension();
				$ar_files		= glob($file_pattern);
				if (empty($ar_files)) {
					debug_log(__METHOD__." No files to restore were found for id:$id. Nothing was restored (1) ".to_string($id), logger::WARNING);
					continue; // Skip
				}
				natsort($ar_files);	// sort the files from newest to oldest
				$last_file_path	= end($ar_files);
				$new_file_path	= $this->get_video_path($current_quality);
				if( !rename($last_file_path, $new_file_path) ) {
					// throw new Exception(" Error on move files to restore folder. Permission denied . Nothing was restored (2)");
					debug_log(__METHOD__." Error on move files to restore folder. Permission denied . Nothing was restored (2) ".to_string($new_file_path), logger::ERROR);
				}

				debug_log(__METHOD__." Moved file \n$last_file_path to \n$new_file_path ".to_string(), logger::DEBUG);
			}//end foreach ($ar_quality as $current_quality)


		// posterframe restore
			$media_path		= $this->get_posterframe_path();
			$media_path		= pathinfo($media_path, PATHINFO_DIRNAME).'/deleted';
			$id				= $this->get_id();
			$file_pattern	= $media_path.'/'.$id.'_*.'.DEDALO_AV_POSTERFRAME_EXTENSION;
			$ar_files		= glob($file_pattern);
			if (empty($ar_files)) {

				debug_log(__METHOD__." No files to restore were found for posterframe:$id. Nothing was restored (3) ".to_string(), logger::DEBUG);

			}else {

				natsort($ar_files);	// sort the files from newest to oldest
				$last_file_path	= end($ar_files);
				$new_file_path	= $this->get_posterframe_path();
				if( !rename($last_file_path, $new_file_path) ) {
					// throw new Exception(" Error on move files to restore folder. Permission denied to restore posterframe. Nothing was restored (4)");
					debug_log(__METHOD__." Error on move files to restore folder. Permission denied to restore posterframe. Nothing was restored (4) ".to_string($new_file_path), logger::ERROR);
				}

				debug_log(__METHOD__." Moved file \n$last_file_path to \n$new_file_path ".to_string(), logger::DEBUG);
			}


		return true;
	}//end restore_component_media_files



	/**
	* FILE_EXIST
	* Check if quality given file exists.
	* If not quality is received, default will be used (404 normally)
	* @param string $quality
	* @return bool
	*/
	public function file_exist(string $quality=null) : bool {

		$video_path		= $this->get_video_path($quality);
		$file_exists	= file_exists($video_path);

		return $file_exists;
	}//end file_exist



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_AV_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_ORIGINAL_QUALITY
	* @return string $original_quality
	*/
	public function get_original_quality() : string {

		$original_quality = defined('DEDALO_AV_QUALITY_ORIGINAL')
			? DEDALO_AV_QUALITY_ORIGINAL
			: DEDALO_AV_QUALITY_DEFAULT;

		return $original_quality;
	}//end get_original_quality



	/**
	* MOVE_ZIP_FILE
	* Used to move zip files like compressed DVD
	* @param string $tmp_name
	* @param string $folder_path
	* @param string $file_name
	* @return object $response
	*/
	public static function move_zip_file(string $tmp_name, string $folder_path, string $file_name) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.']';

		// zip
			$zip = new ZipArchive;
			$res = $zip->open($tmp_name);
			if ($res!==true) {
				$response->msg .= "Error on open zip file ! Code: ".to_string($res);
				return $response;
			}

		// Create the directories
			if( !is_dir($folder_path.'/'.$file_name) ) {
				$ar_folders = [
					$folder_path .'/'. $file_name,
					$folder_path .'/'. $file_name . '/VIDEO_TS/',
					$folder_path .'/'. $file_name . '/AUDIO_TS/'
				];
				foreach ($ar_folders as $current_folder) {
					if(!mkdir($current_folder, 0777)) {
						$response->msg .= "Error on read or create directory for \"$file_name\" folder. Permission denied ! ($current_folder)";
						return $response;
					}
				}
			}

		// See al .zip files for located the VIDEO_TS and AUDIO_TS folders
			for ($i=0; $i < $zip->numFiles; $i++) {

				$current_filename = $zip->getNameIndex($i);

				if(strpos($current_filename,'VIDEO_TS')!==false){

					$current_fileinfo = pathinfo($current_filename);
					# Don't copy the original VIDEO_TS in the zip file
					if ($current_fileinfo['basename']==='VIDEO_TS') {
						continue;
					}
					# Copy al files of the VIDEO_TS zip file into the VIDEO_TS destination file
					$src 	= $tmp_name.'#'.$current_filename;
					$target = $folder_path.'/'.$file_name.'/VIDEO_TS/'.$current_fileinfo['basename'];
					if(!copy('zip://'.$src, $target)) {
						$response->msg .= "Error on copy zip file: $src";
						return $response;
					}

				}else if(strpos($current_filename,'AUDIO_TS')!==false){
					$current_fileinfo = pathinfo($current_filename);
					# Don't copy the original AUDIO_TS in the zip file
					if ($current_fileinfo['basename'] === 'AUDIO_TS') {
						continue;
					}
					// Copy al files of the VIDEO_TS zip file into the AUDIO_TS destination file
					$src 	= $tmp_name.'#'.$current_filename;
					$target = $folder_path.'/'.$file_name.'/AUDIO_TS/'.$current_fileinfo['basename'];
					if(!copy('zip://'.$src, $target)) {
						$response->msg .= "Error on copy zip file: $src";
						return $response;
					}
				}
			}//end for ($i=0; $i < $zip->numFiles; $i++)

		$zip->close();

		// all is OK
		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__METHOD__.']';


		return $response;
	}//end move_zip_file



	/**
	* GET_PREVIEW_URL
	* Return posterframe url
	* @return string $preview_url
	*/
	public function get_preview_url() : string {

		$preview_url = $this->get_posterframe_url(
			false, // bool test_file
			false, // bool absolute
			true // bool avoid_cache
		);

		return $preview_url;
	}//end get_preview_url



	/**
	* PROCESS_UPLOADED_FILE
	* @param object $file_data
	*	Data from trigger upload file
	* Format:
	* {
	*     "original_file_name": "my_video.mp4",
	*     "full_file_name": "test81_test65_2.mp4",
	*     "full_file_path": "/mypath/media/av/original/test81_test65_2.mp4"
	* }
	* @return object $response
	*/
	public function process_uploaded_file(object $file_data) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// short vars
			$original_file_name	= $file_data->original_file_name;	// kike "my video785.mp4"
			$full_file_name		= $file_data->full_file_name;		// like "test175_test65_1.mp4"
			$full_file_path		= $file_data->full_file_path;		// like "/mypath/media/av/404/test175_test65_1.mp4"

			// extension
				$file_ext = pathinfo($original_file_name, PATHINFO_EXTENSION);
				if (empty($file_ext)) {
					// throw new Exception("Error Processing Request. File extension is unknown", 1);
					$msg = ' Error Processing Request. File extension is unknown';
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg .= $msg;
					return $response;
				}

			// id (without extension, like 'test81_test65_2')
				$id = $this->get_id();
				if (empty($id)) {
					throw new Exception("Error Processing Request. Invalid id: ".to_string($id), 1);
				}

			// quality default in upload is 'original' (!)
				$quality = $this->get_quality();

			$AVObj = new AVObj($id, $quality);

		try {

			# AUDIO CASE
			if ($quality==='audio') {

				// audio extensions supported
				$ar_audio_only_ext = array('mp3','aiff','aif','wave','wav');
				if (in_array($file_ext, $ar_audio_only_ext)) {
					// Audio conversion
					// output_file_path is the final target file
					$output_file_path	= $this->get_local_full_path($quality);
					// uploaded_file_path is the current uploaded file path
					$uploaded_file_path	= $full_file_path;
					Ffmpeg::convert_audio( (object)[
						'output_file_path'		=> $output_file_path,
						'uploaded_file_path'	=> $uploaded_file_path
					]);
				}else{
					// throw new Exception("Error Processing Request. Current audio extension [$file_ext] is not supported (q:$quality)", 1);
					debug_log(__METHOD__." Error Processing Request. Current audio extension [$file_ext] is not supported (q:$quality)".to_string(), logger::ERROR);
				}

			# VIDEO CASE
			}else{

				// dedalo_av_recompress_all
				// When config DEDALO_AV_RECOMPRESS_ALL is set to 1, all video files are
				// re-compressed to 960k/s variable bit rate and keyframe every 75 frames
					if (defined('DEDALO_AV_RECOMPRESS_ALL') && DEDALO_AV_RECOMPRESS_ALL===1) {

						debug_log(__METHOD__." RECOMPRESSING AV FROM '$quality' PLEASE WAIT.. ".to_string(), logger::DEBUG);

						// If default quality file do not exists, generate default quality version now
						// $quality_default_AVObj 		 = new AVObj($id, DEDALO_AV_QUALITY_DEFAULT);
						// $quality_default_target_file = $quality_default_AVObj->get_local_full_path();
						$default_quality				= $this->get_default_quality();
						$quality_default_target_file	= $this->get_local_full_path($default_quality);
						if ( !file_exists($quality_default_target_file) ) {
							$source_file = $full_file_path; // actually full original path and name
							if (!file_exists($source_file)) {
								debug_log(__METHOD__." ERROR: Source file not exists ($source_file) ".to_string(), logger::ERROR);
							}else{
								// convert with ffmpeg
								Ffmpeg::convert_to_dedalo_av(
									$source_file, // string source_file
									$quality_default_target_file // string target_file
								);
							}
						}else{
							debug_log(__METHOD__." WARNING: Ignored conversion to default quality (".DEDALO_AV_QUALITY_DEFAULT."). File already exists", logger::WARNING);
						}//end if (!file_exists($target_file)) {
					}//end if (defined('DEDALO_AV_RECOMPRESS_ALL') && DEDALO_AV_RECOMPRESS_ALL==1)


				// posterframe. Create posterframe of current video if not exists
					$posterframe_path = $this->get_posterframe_path();
					if( !file_exists($posterframe_path) ) {
						$timecode	= '00:00:05';
						$Ffmpeg		= new Ffmpeg();
						$Ffmpeg->create_posterframe($AVObj, $timecode);
					}else{
						debug_log(__METHOD__." WARNING: Ignored creation of posterframe. File already exists", logger::WARNING);
					}

				// conform headers
					# Apply qt-faststart to optimize file headers position
					#$Ffmpeg = new Ffmpeg();
					#$Ffmpeg->conform_header($AVObj);
			}//end if ($quality=='audio') {


			// audio files. Audio files always generate an audio file
				$ar_audio_only_ext = array('mp3','aiff','aif','wave','wav');
				if (in_array($file_ext, $ar_audio_only_ext) && $quality===DEDALO_AV_QUALITY_ORIGINAL) {

					// Audio conversion
					$target_file = $this->get_local_full_path($quality);
					if (!file_exists($target_file)) {
						$source_file = $full_file_path;
						if (!file_exists($source_file)) {
							debug_log(__METHOD__." ERROR: Source file not exists ($source_file) 2 ".to_string(), logger::WARNING);
						}
						Ffmpeg::convert_to_dedalo_av(
							$source_file,
							$target_file
						);

						debug_log(__METHOD__." Converted source audio file to 'audio' quality ".to_string(), logger::DEBUG);
					}//end if (!file_exists($target_file))
				}


			// target_filename. Save original file name in a component_input_text
				$properties = $this->get_properties();
				if (isset($properties->target_filename)) {

					$current_section_id		= $this->get_parent();
					$target_section_tipo	= $this->get_section_tipo();

					$modelo_name_target_filename	= RecordObj_dd::get_modelo_name_by_tipo($properties->target_filename, true);
					$component_target_filename		= component_common::get_instance(
						$modelo_name_target_filename, // model
						$properties->target_filename, // tipo
						$current_section_id, // seciton_id
						'edit', // mode
						DEDALO_DATA_NOLAN, // lang
						$target_section_tipo // section_tipo
					);
					$component_target_filename->set_dato($original_file_name);
					$component_target_filename->Save();
					debug_log(__METHOD__." Saved original filename: ".to_string($original_file_name), logger::DEBUG);
				}

			// add data with the file uploaded
				// if ($quality===DEDALO_AV_QUALITY_ORIGINAL) {
				// 	$dato			= $this->get_dato();
				// 	$value			= empty($dato) ? new stdClass() : reset($dato);
				// 	$media_value	= $this->build_media_value((object)[
				// 		'value'		=> $value,
				// 		'file_name'	=> $original_file_name
				// 	]);
				// 	$this->set_dato([$media_value]);
				// 	$this->Save();
				// }

			// get files info
				$files_info	= [];
				$ar_quality = DEDALO_AV_AR_QUALITY;
				foreach ($ar_quality as $current_quality) {
					if ($current_quality==='thumb') continue;
					// read file if exists to get file_info
					$file_info = $this->get_quality_file_info($current_quality);
					// add non empty quality files data
					if (!empty($file_info)) {
						$files_info[] = $file_info;
					}
				}

			// save component dato
				$dato		= $this->get_dato();
				$save_dato	= false;
				if (isset($dato[0])) {
					if (!is_object($dato[0])) {
						// bad dato
						debug_log(__METHOD__." ERROR. BAD COMPONENT DATO ".to_string($dato), logger::ERROR);
					}else{
						// update property files_info
						$dato[0]->files_info = $files_info;
						$save_dato = true;
					}
				}else{
					// create a new dato from scratch
					$dato_item = (object)[
						'files_info' => $files_info
					];
					$dato = [$dato_item];
					$save_dato = true;
				}
				if ($save_dato===true) {
					$this->set_dato($dato);
					$this->Save();
				}

			// all is OK
				$response->result	= true;
				$response->msg		= 'OK. Request done ['.__METHOD__.'] ';

		} catch (Exception $e) {
			$msg = 'Exception[process_uploaded_file][ImageMagick]: ' .  $e->getMessage() . "\n";
			debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
			$response->msg .= ' - '.$msg;
		}


		return $response;
	}//end process_uploaded_file



	/**
	* GET_MEDIA_STREAMS
	* Check the file to get the head streams of the video file
	* @return mixed
	*/
	public function get_media_streams(?string $quality=null) {

		//get the video file path
			$video_path = $this->get_video_path($quality);

		// get_media_streams from av file
			$media_streams = Ffmpeg::get_media_streams($video_path);


		return $media_streams;
	}//end get_media_streams



	/**
	* GET_AR_QUALITY
	* Get the list of defined av qualities in Dédalo config
	* @return array $ar_quality
	*/
	public function get_ar_quality() : array {

		$ar_quality = DEDALO_AV_AR_QUALITY;

		return $ar_quality;
	}//end get_ar_quality



	/**
	* GET_EXTENSION
	* @return string DEDALO_AV_EXTENSION from config
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_AV_EXTENSION;
	}//end get_extension



	/**
	* GET_FOLDER
	* 	Get element dir from config
	* @return string
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_AV_FOLDER;
	}//end get_folder



	/**
	* DELETE_FILE
	* Remove quality version moving the file to a deleted files dir
	* @see component_av->remove_component_media_files
	*
	* @return object $response
	*/
	public function delete_file(string $quality) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// remove_component_media_files returns bool value
		$result = $this->remove_component_media_files(
			[$quality], // array ar_quality
			false // bool remove_posterframe
		);
		if ($result===true) {

			// save To update valor_list
				$this->Save();

			$response->result	= true;
			$response->msg		= 'File deleted successfully. ' . $quality;
		}

		// DES
			// // short vars
			// 	$id					= $this->get_id();
			// 	$file_name			= $this->get_target_filename(); // ex. rsc15_rsc78_45.mp4
			// 	$folder_path_del	= DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $quality . '/deleted';

			// // file_path
			// 	$file_path = ($quality==='original')
			// 			? $this->get_original_file_path($quality)
			// 			: $this->get_path($quality);

			// if(!file_exists($file_path)) {

			// 	$response->msg .= PHP_EOL . 'File not found';
			// 	debug_log(__METHOD__." Error deleting file. File not found: ".to_string($file_path), logger::ERROR);
			// }else{

			// 	try{

			// 		// delete folder. Check exists
			// 			if( !is_dir($folder_path_del) ) {
			// 				$create_dir = mkdir($folder_path_del, 0777,true);
			// 				if(!$create_dir) {
			// 					$response->msg .= PHP_EOL . 'Error on read or create directory "deleted". Permission denied . The files are not deleted';
			// 					return $response;
			// 				}
			// 			}

			// 		// delete folder set permissions
			// 			$wantedPerms	= 0777;
			// 			$actualPerms	= fileperms($folder_path_del);
			// 			if($actualPerms < $wantedPerms) chmod($folder_path_del, $wantedPerms);

			// 		// move / rename file
			// 			$file_base_name	= pathinfo($file_path, PATHINFO_BASENAME); // Like rsc15_rsc78_45.mov._original
			// 			$file_ext		= pathinfo($file_path, PATHINFO_EXTENSION);// Like mov
			// 			$target_name	= $folder_path_del . "/$file_base_name" . '_deleted_' . date("Y-m-dHi") . '.' . $file_ext;
			// 			if(!rename($file_path, $target_name)){
			// 				$response->msg .= PHP_EOL . 'Error on move files to folder "deleted" . Permission denied . The files are not deleted';
			// 				return $response;
			// 			}

			// 		// delete temp sh file
			// 			$tmp_file = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . "/tmp/".$quality.'_'.$id.'.sh';
			// 			if(file_exists($tmp_file)) {
			// 				$del_sh = unlink($tmp_file);
			// 				if(!$del_sh) {
			// 					$response->msg .= PHP_EOL . 'Error on delete temp file . Temp file is not deleted';
			// 					return $response;
			// 				}
			// 			}

			// 		// delete posterframe if media deleted is quality default
			// 			if($quality===DEDALO_AV_QUALITY_DEFAULT) {
			// 				$poster_file = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER ."/posterframe/{$id}.jpg";
			// 				if(file_exists($poster_file)) {
			// 					unlink($poster_file);
			// 				}
			// 			}

			// 		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			// 			logger::$obj['activity']->log_message(
			// 				'DELETE FILE',
			// 				logger::INFO,
			// 				$this->tipo,
			// 				NULL,
			// 				[
			// 					'msg'			=> 'Deleted av file (file is renamed and moved to delete folder)',
			// 					'tipo'			=> $this->tipo,
			// 					'section_tipo'	=> $this->section_tipo,
			// 					'section_id'	=> $this->section_id,
			// 					'top_id'		=> TOP_ID ?? null,
			// 					'top_tipo'		=> TOP_TIPO ?? null,
			// 					'id'		=> $id,
			// 					'quality'		=> $quality
			// 				]
			// 			);

			// 		// response OK
			// 			$response->result	= true;
			// 			$response->msg		= 'File deleted successfully. ' . $file_name;

			// 	} catch (Exception $e) {
			// 		$response->msg .= PHP_EOL . $e->getMessage();
			// 	}
			// }//end if(!file_exists($file))


		return $response;
	}//end delete_file



	/**
	* BUILD_VERSION
	* Creates a new version using FFMEPG conversion using settings based on target quality
	* @param string $quality
	* @return object $response
	*/
	public function build_version(string $quality) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// short vars
			$id				= $this->get_id();
			$source_quality	= $this->get_source_quality_to_build($quality);

		// AVObj
			$AVObj = new AVObj($id, $source_quality);

		// Ffmpeg
			$Ffmpeg				= new Ffmpeg();
			$setting_name		= $Ffmpeg->get_setting_name_from_quality($AVObj, $quality);
			$command_response	= $Ffmpeg->create_av_alternate($AVObj, $setting_name);

		// response
			$response->result			= true;
			$response->msg				= 'Building av file in background';
			$response->command_response	= $command_response;

		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'NEW VERSION',
				logger::INFO,
				$this->tipo,
				NULL,
				[
					'msg'				=> 'Generated av file',
					'tipo'				=> $this->tipo,
					'parent'			=> $this->section_id,
					'top_id'			=> TOP_ID ?? null,
					'top_tipo'			=> TOP_TIPO ?? null,
					'id'				=> $id,
					'quality'			=> $quality,
					'source_quality'	=> $source_quality
				]
			);

		return $response;
	}//end build_version



	/**
	* CONFORM_HEADERS
	* Creates a new version from original in given quality rebuilding headers
	* @param string $quality
	* @return object $response
	*/
	public function conform_headers(string $quality) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// short vars
			$id = $this->get_id();

		// AVObj
			$AVObj = new AVObj($id, $quality);

		// Ffmpeg
			$Ffmpeg				= new Ffmpeg();
			$command_response	= $Ffmpeg->conform_header($AVObj);

		// response
			$response->result			= true;
			$response->msg				= 'Rebuilding av file headers in background';
			$response->command_response	= $command_response;

		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'NEW VERSION',
				logger::INFO,
				$this->tipo,
				NULL,
				[
					'msg'		=> 'conform_header av file',
					'tipo'		=> $this->tipo,
					'parent'	=> $this->section_id,
					'top_id'	=> TOP_ID ?? null,
					'top_tipo'	=> TOP_TIPO ?? null,
					'id'	=> $id,
					'quality'	=> $quality
				]
			);

		return $response;
	}//end conform_headers



	/**
	* CREATE_POSTERFRAME
	* Creates a image 'posterframe' from the default quality of current video file
	*
	* @param float $current_time
	* 	A double-precision floating-point value indicating the current playback time in seconds.
	* 	From HML5 video element command 'currentTime'
	* @param string | null $quality
	* @param array | string $ar_target
	* 	Optional array value with forced target destination path and file name
	* @return string $command_response
	* 	FFMPEG terminal command response
	*/
	public function create_posterframe($current_time, $target_quality=null, $ar_target=null) {

		$reelID		= $this->get_id();
		$quality	= $target_quality ?? $this->get_quality_default();

		# AVObj
		$AVObj = new AVObj($reelID, $quality);

		# Ffmpeg
		$Ffmpeg				= new Ffmpeg();
		$command_response	= $Ffmpeg->create_posterframe($AVObj, $current_time, $ar_target);

		return $command_response;
	}//end create_posterframe



	/**
	* DELETE_POSTERFRAME
	* 	Remove the file 'posterframe' from the disk
	* @return bool
	*/
	public function delete_posterframe() : bool {

		$name	= $this->get_id();
		$file	= DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . '/posterframe/' . $name . '.' . DEDALO_AV_POSTERFRAME_EXTENSION;

		// check file already exists
			if(!file_exists($file)) {
				debug_log(__METHOD__." Posterframe file do not exists ".to_string($file), logger::DEBUG);
				return false;
			}

		 // delete file
			if(!unlink($file)) {
				debug_log(__METHOD__."  Error on delete posterframe file. Posterframe file is not deleted ".to_string(), logger::ERROR);
				return false;
			}


		return true;
	}//end delete_posterframe



	/**
	* GET_MEDIA_ATTRIBUTES
	* Read file and get attributes using Ffmpeg
	* @param string $file_path
	* @return object|null $media_attributes
	*/
	public function get_media_attributes(string $file_path) : ?object {

		$media_attributes = Ffmpeg::get_media_attributes($file_path);

		return $media_attributes;
	}//end get_media_attributes



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version	= null;
			$options->dato_unchanged	= null;
			$options->reference_id		= null;
			$options->tipo				= null;
			$options->section_id		= null;
			$options->section_tipo		= null;
			$options->context			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		// short vars
			$update_version	= implode('.', $options->update_version);
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;

		switch ($update_version) {

			case '6.0.0':
				$is_old_dato = (
					empty($dato_unchanged) || // v5 early case
					isset($dato_unchanged->section_id) || // v5 modern case
					(isset($dato_unchanged[0]) && isset($dato_unchanged[0]->original_file_name)) // v6 alpha case
				);
				// $is_old_dato = true; // force
				if ($is_old_dato===true) {

					// note that old dato could be a locator object as:
						// {
						// 	"section_id": "54",
						// 	"section_tipo": "test38",
						// 	"component_tipo": "test207"
						// }

					// create the component av
						$model		= RecordObj_dd::get_modelo_name_by_tipo($options->tipo,true);
						$component	= component_common::get_instance(
							$model, // string 'component_av'
							$options->tipo,
							$options->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$options->section_tipo
						);

					// get existing files data
						$file_name			= $component->get_id();
						$source_quality		= $component->get_original_quality();
						$additional_path	= $component->get_additional_path();
						$initial_media_path	= $component->get_initial_media_path();
						$original_extension	= $component->get_original_extension(
							false // bool exclude_converted
						) ?? $component->get_extension();

						$base_path	= DEDALO_AV_FOLDER  . $initial_media_path . '/' . $source_quality . $additional_path;
						$file		= DEDALO_MEDIA_PATH . $base_path . '/' . $file_name . '.' . $original_extension;

						// no original file found. Use default quality file
							if(!file_exists($file)) {
								// use default quality as original
								$source_quality	= $component->get_default_quality();
								$base_path		= DEDALO_AV_FOLDER  . $initial_media_path . '/' . $source_quality . $additional_path;
								$file			= DEDALO_MEDIA_PATH . $base_path . '/' . $file_name . '.' . $component->get_extension();
							}
							// try again
							if(!file_exists($file)) {
								// reset bad dato
								$response = new stdClass();
									$response->result	= 1;
									$response->new_dato	= null;
									$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string(null).".<br />";
								// $response = new stdClass();
								// 	$response->result	= 2;
								// 	$response->msg		= "[$reference_id] Current dato don't need update. No files found (original,default)<br />";	// to_string($dato_unchanged)."
								return $response;
							}

					// source_file_upload_date
						$dd_date							= new dd_date();
						$upload_date_timestamp				= date ("Y-m-d H:i:s", filemtime($file));
						$source_file_upload_date			= $dd_date->get_date_from_timestamp($upload_date_timestamp);
						$source_file_upload_date->time		= dd_date::convert_date_to_seconds($source_file_upload_date);
						$source_file_upload_date->timestamp	= $upload_date_timestamp;

					// get the original file name
						$source_file_name = pathinfo($file)['basename'];

					// lib_data
						$lib_data = null;

					// get files info
						$files_info	= [];
						$ar_quality = DEDALO_AV_AR_QUALITY;
						foreach ($ar_quality as $current_quality) {
							if ($current_quality==='thumb') continue;
							// read file if exists to get file_info
							$file_info = $component->get_quality_file_info($current_quality);
							// add non empty quality files data
							if (!empty($file_info)) {
								// Note that source_quality could be original or default
								if ($current_quality===$source_quality) {
									$file_info->upload_info = (object)[
										'file_name'	=> $source_file_name ?? null,
										'date'		=> $source_file_upload_date ?? null,
										'user'		=> null // unknown here
									];
								}
								// add
								$files_info[] = $file_info;
							}
						}

					// create new dato
						$dato_item = new stdClass();
							$dato_item->files_info	= $files_info;
							$dato_item->lib_data	= $lib_data;

					// fix final dato with new format as array
						$new_dato = [$dato_item];
						debug_log(__METHOD__." update_version new_dato ".to_string($new_dato), logger::DEBUG);

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_dato_version



}//end class component_av
