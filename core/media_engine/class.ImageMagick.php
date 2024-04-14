<?php
/**
* CLASS ImageMagick
* Manages image files process with ImageMagick lib
* https://imagemagick.org
*/

final class ImageMagick {



	/**
	* DD_THUMB
	* Creates the thumb version file using the ImageMagick command line
	* @param string $source_file (full source file path)
	* @param string $target_file (full target thumb file path)
	*
	* @return string|bool $result
	*/
	public static function dd_thumb(string $source_file, string $target_file, $dimensions=false) : string|bool {

		# Valid path verify
		$folder_path = pathinfo($target_file)['dirname'];
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0777,true)) {
				throw new Exception(" Error on read or create dd_thumb directory. Permission denied");
			}
		}

		$width  = defined('DEDALO_IMAGE_THUMB_WIDTH')  ? DEDALO_IMAGE_THUMB_WIDTH  : 102;
		$height = defined('DEDALO_IMAGE_THUMB_HEIGHT') ? DEDALO_IMAGE_THUMB_HEIGHT : 57;

		# Like "102x57"
		$dimensions = $width.'x'.$height.'>';

		#$command = MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\"[0] -thumbnail {$dimensions} -gravity center -extent {$dimensions} -unsharp 0x.5 jpg -quality 90 \"$target_file\" ";
		$command = MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\" -thumbnail '$dimensions' -auto-orient -gravity center -unsharp 0x.5 -quality 90 \"$target_file\" ";
		$command = 'nice -n 19 '.$command;


		# RUN COMMAND
		$result = exec($command.' 2>&1', $output, $worked_result);

		if ($worked_result!=0) {
			debug_log(__METHOD__
				."  worked_result : output: ".to_string($output)." - worked_result:"
				.to_string($worked_result)
				, logger::DEBUG
			);
			return false;
		}

		return $result;
	}//end dd_thumb



	/**
	* CONVERT
	* Creates alternate video or audio version with received settings
	* @param object $options
	* @return string|bool $result
	*	Terminal command response
	*/
	public static function convert(object $options) : string|bool {

		$source_file	= $options->source_file; // file to be processed, mandatory.
		$ar_layers		= $options->ar_layers ?? null; // in image is the layer of the image, by default all (false), in pdf is the number of page/s, by default all (false).
		$target_file	= $options->target_file; // output file, mandatory.
		// properties
		$quality		= $options->quality ?? 90; // default quality to compress the jpg. int. default 90.
		$thumbnail		= $options->thumbnail ?? false; // use the thumbnail preset as fixed width and height.
		$colorspace		= $options->colorspace ?? 'sRGB'; // default color space to be used for output file.
		$profile_in		= $options->profile_in ?? 'Generic_CMYK_Profile.icc';
		$profile_out	= $options->profile_out ?? 'sRGB_Profile.icc';
		$flatten		= $options->flatten ?? true;
		$density		= $options->density ?? null; // resolution to process the source file, used to render pdf files. density = 150;
		$strip			= $options->strip ?? true;
		$antialias		= $options->antialias ?? true;
		$composite		= $options->composite ?? true;
		$coalesce		= $options->coalesce ?? true;
		$resize			= $options->resize ?? null;  // sample: 25% | 1024x756

		$extension				= pathinfo($target_file, PATHINFO_EXTENSION);
		$ar_opaque_extensions	= ['jpg','jpeg'];

		// check if the original image is opaque or transparent
		$is_opaque = true;
		if(!in_array($extension, $ar_opaque_extensions)){
			$is_opaque = self::is_opaque($source_file);
		}

		// Valid path verify
		$folder_path = pathinfo($target_file)['dirname'];
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0777,true)) {
				debug_log(__METHOD__
					." Error on crate folder ". PHP_EOL
					. 'folder_path: ' . $folder_path
					, logger::ERROR
				);
				return false;
			}
		}

		// convert 21900.jpg json: : Get info about source file color space
		$colorspace_command	= MAGICK_PATH . "identify -format '%[colorspace]' -quiet " .$source_file. "[0]";
		$colorspace_info	= shell_exec($colorspace_command);	//-format "%[EXIF:DateTimeOriginal]"

		# Layers info
		# get thumbnail identification
		$ar_valid_layers = [];
		if(!isset($ar_layers)){
			$layers_file_info = (array)self::get_layers_file_info( $source_file );
			foreach ($layers_file_info as $layer_key => $layer_type) {
				if ( strtoupper($layer_type) !== 'REDUCEDIMAGE' ) {
					$ar_valid_layers[] = (int)$layer_key;
				}
			}
		}else{
			$ar_valid_layers = $ar_layers;
		}

		$source_file_with_layers = empty($ar_valid_layers)
			? '"'. $source_file . '"'
			: '"'. $source_file . '"[' . implode(',', $ar_valid_layers) . ']';

		// begin flags : Command flags before source file.
			$begin_flags = '';

			$begin_flags .= isset($density)
				? '-density '. $density.' '
				: '';
			$begin_flags .= isset($antialias)
				? '-antialias '
				: '';

		// Middle flags : Command flags between source and output files.
			$middle_flags = '';

			$middle_flags .= ($thumbnail===true)
				? '-thumbnail '.DEDALO_IMAGE_THUMB_WIDTH.'x'.DEDALO_IMAGE_THUMB_HEIGHT
				: '';

			$middle_flags	.= ($coalesce === true && $is_opaque === false)
				? " -coalesce "
				: '';

			$middle_flags	.= ($composite === true && $is_opaque === false && count($ar_valid_layers)>1)
				? " -composite "
				: '';

			switch (true) {

				# CMYK to RGB
				# If the original file is CMYK, convert it to RGB by assigning an output profile for the conversion. Once converted (and flattened in case of psd)
				# Remove the original profile (CMYK) to avoid inconsistency with the new color space (sRGB)
				case ( !empty($colorspace_info) && strpos($colorspace_info, 'CMYK')!==false ) :

					# Profile full path
					$profile_source	= COLOR_PROFILES_PATH.$profile_in; // Generic_CMYK_Profile
					$profile_file	= COLOR_PROFILES_PATH.$profile_out; // sRGB_Profile

					# Test profile exists
					if(!file_exists($profile_source)) {
						throw new Exception("Error Processing Request. Color profile not found in: $profile_source", 1);
					}
					if(!file_exists($profile_file)) {
						throw new Exception("Error Processing Request. Color profile not found in: $profile_file", 1);
					}

					// Remove possible '-thumbnail' flag when profile is used
					$middle_flags = str_replace('-thumbnail', '', $middle_flags);

					# Command middle_flags
					$middle_flags	.= '-profile "'.$profile_source.'" ';
					$middle_flags	.= '-profile "'.$profile_file.'" ';
					$middle_flags	.= ($flatten === true && $is_opaque === true)
						? " -flatten "
						: '';
					$middle_flags	.= ($strip === true)
						? " -strip "
						: '';
					break;

				# RBG TO RBG
				default:
					$middle_flags	.= ($flatten === true && $is_opaque === true)
						? " -flatten "
						: '';
					break;
			}

			$middle_flags .= '-quality '.$quality.' ';
			$middle_flags .= ' -auto-orient -quiet '; // Always add
			$middle_flags .= isset($resize)
				? '-resize '. $resize.' ' // sample: 25% | 1024x756
				: '';

		// command
			$command = MAGICK_PATH . 'convert '.$begin_flags.' '.$source_file_with_layers.' '.$middle_flags.' "'.$target_file.'" ';	# -negate -profile Profiles/sRGB.icc -colorspace sRGB -colorspace sRGB
			// $command = 'nice -n 19 '.$command;

		// debug
			debug_log(__METHOD__
				." Command ".to_string($command)
				, logger::DEBUG
			);

		// exe command
			$result = exec($command.' 2>&1', $output, $worked_result);

		// error case
			if ($worked_result!=0) {
				debug_log(__METHOD__
					."  worked_result : output: ".to_string($output)." - worked_result:"
					.to_string($worked_result)
					, logger::DEBUG
				);
				return false;
			}

		// debug info
			debug_log(__METHOD__
				.' Command convert info: ' . PHP_EOL
				.' command: ' 		.to_string($command) . PHP_EOL
				.' result: ' 		.to_string($result) . PHP_EOL
				.' output: ' 		.to_string($output) . PHP_EOL
				.' worked_result: ' .to_string($worked_result)
				, logger::DEBUG
			);


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
	* @param object $options
	* {
	*	"tipo"				: "rsc29", 		// string
	*	"section_tipo"		: "rsc170", 	// string
	*	"section_id"		: "1",			// string
	*	"rotation_degrees"	: "60.49", 		// sting
	*	"background_color"	: "#ffffff", 	// string
	*	"alpha"				: false 		// bool; true || false
	* }
	*
	* @return string|null $result
	*/
	public static function rotate( object $options ) : ?string {

		$source				= $options->source;
		$target				= $options->target;
		$degrees			= $options->degrees;
		$rotation_mode		= $options->rotation_mode ?? 'right_angles'; // right_angles || free
		$background_color	= $options->background_color ?? null;
		$alpha				= $options->alpha ?? false;

		// command
			if($rotation_mode === 'free'){
				$color = isset($background_color)
					? "-virtual-pixel background -background '$background_color' -interpolate Mesh"
					: '';
				// if alpha is set and true replace the background color to transparent
				if(isset($alpha) && $alpha === true){
					$color =  "-alpha set -virtual-pixel transparent -interpolate Mesh";
				};
				$command	= MAGICK_PATH ."convert '$source' $color -distort SRT $degrees '$target'";
			}else{
				$command	= MAGICK_PATH . "convert -rotate \"$degrees\" '$source' '$target'";
			}

			$result = shell_exec($command);

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



	/**
	* is_opaque
	* Check all layers of the image to determinate if the image is transparent or is opaque
	* @param string $source_file
	* @return bool $is_opaque
	*/
	public static function is_opaque( string $source_file ) : bool {

		// default the image is opaque
		$is_opaque = true;

		// get all layers opacity
			$command	= MAGICK_PATH . 'identify -format "%[opaque]" -quiet '. $source_file;
			$output		= shell_exec($command);

		// check the output, if the output has any True, the image will be opaque, else (all layers are false) the image is transparent.
			if (!empty($output)) {
				$is_opaque = str_contains($output, 'True');
			}

		return $is_opaque;
	}//end is_opaque


}//end ImageMagick class
