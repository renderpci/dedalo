<?php
require_once( DEDALO_CONFIG_PATH .'/config.php');
require_once( DEDALO_CORE_PATH . '/common/class.exec_.php');
require_once( DEDALO_CORE_PATH . '/media_engine/class.PosterFrameObj.php');

/*
* CLASS FFMPEG
*/
class Ffmpeg {
	
	protected $settings_path	= DEDALO_AV_FFMPEG_SETTINGS ;
	protected $ar_settings		= array();					# array of settings files

	# supported qualitys array
	static protected $ar_supported_qualitys = array('1080','720','576','480','404','240','audio');



	public static function get_ffmpeg_installed_path() {	
		return DEDALO_AV_FFMPEG_PATH;
	}	
	public static function get_qt_faststart_installed_path() {		
		return DEDALO_AV_FASTSTART_PATH;		
	}
	

	
	# ARRAY LIST OF SETTING FILES INSIDE DIR 'ffmpeg_settings' 
	public function get_ar_settings() {
		
		if ($folder_content = opendir( $this->settings_path )) {			
			
			while (false !== ($file_name = readdir($folder_content))) {
				if ($file_name != "." && $file_name != ".." && $file_name != ".DS_Store" && $file_name != "acc") {
					
					$this->ar_settings[] = substr($file_name,0,-4);
				}
			}
			closedir($folder_content);
			return 	$this->ar_settings ;		
		}
		return false;

	}//end get_ar_settings


	/**
	* GET_SETTING_NAME_FROM_QUALITY
	* Setting name from quality
	*/
	public function get_setting_name_from_quality(AVObj $AVObj, $quality) {

		# CREATE A NEW AVOBJ AS MASTER MEDIA 
		$master_media_file_obj = $this->get_master_media_file_obj($AVObj); 
		
		# MEDIA STANDAR (PAL/NTSC)
		$media_standar	= strtolower($master_media_file_obj->get_media_standar());
		
		if($media_standar) {
			$media_standar = '_' . $media_standar ;
		}else{
			$media_standar = '';	
		}
		if($quality==='audio') $media_standar = '';
		
		# ASPECT RATIO (16X9/4X3)
		$aspect_ratio = strtolower($master_media_file_obj->get_aspect_ratio());
		if($aspect_ratio == '4x3' || $aspect_ratio == '16x9') {			
			$aspect_ratio = '_' . $aspect_ratio ;
		}else{
			$aspect_ratio = '';	
		}
		
		if($quality==='audio') $aspect_ratio = '';
		
		$setting = $quality . $media_standar . $aspect_ratio ;
		
		return $setting;
	}//end get_setting_name_from_quality
	
	

	# QUALITY FROM SETTING
	public function get_quality_from_setting($setting) {
		
		if($setting==='audio') return $setting;
		
		$ar_quality 	= self::$ar_supported_qualitys;
		
		foreach($ar_quality as $quality) {
		
			$pos	= stripos($setting, $quality);			
			if($pos!==false) return $quality;		
		}
		return false;

	}//end get_quality_from_setting
	

	/**
	* GET_MASTER_MEDIA_FILE
	* Get master media file for generate alternative version
	*/
	public function get_master_media_file($AVObj) {	
	
		$name	 	= $AVObj->get_name();
		$extension	= $AVObj->get_extension();					
			
		$ar_quality = unserialize(DEDALO_AV_AR_QUALITY);
		
		# Recorre el array de calidades de mayor a menor hasta que encuentra una que exista
		if(is_array($ar_quality)) foreach($ar_quality as $quality) {
			
			#$file = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . "/{$quality}/{$name}.{$extension}";
			
				#
				# Search for every possible file whit this name and unknow extension
				$target_dir = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . "/{$quality}";
				if (is_dir($target_dir)) {				
				
					if ($handle = opendir($target_dir)) {
					    while (false !== ($file = readdir($handle))) {

					        // note that '.' and '..' is returned even
							if($name == $file && is_dir($target_dir.'/'.$file)){
					        	$file_path = $target_dir.'/'.$file;
					        	return $file_path;
				    		}

					        $findme = $name . '.';
					        if( strpos($file, $findme)!==false ) {  // && strpos($file, $this->get_target_filename())===false
					        	$file_path = $target_dir.'/'.$file;
					        	return $file_path;
					        }		        
					    }
					    closedir($handle);
					}//end if ($handle = opendir($target_dir)) {
				}

			#if(file_exists($file)) {
			#	return $file; 
			#}
		}//end if(is_array($ar_quality)) foreach($ar_quality as $quality) {
		return false;

	}//end get_master_media_file
	

	
	/**
	* GET_MASTER_MEDIA_FILE_QUALITY
	* Get master media file quality from file name
	* @param object $AVObj
	*/
	public function get_master_media_file_quality($AVObj) {	
	
		$master_media_file = $this->get_master_media_file($AVObj);
		
		$ar 		= explode('/',$master_media_file);
		
		$key 		= count($ar)-1;
		$quality 	= $ar[$key];
				
		return $quality;
	}//end get_master_media_file_quality

	
	
	/**
	* GET_MASTER_MEDIA_FILE_OBJ
	* Get master media file quality from file name
	*/
	public function get_master_media_file_obj($AVObj) {	
	
		$reelID						= $AVObj->get_reelID();
		$master_media_file_quality	= $this->get_master_media_file_quality($AVObj);
		
		$obj = new AVObj($reelID, $master_media_file_quality);
				
		return $obj;
	}//end get_master_media_file_obj
	
	
	
	/**
	* CREATE ALTERNATE VIDEO OR AUDIO VERSION WITH RECEIVED SETTINGS
	* @param $AVObj
	*	AVObj object
	* @param $setting
	*	ffmpeg_settings to aplicate like '404_pal_16x9' (in folder /media_engine/class/ffmpeg_settings)
	*
	* @return $av_alternate_command_exc
	*	Terminal commnad response
	*/
	public function create_av_alternate(AVObj $AVObj, $setting) {
	
		# load ar_settings
		$this->ar_settings = $this->get_ar_settings();		
		
		# verify setting exists
		if( !in_array($setting, $this->ar_settings) ) die("Error: setting: '$setting' not exits! (create_av_alternate). Please contact with your admin to create");		
		# import vars from settings file		
		require_once(DEDALO_AV_FFMPEG_SETTINGS .'/'. $setting .'.php');

		/* EXAMPLE VARS
		$vb				= '960k';			# video rate kbs
		$s				= '720x404';		# scale
		$g				= 75;				# keyframes interval (gob)	
		$vcodec			= 'libx264';		# default libx264

		$progresivo		= "-vf yadif";		# desentrelazar
		$gamma_y		= "0.97";			# correccion de luminancia
		$gamma_u		= "1.01";			# correccion de B-y
		$gamma_v		= "0.98";			# correccion de R-y
		$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
		$force			= 'mp4';			# default mp4

		$ar				= 44100;			# audio sample rate (22050)
		$ab				= '64k';			# adio rate kbs
		$ac				= "1";				# numero de canales de audio 2 = stereo, 1 = nomo
		$acodec			= 'libvo_aacenc';	# default libvo_aacenc

		$target_path 	= "404";			# like '404'
		*/
			
		$target_path		= strval($target_path);	# definido en los settings (usualmente es la calidad sin el sufijo de sistema, como '1080' para 1080_pal)
		
		
		# CREATE FINAL TARGET PATH
		$pre_target_path 	= $AVObj->get_media_path_abs();		
		$pre_target_path 	= substr($pre_target_path,0,-1);	# remove last /
		$ar_pre_target_path	= explode('/',$pre_target_path);	# explode by /
		$result				= array_pop($ar_pre_target_path); 	# remove last element of array (the quality folder)		
		$final_target_path	= implode('/',$ar_pre_target_path).'/'. $target_path ;	

		
			# quality dir exists	
			if( !is_dir($final_target_path) ) {
				try{
					$create_dir = @mkdir($final_target_path, 0777);
				}catch(Exception $e) {
					echo 'Exception: ',  $e->getMessage(), "\n";
				}
				if(!$create_dir) {
					$msg = "Error on read or create directory for \"$setting\". Permission denied !";
					if(SHOW_DEBUG===true) $msg .= " final_target_path: $final_target_path";
					throw new Exception($msg, 1);
				}
			}
			
			# dir set permissions 0777
			$wantedPerms = 0777;
			$actualPerms = fileperms($final_target_path);
			if($actualPerms < $wantedPerms) {
				$chmod = chmod($final_target_path, $wantedPerms);
				if(!$chmod) {
					throw new Exception("Error on set valid permissions to directory for \"$setting\".", 1);
				}
			}
		
		#
		# SOURCE FILE		
		$src_file = $this->get_master_media_file($AVObj);

		# 

		#IF the source file is a directory (DVD folder), change the source file to the .VOB into the DVD folder and set the concat of the .vobs
		if(is_dir($src_file)){
			$is_all_ok = false;
			$vob_files = array();
			if(!is_dir($src_file.'/VIDEO_TS')){
				throw new Exception("Error: is necessary the DVD structure (VIDEO_TS)", 1);
			}
			//minimum size of the initial vob (512KB)
			$vob_filesize = 512*1000;
			if ($handle = opendir($src_file.'/VIDEO_TS')) {
		  		 while (false !== ($file = readdir($handle))) {
		  		 	$extension = pathinfo($file,PATHINFO_EXTENSION);
		  		 	if($extension === 'VOB' && filesize($src_file.'/VIDEO_TS/'.$file) > $vob_filesize){
		  		 		$is_all_ok 	= true;
		  		 		//reset the size of the vob (for the end files of the video)
		  		 		$vob_filesize = 0;
		  		 		$vob_files[]= $src_file.'/VIDEO_TS/'.$file;
		  		 	}
		  		 }
		  	}
		  	if($is_all_ok){
		  		//$src_file	= 'concat:$(echo '.$src_file.'/VIDEO_TS/*.VOB|tr \  \|)';
		  		$concat = '';
		  		foreach ($vob_files as $vob_file) {
		  			$concat .= $vob_file.'|';
		  		}
		  		$src_file	= '\'concat:'.$concat.'\'';
		  		
		  	}else{
		  		throw new Exception("Error: is necessary the DVD structure (.VOB files)", 1);
		  	}		  				  		 		
		}# End if source file is directory

		
		# SOME UTIL VARS		
		$target_file		= $final_target_path 			. '/' .$AVObj->get_name() . '.' . DEDALO_AV_EXTENSION;
		$tmp_folder			= implode('/',$ar_pre_target_path) .'/tmp' ;
		$tmp_file_base		= $tmp_folder . '/tmp_' . time();
		$tmp_file			= $tmp_file_base .'_' . $AVObj->get_name() . '.' . DEDALO_AV_EXTENSION;		
		$log_file 			= $tmp_file_base .'_' . $AVObj->get_name() . '_log';
		
		
			# tmp dir exists	
			if( !is_dir($tmp_folder) ) {
				$create_dir = mkdir($tmp_folder, 0777);
				if(!$create_dir) {
					throw new Exception("Error on read or create directory for \"tmp\" folder. Permission denied ! ", 1);
				}
			}
			
			# tmp dir set permissions 0777
			$wantedPerms = 0777;
			$actualPerms = fileperms($tmp_folder);
			if($actualPerms < $wantedPerms) {
				$chmod = chmod($tmp_folder, $wantedPerms);
				if(!$chmod) die(" Sorry. Error on set valid permissions to directory for \"tmp\".  ") ;
			}		
		
		# target quality
		$target_quality = $this->get_quality_from_setting($setting);
		$prgfile 		= $tmp_folder .'/' . $target_quality .'_'. $AVObj->get_name() . '.sh';	



		#
		# FFPROBE GET STREAMS INFO
		$media_streams = self::get_media_streams( $src_file );
		$source_with_video = false;
		$source_with_audio = false;

		foreach ( reset($media_streams) as $stream_obj) {
			$codec_type = $stream_obj->codec_type;
			if ($codec_type==='audio') {
				$source_with_audio = true;
			}else if ($codec_type==='video') {
				$source_with_video = true;
			}
		}

		#
		# FFMPEG AUDIO CODEC TEST
		$acodec = self::get_audio_codec();

		
		# COMMANDS SHELL
		$command	 = '';			
		
		if($setting==='audio') {
			
			switch (true) {
				case ($source_with_audio===false):
					#
					# SOURCE NOT CONTAINS ANY AUDIO TRACK
					return false;
					break;
				
				default:
					#
					# SOURCE CONTAINS ANY AUDIO TRACK

					# paso 1 extraer el audio		
					#$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -vn -acodec copy $tmp_file ";			
					# convert format always
					$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -vn -acodec $acodec -ar 44100 -ab 128k -ac 2 $target_file ";
					# fast-start
					#$command	.= "&& ".DEDALO_AV_FASTSTART_PATH." $tmp_file $target_file ";			
					# delete media temp
					#$command	.= "&& rm -f $tmp_file ";
					# delete self sh file
					$command	.= "&& rm -f " . $prgfile;
					break;
			}
		}else{			
			
			switch (true) {

				case ($source_with_video===false):
					#
					# CASE ORIGINAL HAVE ONLY AUDIO
					$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -vn -acodec $acodec -ar 44100 -ab 128k -ac 2 $target_file ";
					break;
				
				default:
					#
					# CASE ORIGINAL HAVE AUDIO AND VIDEO OR ONLY VIDEO

					/* EXAMPLE VARS
					$vb				= '960k';			# video rate kbs
					$s				= '720x404';		# scale
					$g				= 75;				# keyframes interval (gob)	
					$vcodec			= 'libx264';		# default libx264

					$progresivo		= "-vf yadif";		# desentrelazar
					$gamma_y		= "0.97";			# correccion de luminancia
					$gamma_u		= "1.01";			# correccion de B-y
					$gamma_v		= "0.98";			# correccion de R-y
					$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
					$force			= 'mp4';			# default mp4

					$ar				= 44100;			# audio sample rate (22050)
					$ab				= '64k';			# adio rate kbs
					$ac				= "1";				# numero de canales de audio 2 = stereo, 1 = nomo
					$acodec			= 'libvo_aacenc';	# default libvo_aacenc

					$target_path 	= "404";			# like '404'
					*/
					# paso 1 sólo video			
					$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -an -pass 1 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force -passlogfile $log_file -y /dev/null ";
					
					# paso 2 video
					$command	.= "&& nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -pass 2 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force -passlogfile $log_file -y ";			
					
					# paso 2 audio
					$command	.= "-acodec $acodec -ar $ar -ab $ab -ac $ac -y $tmp_file ";													
					
					# fast-start
					$command	.= "&& nice -n 19 ".DEDALO_AV_FASTSTART_PATH." $tmp_file $target_file ";														
					
					# delete media temp
					$command	.= "&& rm -f $tmp_file ";
					
					# delete log temps (all generated logs files)
					$command	.= "&& rm -f $log_file* ";

					# delete self sh file
					$command	.= "&& rm -f " . $prgfile;
					break;
			}			
		}//end if($setting=='audio') {
		
		
		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." Creating AV version:\n ".to_string($command), logger::DEBUG);
		}
		#$av_alternate_command_exc = exec_::exec_command($command);
					
		# SH FILE	
		#if(is_resource($prgfile)) chmod($prgfile, 0755); 
		$fp = fopen($prgfile, "w"); 
		fwrite($fp, "#!/bin/bash\n"); 
		fwrite($fp, "$command\n");
		fclose($fp);

		if(file_exists($prgfile)) {
			chmod($prgfile, 0755);
		}else{
			throw new Exception("Error Processing Media. Script file not exists or is not accessible", 1);	
			#trigger_error("Error Processing Media. Script file not exists or is not accessible");	
		}
				
		$av_alternate_command_exc = exec_::exec_sh_file($prgfile);		

		return $av_alternate_command_exc;
	}//end create_av_alternate

	
	
	/**
	* CREATE POSTERFRAME
	* @param $AVObj
	*	AVObj Object
	* @param $timecode
	*	Float number timecode like 102.369217 (from javascript media engine tc control)
	*	Is formated here to ffmpeg as 102.369
	* @param $ar_target
	*	array|bool default false
	*
	* @return $posterFrame_command_exc
	*	Terminal commnad response
	*/
	public function create_posterframe(AVObj $AVObj, $timecode, $ar_target=false) {
		
		# SRC VIDEO FILE
		$src_file = $AVObj->get_media_path_abs()	. $AVObj->get_name() . '.' . $AVObj->get_extension();
		
		$aspect_ratio = strtolower($AVObj->get_aspect_ratio());
		if($aspect_ratio == '4x3') {			
			$aspect_ratio = '-vf scale=540:404:force_original_aspect_ratio' ;
		}else{
			$aspect_ratio = '';	
		}

		# SI NO EXISTE EL DEFAULT, BUSCAMOS OTRO DE MAYOR A MENOR
		if(!file_exists($src_file)) {			
			$src_file		= $this->get_master_media_file($AVObj);		
		}
		if (!$src_file) {
			debug_log(__METHOD__." Error: src_file not found src_file 2. ".to_string($src_file), logger::ERROR);			
			return false;
		}
		
		
		# IMAGE JPG TARGET FILE	
		if ($ar_target) {
			# Forced case. Paths ar received directly (identifying image for example)
			$target_path 	= $ar_target['target_path'];  // Absolute path to image dir
			$target_file 	= $ar_target['target_file'];  // Absolute final path of file (included target_path)
		}else{
			# Deafult case . Paths are extracted from PosterFrameObj
			$PosterFrameObj	= new PosterFrameObj($reelID = $AVObj->get_name(), $tc=NULL);
			$target_path	= DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . '/posterframe';
			$target_file	= $target_path .'/'. $AVObj->get_name() . '.' . $PosterFrameObj->get_extension();
		}
		
			# posterframe dir exists	
			if( !is_dir($target_path) ) {				
				$create_dir = mkdir($target_path, 0777);
				if(!$create_dir) die(" Sorry. Error on read or create directory for \"posterframe\" folder. Permission denied !  ") ; # [$final_target_path]
				
				# image zero 0.jpg from dedalo images to posterframe images
				if(!file_exists("{$target_path}/0.jpg")) {
					$image_zero = DEDALO_ROOT ."/images/0.jpg";
					if(file_exists($image_zero))
					copy($image_zero, "{$target_path}/0.".DEDALO_AV_POSTERFRAME_EXTENSION);
				}
			}
			
			# tmp dir set permissions 0777
			$wantedPerms = 1777;
			$actualPerms = fileperms($target_path);
			if($actualPerms < $wantedPerms) {
				$chmod = chmod($target_path, $wantedPerms);
				if(!$chmod) {
					throw new Exception("Error Processing Request. Sorry. Error on set valid permissions to directory for \"posterframe\".", 1);
				 	#die(" Sorry. Error on set valid permissions to directory for \"posterframe\".  ") ;
				}
			}			
			
	
		# COMMANDS SHELL
		$command	 = '';
		
		# FFMPEG timecode
		# Convertivos el valor recibido a número flotante y 
		# redondeamos a 3 decimales el valor para pasarloa ffmpeg tipo '40.100'
		$timecode = number_format((float)$timecode, 3, '.', '');
			
		# paso 1 sólo video			
		#$command	.= DEDALO_AV_FFMPEG_PATH . " -itsoffset -$timecode -i $src_file -y -vframes 1 -f rawvideo -an -vcodec mjpeg $target_file > /dev/null  ";
		$command	.= DEDALO_AV_FFMPEG_PATH . " -ss $timecode -i $src_file -y -vframes 1 -f rawvideo -an -vcodec mjpeg $aspect_ratio $target_file ";


		# EXEC COMMAND									
		$posterFrame_command_exc = exec_::exec_command($command);		
		
		return $posterFrame_command_exc;
	}//end create_posterframe	
	
	
	
	/**
	* BUILD_FRAGMENT
	* @return created file url
	*/
	public function build_fragment(AVObj $AVObj, $tcin, $tcout, $target_filename, $watermark=0) {

		$ffmpeg_installed_path  	= DEDALO_AV_FFMPEG_PATH;
		$reelID 					= $AVObj->get_reelID();
		$source_file 				= $AVObj->get_media_path_abs() . $reelID .'.'. $AVObj->get_extension();
		$target_filename_path 		= $AVObj->get_media_path_abs() . 'fragments/' . $target_filename;

		$tcin_secs 	= OptimizeTC::TC2seg($tcin);
		$tcout_secs = OptimizeTC::TC2seg($tcout);		
		$duration 	= $tcout_secs - $tcin_secs;
		# duration is float like 538.521 and need to be converted to tc like 00:06:53.734
		$duration 	= OptimizeTC::seg2tc($duration);

		debug_log(__METHOD__." ++ build_fragment duration ".$duration, logger::WARNING);
		
		$watermark_file = DEDALO_AV_WATERMARK_FILE;

			# fragments dir exists
			$fragments_folder = $AVObj->get_media_path_abs() . 'fragments';
			if( !is_dir($fragments_folder) ) {
				$create_dir = mkdir($fragments_folder, 0777);
				if(!$create_dir) {
					if(SHOW_DEBUG===true) {
						debug_log(__METHOD__." Error trying to create: $fragments_folder ".to_string(), logger::ERROR);
					}
					throw new Exception("Error on read or create directory for \"fragments\" folder. Permission denied ! ", 1);
				}
			}
			
			# fragments dir set permissions 0777
			$wantedPerms = 0777;
			$actualPerms = fileperms($fragments_folder);
			if($actualPerms < $wantedPerms) {
				$chmod = chmod($fragments_folder, $wantedPerms);
				if(!$chmod) die(" Sorry. Error on set valid permissions to directory for \"fragments\".  ") ;
			}

		if ($watermark==1) {

			$target_filename_path_temp = $AVObj->get_media_path_abs() .'fragments/temp_'. $target_filename;

			#$command = "nice -n 19 $ffmpeg_installed_path -i $source_file -ss $tcin -t $duration -vcodec copy -acodec copy -y $target_filename_path_temp";
			$command  = "nice -n 19 $ffmpeg_installed_path -ss $tcin  -i $source_file -t ".$duration." -vcodec copy -acodec copy -y $target_filename_path_temp";

			$command .= " && nice -n 19 $ffmpeg_installed_path -i $target_filename_path_temp -vf 'movie=$watermark_file [watermark]; [in][watermark] overlay=main_w-overlay_w-10:10 [out]' -y $target_filename_path";
			
			# EXEC COMMAND
			#$command_exc = Exec::exec_command($command);
			$command_exc = shell_exec( $command );
			
		}else{

			# nice -n 19 
			#$command = "$ffmpeg_installed_path -i $source_file -ss $tcin -t $duration -vcodec copy -acodec copy -y $target_filename_path";
			$command = "$ffmpeg_installed_path -ss $tcin -i $source_file -t ".$duration." -vcodec copy -acodec copy -y $target_filename_path";

			# EXEC COMMAND
			$command_exc = exec_::exec_command($command);

			error_log($command);
		}

		$file_url = 'http://' . $_SERVER['HTTP_HOST'] . $AVObj->get_media_path() .'fragments/'. $target_filename;

		return $file_url;
	}//end build_fragment
	
	
	
	/**
	* CONFORM_HEADER
	*/
	public function conform_header(AVObj $AVObj) {
		
		$result = false;		
		
		$ffmpeg_installed_path 			= DEDALO_AV_FFMPEG_PATH;
		$qt_faststart_installed_path 	= DEDALO_AV_FASTSTART_PATH;

		//$AVObj->get_media_path_abs()	.
		$file_path 			= $AVObj->get_name() . '.' . $AVObj->get_extension();	//$AVObj->get_local_full_path();		
		$file_path_temp 	= $AVObj->get_name() . '_temp.' . $AVObj->get_extension();;	//str_replace('.mp4', '_.mp4', $file_path);
		$file_path_original = $AVObj->get_name() . '_untouched.' . $AVObj->get_extension();;	//str_replace('.mp4', '_.mp4', $file_path);

		$source_file_path = $AVObj->get_local_full_path();

		$path_parts 	  = pathinfo($source_file_path);
		$target_file_path = $path_parts['dirname'].'/'.$path_parts['filename'].'.'.$path_parts['extension'];
	
		$command  = '';
		
		$command .= "cd ".$AVObj->get_media_path_abs()." ";
		
		# Copy file
		$command .= "&& $ffmpeg_installed_path -i $file_path -c:v copy -c:a copy $file_path_temp ";	# && rm -f $file_path && mv $file_path_temp $file_path # -y
		
		# Rename original to conservate original file untouched
		$command .= "&& mv $file_path $file_path_original ";
		
		# Rename new file as source
		#$command .= "&& mv $file_path_temp $file_path ";

		# Faststart (build final file)
		$command .= "&& $qt_faststart_installed_path $file_path_temp $target_file_path ";

		# Remove temp file
		$command .= "&& rm -f $file_path_temp ";

		
		try {

			$result = shell_exec( $command );

		} catch (Exception $e) {
		    echo 'Caught exception: ',  $e->getMessage(), "\n";
		    if(SHOW_DEBUG===true) {
		    	dump($e->getMessage(), " EXCEPTION ".to_string());
		    }		    	
		}
		
		#$conform_header_command_exc = Exec::exec_command($command);

		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." Exec command conform headers: sudo -u _www $command .".to_string($result), logger::DEBUG);
		}

		return $result;
	}//end conform_header


	
	/**
	* CONVERT_AUDIO
	*/
	public function convert_audio(AVObj $AVObj, $uploaded_file_path) {

		$ffmpeg_installed_path 			= DEDALO_AV_FFMPEG_PATH;
		$qt_faststart_installed_path 	= DEDALO_AV_FASTSTART_PATH;

		$output_file_path = $AVObj->get_local_full_path();

		$command  = '';

		# ffmpeg -i INPUT_FILE.EXT -aq 500 -acodec libfaac -map_meta_data OUTPUT_FILE.EXT:INPUT_FILE.EXT OUTPUT_FILE.EXT
		# ffmpeg -i INPUT_FILE.EXT -aq 70 -acodec libfaac -map_meta_data OUTPUT_FILE.EXT:INPUT_FILE.EXT OUTPUT_FILE.EXT
		# ffmpeg -i input.wav -c:a libfdk_aac -b:a 128k output.m4a
		# ffmpeg -i input.wav -strict experimental -c:a aac -b:a 240k output.m4a

		#
		# FFMPEG AUDIO CODEC TEST
		$acodec = self::get_audio_codec();
		
		# Convert file
		$command .= "$ffmpeg_installed_path -i $uploaded_file_path -acodec $acodec -ar 44100 -ab 240k -ac 2 $output_file_path ";

		# Faststart
		$command .= "&& $qt_faststart_installed_path $output_file_path $output_file_path ";

		if(SHOW_DEBUG===true) {
			#error_log($command);
		}

		$result = shell_exec( $command );
		#$conform_header_command_exc = Exec::exec_command($command);

		if(SHOW_DEBUG===true) error_log("Admin Debug command for ".__METHOD__."<div class=\"notas\">sudo -u _www $command </div><hr>") ;

		return $result;

	}//end conform_header



	/**
	* CONVERT_TO_DEDALO_AV
	* Transcode any media to dedalo standar quality (usually 404)
	* Not return nothing, open terminal proccess and send resutl to /dev/null
	*/
	public static function convert_to_dedalo_av( $source_file, $target_file, $async=true ) {
		
		$ffmpeg_path 		= DEDALO_AV_FFMPEG_PATH;
		$qt_faststart_path  = DEDALO_AV_FASTSTART_PATH;

		#
		# FFMPEG AUDIO CODEC TEST
		$acodec = self::get_audio_codec();

		$path_parts 	  = pathinfo($target_file);
		$temp_target_file = $path_parts['dirname'] .'/'. $path_parts['filename'] .'_temp.' . $path_parts['extension'];

		$heigth = DEDALO_AV_QUALITY_DEFAULT; // 404, 240 ..
		
		# COMMAND: Full process
		#$command  = "nice $ffmpeg_path -y -i $source_file -vf \"yadif=0:-1:0, scale=720:404:-1\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $target_file ";
		#$command  = "nice $ffmpeg_path -y -i $source_file -vf \"yadif=0:-1:0, scale=720:404:-1\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $temp_target_file ";
		$command  = "nice $ffmpeg_path -y -i $source_file -vf \"yadif=0:-1:0, scale=-2:{$heigth}\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $temp_target_file ";
		$command .= "&& mv $temp_target_file $target_file ";
		# Comando procesado sólo fast start
		#$command = "nice $qt_faststart_path $source_file $target_file";

		debug_log(__METHOD__." command: $command ", logger::DEBUG);
		
		if ($async) {
			# Exec without wait finish
			exec("$command  > /dev/null &");
		}else{
			# Exec wait finish
			exec("$command");
		}		
	}//end convert_to_dedalo_av



	/**
	* GET_MEDIA_ATTRIBUTES
	* @return object json mixed file info like:
	* stdClass Object
	*	(
	*	    [format] => stdClass Object
	*	        (
	*	            [filename] => /Users/paco/Trabajos/Dedalo/site_dedalo_plataforma_40/media_test/media_192.168.1.7/av/404/rsc35_rsc167_15.mp4
	*	            [nb_streams] => 2
	*	            [nb_programs] => 0
	*	            [format_name] => mov,mp4,m4a,3gp,3g2,mj2
	*	            [format_long_name] => QuickTime / MOV
	*	            [start_time] => -0.001333
	*	            [duration] => 4237.866667
	*	            [size] => 545314647
	*	            [bit_rate] => 1029413
	*	            [probe_score] => 100
	*	            [tags] => stdClass Object
	*	                (
	*	                    [major_brand] => mp42
	*	                    [minor_version] => 1
	*	                    [compatible_brands] => mp42mp41
	*	                    [creation_time] => 2012-07-11 12:10:32
	*	                )
	*	        )
	*	)
	*/
	public static function get_media_attributes( $source_file ) {		
		
	    $command = DEDALO_AV_FFPROBE_PATH . ' -v quiet -print_format json -show_format ' . $source_file . ' 2>&1';  
	    $output  = json_decode( shell_exec($command) );  

	   	return $output;

	}//end get_media_attributes



	/**
	* GET_MEDIA_STREAMS
	*/
	public static function get_media_streams( $source_file ) {
		
	    $command = DEDALO_AV_FFPROBE_PATH . ' -v quiet -show_streams -print_format json ' . $source_file . ' 2>&1';  
	    $output  = json_decode( shell_exec($command) );  

	   	return $output;

	}//end get_media_streams
	


	/**
	* GET_AUDIO_CODEC
	* @return string $acodec
	*/
	public static function get_audio_codec() {

		#
		# FFMPEG AUDIO CODEC TEST
		$ffmpeg_info = shell_exec(DEDALO_AV_FFMPEG_PATH .' -buildconf');
		if (strpos($ffmpeg_info, '--enable-libfdk-aac')!==false) {
			// Version >=3 with libfdk-aac installed
			$acodec = 'libfdk_aac'; // Note uderscore '_'			
		}else if (strpos($ffmpeg_info, 'libvo-aacenc')!==false) {
			// Default only with version <3
			$acodec = 'libvo_aacenc';  // Note uderscore '_'
		}else{
			// Default native ffmpeg >= 3
			$acodec = 'aac';
		}
		debug_log(__METHOD__." Using audio codec $acodec from ffmpeginfo : ".to_string($ffmpeg_info), logger::DEBUG);

		return $acodec;
	}//end get_audio_codec



	
}//end Ffmpeg class
?>