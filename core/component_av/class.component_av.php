<?php declare(strict_types=1);
/**
* CLASS COMPONENT_AV
* Audio/video media component for Dédalo, managing the full lifecycle of AV files.
*
* Responsible for:
* - Resolving AV-specific quality levels (original, delivery sizes such as '1080'/'720'/
*   '576'/'404'/'240', audio-only, and thumb) backed by DEDALO_AV_AR_QUALITY.
* - Building filesystem paths and public URLs for AV files, posterframes, and subtitles.
* - Orchestrating FFmpeg-based transcoding via Ffmpeg::build_av_alternate_command() and
*   Ffmpeg::create_posterframe(). Transcoding can run synchronously (shell_exec) or as a
*   background process via exec_::exec_sh_file() when $async===true.
* - Handling uploaded files through the upload pipeline:
*     dd_utils_api::upload → tool_upload::process_uploaded_file
*     → component_media_common::add_file → component_av::process_uploaded_file
* - Persisting original filename and computed duration to companion ontology components
*   identified by $properties->target_filename and $properties->target_duration.
* - Moving superseded files to a sibling 'deleted/' directory (never truly deleting);
*   restoring from 'deleted/' on time-machine recovery.
* - Generating and serving WebVTT/SRT subtitle files from DEDALO_SUBTITLES_FOLDER.
* - Expanding DVD-in-ZIP bundles into the expected VIDEO_TS/AUDIO_TS directory layout.
*
* Quality constants (defined in config/sample.config.php):
* - DEDALO_AV_QUALITY_ORIGINAL ('original') — lossless source, never transcoded
* - DEDALO_AV_QUALITY_DEFAULT  ('404')       — standard delivery quality
* - DEDALO_AV_AR_QUALITY       (['original','1080','720','576','404','240','audio'])
*
* Extends component_media_common (which extends component_common) and implements
* component_media_interface, the contract shared by component_3d, component_image,
* component_pdf, and component_svg.
*
* Data shape (stored in the matrix 'media' column):
* [{
*   "files_info": [{
*     "quality"          : "original",
*     "file_name"        : "rsc35_rsc167_1.mov",
*     "file_path"        : "/…/media/av/original/…/rsc35_rsc167_1.mov",
*     "file_url"         : "/media/av/original/…/rsc35_rsc167_1.mov",
*     "file_size"        : 25165824,
*     "file_time"        : 1680000000,
*     "upload_file_name" : "interview.mov",
*     "upload_date"      : "2023-04-01T12:00:00",
*     "upload_user"      : 42
*   }],
*   "original_file_name"      : "interview.mov",
*   "original_normalized_name": "rsc35_rsc167_1.mov",
*   "original_upload_date"    : "…"
* }]
*
* @package Dédalo
* @subpackage Core
*/
class component_av extends component_media_common implements component_media_interface {



	/**
	* CLASS VARS
	* All per-instance media properties (quality, folder, id, extension, additional_path, etc.)
	* are inherited from component_media_common and set during construction.
	* component_av declares no additional instance variables of its own.
	*/



	/**
	* GET_AR_QUALITY
	* Returns the full ordered list of recognised AV quality names from config.
	*
	* The array is defined in config as DEDALO_AV_AR_QUALITY and typically
	* contains ['original','1080','720','576','404','240','audio']. Callers
	* such as delete_file() use this list to validate the quality parameter
	* before performing any destructive filesystem operation.
	*
	* @return array $ar_quality - ordered list of valid quality identifiers
	*/
	public function get_ar_quality() : array {

		$ar_quality = DEDALO_AV_AR_QUALITY;

		return $ar_quality;
	}//end get_ar_quality



	/**
	* GET_DEFAULT_QUALITY
	* Returns the standard delivery quality identifier for AV files.
	*
	* Maps to DEDALO_AV_QUALITY_DEFAULT, typically '404' (a pixel-height shorthand
	* for the 404-pixel-tall delivery resolution). This is the quality served to
	* end-users in the absence of a higher-bandwidth selection, and is the quality
	* used by get_export_value() when building URLs for 'edit' mode exports.
	*
	* @return string $default_quality - e.g. '404'
	*/
	public function get_default_quality() : string {

		$default_quality = DEDALO_AV_QUALITY_DEFAULT;

		return $default_quality;
	}//end get_default_quality



	/**
	* GET_ORIGINAL_QUALITY
	* Returns the quality identifier reserved for the lossless source file.
	*
	* Maps to DEDALO_AV_QUALITY_ORIGINAL, typically the string 'original'.
	* Files stored under this quality are never transcoded by Dédalo; they
	* represent the file exactly as uploaded. build_version() uses this value
	* as the preferred transcoding source and create_posterframe() falls back
	* to it when no other source file can be found.
	*
	* @return string $original_quality - e.g. 'original'
	*/
	public function get_original_quality() : string {

		$original_quality = DEDALO_AV_QUALITY_ORIGINAL;

		return $original_quality;
	}//end get_original_quality



	/**
	* GET_AUDIO_QUALITY
	* Returns the quality identifier for the audio-only derivative of an AV file.
	*
	* The audio quality track is automatically generated from the original whenever
	* a file is uploaded at 'original' quality (see process_uploaded_file()).
	* The identifier is the hard-coded string 'audio' rather than a config constant;
	* no video stream is included in this derivative.
	*
	* @return string $audio_quality - always 'audio'
	*/
	public function get_audio_quality() : string {

		$audio_quality = 'audio';

		return $audio_quality;
	}//end get_audio_quality



	/**
	* GET_EXTENSION
	* Returns the canonical container format extension for delivery-quality AV files.
	*
	* Prefers an instance-level override ($this->extension) set during upload processing,
	* falling back to the global DEDALO_AV_EXTENSION constant (typically 'mp4').
	* This extension is used when constructing file paths for non-original quality
	* variants; the original file retains its uploaded extension.
	*
	* @return string - file extension without dot, e.g. 'mp4'
	*/
	public function get_extension() : string {

		return $this->extension ?? DEDALO_AV_EXTENSION;
	}//end get_extension



	/**
	* GET_ALLOWED_EXTENSIONS
	* Returns the list of upload-accepted file extensions for AV components.
	*
	* Sourced from DEDALO_AV_EXTENSIONS_SUPPORTED (sample value:
	* ['mp4','wave','wav','aiff','aif','mp3','mov','avi','mpg','mpeg','vob','zip','flv']).
	* The 'zip' entry supports DVD bundles uploaded as compressed archives; see
	* move_zip_file() for the extraction logic.
	* Validation against this list is performed by component_media_common::valid_file_extension().
	*
	* @return array $allowed_extensions - lower-case extension strings without dots
	*/
	public function get_allowed_extensions() : array {

		$allowed_extensions = DEDALO_AV_EXTENSIONS_SUPPORTED;

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* GET_FOLDER
	* Returns the root media sub-directory name for AV files.
	*
	* Prefers $this->folder (overridable per-instance) then falls back to the
	* DEDALO_AV_FOLDER constant (e.g. '/av'). This value is concatenated with
	* DEDALO_MEDIA_PATH / DEDALO_MEDIA_URL to form the base storage location
	* for all quality variants of AV files.
	*
	* @return string - folder path segment, e.g. '/av'
	*/
	public function get_folder() : string {

		return $this->folder ?? DEDALO_AV_FOLDER;
	}//end get_folder



	/**
	* GET_BEST_EXTENSIONS
	* Returns the priority-ordered list of preferred source extensions for transcoding.
	*
	* When multiple original-quality files exist (e.g. both 'mov' and 'mp4'), the
	* parent class uses this list to pick the best source before delegating to FFmpeg.
	* The first entry in the array is the most preferred; others are considered in order.
	*
	* If DEDALO_AV_BEST_EXTENSIONS is not defined in the project config, a safe fallback
	* of ['mov'] is registered here to avoid a fatal error. Installations wanting a
	* different preference order should define DEDALO_AV_BEST_EXTENSIONS in their config
	* before this method is called.
	*
	* @return array - extension strings without dots, e.g. ['mov']
	*/
	public function get_best_extensions() : array {

		if(!defined('DEDALO_AV_BEST_EXTENSIONS')){
			define('DEDALO_AV_BEST_EXTENSIONS', ['mov']);
		}

		return DEDALO_AV_BEST_EXTENSIONS;
	}//end get_best_extensions




	/**
	* GET_EXPORT_VALUE
	* Atoms-based export implementation (see component_common::get_export_value contract).
	*
	* Produces a single export_value atom carrying an AV-related URL. The URL choice
	* differs by rendering context:
	* - 'edit' mode   → URL of the default-quality AV file (playable in the editor).
	*                   Absoluteness is controlled by $context->absolute_urls rather than
	*                   a legacy $this->caller==='tool_export' switch.
	* - other modes   → URL of the JPEG posterframe image (used in list/view contexts
	*                   where a still image is more appropriate than a video URL).
	*
	* The atom's cell_type is 'img' so that flat-table exporters (tool_export, diffusion)
	* render the URL as an image reference rather than plain text.
	*
	* When no data is set on the component the URL is returned as an empty string rather
	* than null, to keep the atom shape consistent for downstream serialisers.
	*
	* @param export_context|null $context = null - export settings; a default context is
	*   created when null is passed
	* @return export_value - single-atom export result
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// own segment
			$segment	= $this->build_export_path_segment($context);
			$path		= [...$context->path_prefix, $segment];

		// current_url. get from data
			$data = $this->get_data();
			if (isset($data)) {
				$current_url = ($this->mode==='edit')
					? $this->get_url(
						$this->get_default_quality(), // string quality
						false, // bool test_file
						$context->absolute_urls, // bool absolute
						false // bool default_add
					  )
					: $this->get_posterframe_url();
			}else{
				$current_url = '';
			}

		return export_value::from_scalar(
			$path,
			$current_url,
			(object)['cell_type' => 'img'],
			$this->get_label(),
			get_called_class()
		);
	}//end get_export_value



	/**
	* GET_POSTERFRAME_FILE_NAME
	* Returns the filename (without directory) of this component's posterframe image.
	*
	* The name is derived from the component's unique ID ($this->get_id()) combined with
	* the configured posterframe extension (DEDALO_AV_POSTERFRAME_EXTENSION, typically 'jpg').
	* Example result: 'rsc35_rsc167_1.jpg'
	*
	* Both get_posterframe_filepath() and get_posterframe_url() delegate to this method
	* to ensure the naming is consistent across path and URL resolution.
	*
	* @return string $posterframe_file_name - base filename, e.g. 'rsc35_rsc167_1.jpg'
	*/
	public function get_posterframe_file_name() : string {

		$posterframe_file_name = $this->get_id() .'.'. DEDALO_AV_POSTERFRAME_EXTENSION;

		return $posterframe_file_name;
	}//end get_posterframe_file_name



	/**
	* GET_POSTERFRAME_FILEPATH
	* Returns the absolute filesystem path to this component's posterframe image file.
	*
	* Path structure:
	*   DEDALO_MEDIA_PATH + folder + '/posterframe' + additional_path + '/' + file_name
	* Example: /var/www/media/av/posterframe/404/rsc35_rsc167_1.jpg
	*
	* The 'posterframe' sub-directory sits at the same level as quality variant folders
	* (e.g. 'original', '404') within the AV media directory. $additional_path provides
	* a configurable bucket segment (e.g. '/404') used to shard files across sub-dirs.
	*
	* @return string $posterframe_filepath - absolute path; file may or may not exist yet
	*/
	public function get_posterframe_filepath() : string {

		$file_name			= $this->get_posterframe_file_name();
		$folder				= $this->get_folder(); // like DEDALO_AV_FOLDER
		$additional_path	= $this->additional_path;

		$posterframe_filepath = DEDALO_MEDIA_PATH . $folder .'/posterframe'. $additional_path .'/'. $file_name;


		return $posterframe_filepath;
	}//end get_posterframe_filepath



	/**
	* GET_POSTERFRAME_URL
	* Returns the public URL for this component's posterframe JPEG image.
	*
	* Behaviour flags (all default to false / non-caching / relative):
	* - $test_file    : When true, the method checks whether the posterframe file
	*                   actually exists on disk. If it does not, the URL falls back to
	*                   the Dédalo logo placeholder (DEDALO_CORE_URL/themes/default/0.jpg).
	* - $absolute     : When true, prepends DEDALO_PROTOCOL + DEDALO_HOST to produce
	*                   an absolute URL (required for email or external embedding).
	* - $avoid_cache  : When true, appends '?t=<unix_timestamp>' to bust browser/proxy
	*                   caches after a posterframe has been regenerated.
	*
	* The $test_file check performs a synchronous file_exists() call; avoid enabling it
	* in tight loops or list-rendering contexts to prevent excessive I/O.
	*
	* @param bool $test_file = false  - check filesystem before returning URL
	* @param bool $absolute = false   - prepend protocol + host
	* @param bool $avoid_cache = false - append cache-busting timestamp query string
	* @return string $posterframe_url - relative or absolute URL (never null)
	*/
	public function get_posterframe_url(bool $test_file=false, bool $absolute=false, bool $avoid_cache=false) : string {

		$folder				= $this->get_folder(); // like DEDALO_AV_FOLDER
		$file_name			= $this->get_posterframe_file_name();
		$additional_path	= $this->additional_path;

		$posterframe_url = DEDALO_MEDIA_URL . $folder .'/posterframe'. $additional_path .'/'. $file_name;

		// FILE EXISTS TEST : If not, show '0' dedalo image logo
		if ($test_file===true) {
			// $file = DEDALO_MEDIA_PATH . $folder .'/posterframe'. $additional_path .'/'. $file_name;
			$file = $this->get_posterframe_filepath();
			if(!file_exists($file)) {
				$posterframe_url = DEDALO_CORE_URL . '/themes/default/0.jpg';
			}
		}

		// ABSOLUTE (Default false)
		if ($absolute===true) {
			$posterframe_url = DEDALO_PROTOCOL . DEDALO_HOST . $posterframe_url;
		}

		if ($avoid_cache===true) {
			$posterframe_url .= '?t=' .time();
		}

		return $posterframe_url;
	}//end get_posterframe_url



	/**
	* DELETE_THUMB
	* Removes the posterframe JPEG and delegates thumb file removal to the parent.
	*
	* The AV-specific posterframe (stored in the 'posterframe' sub-directory) is a
	* separate artifact from the generic 'thumb' quality file maintained by the parent
	* class. This override ensures both are cleaned up when the thumb is deleted:
	* 1. Unlinks the posterframe file identified by get_posterframe_filepath().
	* 2. Calls parent::delete_thumb() to remove the thumb quality file and trigger
	*    the parent's save() call that updates files_info metadata.
	*
	* Returns false immediately if the posterframe unlink fails; the parent's thumb
	* deletion is skipped in that case.
	*
	* @return bool - true on full success, false if any unlink operation fails
	*/
	public function delete_thumb() {

		$posterframe_filepath = $this->get_posterframe_filepath();
		if (file_exists($posterframe_filepath)) {
			// unlink file
			if ( !unlink($posterframe_filepath) ) {
				debug_log(__METHOD__
					. " Error deleting posterframe file. Unable to unlink file " . PHP_EOL
					. 'posterframe_filepath: ' . to_string($posterframe_filepath)
					, logger::ERROR
				);
				return false;
			}
		}

		return parent::delete_thumb();
	}//end delete_thumb



	/**
	* CREATE_POSTERFRAME
	* Extracts a single JPEG frame from the AV file at the specified playback position.
	*
	* Called from the client when the user scrubs the video player to a desired timecode
	* and clicks "set as posterframe". The resulting JPEG replaces any previously stored
	* posterframe and a new thumb is generated from it immediately afterwards.
	*
	* Source file resolution:
	* 1. Attempts to use $target_quality (defaults to 'original' when null).
	* 2. If the file for that quality does not exist and it is not already the default
	*    quality, falls back to get_default_quality() (e.g. '404').
	* 3. If neither file exists, logs an error and returns false.
	*
	* After successful FFmpeg extraction, create_thumb() is called to regenerate the
	* thumbnail from the new posterframe so both artifacts stay in sync.
	*
	* @param string|float $current_time - playback position in seconds (from HTML5
	*   video.currentTime); also accepts a timecode string such as '00:00:10'
	* @param string|null $target_quality = null - quality variant to extract the frame
	*   from; defaults to 'original' when null
	* @return bool - true when FFmpeg succeeded, false on any error
	*/
	public function create_posterframe( string|float $current_time, ?string $target_quality=null ) : bool {

		// short vars
			$quality				= $target_quality ?? $this->get_original_quality();
			$src_file				= $this->get_media_filepath($quality);
			$posterframe_filepath	= $this->get_posterframe_filepath();

		// check source file
			if (!file_exists($src_file)) {

				if ($quality!==$this->get_default_quality()) {
					// try with quality_default
					$quality	= $this->get_default_quality();
					$src_file	= $this->get_media_filepath($quality);
				}

				if (!file_exists($src_file)) {
					debug_log(__METHOD__
						. " Invalid source path. Unable to create posterframe " . PHP_EOL
						. ' src_file: ' 		. to_string($src_file) . PHP_EOL
						. ' target_quality: ' 	. to_string($target_quality)
						, logger::ERROR
					);
					return false;
				}
			}

		// FFMPEG create_posterframe
		$command_response = Ffmpeg::create_posterframe((object)[
			'timecode'				=> $current_time, // like '00:00:10',
			'src_file'				=> $src_file,
			'quality'				=> $quality,
			'posterframe_filepath'	=> $posterframe_filepath
		]);

		// re-create the thumb image
		if ($command_response===true) {
			$this->create_thumb();
		}


		return $command_response;
	}//end create_posterframe



	/**
	* DELETE_POSTERFRAME
	* Permanently removes the posterframe JPEG from the filesystem.
	*
	* Unlike remove_component_media_files() / delete_file() — which move files to a
	* 'deleted/' sub-directory for potential recovery — this method calls unlink()
	* directly and the file cannot be restored. Intended only for cases where the
	* entire media set is being cleaned up or a fresh posterframe will be regenerated.
	*
	* Returns false (with a logger::DEBUG entry) when the file does not exist; this is
	* treated as a non-error because the outcome (no posterframe on disk) is already
	* achieved. Returns false (with logger::ERROR) when unlink() fails due to permissions.
	*
	* @return bool - true when the file was successfully removed, false otherwise
	*/
	public function delete_posterframe() : bool {

		$file = $this->get_posterframe_filepath();

		// check file already exists
			if(!file_exists($file)) {
				debug_log(__METHOD__
					." Ignored delete posterframe. File do not exists: ".to_string($file)
					, logger::DEBUG
				);
				return false;
			}

		 // delete file
			if(!unlink($file)) {
				debug_log(__METHOD__
					."  Error on delete posterframe file. Posterframe file is not deleted " . PHP_EOL
					. ' file: ' . $file
					, logger::ERROR
				);
				return false;
			}


		return true;
	}//end delete_posterframe



	/**
	* CREATE_THUMB
	* Generates a small thumbnail JPEG from the component's posterframe image.
	*
	* Thumbnails for AV components are always derived from the posterframe rather
	* than directly from the video, because extracting a thumbnail-size frame via
	* FFmpeg on every request would be prohibitively slow. ImageMagick::dd_thumb()
	* is used for the actual resize/conversion.
	*
	* Execution flow:
	* 1. Ensures DEDALO_QUALITY_THUMB is defined; defines the fallback 'thumb' if missing.
	* 2. Resolves the target file path using get_media_filepath('thumb', <thumb_extension>).
	* 3. Checks whether the posterframe file exists on disk.
	*    - If not: tries create_posterframe(10.00) to auto-generate one at the 10-second
	*      mark. If that also fails (file still missing), returns false.
	* 4. Calls ImageMagick::dd_thumb($posterframe, $target_file) to produce the thumb.
	*
	* (!) The auto-posterframe is generated at 10 seconds — not 5 as the inline comment
	* above the call states. This may produce a black frame for very short clips.
	*
	* @return bool - true on success, false when source posterframe is unavailable
	*/
	public function create_thumb() : bool {

		// check config constant definition
			if (!defined('DEDALO_QUALITY_THUMB')) {
				define('DEDALO_QUALITY_THUMB', 'thumb');
				debug_log(__METHOD__
					." Undefined config 'DEDALO_QUALITY_THUMB'. Using fallback 'thumb' value"
					, logger::WARNING
				);
			}

		// thumb_path
			$thumb_quality		= $this->get_thumb_quality();
			$thumb_extension	= $this->get_thumb_extension();
			$target_file		= $this->get_media_filepath($thumb_quality, $thumb_extension);

		// thumb not exists case: generate from posterframe
			$posterframe = $this->get_posterframe_filepath();
			if (!file_exists($posterframe)) {

				// try to create an automatic posterframe at 5 second
				$this->create_posterframe(10.00);

				if (!file_exists($posterframe)) {
					debug_log(__METHOD__
						." posterframe file doesn't exists, it is not possible to create a thumb"
						, logger::WARNING
					);
					return false;
				}
			}

		// thumb generate
			ImageMagick::dd_thumb(
				$posterframe, // source file
				$target_file, // thumb file
			);


		return true;
	}//end create_thumb



	/**
	* GET_SUBTITLES_PATH
	* Returns the absolute filesystem path to the WebVTT subtitle file for a given language.
	*
	* Path structure:
	*   DEDALO_MEDIA_PATH + folder + DEDALO_SUBTITLES_FOLDER + '/' + id + '_' + lang + '.' + ext
	* Example: /var/www/media/av/subtitles/rsc35_rsc167_1_es.vtt
	*
	* DEDALO_SUBTITLES_FOLDER is typically '/subtitles' and
	* DEDALO_AV_SUBTITLES_EXTENSION is typically 'vtt'.
	* The $lang parameter should be a Dédalo language code (e.g. 'es', 'en', 'fr').
	*
	* @param string $lang = DEDALO_DATA_LANG - language code for which to resolve the path
	* @return string $subtitles_path - absolute path; file may or may not exist
	*/
	public function get_subtitles_path( string $lang=DEDALO_DATA_LANG ) : string  {

		$folder = $this->get_folder(); // like DEDALO_AV_FOLDER

		$subtitles_path = DEDALO_MEDIA_PATH . $folder . DEDALO_SUBTITLES_FOLDER.'/'. $this->get_id().'_'.$lang.'.'.DEDALO_AV_SUBTITLES_EXTENSION;

		return $subtitles_path;
	}//end get_subtitles_path



	/**
	* GET_SUBTITLES_URL
	* Returns the public URL for the WebVTT subtitle file for a given language.
	*
	* Mirrors get_subtitles_path() but uses DEDALO_MEDIA_URL as the root instead of
	* DEDALO_MEDIA_PATH. The URL is always relative (protocol-relative) and does not
	* go through get_posterframe_url()'s $absolute flag; callers that need an absolute
	* URL must prepend DEDALO_PROTOCOL + DEDALO_HOST themselves.
	*
	* Used by the client-side AV player to attach a <track> element for subtitles.
	*
	* @param string $lang = DEDALO_DATA_LANG - language code (e.g. 'es', 'en')
	* @return string $subtitles_url - relative URL to the .vtt file
	*/
	public function get_subtitles_url( string $lang=DEDALO_DATA_LANG ) : string {

		$folder = $this->get_folder(); // like DEDALO_AV_FOLDER

		$subtitles_url = DEDALO_MEDIA_URL . $folder . DEDALO_SUBTITLES_FOLDER. '/'. $this->get_id().'_'.$lang .'.'.DEDALO_AV_SUBTITLES_EXTENSION;

		return $subtitles_url;
	}//end get_subtitles_url



	/**
	* GET_VIDEO_SIZE
	* Returns a human-readable file-size string for the specified AV quality variant.
	*
	* Supports two storage layouts:
	* - Regular file  : uses filesize() on the file path. The result is expressed as
	*                   rounded KB (when ≤ 1024 bytes) or rounded MB otherwise.
	*                   Example: '35 MB'
	* - DVD directory : when the path is a directory containing a VIDEO_TS sub-dir,
	*                   accumulates the sizes of all VOB files larger than 512 KB
	*                   (skipping the small 'end-of-disc' VOB stubs).
	*
	* Parameter resolution order:
	* - If $filename is provided it is used directly (no quality look-up).
	* - If only $quality is provided, the filepath is derived via get_media_filepath().
	* - If neither is provided, the component's current quality is used.
	*
	* Returns null when the file/directory does not exist or when filesize() fails
	* (e.g. for remote streams). The filesize() call is intentionally suppressed with
	* '@' to avoid PHP warnings on non-seekable streams.
	*
	* (!) The size threshold comparison uses bytes (size <= 1024) to decide between KB
	* and MB labels, but the MB calculation divides by 1024 — producing round megabytes,
	* not mebibytes. For a file exactly 1025 bytes the result is '1 MB'.
	*
	* @param string|null $quality = null  - quality identifier; uses current quality if null
	* @param string|null $filename = null - explicit file path override
	* @return string|null - size string such as '35 MB' or '512 KB', or null on failure
	*/
	public function get_video_size( ?string $quality=null, ?string $filename=null ) : ?string {

		// empty filename case
			if (empty($filename)) {
				if(empty($quality)) {
					$quality = $this->get_quality();
				}
				$filename = $this->get_media_filepath($quality);
			}

		// file do not exists case
			if ( !file_exists( $filename )) {
				return null ;
			}

		$size = 0;
		if( is_dir($filename) ) {

			// minimum size of the initial VOB (512KB)
			$vob_filesize = 512*1000;

			if( is_dir($filename.'/VIDEO_TS') ) {

				$handle = opendir($filename.'/VIDEO_TS');
					 while (false !== ($file = readdir($handle))) {
						$extension = pathinfo($file,PATHINFO_EXTENSION);
						if($extension==='VOB' && filesize($filename.'/VIDEO_TS/'.$file) > $vob_filesize) {
							// reset the size of the VOB (for the end files of the video)
							$vob_filesize = 0;
							$size += filesize($filename.'/VIDEO_TS/'.$file);
						}
					 }
				}
		}else{
			try {
				$size		= @filesize($filename) ;
				if(!$size)	throw new Exception('Unknown size!') ;
			} catch (Exception $e) {
				#echo '',  $e->getMessage(), "\n";
				#trigger_error( __METHOD__ . " " . $e->getMessage() , E_USER_NOTICE) ;
				return null;
			}
		}

		// size in unit
			$size_unit = $size <= 1024
				? round($size) . ' KB'
				: round($size / 1024) . ' MB';


		return $size_unit;
	}//end get_video_size



	/**
	* GET_DURATION
	* Returns the total duration of the AV file in seconds by reading its container metadata.
	*
	* Delegates to get_media_attributes() → Ffmpeg::get_media_attributes() which runs
	* ffprobe on the file. The duration is extracted from the ffprobe JSON output at
	* $media_attributes->format->duration (a string such as '172.339000').
	*
	* (!) This method physically reads the file via ffprobe and takes approximately
	* 200 ms per call. Do not invoke it in list-rendering loops. Results should be
	* cached when needed repeatedly — for example, process_uploaded_file() calls it
	* once and immediately persists the result to the target_duration component.
	*
	* Returns 0.0 when the file does not exist, ffprobe fails, or the duration field
	* is missing from the metadata. The return value is always cast to float.
	*
	* @param string|null $quality - quality variant to measure; uses current quality if null
	* @return float $duration - duration in seconds (0.0 when unavailable)
	*/
	public function get_duration( ?string $quality=null ) : float {

		$duration = 0;

		// current quality
			$quality = $quality ?? $this->get_quality();

		// read file
			$path				= $this->get_media_filepath($quality);
			$media_attributes	= $this->get_media_attributes($path);
			// expected result sample:
				// {
				// 	"format": {
				// 		"filename": "/../dedalo/media/av/404/rsc35_rsc167_1.mp4",
				// 		"nb_streams": 3,
				// 		"nb_programs": 0,
				// 		"format_name": "mov,mp4,m4a,3gp,3g2,mj2",
				// 		"format_long_name": "QuickTime / MOV",
				// 		"start_time": "0.000000",
				// 		"duration": "172.339000",
				// 		"size": "22126087",
				// 		"bit_rate": "1027095",
				// 		"probe_score": 100,
				// 		"tags": {
				// 			"major_brand": "isom",
				// 			"minor_version": "512",
				// 			"compatible_brands": "isomiso2avc1mp41",
				// 			"encoder": "Lavf59.16.100"
				// 		}
				// 	}
				// }
			if (isset($media_attributes->format->duration) && !empty($media_attributes->format->duration)) {

				$duration = $media_attributes->format->duration;
			}


		return (float)$duration;
	}//end get_duration



	/**
	* REMOVE_COMPONENT_MEDIA_FILES
	* Moves all AV quality files and (optionally) the posterframe to a 'deleted/' folder.
	*
	* "Remove" is a soft-delete: files are renamed and moved rather than unlinked, allowing
	* time-machine recovery via restore_component_media_files(). Called by section-level
	* deletion logic (section::remove_section_media_files) when a record is removed.
	*
	* Execution flow:
	* 1. Resolves $ar_quality to the full quality list when the parameter is empty.
	* 2. Delegates AV quality file removal to parent::remove_component_media_files().
	* 3. When $remove_posterframe===true, also moves the posterframe JPEG:
	*    a. Ensures the 'posterframe/<additional_path>/deleted/' directory exists
	*       (creates it with mkdir 0775 recursive if needed).
	*    b. Renames the posterframe to '<id>_deleted_<Y-m-d_Hi>.<ext>' inside that directory.
	*    The date-stamped naming allows multiple deletion events to coexist and natsort()
	*    to identify the most recent on restore.
	*
	* Returns false on the first failure encountered (mkdir error, rename error). Returns
	* the parent's boolean result when only AV files are processed without a posterframe.
	*
	* @see component_av::restore_component_media_files()
	* @see section::remove_section_media_files()
	* @param array $ar_quality = []            - quality variants to remove; empty = all
	* @param string|null $extension = null     - limit removal to one extension; null = all
	* @param bool $remove_posterframe = true   - whether to also move the posterframe file
	* @return bool - true when all requested files were moved successfully
	*/
	public function remove_component_media_files( array $ar_quality=[], ?string $extension=null, bool $remove_posterframe=true ) : bool {

		// ar_quality
			if (empty($ar_quality)) {
				$ar_quality = $this->get_ar_quality();
			}

		// files remove
			$result = parent::remove_component_media_files($ar_quality);

		// posterframe remove (default is true)
			if ($remove_posterframe===true) {

				$media_path = $this->get_posterframe_filepath();
				if (file_exists($media_path)) {

					$folder				= $this->get_folder(); // like DEDALO_AV_FOLDER
					$additional_path	= $this->additional_path;

					// delete dir
						$folder_path_del = DEDALO_MEDIA_PATH . $folder . '/posterframe' . $additional_path . '/deleted';
						if( !is_dir($folder_path_del) ) {
							$create_dir = mkdir($folder_path_del, 0775, true);
							if(!$create_dir) {
								debug_log(__METHOD__
									." Error on read or create directory \"deleted\". Permission denied ".to_string($folder_path_del)
									, logger::ERROR
								);
								return false;
							}
						}

					// date now
						$date = date("Y-m-d_Hi");

					// move/rename file
						$id					= $this->get_id();
						$media_path_moved	= $folder_path_del . "/$id" . '_deleted_' . $date . '.' . DEDALO_AV_POSTERFRAME_EXTENSION;
						if( !rename($media_path, $media_path_moved) ) {
							debug_log(__METHOD__
								. " Error on move files (posterframe) to folder \"deleted\" . Permission denied . The files are not deleted " . PHP_EOL
								. ' source (media_path): '. $media_path . PHP_EOL
								. ' target (media_path_moved): '. $media_path_moved
								, logger::ERROR
							);
							return false;
						}

					debug_log(__METHOD__
						." Moved file \n$media_path to \n$media_path_moved "
						, logger::DEBUG
					);
				}
			}//end if ($remove_posterframe===true)


		return $result;
	}//end remove_component_media_files



	/**
	* RESTORE_COMPONENT_MEDIA_FILES
	* Restores the most recently soft-deleted AV files and posterframe from 'deleted/' backups.
	*
	* Counterpart to remove_component_media_files(). Called by the time-machine tool when
	* recovering a section to a previous state.
	*
	* Execution flow:
	* 1. Calls parent::restore_component_media_files() to restore quality-variant AV files.
	* 2. Resolves the 'posterframe/<additional_path>/deleted/' directory for this component.
	* 3. Globs for files matching '<id>_*.<DEDALO_AV_POSTERFRAME_EXTENSION>' in that directory.
	*    - If no files are found: logs a WARNING and continues (posterframe restore is
	*      non-fatal; the video itself may still be usable without a posterframe).
	*    - Otherwise: natsort() orders the glob results, end() picks the latest
	*      (alphabetically last = most recently date-stamped name), and rename() moves
	*      it back to the live posterframe path.
	*
	* Always returns true (even when posterframe restoration fails) because the primary
	* concern is restoring the video files. Callers should check the logger for warnings.
	*
	* @see tool_time_machine::recover_section_from_time_machine
	* @see component_av::remove_component_media_files()
	* @return bool - always true (failures are logged, not propagated)
	*/
	public function restore_component_media_files() : bool {

		// AV restore
			parent::restore_component_media_files();

		// posterframe restore
			$posterframe_filepath	= $this->get_posterframe_filepath();
			$media_path			= pathinfo($posterframe_filepath, PATHINFO_DIRNAME).'/deleted';
			$id					= $this->get_id();
			$file_pattern		= $media_path.'/'.$id.'_*.'.DEDALO_AV_POSTERFRAME_EXTENSION;
			$ar_files			= glob($file_pattern);
			if (empty($ar_files)) {

				debug_log(__METHOD__
					." No files to restore were found for posterframe:$id. Nothing was restored (3)"
					, logger::WARNING
				);

			}else{

				natsort($ar_files);	// sort the files from newest to oldest
				$last_file_path	= end($ar_files);
				$new_file_path	= $this->get_posterframe_filepath();
				if( !rename($last_file_path, $new_file_path) ) {
					// throw new Exception(" Error on move files to restore folder. Permission denied to restore posterframe. Nothing was restored (4)");
					debug_log(__METHOD__
						." Error on move files to restore folder. Permission denied to restore posterframe. Nothing was restored (4) " .PHP_EOL
						.' last_file_path: ' . to_string($last_file_path) . PHP_EOL
						.' new_file_path: ' . to_string($new_file_path)
						, logger::ERROR
					);
				}

				debug_log(__METHOD__
					." Moved file \n$last_file_path to \n$new_file_path "
					, logger::DEBUG
				);
			}


		return true;
	}//end restore_component_media_files



	/**
	* MOVE_ZIP_FILE
	* Expands a DVD-in-ZIP archive into the standard VIDEO_TS / AUDIO_TS directory layout.
	*
	* When a user uploads a DVD as a compressed ZIP bundle, this method extracts it into
	* the expected directory structure so that FFmpeg and the media player can process it
	* as a regular VOB-based DVD:
	*   <folder_path>/<file_name>/VIDEO_TS/  — extracted VIDEO_TS files
	*   <folder_path>/<file_name>/AUDIO_TS/  — extracted AUDIO_TS files
	*
	* The target directory tree is created by mkdir if it does not already exist.
	* Files are copied entry-by-entry using the 'zip://' stream wrapper rather than
	* a full extract, giving control over the destination path of each file.
	* The top-level VIDEO_TS and AUDIO_TS directory entries in the ZIP are skipped
	* (only their contents are copied) to avoid creating a duplicate nesting level.
	*
	* All three parameters are mandatory; the method returns an error response object
	* if any are empty.
	*
	* @param string $tmp_name   - absolute path to the uploaded temporary ZIP file
	* @param string $folder_path - target base directory (no trailing slash)
	* @param string $file_name  - name for the new DVD directory (without path)
	* @return object $response
	*   ->result bool   - true on success, false on any error
	*   ->msg   string  - human-readable outcome or error description
	*/
	public static function move_zip_file(string $tmp_name, string $folder_path, string $file_name) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// check vars
			if (empty($tmp_name) || empty($folder_path) || empty($file_name)) {
				$response->msg .= 'Too few arguments. All params are mandatory';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' tmp_name: ' . $tmp_name . PHP_EOL
					. ' folder_path: ' . $folder_path . PHP_EOL
					. ' file_name: ' . $file_name
					, logger::ERROR
				);
				return $response;
			}

		// zip
			$zip = new ZipArchive;
			$res = $zip->open($tmp_name);
			if ($res!==true) {
				$response->msg .= "Error on open zip file ! Code: ".to_string($res);
				return $response;
			}

		// Create the directories
			if( !is_dir($folder_path.'/'.$file_name) ) {
				$ar_folders = [
					$folder_path .'/'. $file_name,
					$folder_path .'/'. $file_name . '/VIDEO_TS/',
					$folder_path .'/'. $file_name . '/AUDIO_TS/'
				];
				foreach ($ar_folders as $current_folder) {
					if(!mkdir($current_folder, 0777)) {
						$response->msg .= "Error on read or create directory for \"$file_name\" folder. Permission denied ! ($current_folder)";
						return $response;
					}
				}
			}

		// See al .zip files for located the VIDEO_TS and AUDIO_TS folders
			for ($i=0; $i < $zip->numFiles; $i++) {

				$current_filename = $zip->getNameIndex($i);

				if(strpos($current_filename,'VIDEO_TS')!==false){

					$current_fileinfo = pathinfo($current_filename);
					# Don't copy the original VIDEO_TS in the zip file
					if ($current_fileinfo['basename']==='VIDEO_TS') {
						continue;
					}
					# Copy al files of the VIDEO_TS zip file into the VIDEO_TS destination file
					$src 	= $tmp_name.'#'.$current_filename;
					$target = $folder_path.'/'.$file_name.'/VIDEO_TS/'.$current_fileinfo['basename'];
					if(!copy('zip://'.$src, $target)) {
						$response->msg .= "Error on copy zip file: $src";
						return $response;
					}

				}else if(strpos($current_filename,'AUDIO_TS')!==false){
					$current_fileinfo = pathinfo($current_filename);
					# Don't copy the original AUDIO_TS in the zip file
					if ($current_fileinfo['basename'] === 'AUDIO_TS') {
						continue;
					}
					// Copy al files of the VIDEO_TS zip file into the AUDIO_TS destination file
					$src 	= $tmp_name.'#'.$current_filename;
					$target = $folder_path.'/'.$file_name.'/AUDIO_TS/'.$current_fileinfo['basename'];
					if(!copy('zip://'.$src, $target)) {
						$response->msg .= "Error on copy zip file: $src";
						return $response;
					}
				}
			}//end for ($i=0; $i < $zip->numFiles; $i++)

		$zip->close();

		// all is OK
		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__METHOD__.']';


		return $response;
	}//end move_zip_file



	/**
	* PROCESS_UPLOADED_FILE
	* Final step of the AV upload pipeline — normalises metadata and triggers transcoding.
	*
	* Upload sequence (this method is step 4):
	*   1. dd_utils_api::upload          — receives the multipart HTTP upload
	*   2. tool_upload::process_uploaded_file — moves temp file, sets component quality
	*   3. component_media_common::add_file  — registers the file in files_info
	*   4. component_av::process_uploaded_file (this method)
	*
	* Actions performed:
	* - Validates all required $file_data fields; returns an error response early if any
	*   are missing or the resolved file path does not exist on disk.
	* - Derives the file extension from the original filename for format-specific routing.
	* - When quality is 'original', automatically starts building an audio-only derivative
	*   via build_version('audio').
	* - If $properties->target_filename is configured on the ontology node, saves the
	*   original filename to the designated companion component (usually component_input_text).
	* - If $properties->target_duration is configured, computes the file duration via
	*   get_duration() → OptimizeTC::seg2tc() and saves the timecode to the companion
	*   component (typically mapped to 'rsc54').
	* - Stamps original_file_name, original_normalized_name, and original_upload_date onto
	*   the component data array (index 0) when quality is 'original'.
	* - Calls regenerate_component() which runs FFmpeg normalisation/transcoding and saves.
	*
	* All operations are wrapped in a try/catch; exceptions are logged and returned as
	* error responses rather than propagating.
	*
	* @param object|null $file_data - file metadata from the upload pipeline:
	*   {
	*     "original_file_name": "my_video.mp4",        // user-supplied filename
	*     "full_file_name":     "test81_test65_2.mp4",  // Dédalo normalised name
	*     "full_file_path":     "/…/av/original/test81_test65_2.mp4"
	*   }
	* @param object|null $process_options = null - reserved; currently unused
	* @return object $response
	*   ->result bool   - true on success, false on any error
	*   ->msg   string  - human-readable outcome or error description
	*/
	public function process_uploaded_file( ?object $file_data=null, ?object $process_options=null ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.'] ';

		// check vars
			if (empty($file_data) ||
				empty($file_data->original_file_name) ||
				empty($file_data->full_file_path) ||
				empty($file_data->full_file_name)
			) {
				debug_log(__METHOD__
					. " Not enough file_data variables " . PHP_EOL
					. ' file_data: ' . to_string($file_data)
					, logger::ERROR
				);
				$response->msg .= 'Not enough file_data variables';
				return $response;
			}

		// short vars
			$original_file_name			= $file_data->original_file_name;	// kike "my video785.mp4"
			$full_file_path				= $file_data->full_file_path;		// like "/mypath/media/av/404/test175_test65_1.mp4"
			$full_file_name				= $file_data->full_file_name;		// like "test175_test65_1.mp4"
			$original_normalized_name	= $full_file_name;

		// check full_file_path
			if (!file_exists($full_file_path)) {
				$response->msg .= ' File full_file_path do not exists';
				return $response;
			}

		// debug
			debug_log(__METHOD__
				. " process_uploaded_file " . PHP_EOL
				. ' original_file_name: ' . $original_file_name .PHP_EOL
				. ' full_file_path: ' . $full_file_path
				, logger::WARNING
			);

		try {

			// extension
				$file_ext = pathinfo($original_file_name, PATHINFO_EXTENSION);
				if (empty($file_ext)) {
					// throw new Exception("Error Processing Request. File extension is unknown", 1);
					$msg = ' Error Processing Request. File extension is unknown';
					debug_log(__METHOD__.$msg, logger::ERROR);
					$response->msg .= $msg;
					return $response;
				}

			// id (without extension, like 'test81_test65_2')
				$id = $this->get_id();
				if (empty($id)) {
					// throw new Exception("Error Processing Request. Invalid id: ".to_string($id), 1);
					$response->msg .= ' Error: id is empty. Unable to get component id ';
					debug_log(__METHOD__
						. $response->msg
						, logger::DEBUG
					);
					return $response;
				}

			// quality default in upload is 'original' (!)
				$quality = $this->get_quality();

			// audio files. Audio files always generate an audio file
				if ( $quality===$this->get_original_quality() ) {
					$this->build_version( $this->get_audio_quality() );
					// }//end if (!file_exists($target_file))
				}

			// properties
				$properties = $this->get_properties();

			// target_filename. Save original file name in a component_input_text
				if (isset($properties->target_filename)) {

					$model_name_target_filename	= ontology_node::get_model_by_tipo($properties->target_filename, true);
					$component_target_filename	= component_common::get_instance(
						$model_name_target_filename, // model
						$properties->target_filename, // tipo
						$this->get_section_id(), // section_id
						'edit', // mode
						DEDALO_DATA_NOLAN, // lang
						$this->get_section_tipo(), // section_tipo
						false
					);
					$data_to_set = new stdClass();
						$data_to_set->value = $original_file_name;
					$component_target_filename->set_data([$data_to_set]);
					$component_target_filename->save();
					debug_log(__METHOD__.
						' Saved original filename to '.$properties->target_filename.' : '.to_string($original_file_name)
						, logger::DEBUG
					);
				}

			// target_duration. Save duration (time-code) in a component_input_text, usually to 'rsc54'
				if (isset($properties->target_duration)) {

					$model_name_target_duration	= ontology_node::get_model_by_tipo($properties->target_duration, true);
					$component_target_duration	= component_common::get_instance(
						$model_name_target_duration, // model
						$properties->target_duration, // tipo
						$this->get_section_id(), // section_id
						'edit', // mode
						DEDALO_DATA_NOLAN, // lang
						$this->get_section_tipo(), // section_tipo
						false
					);
					$secs		= $this->get_duration($quality); // float secs
					$duration	= OptimizeTC::seg2tc($secs); // string TimeCode as '00:05:20:125'
					$data_to_set = new stdClass();
						$data_to_set->value = $duration;
					$component_target_duration->set_data([$data_to_set]);
					$component_target_duration->save();
					debug_log(__METHOD__.
						' Saved av duration to '.$properties->target_duration.' : '.to_string($duration).' - secs: '.to_string($secs)
						, logger::DEBUG
					);
				}

			// upload info
				$original_quality = $this->get_original_quality();
				if ($this->quality===$original_quality) {
					// update upload file info
					$data = $this->get_data();

					$key = 0;
					if (!isset($data[$key]) || !is_object($data[$key])) {
						$data[$key] = new stdClass();
					}
					$data[$key]->original_file_name			= $original_file_name;
					$data[$key]->original_normalized_name	= $original_normalized_name;
					$data[$key]->original_upload_date		= component_date::get_date_now();

					$this->set_data($data);
				}

			// Generate default_av_format : If uploaded file is not in Dedalo standard format (mpeg), it will converted,
			// and original file is conserved (like myfilename.mov and myfilename.avi)
			// regenerate component will create the default quality av calling build()
			// build() will check the normalized files of the original
			// then if the normalized files doesn't exist, will create it
			// then will create the Thumb and Posterframe format of the default
			// then save the data.
				$result = $this->regenerate_component();
				if ($result === false) {
					$response->msg .= ' Error processing the uploaded file';
					return $response;
				}

			// all is OK
				$response->result	= true;
				$response->msg		= 'OK. Request done ['.__METHOD__.'] ';

		} catch (Exception $e) {
			$msg = 'Exception[process_uploaded_file][ImageMagick]: ' .  $e->getMessage() . "\n";
			debug_log(__METHOD__
				." $msg "
				, logger::ERROR
			);
			$response->msg .= ' - '.$msg;
		}


		return $response;
	}//end process_uploaded_file



	/**
	* GET_MEDIA_STREAMS
	* Returns the stream information (video, audio, subtitle tracks) for an AV file.
	*
	* Wraps Ffmpeg::get_media_streams() which runs ffprobe on the resolved file path
	* and returns a parsed object of stream descriptors. Useful in the editor to show
	* codec, resolution, frame-rate, and channel information per track before deciding
	* which quality variant to use for a conversion.
	*
	* Returns null when ffprobe fails or the file does not exist.
	*
	* @param string $quality - quality variant to inspect (e.g. 'original', '404')
	* @return object|null $media_streams - ffprobe stream data object, or null on failure
	*/
	public function get_media_streams(string $quality) : ?object {

		// get the video file path
			$file_path = $this->get_media_filepath($quality);

		// get_media_streams from av file
			$media_streams = Ffmpeg::get_media_streams($file_path);


		return $media_streams;
	}//end get_media_streams



	/**
	* DELETE_FILE
	* Soft-deletes a single quality variant by delegating to remove_component_media_files().
	*
	* The file is moved to a 'deleted/' sub-directory rather than permanently unlinked,
	* preserving the ability to restore it via the time-machine tool. The posterframe is
	* intentionally NOT moved here ($remove_posterframe=false) because deleting one quality
	* variant should not destroy the shared posterframe used by all qualities.
	*
	* Validation: the $quality string is checked against get_ar_quality() before any
	* filesystem operation is attempted. Passing an unrecognised quality returns an error
	* response without touching any files.
	*
	* On success:
	* - Appends a 'DELETE FILE' entry to the activity logger.
	* - Calls $this->Save() to refresh files_info metadata so the client's version list
	*   reflects the removal immediately.
	*
	* @see component_av::remove_component_media_files()
	* @param string $quality         - quality variant to delete (must be in get_ar_quality())
	* @param string|null $extension = null - limit removal to one file extension; null removes
	*   all files for that quality
	* @return object $response
	*   ->result bool   - true on success, false on validation failure or filesystem error
	*   ->msg   string  - human-readable outcome
	*   ->errors array  - list of error code strings (empty on success)
	*/
	public function delete_file( string $quality, ?string $extension=null ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// check quality
			$ar_quality = $this->get_ar_quality();
			if (!in_array($quality, $ar_quality)) {
				$response->msg .= ' Invalid quality. Ignored action';
				$response->errors[] = 'invalid quality';
				return $response;
			}

		// remove_component_media_files returns bool value
		$result = $this->remove_component_media_files(
			[$quality], // array ar_quality
			$extension, // file extension
			false // bool remove_posterframe
		);
		if ($result===true) {

			// logger activity
				logger::$obj['activity']->log_message(
					'DELETE FILE',
					logger::INFO,
					$this->tipo,
					NULL,
					[
						'msg'		=> 'Deleted media file (file is renamed and moved to delete folder)',
						'tipo'		=> $this->tipo,
						'parent'	=> $this->section_id,
						'id'		=> $this->id,
						'quality'	=> $quality
					],
					logged_user_id() // int
				);

			// save To update valor_list
				$this->Save();

			$response->result	= true;
			$response->msg		= 'File deleted successfully. ' . $quality;
		}

		return $response;
	}//end delete_file



	/**
	* BUILD_VERSION
	* Transcodes the AV source into the specified quality variant using FFmpeg.
	*
	* Handles two execution modes:
	* - $async===false (default) : runs shell_exec() synchronously and waits for the
	*   FFmpeg process to finish before returning. Suitable for batch jobs and cases
	*   where the caller needs to know the conversion succeeded before continuing.
	*   Calls $this->save() immediately after completion.
	* - $async===true            : launches the pre-built shell script via
	*   exec_::exec_sh_file() as a detached background process and returns the PID.
	*   The $save call is intentionally skipped here — the client is expected to poll
	*   for the output file and then call 'force_save' from tool_media_versions.
	*
	* Special case — thumb quality:
	* When $quality matches get_thumb_quality() the method short-circuits to create_thumb()
	* (ImageMagick resize from posterframe) and returns immediately, because thumb
	* generation does not involve FFmpeg.
	*
	* Source file resolution:
	* 1. get_source_quality_to_build() determines the best available source quality.
	* 2. get_original_file_path() provides the primary source path.
	* 3. If the original file is missing, falls back to get_default_quality().
	* 4. If neither exists, returns an error response.
	*
	* Ffmpeg::get_setting_name() selects the FFmpeg preset for the source/target
	* combination. Ffmpeg::build_av_alternate_command() writes a .sh script that wraps
	* the full FFmpeg invocation, which is either exec'd inline or run in background.
	*
	* Activity is logged via logger::$obj['activity'] regardless of sync/async mode.
	*
	* (!) The $save parameter in the method signature is declared but not consumed in the
	* method body. Sync mode always saves; async mode never saves. The parameter has no
	* effect in either branch.
	*
	* @param string $quality  - target quality identifier (must be in get_ar_quality())
	* @param bool $async = false - false = wait for FFmpeg; true = background process
	* @param bool $save = true  - declared but currently unused (see note above)
	* @return object $response
	*   ->result bool            - true on success, false on any error
	*   ->msg    string          - human-readable outcome
	*   ->errors array           - list of error code strings (empty on success)
	*   ->command_response mixed - shell_exec() output in sync mode, null in async mode
	*/
	public function build_version(string $quality, bool $async=false, bool $save=true) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// thumb case
			if($quality===$this->get_thumb_quality()){

				$return = $this->create_thumb();

				if($return===false){
					$response->msg .= ' Is not possible create thumb';
					$response->errors[] = 'building thumb failed';
					return $response;
				}

				// update component data files info and save
					$this->save();

				$response->result	= true;
				$response->msg		= 'Thumb file built';
				return $response;
			}

		// short vars
			$id				= $this->get_id();
			$source_quality	= $this->get_source_quality_to_build( $quality );
			if (empty($source_quality)) {
				$response->msg .= ' Invalid source_quality';
				$response->errors[] = 'invalid source_quality';
				return $response;
			}

		// build_av_alternate_command. Creates the command and the sh file to run
			$source_file_path = $this->get_original_file_path();
			if (!file_exists($source_file_path)) {
				debug_log(__METHOD__
					. " original file do not exists. Falling back to default quality " . PHP_EOL
					. ' original_file_path: ' . $source_file_path
					, logger::ERROR
				);
				// fallback to default quality
				$source_quality		= $this->get_default_quality(); // overwrite
				$source_file_path	= $this->get_media_filepath($source_quality); // overwrite
			}
			if (!file_exists($source_file_path)) {
				$response->msg .= ' Invalid source_file_path';
				$response->errors[] = 'invalid source_file_path';
				debug_log(__METHOD__
					." ERROR: Source file do not exists! Ignored conversion to quality ($quality) ". PHP_EOL
					.' source_file_path: ' . $source_file_path
					, logger::ERROR
				);
				return $response;
			}
			$setting_name			= Ffmpeg::get_setting_name($source_file_path, $quality);
			$target_file_path		= $this->get_media_filepath( $quality );
			$av_alternate_response	= Ffmpeg::build_av_alternate_command((object)[
				'setting_name'		=> $setting_name,
				'source_file_path'	=> $source_file_path,
				'target_file_path'	=> $target_file_path
			]);
			// check false case
			if (isset($av_alternate_response->result) && $av_alternate_response->result===false) {
				debug_log(__METHOD__
					. " Error on Ffmpeg->build_av_alternate_command " . PHP_EOL
					. ' setting_name: ' .$setting_name
					. ' av_alternate_response: ' . to_string($av_alternate_response)
					, logger::ERROR
				);
				$response->msg .= ' ' . ($av_alternate_response->msg ?? 'Unknown error');
				$response->errors[] = 'building alternate failed';
				return $response;
			}

		// run sh_file
			if($async==false){

				// exec command and wait
				$command = $av_alternate_response->command;

				debug_log(__METHOD__
					. " Building av file. Wait to finish please " . PHP_EOL
					. ' command: ' . $command
					, logger::DEBUG
				);

				$command_response  = shell_exec( $command );

				// update component data files info and save
					$this->save();

			}else{

				// launch a background process
				$sh_file	= $av_alternate_response->sh_file;
				$PID		= exec_::exec_sh_file($sh_file);

				// $command		= 'nohup '. $av_alternate_response->command .' > /dev/null 2>&1 & echo $!';
				// $new_process	= new process($command);
				// $PID			= $new_process->getPid();

				debug_log(__METHOD__
					. " Building av file in background " . PHP_EOL
					. ' PID: ' . $PID
					, logger::DEBUG
				);

				// update component data files info and save
					// $this->Save(); // delayed (!)
					// (!) Do not update here because process continues in background and
					// a save action 'force_save' will be called from client from tool_media_versions
					// when the new file is available (background process finish)
			}

		// logger activity
			logger::$obj['activity']->log_message(
				'NEW VERSION',
				logger::INFO,
				$this->tipo,
				NULL,
				[
					'msg'				=> 'Built version. Generated av file',
					'tipo'				=> $this->tipo,
					'parent'			=> $this->section_id,
					'id'				=> $id,
					'quality'			=> $quality,
					'source_quality'	=> $source_quality,
					'target_quality'	=> $quality
				],
				logged_user_id() // int
			);

		// response
			$response->result	= true;
			$response->msg		= ($async===true)
				? 'Building av file in background'
				: 'File built';
			$response->command_response	= $command_response ?? null;


		return $response;
	}//end build_version



	/**
	* CONFORM_HEADERS
	* Rebuilds the container headers (moov atom) of a quality variant using FFmpeg faststart.
	*
	* Some video files (particularly those not produced by Dédalo's own pipeline) have the
	* MOOV atom placed at the end of the container rather than the beginning. This prevents
	* HTTP progressive playback because the browser cannot seek until the entire file is
	* downloaded. This method calls Ffmpeg::conform_header() to move the MOOV atom to the
	* front of the file (qt-faststart / ffmpeg -movflags +faststart), enabling streaming.
	*
	* The operation always runs in the background (via Ffmpeg::conform_header()'s internal
	* async dispatch). No save() is triggered here; the caller is responsible for
	* refreshing file metadata after the background process completes.
	*
	* Returns an error response (with logger::ERROR) if the target file does not exist on
	* disk before the conform is attempted.
	*
	* Activity is logged to logger::$obj['activity'] on both success and failure paths.
	*
	* @param string $quality - quality variant whose file headers should be conformed
	* @return object $response
	*   ->result          bool   - true when the conform command was dispatched
	*   ->msg             string - human-readable outcome
	*   ->command_response mixed - output from Ffmpeg::conform_header()
	*/
	public function conform_headers(string $quality) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';

		// short vars
			$id					= $this->get_id();
			$source_file_path	= $this->get_media_filepath($quality);

		// check file
			if (!file_exists($source_file_path)) {
				$response->msg .= 'File does not exists. The file headers have not been conformed.';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' source_file_path: ' . to_string($source_file_path)
					, logger::ERROR
				);
				return $response;
			}

		// Ffmpeg
			$command_response	= Ffmpeg::conform_header(
				$source_file_path
			);

		// response
			$response->result			= true;
			$response->msg				= 'Rebuilding av file headers in background';
			$response->command_response	= $command_response;

		// logger activity
			logger::$obj['activity']->log_message(
				'NEW VERSION',
				logger::INFO,
				$this->tipo,
				NULL,
				[
					'msg'		=> 'conform_header av file',
					'tipo'		=> $this->tipo,
					'parent'	=> $this->section_id,
					'id'		=> $id,
					'quality'	=> $quality
				],
				logged_user_id() // int
			);


		return $response;
	}//end conform_headers



	/**
	* GET_MEDIA_ATTRIBUTES
	* Returns full container-level metadata for an AV file as parsed by ffprobe.
	*
	* Delegates to Ffmpeg::get_media_attributes() which runs ffprobe with JSON output
	* and returns the 'format' section of the result. Consumers such as get_duration()
	* read $result->format->duration from the returned object.
	*
	* Example return value structure (see get_duration() for a full annotated sample):
	*   { "format": { "filename": "…", "duration": "172.339000", "size": "22126087", … } }
	*
	* Returns null when ffprobe is unavailable or the file cannot be probed.
	*
	* @param string $file_path - absolute filesystem path to the AV file to inspect
	* @return object|null $media_attributes - ffprobe format metadata, or null on failure
	*/
	public function get_media_attributes(string $file_path) : ?object {

		$media_attributes = Ffmpeg::get_media_attributes($file_path);


		return $media_attributes;
	}//end get_media_attributes



	/**
	* UPDATE_DATA_VERSION
	* Migration hook called by the data-version update toolchain to transform stored data
	* to a new schema version.
	*
	* The $options object carries the target version and contextual identifiers:
	* - $options->update_version  string[] - version segments, joined to a dotted string
	*                                        (e.g. ['7','4','2'] → '7.4.2')
	* - $options->data_unchanged  mixed    - reference data for comparison (optional)
	* - $options->reference_id    mixed    - record identifier for logging
	* - $options->tipo            string   - ontology term identifier
	* - $options->section_id      mixed    - section record ID
	* - $options->section_tipo    string   - section type identifier
	* - $options->context         string   - caller context (default 'update_component_data')
	*
	* Response result codes (shared convention across all components):
	* - 0 : this component has no migration for the requested version (no-op)
	* - 1 : migration was applied
	* - 2 : migration was attempted but the stored data was already up to date
	*
	* Currently no version-specific migrations are implemented for component_av.
	* All versions fall through to the default case which returns result=0.
	* Add case blocks for each new migration as '7.x.y' string keys.
	*
	* @param object $options - migration context (see property descriptions above)
	* @return object $response
	*   ->result int    - 0 (no-op), 1 (migrated), or 2 (already current)
	*   ->msg    string - human-readable outcome
	*/
	public static function update_data_version(object $options) : object {

		// options
			$update_version	= $options->update_version ?? '';
			$data_unchanged	= $options->data_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_data';

		$update_version	= implode('.', $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}//end switch ($update_version)


		return $response;
	}//end update_data_version



}//end class component_av
