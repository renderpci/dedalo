<?php
declare(strict_types=1);
/**
* CLASS FFMPEG
* Wraps the ffmpeg and ffprobe command-line tools for all audio/video processing in Dédalo.
*
* This class is the single integration point between the Dédalo PHP layer and the system-level
* ffmpeg/ffprobe/qt-faststart binaries. All binary paths are read from Dédalo configuration
* constants (DEDALO_AV_FFMPEG_PATH, DEDALO_AV_FFPROBE_PATH, DEDALO_AV_FASTSTART_PATH,
* DEDALO_AV_FFMPEG_SETTINGS). No other class should invoke ffmpeg or ffprobe directly.
*
* Responsibilities:
* - Discovering installed binary paths and version strings.
* - Checking codec/library availability (e.g. libx264, libfdk_aac) by inspecting
*   the `ffmpeg -buildconf` output.
* - Resolving per-file video metadata: broadcast standard (PAL/NTSC), aspect ratio,
*   stream list, and format attributes via ffprobe.
* - Building multi-pass shell scripts for transcoding a source file to an alternate
*   quality/format defined by a named settings file under DEDALO_AV_FFMPEG_SETTINGS.
*   Each settings file (e.g. `404_pal_16x9.php`) populates local variables ($vb, $s,
*   $vcodec, $acodec, etc.) that are spliced into the generated ffmpeg command.
* - Extracting a single posterframe JPEG at an arbitrary sub-second timecode.
* - Cutting a time-bounded fragment of a media file, optionally compositing a watermark.
* - Relocating the MOOV atom (qt-faststart) for progressive web streaming.
* - Audio-only transcoding to the preferred AAC variant available in the installation.
*
* Static caches:
* - `$ar_settings`    — directory listing of available settings file names.
* - `$audio_codec`    — resolved preferred AAC encoder name.
* - (local static)    — per-file aspect-ratio and stream metadata caches inside
*                       get_aspect_ratio() and get_media_streams().
*
* All methods are static; the class is declared final and has no constructor.
*
* @package Dédalo
* @subpackage Core
*/
final class Ffmpeg {



	/**
	 * Cache of setting file base-names available in the ffmpeg settings directory.
	 * Populated lazily by get_ar_settings() on the first call; empty array means not yet loaded.
	 * Each entry is the file name without its '.php' extension (e.g. '404_pal_16x9').
	 * @var array $ar_settings
	 */
	static protected array $ar_settings = [];

	/**
	 * Ordered list of quality codes that the system recognises when scanning a setting name.
	 * Used by get_quality_from_setting() to extract the numeric (or 'audio') quality token
	 * from a composite setting string such as '404_pal_16x9'.
	 * @var array $ar_supported_quality_settings
	 */
	static protected array $ar_supported_quality_settings = ['1080','720','576','480','404','240','audio'];

	/**
	 * Class-level cache for the preferred AAC encoder name resolved by get_audio_codec().
	 * Empty string means the codec has not been probed yet. Once set, it is returned
	 * directly on subsequent calls to avoid repeated shell_exec invocations.
	 * @var string $audio_codec
	 */
	static protected string $audio_codec = '';



	/**
	* GET_FFMPEG_INSTALLED_PATH
	* Return the filesystem path to the ffmpeg binary as configured for this installation.
	*
	* The value is read from the global constant DEDALO_AV_FFMPEG_PATH, which is defined in
	* config.php (default: '/usr/bin/ffmpeg'). All methods that build shell commands call
	* this accessor rather than referencing the constant directly, so path overrides only
	* need to be made in one place.
	*
	* @return string - absolute path to the ffmpeg executable
	*/
	public static function get_ffmpeg_installed_path() : string {

		return DEDALO_AV_FFMPEG_PATH;
	}//end get_ffmpeg_installed_path



	/**
	* GET_FFPROVE_INSTALLED_PATH
	* Return the filesystem path to the ffprobe binary as configured for this installation.
	*
	* The value is read from the global constant DEDALO_AV_FFPROBE_PATH (default: '/usr/bin/ffprobe').
	* Note: the method name contains a historical typo ('ffprove' instead of 'ffprobe') that is
	* preserved for backward compatibility — do not rename without a coordinated callsite update.
	*
	* @return string - absolute path to the ffprobe executable
	*/
	public static function get_ffprove_installed_path() : string {

		return DEDALO_AV_FFPROBE_PATH;
	}//end get_ffprove_installed_path



	/**
	* GET_VERSION
	* Query the installed ffmpeg binary and return its numeric version string.
	*
	* Pipes the `ffmpeg -version` output through a sed expression that extracts only the
	* version number (e.g. '6.0' or '5.1.3'), stripping the surrounding text that ffmpeg
	* normally emits. Used for diagnostics and admin information pages.
	*
	* @return string - trimmed version string (e.g. '6.0'); empty string if binary is unreachable
	*/
	public static function get_version() : string {

		$cmd  = Ffmpeg::get_ffmpeg_installed_path();
		$cmd .= ' -version | sed -n "s/ffmpeg version \([-0-9.]*\).*/\1/p;" ';

		$version = trim(shell_exec($cmd) ?? '');

		return $version;
	}//end get_version



	/**
	* GET_FFPROVE_VERSION
	* Query the installed ffprobe binary and return its numeric version string.
	*
	* Parallel to get_version() but targets ffprobe. Version parity between ffmpeg and ffprobe
	* is expected on a correctly installed system; a mismatch may indicate a packaging issue.
	* Note: method name typo ('ffprove') is intentional preservation of the public API.
	*
	* @return string - trimmed version string (e.g. '6.0'); empty string if binary is unreachable
	*/
	public static function get_ffprove_version() : string {

		$cmd  = Ffmpeg::get_ffprove_installed_path();
		$cmd .= ' -version | sed -n "s/ffprobe version \([-0-9.]*\).*/\1/p;" ';

		$version = trim(shell_exec($cmd) ?? '');

		return $version;
	}//end get_ffprove_version



	/**
	* CHECK_LIB
	* Test whether a named library or encoder is compiled into the installed ffmpeg build.
	*
	* Searches the `ffmpeg -version` configuration summary for the flag "--enable-{$name}".
	* This is used, for example, to confirm that libx264 (H.264 encoding), libfdk_aac (high-
	* quality AAC), or other optional codecs are available before attempting to use them.
	*
	* @param string $name - library/encoder name as it appears in the configure flag (e.g. 'libx264', 'libfdk-aac')
	* @return bool - true if "--enable-{$name}" is present in the ffmpeg build configuration
	*/
	public static function check_lib( string $name ) : bool {

		$cmd  = Ffmpeg::get_ffmpeg_installed_path();
		$cmd .= ' -version';

		$version = shell_exec($cmd) ?? '';
		$search = "--enable-{$name}";
		preg_match('/' . $search . '/', $version, $output_array);

		$result = !empty($output_array);

		return $result;
	}//end check_lib



	/**
	* GET_QT_FASTSTART_INSTALLED_PATH
	* Return the filesystem path to the qt-faststart binary as configured for this installation.
	*
	* qt-faststart is a post-processing utility bundled with ffmpeg that moves the MOOV atom
	* (container metadata) to the beginning of an MP4 file, enabling the browser to start
	* playback before the full file is downloaded. Default path: '/usr/bin/qt-faststart'.
	*
	* @return string - absolute path to the qt-faststart executable (DEDALO_AV_FASTSTART_PATH)
	*/
	public static function get_qt_faststart_installed_path() : string {

		return DEDALO_AV_FASTSTART_PATH;
	}//end get_qt_faststart_installed_path



	/**
	* GET_SETTINGS_PATH
	* Return the directory that contains per-quality ffmpeg settings PHP files.
	*
	* Each file in this directory (e.g. 404_pal_16x9.php, audio.php) defines PHP variables
	* ($vb, $s, $vcodec, $acodec, etc.) that are included at runtime by build_av_alternate_command()
	* to produce the appropriate ffmpeg arguments for that quality profile.
	* Path is defined by the global constant DEDALO_AV_FFMPEG_SETTINGS.
	*
	* @return string - absolute path to the directory containing ffmpeg settings files
	*/
	public static function get_settings_path() : string {

		return DEDALO_AV_FFMPEG_SETTINGS;
	}//end get_settings_path



	/**
	* GET_AR_SETTINGS
	* Return the list of quality-profile names available as ffmpeg settings files.
	*
	* Reads the directory returned by get_settings_path() and builds an array of base-names
	* (file name minus the trailing '.php' extension). Results are cached in the static
	* property $ar_settings so the directory is only scanned once per PHP process.
	*
	* Entries that are filtered out: '.', '..', '.DS_Store' (macOS metadata), and any
	* directory entry named 'acc' (legacy artefact from a previous settings layout).
	*
	* The returned names are used by build_av_alternate_command() to validate that the
	* requested setting exists before attempting to include() it.
	*
	* @return array|null - array of setting names without extension (e.g. ['404_pal_16x9', 'audio', ...]),
	*                      or null if the settings directory cannot be opened
	*/
	public static function get_ar_settings() : ?array {

		if (!empty(Ffmpeg::$ar_settings)) {
			return Ffmpeg::$ar_settings;
		}

		$settings_path = Ffmpeg::get_settings_path();
		if ($folder_content = opendir( $settings_path )) {

			$ar_settings = [];
			while (false !== ($file_name = readdir($folder_content))) {
				if ($file_name!=='.' && $file_name!=='..' && $file_name!=='.DS_Store' && $file_name!=='acc') {
					$ar_settings[] = substr($file_name, 0, -4);
				}
			}
			closedir($folder_content);

			// fix value
			Ffmpeg::$ar_settings = $ar_settings;

			return $ar_settings;
		}


		return null;
	}//end get_ar_settings



	/**
	* GET_SETTING_NAME
	* Build the composite settings file name that matches a source file's video properties.
	*
	* The settings name is formed by joining tokens with '_':
	*   1. Quality code — the caller-supplied $quality (e.g. '404', '720', 'audio').
	*   2. Broadcast standard — 'pal' or 'ntsc', derived from the video stream frame rate.
	*      Omitted when $quality contains 'audio' (audio-only files have no frame rate).
	*   3. Aspect ratio — e.g. '16x9' or '4x3', derived from stream dimensions.
	*      Omitted when $quality contains 'audio'.
	*
	* Example results: '404_pal_16x9', '720_ntsc_4x3', 'audio'.
	* The resulting name must match a file in DEDALO_AV_FFMPEG_SETTINGS for the conversion
	* pipeline to succeed; the match is validated inside build_av_alternate_command().
	*
	* @param string $file_path - absolute path to the source media file (used to probe stream info)
	* @param string $quality   - quality token (e.g. '404', '720', 'audio')
	* @return string - composite setting name such as '404_pal_16x9' or 'audio'
	*/
	public static function get_setting_name( string $file_path, string $quality ) : string {

		$beats = [$quality];

		// media standard identification (pal|ntsc)
		// Audio-only files do not have a video stream, so standard detection is skipped.
			$media_standard = ( strpos($quality, 'audio')===false )
				? Ffmpeg::get_media_standard($file_path)
				: null;
			if (!empty($media_standard)) {
				$beats[] = $media_standard;
			}

		// aspect_ratio
		// Likewise, aspect ratio is meaningless for audio-only content.
			$aspect_ratio = ( strpos($quality, 'audio')===false )
				? Ffmpeg::get_aspect_ratio($file_path)
				: null;
			if (!empty($aspect_ratio)) {
				$beats[] = $aspect_ratio;
			}

		$setting = implode('_', $beats);


		return $setting;
	}//end get_setting_name



	/**
	* GET_MEDIA_STANDARD
	* Resolve the video broadcast standard (PAL or NTSC) for a source media file.
	*
	* The standard is determined from the video stream's average frame rate
	* (avg_frame_rate field from ffprobe). If avg_frame_rate is absent, r_frame_rate is used
	* as a fallback. Frame rates are expressed as rational fractions (e.g. '30000/1001' for
	* NTSC 29.97 fps or '25/1' for PAL 25 fps) and are evaluated as:
	*   - fps >= 29 → 'ntsc'
	*   - fps < 29  → 'pal' (default, including the fallback value of 25)
	*
	* This result feeds into get_setting_name() to select the correct ffmpeg settings file.
	*
	* @see Ffmpeg::get_setting_name()
	* @param string $file_path - absolute path to the source media file
	* @return string - 'ntsc' or 'pal'
	*/
	public static function get_media_standard( string $file_path ) : string {

		// media_streams
			$media_streams	= Ffmpeg::get_media_streams($file_path);
			// media_streams sample result:
			// {
			// 	"streams": [
			// 		{
			// 			"index": 0,
			// 			"codec_name": "h264",
			// 			"codec_long_name": "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
			// 			"profile": "High",
			// 			"codec_type": "video",
			//			"avg_frame_rate": "30000/1001",
			// 			...
			// 		},
			// 		{
			// 			"index": 1,
			// 			"codec_name": "aac",
			// 			"codec_long_name": "AAC (Advanced Audio Coding)",
			// 			"profile": "LC",
			// 			"codec_type": "audio",
			// 			"codec_tag_string": "mp4a",
			// 			...
			// 		}
			// 	]
			// }

		// streams
			$streams = is_object($media_streams)
				? ($media_streams->streams ?? [])
				: [];

		// video stream locate
			if (!empty($streams)) {

				$video_stream = Ffmpeg::find_video_stream($streams);

			}else{
				debug_log(__METHOD__
					. " Empty streams from file " . PHP_EOL
					. ' file_path: ' . $file_path  . PHP_EOL
					. ' media_streams: ' . to_string($media_streams)
					, logger::ERROR
				);
			}

		// fps standard name
		// Default to 25 fps (PAL) if the stream provides no frame-rate information.
		// avg_frame_rate is preferred; r_frame_rate is used when avg_frame_rate is absent
		// (some containers only expose one of these fields).
			$fps = 25; // default
			$ref = isset($video_stream) && isset($video_stream->avg_frame_rate)
				? $video_stream->avg_frame_rate
				: (isset($video_stream) && isset($video_stream->r_frame_rate)
					? $video_stream->r_frame_rate
					: null);
			if (!empty($ref)) {
				if (strpos($ref, '/') !== false) {
					// Frame rate expressed as rational fraction, e.g. '30000/1001' (≈ 29.97 fps NTSC)
					// or '25/1' (25 fps PAL). Integer division after evaluation gives the floor fps.
					// sample: '30000/1001'
					$beats = explode('/', $ref);
					if (isset($beats[0], $beats[1]) && intval($beats[1]) > 0) {
						$ratio	= intval($beats[0]) / intval($beats[1]);
						$fps	= intval($ratio);
					}
				} else {
					$fps = intval($ref);
				}
			}
			switch (true) {
				case ($fps>=29):
					$standard = 'ntsc';
					break;

				case ($fps==25):
				default:
					$standard = 'pal';
					break;
			}

		// debug
			debug_log(__METHOD__
				. " Resolved media standard from file " . PHP_EOL
				. ' video standard: ' . $standard  . PHP_EOL
				. ' fps: ' . $fps  . PHP_EOL
				. ' file_path: ' . $file_path  . PHP_EOL
				. ' video_stream: ' . (isset($video_stream) ? to_string($video_stream) : null)
				, logger::DEBUG
			);


		return $standard;
	}//end get_media_standard



	/**
	* GET_QUALITY_FROM_SETTING
	* Extract the quality code token from a composite setting name.
	*
	* The inverse of the assembly performed in get_setting_name(). Given a full setting string
	* such as '404_pal_16x9', this method searches the $ar_supported_quality_settings list for
	* a token that appears anywhere in $setting (case-insensitive) and returns the first match.
	* 'audio' is handled as a fast-path shortcut before the loop.
	*
	* The method is used by callers that have a settings-file name and need to recover the
	* numeric quality tier (e.g. to locate output files in the appropriate quality sub-directory).
	*
	* @param string $setting - composite setting name (e.g. '404_pal_16x9', '720_ntsc_4x3', 'audio')
	* @return string|null - quality token (e.g. '404', '720', 'audio'), or null if no known token matches
	*/
	public static function get_quality_from_setting( string $setting ) : ?string {

		if($setting==='audio') {
			return $setting;
		}

		$ar_quality = Ffmpeg::$ar_supported_quality_settings;
		foreach($ar_quality as $quality) {

			$pos = stripos($setting, $quality);
			if($pos!==false) {
				return $quality;
			}
		}

		return null;
	}//end get_quality_from_setting



	/**
	* BUILD_AV_ALTERNATE_COMMAND
	* Build and write a bash script that transcodes a source AV file to an alternate quality.
	*
	* This is the primary transcoding entry point for Dédalo's media pipeline. It:
	*   1. Validates that the requested $setting_name maps to a file under DEDALO_AV_FFMPEG_SETTINGS.
	*   2. Includes that settings PHP file to populate local variables ($vb, $s, $vcodec, $acodec,
	*      $ar, $ab, $ac, $progresivo, $gammma, $force, etc.).
	*   3. Probes the source file's streams via ffprobe to determine whether audio and/or video
	*      tracks are present, which drives which command branch executes.
	*   4. For audio-only settings ('audio' / 'audio_tr'): emits a single-pass audio extract command.
	*   5. For video settings:
	*      - If the source contains only audio: falls back to an audio-extract command.
	*      - Otherwise: generates a two-pass libx264 encode chain followed by qt-faststart
	*        (for MOOV atom relocation) and cleanup of all temp/log files.
	*   6. DVD structures are supported: when $source_file_path is a directory, the method
	*      scans VIDEO_TS/ for .VOB files and passes them as a concat: input to ffmpeg.
	*   7. The generated command is written to a .sh script file in the AV tmp directory.
	*      The script deletes itself upon successful completion (the final '&& rm -f' step).
	*
	* The bash script is NOT executed here; it is handed back to the caller (typically the
	* media conversion queue) which runs it asynchronously. The $response->sh_file field
	* contains the path the caller should execute.
	*
	* (!) Settings files are included with require(), so they execute arbitrary PHP. Only
	*     files from DEDALO_AV_FFMPEG_SETTINGS (a trusted server path) are ever included.
	*
	* @param object $options - options object with the following properties:
	*   string $setting_name      - base name of the ffmpeg settings file (e.g. '404_pal_16x9')
	*   string $source_file_path  - absolute path to the source AV file, or a DVD directory root
	*   string $target_file_path  - absolute path for the output converted file
	* @return object - stdClass response with:
	*   bool   $result   - true on success, false on any error
	*   string $msg      - human-readable status or error description
	*   string $command  - the generated bash command (only present on success)
	*   string $sh_file  - path to the written .sh script (only present on success)
	*/
	public static function build_av_alternate_command( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// options
			$setting_name		= $options->setting_name;
			$source_file_path	= $options->source_file_path;
			$target_file_path	= $options->target_file_path;

		// load ar_settings
			$ar_settings = Ffmpeg::get_ar_settings();
			// verify setting exists
			if( !in_array($setting_name, $ar_settings) ) {
				// die("Error: setting: '$setting_name' not exits! (build_av_alternate_command). Please contact with your admin to create");
				$response->msg .= " Error: setting: '$setting_name' do not exits! (build_av_alternate_command). Please contact with your admin to create";
				debug_log(__METHOD__.
					" $response->msg"
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					dump($options, ' build_av_alternate_command options ++ '.to_string());
					dump($ar_settings, ' build_av_alternate_command ar_settings ++ '.to_string());
				}
				return $response;
			}

		// import vars from settings file
		// The settings file populates local PHP variables that are referenced directly
		// in the command-building code below. Variables defined by each settings file:
		//   $vb       — video bitrate, e.g. '960k'
		//   $s        — output scale (width x height), e.g. '720x404'
		//   $g        — GOP size (keyframe interval), e.g. 75
		//   $vcodec   — video encoder, e.g. 'libx264'
		//   $progresivo — deinterlace filter, e.g. '-vf yadif'    (deinterlace flag)
		//   $gamma_y  — luminance gamma correction coefficient
		//   $gamma_u  — blue–luminance gamma correction coefficient
		//   $gamma_v  — red–luminance gamma correction coefficient
		//   $gammma   — assembled lutyuv gamma filter string
		//   $force    — container format, e.g. 'mp4'
		//   $ar       — audio sample rate in Hz, e.g. 44100
		//   $ab       — audio bitrate, e.g. '64k'
		//   $ac       — audio channel count (2 = stereo, 1 = mono)
		//   $acodec   — audio encoder from settings (may be overridden below by get_audio_codec())
		//   $target_path — quality sub-directory label, e.g. '404'
			try {
				$setting_file_path = DEDALO_AV_FFMPEG_SETTINGS .'/'. $setting_name .'.php';
				require($setting_file_path);
				// sample vars:
				// $vb				= '960k';			# video rate kbs
				// $s				= '720x404';		# scale
				// $g				= 75;				# keyframes interval (gob)
				// $vcodec			= 'libx264';		# default libx264
				// $progresivo		= "-vf yadif";		# deinterlace filter
				// $gamma_y			= "0.97";			# luminance gamma correction
				// $gamma_u			= "1.01";			# blue-luma gamma correction
				// $gamma_v			= "0.98";			# red-luma gamma correction
				// $gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # gamma correction filter
				// $force			= 'mp4';			# default mp4
				// $ar				= 44100;			# audio sample rate (22050)
				// $ab				= '64k';			# audio bitrate kbs
				// $ac				= "1";				# number of audio channels: 2 = stereo, 1 = mono
				// $acodec			= 'libvo_aacenc';	# default libvo_aacenc
				// $target_path		= "404";			# like '404'

			} catch (Exception $e) {
				debug_log(__METHOD__.
					" $response->msg" . PHP_EOL
					.' file: ' . $setting_file_path . PHP_EOL
					.' Caught exception: ' . $e->getMessage()
					, logger::ERROR
				);
				$response->msg .= " Error: setting: '$setting_name' file do not exits! (build_av_alternate_command)";
				return $response;
			}

		// target_path_dir from target_file_path
			$target_path_dir	= pathinfo($target_file_path)['dirname'];
			$dir_ready			= create_directory($target_path_dir);
			if (!$dir_ready) {
				$response->msg .= " Error on read or create directory for \"$setting_name\". Permission denied !";
				return $response;
			}

		// source file
			$src_file = $source_file_path;

		// If the source file is a directory (DVD folder), change the source file to the .VOB into the DVD folder and set the concat of the .vobs
		// DVD folder support: when the source path is a directory, the caller has provided
		// a ripped DVD structure. ffmpeg's 'concat:' demuxer is used to join all VOB files
		// in VIDEO_TS/ into a single logical input stream.
			if(is_dir($src_file)){
				$is_all_ok = false;
				$vob_files = array();
				if(!is_dir($src_file.'/VIDEO_TS')){
					$response->msg .= " Error: is necessary the DVD structure (VIDEO_TS)";
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. 'setting: ' .to_string($setting_name) . PHP_EOL
						. 'final_target_path: ' .$target_path_dir
						, logger::ERROR
					);
					return $response;
				}
				// Minimum size threshold for the initial VOB (512 KB).
				// VOB_0.VOB is a menu stub and is often very small; this guard ensures
				// only real content VOBs (VTS_01_1.VOB, etc.) are included in the concat.
				//minimum size of the initial vob (512KB)
				$vob_filesize = 512*1000;
				if ($handle = opendir($src_file.'/VIDEO_TS')) {
					 while (false !== ($file = readdir($handle))) {
						$extension = pathinfo($file,PATHINFO_EXTENSION);
						if($extension === 'VOB' && filesize($src_file.'/VIDEO_TS/'.$file) > $vob_filesize){
							$is_all_ok 	= true;
							// After the first qualifying VOB is found, reset threshold to 0
							// so that all subsequent (end-segment) VOBs are included regardless of size.
							//reset the size of the vob (for the end files of the video)
							$vob_filesize = 0;
							$vob_files[]= $src_file.'/VIDEO_TS/'.$file;
						}
					 }
					 closedir($handle);
				}
				if($is_all_ok){
					// Build a pipe-separated concat list for ffmpeg's 'concat:' demuxer.
					//$src_file	= 'concat:$(echo '.$src_file.'/VIDEO_TS/*.VOB|tr \  \|)';
					$concat = implode('|', $vob_files);
					$src_file = "concat:$concat";
				}else{
					$response->msg .= " Error: is necessary the DVD structure (.VOB files)";
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. 'setting: ' .to_string($setting_name) . PHP_EOL
						. 'src_file: ' .$src_file .PHP_EOL
						. 'vob_files: ' .to_string($vob_files)
						, logger::ERROR
					);
					return $response;
				}
			}//end if source file is directory

		// some useful variables
			$target_file	= $target_file_path;
			$tmp_folder		= DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . '/tmp';
			$tmp_file_base	= $tmp_folder . '/tmp_' . time();
			$tmp_file		= $tmp_file_base .'_'. pathinfo($target_file)['basename'];
			$log_file		= $tmp_file_base .'_'. pathinfo($target_file)['filename'] . '_log';

			// tmp_folder directory exists
			$dir_ready = create_directory($tmp_folder);
			if (!$dir_ready) {
				$response->msg .= " Error on read or create directory for \"tmp\" folder. Permission denied !";
				return $response;
			}

		// sh_file
			$sh_file = $tmp_folder .'/'. pathinfo($target_file)['filename'] . '.sh';

		// ffprobe get streams info
			$media_streams		= Ffmpeg::get_media_streams( $src_file );
			$source_with_video	= false;
			$source_with_audio	= false;
			$streams			= is_object($media_streams)
				? ($media_streams->streams ?? [])
				: [];
			foreach ($streams as $stream_obj) {
				$codec_type = $stream_obj->codec_type;
				if ($codec_type==='audio') {
					$source_with_audio = true;
				}else if ($codec_type==='video') {
					$source_with_video = true;
				}
			}

		// ffmpeg audio codec test
			$acodec = Ffmpeg::get_audio_codec();

		// ffmpeg paths
			$ffmpeg_path	= Ffmpeg::get_ffmpeg_installed_path();
			$faststart_path	= Ffmpeg::get_qt_faststart_installed_path();

		// shell command
		$command = '';
		$src_file_esc    = escapeshellarg($src_file);
		$target_file_esc = escapeshellarg($target_file);
		$tmp_file_esc    = escapeshellarg($tmp_file);
		$sh_file_esc     = escapeshellarg($sh_file);
		$log_file_esc    = escapeshellarg($log_file);

		// command selection
		// Two high-level branches: audio-only settings vs. video settings. Within each
		// branch, further sub-cases handle missing tracks and special audio_tr transcription mode.
		if($setting_name==='audio' || $setting_name==='audio_tr') {

			switch (true) {
				case ($source_with_audio===false):
					#
					# SOURCE NOT CONTAINS ANY AUDIO TRACK
					$response->msg .= 'Source does not contains audio';
					return $response;
				case ($setting_name==='audio_tr'):
					// 'audio_tr' (audio for transcription): downsampled mono 16 kHz output,
					// suitable as input for speech-to-text engines that expect narrow-band audio.
					$command	.= "nice -n 19 $ffmpeg_path -i $src_file_esc -vn -ar 16000 -ac 1 $target_file_esc ";

					// delete self sh file
					$command	.= "&& rm -f " . $sh_file_esc;
					break;

				case ($setting_name==='audio'):
				default:
					#
					# SOURCE CONTAINS ANY AUDIO TRACK

					# step 1: extract audio (direct copy was previously used; now always re-encoded
					# to normalise codec and container regardless of source format)
					#$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file_esc -vn -acodec copy $tmp_file_esc ";
					# convert format always
					$command	.= "nice -n 19 $ffmpeg_path -i $src_file_esc -vn -acodec $acodec -ar 44100 -ab 128k -ac 2 $target_file_esc ";
					# fast-start
					# (fast-start step is currently disabled; the audio container does not require MOOV relocation)
					#$command	.= "&& ".$faststart_path." $tmp_file_esc $target_file_esc ";
					# delete media temp
					#$command	.= "&& rm -f $tmp_file_esc ";
					# delete self sh file
					$command	.= "&& rm -f " . $sh_file_esc;
					break;
			}
		}else{

			switch (true) {

				case ($source_with_video===false):
					#
					# CASE ORIGINAL HAVE ONLY AUDIO
					# The caller requested a video quality but the source has no video stream.
					# Fall back to audio extraction to avoid a silent failure.
					$command .= "nice -n 19 $ffmpeg_path -i $src_file_esc -vn -acodec $acodec -ar 44100 -ab 128k -ac 2 $target_file_esc ";
					break;

				default:
					#
					# CASE ORIGINAL HAVE AUDIO AND VIDEO OR ONLY VIDEO
					# Two-pass libx264 encode for precise bitrate control. Pass 1 analyses
					# video only (no audio, output to /dev/null); pass 2 encodes both video
					# and audio into a temp file. qt-faststart then relocates the MOOV atom.

					/* EXAMPLE VARS (populated by the required settings file above)
					$vb				= '960k';			# video bitrate kbs
					$s				= '720x404';		# scale (width x height)
					$g				= 75;				# keyframe interval (GOP size)
					$vcodec			= 'libx264';		# default libx264
					$progresivo		= "-vf yadif";		# deinterlace filter
					$gamma_y		= "0.97";			# luminance gamma correction
					$gamma_u		= "1.01";			# blue-luma gamma correction
					$gamma_v		= "0.98";			# red-luma gamma correction
					$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # gamma correction filter
					$force			= 'mp4';			# container format
					$ar				= 44100;			# audio sample rate in Hz
					$ab				= '64k';			# audio bitrate kbs
					$ac				= "1";				# audio channel count: 2 = stereo, 1 = mono
					$acodec			= 'libvo_aacenc';	# audio encoder (overridden by get_audio_codec())
					$target_path 	= "404";			# quality sub-directory label
					*/

					// loglevel. Set to 'error' to prevents testunit display ffmpeg logs
					$log_level = '-loglevel error';

					$ar_cmn = [];

					// step 1 only video
					// Pass 1: video-only analysis pass; output discarded (-y /dev/null).
					// The -passlogfile argument sets the prefix for the pass-log written
					// by libx264 and consumed by pass 2.
					$ar_cmn[] = "nice -n 19 $ffmpeg_path -i $src_file_esc -an -pass 1 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force $log_level -passlogfile $log_file_esc -y /dev/null";

					// step 2 video / audio
					// Pass 2: actual encode of video + audio into the temp output file.
					// A temp file is used so that qt-faststart can write the final file
					// atomically; writing faststart output over the same path is unsafe.
					// video
					$av_cm  = "nice -n 19 $ffmpeg_path -i $src_file_esc -pass 2 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force $log_level -passlogfile $log_file_esc -y ";
					// audio
					$av_cm .= "-acodec $acodec -ar $ar -ab $ab -ac $ac -y $tmp_file_esc";
					// add
					$ar_cmn[] = $av_cm;

					// fast-start
					// Relocate the MOOV atom from the end of the file to the beginning
					// so the browser can begin playback without downloading the whole file.
					$ar_cmn[] = "nice -n 19 $faststart_path $tmp_file_esc $target_file_esc";

					// delete
					// delete media temp
					$ar_cmn[] = "rm -f $tmp_file_esc";
					// delete log temps (all generated logs files)
					$ar_cmn[] = "rm -f {$log_file_esc}*";
					// delete self sh file
					$ar_cmn[] = "rm -f " . $sh_file_esc;

					// compose final command
					$command = implode(" &&\n", $ar_cmn);
					break;
			}
		}//end if($setting_name=='audio')


		// debug
			debug_log(__METHOD__
				."Creating AV version:" . PHP_EOL
				.'command: ' . PHP_EOL . PHP_EOL
				. $command . PHP_EOL
				, logger::WARNING
			);

		// SH FILE
			$fp = fopen($sh_file, "w");
			fwrite($fp, "#!/bin/bash\n");
			fwrite($fp, "$command\n");
			fclose($fp);
			// check the file and permissions
			if(!file_exists($sh_file)) {
				// throw new Exception("Error Processing Media. Script file do not exists or is not accessible", 1);
				debug_log(__METHOD__
					. " Error Processing Media. Script file do not exists or is not accessible " . PHP_EOL
					. 'command: '. $command
					, logger::ERROR
				);
			}

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'OK. Request done';
			$response->command	= $command;
			$response->sh_file	= $sh_file;


		return $response;
	}//end build_av_alternate_command



	/**
	* FIND_VIDEO_STREAM
	* Locate the primary video stream object within a list of ffprobe stream metadata objects.
	*
	* Uses two progressive fallback strategies:
	*   1. Primary: codec_type === 'video' (the canonical ffprobe field).
	*   2. Fallback: codec_name starts with 'h26' (H.264 / H.265), or the stream has a
	*      'width' property — covers containers that set codec_type incorrectly or omit it.
	*
	* Returns null if no stream matches either heuristic, and logs a WARNING.
	* Callers must handle the null case; absence of a video stream is valid for audio files.
	*
	* @param array $media_streams - array of stream stdClass objects from ffprobe JSON output
	* @return object|null - the first matching video stream object, or null if none found
	*/
	public static function find_video_stream( array $media_streams ) : ?object {

		// search by codec_type
		// Standard path: ffprobe reliably sets codec_type for well-formed containers.
			$video_stream = array_find($media_streams, function($el){
				return isset($el->codec_type) && $el->codec_type==='video';
			});

		// search by codec_name
		// Fallback for containers where codec_type is missing or set to a non-standard value.
		// Matching 'h26' covers both 'h264' and 'h265'/'hevc'. Checking for 'width' is a
		// last resort for containers that describe video dimensions without explicit codec info.
			if (empty($video_stream)) {
				$video_stream = array_find($media_streams, function($el){
					return (isset($el->codec_name) && strpos($el->codec_name, 'h26')===0)
						|| isset($el->width);
				});
			}

		// debug
			if (empty($video_stream)) {
				debug_log(__METHOD__
					. " WARNING: Unable to find video stream from media_streams list " . PHP_EOL
					. ' media_streams: ' . to_string($media_streams)
					, logger::WARNING
				);
				$video_stream = null;
			}


		return $video_stream;
	}//end find_video_stream



	/**
	* GET_ASPECT_RATIO
	* Resolve the display aspect ratio of a video source file to a named ratio string.
	*
	* Obtains the video stream via get_media_streams() + find_video_stream() and resolves
	* the aspect ratio through two paths:
	*   1. display_aspect_ratio field (e.g. '16:9') — preferred; directly from container metadata.
	*   2. width and height pixel dimensions — used when display_aspect_ratio is absent;
	*      ratio = round(width / height, 2) is compared against known float values.
	*
	* Ratio → name mapping:
	*   1.33 / 1.34  → '4x3'   (standard definition 4:3)
	*   1.77 / 1.78  → '16x9'  (widescreen HD)
	*   1.66         → '5x3'
	*   1.50         → '3x2'
	*   1.25         → '5x4'
	*   (any other)  → '16x9'  (default fallback)
	*
	* Results are cached in a function-static array keyed by $source_file to avoid
	* repeated ffprobe calls when the same file is queried for both aspect ratio and
	* broadcast standard.
	*
	* @param string $source_file - absolute path to the video file
	* @return string - aspect ratio string (e.g. '16x9', '4x3'); defaults to '16x9' on error
	*/
	public static function get_aspect_ratio( string $source_file ) : string {

		// cache
			static $cache_aspect_ratio = [];
			if (isset($cache_aspect_ratio[$source_file])) {
				return $cache_aspect_ratio[$source_file];
			}

		// default value
			$aspect = '16x9';

		// media_streams. get streams
			$media_streams = Ffmpeg::get_media_streams($source_file);
			// media_streams sample result:
			// {
			// 	"streams": [
			// 		{
			// 			"index": 0,
			// 			"codec_name": "h264",
			// 			"codec_long_name": "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
			// 			"profile": "High",
			// 			"codec_type": "video",
			//			"avg_frame_rate": "30000/1001",
			// 			...
			// 		},
			// 		{
			// 			"index": 1,
			// 			"codec_name": "aac",
			// 			"codec_long_name": "AAC (Advanced Audio Coding)",
			// 			"profile": "LC",
			// 			"codec_type": "audio",
			// 			"codec_tag_string": "mp4a",
			// 			...
			// 		}
			// 	]
			// }
			$video_stream = isset($media_streams->streams)
				? Ffmpeg::find_video_stream($media_streams->streams)
				: null;

		// reference dimensions
			$width	= 0;
			$height	= 0;

		if (!empty($video_stream)) {

			if (!empty($video_stream->display_aspect_ratio) && isset($video_stream->display_aspect_ratio)) {

				// data from media_streams definition

					$aspect_ratio = $video_stream->display_aspect_ratio;

					$beats	= explode(':', $aspect_ratio);
					// $aspect	= implode('x', $beats);

					$width	= isset($beats[0]) ? (float)$beats[0] : 0.0;
					$height	= isset($beats[1]) ? (float)$beats[1] : 0.0;

				// debug
					debug_log(__METHOD__
						. " getting aspect_ratio from video_stream->display_aspect_ratio: " . PHP_EOL
						. ' aspect_ratio: ' . to_string($aspect_ratio)
						, logger::DEBUG
					);

			}else{

				// size
					$width_default	= 720;
					$height_default	= 404;

					$width = isset($video_stream->width)
						? (int)$video_stream->width
						: $width_default;

					$height = isset($video_stream->height)
						? (int)$video_stream->height
						: $height_default;

				// debug
					debug_log(__METHOD__
						. " getting aspect_ratio from width/height: " . PHP_EOL
						. ' width: ' . to_string($width) . PHP_EOL
						. ' height: ' . to_string($height)
						, logger::DEBUG
					);
			}

		// aspect_ratio
		// Switch on the string representation of the rounded float to avoid floating-point
		// equality pitfalls. Round to 2 decimal places before comparison so that e.g.
		// 1280/720 = 1.7777... becomes '1.78' and matches the '16x9' case correctly.
			$aspect_ratio = ($width>0 && $height>0)
				? round(($width / $height), 2)
				: 0;
			$aspect_ratio_str = strval($aspect_ratio);
			switch($aspect_ratio_str) {

				case '1.33'	:
				case '1.34'	:
					$aspect = '4x3';
					break;

				case '1.77'	:
				case '1.78'	:
					$aspect = '16x9';
					break;

				case '1.66' :
					$aspect = '5x3';
					break;

				case '1.50'	:
					$aspect = '3x2';
					break;

				case '1.25'	:
					$aspect = '5x4';
					break;

				default	:
					$aspect = '16x9';
			}
		}//end if (!empty($video_stream))

		// cache
			$cache_aspect_ratio[$source_file] = $aspect;

		// debug
			debug_log(__METHOD__
				. " getting aspect_ratio : " . PHP_EOL
				. ' width: ' . to_string($width) . PHP_EOL
				. ' height: ' . to_string($height) . PHP_EOL
				. ' aspect: ' . to_string($aspect)
				, logger::DEBUG
			);


		return $aspect; // default 16x9
	}//end get_aspect_ratio



	/**
	* CREATE_POSTERFRAME
	* Extract a single video frame as a JPEG posterframe at an arbitrary sub-second timecode.
	*
	* Uses the ffmpeg '-ss' seek + '-vframes 1' technique to capture exactly one frame,
	* encoded as a JPEG via the 'mjpeg' codec. The output is written synchronously (the
	* caller blocks until the command completes) via exec_::exec_command().
	*
	* Output dimensions depend on the $quality parameter and the source aspect ratio:
	*   - 'original'  → 936 × 720 (4:3) or 1280 × 720 (16:9)
	*   - 'thumbnail' → width computed from DEDALO_IMAGE_THUMB_HEIGHT constant × ratio
	*   - other       → 540 × 404 (4:3) or 720 × 404 (16:9)
	*
	* Returns false immediately (without running ffmpeg) when the source file has no video
	* stream, because posterframes are meaningless for audio-only content.
	*
	* @param object $options - options object with:
	*   float|string $timecode           - seek position in seconds (e.g. 102.369)
	*   string       $src_file           - absolute path to the source video file
	*   string       $quality            - size profile: 'original', 'thumbnail', or any other value
	*   string       $posterframe_filepath - absolute path for the output JPEG file
	* @return bool - true when ffmpeg reports success and the image file is created; false otherwise
	*/
	public static function create_posterframe( object $options ) : bool {

		// options
			$timecode				= $options->timecode;
			$src_file				= $options->src_file;
			$quality				= $options->quality;
			$posterframe_filepath	= $options->posterframe_filepath;

		// media_streams. get streams
			$media_streams = Ffmpeg::get_media_streams($src_file);
			// media_streams sample result:
			// {
			// 	"streams": [
			// 		{
			// 			"index": 0,
			// 			"codec_name": "h264",
			// 			"codec_long_name": "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
			// 			"profile": "High",
			// 			"codec_type": "video",
			//			"avg_frame_rate": "30000/1001",
			// 			...
			// 		},
			// 		{
			// 			"index": 1,
			// 			"codec_name": "aac",
			// 			"codec_long_name": "AAC (Advanced Audio Coding)",
			// 			"profile": "LC",
			// 			"codec_type": "audio",
			// 			"codec_tag_string": "mp4a",
			// 			...
			// 		}
			// 	]
			// }
			$video_stream = isset($media_streams->streams)
				? Ffmpeg::find_video_stream($media_streams->streams)
				: null;
			if (empty($video_stream)) {
				// audio file (return false prevents creating thumb here)
				return false;
			}

		// aspect_ratio_cmd
			$raw_aspect_ratio = Ffmpeg::get_aspect_ratio($src_file);
			if ($quality==='original') {
				$aspect_ratio = strtolower($raw_aspect_ratio)==='4x3'
					? '936x720'
					: '1280x720';
			}else if ($quality==='thumbnail') {
				$aspect_ratio = strtolower($raw_aspect_ratio)==='4x3'
					? (int)floor(4  * DEDALO_IMAGE_THUMB_HEIGHT / 3).'x'.DEDALO_IMAGE_THUMB_HEIGHT
					: (int)floor(16 * DEDALO_IMAGE_THUMB_HEIGHT / 9).'x'.DEDALO_IMAGE_THUMB_HEIGHT; // default for 16x9
			}else{
				$aspect_ratio = strtolower($raw_aspect_ratio)==='4x3'
					? '540x404'
					: '720x404'; // default for 16x9
			}

			$aspect_ratio_cmd = '-s ' . $aspect_ratio;

		// timecode
		// We convert the received value to floating number and
		// we round the value to 3 decimal places to pass it to ffmpeg tipo '40.100'
			$timecode = number_format((float)$timecode, 3, '.', '');

		// posterframe directory exists check
			$dir_ready = create_directory(dirname($posterframe_filepath));
			if (!$dir_ready) {
				// target directory is not reachable
				return false;
			}

		// ffmpeg_path
			$ffmpeg_path = Ffmpeg::get_ffmpeg_installed_path();
			$src_file_esc = escapeshellarg($src_file);
			$posterframe_filepath_esc = escapeshellarg($posterframe_filepath);

		// commands shell
			// command (use video track only)
			$command = escapeshellcmd($ffmpeg_path) . " -ss $timecode -i $src_file_esc -y -vframes 1 -f rawvideo -an -vcodec mjpeg $aspect_ratio_cmd $posterframe_filepath_esc";
			// exec command (return boolean)
			$posterFrame_command_exc = exec_::exec_command($command);
			// debug
			$level = $posterFrame_command_exc===false ? logger::ERROR : logger::WARNING;
			debug_log(__METHOD__
				. " Create posterframe command execution response: " . PHP_EOL
				. ' ' . to_string($posterFrame_command_exc)
				, $level
			);


		return $posterFrame_command_exc;
	}//end create_posterframe



	/**
	* BUILD_FRAGMENT
	* Cut a time-bounded sub-clip from a media file, optionally compositing a watermark.
	*
	* Two code paths:
	*   - No watermark ($watermark === false): uses '-vcodec copy -acodec copy' for a
	*     lossless stream-copy. Fast but the output keyframe alignment is at the mercy of
	*     the source GOP structure (the cut may start at the nearest preceding keyframe).
	*   - With watermark ($watermark === true): first cuts with stream copy into a temp file,
	*     then re-encodes with the ffmpeg 'movie' + 'overlay' filter to composite the
	*     watermark image (DEDALO_AV_WATERMARK_FILE) in the top-right corner (10px inset).
	*     The watermark path must exist on disk; the method returns an error if it does not.
	*
	* Duration and in-point are converted from float seconds to HH:MM:SS.mmm timecode
	* strings via OptimizeTC::seg2tc() before passing them to ffmpeg.
	*
	* The command is executed synchronously with exec(); result_code 0 and presence of the
	* output file are both required to report success.
	*
	* @param object $options - options object with:
	*   string $source_file_path  - absolute path to the source video or audio file
	*   string $target_filename   - output file base name (including extension)
	*   string $fragments_dir_path - directory that will receive the fragment file
	*   float  $tc_in_secs        - in-point in fractional seconds
	*   float  $tc_out_secs       - out-point in fractional seconds
	*   bool   $watermark         - true to overlay the Dédalo watermark image
	* @return object - stdClass with:
	*   bool   $result - true when the fragment file is created successfully
	*   string $msg    - success message or error description
	*/
	public static function build_fragment( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// options
			$source_file_path	= $options->source_file_path;
			$target_filename	= $options->target_filename;
			$fragments_dir_path	= $options->fragments_dir_path;
			$tc_in_secs			= $options->tc_in_secs;
			$tc_out_secs		= $options->tc_out_secs;
			$watermark			= $options->watermark;

		// duration
		// ffmpeg requires duration as a timecode string ('HH:MM:SS.mmm'), not as seconds.
		// The in-point is likewise expressed as a timecode for the -ss flag.
			$duration_secs = $tc_out_secs - $tc_in_secs;
			// duration_secs is float like 538.521 and need to be converted to time-code like 00:06:53.734
			$duration_tc	= OptimizeTC::seg2tc($duration_secs);
			$tc_in			= OptimizeTC::seg2tc($tc_in_secs); // as time code like 00:00:03.125

		// watermark_file path
			$watermark_file = DEDALO_AV_WATERMARK_FILE;

		// fragments_dir_path
			$fragments_dir_path	= rtrim($fragments_dir_path, '/');
			$dir_ready			= create_directory($fragments_dir_path);
			if (!$dir_ready) {
				$response->msg .= " Error trying to create fragments_dir";
				return $response;
			}

		// target_file_path
			$target_file_path = $fragments_dir_path . '/' . $target_filename;

		// ffmpeg_path
			$ffmpeg_path = Ffmpeg::get_ffmpeg_installed_path();

		// debug
			debug_log(__METHOD__
				." Building fragment '$target_filename'. Duration secs: ".$duration_secs
				, logger::WARNING
			);

		// command
			$source_file_path_esc = escapeshellarg($source_file_path);
			$target_file_path_esc = escapeshellarg($target_file_path);

			if ($watermark===true) {

				// check watermark file
				// (!) The watermark file path is set by DEDALO_AV_WATERMARK_FILE in config.php.
				// If the file is missing the entire fragment creation fails rather than silently
				// producing an unwatermarked output, which would break access-control expectations.
					if (!file_exists($watermark_file)) {
						$response->msg .= " Error. watermark file do not exists! ";
						debug_log(__METHOD__.
							" $response->msg. Check your config file and make sure the watermark file exists and is accessible. watermark_file: " .PHP_EOL
							. to_string($watermark_file),
							logger::ERROR
						);
						return $response;
					}

				// temporal fragment file
				// Two-step watermark process:
				//   Step 1: fast stream-copy cut into a temp file (avoids re-encoding the full source).
				//   Step 2: overlay the watermark via the 'movie' filtergraph and re-encode only the clip.
				// overlay=main_w-overlay_w-10:10 positions the watermark 10px from the top-right corner.
				$target_file_path_temp = $fragments_dir_path .'/temp_'. $target_filename;
				$target_file_path_temp_esc = escapeshellarg($target_file_path_temp);

				$command  = "   nice -n 19 $ffmpeg_path -ss $tc_in  -i $source_file_path_esc -t ".$duration_tc." -vcodec copy -acodec copy -y $target_file_path_temp_esc ";
				$command .= "&& nice -n 19 $ffmpeg_path -i $target_file_path_temp_esc -vf \"movie={$watermark_file} [watermark]; [in][watermark] overlay=main_w-overlay_w-10:10 [out]\" -y $target_file_path_esc";

			}else{

				// No watermark: single-pass stream copy for speed.
				// The -vcodec copy -acodec copy flags avoid any re-encoding, but the cut point
				// is constrained to keyframe boundaries inherent in the source encoding.
				$command = "$ffmpeg_path -ss $tc_in -i $source_file_path_esc -t ".$duration_tc." -vcodec copy -acodec copy -y $target_file_path_esc";
			}

		// exec command and wait to finish
			$command_exc = exec($command, $output, $result_code);
			if ($command_exc===false) {
				$response->msg .= " Error executing command to build fragment ";
				debug_log(__METHOD__
					." $response->msg . output: ".to_string($output).' - result_code: '.to_string($result_code)
					, logger::ERROR
				);
				return $response;
			}

		// response. command result code is 0 for success and 1 for errors
			if ($result_code===0 && file_exists($target_file_path)) {

				$response->result	= true;
				$response->msg		= 'OK. Created fragment successfully. file name: '.$target_filename;
				debug_log(__METHOD__
					." $response->msg "
					, logger::DEBUG
				);

			}else{

				$response->msg		= 'Error on create av fragment. file name: '.$target_filename;
				debug_log(__METHOD__
					." $response->msg ". PHP_EOL
					.' command: ' . PHP_EOL
					. $command
					, logger::ERROR
				);
			}


		return $response;
	}//end build_fragment



	/**
	* CONFORM_HEADER
	* Relocate the MOOV atom to the start of an MP4 file to enable progressive web streaming.
	*
	* An MP4 created by ffmpeg typically writes the MOOV atom (which contains the track index
	* and metadata needed for playback) at the end of the file. A browser cannot begin playback
	* until the full file is downloaded. qt-faststart solves this by copying the file with the
	* MOOV atom placed at the beginning, enabling HTTP progressive download playback.
	*
	* The operation is performed in three steps to avoid data loss:
	*   1. Re-encode (stream copy) the source into a temporary file via ffmpeg.
	*   2. Rename the original to an '_untouched' sibling so the input path is free.
	*   3. Run qt-faststart on the temp file, writing to the original path; remove the temp.
	*
	* The '_untouched' backup file is intentionally left on disk after the operation;
	* callers are responsible for cleaning it up once they have verified the output.
	*
	* Returns null when shell_exec cannot run the command; the return value of shell_exec
	* for successful commands with no stdout output is also null, so callers should
	* verify the output file directly rather than relying on the return value.
	*
	* @param string $source_file_path - absolute path to the MP4 file to conform
	* @return string|null - shell output from the command chain, or null
	*/
	public static function conform_header( string $source_file_path ) : ?string {

		$result = null;

		// ffmpeg_path
			$ffmpeg_path	= Ffmpeg::get_ffmpeg_installed_path();
			$faststart_path	= Ffmpeg::get_qt_faststart_installed_path();

		// short vars
			// source_dir_path. Like /../dedalo/media/av/404/0
			$source_dir_path	= dirname($source_file_path);
			$path_info			= pathinfo($source_file_path);
			$extension			= $path_info['extension'] ?? '';
			// file_path_temp. Like /../dedalo/media/av/404/0/test94_test3_3_temp.mp4
			$file_path_temp	= $source_dir_path .'/'. $path_info['filename'] .'_temp' . ($extension !== '' ? '.' . $extension : '');
			// file_path_untouched. Like /../dedalo/media/av/404/0/test94_test3_3_untouched.mp4
			$file_path_untouched = $source_dir_path .'/'. $path_info['filename'] .'_untouched' . ($extension !== '' ? '.' . $extension : '');
			// target_file_path. Like /../dedalo/media/av/404/0/test94_test3_3.mp4
			$target_file_path = $source_file_path; // to the same location than the source (moved previously)

		// command
			$sentences = [];
			$source_file_path_esc    = escapeshellarg($source_file_path);
			$file_path_temp_esc      = escapeshellarg($file_path_temp);
			$file_path_untouched_esc = escapeshellarg($file_path_untouched);
			$target_file_path_esc    = escapeshellarg($target_file_path);

			// Copy file
			$sentences[] = "$ffmpeg_path -i $source_file_path_esc -c:v copy -c:a copy $file_path_temp_esc"; # && rm -f $file_path && mv $file_path_temp $file_path # -y

			// Rename original to preserve the original file untouched
			$sentences[] = "mv $source_file_path_esc $file_path_untouched_esc";

			// faststart (build final file)
			$sentences[] = "$faststart_path $file_path_temp_esc $target_file_path_esc";

			// Remove temp file
			$sentences[] = "rm -f $file_path_temp_esc";

			$command = implode(' && ', $sentences);

		// exec
			$result = shell_exec( $command );

		// debug
			debug_log(__METHOD__." Exec command conform headers:" . PHP_EOL
				.' command: ' . $command . PHP_EOL
				.' result: ' . to_string($result)
				, logger::DEBUG
			);


		return $result;
	}//end conform_header



	/**
	* CONVERT_AUDIO
	* Transcode an uploaded audio file to Dédalo's standard audio format.
	*
	* Produces a stereo AAC (or best available encoder) file at 44100 Hz / 240 kbps,
	* then runs qt-faststart on the output file in-place (input and output paths are the
	* same for faststart). The audio bitrate here (240k) is higher than the bitrate used
	* in build_av_alternate_command() (128k) because this method targets full-quality
	* archival audio upload rather than a streaming-optimised alternate.
	*
	* The encoder is resolved at runtime by get_audio_codec() (libfdk_aac → libvo_aacenc → aac).
	*
	* (!) Note: passing the same path as both input and output to qt-faststart is safe for
	*     audio containers (M4A) where the MOOV atom is always small relative to the file,
	*     but may fail for some edge cases. This is a known pattern in this codebase.
	*
	* @param object $options - options object with:
	*   string $uploaded_file_path - absolute path to the source audio file
	*   string $output_file_path   - absolute path for the converted output audio file
	* @return string|null - raw shell output from the command chain, or null
	*/
	public static function convert_audio( object $options ) : ?string {

		// options
			$output_file_path	= $options->output_file_path;
			$uploaded_file_path	= $options->uploaded_file_path;

		// ffmpeg_path
			$ffmpeg_path	= Ffmpeg::get_ffmpeg_installed_path();
			$faststart_path	= Ffmpeg::get_qt_faststart_installed_path();

		// command
			$command  = '';
			$uploaded_file_path_esc = escapeshellarg($uploaded_file_path);
			$output_file_path_esc   = escapeshellarg($output_file_path);

			// ffmpeg -i INPUT_FILE.EXT -aq 500 -acodec libfaac -map_meta_data OUTPUT_FILE.EXT:INPUT_FILE.EXT OUTPUT_FILE.EXT
			// ffmpeg -i INPUT_FILE.EXT -aq 70 -acodec libfaac -map_meta_data OUTPUT_FILE.EXT:INPUT_FILE.EXT OUTPUT_FILE.EXT
			// ffmpeg -i input.wav -c:a libfdk_aac -b:a 128k output.m4a
			// ffmpeg -i input.wav -strict experimental -c:a aac -b:a 240k output.m4a

			// ffmpeg audio codec test
			$acodec = Ffmpeg::get_audio_codec();

			// convert file
			$command .= "$ffmpeg_path -i $uploaded_file_path_esc -acodec $acodec -ar 44100 -ab 240k -ac 2 $output_file_path_esc ";

			// faststart
			$command .= "&& $faststart_path $output_file_path_esc $output_file_path_esc ";

		// exec
			$result = shell_exec( $command );
			// $conform_header_command_exc = Exec::exec_command($command);

		// debug
			debug_log(__METHOD__." Executed command: ".
				PHP_EOL.$command .
				PHP_EOL." result: " .
				to_string($result),
				logger::DEBUG
			);


		return $result;
	}//end convert_audio



	/**
	* CONVERT_TO_DEDALO_AV
	* Transcode a source video to Dédalo's default delivery quality (typically 404 px height).
	*
	* Applies the yadif deinterlace filter and scales the video to the height defined by
	* DEDALO_AV_QUALITY_DEFAULT (default: 404 px), preserving aspect ratio with -2:{height}
	* (width snapped to the nearest even number). The encoder is libx264 with 960k bitrate,
	* GOP size 75, stereo AAC audio, and -movflags faststart for immediate web playback.
	*
	* Output is first written to a temp file suffixed with '_temp', then atomically renamed
	* to the final $target_file path to avoid serving a partially-written file.
	*
	* Execution mode:
	*   - $async = true  (default): command is sent to the background with '> /dev/null &'.
	*     The method returns immediately; the caller cannot detect completion or failure.
	*   - $async = false: exec() blocks until completion; return value is the last line of output.
	*
	* This method is intended for direct upload conversion where the caller wants a quick
	* "fire and forget" transcode. For queue-managed batch conversion, use
	* build_av_alternate_command() instead.
	*
	* @param string $source_file - absolute path to the input video file
	* @param string $target_file - absolute path for the transcoded output MP4
	* @param bool   $async       = true - true to run in background, false to block until done
	* @return string|null - last output line from exec(), or null in async mode
	*/
	public static function convert_to_dedalo_av( string $source_file, string $target_file, bool $async=true ) : ?string {

		// ffmpeg_path
			$ffmpeg_path	= Ffmpeg::get_ffmpeg_installed_path();
			$faststart_path	= Ffmpeg::get_qt_faststart_installed_path();

		// FFMPEG AUDIO CODEC TEST
		$acodec = Ffmpeg::get_audio_codec();

		$path_parts			= pathinfo($target_file);
		$extension			= $path_parts['extension'] ?? '';
		$temp_target_file	= $path_parts['dirname'] .'/'. $path_parts['filename'] .'_temp' . ($extension !== '' ? '.' . $extension : '');

		// Note: variable name 'heigth' is a historical typo for 'height' — preserved as-is.
		$heigth = DEDALO_AV_QUALITY_DEFAULT; // 404, 240 ..

		$source_file_esc = escapeshellarg($source_file);
		$target_file_esc = escapeshellarg($target_file);
		$temp_target_file_esc = escapeshellarg($temp_target_file);

		# COMMAND: Full process
		# Previous fixed-resolution variants (commented out); current command uses dynamic height
		# from DEDALO_AV_QUALITY_DEFAULT with -2:{height} to auto-compute an even-numbered width.
		#$command  = "nice $ffmpeg_path -y -i $source_file_esc -vf \"yadif=0:-1:0, scale=720:404:-1\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $target_file_esc ";
		#$command  = "nice $ffmpeg_path -y -i $source_file_esc -vf \"yadif=0:-1:0, scale=720:404:-1\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $temp_target_file_esc ";
		$command  = "nice $ffmpeg_path -y -i $source_file_esc -vf \"yadif=0:-1:0, scale=-2:{$heigth}\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $temp_target_file_esc ";
		$command .= "&& mv $temp_target_file_esc $target_file_esc ";
		# Processed command only fast start (alternative: skip encode, only relocate MOOV)
		#$command = "nice $faststart_path $source_file_esc $target_file_esc";

		debug_log(__METHOD__." command:".PHP_EOL. $command, logger::DEBUG);

		if ($async) {
			# Exec without wait finish
			$result = exec("$command  > /dev/null &");
		}else{
			# Exec wait finish
			$result = exec("$command");
		}


		return $result;
	}//end convert_to_dedalo_av



	/**
	* GET_MEDIA_ATTRIBUTES
	* Retrieve container-level metadata for a media file via ffprobe's -show_format output.
	*
	* Executes ffprobe with JSON output format and returns the decoded object. This provides
	* container-wide information (duration, bitrate, file size, tags) but NOT per-stream data;
	* use get_media_streams() when stream-level properties (width, codec, frame rate) are needed.
	*
	* The '2>&1' redirect merges stderr into stdout so that ffprobe error messages are captured
	* in $output rather than leaking to the web server error log.
	*
	* Example return value structure:
	* {
	*   "format": {
	*     "filename": "/../dedalo/media/av/404/rsc35_rsc167_1.mp4",
	*     "nb_streams": 3,
	*     "nb_programs": 0,
	*     "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
	*     "format_long_name": "QuickTime / MOV",
	*     "start_time": "0.000000",
	*     "duration": "172.339000",
	*     "size": "22126087",
	*     "bit_rate": "1027095",
	*     "probe_score": 100,
	*     "tags": {
	*       "major_brand": "isom",
	*       "minor_version": "512",
	*       "compatible_brands": "isomiso2avc1mp41",
	*       "encoder": "Lavf59.16.100",
	*       "creation_time": "2023-10-23T10:00:26.000000Z"
	*     }
	*   }
	* }
	*
	* @param string $source_file - absolute path to the media file
	* @return object|null - decoded JSON object with a 'format' property, or null if ffprobe fails
	*/
	public static function get_media_attributes( string $source_file ) : ?object {

		$ffprove_path = Ffmpeg::get_ffprove_installed_path();
		$source_file_esc = escapeshellarg($source_file);

		$command = escapeshellcmd($ffprove_path) . ' -v quiet -print_format json -show_format ' . $source_file_esc . ' 2>&1';
		$output  = json_decode( shell_exec($command) );

		return $output;
	}//end get_media_attributes



	/**
	* GET_DATE_TIME_ORIGINAL
	* Extract the original recording date/time from a media file's container metadata.
	*
	* Calls get_media_attributes() and inspects the 'creation_time' tag under
	* $attributes->format->tags. When the tag is present (e.g. '2023-10-23T10:00:26.000000Z'),
	* it is converted to a dd_date object via dd_date::get_dd_date_from_timestamp().
	*
	* Returns null in two early-exit cases:
	*   1. get_media_attributes() returns null (ffprobe failed or file not found).
	*   2. The 'creation_time' tag is absent from the container's format tags.
	*
	* This is used by the component_av upload flow to pre-populate the recording-date
	* field from the embedded camera metadata without requiring manual user input.
	*
	* @param string $file - absolute path to the media file
	* @return dd_date|null - dd_date instance representing the creation timestamp, or null
	*/
	public static function get_date_time_original( string $file ) : ?dd_date {

		$attributes = Ffmpeg::get_media_attributes( $file );

		if( !isset($attributes) ){
			return null;
		}

		//check the tags->creation_time
		if( !isset($attributes->format->tags->creation_time) ){
			return null;
		}

		$creation_time	= $attributes->format->tags->creation_time;
		$dd_date		= dd_date::get_dd_date_from_timestamp($creation_time);

		return $dd_date;
	}//end get_date_time_original



	/**
	* GET_MEDIA_STREAMS
	* Retrieve stream-level metadata for all tracks in a media file via ffprobe.
	*
	* Executes `ffprobe -show_streams -print_format json` and returns the decoded object.
	* The result contains a 'streams' array in which each element describes one track
	* (video, audio, subtitle, data, etc.) with fields such as codec_name, codec_type,
	* width, height, avg_frame_rate, sample_rate, and duration.
	*
	* Results are cached per file path in a function-static array for the lifetime of the
	* PHP process. The cache key is the raw $source_file string, so paths with and without
	* a trailing slash would be cached separately. array_key_exists() is used instead of
	* isset() to correctly cache null results (when ffprobe returns empty output).
	*
	* The '2>&1' redirect ensures ffprobe error messages are captured rather than leaked.
	*
	* @param string $source_file - absolute path to the media file (or a 'concat:...' string for DVDs)
	* @return object|null - decoded JSON object with a 'streams' array, or null when ffprobe produces no output
	*/
	public static function get_media_streams( string $source_file ) : ?object {
		$start_time=start_time();

		// cache
		// array_key_exists() is intentional: isset() would bypass cached null values,
		// causing repeated ffprobe calls for files that genuinely return empty output.
			static $media_streams_cache = [];
			$key = $source_file;
			// if (isset($media_streams_cache[$key])) {
			if (array_key_exists($key, $media_streams_cache)) {
				return $media_streams_cache[$key];
			}

		// ffprove_path
			$ffprove_path = Ffmpeg::get_ffprove_installed_path();
			$source_file_esc = escapeshellarg($source_file);

		// exec command
			$command	= escapeshellcmd($ffprove_path) . ' -v quiet -show_streams -print_format json ' . $source_file_esc . ' 2>&1';
			$result		= shell_exec($command);
			$output		= !empty($result)
				? json_decode( $result )
				: null;

		// cache
			$media_streams_cache[$key] = $output;

		// debug
			debug_log(__METHOD__
				. ' media_streams calculation exec time: '.exec_time_unit($start_time).' ms'
				, logger::DEBUG
			);


		return $output;
	}//end get_media_streams



	/**
	* GET_AUDIO_CODEC
	* Resolve and cache the preferred AAC audio encoder available in the installed ffmpeg.
	*
	* Queries `ffmpeg -buildconf` (available since ffmpeg 3.x) for AAC encoder flags in order
	* of preference:
	*   1. 'libfdk_aac'    — Fraunhofer FDK AAC: highest quality, requires explicit compile flag.
	*   2. 'libvo_aacenc'  — VisualOn AAC encoder: removed in ffmpeg 4.0; only present in older builds.
	*   3. 'aac'           — Native ffmpeg AAC: available in all ffmpeg 3+ builds without extra libs.
	*
	* Note on codec flag vs. encoder identifier: the buildconf flag uses a hyphen ('--enable-libfdk-aac'),
	* while the ffmpeg encoder name uses an underscore ('libfdk_aac'). The codec comment
	* 'Note uderscore' (with typo) in the original code refers to this distinction.
	*
	* The resolved name is cached in the static property $audio_codec so that the
	* shell_exec is only invoked once per PHP request lifetime.
	*
	* @return string - codec encoder name: 'libfdk_aac', 'libvo_aacenc', or 'aac'
	*/
	public static function get_audio_codec() : string {

		// cache
			if (!empty(Ffmpeg::$audio_codec)) {
				return Ffmpeg::$audio_codec;
			}

		// ffmpeg_path
			$ffmpeg_path = Ffmpeg::get_ffmpeg_installed_path();

		// FFMPEG AUDIO CODEC TEST
		// '-buildconf' is used rather than '-version' to get the full configure flags list.
		// '-loglevel error' suppresses informational output so only the buildconf lines appear.
		$ffmpeg_info = shell_exec($ffmpeg_path .' -loglevel error -buildconf') ?? '';
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

		// cache fix
			Ffmpeg::$audio_codec = $acodec;

		// debug
			debug_log(__METHOD__
				." Using audio codec from ffmpeginfo" . PHP_EOL
				.' acodec: ' .$acodec . PHP_EOL
				// .' ffmpeg_info: ' . to_string($ffmpeg_info)
				, logger::DEBUG
			);


		return $acodec;
	}//end get_audio_codec



}//end Ffmpeg class
