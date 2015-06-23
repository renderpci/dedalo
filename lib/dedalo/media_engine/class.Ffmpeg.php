<?php
/*
* CLASS FFMPEG
*/
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/common/class.exec_.php');
require_once( DEDALO_LIB_BASE_PATH . '/media_engine/class.PosterFrameObj.php');

class Ffmpeg {
	
	protected $settings_path	= DEDALO_AV_FFMPEG_SETTINGS ;
	protected $ar_settings		= array();					# array of settings files

	# supported qualitys array
	static protected $ar_supported_qualitys = array('1080','720','576','480','404','240','audio');
	
	
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
	}

	
	# SETTING NAME FROM QUALITY
	public function get_setting_name_from_quality(AVObj $AVObj, $quality) {
		
		# CREATE A NEW AVOBJ AS MASTER MEDIA 
		$master_media_file_obj = $this->get_master_media_file_obj($AVObj); 	#dump($master_media_file_obj, ' master_media_file_obj'); 
		
		# MEDIA STANDAR (PAL/NTSC)
		$media_standar	= strtolower($master_media_file_obj->get_media_standar());
		
		if($media_standar) {
			$media_standar = '_' . $media_standar ;
		}else{
			$media_standar = '';	
		}
		if($quality=='audio') $media_standar = '';
		
		# ASPECT RATIO (16X9/4X3)
		$aspect_ratio	= strtolower($master_media_file_obj->get_aspect_ratio());		
		if($aspect_ratio =='4x3' || $aspect_ratio =='16x9') {			
			$aspect_ratio = '_' . $aspect_ratio ;
		}else{
			$aspect_ratio = '';	
		}
		
		if($quality=='audio') $aspect_ratio = '';
		
		$setting = $quality . $media_standar . $aspect_ratio ;
		
		return $setting;
	}
	
	
	# QUALITY FROM SETTING
	public function get_quality_from_setting($setting) {
		
		if($setting=='audio') return $setting;
		
		$ar_quality 	= self::$ar_supported_qualitys;
		
		foreach($ar_quality as $quality) {
		
			$pos	= stripos($setting, $quality);			
			if($pos!==false) return $quality;		
		}
		return false;	
	}
	
	
	# GET MASTER MEDIA FILE FOR GENERATE ALTERNATIVE VERSION
	public function get_master_media_file($AVObj) {	
	
		$name	 	= $AVObj->get_name();
		$extension	= $AVObj->get_extension();
			
		$ar_quality = unserialize(DEDALO_AV_AR_QUALITY);
		
		# Recorre el array de calidades de mayor a menor hasta que encuentra una que exista
		if(is_array($ar_quality)) foreach($ar_quality as $quality) {
			
			$file = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . "/{$quality}/{$name}.{$extension}";
			if(file_exists($file)) {
				return $file; 
			}
		}
		return false;
	}
	
	
	# GET MASTER MEDIA FILE QUALITY FROM FILE NAME
	public function get_master_media_file_quality($AVObj) {	
	
		$master_media_file = $this->get_master_media_file($AVObj);
		
		$ar 		= explode('/',$master_media_file);
		
		$key 		= count($ar)-1;
		$quality 	= $ar[$key];
				
		return $quality;
	}
	
	
	# GET MASTER MEDIA FILE QUALITY FROM FILE NAME
	public function get_master_media_file_obj($AVObj) {	
	
		$reelID						= $AVObj->get_reelID();
		$master_media_file_quality	= $this->get_master_media_file_quality($AVObj);
		
		$obj = new AVObj($reelID, $master_media_file_quality);
				
		return $obj;
	}
	
	
	
	/**
	* CREATE ALTERNATE VIDEO OR AUDIO VERSION WITH RECEIVED SETTINGS
	* @param $AVObj
	*	AVObj object
	* @param $setting
	*	ffmpeg_settings to aplicate like '404_pal_16x9' (in folder /media_engine/class/ffmpeg_settings)
	*
	* @return $av_alternate_command_exc
	*	Terminal commnad response
	*
	*/
	public function create_av_alternate(AVObj $AVObj, $setting) {
				
		# load ar_settings
		$this->ar_settings = $this->get_ar_settings();
		
		# verify setting exists
		if( !in_array($setting, $this->ar_settings) ) die("Error: setting: '$setting' not exits!");		
		
		# import vars from settings file		
		require_once(DEDALO_AV_FFMPEG_SETTINGS .'/'. $setting .'.php');
			
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
					if(SHOW_DEBUG) $msg .= " final_target_path: $final_target_path";
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
		
		# SOURCE FILE		
		$src_file			= $this->get_master_media_file($AVObj);		
		
		# SOME UTIL VARS		
		$target_file		= $final_target_path 			. '/' .$AVObj->get_name() . '.' . DEDALO_AV_EXTENSION;
		$tmp_folder			= implode('/',$ar_pre_target_path) .'/tmp' ;
		$tmp_file_base		= $tmp_folder . '/tmp_' . time();
		$tmp_file			= $tmp_file_base .'_' . $AVObj->get_name() . '.' . DEDALO_AV_EXTENSION;		
		$log_file 			= $tmp_file_base .'_' . $AVObj->get_name() . '_log';

		#dump($target_file, "source file: ".$src_file); return null;		
		
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
		
		
		# VERIFY IF IS INSTALLED FFMPEG AND RETURN PATH IF YES. 	Usualmente es '/usr/local/bin/ffmpeg'	
		/*		
		try {
			$ffmpeg_installed_path = $this->get_ffmpeg_installed_path();

			if(!file_exists($ffmpeg_installed_path))
				die('Option not installed (ffmpeg)');

			$ffmpeg_file_permissions = fileperms($ffmpeg_installed_path) & 511;
			if( $ffmpeg_file_permissions < 493 )
				throw new Exception("Error incorrect permissions $ffmpeg_file_permissions (ffmpeg)", 1);

		}catch(Exception $e1){
			print ('Exception: '. $e1->getMessage(). "\n<br>");	
		}
		*/
		
			
		/*
		# VERIFY IF IS INSTALLED FASTSTART AND RETURN PATH IF YES. 	Usualmente es '/usr/local/bin/qt-faststart'
		try {
			$qt_faststart_installed_path 	= $this->get_qt_faststart_installed_path();	

			if(!file_exists($qt_faststart_installed_path))
				die('Option not installed (qt-faststart)');

			$qt_faststart_file_permissions = fileperms($qt_faststart_installed_path) & 511;
			if( !$qt_faststart_file_permissions )
				throw new Exception("Error on read permissions $qt_faststart_file_permissions (qt_faststart) (SELinux restriction can be in use..)", 1);

			if( $qt_faststart_file_permissions && $qt_faststart_file_permissions < 493 )
				throw new Exception("Error incorrect permissions $qt_faststart_file_permissions (qt_faststart)", 1);

		}catch(Exception $e2){
			print ('Exception: '. $e2->getMessage(). "\n<br>");	
		}
		*/

		
		
		# COMMANDS SHELL
		$command	 = '';			
		
		if($setting=='audio') {
			
			# paso 1 extraer el audio		
			$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -vn -acodec copy $tmp_file && ";			
			# fast-start
			$command	.= "nice -n 19 ".DEDALO_AV_FASTSTART_PATH." $tmp_file $target_file && ";			
			# delete media temp
			$command	.= "rm -f $tmp_file ";
		
		}else{
			
			# paso 1 sólo video			
			$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -an -pass 1 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force -passlogfile $log_file -y /dev/null && ";
			
			# paso 2 video
			$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -pass 2 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force -passlogfile $log_file -y ";			
			
			# paso 2 audio
			$command	.= "-acodec $acodec -ar $ar -ab $ab -ac $ac -y $tmp_file && ";													
			
			# fast-start
			$command	.= "nice -n 19 ".DEDALO_AV_FASTSTART_PATH." $tmp_file $target_file && ";														
			
			# delete media temp
			$command	.= "rm -f $tmp_file && ";
			
			# delete log temps
			$command	.= "rm -f $log_file && ";
			$command	.= "rm -f $log_file.mbtree";		
		}
		
		
		if(SHOW_DEBUG) {
			#dump($command, "sudo -u _www $command");
			error_log($command);
		}
		#$av_alternate_command_exc = exec_::exec_command($command);
		
			
		# target quality
		$target_quality = $this->get_quality_from_setting($setting); 
		
		#$prgfile = tempnam("$tmp_folder", "SH"); 
		$prgfile = $tmp_folder .'/' . $target_quality .'_'. $AVObj->get_name() . '.sh';		
		#if(is_resource($prgfile)) chmod($prgfile, 0755); 
		$fp = fopen($prgfile, "w"); 
		fwrite($fp, "#!/bin/bash\n"); 
		fwrite($fp, "$command\n");
		fclose($fp);

		if(file_exists($prgfile)) {
			chmod($prgfile, 0755);
		}else{
			throw new Exception("Error Processing Media. Script file not exists or is not accessible", 1);			
		}
		#exec("sh $prgfile > /dev/null &",$rv); # funciona!!! <<<<
		#unlink($prgfile);
		
		$av_alternate_command_exc = exec_::exec_sh_file($prgfile);		
		

		return $av_alternate_command_exc;
	}




	
	
	/**
	* CREATE POSTERFRAME
	* @param $AVObj
	*	AVObj Object
	* @param $timecode
	*	Float number timecode like 102.369217 (from javascript media engine tc control)
	*	Is formated here to ffmpeg as 102.369
	*
	* @return $posterFrame_command_exc
	*	Terminal commnad response
	*/
	public function create_posterframe(AVObj $AVObj, $timecode) {
		
		# SRC VIDEO FILE
		$src_file			= $AVObj->get_media_path_abs()	. $AVObj->get_name() . '.' . $AVObj->get_extension();
			#dump($src_file,'$src_file');
		
		
		# SI NO EXISTE EL DEFAULT, BUSCAMOS OTRO DE MAYOR A MENOR
		if(!file_exists($src_file)) {			
			$src_file		= $AVObj->get_master_media_file($AVObj);		
		}
		
		# IMAGE JPG TARGET FILE		
		$PosterFrameObj		= new PosterFrameObj($reelID = $AVObj->get_name(), $tc=NULL);
		$target_path		= DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . '/posterframe';
		$target_file		= $target_path .'/'. $AVObj->get_name() . '.' . $PosterFrameObj->get_extension();		
		
		
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
			#dump( $timecode );
			
		# paso 1 sólo video			
		#$command	.= DEDALO_AV_FFMPEG_PATH . " -itsoffset -$timecode -i $src_file -y -vframes 1 -f rawvideo -an -vcodec mjpeg $target_file > /dev/null  ";
		$command	.= DEDALO_AV_FFMPEG_PATH . " -ss $timecode -i $src_file -y -vframes 1 -f rawvideo -an -vcodec mjpeg $target_file ";
			#dump( $command );

		#if(SHOW_DEBUG) dump($command, "Admin Debug command for ".__METHOD__."<div class=\"notas\">sudo -u _www $command </div><hr>");		

		# EXEC COMMAND									
		$posterFrame_command_exc = exec_::exec_command($command);		
		
		return $posterFrame_command_exc;
	}
	
	
	
	
	
	
	public static function get_ffmpeg_installed_path() {	
		return DEDALO_AV_FFMPEG_PATH;
	}
	
	public static function get_qt_faststart_installed_path() {		
		return DEDALO_AV_FASTSTART_PATH;		
	}
	
	
	
	/**
	* BUILD_FRAGMENT
	* @return created file url
	*/
	public function build_fragment(AVObj $AVObj, $tcin, $tcout, $target_filename, $watermark=0) {

		$ffmpeg_installed_path  	= DEDALO_AV_FFMPEG_PATH;	#dump($ffmpeg_installed_path,'$ffmpeg_installed_path');
		$reelID 					= $AVObj->get_reelID();
		$source_file 				= $AVObj->get_media_path_abs() . $reelID .'.'. $AVObj->get_extension();
		$target_filename_path 		= $AVObj->get_media_path_abs() . 'fragments/' . $target_filename;

		$tcin_secs 	= OptimizeTC::TC2seg($tcin);
		$tcout_secs = OptimizeTC::TC2seg($tcout);
		$duracion 	= $tcout_secs - $tcin_secs;
		
		$watermark_file = DEDALO_AV_WATERMARK_FILE;

			# fragments dir exists
			$fragments_folder = $AVObj->get_media_path_abs() . 'fragments';
			if( !is_dir($fragments_folder) ) {
				$create_dir = mkdir($fragments_folder, 0777);
				if(!$create_dir) {
					if(SHOW_DEBUG) {
						dump($fragments_folder, 'trying to create: $fragments_folder');
					}
					throw new Exception("Error on read or create directory for \"fragments\" folder. Permission denied ! ", 1);
				}
			}
			
			# fragments dir set permissions 0777
			$wantedPerms = 0777;
			$actualPerms = fileperms($fragments_folder);	#dump($actualPerms,'$actualPerms');
			if($actualPerms < $wantedPerms) {
				$chmod = chmod($fragments_folder, $wantedPerms);
				if(!$chmod) die(" Sorry. Error on set valid permissions to directory for \"fragments\".  ") ;
			}

		if ($watermark==1) {

			$target_filename_path_temp 		= $AVObj->get_media_path_abs() .'fragments/temp_'. $target_filename ;

			$command = "nice -n 19 $ffmpeg_installed_path -ss $tcin -t $duracion -i $source_file -vcodec copy -acodec copy -y $target_filename_path_temp" ;

			$command .= " && nice -n 19 $ffmpeg_installed_path -i $target_filename_path_temp -vf 'movie=$watermark_file [watermark]; [in][watermark] overlay=main_w-overlay_w-10:10 [out]' -y $target_filename_path";
			
			# EXEC COMMAND
			#$command_exc = Exec::exec_command($command);
			$command_exc = shell_exec( $command );
			
		}else{

			# nice -n 19 
			$command = "$ffmpeg_installed_path -ss $tcin -t $duracion -i $source_file -vcodec copy -acodec copy -y $target_filename_path";

			# EXEC COMMAND
			$command_exc = exec_::exec_command($command);

			error_log($command);
		}		
		#error_log($command_exc);

		$file_url = 'http://' . $_SERVER['HTTP_HOST'] . $AVObj->get_media_path() .'fragments/'. $target_filename ;
			#error_log("file_url ".$file_url);

		return $file_url;
	}
	
	
	
	
	/*
	* CONFORM_HEADER
	*/
	public function conform_header(AVObj $AVObj) {
					
		$ffmpeg_installed_path 			= DEDALO_AV_FFMPEG_PATH;
		$qt_faststart_installed_path 	= DEDALO_AV_FASTSTART_PATH;


		$file_path 	= $AVObj->get_local_full_path();
		#$file_path2 = $file_path.'_2';
		$file_path2 = str_replace('.mp4', '_.mp4', $file_path);

		$command  = '';
		
		# Copy file
		$command .= "$ffmpeg_installed_path -i $file_path -c:v copy -c:a copy  $file_path2  ";	# && rm -f $file_path && mv $file_path2 $file_path # -y
		
		# Remove original
		$command .= "&& rm -f $file_path ";
		
		# Rename new file as original
		#$command .= "mv $file_path2 $file_path";

		# Faststart
		$command .= "&& $qt_faststart_installed_path $file_path2 $file_path ";

		# Remove temp file
		$command .= "&& rm -f $file_path2 ";
		
		$result = shell_exec( $command );
		#$conform_header_command_exc = Exec::exec_command($command);

		if(SHOW_DEBUG) error_log("Admin Debug command for ".__METHOD__."<div class=\"notas\">sudo -u _www $command </div><hr>") ;

		return $result;

	}//end conform_header
	
	
	/*
	* CONVERT_AUDIO
	*/
	public function convert_audio(AVObj $AVObj, $uploaded_file_path) {

		$ffmpeg_installed_path 			= DEDALO_AV_FFMPEG_PATH;
		$qt_faststart_installed_path 	= DEDALO_AV_FASTSTART_PATH;

		$output_file_path = $AVObj->get_local_full_path();
			#dump($output_file_path, ' file_path'); return;	

		$command  = '';

		# ffmpeg -i INPUT_FILE.EXT -aq 500 -acodec libfaac -map_meta_data OUTPUT_FILE.EXT:INPUT_FILE.EXT OUTPUT_FILE.EXT
		# ffmpeg -i INPUT_FILE.EXT -aq 70 -acodec libfaac -map_meta_data OUTPUT_FILE.EXT:INPUT_FILE.EXT OUTPUT_FILE.EXT
		# ffmpeg -i input.wav -c:a libfdk_aac -b:a 128k output.m4a
		# ffmpeg -i input.wav -strict experimental -c:a aac -b:a 240k output.m4a
		
		# Convert file
		$command .= "$ffmpeg_installed_path -i $uploaded_file_path -strict experimental -c:a aac -b:a 240k $output_file_path ";

		# Faststart
		$command .= "&& $qt_faststart_installed_path $output_file_path $output_file_path ";

		if(SHOW_DEBUG) {
			#error_log($command);
		}

		$result = shell_exec( $command );
		#$conform_header_command_exc = Exec::exec_command($command);

		if(SHOW_DEBUG) error_log("Admin Debug command for ".__METHOD__."<div class=\"notas\">sudo -u _www $command </div><hr>") ;

		return $result;

	}//end conform_header





	/**
	* CONVERT_TO_DEDALO_AV
	* @return 
	*/
	public static function convert_to_dedalo_av( $source_file, $target_file ) {
		
		$ffmpeg_path = DEDALO_AV_FFMPEG_PATH;
		
		$command = "nice $ffmpeg_path -y -i $source_file -vf \"yadif=0:-1:0, scale=720:404:-1\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec libvo_aacenc -ar 44100 -ab 128k -ac 2 -movflags faststart $target_file";
		#$res 	 = shell_exec($command);

		# Exec without wait finish
		exec("$command  > /dev/null &");


		if(SHOW_DEBUG) {
			error_log($command);
		}

		#return $res;

	}#end convert_to_dedalo_av





	
}



# ffmpeg -i input.dv -r 1  -t 00:00:01 -f image2 images%05d.png

# ffmpeg -i VideoFile.flv -ss 00:00:01.00 -vcodec mjpeg -vframes 1 -f image2 VideoFile.jpg


/*
		sudo -u _www /usr/local/bin/ffmpeg -i /Users/paco/Sites/dedalo/media/av/404/1.mp4 -an -pass 1 -vcodec libx264 -vb 256k -s 428x240 -g 75 -vf yadif -vf lutyuv="u=gammaval(1.01):v=gammaval(0.98):y=gammaval(0.97)" -f mp4 -passlogfile /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1a -y /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1.mp4  && sudo -u _www /usr/local/bin/ffmpeg -i /Users/paco/Sites/dedalo/media/av/404/1.mp4 -an -pass 2 -vcodec libx264 -vb 256k -s 428x240 -g 75 -vf yadif -vf lutyuv="u=gammaval(1.01):v=gammaval(0.98):y=gammaval(0.97)" -f mp4 -passlogfile /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1a -y -acodec libvo_aacenc -ar 24000 -ab 28k -ac 1 -y /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1.mp4  &&
sudo -u _www /usr/local/bin/qt-faststart /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1.mp4 /Users/paco/Sites/dedalo/media/av/240/1.mp4  && sudo -u _www rm -f /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1.mp4
		
		
		sudo -u www /usr/local/bin/ffmpeg -i /Users/paco/Sites/dedalo/media/av/404/1.mp4 -an -pass 1 -vcodec libx264 -vb 256k -s 428x240 -g 75 -vf yadif -vf lutyuv="u=gammaval(1.01):v=gammaval(0.98):y=gammaval(0.97)" -f mp4 -passlogfile /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1a -y /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1.mp4 2>&1 && sudo -u www /usr/local/bin/ffmpeg -i /Users/paco/Sites/dedalo/media/av/404/1.mp4 -an -pass 2 -vcodec libx264 -vb 256k -s 428x240 -g 75 -vf yadif -vf lutyuv="u=gammaval(1.01):v=gammaval(0.98):y=gammaval(0.97)" -f mp4 -passlogfile /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1a -y -acodec libvo_aacenc -ar 24000 -ab 28k -ac 1 -y /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1.mp4 2>&1 &&
sudo -u www /usr/local/bin/qt-faststart /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1.mp4 /Users/paco/Sites/dedalo/media/av/240/1.mp4  2>&1 && sudo -u www rm -f /Users/paco/Sites/dedalo/media/av/tmp/tmp_1328966200_1.mp4 2>&1  
*/	
?>