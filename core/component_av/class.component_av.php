<?php
declare(strict_types=1);
/**
* CLASS COMPONENT_AV
*
*/
class component_av extends component_media_common implements component_media_interface {



	/**
	* CLASS VARS
	*/
		// string id .file name formatted as 'tipo'-'order_id' like dd732-1
		// public $video_url;



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
	* GET_DEFAULT_QUALITY
	* @return string $default_quality
	*/
	public function get_default_quality() : string {

		$default_quality = DEDALO_AV_QUALITY_DEFAULT;

		return $default_quality;
	}//end get_default_quality



	/**
	* GET_ORIGINAL_QUALITY
	* @return string $original_quality
	*/
	public function get_original_quality() : string {

		$original_quality = DEDALO_AV_QUALITY_ORIGINAL;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_EXTENSION
	* @return string DEDALO_AV_EXTENSION from config
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_AV_EXTENSION;
	}//end get_extension



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_AV_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_FOLDER
	* 	Get element dir from config
	* @return string
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_AV_FOLDER;
	}//end get_folder



	/**
	* GET_BEST_EXTENSIONS
	* Extensions list of preferable extensions in original or modified qualities.
	* Ordered by most preferable extension, first is the best.
	* @return array
	*/
	public function get_best_extensions() : array {

		if(!defined('DEDALO_AV_BEST_EXTENSIONS')){
			define('DEDALO_AV_BEST_EXTENSIONS', ['mov']);
		}

		return DEDALO_AV_BEST_EXTENSIONS;
	}//end get_best_extensions




	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $grid_cell_object
	*/
	public function get_grid_value(?object $ddo=null) : dd_grid_cell_object {

		// column_obj
			$column_obj = isset($this->column_obj)
				? $this->column_obj
				: (object)[
					'id' => $this->section_tipo.'_'.$this->tipo
				  ];

		// quality
			$quality = $this->get_default_quality();

		// dato
			$dato = $this->get_dato();
			if(isset($dato)){

				$current_url = ($this->mode==='edit')
					? $this->get_url($quality)
					: $this->get_posterframe_url();

			}else{
				$current_url = '';
			}

		// data item
			// $item  = new stdClass();
			// 	$item->posterframe_url = $this->get_posterframe_url(
			// 		true, // bool test_file
			// 		false, // bool absolute
			// 		false // bool avoid_cache
			// 	);
			// 	$item->url = $this->quality_file_exist( $quality )
			// 		? $this->get_url()
			// 		: null;

		// label
			$label = $this->get_label();

		// value
			$grid_cell_object = new dd_grid_cell_object();
				$grid_cell_object->set_type('column');
				$grid_cell_object->set_label($label);
				$grid_cell_object->set_ar_columns_obj([$column_obj]);
				$grid_cell_object->set_cell_type('img');
				$grid_cell_object->set_value([$current_url]);


		return $grid_cell_object;
	}//end get_grid_value



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string|null $valor_export
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) : ?string {

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
	* GET_POSTERFRAME_FILE_NAME
	*  like 'rsc35_rsc167_1.jpg'
	* @return string $posterframe_file_name;
	*/
	public function get_posterframe_file_name() : string {

		$posterframe_file_name = $this->get_id() .'.'. DEDALO_AV_POSTERFRAME_EXTENSION;

		return $posterframe_file_name;
	}//end get_posterframe_file_name



	/**
	* GET_POSTERFRAME_FILEPATH
	* Get full file path
	* @return string $posterframe_filepath
	*/
	public function get_posterframe_filepath() : string {

		$file_name			= $this->get_posterframe_file_name();
		$folder				= $this->get_folder(); // like DEDALO_AV_FOLDER
		$additional_path	= $this->additional_path;

		$posterframe_filepath = DEDALO_MEDIA_PATH . $folder .'/posterframe'. $additional_path .'/'. $file_name;


		return $posterframe_filepath;
	}//end get_posterframe_filepath



	/**
	* GET_POSTERFRAME_URL
	* @param bool $test_file = true
	* @param bool $absolute = false
	* @param bool $avoid_cache = false
	* @return string $posterframe_url
	*/
	public function get_posterframe_url(bool $test_file=false, bool $absolute=false, bool $avoid_cache=false) : string {

		$folder				= $this->get_folder(); // like DEDALO_AV_FOLDER
		$file_name			= $this->get_posterframe_file_name();
		$additional_path	= $this->additional_path;

		$posterframe_url = DEDALO_MEDIA_URL . $folder .'/posterframe'. $additional_path .'/'. $file_name;

		// FILE EXISTS TEST : If not, show '0' dedalo image logo
		if ($test_file===true) {
			// $file = DEDALO_MEDIA_PATH . $folder .'/posterframe'. $additional_path .'/'. $file_name;
			$file = $this->get_posterframe_filepath();
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
	* CREATE_POSTERFRAME
	* Creates a image 'posterframe' from the default quality of current video file
	*
	* @param string|float $current_time
	* 	A double-precision floating-point value indicating the current playback time in seconds.
	* 	From HML5 video element command 'currentTime'
	* @param string|null $quality
	* 	Optional string like 'original'. if not defined, default is used
	* @return bool $command_response
	* 	FFMPEG terminal command response
	*/
	public function create_posterframe(string|float $current_time, string $target_quality=null) : bool {

		// short vars
			$quality				= $target_quality ?? $this->get_original_quality();
			$src_file				= $this->get_media_filepath($quality);
			$posterframe_filepath	= $this->get_posterframe_filepath();

		// check source file
			if (!file_exists($src_file)) {

				if ($quality!==$this->get_default_quality()) {
					// try with quality_default
					$quality	= $this->get_default_quality();
					$src_file	= $this->get_media_filepath($quality);
				}

				if (!file_exists($src_file)) {
					debug_log(__METHOD__
						. " Invalid source path. Unable to create posterframe " . PHP_EOL
						. ' src_file: ' 		. to_string($src_file) . PHP_EOL
						. ' target_quality: ' 	. to_string($target_quality)
						, logger::ERROR
					);
					return false;
				}
			}

		// file
			// $bytes		= filesize($src_file);
			// $mega_bytes	= number_format($bytes / 1048576, 2);
			// if ($mega_bytes>1000) {
			// 	debug_log(__METHOD__
			// 		. " Trying to create a posterframe from large archive ($mega_bytes MB)" . PHP_EOL
			// 		, logger::WARNING
			// 	);
			// }

		$Ffmpeg	= new Ffmpeg();
		$command_response = $Ffmpeg->create_posterframe((object)[
			'timecode'				=> $current_time, // like '00:00:10',
			'src_file'				=> $src_file,
			'quality'				=> $quality,
			'posterframe_filepath'	=> $posterframe_filepath
		]);


		return $command_response;
	}//end create_posterframe



	/**
	* DELETE_POSTERFRAME
	* 	Remove the file 'posterframe' from the disk
	* @return bool
	*/
	public function delete_posterframe() : bool {

		$file = $this->get_posterframe_filepath();

		// check file already exists
			if(!file_exists($file)) {
				debug_log(__METHOD__
					." Ignored delete posterframe. File do not exists: ".to_string($file)
					, logger::DEBUG
				);
				return false;
			}

		 // delete file
			if(!unlink($file)) {
				debug_log(__METHOD__
					."  Error on delete posterframe file. Posterframe file is not deleted " . PHP_EOL
					. ' file: ' . $file
					, logger::ERROR
				);
				return false;
			}


		return true;
	}//end delete_posterframe



	/**
	* CREATE_THUMB
	*
	* OSX Brew problem: [source: http://www.imagemagick.org/discourse-server/viewtopic.php?t=29096]
	* Looks like the issue is that because the PATH variable is not necessarily available to Apache, IM does not actually know where Ghostscript is located.
	* So I modified my delegates.xml file, which in my case is located in [i]/usr/local/Cellar/imagemagick/6.9.3-0_1/etc/ImageMagick-6/delegates.xml[/] and replaced
	* command="&quot;gs&quot;
	* with
	* command="&quot;/usr/local/bin/gs&quot;
	* @return bool
	*/
	public function create_thumb() : bool {

		// check config constant definition
			if (!defined('DEDALO_QUALITY_THUMB')) {
				define('DEDALO_QUALITY_THUMB', 'thumb');
				debug_log(__METHOD__
					." Undefined config 'DEDALO_QUALITY_THUMB'. Using fallback 'thumb' value"
					, logger::WARNING
				);
			}

		// thumb_path
			$thumb_quality		= $this->get_thumb_quality();
			$thumb_extension	= $this->get_thumb_extension();
			$target_file		= $this->get_media_filepath($thumb_quality, $thumb_extension);

		// thumb not exists case: generate from posterframe
			$posterframe = $this->get_posterframe_filepath();
			if (!file_exists($posterframe)) {

				// try to create an automatic posterframe at 5 second
				$this->create_posterframe(5);

				if (!file_exists($posterframe)) {
					debug_log(__METHOD__
						." posterframe file doesn't exists, it is not possible to create a thumb"
						, logger::WARNING
					);
					return false;
				}
			}

		// thumb generate
			ImageMagick::dd_thumb(
				$posterframe, // source file
				$target_file, // thumb file
			);


		return true;
	}//end create_thumb



	/**
	* GET_SUBTITLES_PATH
	* @param string $lang = DEDALO_DATA_LANG
	* @return string $subtitles_path
	*/
	public function get_subtitles_path( string $lang=DEDALO_DATA_LANG ) : string  {

		$folder = $this->get_folder(); // like DEDALO_AV_FOLDER

		$subtitles_path = DEDALO_MEDIA_PATH . $folder . DEDALO_SUBTITLES_FOLDER.'/'. $this->get_id().'_'.$lang.'.'.DEDALO_AV_SUBTITLES_EXTENSION;

		return $subtitles_path;
	}//end get_subtitles_path



	/**
	* GET_SUBTITLES_URL
	* @param string $lang = DEDALO_DATA_LANG
	* @return string $subtitles_url
	*/
	public function get_subtitles_url( string $lang=DEDALO_DATA_LANG ) : string {

		$folder = $this->get_folder(); // like DEDALO_AV_FOLDER

		$subtitles_url = DEDALO_MEDIA_URL . $folder . DEDALO_SUBTITLES_FOLDER. '/'. $this->get_id().'_'.$lang .'.'.DEDALO_AV_SUBTITLES_EXTENSION;

		return $subtitles_url;
	}//end get_subtitles_url



	/**
	* GET_ORIGINAL_FILE_PATH
	* Returns the full path of the original file (with no default extension) if exists
	* If a file with an extension other than DEDALO_xxx_EXTENSION is uploaded, it is converted to DEDALO_xxx_EXTENSION.
	* The original files are saved renamed but keeping the ending. This function is used to locate them by checking if
	* there is more than one.
	* @param string $quality
	* @return string|null $result
	*/
		// public function get_original_file_path(string $quality) : ?string {

		// 	$result = null;

		// 	// store initial_quality
		// 		// $initial_quality = $this->get_quality();

		// 	// quality. Changes current component quality temporally
		// 		// $this->set_quality($quality);

		// 	// directory do not exists case
		// 		$target_dir = $this->get_media_path_dir($quality);
		// 		if( !file_exists($target_dir) ) {
		// 			debug_log(__METHOD__.
		// 				" Directory '$target_dir' do not exists !. quality: ".to_string($quality),
		// 				logger::WARNING
		// 			);
		// 			return null;
		// 		}

		// 	// ar_originals
		// 		$ar_originals	= [];
		// 		$findme			= $this->get_id() . '.';
		// 		if ($handle = opendir($target_dir)) {

		// 			while (false !== ($file = readdir($handle))) {

		// 				// is dir case (DVD files)
		// 				if($this->get_id() == $file && is_dir($target_dir.'/'.$file)){

		// 					// DES
		// 						// $dvd_folder = $target_dir.'/'.$file;
		// 						// # dvd_folder dir set permissions 0777

		// 						// $stat = stat($dvd_folder);
		// 						// 	//dump($stat['uid'], ' stat: '.posix_geteuid() ) ; die();

		// 						// if(posix_geteuid() != $stat['uid']){
		// 						// 	chown($dvd_folder, posix_geteuid());
		// 						// }

		// 						// $wantedPerms = 0777;
		// 						// $actualPerms = fileperms($dvd_folder);
		// 						// if($actualPerms < $wantedPerms) {
		// 						// 	$chmod = chmod($dvd_folder, $wantedPerms);
		// 						// 	if(!$chmod) die(" Sorry. Error on set valid permissions to directory for \"$dvd_folder\".  ") ;
		// 						// }

		// 					$ar_originals[] = $file;
		// 					continue;
		// 				}

		// 				// note that '.' and '..' is returned even
		// 				if( strpos($file, $findme)!==false ) {
		// 					$ar_originals[] = $file;
		// 				}
		// 			}
		// 			closedir($handle);
		// 		}

		// 	$n = count($ar_originals);
		// 	if ($n===0) {
		// 		// nothing found case
		// 	}elseif($n===1) {
		// 		// OK. File found
		// 		#$path = $_FILES['image']['name'];
		// 		#$ext = pathinfo($ar_originals[0], PATHINFO_EXTENSION);
		// 		$result = $target_dir.'/'.$ar_originals[0];
		// 	}else{
		// 		// Error. More than one original found
		// 			debug_log(__METHOD__
		// 				." ERROR (DEBUG ONLY): Current quality have more than one file." . PHP_EOL
		// 				.' ar_originals: ' . to_string($ar_originals)
		// 				, logger::ERROR
		// 			);
		// 			if(SHOW_DEBUG===true) {
		// 				dump($ar_originals, "ar_originals ++++++++++++++++++ ".to_string($ar_originals));
		// 			}
		// 	}

		// 	// restore component quality
		// 		// $this->set_quality($initial_quality);


		// 	return $result;
		// }//end get_original_file_path



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
				$filename = $this->get_media_filepath($quality);
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
			$path				= $this->get_media_filepath($quality);
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


		return (float)$duration;
	}//end get_duration



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

		// ar_quality
			if (empty($ar_quality)) {
				$ar_quality = $this->get_ar_quality();
			}

		// files remove
			$result = parent::remove_component_media_files($ar_quality);
			// des
				// foreach ($ar_quality as $current_quality) {

				// 	// media_path
				// 		$media_path = $this->get_video_path($current_quality);
				// 		if (!file_exists($media_path)) continue; # Skip

				// 	// delete dir
				// 		$folder_path_del = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $current_quality . '/deleted';
				// 		if( !is_dir($folder_path_del) ) {
				// 			$create_dir = mkdir($folder_path_del, 0777, true);
				// 			if(!$create_dir) {
				// 				debug_log(__METHOD__." Error on read or create directory \"deleted\". Permission denied. ".to_string($folder_path_del), logger::ERROR);
				// 				return false;
				// 			}
				// 		}

				// 	// move/rename file
				// 		$reelID				= $this->get_id();
				// 		$media_path_moved	= $folder_path_del . "/$reelID" . '_deleted_' . $date . '.' . $this->get_extension();
				// 		if( !rename($media_path, $media_path_moved) ) {
				// 			debug_log(__METHOD__." Error on move files to folder \"deleted\" . Permission denied . The files are not deleted ".to_string($media_path_moved), logger::ERROR);
				// 			return false;
				// 		}

				// 	debug_log(__METHOD__." Moved file \n$media_path to \n$media_path_moved ", logger::DEBUG);
				// }//end foreach ($ar_quality as $current_quality)

		// posterframe remove (default is true)
			if ($remove_posterframe===true) {

				$media_path = $this->get_posterframe_filepath();
				if (file_exists($media_path)) {

					$folder				= $this->get_folder(); // like DEDALO_AV_FOLDER
					$additional_path	= $this->additional_path;

					// delete dir
						$folder_path_del = DEDALO_MEDIA_PATH . $folder . '/posterframe' . $additional_path . '/deleted';
						if( !is_dir($folder_path_del) ) {
							$create_dir = mkdir($folder_path_del, 0775, true);
							if(!$create_dir) {
								debug_log(__METHOD__
									." Error on read or create directory \"deleted\". Permission denied ".to_string($folder_path_del)
									, logger::ERROR
								);
								return false;
							}
						}

					// date now
						$date = date("Y-m-d_Hi");

					// move/rename file
						$id					= $this->get_id();
						$media_path_moved	= $folder_path_del . "/$id" . '_deleted_' . $date . '.' . DEDALO_AV_POSTERFRAME_EXTENSION;
						if( !rename($media_path, $media_path_moved) ) {
							debug_log(__METHOD__
								. " Error on move files (posterframe) to folder \"deleted\" . Permission denied . The files are not deleted " . PHP_EOL
								. ' source (media_path): '. $media_path . PHP_EOL
								. ' target (media_path_moved): '. $media_path_moved
								, logger::ERROR
							);
							return false;
						}

					debug_log(__METHOD__
						." Moved file \n$media_path to \n$media_path_moved "
						, logger::DEBUG
					);
				}
			}//end if ($remove_posterframe===true)


		return $result;
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
			parent::restore_component_media_files();

		// posterframe restore
			$posterframe_filepath	= $this->get_posterframe_filepath();
			$media_path			= pathinfo($posterframe_filepath, PATHINFO_DIRNAME).'/deleted';
			$id					= $this->get_id();
			$file_pattern		= $media_path.'/'.$id.'_*.'.DEDALO_AV_POSTERFRAME_EXTENSION;
			$ar_files			= glob($file_pattern);
			if (empty($ar_files)) {

				debug_log(__METHOD__
					." No files to restore were found for posterframe:$id. Nothing was restored (3)"
					, logger::WARNING
				);

			}else{

				natsort($ar_files);	// sort the files from newest to oldest
				$last_file_path	= end($ar_files);
				$new_file_path	= $this->get_posterframe_filepath();
				if( !rename($last_file_path, $new_file_path) ) {
					// throw new Exception(" Error on move files to restore folder. Permission denied to restore posterframe. Nothing was restored (4)");
					debug_log(__METHOD__
						." Error on move files to restore folder. Permission denied to restore posterframe. Nothing was restored (4) " .PHP_EOL
						.' last_file_path: ' . to_string($last_file_path) . PHP_EOL
						.' new_file_path: ' . to_string($new_file_path)
						, logger::ERROR
					);
				}

				debug_log(__METHOD__
					." Moved file \n$last_file_path to \n$new_file_path "
					, logger::DEBUG
				);
			}


		return true;
	}//end restore_component_media_files



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
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// check vars
			if (empty($tmp_name) || empty($folder_path) || empty($file_name)) {
				$response->msg .= 'Too few arguments. All params are mandatory';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' tmp_name: ' . $tmp_name . PHP_EOL
					. ' folder_path: ' . $folder_path . PHP_EOL
					. ' file_name: ' . $file_name
					, logger::ERROR
				);
				return $response;
			}

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
	* PROCESS_UPLOADED_FILE
	* Note that this is the last method called in a sequence started on upload file.
	* The sequence order is:
	* 	1 - dd_utils_api::upload
	* 	2 - tool_upload::process_uploaded_file
	* 	3 - component_media_common::add_file
	* 	4 - component:process_uploaded_file
	* The target quality is defined by the component quality set in tool_upload::process_uploaded_file
	* @param object $file_data
	*	Data from trigger upload file
	* 	Format:
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

		// check vars
			if (empty($file_data->original_file_name) ||
				empty($file_data->full_file_path) ||
				empty($file_data->full_file_name)
			) {
				debug_log(__METHOD__
					. " Not enough file_data variables " . PHP_EOL
					. ' file_data: ' . to_string($file_data)
					, logger::ERROR
				);
				$response->msg .= 'Not enough file_data variables';
				return $response;
			}

		// short vars
			$original_file_name			= $file_data->original_file_name;	// kike "my video785.mp4"
			$full_file_path				= $file_data->full_file_path;		// like "/mypath/media/av/404/test175_test65_1.mp4"
			$full_file_name				= $file_data->full_file_name;		// like "test175_test65_1.mp4"
			$original_normalized_name	= $full_file_name;

		// check full_file_path
			if (!file_exists($full_file_path)) {
				$response->msg .= ' File full_file_path do not exists';
				return $response;
			}

		// debug
			debug_log(__METHOD__
				. " process_uploaded_file " . PHP_EOL
				. ' original_file_name: ' . $original_file_name .PHP_EOL
				. ' full_file_path: ' . $full_file_path
				, logger::WARNING
			);

		try {

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
					// throw new Exception("Error Processing Request. Invalid id: ".to_string($id), 1);
					$response->msg .= ' Error: id is empty. Unable to get component id ';
					debug_log(__METHOD__
						. $response->msg
						, logger::DEBUG
					);
					return $response;
				}

			// quality default in upload is 'original' (!)
				$quality			= $this->get_quality();
				$quality_default	= $this->get_default_quality();

			// audio case
			if ($quality==='audio') {

				// audio extensions supported
				$ar_audio_only_ext = array('mp3','aiff','aif','wave','wav');
				if (in_array($file_ext, $ar_audio_only_ext)) {
					// Audio conversion
					// output_file_path is the final target file
					$output_file_path	= $this->get_media_filepath($quality);
					// uploaded_file_path is the current uploaded file path
					$uploaded_file_path	= $full_file_path;
					Ffmpeg::convert_audio( (object)[
						'output_file_path'		=> $output_file_path,
						'uploaded_file_path'	=> $uploaded_file_path
					]);
				}else{
					$response->msg .= " Error Processing Request. Current audio extension [$file_ext] is not supported (q:$quality)";
					debug_log(__METHOD__
						. $response->msg . PHP_EOL
						. ' audio extensions allowed: ' . to_string($ar_audio_only_ext)
						, logger::ERROR
					);
					return $response;
				}

			// video case
			}else{

				// dedalo_av_recompress_all
				// When config DEDALO_AV_RECOMPRESS_ALL is set to 1, all video files are
				// re-compressed to 960k/s variable bit rate and keyframe every 75 frames
					if (defined('DEDALO_AV_RECOMPRESS_ALL') && DEDALO_AV_RECOMPRESS_ALL===1) {

						debug_log(__METHOD__
							." RECOMPRESSING AV FROM '$quality' PLEASE WAIT.. "
							, logger::DEBUG
						);

						// If default quality file do not exists, generate default quality version now
						$default_quality				= $this->get_default_quality();
						$quality_default_target_file	= $this->get_media_filepath($default_quality);

						// if ( !file_exists($quality_default_target_file) ) {
							$source_file = $full_file_path; // actually full original path and name
							if ( !file_exists($source_file) ) {
								// error. unable to convert
								debug_log(__METHOD__
									." ERROR: Source file do not exists! Ignored conversion to default_quality ($default_quality) ". PHP_EOL
									.' source_file: ' . $source_file
									, logger::ERROR
								);
							}else{

								// target directory check
								$target_dir = dirname($quality_default_target_file);
								if (!is_dir($target_dir)) {
									if(!mkdir($target_dir, 0750, true)) {
										debug_log(__METHOD__
											.' Error creating directory: ' . PHP_EOL
											.' target_dir: ' . $target_dir
											, logger::ERROR
										);
										$response->msg .= ' Error creating directory';
										debug_log(__METHOD__
											. ' '.$response->msg
											, logger::ERROR
										);
										return $response;
									}
								}

								$setting_name			= Ffmpeg::get_setting_name($source_file, $quality_default);
								$target_file_path		= $this->get_media_filepath($quality_default);
								$av_alternate_response	= Ffmpeg::build_av_alternate_command((object)[
									'setting_name'		=> $setting_name,
									'source_file_path'	=> $source_file,
									'target_file_path'	=> $target_file_path
								]);

								if ($av_alternate_response->result===true) {

									// execute the command to convert with ffmpeg
									exec("$av_alternate_response->command  > /dev/null &");

									// posterframe. Create posterframe of current video
									$this->create_posterframe(
										'00:00:10',
										$quality_default // 404 normally
									);

									// thumb. Create thumb from posterframe
									$this->create_thumb();

								}else{
									$msg = ' Error Processing Request. build_av_alternate_command fails. ' . to_string($av_alternate_response->msg);
									debug_log(__METHOD__.$msg, logger::ERROR);
									$response->msg .= $msg;
									return $response;
								}
							}
						// }else{
						// 	debug_log(__METHOD__
						// 		." WARNING: Ignored conversion to default quality (".$quality_default."). File already exists"
						// 		, logger::WARNING
						// 	);
						// }//end if (!file_exists($target_file)) {
					}//end if (defined('DEDALO_AV_RECOMPRESS_ALL') && DEDALO_AV_RECOMPRESS_ALL==1)

			}//end if ($quality=='audio') {


			// audio files. Audio files always generate an audio file
				$ar_audio_only_ext = array('mp3','aiff','aif','wave','wav');
				if (in_array($file_ext, $ar_audio_only_ext) && $quality===DEDALO_AV_QUALITY_ORIGINAL) {

					// Audio conversion
					$target_file = $this->get_media_filepath($quality);
					// if ( !file_exists($target_file) ) {
						$source_file = $full_file_path;
						if (!file_exists($source_file)) {
							debug_log(__METHOD__
								." ERROR converting to audio file: Source file do not exists (2) " . PHP_EOL
								.' source_file:' . to_string($source_file)
								, logger::ERROR
							);
						}
						Ffmpeg::convert_to_dedalo_av(
							$source_file,
							$target_file
						);

						debug_log(__METHOD__
							." Converted source audio file from 'original' to 'audio' quality "
							, logger::DEBUG
						);
					// }//end if (!file_exists($target_file))
				}

			// properties
				$properties = $this->get_properties();

			// target_filename. Save original file name in a component_input_text
				if (isset($properties->target_filename)) {

					$model_name_target_filename	= RecordObj_dd::get_modelo_name_by_tipo($properties->target_filename, true);
					$component_target_filename	= component_common::get_instance(
						$model_name_target_filename, // model
						$properties->target_filename, // tipo
						$this->get_section_id(), // section_id
						'edit', // mode
						DEDALO_DATA_NOLAN, // lang
						$this->get_section_tipo(), // section_tipo
						false
					);
					$component_target_filename->set_dato($original_file_name);
					$component_target_filename->Save();
					debug_log(__METHOD__.
						' Saved original filename to '.$properties->target_filename.' : '.to_string($original_file_name)
						, logger::DEBUG
					);
				}

			// target_duration. Save duration (time-code) in a component_input_text, usually to 'rsc54'
				if (isset($properties->target_duration)) {

					$model_name_target_duration	= RecordObj_dd::get_modelo_name_by_tipo($properties->target_duration, true);
					$component_target_duration	= component_common::get_instance(
						$model_name_target_duration, // model
						$properties->target_duration, // tipo
						$this->get_section_id(), // section_id
						'edit', // mode
						DEDALO_DATA_NOLAN, // lang
						$this->get_section_tipo(), // section_tipo
						false
					);
					$secs		= $this->get_duration($quality); // float secs
					$duration	= OptimizeTC::seg2tc($secs); // string TimeCode as '00:05:20:125'
					$component_target_duration->set_dato([$duration]);
					$component_target_duration->Save();
					debug_log(__METHOD__.
						' Saved av duration to '.$properties->target_duration.' : '.to_string($duration).' - secs: '.to_string($secs)
						, logger::DEBUG
					);
				}

			// upload info
				$original_quality = $this->get_original_quality();
				if ($this->quality===$original_quality) {
					// update upload file info
					$dato = $this->get_dato();

					$key = 0;
					if (!isset($dato[$key]) || !is_object($dato[$key])) {
						$dato[$key] = new stdClass();
					}
					$dato[$key]->original_file_name			= $original_file_name;
					$dato[$key]->original_normalized_name	= $original_normalized_name;
					$dato[$key]->original_upload_date		= component_date::get_date_now();

					$this->set_dato($dato);
				}

			// save component dato
				// Note that save action don't change upload info properties,
				// but force updates every quality file info in property 'files_info
				$this->Save();

			// all is OK
				$response->result	= true;
				$response->msg		= 'OK. Request done ['.__METHOD__.'] ';

		} catch (Exception $e) {
			$msg = 'Exception[process_uploaded_file][ImageMagick]: ' .  $e->getMessage() . "\n";
			debug_log(__METHOD__
				." $msg "
				, logger::ERROR
			);
			$response->msg .= ' - '.$msg;
		}


		return $response;
	}//end process_uploaded_file



	/**
	* GET_MEDIA_STREAMS
	* Check the file to get the head streams of the video file
	* @param string $quality
	* @return object|null $media_streams
	*/
	public function get_media_streams(string $quality) : ?object {

		// get the video file path
			$file_path = $this->get_media_filepath($quality);

		// get_media_streams from av file
			$media_streams = Ffmpeg::get_media_streams($file_path);


		return $media_streams;
	}//end get_media_streams



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
			$response->errors	= [];

		// check quality
			$ar_quality = $this->get_ar_quality();
			if (!in_array($quality, $ar_quality)) {
				$response->msg .= ' Invalid quality. Ignored action';
				$response->errors[] = 'invalid quality';
				return $response;
			}

		// remove_component_media_files returns bool value
		$result = $this->remove_component_media_files(
			[$quality], // array ar_quality
			false // bool remove_posterframe
		);
		if ($result===true) {

			// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
				logger::$obj['activity']->log_message(
					'DELETE FILE',
					logger::INFO,
					$this->tipo,
					NULL,
					[
						'msg'		=> 'Deleted media file (file is renamed and moved to delete folder)',
						'tipo'		=> $this->tipo,
						'parent'	=> $this->section_id,
						'id'		=> $this->id,
						'quality'	=> $quality
					]
				);

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
			// 			: $this->get_media_filepath($quality);

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
	* @param bool $async = true
	* @return object $response
	*/
	public function build_version(string $quality, bool $async=true, bool $save=true) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// thumb case
			if($quality===$this->get_thumb_quality()){

				$return = $this->create_thumb();

				if($return===false){
					$response->msg .= ' Is not possible create thumb';
					$response->errors[] = 'building thumb failed';
					return $response;
				}

				// update component dato files info and save
					$this->Save();

				$response->result	= true;
				$response->msg		= 'Thumb file built';
				return $response;
			}

		// short vars
			$id				= $this->get_id();
			$source_quality	= $this->get_source_quality_to_build($quality);
			if (empty($source_quality)) {
				$response->msg .= ' Invalid source_quality';
				$response->errors[] = 'invalid source_quality';
				return $response;
			}

		// build_av_alternate_command. Creates the command and the sh file to run
			$source_file_path = $this->get_original_file_path($source_quality);
			if (!file_exists($source_file_path)) {
				debug_log(__METHOD__
					. " original file do not exists. Falling back to default quality " . PHP_EOL
					. ' original_file_path: ' . $source_file_path
					, logger::ERROR
				);
				// fallback to default quality
				$source_quality		= $this->get_default_quality(); // overwrite
				$source_file_path	= $this->get_media_filepath($source_quality); // overwrite
			}
			if (!file_exists($source_file_path)) {
				$response->msg .= ' Invalid source_file_path';
				$response->errors[] = 'invalid source_file_path';
				return $response;
			}
			$setting_name			= Ffmpeg::get_setting_name($source_file_path, $quality);
			$target_file_path		= $this->get_media_filepath($quality);
			$av_alternate_response	= Ffmpeg::build_av_alternate_command((object)[
				'setting_name'		=> $setting_name,
				'source_file_path'	=> $source_file_path,
				'target_file_path'	=> $target_file_path
			]);
			// check false case
			if (isset($av_alternate_response->result) && $av_alternate_response->result===false) {
				debug_log(__METHOD__
					. " Error on Ffmpeg->build_av_alternate_command " . PHP_EOL
					. ' setting_name: ' .$setting_name
					. ' av_alternate_response: ' . to_string($av_alternate_response)
					, logger::ERROR
				);
				$response->msg .= ' ' . ($av_alternate_response->msg ?? 'Unknown error');
				$response->errors[] = 'building alternate failed';
				return $response;
			}

		// run sh_file
			if($async==false){

				// exec command and wait
				$command = $av_alternate_response->command;

				debug_log(__METHOD__
					. " Building av file. Wait to finish please " . PHP_EOL
					. ' command: ' . $command
					, logger::DEBUG
				);

				$command_response  = shell_exec( $command );

				// update component dato files info and save
					$this->Save();

			}else{

				// launch a background process
				$sh_file	= $av_alternate_response->sh_file;
				$PID		= exec_::exec_sh_file($sh_file);

				// $command		= 'nohup '. $av_alternate_response->command .' > /dev/null 2>&1 & echo $!';
				// $new_process	= new process($command);
				// $PID			= $new_process->getPid();

				debug_log(__METHOD__
					. " Building av file in background " . PHP_EOL
					. ' PID: ' . $PID
					, logger::DEBUG
				);

				// update component dato files info and save
					// $this->Save(); // delayed (!)
					// (!) Do not update here because process continues in background and
					// a save action 'force_save' will be called from client from tool_media_versions
					// when the new file is available (background process finish)
			}

		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
			logger::$obj['activity']->log_message(
				'NEW VERSION',
				logger::INFO,
				$this->tipo,
				NULL,
				[
					'msg'				=> 'Built version. Generated av file',
					'tipo'				=> $this->tipo,
					'parent'			=> $this->section_id,
					'id'				=> $id,
					'quality'			=> $quality,
					'source_quality'	=> $source_quality,
					'target_quality'	=> $quality
				]
			);

		// response
			$response->result	= true;
			$response->msg		= ($async===true)
				? 'Building av file in background'
				: 'File built';
			$response->command_response	= $command_response ?? null;


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
			$response->msg		= 'Error. Request failed ';

		// short vars
			$id					= $this->get_id();
			$source_file_path	= $this->get_media_filepath($quality);

		// check file
			if (!file_exists($source_file_path)) {
				$response->msg .= 'File does not exists. The file headers have not been conformed.';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' source_file_path: ' . to_string($source_file_path)
					, logger::ERROR
				);
				return $response;
			}

		// Ffmpeg
			$command_response	= Ffmpeg::conform_header(
				$source_file_path
			);

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
					'id'		=> $id,
					'quality'	=> $quality
				]
			);


		return $response;
	}//end conform_headers



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
	* @param object $options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $options) : object {

		// options
			$update_version	= $options->update_version ?? '';
			$dato_unchanged	= $options->dato_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_dato';

		$update_version	= implode('.', $update_version);
		switch ($update_version) {

			case '6.2.0':
				// same case as '6.0.1'. regenerate_component is enough to create thumb
			case '6.0.1':
				// component instance
					$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo, true);
					$component	= component_common::get_instance(
						$model,
						$tipo,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo,
						false
					);

				// run update cache (this action updates files info and saves)
					$component->regenerate_component();
					$new_dato = $component->get_dato();

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				break;

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
						$model		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
						$component	= component_common::get_instance(
							$model, // string 'component_av'
							$tipo,
							$section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$section_tipo,
							false
						);

					// get existing files data
						$file_name			= $component->get_id();
						$source_quality		= $component->get_original_quality();
						$folder				= $component->get_folder(); // like DEDALO_AV_FOLDER
						$additional_path	= $component->get_additional_path();
						$initial_media_path	= $component->get_initial_media_path();
						$original_extension	= $component->get_original_extension(
							false // bool exclude_converted
						) ?? $component->get_extension();

						$base_path	= $folder  . $initial_media_path . '/' . $source_quality . $additional_path;
						$file		= DEDALO_MEDIA_PATH . $base_path . '/' . $file_name . '.' . $original_extension;

						// no original file found. Use default quality file
							if(!file_exists($file)) {
								// use default quality as original
								$source_quality	= $component->get_default_quality();
								$base_path		= $folder  . $initial_media_path . '/' . $source_quality . $additional_path;
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
						$upload_date_timestamp				= date ("Y-m-d H:i:s", filemtime($file));
						$source_file_upload_date			= dd_date::get_dd_date_from_timestamp($upload_date_timestamp);
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
						$dato_item = (object)[
							'files_info'	=> $files_info,
							'lib_data'		=> $lib_data
						];

					// fix final dato with new format as array
						$new_dato = [$dato_item];
						// debug_log(__METHOD__." update_version new_dato ".to_string($new_dato), logger::DEBUG);

					// properties
						$properties = $component->get_properties();

					// target_duration. Save duration (time-code) in a component_input_text, usually to 'rsc54'
						if (isset($properties->target_duration)) {

							$secs = $component->get_duration( $component->get_default_quality() ); // float secs

							if (!empty($secs)) {

								$model_name_target_duration	= RecordObj_dd::get_modelo_name_by_tipo($properties->target_duration, true);
								$component_target_duration	= component_common::get_instance(
									$model_name_target_duration, // model
									$properties->target_duration, // tipo
									$component->get_section_id(), // section_id
									'list', // mode
									DEDALO_DATA_NOLAN, // lang
									$component->get_section_tipo(), // section_tipo
									false
								);

								$duration	= OptimizeTC::seg2tc($secs); // string TimeCode as '00:05:20:125'
								$component_target_duration->set_dato([$duration]);
								$component_target_duration->Save();
								debug_log(__METHOD__.
									' Saved av duration to '.$properties->target_duration.' : '.to_string($duration).' - secs: '.to_string($secs)
									, logger::DEBUG
								);
							}
						}

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

					// clean vars
						unset($source_file_upload_date);
						unset($files_info);
						unset($lib_data);
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
