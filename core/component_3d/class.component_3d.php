<?php declare(strict_types=1);
/**
* CLASS COMPONENT_3D
*
*/
class component_3d extends component_media_common implements component_media_interface {



	/**
	* CLASS VARS
	*/
		// url. File name formatted as 'tipo'-'order_id' like dd732-1
		public $url;



	/**
	* GET_AR_QUALITY
	* Get the list of defined av qualities in Dédalo config
	* @return array $ar_quality
	*/
	public function get_ar_quality() : array {

		$ar_quality = DEDALO_3D_AR_QUALITY;

		return $ar_quality;
	}//end get_ar_quality



	/**
	* GET_DEFAULT_QUALITY
	* @return string DEDALO_3D_QUALITY_DEFAULT
	*/
	public function get_default_quality() : string {

		return DEDALO_3D_QUALITY_DEFAULT;
	}//end get_default_quality



	/**
	* GET_ORIGINAL_QUALITY
	* @return string $original_quality
	*/
	public function get_original_quality() : string {

		$original_quality = DEDALO_3D_QUALITY_ORIGINAL;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_NORMALIZED_AR_QUALITY
	* @return array $normalized_ar_quality
	*/
	public function get_normalized_ar_quality() : array {

		// use qualities
		$default_quality = $this->get_default_quality();

		$normalized_ar_quality = [$default_quality];

		return $normalized_ar_quality;
	}//end get_normalized_ar_quality



	/**
	* GET_EXTENSION
	* @return string DEDALO_3D_EXTENSION from config
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_3D_EXTENSION;
	}//end get_extension



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_3D_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_FOLDER
	* 	Get element directory from config
	* @return string
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_3D_FOLDER;
	}//end get_folder



	/**
	* GET_BEST_EXTENSIONS
	* Extensions list of preferable extensions in original or modified qualities.
	* Ordered by most preferable extension, first is the best.
	* @return array
	*/
	public function get_best_extensions() : array {

		return ['glb'];
	}//end get_best_extensions



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	*
	* @return grid_cell_object $value
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// quality
			$quality = $this->get_default_quality();

		// dato. get from dato
			$dato = $this->get_dato();
			if(isset($dato)){

				// Caller class name, the name of who instantiate the component
				// the URI resolution of the data depends of the caller
				// when is caller by tool_export it needs to be absolute (with the protocol and domain)
				// when is caller by tool_diffusion it needs to be relative (without the protocol and domain)
				switch ($this->caller) {
					case 'tool_export':
						$absolute = true;
						break;

					default:
						$absolute = false;
						break;
				}

				$current_url = ($this->mode==='edit')
					? $this->get_url(
						$quality,
						false, // bool test_file
						$absolute,  // bool absolute
						false // bool default_add
					  )
					: $this->get_posterframe_url();

			}else{
				$current_url = '';
			}

		// data item
			// $item  = new stdClass();
			// 	$item->posterframe_url = $this->get_posterframe_url(
			// 		false, // bool test_file
			// 		false, // bool absolute
			// 		false // bool avoid_cache
			// 	);
			// 	$item->url = $this->quality_file_exist( $quality )
			// 		? $this->get_url()
			// 		: null;

		// label
			$label = $this->get_label();

		// value
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('img');
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				$dd_grid_cell_object->set_value([$current_url]);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string|null $valor_export
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) : ?string {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed JSON string as dato
		}

		$av_file_path			= $this->get_valor();
		$posterframe_file_path	= $this->get_posterframe_url(
			true, // bool test_file dedalo image placeholder when not file exists
			true // bool absolute ike 'http://myhost/mypath/myimage.jpg'
		);

		$valor_export = $av_file_path .','. ($posterframe_file_path ?? '');


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
		$folder				= $this->get_folder(); // like DEDALO_3D_FOLDER
		$additional_path	= $this->additional_path;

		$posterframe_filepath = DEDALO_MEDIA_PATH . $folder .'/posterframe'. $additional_path .'/'. $file_name;


		return $posterframe_filepath;
	}//end get_posterframe_filepath



	/**
	* GET_POSTERFRAME_URL
	* @param bool $test_file = true
	* @param bool $absolute = false
	* @param bool $avoid_cache = false
	* @return string|null $posterframe_url
	*/
	public function get_posterframe_url(bool $test_file=false, bool $absolute=false, bool $avoid_cache=false) : ?string {

		$folder				= $this->get_folder(); // like DEDALO_3D_FOLDER
		$file_name			= $this->get_posterframe_file_name();
		$additional_path	= $this->additional_path;

		$posterframe_url = DEDALO_MEDIA_URL . $folder .'/posterframe'. $additional_path .'/'. $file_name;

		// FILE EXISTS TEST : If not, show '0' dedalo image logo
		if ($test_file===true) {
			// $file = DEDALO_MEDIA_PATH . $folder .'/posterframe'. $additional_path .'/'. $file_name;
			$file = $this->get_posterframe_filepath();
			if(!file_exists($file)) {
				return null;
			}
		}

		// ABSOLUTE (Default false)
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
	* @param float $current_time
	* 	A double-precision floating-point value indicating the current playback time in seconds.
	* 	From HML5 video element command 'currentTime'
	* @param string|null $target_quality
	* @param array|string|null $ar_target
	* 	Optional array value with forced target destination path and file name
	* @return bool $command_response
	* 	FFMPEG terminal command response
	*/
	public function create_posterframe( $current_time, ?string $target_quality=null, array|string|null $ar_target=null ) : bool {

		debug_log(__METHOD__
			. " Sorry. This method is not implemented yet " . PHP_EOL
			, logger::ERROR
		);

		return false;
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
				debug_log(__METHOD__
					." posterframe file doesn't exists, it is not possible to create a thumb"
					, logger::WARNING
				);
				return false;
			}

		// thumb generate
			ImageMagick::dd_thumb(
				$posterframe, // source file
				$target_file // thumb file
			);


		return true;
	}//end create_thumb



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file linked to current component (all quality versions)
	* Is triggered wen section that contains media elements is deleted
	* @see section:remove_section_media_files
	*
	* @param array $ar_quality=[]
	* @param string|null $extension = null
	* @param bool $remove_posterframe=true
	* @return bool $result
	*/
	public function remove_component_media_files( array $ar_quality=[], ?string $extension=null, bool $remove_posterframe=true ) : bool {

		// files remove
			$result = parent::remove_component_media_files($ar_quality);

		// posterframe remove (default is true)
			if ($remove_posterframe===true) {

				$media_path = $this->get_posterframe_filepath();
				if (file_exists($media_path)) {

					$folder				= $this->get_folder(); // like DEDALO_3D_FOLDER
					$additional_path	= $this->additional_path;

					// delete dir check/creation
						$folder_path_del = DEDALO_MEDIA_PATH . $folder . '/posterframe' . $additional_path . '/deleted';
						if(!create_directory($folder_path_del, 0750)) {
							return false;
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

		// Posterframe restore
			$posterframe_filepath	= $this->get_posterframe_filepath();
			$media_path			= pathinfo($posterframe_filepath,PATHINFO_DIRNAME).'/deleted';
			$id					= $this->get_id();
			$file_pattern		= $media_path.'/'.$id.'_*.'.DEDALO_AV_POSTERFRAME_EXTENSION;
			$ar_files			= glob($file_pattern);
			if (empty($ar_files)) {

				debug_log(__METHOD__
					." No files to restore were found for posterframe:$id. Nothing was restored (3)"
					, logger::WARNING
				);

			}else{

				natsort($ar_files);	# sort the files from newest to oldest
				$last_file_path = end($ar_files);
				$new_file_path 	= $this->get_posterframe_filepath();
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
	* PROCESS_UPLOADED_FILE
	* TODO: modify this to transform input file into .glb
	* Note that this is the last method called in a sequence started on upload file.
	* The sequence order is:
	* 	1 - dd_utils_api::upload
	* 	2 - tool_upload::process_uploaded_file
	* 	3 - component_media_common::add_file
	* 	4 - component:process_uploaded_file
	* The target quality is defined by the component quality set in tool_upload::process_uploaded_file
	* @param object|null $file_data
	*	Data from trigger upload file
	* Format:
	* {
	*     "original_file_name": "my_video.mp4",
	*     "full_file_name": "test81_test65_2.mp4",
	*     "full_file_path": "/mypath/media/av/original/test81_test65_2.mp4"
	* }
	* @param object|null  $process_options=null
	* @return object $response
	*/
	public function process_uploaded_file( ?object $file_data=null, ?object $process_options=null ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// check vars
			if (empty($file_data) ||
				empty($file_data->original_file_name) ||
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
			$original_file_name			= $file_data->original_file_name;	// like "my file85.glb"
			$full_file_path				= $file_data->full_file_path;		// like "/mypath/media/3d/web/test175_test65_1.glb"
			$full_file_name				= $file_data->full_file_name;		// like "test175_test65_1.glb"
			$original_normalized_name	= $full_file_name;

		// check full_file_path
			if (!file_exists($full_file_path)) {
				$response->msg .= ' File full_file_path do not exists';
				return $response;
			}

		// debug
			debug_log(__METHOD__
				. " Processing file " . PHP_EOL
				. ' original_file_name: ' . $original_file_name .PHP_EOL
				. ' full_file_path: ' . $full_file_path
				, logger::WARNING
			);

		try {

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

			// Generate default_3d_format : If uploaded file is not in Dedalo standard format (glb), is saved and not processed.
			// original file with standard format (like myfilename.glb) will copied to default quality
			// regenerate component will create the default quality 3d calling build()
			// build() will check the normalized files of the original
			// then if the normalized files doesn't exist, will create it
			// then will create the JPG format of the default
			// then save the data.
				$result = $this->regenerate_component();
				if ($result === false) {
					$response->msg .= ' Error processing the uploaded file';
					return $response;
				}

			// response OK
				$response->result	= true;
				$response->msg		= 'OK. successful request';

		} catch (Exception $e) {
			$msg = 'Exception[process_uploaded_file]: ' .  $e->getMessage() . "\n";
			debug_log(__METHOD__
				." $msg "
				, logger::ERROR
			);
			$response->msg .= ' - '.$msg;
		}


		return $response;
	}//end process_uploaded_file



	/**
	* DELETE_FILE
	* Remove quality version moving the file to a deleted files dir
	* @see component_3d->remove_component_media_files
	* @param string $quality
	* 	Quality to delete as '1.5MB'
	* @param string|null $extension=null
	* 	Optional extension as 'avif'. On empty, all quality files will be deleted,
	* 	else only the selected file in current quality will be deleted
	* @return object $response
	*/
	public function delete_file( string $quality, ?string $extension=null ) : object {

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
			[$quality], // array quality
			$extension, // file extension
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
					],
					logged_user_id() // int
				);

			// save To update valor_list
				$this->Save();

			$response->result	= true;
			$response->msg		= 'File deleted successfully. ' . $quality;
		}

		return $response;
	}//end delete_file



	/**
	* GET_MEDIA_ATTRIBUTES
	* Read file and get attributes using ffmpeg
	* @param string $file_path
	* @return object|null $media_attributes
	*/
	public function get_media_attributes(string $file_path)  {

		debug_log(__METHOD__
			. " Sorry. This method is not implemented yet " . PHP_EOL
			, logger::ERROR
		);

		// $media_attributes = ffmpeg::get_media_attributes($file_path);

		// return $media_attributes;
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
					$model		= ontology_node::get_modelo_name_by_tipo($tipo, true);
					$component	= component_common::get_instance(
						$model, // string 'component_3d'
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

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_dato_version



}//end class component_3d
