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
	* @return string|bool $result
	*/
	public static function dd_thumb(string $source_file, string $target_file) : string|bool {

		// Valid path verify
		$folder_path = pathinfo($target_file)['dirname'];
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0750, true)) {
				// throw new Exception(" Error on read or create dd_thumb directory. Permission denied");
				debug_log(__METHOD__
					. " Error on read or create dd_thumb directory. Permission denied  " . PHP_EOL
					. ' folder_path: ' . to_string($folder_path)
					, logger::ERROR
				);
			}
		}

		$width  = defined('DEDALO_IMAGE_THUMB_WIDTH')  ? DEDALO_IMAGE_THUMB_WIDTH  : 224;
		$height = defined('DEDALO_IMAGE_THUMB_HEIGHT') ? DEDALO_IMAGE_THUMB_HEIGHT : 149;

		// Like "102x57"
		$dimensions = $width.'x'.$height.'>';

		// command
		$command = implode(' ', [
			'nice -n 19',
			MAGICK_PATH."convert -define jpeg:size=400x400 \"$source_file\" -thumbnail '$dimensions' -auto-orient -gravity center -unsharp 0x.5 -quality 90 \"$target_file\" "
		]);

		// run command
		$result = exec($command.' 2>&1', $output, $worked_result);

		if ($worked_result!=0) {
			debug_log(__METHOD__
				."  worked_result : output: ".to_string($output)." - worked_result:"
				.to_string($worked_result)
				, logger::WARNING
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

		$source_extension		= pathinfo($source_file, PATHINFO_EXTENSION);
		$extension				= pathinfo($target_file, PATHINFO_EXTENSION);
		$ar_opaque_extensions	= ['jpg','jpeg'];

		// check if the original image is opaque or transparent (it doesn't check if the image has meta channel)
		$is_opaque = true;
		if(!in_array($extension, $ar_opaque_extensions)){
			$is_opaque = self::is_opaque($source_file);
		}

		//check if the original image has a meta channel (transparent channel, alpha channel)
		$has_meta_channel = self::has_meta_channel($source_file);

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

		// Get info about source file color space
		$command = implode(' ', [
			'nice -n 19',
			MAGICK_PATH . "identify -quiet -format '%[colorspace]' " .$source_file. "[0]"
		]);
		$colorspace_info = shell_exec($command);	//-format "%[EXIF:DateTimeOriginal]"

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

			// set white background when the final image is opaque (as .jpg images)
			// or set none for transparent images (all images except the defines by opaque_extension)
				$background = ($is_opaque === true || in_array($extension, $ar_opaque_extensions) )
					? '-background "#ffffff"'
					: '-background none';

			// If the image has a meta channel, the original image is transparent and the meta channel need to be apply as alpha channel
				if($has_meta_channel === true){
					$composite		= false;
					$flatten		= false;
					// copy the first meta channel into the alpha channel
					// Note: multiple meta channels are not supported
					$middle_flags =  '-channel-fx "meta0=>alpha"';

				}else if( $is_opaque === false ){
					// the image is transparent because any of the layers has a transparent pixels
					// in these cases copy the merge layer (layer 0 is always the composition of the image)
					// apply the alpha channel to it and set as new layer
					$composite		= false;
					$flatten		= false;
					$coalesce		= false;

					$middle_flags = '\( -clone 0 -alpha on -channel rgba -evaluate set 0 \)';
					// in tiff formats is necessary delete the original layer 0
					// in .psd, .avif or other transparent formats if the layer 0 is removed loose the composition
					if($source_extension === 'tif' || $source_extension === 'tiff' ){
						$middle_flags .= ' -delete 0';
					}
				}

			// set the layer merge with his relative position into the image
				$middle_flags	.=' '.$background.' -layers merge '; //-layers coalesce


				$middle_flags .= ($thumbnail===true)
					? ' -thumbnail '.DEDALO_IMAGE_THUMB_WIDTH.'x'.DEDALO_IMAGE_THUMB_HEIGHT
					: '';

				$middle_flags	.= ($coalesce === true && $is_opaque === false && $has_meta_channel === false)
					? " -coalesce "
					: '';

				$middle_flags	.= ($composite === true && $is_opaque === false && $has_meta_channel === false)
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
						// throw new Exception("Error Processing Request. Color profile not found in: $profile_source", 1);
						debug_log(__METHOD__
							. " Error Processing Request. Color profile not found in " . PHP_EOL
							. ' profile_source: ' . to_string($profile_source)
							, logger::ERROR
						);
					}
					if(!file_exists($profile_file)) {
						// throw new Exception("Error Processing Request. Color profile not found in: $profile_file", 1);
						debug_log(__METHOD__
							. " Error Processing Request. Color profile not found in " . PHP_EOL
							. ' profile_file: ' . to_string($profile_file)
							, logger::ERROR
						);
					}


					# Command middle_flags
					$middle_flags	.= ' -profile "'.$profile_source.'" ';
					$middle_flags	.= ' -profile "'.$profile_file.'" ';
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

			$middle_flags .= ' -quality '.$quality.' ';
			$middle_flags .= ' -auto-orient '; // Always add
			$middle_flags .= ' -quiet ';
			$middle_flags .= isset($resize)
				? ' -resize '. $resize.' ' // sample: 25% | 1024x756
				: '';

		// command
			$command = implode(' ', [
				'nice -n 19',
				MAGICK_PATH . 'magick '.$begin_flags.' '.$source_file.' '.$middle_flags.' "'.$target_file.'" '
			]);

		// debug
			debug_log(__METHOD__
				." Command ".to_string($command)
				, logger::DEBUG
			);

		// exec command
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
	* @return int $layer_number
	*/
	public static function get_layers_file_info( string $source_file ) : int {

		// tiff info. Get the layer number of TIFF (PSD use the same property) :
			$command		= MAGICK_PATH . 'identify -quiet -format "%n %[tiff:has-layers]\n" '. $source_file .' | tail -1';
			$tiff_format	= shell_exec($command);

			debug_log(__METHOD__
				. " get_layers_file_info command " . PHP_EOL
				. 'command: ' .to_string($command) . PHP_EOL
				. 'tiff_format: ' . json_encode($tiff_format)
				, logger::WARNING
			);

			// empty case
			if (empty($tiff_format)) {
				return 1;
			}

			// the result could be:
			// 1 		- without layer, for the flatten images
			// 8 true 	- the number of the layers and boolean true, (PSD files doesn't has the bool)
			// the layer number include the layer 0, that is a flat image of all layers
			$ar_lines		= explode(' ', $tiff_format);
			$layer_number	= (int)$ar_lines[0];

			// if layer number is greater than 1 send the number
			if($layer_number > 1 ){
				return $layer_number;
			}

			return 1; //$ar_lines[0]

	}//end get_layers_file_info




	/**
	* HAS_META_CHANNEL
	* Check all channels in the image and find if any of them has a meta channel
	* Meta channel is use as alpha channel to define areas to be transparent
	* imagemagick don't apply meta channels as alpha channels
	* but tiff format or psd formats use it as alpha channel defining transparent pixels
	* @param string $source_file
	* @return bool $meta_channel
	*/
	public static function has_meta_channel( string $source_file ) : bool {

		// tiff info. Get the channel number of TIFF (PSD use the same property) :
			$command			= MAGICK_PATH . 'identify -quiet -format "%[channels]" '. $source_file;
			$string_channels	= shell_exec($command);

			debug_log(__METHOD__
				. " has_meta_channel command " . PHP_EOL
				. 'command: ' .to_string($command) . PHP_EOL
				. 'channels: ' . json_encode($string_channels)
				, logger::WARNING
			);

		// the result could be:
		// srgb  3.0 -> 3 channels 0 meta channels, without any meta channel (transparent channel)
		// srgb  4.1 -> 4 channels 1 of them is meta channel (transparent channel)
		// srgba 6.2 -> 6 channels 2 of them is meta channel (transparent channel)

		// find every number into the string 3.1
		preg_match_all('/\d+.\d+/', $string_channels, $ar_channels_info);

		$meta_channel = false;
		foreach ($ar_channels_info[0] as $channels_data) {
			$ar_channel_info 	= explode('.', $channels_data);
			$meta_channel_info = (int)$ar_channel_info[1];

			if($meta_channel_info > 0){
				$meta_channel = true;
				break;
			}
		}

		return $meta_channel;
	}//end has_meta_channel



	/**
	* ROTATE
	* 	Rotate and save source image to target (self or other)
	* @param object $options
	* {
	*	"tipo"				: "rsc29", 		// string
	*	"section_tipo"		: "rsc170", 	// string
	*	"section_id"		: "1",			// string
	*	"degrees"			: "60.49", 		// sting
	* 	"rotation_mode"		: "expanded" 	// string; default || expanded
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
		$rotation_mode		= $options->rotation_mode ?? 'default'; // default || expanded
		$background_color	= $options->background_color ?? null;
		$alpha				= $options->alpha ?? false;

		// command
			$color = isset($background_color)
				? "-virtual-pixel background -background '$background_color' -interpolate Mesh"
				: '';
			// if alpha is set and true replace the background color to transparent
			if(isset($alpha) && $alpha === true){
				$color =  "-alpha set -virtual-pixel transparent -background none -interpolate Mesh";
			};
			if($rotation_mode === 'expanded'){
				$command = MAGICK_PATH ."convert '$source' $color +distort SRT $degrees '$target'";
			}else{
				$command = MAGICK_PATH . "convert '$source' $color -distort SRT $degrees '$target'";
			}

			$result = shell_exec($command);

		// debug
			debug_log(__METHOD__
				." Exec Command:" . PHP_EOL
				. $command
				, logger::DEBUG
			);


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

		// debug
			debug_log(__METHOD__
				." Exec Command:" . PHP_EOL . $command
				, logger::DEBUG
			);

		$result = !empty($exec_result)
			? json_decode($exec_result)
			: null;


		return $result;
	}//end get_media_attributes



	/**
	* IS_OPAQUE
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
				$output		= strtolower($output);
				$is_opaque	= str_contains($output, 'false')
					? false
					: true;
			}

		return $is_opaque;
	}//end is_opaque



	/**
	* GET_DATE_TIME_ORIGINAL
	* EXIF try to get date from file metadata
	* @param string $file
	* 	full file path
	* @return dd_date|null $dd_date
	* 	dd_date object
	*/
	public static function get_date_time_original(string $file) : ?dd_date {

		$command			= MAGICK_PATH . 'identify -quiet -format "%[EXIF:DateTimeOriginal]" ' .'"'.$file.'"';
		$DateTimeOriginal	= shell_exec($command);
		$regex				= "/^(-?[0-9]+)[-:\/.]?([0-9]+)?[-:\/.]?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?$/";

		if(empty($DateTimeOriginal)){
			$command			= MAGICK_PATH . 'identify -quiet -format "%[date:modify]" ' .'"'.$file.'"';
			$DateTimeOriginal	= shell_exec($command);
			$regex = "/^(\d{4})[-:\/.]?(\d{2})[-:\/.]?(\d{2})T?(\d{2}):(\d{2}):(\d{2})[.]?(\d+)?[\+]?(\d{2})?[-:\/.]?(\d{2})?/";
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


	/**
	* GET_IMAGE_DIMENSIONS
	* Calculate image size in pixels
	* File used to read data will be the quality received version,
	* usually default
	* @param string $file_path
	* @return object $image_dimensions
	* 	{
	* 		width: 1280
	* 		height: 1024
	* 	}
	*/
	public static function get_dimensions(string $file_path) : object {

		$image_dimensions = new stdClass();

		$command_orientation	= MAGICK_PATH . 'identify -quiet -format "%[orientation]" ' .'"'.$file_path.'"[0]';
		$orientation			= shell_exec($command_orientation);

		$commnad_w	= MAGICK_PATH . 'identify -quiet -format %w ' .'"'.$file_path.'"[0]';
		$width		= shell_exec($commnad_w);

		$commnad_h	= MAGICK_PATH . 'identify -quiet -format %h ' .'"'.$file_path.'"[0]';
		$height		= shell_exec($commnad_h);

			// Undefined  - 0
			// Undefined  - [When no metadata]
			// TopLeft  - 1
			// TopRight  - 2
			// BottomRight  - 3
			// BottomLeft  - 4
			// LeftTop  - 5
			// RightTop  - 6
			// RightBottom  - 7
			// LeftBottom  - 8
			// Unrecognized  - any value between 9-65535, since
			// 				there is no mapping from value 9-65535
			// 				to some geometry like 'LeftBottom'

			switch( $orientation ) {
				case 'LeftBottom':// rotate 90
				case 'RightTop':// rotate 270 || -90
					$width 	= $height;
					$height = $width;
					break;
				case 'TopLeft':	// rotate 0
				case 'BottomRight': // rotate 180
				default:
					$width 	= $width ?? null;
					$height = $height ?? null;
					break;
			}

		// image_dimensions set value
			$image_dimensions->width	= (int)$width;
			$image_dimensions->height	= (int)$height;


		return $image_dimensions;
	}//end get_image_dimensions



}//end ImageMagick class
