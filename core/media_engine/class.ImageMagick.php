<?php
declare(strict_types=1);
/**
* CLASS IMAGEMAGICK
* Provides a static façade over the ImageMagick command-line tools (`magick`,
* `convert`, `identify`) for all image-processing operations in Dédalo.
*
* Responsibilities:
* - Resolving the installed binary path for both ImageMagick v6 (`convert`/`identify`)
*   and v7 (`magick`/`magick identify`), since the two versions ship different binary names.
* - Reading per-installation behaviour overrides from the `MAGICK_CONFIG` constant
*   defined in `config.php` (e.g. OS-specific `remove_layer_0` for TIFF transparency).
* - Converting source images to web-ready derivates (JPEG, WebP, PNG, etc.) with
*   full colour-space handling: CMYK→sRGB profile conversion, ICC profile stripping,
*   layer/channel merging, meta-channel→alpha promotion, and opaque/transparent detection.
* - Building and executing the thumbnail derivate used throughout the UI
*   (`dd_thumb`), driven by `DEDALO_IMAGE_THUMB_WIDTH`/`DEDALO_IMAGE_THUMB_HEIGHT`.
* - Querying file metadata: dimensions (orientation-aware), layer count, channel
*   composition, EXIF date, and the full `json:` attribute dump.
* - Performing in-place or cross-path rotate and crop operations with
*   fine-grained distortion mode control.
*
* All shell commands are run with `nice -n 19` to avoid starving the web process,
* and all user-supplied paths are escaped via `escapeshellarg()`.
*
* Key constants expected from `config.php`:
*   - MAGICK_PATH          — directory that contains the ImageMagick binaries (trailing slash).
*   - MAGICK_CONFIG        — optional array with keys `remove_layer_0` (bool) and `is_opaque` (?bool).
*   - COLOR_PROFILES_PATH  — directory containing ICC colour-profile files.
*   - DEDALO_IMAGE_THUMB_WIDTH / DEDALO_IMAGE_THUMB_HEIGHT — thumbnail geometry.
*
* @package Dédalo
* @subpackage Core
*/
final class ImageMagick {



	/**
	* GET_MAGICK_CONFIG
	* Reads and normalises the ImageMagick configuration defined in `config.php`.
	*
	* The constant `MAGICK_CONFIG` is expected to be an associative array set in
	* `config.php`. If the constant is absent, an empty `stdClass` is used so
	* that every key falls back to the documented default below:
	*   - `remove_layer_0` (bool, default false): On some OS/IM version combinations
	*     (Rocky Linux, RHEL, macOS), the TIFF "layer 0" flat-composition layer must be
	*     deleted to preserve per-layer transparency. On Ubuntu it must be kept.
	*   - `is_opaque` (?bool, default null): When set to `false`, every image is treated
	*     as transparent (needed on Rocky Linux where `%[opaque]` detection is unreliable).
	*     When `null`, `is_opaque()` performs the normal per-file check.
	* @return object $magick_config - stdClass with `remove_layer_0` and `is_opaque` properties.
	*/
	public static function get_magick_config() : object {

		$config = defined('MAGICK_CONFIG') ? (object)MAGICK_CONFIG : new stdClass();

		$magick_config = new stdClass();
			$magick_config->remove_layer_0	= $config->remove_layer_0 ?? false;
			$magick_config->is_opaque		= $config->is_opaque ?? null;

		return $magick_config;
	}//end get_magick_config



	/**
	* GET_IMAGEMAGICK_INSTALLED_PATH
	* Resolves the full path to the ImageMagick conversion binary, caching the
	* result in a static variable so the filesystem check happens only once per
	* PHP process.
	*
	* ImageMagick v7 ships a unified `magick` binary; v6 uses separate binaries
	* (`convert`, `identify`, …). This method returns `MAGICK_PATH . 'magick'`
	* when that file exists, and falls back to `MAGICK_PATH . 'convert'` for
	* installations that are still on v6.
	*
	* (!) The static cache is process-scoped: if the binary is replaced on disk
	*     (e.g. during a package upgrade) the cached path becomes stale until the
	*     PHP worker is restarted.
	* @return string - absolute path to the conversion binary.
	*/
	public static function get_imagemagick_installed_path() : string {
		static $path;
		if (isset($path)) return $path;

		$path = MAGICK_PATH . 'magick';
		if(file_exists($path)) {
			return $path;
		}

		$path = MAGICK_PATH . 'convert';
		return $path;
	}//end get_imagemagick_installed_path



	/**
	* GET_IMAGEMAGICK_IDENTIFY_PATH
	* Resolves the full command string for the ImageMagick `identify` tool,
	* caching the result in a static variable.
	*
	* On ImageMagick v7 the sub-command form `magick identify` is used (because
	* `magick` is the single unified entry-point). On v6 installations the
	* standalone `identify` binary at `MAGICK_PATH` is returned instead.
	*
	* (!) Returns a command *string* (potentially with a space and a sub-command),
	*     not a bare file path — callers must not pass it through `file_exists()`.
	* @return string - command string suitable for shell interpolation, e.g. `'/usr/bin/magick identify'`.
	*/
	public static function get_imagemagick_identify_path() : string {
		static $path;
		if (isset($path)) return $path;

		// If 'magick' exists, use 'magick identify'.
		// Note: get_imagemagick_installed_path() returns the full path to the binary.
		if (str_ends_with(self::get_imagemagick_installed_path(), 'magick')) {
			$path = self::get_imagemagick_installed_path() . ' identify';
		} else {
			$path = MAGICK_PATH . 'identify';
		}

		return $path;
	}//end get_imagemagick_identify_path



	/**
	* GET_IMAGEMAGICK_PDFINFO_PATH
	* Returns the full path to the `pdfinfo` utility (part of Poppler, not
	* ImageMagick itself) expected to live in `MAGICK_PATH`.
	*
	* `pdfinfo` is used elsewhere in the media pipeline to read PDF metadata
	* without invoking a full IM conversion. There is intentionally no version
	* detection or caching here because `pdfinfo` is always a standalone binary.
	* @return string - absolute path to the `pdfinfo` binary.
	*/
	public static function get_imagemagick_pdfinfo_path() : string {

		return MAGICK_PATH . 'pdfinfo';
	}//end get_imagemagick_pdfinfo_path



	/**
	* GET_VERSION
	* Get binary version
	* @return string
	*/
	public static function get_version() : string {

		$cmd  = ImageMagick::get_imagemagick_installed_path();
		$cmd .= ' -version | sed -n "s/Version: ImageMagick \([-0-9.]*\).*/\1/p;" ';

		$version = shell_exec($cmd) ?? '';

		return trim($version);
	}//end get_version



	/**
	* DD_THUMB
	* Generates the fixed-size thumbnail derivate of an image file using the
	* ImageMagick `-thumbnail` preset and writes it to `$target_file`.
	*
	* Thumbnail dimensions are read from the constants `DEDALO_IMAGE_THUMB_WIDTH`
	* and `DEDALO_IMAGE_THUMB_HEIGHT` (falling back to 224×149 if undefined). The
	* `>` suffix on the geometry string means ImageMagick only *shrinks* images
	* that exceed the specified size — it never enlarges a small source image.
	*
	* The target directory is created (mode 0750, recursive) if it does not yet
	* exist. Failure to create it is logged at ERROR level but does not throw, so
	* the subsequent IM command will likely fail as well and return false.
	*
	* The command is run at `nice -n 19` (lowest CPU priority), with
	* `-unsharp 0x.5` to compensate for the sharpness loss from resampling and
	* `-auto-orient` to honour EXIF rotation tags.
	*
	* @param string $source_file - full absolute path of the source image.
	* @param string $target_file - full absolute path where the thumbnail will be written.
	* @return string|bool $result - the last line printed by `exec()` on success, or false on failure.
	*/
	public static function dd_thumb( string $source_file, string $target_file ) : string|bool {

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
			ImageMagick::get_imagemagick_installed_path()." -define jpeg:size=400x400 " . escapeshellarg($source_file) . " -thumbnail '$dimensions' -auto-orient -gravity center -unsharp 0x.5 -quality 90 " . escapeshellarg($target_file)
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
	* Converts a source image file into a derivate using a rich set of ImageMagick
	* options, writing the result to `$options->target_file`.
	*
	* This is the central conversion engine for the image media pipeline. It handles:
	*   - Layer selection: a single layer, a list of layers, or all layers (null).
	*   - Colour-space detection and CMYK→sRGB conversion using ICC profiles when the
	*     source is identified as CMYK (via `identify -format '%[colorspace]'`).
	*   - Transparency detection via `is_opaque()` and `has_meta_channel()`:
	*       * If a meta channel is present (TIFF/PSD using meta as alpha), the channel
	*         is promoted to a true alpha channel with `-channel-fx "meta0=>alpha"`.
	*       * If the image has transparent pixels (is_opaque === false), a composite
	*         layer is constructed manually; optionally the raw TIFF "layer 0"
	*         flat-composition is deleted (OS-specific, see `get_magick_config()`).
	*       * JPEG and other opaque-format targets always use a white background.
	*   - Flattening, stripping, compositing, coalescing — each individually gated.
	*   - Optional `-thumbnail` preset (fixed width/height from constants).
	*   - Optional `-resize` to a percentage or pixel geometry.
	*   - Density override for rasterising PDFs at a specific DPI.
	*   - Anti-aliasing and PDF crop-box flags at the command prefix position.
	*
	* The command runs at `nice -n 19`. On non-zero exit codes the failure is logged
	* at WARNING. A non-zero exit is *not* always a hard failure: ImageMagick sometimes
	* exits non-zero but produces valid output; the method only returns false when the
	* output string explicitly contains "ERROR:".
	*
	* @param object $options - conversion parameters:
	*   - string   source_file  — absolute path of the input file (required).
	*   - string   target_file  — absolute path for the output file (required).
	*   - int|array|null ar_layers     = null     — layer index, array of indices, or null for all.
	*   - int      quality       = 90              — JPEG/WebP compression quality (0–100).
	*   - bool     thumbnail     = false           — apply fixed thumb geometry from constants.
	*   - string   colorspace    = 'sRGB'          — target colour space label (informational).
	*   - string   profile_in    = 'Generic_CMYK_Profile.icc' — input ICC profile filename.
	*   - string   profile_out   = 'sRGB_Profile.icc'         — output ICC profile filename.
	*   - bool     flatten       = true            — flatten layers onto a single canvas.
	*   - int|null density       = null            — input resolution in DPI (e.g. 150 for PDF).
	*   - string|null pdf_cropbox = null           — when set, adds `-define pdf:use-cropbox=true`.
	*   - bool     strip         = true            — strip metadata (EXIF, profiles) from output.
	*   - bool     antialias     = true            — enable anti-aliasing.
	*   - bool     composite     = true            — composite layers when transparent.
	*   - bool     coalesce      = true            — coalesce animation frames when transparent.
	*   - string|null resize     = null            — geometry string, e.g. '25%' or '1024x756'.
	* @return string|bool $result - last line of exec() output on success, or false on hard error.
	*/
	public static function convert( object $options ) : string|bool {

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

		// Valid source file verify
		if (!file_exists($source_file)) {
			debug_log(__METHOD__ . " Source file does not exist: $source_file", logger::ERROR);
			return false;
		}

		// check if the original image is opaque or transparent (it doesn't check if the image has meta channel)
		$is_opaque = true;
		if(!in_array($extension, $ar_opaque_extensions)){
			$is_opaque = self::is_opaque($source_file);
		}

		// check if the original image has a meta channel (transparent channel, alpha channel)
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
			ImageMagick::get_imagemagick_identify_path() . " -quiet -format '%[colorspace]' " . escapeshellarg($source_file) . "[0]"
		]);
		$colorspace_info = shell_exec($command);	//-format "%[EXIF:DateTimeOriginal]"

		// set layer
			$source_file_magick = isset($ar_layers)
				? escapeshellarg($source_file) . (is_array($ar_layers) ? '['.implode(',', $ar_layers).']' : '['.(string)$ar_layers.']')
				: escapeshellarg($source_file);

		// begin flags : Command flags before source file.
			$begin_flags = '';

			$begin_flags .= isset($density)
				? '-density '. escapeshellarg((string)$density).' '
				: '';
			$begin_flags .= ($antialias === true)
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
				if($has_meta_channel === true && !in_array($extension, $ar_opaque_extensions) ){
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
					// In some operating systems (Roky, RedHat, MacOsX, ...), in tiff formats is necessary to delete the original layer 0
					// in .psd, .avif or other transparent formats if the layer 0 is removed the final image loose the composition
					$remove_layer_0  = ImageMagick::get_magick_config()->remove_layer_0;
					if( $remove_layer_0 === true && ($source_extension === 'tif' || $source_extension === 'tiff') ){
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
					$has_profile_source = file_exists($profile_source);
					if(!$has_profile_source) {
						// throw new Exception("Error Processing Request. Color profile not found in: $profile_source", 1);
						debug_log(__METHOD__
							. " Error Processing Request. Color profile not found in " . PHP_EOL
							. ' profile_source: ' . to_string($profile_source)
							, logger::ERROR
						);
					}
					$has_profile_file = file_exists($profile_file);
					if(!$has_profile_file) {
						// throw new Exception("Error Processing Request. Color profile not found in: $profile_file", 1);
						debug_log(__METHOD__
							. " Error Processing Request. Color profile not found in " . PHP_EOL
							. ' profile_file: ' . to_string($profile_file)
							, logger::ERROR
						);
					}


					# Command middle_flags
					if ($has_profile_source) {
						$middle_flags .= ' -profile '. escapeshellarg((string)$profile_source) .' ';
					}
					if ($has_profile_file) {
						$middle_flags .= ' -profile '. escapeshellarg((string)$profile_file) .' ';
					}
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

			$middle_flags .= ' -quality '.escapeshellarg((string)$quality).' ';
			$middle_flags .= ' -auto-orient '; // Always add
			$middle_flags .= ' -quiet ';
			$middle_flags .= isset($resize)
				? ' -resize '. escapeshellarg((string)$resize).' ' // sample: 25% | 1024x756
				: '';

		// command
			$command = implode(' ', [
				'nice -n 19',
				ImageMagick::get_imagemagick_installed_path().' '.$begin_flags.' '.$source_file_magick.' '.$middle_flags.' '. escapeshellarg($target_file)
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
					. ' result: ' .to_string($result) . PHP_EOL
					. ' output: ' . to_string($output). PHP_EOL
					, logger::WARNING
				);
				if(SHOW_DEBUG===true) {
					$bt = debug_backtrace();
					dump($bt[1], ' bt[1] -- options: ++ '.to_string($options));
				}
				if (stripos(to_string($output), 'ERROR:')!==false) {
					return false;
				}
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
	* GET_LAYERS_FILE_INFO
	* Returns the number of layers (pages/frames) in a TIFF or PSD file.
	*
	* Uses `identify -format "%n %[tiff:has-layers]\n"` and takes only the last
	* output line (via `tail -1`) because multi-layer TIFF files emit one line per
	* layer and only the final line carries the aggregate count. PSD files emit
	* the layer count without the boolean flag.
	*
	* The output format is one of:
	*   - `"1"`               — single-layer / flattened image.
	*   - `"8 true"`          — 8 layers (TIFF); the boolean flag is present.
	*   - `"4"`               — 4 layers (PSD); no boolean suffix.
	*
	* Note that layer 0 in the IM numbering is always the flat composite of all
	* layers, so the count returned includes that synthetic composite.
	*
	* Returns 1 for any format that does not report layers (empty output, flat
	* images, or non-TIFF/PSD files passed in by the caller).
	*
	* @param string $source_file - absolute path of the image to inspect.
	* @return int $layer_number - number of layers; minimum 1.
	*/
	public static function get_layers_file_info( string $source_file ) : int {

		// tiff info. Get the layer number of TIFF (PSD use the same property) :
			$command		= ImageMagick::get_imagemagick_identify_path() . ' -quiet -format "%n %[tiff:has-layers]\n" '. escapeshellarg($source_file) .' | tail -1';
			$tiff_format	= shell_exec($command);

		// debug
			debug_log(__METHOD__
				. " get_layers_file_info command " . PHP_EOL
				. 'command: ' .to_string($command) . PHP_EOL
				. 'tiff_format: ' . json_encode($tiff_format)
				, logger::DEBUG
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


		return 1;
	}//end get_layers_file_info



	/**
	* HAS_META_CHANNEL
	* Check all channels in the image and find if any of them has a meta channel
	* Meta channel is use as alpha channel to define areas to be transparent
	* imagemagick don't apply meta channels as alpha channels
	* but tiff format or psd formats use it as alpha channel defining transparent pixels
	*
	* Only inspects TIFF and PSD files (`.tif`, `.tiff`, `.psd`). All other
	* extensions return false immediately and log a WARNING, because the
	* `%[channels]` property carries meta-channel information only for those formats.
	*
	* The `identify` output uses a `<total>.<meta>` notation per layer, e.g.:
	*   - `"srgb  3.0"` — 3 channels, 0 meta channels → no alpha defined by meta.
	*   - `"srgb  4.1"` — 4 channels, 1 meta channel  → transparent via meta.
	*   - `"srgba 6.2"` — 6 channels, 2 meta channels → transparent via meta.
	* The regex extracts every `\d+\.\d+` pattern and checks whether the decimal
	* part (the meta-channel count) is greater than zero.
	*
	* @param string $source_file - absolute path of the file to inspect.
	* @return bool $meta_channel - true when at least one meta channel exists, false otherwise.
	*/
	public static function has_meta_channel( string $source_file ) : bool {

		if (!file_exists($source_file)) {
			debug_log(__METHOD__ . " Source file does not exist: $source_file", logger::ERROR);
			return false;
		}

		// extension check. Prevent to process files that are not tif or psd, eg. 'svg'
		$extension = strtolower(pathinfo($source_file, PATHINFO_EXTENSION));
		$valid_extensions = ['tif', 'tiff', 'psd'];
		if (!in_array($extension, $valid_extensions)) {
			debug_log(__METHOD__ . " Ignored has_meta_channel check for source file. It's not a tif or psd file: $source_file", logger::WARNING);
			return false;
		}

		// tiff info. Get the channel number of TIFF (PSD use the same property) :
			$command = ImageMagick::get_imagemagick_identify_path() . ' -quiet -format "%[channels]" ' . escapeshellarg($source_file);
			exec($command . ' 2>&1', $output, $worked_result);
			$string_channels = implode(PHP_EOL, $output);

			debug_log(__METHOD__
				. " has_meta_channel command " . PHP_EOL
				. 'command: ' . $command . PHP_EOL
				. 'channels: ' . json_encode($string_channels)
				, logger::DEBUG
			);

			if ($worked_result !== 0 || empty($string_channels)) {
				debug_log(__METHOD__
					. " Unable to get command execution result on get channels, or error occurred. " . PHP_EOL
					. 'command: ' . $command . ' 2>&1' . PHP_EOL
					. 'worked_result: ' . (string)$worked_result . PHP_EOL
					. 'output: ' . json_encode($string_channels)
					, logger::ERROR
				);
				return false;
			}

		// the result could be:
		// srgb  3.0 -> 3 channels 0 meta channels, without any meta channel (transparent channel)
		// srgb  4.1 -> 4 channels 1 of them is meta channel (transparent channel)
		// srgba 6.2 -> 6 channels 2 of them is meta channel (transparent channel)

		// find every number into the string 3.1
		preg_match_all('/\d+\.\d+/', $string_channels, $ar_channels_info);

		$meta_channel = false;
		if (!empty($ar_channels_info[0])) {
			foreach ($ar_channels_info[0] as $channels_data) {
				$ar_channel_info	= explode('.', $channels_data);
				$meta_channel_info	= (int)$ar_channel_info[1];

				if($meta_channel_info > 0){
					$meta_channel = true;
					break;
				}
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
	* Applies an SRT (Scale, Rotate, Translate) distortion to rotate the image
	* by the given number of degrees. Two modes are supported via `rotation_mode`:
	*   - `'default'`  — uses `-distort SRT` (canvas is clipped to the original size).
	*   - `'expanded'` — uses `+distort SRT` (canvas expands to fit the rotated content).
	*
	* Background fill behaviour:
	*   - When `alpha` is true: background is set to transparent (`-background none`)
	*     regardless of `background_color`.
	*   - When `background_color` is provided (and `alpha` is false): that hex colour
	*     fills the exposed corners.
	*   - When neither is set: no `-virtual-pixel` or background flag is added,
	*     leaving ImageMagick's default fill in effect.
	*
	* Returns null on non-zero exit code from the shell command.
	*
	* @param object $options - rotation parameters:
	*   - string      source          — absolute path of the input image (required).
	*   - string      target          — absolute path for the output image (required).
	*   - string|float degrees        — rotation angle in degrees (required).
	*   - string      rotation_mode   = 'default' — 'default' (clip) or 'expanded' (expand).
	*   - string|null background_color = null      — hex fill colour, e.g. '#ffffff'.
	*   - bool        alpha           = false       — when true, background is transparent.
	* @return string|null $result - last output line from exec() on success, null on failure or empty output.
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
				? "-virtual-pixel background -background " . escapeshellarg((string)$background_color) . " -interpolate Mesh"
				: '';
			// if alpha is set and true replace the background color to transparent
			if(isset($alpha) && $alpha === true){
				$color =  "-alpha set -virtual-pixel transparent -background none -interpolate Mesh";
			};

			$safe_degrees = escapeshellarg((string)$degrees);
			if($rotation_mode === 'expanded'){
				$command = ImageMagick::get_imagemagick_installed_path() ." ". escapeshellarg($source) ." $color +distort SRT $safe_degrees +repage ". escapeshellarg($target);
			}else{
				$command = ImageMagick::get_imagemagick_installed_path() ." ". escapeshellarg($source) ." $color -distort SRT $safe_degrees +repage ". escapeshellarg($target);
			}

			$result = exec($command . ' 2>&1', $output, $worked_result);

		// debug
			debug_log(__METHOD__
				." Exec Command:" . PHP_EOL
				. $command
				, logger::DEBUG
			);

			if ($worked_result !== 0) {
				debug_log(__METHOD__
					. ' exec command bad result' . PHP_EOL
					. ' command: ' . $command . PHP_EOL
					. ' worked_result: ' . to_string($worked_result) . PHP_EOL
					. ' output: ' . to_string($output)
					, logger::WARNING
				);
				return null;
			}

		return $result ?: null;
	}//end rotate




	/**
	* CROP
	* Crop with the given area and save source image to target (self or other)
	* @param object $options
	* {
	*	"tipo"				: "rsc29", 		// string
	*	"section_tipo"		: "rsc170", 	// string
	*	"section_id"		: "1",			// string
	*	"crop_area" 		: // crop area coordinates to apply to the image
	* 	{
	* 		x : x 			// Starting X position
	* 		y : y 			// Starting Y position
	* 		width : width 	// Crop width
	* 		height : height // Crop height
	*	}
	* }
	*
	* Translates the `crop_area` object into an ImageMagick geometry string
	* (`{width}x{height}+{x}+{y}`) and runs `magick/convert -crop … +repage`
	* to remove canvas padding after the crop.
	*
	* Even on a zero exit code from exec(), the method inspects the combined output
	* string for "ERROR:" or "geometry does not contain image" (ImageMagick may emit
	* these warnings while still returning exit code 0 for partial crops) and returns
	* null in those cases to prevent the caller from treating an empty/garbage file
	* as a successful derivate.
	*
	* @param object $options - crop parameters:
	*   - string $source    — absolute path of the source image (required).
	*   - string $target    — absolute path for the output image (required).
	*   - object $crop_area — geometry: `x` (int), `y` (int), `width` (int), `height` (int).
	* @return string|null $result - last exec() output line on success, null on failure or out-of-bounds geometry.
	*/
	public static function crop( object $options ) : ?string {

		$source				= $options->source;
		$target				= $options->target;
		$crop_area			= $options->crop_area;

		$width	= $crop_area->width;
		$height	= $crop_area->height;
		$x		= $crop_area->x;
		$y		= $crop_area->y;

		$geometry = escapeshellarg("{$width}x{$height}+{$x}+{$y}");

		// command
		$command = ImageMagick::get_imagemagick_installed_path() ." ". escapeshellarg($source) ." -crop {$geometry} +repage ". escapeshellarg($target);

		$result = exec($command . ' 2>&1', $output, $worked_result);

		// debug
			debug_log(__METHOD__
				." Exec Command:" . PHP_EOL
				. $command
				, logger::DEBUG
			);

			if ($worked_result !== 0) {
				debug_log(__METHOD__
					. ' exec command bad result' . PHP_EOL
					. ' command: ' . $command . PHP_EOL
					. ' worked_result: ' . to_string($worked_result) . PHP_EOL
					. ' output: ' . to_string($output)
					, logger::WARNING
				);
				return null;
			}

			// Check for error/warning messages even when exit code is 0
			// ImageMagick may return success (exit code 0) but output warnings for invalid geometry
			$output_string = to_string($output);
			if (stripos($output_string, 'ERROR:')!==false || stripos($output_string, 'geometry does not contain image')!==false) {
				debug_log(__METHOD__
					. ' ImageMagick reported error/warning despite success exit code' . PHP_EOL
					. ' output: ' . $output_string
					, logger::WARNING
				);
				return null;
			}

		return $result ?: null;
	}//end crop



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
	*
	* Invokes `magick <file> json:` to dump the full IM JSON attribute block for
	* every layer in the file. The output is collected via exec() into the `$output`
	* array, joined with newlines, and decoded as JSON.
	*
	* Returns null when the command exits with a non-zero status or when the
	* combined output is empty/unparseable.
	*
	* @param string $file_path - absolute path of the image file to inspect.
	* @return array|null $result - decoded JSON attribute objects (one per layer), or null on failure.
	*/
	public static function get_media_attributes( string $file_path ) : ?array {

		// convert image.jpg[1x1+0+0] json:
			$command = ImageMagick::get_imagemagick_installed_path() . " ". escapeshellarg($file_path) ." json: ";
			exec($command . ' 2>&1', $output, $worked_result);

		// debug
			debug_log(__METHOD__
				." Exec Command:" . PHP_EOL . $command
				, logger::DEBUG
			);

			if ($worked_result !== 0) {
				debug_log(__METHOD__
					. ' exec command bad result' . PHP_EOL
					. ' command: ' . $command . PHP_EOL
					. ' worked_result: ' . to_string($worked_result) . PHP_EOL
					. ' output: ' . to_string($output)
					, logger::WARNING
				);
				return null;
			}

		$result = !empty($output)
			? json_decode(implode(PHP_EOL, $output))
			: null;


		return $result;
	}//end get_media_attributes



	/**
	* IS_OPAQUE
	* Check all layers of the image to determinate if the image is transparent or is opaque
	* @param string $source_file
	* @return bool $is_opaque
	*
	* Returns true (opaque) when at least one layer reports `%[opaque] = True`.
	* Returns false (transparent) when every layer reports `False`.
	*
	* The `MAGICK_CONFIG` constant can override per-image detection entirely:
	*   - `is_opaque = false` — forces all images to be treated as transparent
	*     (needed on Rocky Linux where the `%[opaque]` property is unreliable).
	*   - `is_opaque = true`  — forces all images to be treated as opaque.
	*   - `is_opaque = null`  — performs the normal per-file shell check (default).
	*
	* (!) This method does NOT check for the presence of a meta channel. Use
	*     `has_meta_channel()` separately when working with TIFF/PSD files that
	*     define transparency through a meta channel rather than a true alpha layer.
	*/
	public static function is_opaque( string $source_file ) : bool {

		$is_opaque = ImageMagick::get_magick_config()->is_opaque;

		if( isset($is_opaque) ){
			return $is_opaque;
		}

		// default the image is opaque
		$is_opaque = true;

		// get all layers opacity
			$command	= ImageMagick::get_imagemagick_identify_path() . ' -quiet -format "%[opaque]" '. escapeshellarg($source_file);
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
	*
	* Attempts to extract the capture date from the image in two passes:
	*   1. `%[EXIF:DateTimeOriginal]` — the primary EXIF capture timestamp,
	*      expected in `YYYY:MM:DD HH:MM:SS` format.
	*   2. `%[date:modify]` — the file-system modification date in ISO 8601
	*      format, used as a fallback when no EXIF date is present.
	*
	* Each pass uses a dedicated regex to parse the value because the two
	* sources produce differently formatted strings. The parsed parts are
	* mapped to individual setters on a `dd_date` instance.
	*
	* Timezone components (matches 8 and 9 from the fallback regex) are currently
	* commented out and not applied to the `dd_date` object.
	*
	* Returns null when both `identify` calls return empty output.
	*/
	public static function get_date_time_original( string $file ) : ?dd_date {

		$command			= ImageMagick::get_imagemagick_identify_path() . ' -quiet -format "%[EXIF:DateTimeOriginal]" ' . escapeshellarg($file);
		$DateTimeOriginal	= shell_exec($command);
		$regex				= "/^(-?[0-9]+)[-:\/.]?([0-9]+)?[-:\/.]?([0-9]+)? ?([0-9]+)?:?([0-9]+)?:?([0-9]+)?$/";

		if(empty($DateTimeOriginal)){
			$command			= ImageMagick::get_imagemagick_identify_path() . ' -quiet -format "%[date:modify]" ' . escapeshellarg($file);
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
	*
	* Reads width, height, and orientation from layer 0 of the image (`[0]`
	* suffix) so that multi-layer files return the geometry of the composite.
	*
	* EXIF orientation values 5–8 (`LeftTop`, `RightTop`, `RightBottom`,
	* `LeftBottom`) indicate the camera was rotated 90° or 270° when the
	* picture was taken. For these orientations the width and height values
	* stored in the file header are swapped to reflect the *display* dimensions.
	* Currently only `RightTop` (270°) and `LeftBottom` (90°) are swapped;
	* the remaining rotated orientations (`LeftTop`, `RightBottom`) fall through
	* to the default branch and are not swapped.
	*
	* (!) Three separate `shell_exec` calls are made to `identify` (orientation,
	*     width, height). This is intentional for simplicity; callers that need
	*     to minimise process spawns should use `get_media_attributes()` instead.
	*/
	public static function get_dimensions( string $file_path ) : object {

		$image_dimensions = new stdClass();

		$command_orientation	= ImageMagick::get_imagemagick_identify_path() . ' -quiet -format "%[orientation]" ' . escapeshellarg($file_path) .'[0]';
		$orientation			= shell_exec($command_orientation);

		$command_w	= ImageMagick::get_imagemagick_identify_path() . ' -quiet -format %w ' . escapeshellarg($file_path) .'[0]';
		$width		= shell_exec($command_w);

		$command_h	= ImageMagick::get_imagemagick_identify_path() . ' -quiet -format %h ' . escapeshellarg($file_path) .'[0]';
		$height		= shell_exec($command_h);

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
					$tmp_width = $width;
					$width 	   = $height;
					$height    = $tmp_width;
					break;
				case 'TopLeft':	// rotate 0
				case 'BottomRight': // rotate 180
				default:
					break;
			}

		// image_dimensions set value
			$image_dimensions->width	= (int)$width;
			$image_dimensions->height	= (int)$height;


		return $image_dimensions;
	}//end get_image_dimensions



}//end ImageMagick class
