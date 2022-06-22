<?php
include_once( DEDALO_CORE_PATH . '/media_engine/class.AVObj.php');
include_once( DEDALO_CORE_PATH . '/media_engine/class.PosterFrameObj.php');



/**
* CLASS COMPONENT_AV
*
*/
class component_av extends component_media_common {

	# Overwrite __construct var lang passed in this component
	#protected $lang = DEDALO_DATA_LANG;

	# file name formatted as 'tipo'-'order_id' like dd732-1
	public $video_id ;
	public $video_url ;
	public $quality ;

	public $target_filename ;
	public $target_dir ;

	public $aditional_path;

	#public $AVObj;



	/**
	* __CONSTRUCT
	*
	*/
	function __construct($tipo, $section_id=null, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null) {

		# Creamos el componente normalmente
		parent::__construct($tipo, $section_id, $modo, $lang, $section_tipo);


		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto en el idioma actual
		# Force calculate and set initial dato
		$dato = $this->get_dato();
			#dump($dato," dato 1 $modo");

		$need_save=false;
		if($modo==='edit' && (int)$this->section_id>0 && !isset($dato->section_id)) {

			#####################################################################################################
			# DEFAULT DATO
			$locator = new locator();
				$locator->set_component_tipo($this->tipo);
				$locator->set_section_tipo($this->section_tipo);
				$locator->set_section_id($this->section_id);
			# END DEFAULT DATO
			######################################################################################################

			# Dato
			$this->set_dato($locator);
			$need_save=true;

		}#end if(empty($dato->counter) && $this->section_id>0)


			#
			# CONFIGURACIÓN NECESARIA PARA PODER SALVAR (Al salvar se guarda una versión valor_list html que no funciona si no están estas variables asignadas)
			#
				# Set and fix current video_id
				$this->video_id = $this->get_video_id();


		if ($need_save===true) {
			# result devuelve el id de la sección parent creada o editada
			$result = $this->Save();
			debug_log(__METHOD__." CREATED/UPDATED ".RecordObj_dd::get_termino_by_tipo($this->tipo)." locator (to ".$locator->get_flat().") of current ".get_called_class()." (tipo:$this->tipo - section_tipo:$this->section_tipo - section_id:$this->section_id - lang:$this->lang)");

		}//end if ($need_save)
	}//end __construct



	/**
	* GET DATO
	* @return array|null $dato
	*/
	public function get_dato() {
		$dato = parent::get_dato();

		if (!empty($dato) && !is_array($dato)) {
			$dato = [$dato];
		}

		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {
		parent::set_dato( $dato );
	}//end set_dato



	/**
	* GET_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @return object $value
	*/
	public function get_value(string $lang=DEDALO_DATA_LANG, object $ddo=null) : object {

		$value = new dd_grid_cell_object();

		if(isset($this->column_obj)){
			$column_obj = $this->column_obj;
		}else{
			$column_obj = new stdClass();
				$column_obj->id = $this->section_tipo.'_'.$this->tipo;
		}

		$dato = $this->get_dato();
		if (!is_array($dato)) {
			$dato = [$dato];
		}

		// data item
		$item  = new stdClass();
			$item->posterframe_url	= $this->get_posterframe_url(true, false, false, false); // $test_file=true, $absolute=false, $avoid_cache=false
			$item->video_url		= $this->file_exist()
				? $this->get_url(false)
				: null;


		$label = $this->get_label();

		$value->set_type('column');
		$value->set_label($label);
		$value->set_ar_columns_obj([$column_obj]);
		$value->set_cell_type('av');
		$value->set_value([$item]);

		return $value;
	}//end get_value



	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		return $this->get_video_id();
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor_export
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$av_file_path = $this->get_valor() . '.' . $this->get_extension();

		$test_file 		= true;	// output dedalo image placeholder when not file exists
		$absolute 		= true;	// otuput absolute path like 'http://myhost/mypath/myimage.jpg'

		$posterframe_file_path	= $this->get_posterframe_url($test_file, $absolute);

		$valor_export = $av_file_path .",".$posterframe_file_path;

		if(SHOW_DEBUG===true) {
			#return "AV: ".$valor_export;
		}

		return $valor_export;
	}//end get_valor_export



	/**
	* GET_ID
	* Alias of get_video_id
	*/
	public function get_id() : ?string {

		return $this->get_video_id();
	}//end get_id



	/**
	* GET_VIDEO_ID
	* @return string|null $video_id
	*/
	public function get_video_id() : ?string {

		// already set
			if(isset($this->video_id) && !empty($this->video_id)) {
				return $this->video_id;
			}

		// // dato
		// 	$dato = $this->get_dato();

		// // check empty or invalid dato
		// 	if (empty($dato) || empty($dato[0]) || empty($dato[0]->section_id)) {
		// 		if(SHOW_DEBUG===true) {
		// 			debug_log(__METHOD__." Component dato is empty from tipo:$this->tipo, section_id:$this->section_id, section_tipo:$this->section_tipo", logger::WARNING);
		// 		}
		// 		return null;
		// 	}

		// // flat locator as id
		// 	$locator	= new locator($dato[0]);
		// 	$video_id	= $locator->get_flat();

		// section_id check
			$section_id = $this->get_section_id();
			if (!isset($section_id)) {
				if(SHOW_DEBUG===true) {
					error_log(__METHOD__." Component dato (parent:$this->section_id,section_tipo:$this->section_tipo) is empty for: ".to_string(''));
				}
				return null;
			}

		// flat locator as id
			$locator = new locator();
				$locator->set_section_tipo($this->get_section_tipo());
				$locator->set_section_id($this->get_section_id());
				$locator->set_component_tipo($this->get_tipo());

			$video_id	= $locator->get_flat();

		// fix value
			$this->video_id = $video_id;


		return $video_id;
	}//end get_video_id



	/**
	* GET_QUALITY
	* 	Takes quality from fixed value or fallback to default config value
	*/
		// public function get_quality() {

		// 	$quality = $this->quality ?? $this->get_default_quality();

		// 	return $quality;
		// }//end get_quality



	/**
	* GET_DEFAULT_QUALITY
	*/
	public function get_default_quality() : string {

		return DEDALO_AV_QUALITY_DEFAULT;
	}//end get_default_quality



	/**
	* UPLOAD NEEDED
	*/
	public function get_target_filename() : string {
		return $this->video_id .'.'. $this->get_extension();
	}
	public function get_target_dir() : string  {
		return DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $this->get_quality() ;
		#return $this->AVObj->get_media_path_abs();
	}//end get_target_dir



	/**
	* GET_URL
	* @param string|null $quality = null
	* @return string $video_url
	*/
	public function get_url( ?string $quality=null ) : string {

		if(empty($quality)) {
			$quality = $this->get_quality();
		}

		$video_id = $this->get_video_id();

		$path	= DEDALO_MEDIA_URL . DEDALO_AV_FOLDER .'/'. $quality . '/';
		$name	= $video_id .'.'. $this->get_extension();

		$video_url = $path . $name;

		return $video_url;
	}//end get_url



	/**
	* GET_VIDEO_PATH
	* @param string|null $quality = null
	* @return string $video_path
	*/
	public function get_video_path( ?string $quality=null ) : string {

		if(empty($quality)) {
			$quality = $this->get_quality();
		}

		$video_id = $this->get_video_id();

		$video_path = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $quality . '/'. $video_id .'.'. $this->get_extension();

		return $video_path;
	}//end get_video_path



	/**
	* GET_PATH
	* Alias of get_video_path
	*/
	public function get_path($quality=false) : string {

		return $this->get_video_path($quality);
	}//end get_path



	/**
	* GET_POSTERFRAME_FILE_NAME
	*  like 'rsc35_rsc167_1.jpg'
	*/
	public function get_posterframe_file_name() : string {

		$posterframe_file_name = $this->get_id() .'.'. DEDALO_AV_POSTERFRAME_EXTENSION;

		return $posterframe_file_name;
	}//end get_posterframe_file_name



	/**
	* GET_POSTERFRAME_PATH
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

		$video_id	= $this->get_video_id();
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

		$subtitles_path = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER.'/'. $this->get_video_id().'_'.$lang.'.'.DEDALO_AV_SUBTITLES_EXTENSION;

		return $subtitles_path;
	}//end get_subtitles_path



	/**
	* GET_SUBTITLES_URL
	* @return string $subtitles_url
	*/
	public function get_subtitles_url( string $lang=DEDALO_DATA_LANG ) : string {

		$subtitles_url = DEDALO_MEDIA_URL . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER. '/'. $this->get_video_id().'_'.$lang .'.'.DEDALO_AV_SUBTITLES_EXTENSION;

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
			$initial_quality = $this->get_quality();

		// quakity. Changes current component quality temporally
			$this->set_quality($quality);

		// file do not esits case
			$target_dir = $this->get_target_dir();
			if(!file_exists($target_dir)) {
				return $result;
			}

		$ar_originals = array();
		if ($handle = opendir($target_dir)) {

		    while (false !== ($file = readdir($handle))) {

		    	if($this->get_video_id() == $file && is_dir($target_dir.'/'.$file)){

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
		        $findme = $this->get_video_id() . '.';

		        if( strpos($file, $findme)!==false ) {  // && strpos($file, $this->get_target_filename())===false
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
				dump($ar_originals, "ar_originals ".to_string($ar_originals));
				trigger_error("ERROR (DEBUG ONLY): Current quality have more than one file. ".to_string($ar_originals));
			}
		}

		// restore initial_quality
			$this->quality 	= $initial_quality;


		return $result;
	}//end get_original_file_path



	/**
	* GET_VIDEO SIZE
	* @return string
	*/
	public function get_video_size(string $quality=null, string $filename=null) : ?string {

		if (empty($filename)) {

			if(empty($quality)) {
				$quality = $this->get_quality();
			}

			$video_id	= $this->get_video_id();
			$filename	= DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER. '/' . $quality . '/'. $video_id .'.'. $this->get_extension();
		}

		if ( !file_exists( $filename )) {
			return false ;
		}
		$size = 0;
		if(is_dir($filename)){
			//minimum size of the initial vob (512KB)
			$vob_filesize = 512*1000;

			if(is_dir($filename.'/VIDEO_TS')){

				$handle = opendir($filename.'/VIDEO_TS');
			  		 while (false !== ($file = readdir($handle))) {
			  		 	$extension = pathinfo($file,PATHINFO_EXTENSION);
			  		 	if($extension === 'VOB' && filesize($filename.'/VIDEO_TS/'.$file) > $vob_filesize){
			  		 		#dump($file,'$file: '.filesize($filename.'/VIDEO_TS/'.$file));

			  		 		//reset the size of the vob (for the end files of the video)
			  		 		$vob_filesize = 0;
			  		 		$size += filesize($filename.'/VIDEO_TS/'.$file);
			  		 	}
			  		 }
			  	}
		}else{
			try {
				$size		= @filesize($filename) ;
				if(!$size)	throw new Exception('Unknow size!') ;
			} catch (Exception $e) {
				#echo '',  $e->getMessage(), "\n";
				#trigger_error( __METHOD__ . " " . $e->getMessage() , E_USER_NOTICE) ;
				return null;
			}
		}


		$size_kb = round($size / 1024) ;

		if($size_kb <= 1024) return $size_kb . ' KB' ;

		return round($size_kb / 1024) . ' MB' ;
	}//end get_video_size



	/**
	* GET_DURATION_SECONDS
	* @return int|string $duration_seconds OR string $timecode
	*/
	public function get_duration_seconds(?string $format=null) {

		$duration_seconds = 0;

		# Input text av_duration
		# NOTE : This component store seconds as timecode like 00:09:52 . When you call to obtain stored duration
		# 		 you need convert stored data to seconds (and viceversa for save)
		$component 	= component_common::get_instance('component_input_text',
													DEDALO_COMPONENT_RESOURCES_AV_DURATION_TIPO,
													$this->get_parent(),
													'list',
													DEDALO_DATA_NOLAN,
													$this->get_section_tipo());
		$tc = $component->get_dato();

		#if(SHOW_DEBUG===true) {
		if (empty($tc[0])) {
			# Read file once
			$duration_seconds = 0;

			$video_path 	  = $this->get_video_path(DEDALO_AV_QUALITY_DEFAULT);
			$media_attributes = ffmpeg::get_media_attributes($video_path);
				#dump($media_attributes, ' media_attributes ++ '.to_string());
			if (isset($media_attributes->format->duration) && !empty($media_attributes->format->duration)) {
				$duration_seconds = $media_attributes->format->duration;

				# Save data to component as time code
				$tc[0] = OptimizeTC::seg2tc($duration_seconds);
				$component->set_dato($tc);
				$component->Save();
			}
		}else{

			# Calculate seconds from tc
			$duration_seconds = OptimizeTC::TC2seg($tc[0]);
		}

		# For fast access from oh list only
		if ($format==='timecode') {
			return (string)$tc[0];
		}

		return (int)$duration_seconds;
	}//end get_duration_seconds



	/**
	* GET_SOURCE_QUALITY_TO_BUILD
	* Iterate array DEDALO_AV_AR_QUALITY (Order by quality big to small)
	* @return string|null $current_quality
	*/
	public function get_source_quality_to_build(string $target_quality) : ?string {

		$ar_quality_source_valid = array();
		$ar_quality 			 = DEDALO_AV_AR_QUALITY;
			#dump($ar_quality,'$ar_quality');

		foreach($ar_quality as $current_quality) {

			if($target_quality===DEDALO_AV_QUALITY_ORIGINAL) continue;

			# Current file
			$filename = $this->get_original_file_path($current_quality);

			if ($current_quality!==$target_quality && file_exists($filename)) {
				return $current_quality;
			}
		}#end foreach($ar_quality as $quality)


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

		$ar_all_files_by_quality=array();
		foreach ($ar_quality as $current_quality) {
			$ar_all_files_by_quality[$current_quality] = $this->get_original_file_path($current_quality);
		}

		return (array)$ar_all_files_by_quality;
	}//end get_ar_all_files_by_quality



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file linked to current component (all quality versions)
	* Is triggered wen section that contains media elements is deleted
	* @see section:remove_section_media_files
	*/
	public function remove_component_media_files(array $ar_quality=[], bool $remove_posterframe=true) : bool {

		$date=date("Y-m-d_Hi");

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
						$create_dir 	= mkdir($folder_path_del, 0777,true);
						if(!$create_dir) {
							trigger_error(" Error on read or create directory \"deleted\". Permission denied.");
							return false;
						}
					}

				// move/rename file
					$reelID				= $this->get_video_id();
					$media_path_moved	= $folder_path_del . "/$reelID" . '_deleted_' . $date . '.' . $this->get_extension();
					if( !rename($media_path, $media_path_moved) ) {
						trigger_error(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");
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
							$create_dir = mkdir($folder_path_del, 0777,true);
							if(!$create_dir) {
								trigger_error("Error on read or create directory \"deleted\". Permission denied");
								return false;
							}
						}

					// move/rename file
						$reelID				= $this->get_video_id();
						$media_path_moved	= $folder_path_del . "/$reelID" . '_deleted_' . $date . '.' . DEDALO_AV_POSTERFRAME_EXTENSION;
						if( !rename($media_path, $media_path_moved) ) {
							trigger_error("Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");
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
	*/
	public function restore_component_media_files() : bool {

		#
		# AV restore
		$ar_quality = DEDALO_AV_AR_QUALITY;
		foreach ($ar_quality as $current_quality) {

			# media_path
			$media_path = $this->get_video_path($current_quality);
			$media_path = pathinfo($media_path,PATHINFO_DIRNAME).'/deleted';
			$video_id 	= $this->get_video_id();
			if(SHOW_DEBUG===true) {
				#dump($media_path, "media_path current_quality:$current_quality - get_video_id:$video_id");	#continue;
			}
			$file_pattern 	= $media_path .'/'. $video_id .'_*.'. $this->get_extension();
			$ar_files 		= glob($file_pattern);
			if(SHOW_DEBUG===true) {
				#dump($ar_files, ' ar_files');#continue;
			}
			if (empty($ar_files)) {
				debug_log(__METHOD__." No files to restore were found for video_id:$video_id. Nothing was restored (1)");
				continue; // Skip
			}
			natsort($ar_files);	# sort the files from newest to oldest
			$last_file_path = end($ar_files);
			$new_file_path 	= $this->get_video_path($current_quality);
			if( !rename($last_file_path, $new_file_path) ) throw new Exception(" Error on move files to restore folder. Permission denied . Nothing was restored (2)");

			if(SHOW_DEBUG===true) {
				$msg=__METHOD__." Moved file \n$last_file_path to \n$new_file_path";
				debug_log($msg);
				#dump($msg, ' msg');
			}
		}#end foreach ($ar_quality as $current_quality)


		#
		# Posterframe restore
		$media_path = $this->get_posterframe_path();
		$media_path = pathinfo($media_path,PATHINFO_DIRNAME).'/deleted';
		$video_id 	= $this->get_video_id();
		if(SHOW_DEBUG===true) {
			#dump($media_path, "media_path posterframe - get_video_id:$video_id");	#continue;
		}
		$file_pattern 	= $media_path.'/'.$video_id.'_*.'.DEDALO_AV_POSTERFRAME_EXTENSION;
		$ar_files 		= glob($file_pattern);
		if(SHOW_DEBUG===true) {
			#dump($ar_files, ' ar_files');#continue;
		}
		if (empty($ar_files)) {
			debug_log(__METHOD__." No files to restore were found for posterframe:$video_id. Nothing was restored (3)");
		}else {
			natsort($ar_files);	# sort the files from newest to oldest
			$last_file_path = end($ar_files);
			$new_file_path 	= $this->get_posterframe_path();
			if( !rename($last_file_path, $new_file_path) ) throw new Exception(" Error on move files to restore folder. Permission denied to restore posterframe. Nothing was restored (4)");

			if(SHOW_DEBUG===true) {
				$msg=__METHOD__." \nMoved file \n$last_file_path to \n$new_file_path";
				debug_log($msg);
				#dump($msg, ' msg');
			}
		}

		return true;
	}//end restore_component_media_files



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$diffusion_value = $this->get_url(DEDALO_AV_QUALITY_DEFAULT);


		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* FILE_EXIST
	* Check if quality given file exists.
	* If not quality is received, default will be used (404 normally)
	* @return bool
	*/
	public function file_exist(?string $quality=null) : bool {

		$video_path  = $this->get_video_path($quality);
		$file_exists = file_exists($video_path);

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
	* Used to move zip files like compressed dvd
	* @return object $response
	*/
	public static function move_zip_file(string $tmp_name, string $folder_path, string $file_id) : object {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.']';

		$zip = new ZipArchive;
		$res = $zip->open($tmp_name);
		if ($res!==true) {
			$response->msg .= "Error on open zip file ! Code: ".to_string($res);
			return $response;
		}

		// Create the directories
		if( !is_dir($folder_path.'/'.$file_id) ) {
			$ar_folders = [
				$folder_path .'/'. $file_id,
				$folder_path .'/'. $file_id . '/VIDEO_TS/',
				$folder_path .'/'. $file_id . '/AUDIO_TS/'
			];
			foreach ($ar_folders as $current_folder) {
				if(!mkdir($current_folder, 0777)) {
					$response->msg .= "Error on read or create directory for \"$file_id\" folder. Permission denied ! ($current_folder)";
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
				$target = $folder_path.'/'.$file_id.'/VIDEO_TS/'.$current_fileinfo['basename'];
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
				$target = $folder_path.'/'.$file_id.'/AUDIO_TS/'.$current_fileinfo['basename'];
				if(!copy('zip://'.$src, $target)) {
					$response->msg .= "Error on copy zip file: $src";
					return $response;
				}
			}
		}//end for ($i=0; $i < $zip->numFiles; $i++)

		$zip->close();

		// all is ok
		$response->result 	= true;
		$response->msg 		= 'Ok. Request done ['.__METHOD__.']';


		return $response;
	}//end move_zip_file



	/**
	* GET_PREVIEW_URL
	* @return string $url
	*/
	public function get_preview_url() : string {

		// $preview_url = $this->get_posterframe_url($test_file=true, $absolute=false, $avoid_cache=false);
		$preview_url = $this->get_posterframe_url($test_file=false, $absolute=false, $avoid_cache=true);

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
					// throw new Exception("Error Processing Request. File extension is unknow", 1);
					$msg = ' Error Processing Request. File extension is unknow';
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg .= $msg;
					return $response;
				}
			// video_id (without extension, like 'test81_test65_2')
				$video_id = $this->get_video_id();
				if (empty($video_id)) {
					throw new Exception("Error Processing Request. Invalid video_id: ".to_string($video_id), 1);
				}

			// quality default in upload is 'original' (!)
				$quality  = $this->get_quality();

			$AVObj = new AVObj($video_id, $quality);

		try {

			# AUDIO CASE
			if ($quality==='audio') {

				// audio extensions supported
				$ar_audio_only_ext = array('mp3','aiff','aif','wave','wav');
				if (in_array($file_ext, $ar_audio_only_ext)) {
					# Audio conversion
					$Ffmpeg = new Ffmpeg();
					$Ffmpeg->convert_audio($AVObj, $full_file_path);
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

						# If default quality file not exists, generate default quality version now
						# $target_file  = $AVObj->get_local_full_path(); ???????????????????????????????? SURE ???????
						$quality_default_AVObj 		 = new AVObj($video_id, DEDALO_AV_QUALITY_DEFAULT);
						$quality_default_target_file = $quality_default_AVObj->get_local_full_path();
						if (!file_exists($quality_default_target_file)) {
							$source_file = $full_file_path; // actually full original path and name
							if (!file_exists($source_file)) {
								debug_log(__METHOD__." ERROR: Source file not exists ($source_file) ".to_string(), logger::ERROR);
							}else{
								// convert with ffmpeg
								Ffmpeg::convert_to_dedalo_av($source_file, $quality_default_target_file);
							}
						}else{
							debug_log(__METHOD__." WARNING: Ignored conversion to default quality (".DEDALO_AV_QUALITY_DEFAULT."). File already exists", logger::WARNING);
						}//end if (!file_exists($target_file)) {
					}//end if (defined('DEDALO_AV_RECOMPRESS_ALL') && DEDALO_AV_RECOMPRESS_ALL==1)


				// posterframe. Create posterframe of current video if not exists
					$PosterFrameObj = new PosterFrameObj($video_id);
					if(Ffmpeg::get_ffmpeg_installed_path() && !$PosterFrameObj->get_file_exists()) {
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


			// audio files. Audio files generate always a audio file
				if ($quality===DEDALO_AV_QUALITY_ORIGINAL) {
					$ar_audio_only_ext = array('mp3','aiff','aif','wave','wav');
					if (in_array($file_ext, $ar_audio_only_ext)) {

						# Audio conversion
						$AVObj_target = new AVObj($video_id, 'audio');
						$target_file  = $AVObj_target->get_local_full_path();
						if (!file_exists($target_file)) {
							$source_file = $full_file_path;
							if (!file_exists($source_file)) {
								debug_log(__METHOD__." ERROR: Source file not exists ($source_file) 2 ".to_string(), logger::WARNING);
							}
							Ffmpeg::convert_to_dedalo_av($source_file, $target_file);
							debug_log(__METHOD__." Converted source audio file to 'audio' quality ".to_string(), logger::DEBUG);
						}//end if (!file_exists($target_file)) {

					}else{
						#throw new Exception("Error Processing Request. Current audio extension [$file_ext] is not supported (q:$quality) (2)", 1);
					}
				}//end if ($quality==DEDALO_AV_QUALITY_ORIGINAL) {


			// target_filename. Save original file name in a component_input_text
				$properties = $this->get_properties();
				if (isset($properties->target_filename)) {

					$current_section_id  = $this->get_parent();
					$target_section_tipo = $this->get_section_tipo();

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

			// all is ok
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
	* @return
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

		return DEDALO_AV_EXTENSION;
	}//end get_extension



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
		$result = $this->remove_component_media_files([$quality], $remove_posterframe=false);
		if ($result===true) {

			// save To update valor_list
				$this->Save();

			$response->result	= true;
			$response->msg		= 'File deleted successfully. ' . $quality;
		}

		// DES
			// // short vars
			// 	$video_id			= $this->get_video_id();
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
			// 			$tmp_file = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . "/tmp/".$quality.'_'.$video_id.'.sh';
			// 			if(file_exists($tmp_file)) {
			// 				$del_sh = unlink($tmp_file);
			// 				if(!$del_sh) {
			// 					$response->msg .= PHP_EOL . 'Error on delete temp file . Temp file is not deleted';
			// 					return $response;
			// 				}
			// 			}

			// 		// delete posterframe if media deleted is quality default
			// 			if($quality===DEDALO_AV_QUALITY_DEFAULT) {
			// 				$poster_file = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER ."/posterframe/{$video_id}.jpg";
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
			// 					'video_id'		=> $video_id,
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
			$video_id		= $this->get_id();
			$source_quality	= $this->get_source_quality_to_build($quality);

		// AVObj
			$AVObj = new AVObj($video_id, $source_quality);

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
					'video_id'			=> $video_id,
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
			$video_id = $this->get_video_id();

		// AVObj
			$AVObj = new AVObj($video_id, $quality);

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
					'video_id'	=> $video_id,
					'quality'	=> $quality
				]
			);
				dump($response, ' response ++ '.to_string());

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
				trigger_error(" Error on delete posterframe file. Posterframe file is not deleted");
				return false;
			}


		return true;
	}//end delete_posterframe




}//end class component_av
