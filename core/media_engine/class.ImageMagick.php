<?php
/**
* CLASS ImageMagick
* Manages image files process with ImageMagick lib
* https://imagemagick.org
*/
require_once(dirname(dirname(dirname(__FILE__))).'/config/config.php');
require_once( DEDALO_CORE_PATH . '/common/class.exec_.php');

final class ImageMagick {



	/**
	* TEST_IMAGE_MAGICK
	* @param bool $info = false
	* @return true (or info about) / throw error
	*/
	public static function test_image_magick( bool $info=false ) {
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

				$html = '';
				$html .= '<ul>';
				for ($i = 0; $i < sizeof($array); $i++) {
					$html .= '<li>'.$array[$i].'</li>';
				}
				$html .= '</ul>';

				return $html;
			}else{
				return true;
			}
		}
	}//end test_image_magick



	/**
	* GET_THUMB
	* @param string $mode
	* 	'edit, list, ..'
	* @param string $f
	* 	filename
	* @param bool $verify
	* @param string $initial_media_path = ''
	*
	* @return string $thumb_file_url
	*/
	public static function get_thumb( string $mode, string $f, bool $verify=true, string $initial_media_path='' ) : string {

		if(empty($f)) {
			throw new Exception("Error Processing Request. Few arguments", 1);
		}

		#if(file_exists(DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER.'/DEDALO_IMAGE_THUMB_DEFAULT/'.$f)) unlink(DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER.'/DEDALO_IMAGE_THUMB_DEFAULT/'.$f);

		$thumb_file_path	= DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f;
		$thumb_file_url		= DEDALO_MEDIA_URL.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$f;

		# FAST METHOD (NOT verify)
			if($verify===false) {
				return $thumb_file_url;
			}

		# THUMB FILE EXISTS TEST : Redirect to real existing image thumb
		if (!file_exists( $thumb_file_path )) {

			# SOURCE FILE
				$source_base = DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_QUALITY_DEFAULT.'/';
				if (strpos($f, $source_base)!==false) {
					$source = $f;
				}else{
					$source = $source_base . $f;
				}

			if (file_exists( $source )) {

				# Target folder exists test
				$additional_path = substr($f, 0, strrpos($f,'/'));
				$target_folder_path = DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/'.DEDALO_IMAGE_THUMB_DEFAULT.'/'.$additional_path;	#dump( $target_folder_path, $f  );return null;
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
				$thumb_file_url = DEDALO_CORE_URL.'/themes/default/0-thumb.jpg';

				# SOURCE FILE
				#$source = DEDALO_CORE_PATH.'/themes/default/0.jpg';
				# TARGET FILE
				#$target = $thumb_file_path;
				# CONVERT
				#ImageMagick::dd_thumb($mode, $source, $target);
			}
		}
		#dump($thumb_file_url,'thumb_file_url');
		#error_log($thumb_file_url);

		return $thumb_file_url;
	}//end get_thumb



	/**
	* DD_THUMB
	* Creates the thumb version file using the ImageMagick command line
	* @param string $mode ('edit,list,..')
	* @param string $source_file (full source file path)
	* @param string $target_file (full target thumb file path)
	* @param mixed $dimensions = false
	* @param string $initial_media_path = ''
	*
	* @return string|null $result
	*/
	public static function dd_thumb( string $mode, string $source_file, string $target_file, $dimensions=false, string $initial_media_path='' ) : ?string {

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
				$command = MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\" -thumbnail '$dimensions' -auto-orient -gravity center -unsharp 0x.5 -quality 90 \"$target_file\" ";
				break;
			case 'edit':
				#$command = MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\" -thumbnail x404 -unsharp 0x.5 jpg -quality 72 \"$target_file\" ";
				$command = MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\" -thumbnail x404 -unsharp 0x.5 -auto-orient -quality 72 \"$target_file\" ";
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
		$prgfile = DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/temp/dd_thumb_'.$mode.'_'.str_replace('/', '_', substr($target_file, strpos($target_file, 'thumbs/')+7) ).'.sh';
			#dump($prgfile,'$prgfile');
			#if(file_exists($prgfile)) unlink($prgfile);

		# BUILD SH FILE WITH BACKUP COMMAND IF NOT EXISTS
		if(!file_exists($prgfile)) {

			# Target folder exists test
			$target_folder_path = DEDALO_MEDIA_PATH.DEDALO_IMAGE_FOLDER.$initial_media_path.'/temp';
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
	* @param string $source_file
	* @param string $target_file
	* @param string $flags = ''
	*
	* @return string|null $result
	*	Terminal command response
	*/
	public static function convert( string $source_file, string $target_file, string $flags='' ) : ?string {

		// Valid path verify
		$folder_path = pathinfo($target_file)['dirname'];
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0777,true)) {
				throw new Exception(" Error on read or create dd_thumb directory. Permission denied");
			}
		}


		# convert 21900.jpg json: : Get info aboout source file Colorspace
		#$colorspace_info	= MAGICK_PATH . "identify -verbose " .$source_file." | grep \"Colorspace:\" ";
		$colorspace_command = MAGICK_PATH . "identify -format '%[colorspace]' -quiet " .$source_file. "[0]";
		$colorspace_info	= shell_exec($colorspace_command);	//-format "%[EXIF:DateTimeOriginal]"
			// dump($colorspace_info,'colorspace_info '.to_string($colorspace_command));

		# Layers info
		# get thumbnail identification
		$layers_file_info = (array)self::get_layers_file_info( $source_file );
		$ar_valid_layers  = array();
		foreach ($layers_file_info as $layer_key => $layer_type) {
			if ( strtoupper($layer_type) !== 'REDUCEDIMAGE' ) {
				$ar_valid_layers[] = (int)$layer_key;
			}
		}
		$source_file_with_layers = '"'. $source_file . '"[' . implode(',', $ar_valid_layers) . ']';

		#
		# FLAGS : Command flags
		#
		if(!isset($flags))$flags='';
		switch (true) {

			# CMYK to RGB
			# Si la imagen orgiginal es CMYK, la convertimos a RGB aignándole un perfil de salida para la conversión. Una vez convertida (y flateada en caso de psd)
			# le eliminamos el perfil orginal (cmyk) para evitar incoherencia con el nuevo espacio de color (rgb)
			case ( !empty($colorspace_info) && strpos($colorspace_info, 'CMYK')!==false ) :

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

		$flags .= " -auto-orient -quiet "; // Always add


		$command = MAGICK_PATH . "convert $source_file_with_layers $flags \"$target_file\" ";	# -negate -profile Profiles/sRGB.icc -colorspace sRGB -colorspace sRGB
		#$command = 'nice -n 19 '.$command;
			#if(SHOW_DEBUG) dump($command,'ImageMagick command');
		debug_log(__METHOD__." Command ".to_string($command), logger::DEBUG);


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
	}//end convert



	/**
	* GET_IMAGE_FILE_INFO
	* @return
	*/
		// public static function get_image_file_info( $source_file ) {
		// 				# identify -format "{\"%[scene]\":\"%[tiff:subfiletype]\"}\n" -quiet 21900.tif
		// 	$commnad = MAGICK_PATH . "convert $source_file json: ";
		// 	$output  = json_decode( shell_exec($command) );
		// 		#dump($output, ' output ++ '.to_string( $command ));

		// 	return $output;
		// }//end get_image_file_info



	/**
	* GET_LAYERS_FILE_INFO
	* @param string $source_file
	* @return array $ar_layers
	*/
	public static function get_layers_file_info( string $source_file ) : array {

		$ar_layers = array();

		// tiff info. Get the type of TIFF format:
			// 1 single image
			// 2 multipage NOT SUPPORTED SPLIT THE IMAGES BEFORE IMPORT AND CONVERT
			// 3 true layer tiff
			$command		= MAGICK_PATH . 'identify -quiet -format "%n %[tiff:has-layers]\n" '. $source_file .' | tail -1';
			$tiff_format	= shell_exec($command);

		// image format
			$command	= MAGICK_PATH . 'identify -format "%[scene]:%[tiff:subfiletype]\n" -quiet '. $source_file;
			$output		= shell_exec($command);

		// parse output
			if (!empty($output)) {

				$output		= trim($output);
				$ar_lines	= explode("\n", $output);
				foreach ($ar_lines as $key => $value) {

					$ar_part2	= explode(":", $value);
					$layer_key	= $ar_part2[0];

					$layer_type = ($tiff_format<=2 && $key>0)
						? 'REDUCEDIMAGE'
						: ($ar_part2[1] ?? null);

					$ar_layers[$layer_key] = $layer_type;
				}
			}

		return $ar_layers;
	}//end get_layers_file_info



	/**
	* ROTATE
	* 	Rotate and save source image to target (self or other)
	* @param string $source
	* @param string $degrees
	* @param bool $target = false
	*
	* @return string|null $result
	*/
	public static function rotate( string $source, $degrees, $target=false ) : ?string {

		// fallback target to source (overwrite file)
			$target = $target
				? $target
				: $source;

		// command
			$command	= MAGICK_PATH . "convert -rotate \"$degrees\" '$source' '$target'";
			$result		= shell_exec($command);

		debug_log(__METHOD__." Exec Command:" . PHP_EOL . $command, logger::DEBUG);


		return $result;
	}//end rotate



	/**
	* GET_MEDIA_ATTRIBUTES
	* Read file attributes (format, geometry, resolution, gamma, etc.)
	* (!) Note that a file can contain many layers (.psd case for example) so the result
	* is always an array of one or more objects
	* Sample:
	* [
    *	{
    *		"version": "1.0",
    *		"image": {
    *			"name": "/dedalo/media/image/original/0/rsc29_rsc170_707.psd",
    *			"baseName": "rsc29_rsc170_707.psd",
    * 			...
    * 		}
    *	}
    * ]
	* @param string $file_path
	* @return array|null $result
	*/
	public static function get_media_attributes( string $file_path ) : ?array {

		// convert image.jpg[1x1+0+0] json:
		$command		= MAGICK_PATH . "convert '$file_path' json: ";
		$exec_result	= shell_exec($command);

		debug_log(__METHOD__." Exec Command:" . PHP_EOL . $command, logger::DEBUG);

		$result = !empty($exec_result)
			? json_decode($exec_result)
			: null;


		return $result;
	}//end get_media_attributes



}//end ImageMagick class