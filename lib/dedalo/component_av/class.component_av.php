<?php
/*
* CLASS COMPONENT AV
*/
include_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.AVObj.php');
include_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');


class component_av extends component_common {
	
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
		
		if(SHOW_DEBUG) {
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
				
			
		if ($need_save) {
			# result devuelve el id de la sección parent creada o editada
			$result = $this->Save();			
			debug_log(__METHOD__." CREATED/UPDATED ".RecordObj_dd::get_termino_by_tipo($this->tipo)." locator (to ".$locator->get_flat().") of current ".get_called_class()." (tipo:$this->tipo - section_tipo:$this->section_tipo - parent:$this->parent - lang:$this->lang)");
					
		}#end if ($need_save)
		

		if(SHOW_DEBUG) {
			global$TIMER;$TIMER[__METHOD__.'_OUT_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

	}#end __construct



	# GET DATO : Format {"counter":1}
	public function get_dato() {
		$dato = parent::get_dato();
		return (object)$dato;
	}
	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}
	

	
	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		#unset($this->ar_tools_name);
		$this->ar_tools_name = array();

		# Add tool_transcription
		$this->ar_tools_name[] = 'tool_transcription';

		# Add tool_av_versions
		$this->ar_tools_name[] = 'tool_av_versions';

		# Add tool_posterframe
		$this->ar_tools_name[] = 'tool_posterframe';
		
		return parent::get_ar_tools_obj();
	}



	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		return $this->valor = $this->get_video_id();
	}



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG ) {
			
		if (is_null($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$av_file_path = $this->get_valor() . '.'.DEDALO_AV_EXTENSION;	
		
		$test_file 		= true;	// output dedalo image placeholder when not file exists
		$absolute 		= true;	// otuput absolute path like 'http://myhost/mypath/myimage.jpg'
		
		$posterframe_file_path	= $this->get_posterframe_url($test_file, $absolute);

		$valor_export = $av_file_path .",".$posterframe_file_path;		
		
		if(SHOW_DEBUG) {
			#return "AV: ".$valor_export;
		}
		return $valor_export;

	}#end get_valor_export
	


	/**
	* GET VIDEO ID
	* 
	*/
	public function get_video_id() {

		if(isset($this->video_id)) return $this->video_id;
		
		$dato = $this->get_dato();
		if (!isset($dato->section_id)) {
			if(SHOW_DEBUG) {
				debug_log(__METHOD__." Component dato is empty from tipo:$this->tipo, parent:$this->parent, section_tipo:$this->section_tipo", logger::WARNING);
			}
			return 0;	
		}
		$locator  = new locator($dato);
		$video_id = $locator->get_flat($dato);
			#dump($video_id,'video_id');	

		return $this->video_id = $video_id;
	}
	public function get_av_id() { return $this->get_video_id();	} // Alias of get_video_id()



	/**
	* GET QUALITY
	*/
	public function get_quality() {
		if(!isset($this->quality))	return DEDALO_AV_QUALITY_DEFAULT;
		return $this->quality;
	}



	/**
	* UPLOAD NEEDED
	*/
	public function get_target_filename() {
		return $this->video_id .'.'. DEDALO_AV_EXTENSION ;
	}
	public function get_target_dir() {
		return DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .'/'. $this->get_quality() ;
		#return $this->AVObj->get_media_path_abs();
	}
	


	/**
	* GET_VIDEO_URL
	*/
	public function get_video_url($quality=false) {		
		#return $this->AVObj->get_media_path();

		if(!$quality)
		$quality 	= $this->get_quality();
		$video_id 	= $this->get_video_id();

		return DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER .'/'. $quality . '/'. $video_id .'.'. DEDALO_AV_EXTENSION ;
	}


	
	/**
	* GET_VIDEO_PATH
	*/
	public function get_video_path($quality=false) {

		#return $this->AVObj->get_media_path_abs();
		if(!$quality){
		$quality 	= $this->get_quality();	
		}
		
		$video_id 	= $this->get_video_id();

		return DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .'/'. $quality . '/'. $video_id .'.'. DEDALO_AV_EXTENSION ;
	}



	/**
	* GET_POSTERFRAME_PATH
	*/
	public function get_posterframe_path() {
		return DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .'/posterframe/'. $this->get_video_id() . '_' . DEDALO_DATA_LANG.'.'.DEDALO_AV_POSTERFRAME_EXTENSION;
	}
	


	/**
	* GET_POSTERFRAME_URL
	*/
	public function get_posterframe_url($test_file=true, $absolute=false) {
		
		$video_id 	= $this->get_video_id();		

		$posterframe_url = DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER .'/posterframe/'. $video_id .'.'. DEDALO_AV_POSTERFRAME_EXTENSION;

		# FILE EXISTS TEST : If not, show '0' dedalo image logo
		if ($test_file) {
			$file = DEDALO_MEDIA_BASE_PATH .DEDALO_AV_FOLDER.'/posterframe/'. $video_id .'.'. DEDALO_AV_POSTERFRAME_EXTENSION ;
			if(!file_exists($file)) {
				$posterframe_url = DEDALO_LIB_BASE_URL . '/themes/default/0.jpg';
			}
		}

		# ABSOLUTE (Default false)
		if ($absolute) {
			$posterframe_url = DEDALO_PROTOCOL . DEDALO_HOST . $posterframe_url;
		}		

		return $posterframe_url;
	}



	/**
	* GET_SUBTITLES_PATH
	*/
	public function get_subtitles_path() {
		return DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER.'/'. $this->get_video_id().'_'.DEDALO_DATA_LANG.'.'.DEDALO_AV_SUBTITLES_EXTENSION;
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
		if ($n==0) {
			$result = false;
		}elseif($n==1) {
			#$path = $_FILES['image']['name'];
			#$ext = pathinfo($ar_originals[0], PATHINFO_EXTENSION);
			$result = $target_dir.'/'.$ar_originals[0];
				#dump($result, ' result');
		}else{
			if(SHOW_DEBUG) {
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

			$filename 	= DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER. '/' . $quality . '/'. $video_id .'.'. DEDALO_AV_EXTENSION ;
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
			  		 	if($extension == 'VOB' && filesize($filename.'/VIDEO_TS/'.$file) > $vob_filesize){
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

	}//edn get_video_size
	
	
	
	/**
	* GET_SUBTITLES_URL
	*/
	public function get_subtitles_url() {		
		return DEDALO_MEDIA_BASE_URL . DEDALO_AV_FOLDER . DEDALO_SUBTITLES_FOLDER. '/'. $this->get_video_id().'_'.DEDALO_DATA_LANG .'.'.DEDALO_AV_SUBTITLES_EXTENSION;		
	}



	/**
	* GET_SOURCE_QUALITY_TO_BUILD
	* Iterate array DEDALO_AV_AR_QUALITY (Order by quality big to small)
	*/	
	public function get_source_quality_to_build($target_quality) {
		
		$ar_quality_source_valid = array();
		$ar_quality 			 = unserialize(DEDALO_AV_AR_QUALITY);
			#dump($ar_quality,'$ar_quality');		

		foreach($ar_quality as $current_quality) {

			# Current file
			$filename = $this->get_original_file_path($current_quality);			
			
			if (file_exists($filename)) {

				# Add current quality as source valid 
				$ar_quality_source_valid[] = $current_quality;
					#dump($filename,'$file_exists');
			}else{

				# Return first value found inside array of quality
				if(!empty($ar_quality_source_valid)) foreach ($ar_quality_source_valid as $quality_source) {

					if ($current_quality == $target_quality) return $quality_source;						
				}
			}
			
		}#end foreach($ar_quality as $quality)
		
		return false;
	}



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
			if(SHOW_DEBUG) {
				#dump($media_path, ' media_path $current_quality:'.$current_quality);
			}
			if (!file_exists($media_path)) continue; # Skip
			
			# move / rename file
			$folder_path_del 	= DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .'/'. $current_quality . '/deleted';

			# delete folder exists ?
			if( !is_dir($folder_path_del) ) {
			$create_dir 	= mkdir($folder_path_del, 0777,true);
			if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied.") ;
			}

			$reelID 			= $this->get_video_id();
			$media_path_moved 	= $folder_path_del . "/$reelID" . '_deleted_' . $date . '.' . DEDALO_AV_EXTENSION;			
			if( !rename($media_path, $media_path_moved) ) throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");

			if(SHOW_DEBUG) {
				$msg=__METHOD__." Moved file \n$media_path to \n$media_path_moved";
				debug_log($msg);
				#dump($msg, ' msg');
			}
		}#end foreach

		#
		# Posterframe remove
		$media_path = $this->get_posterframe_path();
		if (file_exists($media_path)) {
			# move / rename file
			$folder_path_del 	= DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER .'/posterframe/deleted';

			# delete folder exists ?
			if( !is_dir($folder_path_del) ) {
			$create_dir 	= mkdir($folder_path_del, 0777,true);
			if(!$create_dir) throw new Exception(" Error on read or create directory \"deleted\". Permission denied.") ;
			}
			
			$reelID 			= $this->get_video_id();
			$media_path_moved 	= $folder_path_del . "/$reelID" . '_deleted_' . $date . '.' . DEDALO_AV_POSTERFRAME_EXTENSION;
			if( !rename($media_path, $media_path_moved) ) throw new Exception(" Error on move files to folder \"deleted\" . Permission denied . The files are not deleted");

			if(SHOW_DEBUG) {
				$msg=__METHOD__." \nMoved file \n$media_path to \n$media_path_moved";
				debug_log($msg);
				#dump($msg, ' msg');
			}
		}

		return true;
	}#end remove_component_media_files



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
			if(SHOW_DEBUG) {
				#dump($media_path, "media_path current_quality:$current_quality - get_video_id:$video_id");	#continue;
			}
			$file_pattern 	= $media_path.'/'.$video_id.'_*.'.DEDALO_AV_EXTENSION;
			$ar_files 		= glob($file_pattern);
			if(SHOW_DEBUG) {
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

			if(SHOW_DEBUG) {
				$msg=__METHOD__." Moved file \n$last_file_path to \n$new_file_path";
				debug_log($msg);
				#dump($msg, ' msg');
			}
			
		}#end foreach
		

		#
		# Posterframe restore
		$media_path = $this->get_posterframe_path();
		$media_path = pathinfo($media_path,PATHINFO_DIRNAME).'/deleted';
		$video_id 	= $this->get_video_id();
		if(SHOW_DEBUG) {
			#dump($media_path, "media_path posterframe - get_video_id:$video_id");	#continue;
		}
		$file_pattern 	= $media_path.'/'.$video_id.'_*.'.DEDALO_AV_POSTERFRAME_EXTENSION;
		$ar_files 		= glob($file_pattern);
		if(SHOW_DEBUG) {
			#dump($ar_files, ' ar_files');#continue;
		}
		if (empty($ar_files)) {
			debug_log(__METHOD__." No files to restore were found for posterframe:$video_id. Nothing was restored (3)");			
		}else {
			natsort($ar_files);	# sort the files from newest to oldest
			$last_file_path = end($ar_files);
			$new_file_path 	= $this->get_posterframe_path();
			if( !rename($last_file_path, $new_file_path) ) throw new Exception(" Error on move files to restore folder. Permission denied to restore posterframe. Nothing was restored (4)");

			if(SHOW_DEBUG) {
				$msg=__METHOD__." \nMoved file \n$last_file_path to \n$new_file_path";
				debug_log($msg);
				#dump($msg, ' msg');
			}
		}		

		return true;
		
	}#end restore_component_media_files



	
}
?>