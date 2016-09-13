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
	public static function get_thumb( $mode, $f, $verify=true, $initial_media_path) {

		if(empty($f)) throw new Exception("Error Processing Request. Few arguments", 1);

		#if(file_exists(DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/DEDALO_IMAGE_THUMB_DEFAULT/'.$f)) unlink(DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.'/DEDALO_IMAGE_THUMB_DEFAULT/'.$f);

		$thumb_file_path 	= DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f;
		$thumb_file_url 	= DEDALO_MEDIA_BASE_URL.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f;

		# FAST METHOD (NOT verify)
		if(!$verify) return $thumb_file_url;
		

		# THUMB FILE EXISTS TEST : Redirect to real existing image thumb
		if (!file_exists( $thumb_file_path )) {
			
			# SOURCE FILE
				$source_base = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_QUALITY_DEFAULT.'/';
				if (strpos($f, $source_base)!==false) {
					$source = $f;
				}else{
					$source = $source_base . $f;
				}					
				
			if (file_exists( $source )) {				

				# Target folder exists test	
				$aditional_path = substr($f, 0, strrpos($f,'/')); 
				$target_folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$aditional_path;	#dump( $target_folder_path, $f  );return null;
				if( !is_dir($target_folder_path) ) {
					if(!mkdir($target_folder_path, 0777,true)) {
						throw new Exception(" Error on read or create directory. Permission denied $target_folder_path");
					}
				}

				# TARGET FILE
				$target = $thumb_file_path;				
				debug_log(__METHOD__." Creating thumb with target: $thumb_file_path ".to_string(), logger::DEBUG);				
				
				# CONVERT
				ImageMagick::dd_thumb($mode, $source, $target, false, $initial_media_path);

			}else{
				#throw new Exception("Error Processing Request. Sorry, source file from default quality (".DEDALO_IMAGE_QUALITY_DEFAULT.") not found", 1);
				# URL THUMB FILE
				$thumb_file_url = DEDALO_LIB_BASE_URL.'/themes/default/0-thumb.jpg';

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
	public static function dd_thumb( $mode, $source_file, $target_file, $dimensions=false, $initial_media_path) {

		# Valid path verify
		$folder_path = pathinfo($target_file)['dirname'];
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0777,true)) {
				throw new Exception(" Error on read or create dd_thumb directory. Permission denied");
			}
		}

		# Dimensions (original 102x57)
		#$dimensions = (string)"102x90";
		# Nota: para ejecutar un crop, definir como {$dimensions}^ .Desactivado el crop por interferir demasiado con las fotos verticales
		#if (!$dimensions) {

			$width  = defined('DEDALO_IMAGE_THUMB_WIDTH')  ? DEDALO_IMAGE_THUMB_WIDTH  : 102;
			$height = defined('DEDALO_IMAGE_THUMB_HEIGHT') ? DEDALO_IMAGE_THUMB_HEIGHT : 57;

			# Like "102x57"
			$dimensions = $width.'x'.$height.'>';
			#$dimensions = "200x200>";		
		#}

		switch ($mode) {
			case 'list':
				#$command = MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\"[0] -thumbnail {$dimensions} -gravity center -extent {$dimensions} -unsharp 0x.5 jpg -quality 90 \"$target_file\" ";
				$command = MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\" -thumbnail '$dimensions' -gravity center -unsharp 0x.5 -quality 90 \"$target_file\" ";
				break;
			case 'edit':
				#$command = MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\" -thumbnail x404 -unsharp 0x.5 jpg -quality 72 \"$target_file\" ";
				$command = MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\" -thumbnail x404 -unsharp 0x.5 -quality 72 \"$target_file\" ";
				break;
			default:
				throw new Exception("Error Processing file. Thumb mode is not valid", 1);
				break;
		}
		#$command = 'nice -n 19 '.$command;
		

		# RUN COMMAND
		#$result = shell_exec($command);
		#return exec_::exec_command($command);
		$result = exec($command.' 2>&1', $output, $worked_result);
		if(SHOW_DEBUG) {
			if ($worked_result!=0) {
				dump($worked_result, ' worked_result. output: '.to_string($output));
			}
			if (!empty($result)) {
				debug_log(__METHOD__." WARNING expected result empty but received result: ".to_string($result), logger::WARNING);
			}
		}

		return $result;
			
		/*
		$prgfile = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/temp/dd_thumb_'.$mode.'_'.str_replace('/', '_', substr($target_file, strpos($target_file, 'thumbs/')+7) ).'.sh';
			#dump($prgfile,'$prgfile');
			#if(file_exists($prgfile)) unlink($prgfile);
		
		# BUILD SH FILE WITH BACKUP COMMAND IF NOT EXISTS
		if(!file_exists($prgfile)) {

			# Target folder exists test	
			$target_folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/temp';
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
		*/
	}//end dd_thumb


	
	
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

		# Valid path verify
		$folder_path = pathinfo($target_file)['dirname'];
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0777,true)) {
				throw new Exception(" Error on read or create dd_thumb directory. Permission denied");
			}
		}


		# IDENTIFY : Get info aboout source file Colorspace
		#$colorspace_info  = shell_exec( MAGICK_PATH . "identify -verbose " .$source_file." | grep \"Colorspace:\" ");
		$colorspace_info  = shell_exec( MAGICK_PATH . "identify -format '%[colorspace]' " .$source_file. "[0]" );	//-format "%[EXIF:DateTimeOriginal]"
			#dump($colorspace_info,'colorspace_info');

		#
		# FLAGS : Command flags
		#
		if(!isset($flags))$flags='';
		switch (true) {
			
			# CMYK to RGB
			# Si la imagen orgiginal es CMYK, la convertimos a RGB aignándole un perfil de salida para la conversión. Una vez convertida (y flateada en caso de psd)
			# le eliminamos el perfil orginal (cmyk) para evitar incoherencia con el nuevo espacio de color (rgb)
			case ( strpos($colorspace_info, 'CMYK')!==false ) :
			
				# Profile full path
				$profile_file = COLOR_PROFILES_PATH.'sRGB_Profile.icc';

				# Test profile exists
				if(!file_exists($profile_file)) throw new Exception("Error Processing Request. Color profile not found in: $profile_file", 1);

				// Remove possible '-thumbnail' flag when profile is used
				$flags = str_replace('-thumbnail', '', $flags);		

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
		#$command = 'nice -n 19 '.$command;
			#if(SHOW_DEBUG) dump($command,'ImageMagick command');


		# EXE COMMAND
		#$result = exec_::exec_command($command);
		$result = exec($command.' 2>&1', $output, $worked_result);
		if(SHOW_DEBUG) {
			if ($worked_result!=0) {
				#dump($worked_result, ' worked_result ++ '.to_string($output));
				debug_log(__METHOD__."  worked_result : output: ".to_string($output)." - worked_result:".to_string($worked_result), logger::DEBUG);
			}
			if (!empty($result)) {
				debug_log(__METHOD__." Command convert warning (not empty result): ".to_string($result) ." - output: ".to_string($output)." - worked_result: ".to_string($worked_result), logger::WARNING);
			}
		}

		return $result;

	}#end convert




	
	

	
}	
?>