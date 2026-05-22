<?php
declare(strict_types=1);
/**
 * CLASS Ffmpeg
 * Manages audiovisual processing actions using FFMPEG library.
 *
 * Provides utility methods to interact with ffmpeg and ffprobe command-line tools
 * to perform operations on audio and video media files including:
 * - Querying installed binary paths and version info
 * - Checking codec and library availability (e.g. libx264)
 * - Constructing commands for converting media to alternate qualities and formats
 * - Extracting media attributes, streams, and duration from video or audio files
 * - Generating poster frames at specific timecodes
 * - Cutting fragments/clips of audio and video with optional watermark overlays
 * - Conforming media file headers for web playback (faststart)
 *
 * @package Dedalo
 * @subpackage Core
 */
final class Ffmpeg {



	/**
	 * Array of setting file names in the settings directory (without extension)
	 * @var array $ar_settings
	 */
	static protected array $ar_settings = [];

	/**
	 * Supported video/audio qualities/resolutions in PAL, NTSC, etc.
	 * @var array $ar_supported_quality_settings
	 */
	static protected array $ar_supported_quality_settings = ['1080','720','576','480','404','240','audio'];

	/**
	 * Detected/resolved audio codec string (e.g., 'libfdk_aac', 'aac', etc.)
	 * @var string $audio_codec
	 */
	static protected string $audio_codec = '';



	/**
	 * GET_FFMPEG_INSTALLED_PATH
	 * Get the path to the ffmpeg executable from Dédalo configuration.
	 *
	 * @return string The binary path defined in DEDALO_AV_FFMPEG_PATH.
	 */
	public static function get_ffmpeg_installed_path() : string {

		return DEDALO_AV_FFMPEG_PATH;
	}//end get_ffmpeg_installed_path



	/**
	 * GET_FFPROVE_INSTALLED_PATH
	 * Get the path to the ffprobe executable from Dédalo configuration.
	 *
	 * @return string The binary path defined in DEDALO_AV_FFPROBE_PATH.
	 */
	public static function get_ffprove_installed_path() : string {

		return DEDALO_AV_FFPROBE_PATH;
	}//end get_ffprove_installed_path



	/**
	 * GET_VERSION
	 * Query the ffmpeg binary to get its version string.
	 *
	 * Uses shell_exec to check version information.
	 *
	 * @return string The trimmed ffmpeg version string.
	 */
	public static function get_version() : string {

		$cmd  = Ffmpeg::get_ffmpeg_installed_path();
		$cmd .= ' -version | sed -n "s/ffmpeg version \([-0-9.]*\).*/\1/p;" ';

		$version = trim(shell_exec($cmd) ?? '');

		return $version;
	}//end get_version



	/**
	 * GET_FFPROVE_VERSION
	 * Query the ffprobe binary to get its version string.
	 *
	 * Uses shell_exec to check version information.
	 *
	 * @return string The trimmed ffprobe version string.
	 */
	public static function get_ffprove_version() : string {

		$cmd  = Ffmpeg::get_ffprove_installed_path();
		$cmd .= ' -version | sed -n "s/ffprobe version \([-0-9.]*\).*/\1/p;" ';

		$version = trim(shell_exec($cmd) ?? '');

		return $version;
	}//end get_ffprove_version



	/**
	 * CHECK_LIB
	 * Checks if a specific library/encoder is enabled/configured in the installed ffmpeg version.
	 *
	 * Matches configuration flags like "--enable-libx264" against output of `ffmpeg -version`.
	 *
	 * @param string $name Library/encoder name to check (e.g., 'libx264', 'libfdk-aac').
	 * @return bool True if the library is enabled, false otherwise.
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
	 * Get the path to the qt-faststart executable from Dédalo configuration.
	 *
	 * @return string The binary path defined in DEDALO_AV_FASTSTART_PATH.
	 */
	public static function get_qt_faststart_installed_path() : string {

		return DEDALO_AV_FASTSTART_PATH;
	}//end get_qt_faststart_installed_path



	/**
	 * GET_SETTINGS_PATH
	 * Get the directory path containing ffmpeg conversion settings files.
	 *
	 * @return string The directory path defined in DEDALO_AV_FFMPEG_SETTINGS.
	 */
	public static function get_settings_path() : string {

		return DEDALO_AV_FFMPEG_SETTINGS;
	}//end get_settings_path



	/**
	 * GET_AR_SETTINGS
	 * Get the list of settings file names available in the ffmpeg settings directory.
	 *
	 * Caches results to static protected property `$ar_settings`.
	 * Ignores '.', '..', '.DS_Store', and directories named 'acc'.
	 *
	 * @return array|null Array of settings file names (without extensions), or null on failure.
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
	 * Construct the setting name prefix matching the media parameters.
	 *
	 * Concatenates quality, media standard (pal/ntsc), and aspect ratio (e.g. '16x9')
	 * to locate the correct settings configuration file.
	 *
	 * @param string $file_path Absolute path to the source media file.
	 * @param string $quality Quality string (e.g., '404', '720', 'audio').
	 * @return string Constructed settings name like '404_pal_16x9' or 'audio'.
	 */
	public static function get_setting_name( string $file_path, string $quality ) : string {

		$beats = [$quality];

		// media standard identification (pal|ntsc)
			$media_standard = ( strpos($quality, 'audio')===false )
				? Ffmpeg::get_media_standard($file_path)
				: null;
			if (!empty($media_standard)) {
				$beats[] = $media_standard;
			}

		// aspect_ratio
			$aspect_ratio = ( strpos($quality, 'audio')===false )
				? Ffmpeg::get_aspect_ratio($file_path)
				: null;
			if (!empty($aspect_ratio)) {
				$beats[] = $aspect_ratio;
			}

		$setting = implode('_', $beats);


		return $setting;
	}//end get_setting_name_from_quality



	/**
	 * GET_MEDIA_STANDARD
	 * Resolve the video broadcast standard (PAL / NTSC) based on video frame rate.
	 *
	 * Queries the video stream of the file using ffprobe. Frame rates >= 29 fps
	 * resolve to 'ntsc', while lower frame rates resolve to 'pal'.
	 *
	 * @see Ffmpeg::get_setting_name()
	 * @param string $file_path Absolute path to the source media file.
	 * @return string The resolved media standard ('ntsc' or 'pal').
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
			$fps = 25; // default
			$ref = isset($video_stream) && isset($video_stream->avg_frame_rate)
				? $video_stream->avg_frame_rate
				: (isset($video_stream) && isset($video_stream->r_frame_rate)
					? $video_stream->r_frame_rate
					: null);
			if (!empty($ref)) {
				if (strpos($ref, '/') !== false) {
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
	 * Extract the raw quality code/resolution from a setting name.
	 *
	 * Compares the setting string against `$ar_supported_quality_settings`.
	 *
	 * @param string $setting Setting name (e.g., '404_pal_16x9' or 'audio').
	 * @return string|null Extracted quality string (e.g. '404', 'audio') or null if not matched.
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
	 * Create and write a shell script to generate an alternative audio/video version.
	 *
	 * Parses settings variables (bitrate, scale, codecs, etc.) from Dédalo's ffmpeg setting files,
	 * handles multi-pass video rendering, audio extracting, and qt-faststart optimization.
	 *
	 * @param object $options Options object containing:
	 *                        - string $setting_name Name of the settings file.
	 *                        - string $source_file_path Path to the source file or directory (DVD structures supported).
	 *                        - string $target_file_path Destination path for the converted file.
	 * @return object Standard response object containing:
	 *                - bool $result True on success, false otherwise.
	 *                - string $msg Descriptive message.
	 *                - string $command Generated ffmpeg bash command.
	 *                - string $sh_file Path to the generated shell script file.
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
			try {
				$setting_file_path = DEDALO_AV_FFMPEG_SETTINGS .'/'. $setting_name .'.php';
				require($setting_file_path);
				// sample vars:
				// $vb				= '960k';			# video rate kbs
				// $s				= '720x404';		# scale
				// $g				= 75;				# keyframes interval (gob)
				// $vcodec			= 'libx264';		# default libx264
				// $progresivo		= "-vf yadif";		# desentrelazar
				// $gamma_y			= "0.97";			# correccion de luminancia
				// $gamma_u			= "1.01";			# correccion de B-y
				// $gamma_v			= "0.98";			# correccion de R-y
				// $gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
				// $force			= 'mp4';			# default mp4
				// $ar				= 44100;			# audio sample rate (22050)
				// $ab				= '64k';			# adio rate kbs
				// $ac				= "1";				# numero de canales de audio 2 = stereo, 1 = nomo
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
				//minimum size of the initial vob (512KB)
				$vob_filesize = 512*1000;
				if ($handle = opendir($src_file.'/VIDEO_TS')) {
					 while (false !== ($file = readdir($handle))) {
						$extension = pathinfo($file,PATHINFO_EXTENSION);
						if($extension === 'VOB' && filesize($src_file.'/VIDEO_TS/'.$file) > $vob_filesize){
							$is_all_ok 	= true;
							//reset the size of the vob (for the end files of the video)
							$vob_filesize = 0;
							$vob_files[]= $src_file.'/VIDEO_TS/'.$file;
						}
					 }
					 closedir($handle);
				}
				if($is_all_ok){
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

		if($setting_name==='audio' || $setting_name==='audio_tr') {

			switch (true) {
				case ($source_with_audio===false):
					#
					# SOURCE NOT CONTAINS ANY AUDIO TRACK
					$response->msg .= 'Source does not contains audio';
					return $response;
				case ($setting_name==='audio_tr'):

					$command	.= "nice -n 19 $ffmpeg_path -i $src_file_esc -vn -ar 16000 -ac 1 $target_file_esc ";

					// delete self sh file
					$command	.= "&& rm -f " . $sh_file_esc;
					break;

				case ($setting_name==='audio'):
				default:
					#
					# SOURCE CONTAINS ANY AUDIO TRACK

					# paso 1 extraer el audio
					#$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file_esc -vn -acodec copy $tmp_file_esc ";
					# convert format always
					$command	.= "nice -n 19 $ffmpeg_path -i $src_file_esc -vn -acodec $acodec -ar 44100 -ab 128k -ac 2 $target_file_esc ";
					# fast-start
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
					$command .= "nice -n 19 $ffmpeg_path -i $src_file_esc -vn -acodec $acodec -ar 44100 -ab 128k -ac 2 $target_file_esc ";
					break;

				default:
					#
					# CASE ORIGINAL HAVE AUDIO AND VIDEO OR ONLY VIDEO

					/* EXAMPLE VARS
					$vb				= '960k';			# video rate kbs
					$s				= '720x404';		# scale
					$g				= 75;				# keyframes interval (gob)
					$vcodec			= 'libx264';		# default libx264
					$progresivo		= "-vf yadif";		# desentrelazar
					$gamma_y		= "0.97";			# correccion de luminancia
					$gamma_u		= "1.01";			# correccion de B-y
					$gamma_v		= "0.98";			# correccion de R-y
					$gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
					$force			= 'mp4';			# default mp4
					$ar				= 44100;			# audio sample rate (22050)
					$ab				= '64k';			# adio rate kbs
					$ac				= "1";				# numero de canales de audio 2 = stereo, 1 = nomo
					$acodec			= 'libvo_aacenc';	# default libvo_aacenc
					$target_path 	= "404";			# like '404'
					*/

					// loglevel. Set to 'error' to prevents testunit display ffmpeg logs
					$log_level = '-loglevel error';

					$ar_cmn = [];

					// step 1 only video
					$ar_cmn[] = "nice -n 19 $ffmpeg_path -i $src_file_esc -an -pass 1 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force $log_level -passlogfile $log_file_esc -y /dev/null";

					// step 2 video / audio
					// video
					$av_cm  = "nice -n 19 $ffmpeg_path -i $src_file_esc -pass 2 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force $log_level -passlogfile $log_file_esc -y ";
					// audio
					$av_cm .= "-acodec $acodec -ar $ar -ab $ab -ac $ac -y $tmp_file_esc";
					// add
					$ar_cmn[] = $av_cm;

					// fast-start
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
	 * Locate the primary video stream object from an array of media streams.
	 *
	 * Evaluates streams by codec type ('video') and falls back to matching
	 * video-centric codec names (e.g. starting with 'h26') or dimension existence.
	 *
	 * @param array $media_streams Array of stream metadata objects returned by ffprobe.
	 * @return object|null The matched video stream object, or null if none found.
	 */
	public static function find_video_stream( array $media_streams ) : ?object {

		// search by codec_type
			$video_stream = array_find($media_streams, function($el){
				return isset($el->codec_type) && $el->codec_type==='video';
			});

		// search by codec_name
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
	 * Resolve the aspect ratio of the given video source file.
	 *
	 * Extracts width and height from the video stream or parses `display_aspect_ratio`,
	 * mapping the calculated ratio to common standards ('16x9', '4x3', '5x3', '3x2', '5x4').
	 * Uses local caching to avoid duplicate ffprobe calls.
	 *
	 * @param string $source_file Absolute path to the video file.
	 * @return string The resolved aspect ratio string (e.g. '16x9', default).
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
	 * Extract a posterframe image from a video file at a given timecode.
	 *
	 * Runs ffmpeg command synchronously to capture a single frame as a JPEG image,
	 * scaling it according to the requested quality ('original', 'thumbnail', or fallback).
	 *
	 * @param object $options Options object containing:
	 *                        - float|string $timecode Seconds offset for extraction (e.g., 102.369).
	 *                        - string $src_file Path to the source video file.
	 *                        - string $quality Quality type ('original', 'thumbnail', or other).
	 *                        - string $posterframe_filepath Target destination path for the extracted image.
	 * @return bool True if posterframe is generated successfully; false on failure or if it is an audio file.
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
	 * Cut a sub-clip (fragment) of a media file between in and out timecodes.
	 *
	 * Supports optional visual watermark overlay. When watermarked, encodes using
	 * ffmpeg video overlay filter; otherwise, copies stream directly for efficiency.
	 *
	 * @param object $options Options object containing:
	 *                        - string $source_file_path Path to the source video/audio file.
	 *                        - string $target_filename Basename for the output file.
	 *                        - string $fragments_dir_path Destination directory for the fragment.
	 *                        - float $tc_in_secs Start time in seconds.
	 *                        - float $tc_out_secs End time in seconds.
	 *                        - bool $watermark Whether to overlay Dédalo watermark.
	 * @return object Standard response object containing:
	 *                - bool $result True on success, false otherwise.
	 *                - string $msg Result message.
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
				$target_file_path_temp = $fragments_dir_path .'/temp_'. $target_filename;
				$target_file_path_temp_esc = escapeshellarg($target_file_path_temp);

				$command  = "   nice -n 19 $ffmpeg_path -ss $tc_in  -i $source_file_path_esc -t ".$duration_tc." -vcodec copy -acodec copy -y $target_file_path_temp_esc ";
				$command .= "&& nice -n 19 $ffmpeg_path -i $target_file_path_temp_esc -vf \"movie={$watermark_file} [watermark]; [in][watermark] overlay=main_w-overlay_w-10:10 [out]\" -y $target_file_path_esc";

			}else{

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
	 * Relocate the MOOV atom metadata to the beginning of an MP4 container.
	 *
	 * Runs qt-faststart to enable progressive/streamed web playback,
	 * preserving the original file as a temporary backup with '_untouched' suffix.
	 *
	 * @param string $source_file_path Absolute path to the target video file.
	 * @return string|null Output of shell command, or null on failure.
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
	 * Convert an audio file to the target Dédalo default audio format and codec.
	 *
	 * Transcodes the input audio (using configured `$acodec`, 44100 Hz, stereo, 240k)
	 * and optimizes it using qt-faststart.
	 *
	 * @param object $options Options object containing:
	 *                        - string $uploaded_file_path Input audio file path.
	 *                        - string $output_file_path Target output file path.
	 * @return string|null Output of shell command execution, or null on error.
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
	 * Transcode a source video file to the standard Dédalo target resolution (typically 404px height).
	 *
	 * Uses yadif filter to deinterlace and scales to fixed height. Can run asynchronously
	 * in the background (diverting output to /dev/null) or synchronously.
	 *
	 * @param string $source_file Path to the input video file.
	 * @param string $target_file Target path for the transcoded output MP4.
	 * @param bool $async True to execute asynchronously in background (default), false to wait for completion.
	 * @return string|null Output result from shell command, or null.
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

		$heigth = DEDALO_AV_QUALITY_DEFAULT; // 404, 240 ..

		$source_file_esc = escapeshellarg($source_file);
		$target_file_esc = escapeshellarg($target_file);
		$temp_target_file_esc = escapeshellarg($temp_target_file);

		# COMMAND: Full process
		#$command  = "nice $ffmpeg_path -y -i $source_file_esc -vf \"yadif=0:-1:0, scale=720:404:-1\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $target_file_esc ";
		#$command  = "nice $ffmpeg_path -y -i $source_file_esc -vf \"yadif=0:-1:0, scale=720:404:-1\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $temp_target_file_esc ";
		$command  = "nice $ffmpeg_path -y -i $source_file_esc -vf \"yadif=0:-1:0, scale=-2:{$heigth}\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $temp_target_file_esc ";
		$command .= "&& mv $temp_target_file_esc $target_file_esc ";
		# Processed command only fast start
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
	 * Retrieve metadata properties of a media file via ffprobe.
	 *
	 * Executes ffprobe querying format attributes, returning the decoded JSON object.
	 *
	 * @param string $source_file Path to the target media file.
	 * @return object|null Object representing media format metadata, or null on failure.
	 *  JSON mixed file info like:
	 * {
	 * 	"format": {
	 * 		"filename": "/../dedalo/media/av/404/rsc35_rsc167_1.mp4",
	 * 		"nb_streams": 3,
	 * 		"nb_programs": 0,
	 * 		"format_name": "mov,mp4,m4a,3gp,3g2,mj2",
	 * 		"format_long_name": "QuickTime / MOV",
	 * 		"start_time": "0.000000",
	 * 		"duration": "172.339000",
	 * 		"size": "22126087",
	 * 		"bit_rate": "1027095",
	 * 		"probe_score": 100,
	 * 		"tags": {
	 * 			"major_brand": "isom",
	 * 			"minor_version": "512",
	 * 			"compatible_brands": "isomiso2avc1mp41",
	 * 			"encoder": "Lavf59.16.100",
	 * 			"creation_time": "2023-10-23T10:00:26.000000Z"
	 * 		}
	 * 	}
	 * }
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
	 * Query metadata properties of a media file to retrieve its original creation timestamp.
	 *
	 * Extracts creation_time tag using ffprobe and formats it as a dd_date object.
	 *
	 * @param string $file Absolute path to the media file.
	 * @return dd_date|null Resolved dd_date object or null if tag is missing or parsing fails.
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
	 * Retrieve stream-level metadata (tracks) for a given media file via ffprobe.
	 *
	 * Executes ffprobe to list all streams (video, audio, etc.), using caching
	 * to prevent redundant shell invocations for the same path.
	 *
	 * @param string $source_file Path to the media file.
	 * @return object|null Decoded JSON object representing media streams, or null.
	 */
	public static function get_media_streams( string $source_file ) : ?object {
		$start_time=start_time();

		// cache
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
	 * Resolve the preferred supported audio encoder available in the ffmpeg installation.
	 *
	 * Detects presence of 'libfdk_aac' or 'libvo_aacenc' config flags in ffmpeg, falling back to 'aac'.
	 * Caches resolved encoder name to static protected property `$audio_codec`.
	 *
	 * @return string The codec name (e.g. 'libfdk_aac', 'libvo_aacenc', or 'aac').
	 */
	public static function get_audio_codec() : string {

		// cache
			if (!empty(Ffmpeg::$audio_codec)) {
				return Ffmpeg::$audio_codec;
			}

		// ffmpeg_path
			$ffmpeg_path = Ffmpeg::get_ffmpeg_installed_path();

		// FFMPEG AUDIO CODEC TEST
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
