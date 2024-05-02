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
			if(!mkdir($folder_path, 0750, true)) {
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
		$pdf_cropbox 	= $options->pdf_cropbox ?? null; // use to crop the pdf according his crop-boxes and bleed-box as '-define pdf:use-cropbox=true';
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
			if(!mkdir($folder_path, 0750, true)) {
				debug_log(__METHOD__
					." Error on create folder ". PHP_EOL
					. 'folder_path: ' . $folder_path
					, logger::ERROR
				);
				return false;
			}
		}

		// convert 21900.jpg json: : Get info about source file color space
		$colorspace_command	= MAGICK_PATH . "identify -quiet -format '%[colorspace]' " .$source_file. "[0]";
		$colorspace_info	= shell_exec($colorspace_command);	//-format "%[EXIF:DateTimeOriginal]"

		# Layers info
		# get thumbnail identification
		$ar_valid_layers = [];
		if(!isset($ar_layers)){

			// get the layer number of the image
			// layer number include the layer 0 that is a flat version of the image,
			// in tiff the layer 0 is a flat without transparency and is not possible to use it
			// in psd format layer 0 is a flat version with transparency.
			// to be compatible doesn't use the layer 0
			$layer_number = (int)self::get_layers_file_info( $source_file );

			// fill the valid layers removing the layer 0
			if($layer_number > 1){
				for ($i=1; $i < $layer_number; $i++) {
					$ar_valid_layers[] = $i;
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

			$begin_flags .= isset($pdf_cropbox)
				? '-define pdf:use-cropbox=true'
				: '';

		// Middle flags : Command flags between source and output files.
			$middle_flags = '';

			// when the image has layer remove the composite and flatten option to preserve the transparency
			if(!empty($ar_valid_layers)){
				$composite		= false;
				$flatten		= false;

				// set white background when the final image is opaque (as .jpg images)
				$background = ($is_opaque === true)
					? '-background "#FFFFFF"'
					: '-background none';

				// set the layer merge with his relative position into the image
				$middle_flags	.=' -layers coalesce '.$background.' -layers merge ';
			}

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
					. ' exec command bad result' . PHP_EOL
					. ' worked_result:' . to_string($worked_result) . PHP_EOL
					. ' output: ' . to_string($output). PHP_EOL
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					dump($bt, ' bt -- options: ++ '.to_string($options));
				}
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
	public static function get_layers_file_info( string $source_file ) : int {

		$ar_layers = array();

		// tiff info. Get the layer number of TIFF (PSD use the same property) :

			$command		= MAGICK_PATH . 'identify -quiet -format "%n %[tiff:has-layers]\n" '. $source_file .' | tail -1';
			$tiff_format	= shell_exec($command);
			// the result could be:
			// 1 		- without layer, for the flatten images
			// 8 true 	- the number of the layers and bolean true, (PSD files doesn't has the bool)
			// the layer number include the layer 0, that is a flat image of all layers
			$ar_lines		= explode(" ", $tiff_format);
			$layer_number	= (int)$ar_lines[0];

			// if layer number is greater than 1 send the number
			if($layer_number > 1 ){
				return $layer_number;
			}else{
				return 1; //$ar_lines[0]
			}

		// // image format
		// 	$command	= MAGICK_PATH . 'identify -quiet -format "%[scene]:%[tiff:subfiletype]\n" '. $source_file;
		// 	$output		= shell_exec($command);
		// // parse output
		// 	if (!empty($output)) {
		// 		$output		= trim($output);
		// 		$ar_lines	= explode("\n", $output);
		// 		foreach ($ar_lines as $key => $value) {

		// 			$ar_part2	= explode(":", $value);
		// 			$layer_key	= $ar_part2[0];

		// 			// $layer_type = ($tiff_format<=2 && $key>0)
		// 			// 	? 'REDUCEDIMAGE'
		// 			// 	: ($ar_part2[1] ?? null);

		// 			$ar_layers[$layer_key] = $ar_part2[1];;
		// 		}
		// 	}

		// return $ar_layers;
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
			$command	= MAGICK_PATH . 'identify -quiet -format "%[opaque]" '. $source_file;
			$output		= shell_exec($command);

		// check the output, if the output has any True, the image will be opaque, else (all layers are false) the image is transparent.
			if (!empty($output)) {
				$is_opaque = str_contains($output, 'True');
			}

		return $is_opaque;
	}//end is_opaque



	/**
	* GET_DATE_TIME_ORIGINAL
	* EXIF try to get date from file metadata
	* @param string $file
	* 	full file path
	* @return dd_date|null
	* dd_date object
	*/
	public static function get_date_time_original(string $file) : ?dd_date {

		$command			= MAGICK_PATH . 'identify -quiet -format "%[EXIF:DateTimeOriginal]" ' .'"'.$file.'"';
		$DateTimeOriginal	= shell_exec($command);
		$regex				= "/^(-?[0-9]+)[-:\/.]?([0-9]+)?[-:\/.]?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?$/";

		if(empty($DateTimeOriginal)){
			$command			= MAGICK_PATH . 'identify -quiet -format "%[date:modify]" ' .'"'.$file.'"';
			$DateTimeOriginal	= shell_exec($command);
			$regex   = "/^(\d{4})[-:\/.]?(\d{2})[-:\/.]?(\d{2})T?(\d{2}):(\d{2}):(\d{2})[.]?(\d+)?[\+]?(\d{2})?[-:\/.]?(\d{2})?/";
		}

		if (!empty($DateTimeOriginal)) {

			$dd_date		= new dd_date();
			$original_dato	= (string)$DateTimeOriginal;

			preg_match($regex, $original_dato, $matches);

			if(isset($matches[1])) $dd_date->set_year((int)$matches[1]);
			if(isset($matches[2])) $dd_date->set_month((int)$matches[2]);
			if(isset($matches[3])) $dd_date->set_day((int)$matches[3]);
			if(isset($matches[4])) $dd_date->set_hour((int)$matches[4]);
			if(isset($matches[5])) $dd_date->set_minute((int)$matches[5]);
			if(isset($matches[6])) $dd_date->set_second((int)$matches[6]);
			if(isset($matches[7])) $dd_date->set_ms((int)$matches[7]);
			// if(isset($matches[8])) $dd_date->set_timezonehh((int)$matches[8]);
			// if(isset($matches[9])) $dd_date->set_timezonemm((int)$matches[9]);

			return $dd_date;
		}

		return null;
	}//end get_date_time_original


}//end ImageMagick class
