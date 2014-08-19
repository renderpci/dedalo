<?php
/*
* CLASS ImageMagick
*/
require_once( dirname(dirname(__FILE__)) .'/config/config4.php');
require_once( DEDALO_LIB_BASE_PATH . '/common/class.exec_.php');

class ImageMagick {
	

	/**
	* TEST_IMAGE_MAGICK
	* @return true (or info about) / throw error
	*/
	public static function test_image_magick($info=false) {
		return true;

		# Print the return code: 0 if OK, nonzero if error.
		exec(MAGICK_PATH. "convert -version", $out, $rcode); //Try to get ImageMagick "convert" program version number.

		if ($rcode!==0) {
			if(SHOW_DEBUG) {
				#dump($rcode,'$rcode');
				#dump($out,'$out');
			}
			throw new Exception("Error Processing Request. ImageMagick lib not found", 1);			
		}else{
			if($info===true) {
				return alist($out);
			}else{
				return true;
			}
		}
	}



	/**
	* GET_THUMB
	* @param $mode (str 'edit,list,..')
	* @param $f (str filename)
	*/
	public static function get_thumb( $mode, $f, $verify=true) {

		if(empty($f)) throw new Exception("Error Processing Request. Few arguments", 1);

		#if(file_exists(DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/DEDALO_IMAGE_THUMB_DEFAULT/'.$f)) unlink(DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/DEDALO_IMAGE_THUMB_DEFAULT/'.$f);

		$thumb_file_path 	= DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f;
		$thumb_file_url 	= DEDALO_MEDIA_BASE_URL.DEDALO_IMAGE_FOLDER.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f;

		# FAST METHOD (NOT verify)
		if(!$verify) return $thumb_file_url;
		

		# THUMB FILE EXISTS TEST : Redirect to real existing image thumb
		if (!file_exists( $thumb_file_path )) {
			
			# SOURCE FILE
			$source = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/'.DEDALO_IMAGE_QUALITY_DEFAULT.'/'.$f;
				#dump($source,'source');
				#error_log(DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/'.DEDALO_IMAGE_QUALITY_DEFAULT.'/'.$f);
			if (file_exists( $source )) {

				# Target folder exists test	
				$aditional_path = substr($f, 0, strrpos($f,'/')); 
				$target_folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$aditional_path;	#dump( $target_folder_path, $f  );return null;
				if( !is_dir($target_folder_path) ) {
					if(!mkdir($target_folder_path, 0777,true)) {
						throw new Exception(" Error on read or create directory. Permission denied $target_folder_path");
					}
				}

				# TARGET FILE
				$target = $thumb_file_path;
				
				# CONVERT
				ImageMagick::dd_thumb($mode, $source, $target);

			}else{
				#throw new Exception("Error Processing Request. Sorry, source file from default quality (".DEDALO_IMAGE_QUALITY_DEFAULT.") not found", 1);
				# URL THUMB FILE
				$thumb_file_url = DEDALO_LIB_BASE_URL.'/themes/default/0.jpg';

				# SOURCE FILE
				#$source = DEDALO_LIB_BASE_PATH.'/themes/default/0.jpg';
				# TARGET FILE
				#$target = $thumb_file_path;				
				# CONVERT
				#ImageMagick::dd_thumb($mode, $source, $target);
			}	
		}
		#dump($thumb_file_url,'thumb_file_url');
		#error_log($thumb_file_url);

		return $thumb_file_url;
	}


	/**
	* DD_THUMB
	* @param $mode ('edit,list,..')
	* @param $source_file (full sourcefile path)
	* @param $target_file (full target thumb file path)
	*/
	public static function dd_thumb( $mode, $source_file, $target_file, $dimensions="102x57") {

		# Dimensions (original 102x57)
		#$dimensions = (string)"102x90";

		# Nota: para ejecutar un crop, definir como {$dimensions}^ .Desactivado el crop por interferir demasiado con las fotos verticales

		switch ($mode) {
			case 'list':
				$command = 'nice -n 19 '.MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\" \
         									-thumbnail {$dimensions} -gravity center -extent {$dimensions} -unsharp 0x.5 jpg -quality 90 \"$target_file\" ";
				break;
			case 'edit':
				$command = 'nice -n 19 '.MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\" \
         									-thumbnail x404 -unsharp 0x.5 jpg -quality 72 \"$target_file\" ";
				break;
			default:
				throw new Exception("Error Processing file. Thumb mode is not valid", 1);
				break;
		}
		#if(SHOW_DEBUG) dump($command,'ImageMagick command '.$mode);		

		$prgfile = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/temp/dd_thumb_'.$mode.'_'.str_replace('/', '_', substr($target_file, strpos($target_file, 'thumbs/')+7) ).'.sh';
			#dump($prgfile,'$prgfile');
			#if(file_exists($prgfile)) unlink($prgfile);
		
		# BUILD SH FILE WITH BACKUP COMMAND IF NOT EXISTS
		if(!file_exists($prgfile)) {

			# Target folder exists test	
			$target_folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/temp';
			if( !is_dir($target_folder_path) ) {
				if(!mkdir($target_folder_path, 0777,true)) {
					throw new Exception(" Error on read or create directory. Permission denied $target_folder_path");
				}
			}

			# Temp sh file
			$fp = fopen($prgfile, "w"); 
			fwrite($fp, "#!/bin/bash\n");
			fwrite($fp, "$command\n");
			fclose($fp);
			if(!file_exists($prgfile)) {				
				throw new Exception("Error Processing file. Thumb script file not exists or is not accessible", 1);			
			}
			#error_log("Created thumb for $source_file - dimensions:$dimensions");
		}
		
		# RUN COMMAND
		return exec_::exec_sh_file($prgfile);		
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
	public static function convert($source_file, $target_file, $flags='') {

		# Test lib is installed
		self::test_image_magick();


		# IDENTIFY : Get info aboout source file Colorspace
		#$colorspace_info  = shell_exec( MAGICK_PATH . "identify -verbose " .$source_file." | grep \"Colorspace:\" ");
		$colorspace_info  = shell_exec( MAGICK_PATH . "identify -format '%[colorspace]' " .$source_file. "[0]" );
			#dump($colorspace_info,'colorspace_info');

		#
		# FLAGS : Command flags
		#
		if(!isset($flags))$flags='';
		switch (true) {
			
			# CMYK to RGB
			# Si la imagen orgiginal es CMYK, la convertimos a RGB aignándole un perfil de salida para la conversión. Una vez convertida (y flateada en caso de psd)
			# le eliminamos el perfil orginal (cmyk) para evitar incoherencia con el nuevo espacio de color (rgb)
			case ( strpos($colorspace_info, 'CMYK')!==false ):

				# Profile full path
				$profile_file = COLOR_PROFILES_PATH.'sRGB_Profile.icc';

				# Test profile exists
				if(!file_exists($profile_file)) throw new Exception("Error Processing Request. Color profile not found in: $profile_file", 1);				

				# Command flags
				$profile_source  = '';#'-profile "'.COLOR_PROFILES_PATH.'Generic_CMYK_Profile.icc"';				
				$flags 			.= "-profile \"$profile_file\" -flatten -strip"; #-negate.
				break;
			
			# RBG TO RBG
			default:
				$flags 			.= " -flatten";
				break;
		}
		

		$command = MAGICK_PATH . "convert \"$source_file\" $flags \"$target_file\" ";	# -negate -profile Profiles/sRGB.icc -colorspace sRGB -colorspace sRGB 
			#if(SHOW_DEBUG) dump($command,'ImageMagick command');


		# EXE COMMAND
		$command_exc = exec_::exec_command($command);

		return $command_exc;










		
		# CREATE FINAL TARGET PATH
		$pre_target_path 	= $AVObj->get_media_path_abs();		
		$pre_target_path 	= substr($pre_target_path,0,-1);	# remove last /
		$ar_pre_target_path	= explode('/',$pre_target_path);	# explode by /
		$result				= array_pop($ar_pre_target_path); 	# remove last element of array (the quality folder)		
		$final_target_path	= implode('/',$ar_pre_target_path).'/'. $target_path ;

		
			# quality dir exists	
			if( !is_dir($final_target_path) ) {
				try{
					$create_dir = @mkdir($final_target_path, 0777,true);
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
		$target_file		= $final_target_path 			. '/' .$AVObj->get_name() 	. '.' . $extension;
		$tmp_folder			= implode('/',$ar_pre_target_path) .'/tmp' ;
		$tmp_file_base		= $tmp_folder . '/tmp_' . time();
		$tmp_file			= $tmp_file_base .'_' . $AVObj->get_name() . '.' . $extension;		
		$log_file 			= $tmp_file_base .'_' . $AVObj->get_name() . '_log';

		#dump($target_file, "source file: ".$src_file); return null;		
		
			# tmp dir exists	
			if( !is_dir($tmp_folder) ) {
				$create_dir = mkdir($tmp_folder, 0777,true);
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




		
		
		# COMMANDS SHELL
		$command	 = '';			
		
		if($setting=='audio') {
			
			# paso 1 extraer el audio		
			$command	.= "nice -n 15 $ffmpeg_installed_path -i $src_file -vn -acodec copy $tmp_file && ";			
			# fast-start
			$command	.= "nice -n 15 $qt_faststart_installed_path $tmp_file $target_file && ";			
			# delete media temp
			$command	.= "rm -f $tmp_file ";					#print( $command );	
		
		}else{
			
			# paso 1 sólo video			
			$command	.= "nice -n 15 $ffmpeg_installed_path -i $src_file -an -pass 1 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force -passlogfile $log_file -y /dev/null && ";		
			
			# paso 2 video
			$command	.= "nice -n 15 $ffmpeg_installed_path -i $src_file -pass 2 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force -passlogfile $log_file -y ";					
			
			# paso 2 audio
			$command	.= "-acodec $acodec -ar $ar -ab $ab -ac $ac -y $tmp_file && ";																
			
			# fast-start
			$command	.= "nice -n 15 $qt_faststart_installed_path $tmp_file $target_file && ";															
			
			# delete media temp
			$command	.= "rm -f $tmp_file && ";
			
			# delete log temps
			$command	.= "rm -f $log_file && ";
			$command	.= "rm -f $log_file.mbtree";		
		}
		
		
		if(SHOW_DEBUG) dump($command, "sudo -u _www $command");
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




	
	

	
}	
?>