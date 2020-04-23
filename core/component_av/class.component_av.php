<?php
/*
* CLASS COMPONENT AV
*/
include_once( DEDALO_CORE_PATH . '/media_engine/class.AVObj.php');
include_once( DEDALO_CORE_PATH . '/media_engine/class.PosterFrameObj.php');
include_once( DEDALO_CORE_PATH . '/media_engine/class.Ffmpeg.php');
include_once( DEDALO_CORE_PATH . '/media_engine/class.OptimizeTC.php');

class component_av extends component_media_common {

	# Overwrite __construct var lang passed in this component
	#protected $lang = DEDALO_DATA_LANG;

	# file name formated as 'tipo'-'order_id' like dd732-1
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
	function __construct($tipo, $parent=null, $modo='edit', $lang=DEDALO_DATA_LANG, $section_tipo=null) {

		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_IN_'.$tipo.'_'.$modo.'_'.microtime(1)]=microtime(1);
		}

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);


		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto en el idioma actual
		# Force calculate and set initial dato
		$dato = $this->get_dato();
			#dump($dato," dato 1 $modo");

		$need_save=false;
		if((int)$this->parent>0 && !isset($dato->section_id)) {

			#####################################################################################################
			# DEFAULT DATO
			$locator = new locator();
				$locator->set_component_tipo($this->tipo);
				$locator->set_section_tipo($this->section_tipo);
				$locator->set_section_id($this->parent);
			# END DEFAULT DATO
			######################################################################################################

			# Dato
			$this->set_dato($locator);
			$need_save=true;

		}#end if(empty($dato->counter) && $this->parent>0)


			#
			# CONFIGURACIÓN NECESARIA PARA PODER SALVAR (Al salvar se guarda una versión valor_list html que no funciona si no están estas variables asignadas)
			#
				# Set and fix current video_id
				$this->video_id = $this->get_video_id();


		if ($need_save===true) {
			# result devuelve el id de la sección parent creada o editada
			$result = $this->Save();
			debug_log(__METHOD__." CREATED/UPDATED ".RecordObj_dd::get_termino_by_tipo($this->tipo)." locator (to ".$locator->get_flat().") of current ".get_called_class()." (tipo:$this->tipo - section_tipo:$this->section_tipo - parent:$this->parent - lang:$this->lang)");

		}#end if ($need_save)


		if(SHOW_DEBUG===true) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
	}//end __construct



	/**
	* GET DATO
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		return (object)$dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}//end set_dato



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
	* Return component value sended to export data
	* @return string $valor_export
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {

		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$av_file_path = $this->get_valor() . '.'.DEDALO_AV_EXTENSION;

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
	public function get_id() {

		return $this->get_video_id();
	}//end get_id



	/**
	* GET VIDEO ID
	*/
	public function get_video_id() {

		if(isset($this->video_id)) return $this->video_id;

		$dato = $this->get_dato();
		if (!isset($dato->section_id)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Component dato is empty from tipo:$this->tipo, parent:$this->parent, section_tipo:$this->section_tipo", logger::WARNING);
			}
			return 0;
		}
		$locator  = new locator($dato);
		$video_id = $locator->get_flat($dato);
			#dump($video_id,'video_id');

		return $this->video_id = $video_id;
	}
	public function get_av_id() {

		return $this->get_video_id();
	} // Alias of get_video_id()



	/**
	* GET QUALITY
	*/
	public function get_quality() {
		if(!isset($this->quality)) return DEDALO_AV_QUALITY_DEFAULT;
		return $this->quality;
	}//end get_quality



	/**
	* UPLOAD NEEDED
	*/
	public function get_target_filename() {
		return $this->video_id .'.'. DEDALO_AV_EXTENSION ;
	}
	public function get_target_dir() {
		return DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $this->get_quality() ;
		#return $this->AVObj->get_media_path_abs();
	}//end get_target_dir



	/**
	* GET_VIDEO_URL
	*/
	public function get_video_url($quality=false) {

		if($quality===false) {
			$quality = $this->get_quality();
		}

		$video_id = $this->get_video_id();

		$path = DEDALO_MEDIA_URL . DEDALO_AV_FOLDER .'/'. $quality . '/';
		$name = $video_id .'.'. DEDALO_AV_EXTENSION;

		$video_url = $path . $name;

		return $video_url;
	}//end get_video_url



	/**
	* GET_VIDEO_PATH
	*/
	public function get_video_path($quality=false) {

		if($quality===false) {
		$quality 	= $this->get_quality();
		}
		$video_id 	= $this->get_video_id();

		return DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $quality . '/'. $video_id .'.'. DEDALO_AV_EXTENSION ;
	}//end get_video_path



	/**
	* GET_POSTERFRAME_PATH
	*/
	public function get_posterframe_path() {

		return DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/posterframe/'. $this->get_video_id() . '_' . DEDALO_DATA_LANG.'.'.DEDALO_AV_POSTERFRAME_EXTENSION;
	}//end get_posterframe_path



	/**
	* GET_POSTERFRAME_URL
	*/
	public function get_posterframe_url($test_file=true, $absolute=false, $avoid_cache=false) {

		$video_id 	= $this->get_video_id();

		$posterframe_url = DEDALO_MEDIA_URL . DEDALO_AV_FOLDER .'/posterframe/'. $video_id .'.'. DEDALO_AV_POSTERFRAME_EXTENSION;

		# FILE EXISTS TEST : If not, show '0' dedalo image logo
		if ($test_file===true) {
			$file = DEDALO_MEDIA_PATH .DEDALO_AV_FOLDER.'/posterframe/'. $video_id .'.'. DEDALO_AV_POSTERFRAME_EXTENSION ;
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
	public function get_subtitles_path( $lang=DEDALO_DATA_LANG ) {
		return DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER.'/'. $this->get_video_id().'_'.$lang.'.'.DEDALO_AV_SUBTITLES_EXTENSION;
	}



	/**
	* GET_SUBTITLES_URL
	*/
	public function get_subtitles_url( $lang=DEDALO_DATA_LANG ) {
		return DEDALO_MEDIA_URL . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER. '/'. $this->get_video_id().'_'.$lang .'.'.DEDALO_AV_SUBTITLES_EXTENSION;
	}



	/**
	* GET_ORIGINAL_FILE_PATH
	* Si se sube un archivo de extensión distinta a DEDALO_IMAGE_EXTENSION, se convierte a DEDALO_IMAGE_EXTENSION. Los archivos originales
	* se guardan renombrados pero conservando la terminación. Se usa esta función para localizarlos comprobando si hay mas de uno.
	* @param string $quality
	* @return bool | string (file extension)
	*/
	public function get_original_file_path($quality) {
		$result = false;
		$initial_quality = $this->get_quality();

		$this->set_quality($quality); // change current component quality temporally
		$ar_originals 	= array();
		$target_dir 	= $this->get_target_dir();

		if(!file_exists($target_dir)) return null;

		if ($handle = opendir($target_dir)) {

		    while (false !== ($file = readdir($handle))) {

		    	if($this->get_video_id() == $file && is_dir($target_dir.'/'.$file)){
		    		/*
		    		$dvd_folder = $target_dir.'/'.$file;
					# dvd_folder dir set permissions 0777

					$stat = stat($dvd_folder);
						//dump($stat['uid'], ' stat: '.posix_geteuid() ) ; die();

		    		if(posix_geteuid() != $stat['uid']){
						chown($dvd_folder, posix_geteuid());
		    		}

					$wantedPerms = 0777;
					$actualPerms = fileperms($dvd_folder);
					if($actualPerms < $wantedPerms) {
						$chmod = chmod($dvd_folder, $wantedPerms);
						if(!$chmod) die(" Sorry. Error on set valid permissions to directory for \"$dvd_folder\".  ") ;
					}


					*/
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
			$result = false;
		}elseif($n===1) {
			#$path = $_FILES['image']['name'];
			#$ext = pathinfo($ar_originals[0], PATHINFO_EXTENSION);
			$result = $target_dir.'/'.$ar_originals[0];
				#dump($result, ' result');
		}else{
			if(SHOW_DEBUG===true) {
				dump($ar_originals, "ar_originals ".to_string($ar_originals));
				trigger_error("ERROR (DEBUG ONLY): Current quality have more than one file. ".to_string($ar_originals));
			}
		}

		// return current component quality
		$this->quality 	= $initial_quality;

		return $result;
	}//end get_original_file_path



	/**
	* GET_VIDEO SIZE
	*/
	public function get_video_size($quality=false, $filename=false) {

		if (!$filename) {
			if(!$quality)
			$quality 	= $this->get_quality();
			$video_id 	= $this->get_video_id();

			$filename 	= DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER. '/' . $quality . '/'. $video_id .'.'. DEDALO_AV_EXTENSION ;
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
				return false;
			}
		}


		$size_kb = round($size / 1024) ;

		if($size_kb <= 1024) return $size_kb . ' KB' ;

		return round($size_kb / 1024) . ' MB' ;
	}//end get_video_size



	/**
	* GET_DURATION_SECONDS
	* @return int $duration_seconds OR string $timecode
	*/
	public function get_duration_seconds($format=null) {

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
	*/
	public function get_source_quality_to_build($target_quality) {

		$ar_quality_source_valid = array();
		$ar_quality 			 = unserialize(DEDALO_AV_AR_QUALITY);
			#dump($ar_quality,'$ar_quality');

		foreach($ar_quality as $current_quality) {

			if($target_quality===DEDALO_AV_QUALITY_ORIGINAL) continue;

			# Current file
			$filename = $this->get_original_file_path($current_quality);

			if ($current_quality!==$target_quality && file_exists($filename)) {
				return $current_quality;
			}
		}#end foreach($ar_quality as $quality)


		return false;
	}//end get_source_quality_to_build



	/**
	* GET_AR_ALL_FILES_BY_QUALITY
	* @param array $ar_quality optional
	* @return array $ar_all_files_by_quality
	*/
	public function get_ar_all_files_by_quality( $ar_quality=false ) {

		if (!$ar_quality) {
			$ar_quality = unserialize(DEDALO_AV_AR_QUALITY);
		}

		$ar_all_files_by_quality=array();
		foreach ($ar_quality as $current_quality) {
			$ar_all_files_by_quality[$current_quality] = $this->get_original_file_path($current_quality);
		}

		return (array)$ar_all_files_by_quality;
	}#end get_ar_all_files_by_quality



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* "Remove" (rename and move files to deleted folder) all media file vinculated to current component (all quality versions)
	* Is triggered wen section tha contain media elements is deleted
	* @see section:remove_section_media_files
	*/
	public function remove_component_media_files() {

		$date=date("Y-m-d_Hi");

		#
		# AV remove
		$ar_quality = (array)unserialize(DEDALO_AV_AR_QUALITY);
		foreach ($ar_quality as $current_quality) {
			# media_path
			$media_path = $this->get_video_path($current_quality);
			if(SHOW_DEBUG===true) {
				#dump($media_path, ' media_path $current_quality:'.$current_quality);
			}
			if (!file_exists($media_path)) continue; # Skip

			# move / rename file
			$folder_path_del 	= DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $current_quality . '/deleted';

			# delete folder exists ?
			if( !is_dir($folder_path_del) ) {
			$create_dir 	= mkdir($folder_path_del, 0777,true);
			if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied.") ;
			}

			$reelID 			= $this->get_video_id();
			$media_path_moved 	= $folder_path_del . "/$reelID" . '_deleted_' . $date . '.' . DEDALO_AV_EXTENSION;
			if( !rename($media_path, $media_path_moved) ) throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");

			if(SHOW_DEBUG===true) {
				$msg=__METHOD__." Moved file \n$media_path to \n$media_path_moved";
				debug_log($msg);
				#dump($msg, ' msg');
			}
		}#end foreach ($ar_quality as $current_quality)

		#
		# Posterframe remove
		$media_path = $this->get_posterframe_path();
		if (file_exists($media_path)) {
			# move / rename file
			$folder_path_del 	= DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/posterframe/deleted';

			# delete folder exists ?
			if( !is_dir($folder_path_del) ) {
			$create_dir 	= mkdir($folder_path_del, 0777,true);
			if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied.") ;
			}

			$reelID 			= $this->get_video_id();
			$media_path_moved 	= $folder_path_del . "/$reelID" . '_deleted_' . $date . '.' . DEDALO_AV_POSTERFRAME_EXTENSION;
			if( !rename($media_path, $media_path_moved) ) throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");

			if(SHOW_DEBUG===true) {
				$msg=__METHOD__." \nMoved file \n$media_path to \n$media_path_moved";
				debug_log($msg);
				#dump($msg, ' msg');
			}
		}

		return true;
	}//end remove_component_media_files



	/**
	* RESTORE_COMPONENT_MEDIA_FILES
	* "Restore" last version of deleted media files (renamed and stored in 'deleted' folder)
	* Is triggered when tool_time_machine recover a section
	* @see tool_time_machine::recover_section_from_time_machine
	*/
	public function restore_component_media_files() {

		#
		# AV restore
		$ar_quality = (array)unserialize(DEDALO_AV_AR_QUALITY);
		foreach ($ar_quality as $current_quality) {

			# media_path
			$media_path = $this->get_video_path($current_quality);
			$media_path = pathinfo($media_path,PATHINFO_DIRNAME).'/deleted';
			$video_id 	= $this->get_video_id();
			if(SHOW_DEBUG===true) {
				#dump($media_path, "media_path current_quality:$current_quality - get_video_id:$video_id");	#continue;
			}
			$file_pattern 	= $media_path.'/'.$video_id.'_*.'.DEDALO_AV_EXTENSION;
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
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $value
	*
	* In time machine mode (list_tm) image is always calculated
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {

		#if ($modo==='portal_list_view_mosaic') {
			$component	= component_common::get_instance(__CLASS__,
														 $tipo,
														 $parent,
														 $modo,
														 $lang,
														 $section_tipo);
			$value 		= $component->get_html();
		#}
		/*
		# Reset posterframe t var to force regenerate
		preg_match("/t=(.{1,20})'\)/", $value, $output_array);
		if (isset($output_array[1])) {
			$value = str_replace($output_array[1], start_time(), $value);
		}*/

		return $value;
	}//end render_list_value



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null ) {

		$diffusion_value = $this->get_video_url(DEDALO_AV_QUALITY_DEFAULT);


		return (string)$diffusion_value;
	}//end get_diffusion_value



	/**
	* AV_FILE_EXIST
	* @return BOOL
	*/
	public function av_file_exist($quality=false) {

		$video_path  = $this->get_video_path($quality);
		$file_exists = file_exists($video_path);

		return $file_exists;
	}//end av_file_exist



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() {

		$allowed_extensions = is_array(DEDALO_AV_EXTENSIONS_SUPPORTED)
			? DEDALO_AV_EXTENSIONS_SUPPORTED
			: unserialize(DEDALO_AV_EXTENSIONS_SUPPORTED);

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_ORIGINAL_QUALITY
	* @return array $original_quality
	*/
	public function get_original_quality() {

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
	public static function move_zip_file($tmp_name, $folder_path, $file_id) {

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
	public function get_preview_url() {

		$preview_url = $this->get_posterframe_url($test_file=true, $absolute=false, $avoid_cache=false);

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
	public function process_uploaded_file($file_data) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.'] ';

		// vars
			$original_file_name = $file_data->original_file_name; 	// kike "my video785.mp4"
			$full_file_name 	= $file_data->full_file_name;		// like "test175_test65_1.mp4"
			$full_file_path 	= $file_data->full_file_path;		// like "/mypath/media/av/404/test175_test65_1.mp4"

			// extension
			$file_ext 	= pathinfo($original_file_name, PATHINFO_EXTENSION);
			if (empty($file_ext)) {
				throw new Exception("Error Processing Request. File extension is unknow", 1);
			}
			// video_id (without extension, like 'test81_test65_2')
			$video_id = $this->get_video_id();
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
						$timecode 	= '00:00:05';
						$Ffmpeg 	= new Ffmpeg();
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
				$propiedades = $this->get_propiedades();
				if (isset($propiedades->target_filename)) {

					$current_section_id  = $this->get_parent();
					$target_section_tipo = $this->get_section_tipo();

					$modelo_name_target_filename= RecordObj_dd::get_modelo_name_by_tipo($propiedades->target_filename,true);
					$component_target_filename 	= component_common::get_instance(
																		$modelo_name_target_filename,
																		$propiedades->target_filename,
																		$current_section_id,
																		'edit',
																		DEDALO_DATA_NOLAN,
																		$target_section_tipo
																		);
					$component_target_filename->set_dato($original_file_name);
					$component_target_filename->Save();
					debug_log(__METHOD__." Saved original filename: ".to_string($original_file_name), logger::DEBUG);
				}

			// all is ok
				$response->result 	= true;
				$response->msg 		= 'Ok. Request done ['.__METHOD__.'] ';

		} catch (Exception $e) {
			$msg = 'Exception[process_uploaded_file][ImageMagick]: ' .  $e->getMessage() . "\n";
			debug_log(__METHOD__." $msg ".to_string(), logger::ERROR);
			$response->msg .= ' - '.$msg;
		}


		return $response;
	}//end process_uploaded_file



}//end class component_av
