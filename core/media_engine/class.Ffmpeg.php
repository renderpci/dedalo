<?php
// require_once( DEDALO_CONFIG_PATH .'/config.php');
require_once( DEDALO_CORE_PATH . '/common/class.exec_.php');
// require_once( DEDALO_CORE_PATH . '/media_engine/class.PosterFrameObj.php');
/**
* Ffmpeg
*
*/
final class Ffmpeg {



	protected $settings_path	= DEDALO_AV_FFMPEG_SETTINGS ;
	protected $ar_settings		= array();					# array of settings files

	# supported quality's array
	static protected $ar_supported_qualitys = array('1080','720','576','480','404','240','audio');



	public static function get_ffmpeg_installed_path() : string {

		return DEDALO_AV_FFMPEG_PATH;
	}
	public static function get_qt_faststart_installed_path() : string {

		return DEDALO_AV_FASTSTART_PATH;
	}



	/**
	* GET_AR_SETTINGS
	* Array list of setting files inside dir 'ffmpeg_settings'
	* @return array|null $this->ar_settings
	*/
	public function get_ar_settings() : ?array {

		if ($folder_content = opendir( $this->settings_path )) {

			while (false !== ($file_name = readdir($folder_content))) {
				if ($file_name!=='.' && $file_name!=='..' && $file_name!=='.DS_Store' && $file_name!=='acc') {
					$this->ar_settings[] = substr($file_name,0,-4);
				}
			}
			closedir($folder_content);
			return 	$this->ar_settings;
		}

		return null;
	}//end get_ar_settings



	/**
	* GET_SETTING_NAME_FROM_QUALITY
	* Setting name from quality
	*
	* @return string $setting
	*/
	public function get_setting_name_from_quality(AVObj $AVObj, string $quality) : string {

		# CREATE A NEW AVOBJ AS MASTER MEDIA
		$master_media_file_obj = $this->get_master_media_file_obj($AVObj);

		# MEDIA STANDARD (PAL/NTSC)
		$media_standard	= strtolower( $master_media_file_obj->get_media_standard() );

		if($media_standard) {
			$media_standard = '_' . $media_standard ;
		}else{
			$media_standard = '';
		}
		if($quality==='audio') $media_standard = '';

		# ASPECT RATIO (16X9/4X3)
		$aspect_ratio = strtolower($master_media_file_obj->get_aspect_ratio());
		if($aspect_ratio == '4x3' || $aspect_ratio == '16x9') {
			$aspect_ratio = '_' . $aspect_ratio ;
		}else{
			$aspect_ratio = '';
		}

		if($quality==='audio') $aspect_ratio = '';

		$setting = $quality . $media_standard . $aspect_ratio ;

		return $setting;
	}//end get_setting_name_from_quality



	/**
	* GET_QUALITY_FROM_SETTING
	* @return string|null $quality
	*/
	public function get_quality_from_setting(string $setting) : ?string {

		if($setting==='audio') {
			return $setting;
		}

		$ar_quality = self::$ar_supported_qualitys;
		foreach($ar_quality as $quality) {

			$pos = stripos($setting, $quality);
			if($pos!==false) {
				return $quality;
			}
		}

		return null;
	}//end get_quality_from_setting



	/**
	* GET_MASTER_MEDIA_FILE
	* Get master media file for generate alternative version
	* @return string|bool
	*/
	public function get_master_media_file(object $AVObj) {

		$name		= $AVObj->get_name();
		$extension	= $AVObj->get_extension();

		$ar_quality = DEDALO_AV_AR_QUALITY;

		# Recorre el array de calidades de mayor a menor hasta que encuentra una que exista
		foreach($ar_quality as $quality) {

			#$file = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . "/{$quality}/{$name}.{$extension}";

				#
				# Search for every possible file whit this name and unknown extension
				$target_dir = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . "/{$quality}";
				if (is_dir($target_dir)) {

					if ($handle = opendir($target_dir)) {
						while (false !== ($file = readdir($handle))) {

							// note that '.' and '..' is returned even
							if($name == $file && is_dir($target_dir.'/'.$file)){
								$file_path = $target_dir.'/'.$file;
								return $file_path;
							}

							$findme = $name . '.';
							if( strpos($file, $findme)!==false ) {  // && strpos($file, $this->get_target_filename())===false
								$file_path = $target_dir.'/'.$file;
								return $file_path;
							}
						}
						closedir($handle);
					}//end if ($handle = opendir($target_dir)) {
				}

			#if(file_exists($file)) {
			#	return $file;
			#}
		}//end if(is_array($ar_quality)) foreach($ar_quality as $quality) {


		return false;
	}//end get_master_media_file



	/**
	* GET_MASTER_MEDIA_FILE_QUALITY
	* Get master media file quality from file name
	* @param object $AVObj
	* @return string $quality
	*/
	public function get_master_media_file_quality(AVObj $AVObj) : string {

		$master_media_file = $this->get_master_media_file($AVObj);

		$ar			= explode('/',$master_media_file);

		$key		= count($ar)-1;
		$quality	= $ar[$key];


		return $quality;
	}//end get_master_media_file_quality



	/**
	* GET_MASTER_MEDIA_FILE_OBJ
	* Get master media file quality from file name
	* @return AVObj $obj
	*/
	public function get_master_media_file_obj(AVObj $AVObj) : AVObj {

		$reelID						= $AVObj->get_reelID();
		$master_media_file_quality	= $this->get_master_media_file_quality($AVObj);

		$obj = new AVObj($reelID, $master_media_file_quality);

		return $obj;
	}//end get_master_media_file_obj



	/**
	* CREATE ALTERNATE VIDEO OR AUDIO VERSION WITH RECEIVED SETTINGS
	* @param $AVObj
	*	AVObj object
	* @param $setting
	*	ffmpeg_settings to apply like '404_pal_16x9' (in folder /media_engine/class/ffmpeg_settings)
	*
	* @return object $response
	*/
	public function create_av_alternate(AVObj $AVObj, string $setting) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';

		// load ar_settings
			$this->ar_settings = $this->get_ar_settings();

		// verify setting exists
			if( !in_array($setting, $this->ar_settings) ) {
				// die("Error: setting: '$setting' not exits! (create_av_alternate). Please contact with your admin to create");
				$response->msg .= " Error: setting: '$setting' do not exits! (create_av_alternate). Please contact with your admin to create";
				debug_log(__METHOD__.
					" $response->msg"
					, logger::ERROR
				);
				return $response;
			}

		// import vars from settings file
			require_once(DEDALO_AV_FFMPEG_SETTINGS .'/'. $setting .'.php');

		 // sample vars
			// $vb				= '960k';			# video rate kbs
			// $s				= '720x404';		# scale
			// $g				= 75;				# keyframes interval (gob)
			// $vcodec			= 'libx264';		# default libx264

			// $progresivo		= "-vf yadif";		# desentrelazar
			// $gamma_y		= "0.97";			# correccion de luminancia
			// $gamma_u		= "1.01";			# correccion de B-y
			// $gamma_v		= "0.98";			# correccion de R-y
			// $gammma			= "-vf lutyuv=\"u=gammaval($gamma_u):v=gammaval($gamma_v):y=gammaval($gamma_y)\""; # corrección de gamma
			// $force			= 'mp4';			# default mp4

			// $ar				= 44100;			# audio sample rate (22050)
			// $ab				= '64k';			# adio rate kbs
			// $ac				= "1";				# numero de canales de audio 2 = stereo, 1 = nomo
			// $acodec			= 'libvo_aacenc';	# default libvo_aacenc

			// $target_path	= "404";			# like '404'

		// target_path string
			$target_path = strval($target_path);	# definido en los settings (usualmente es la calidad sin el sufijo de sistema, como '1080' para 1080_pal)

		// create final target path
			$pre_target_path	= $AVObj->get_media_path_abs();
			$pre_target_path	= substr($pre_target_path,0,-1);	# remove last /
			$ar_pre_target_path	= explode('/',$pre_target_path);	# explode by /
			$result				= array_pop($ar_pre_target_path); 	# remove last element of array (the quality folder)
			$final_target_path	= implode('/',$ar_pre_target_path).'/'. $target_path ;


		// quality dir exists
			if( !is_dir($final_target_path) ) {
				try{
					$create_dir = @mkdir($final_target_path, 0777);
				}catch(Exception $e) {
					$response->msg .= " Exception Error on create directory";
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. 'exception message: ' . $e->getMessage()
						, logger::ERROR
					);
					return $response;
				}
				if(!$create_dir) {
					$response->msg .= " Error on read or create directory for \"$setting\". Permission denied !";
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. 'final_target_path: ' .$final_target_path
						, logger::ERROR
					);
					return $response;
				}
			}
			// dir set permissions 0777
				$wantedPerms = 0777;
				$actualPerms = fileperms($final_target_path);
				if($actualPerms < $wantedPerms) {
					$chmod = chmod($final_target_path, $wantedPerms);
					if(!$chmod) {
						$response->msg .= "Error on set valid permissions to directory";
						debug_log(__METHOD__
							. " $response->msg " . PHP_EOL
							. 'setting: ' .to_string($setting) . PHP_EOL
							. 'final_target_path: ' .$final_target_path
							, logger::ERROR
						);
						return $response;
					}
				}

		// source file
			$src_file = $this->get_master_media_file($AVObj);


		// If the source file is a directory (DVD folder), change the source file to the .VOB into the DVD folder and set the concat of the .vobs
			if(is_dir($src_file)){
				$is_all_ok = false;
				$vob_files = array();
				if(!is_dir($src_file.'/VIDEO_TS')){
					$response->msg .= " Error: is necessary the DVD structure (VIDEO_TS)";
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. 'setting: ' .to_string($setting) . PHP_EOL
						. 'final_target_path: ' .$final_target_path
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
				}
				if($is_all_ok){
					//$src_file	= 'concat:$(echo '.$src_file.'/VIDEO_TS/*.VOB|tr \  \|)';
					$concat = '';
					foreach ($vob_files as $vob_file) {
						$concat .= $vob_file.'|';
					}
					$src_file = '\'concat:'.$concat.'\'';
				}else{
					$response->msg .= " Error: is necessary the DVD structure (.VOB files)";
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. 'setting: ' .to_string($setting) . PHP_EOL
						. 'src_file: ' .$src_file .PHP_EOL
						. 'vob_files: ' .to_string($vob_files)
						, logger::ERROR
					);
					return $response;
				}
			}// end if source file is directory


		# SOME UTIL VARS
			$target_file	= $final_target_path . '/' .$AVObj->get_name() . '.' . DEDALO_AV_EXTENSION;
			$tmp_folder		= implode('/',$ar_pre_target_path) .'/tmp' ;
			$tmp_file_base	= $tmp_folder . '/tmp_' . time();
			$tmp_file		= $tmp_file_base .'_' . $AVObj->get_name() . '.' . DEDALO_AV_EXTENSION;
			$log_file		= $tmp_file_base .'_' . $AVObj->get_name() . '_log';


			# tmp dir exists
			if( !is_dir($tmp_folder) ) {
				$create_dir = mkdir($tmp_folder, 0777);
				if(!$create_dir) {
					$response->msg .= " Error on read or create directory for \"tmp\" folder. Permission denied !";
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. 'setting: ' .to_string($setting) . PHP_EOL
						. 'tmp_folder: ' .$tmp_folder
						, logger::ERROR
					);
					return $response;
				}
			}

			# tmp dir set permissions 0777
			$wantedPerms = 0777;
			$actualPerms = fileperms($tmp_folder);
			if($actualPerms < $wantedPerms) {
				$chmod = chmod($tmp_folder, $wantedPerms);
				if(!$chmod) {
					// die(" Sorry. Error on set valid permissions to directory for \"tmp\".  ") ;
					$response->msg .= " Error on set valid permissions to directory for \"tmp\" ";
					debug_log(__METHOD__
						. " $response->msg " . PHP_EOL
						. 'setting: ' .to_string($setting) . PHP_EOL
						. 'tmp_folder: '.$tmp_folder . PHP_EOL
						. 'chmod: ' . to_string($chmod)
						, logger::ERROR
					);
					return $response;
				}
			}

		# target quality
			$target_quality	= $this->get_quality_from_setting($setting);
			$prgfile		= $tmp_folder .'/' . $target_quality .'_'. $AVObj->get_name() . '.sh';


		#
		# FFPROBE GET STREAMS INFO
			$media_streams		= self::get_media_streams( $src_file );
			$source_with_video	= false;
			$source_with_audio	= false;
			$streams			= $media_streams->streams ?? [];
			foreach ( $streams as $stream_obj) {
				$codec_type = $stream_obj->codec_type;
				if ($codec_type==='audio') {
					$source_with_audio = true;
				}else if ($codec_type==='video') {
					$source_with_video = true;
				}
			}

		#
		# FFMPEG AUDIO CODEC TEST
		$acodec = self::get_audio_codec();


		# COMMANDS SHELL
		$command	 = '';

		if($setting==='audio') {

			switch (true) {
				case ($source_with_audio===false):
					#
					# SOURCE NOT CONTAINS ANY AUDIO TRACK
					$response->msg .= 'Source does not contains audio';
					return $response;
					break;

				default:
					#
					# SOURCE CONTAINS ANY AUDIO TRACK

					# paso 1 extraer el audio
					#$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -vn -acodec copy $tmp_file ";
					# convert format always
					$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -vn -acodec $acodec -ar 44100 -ab 128k -ac 2 $target_file ";
					# fast-start
					#$command	.= "&& ".DEDALO_AV_FASTSTART_PATH." $tmp_file $target_file ";
					# delete media temp
					#$command	.= "&& rm -f $tmp_file ";
					# delete self sh file
					$command	.= "&& rm -f " . $prgfile;
					break;
			}
		}else{

			switch (true) {

				case ($source_with_video===false):
					#
					# CASE ORIGINAL HAVE ONLY AUDIO
					$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -vn -acodec $acodec -ar 44100 -ab 128k -ac 2 $target_file ";
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
					# paso 1 sólo video
					$command	.= "nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -an -pass 1 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force -passlogfile $log_file -y /dev/null ";

					# paso 2 video
					$command	.= "&& nice -n 19 ".DEDALO_AV_FFMPEG_PATH." -i $src_file -pass 2 -vcodec $vcodec -vb $vb -s $s -g $g $progresivo $gammma -f $force -passlogfile $log_file -y ";

					# paso 2 audio
					$command	.= "-acodec $acodec -ar $ar -ab $ab -ac $ac -y $tmp_file ";

					# fast-start
					$command	.= "&& nice -n 19 ".DEDALO_AV_FASTSTART_PATH." $tmp_file $target_file ";

					# delete media temp
					$command	.= "&& rm -f $tmp_file ";

					# delete log temps (all generated logs files)
					$command	.= "&& rm -f $log_file* ";

					# delete self sh file
					$command	.= "&& rm -f " . $prgfile;
					break;
			}
		}//end if($setting=='audio') {


		// debug
			debug_log(__METHOD__
				." Creating AV version:".PHP_EOL
				.' command: ' . $command
				, logger::DEBUG
			);
		#$av_alternate_command_exc = exec_::exec_command($command);

		// SH FILE
			$fp = fopen($prgfile, "w");
			fwrite($fp, "#!/bin/bash\n");
			fwrite($fp, "$command\n");
			fclose($fp);
			// check the file and permissions
			if(file_exists($prgfile)) {
				chmod($prgfile, 0755);
			}else{
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
			$response->prgfile	= $prgfile;


		return $response;
	}//end create_av_alternate



	/**
	* GET_ASPECT_RATIO
	* @param string $source_file
	* @param string $quality
	* @return string $ratio
	* 	Like '16x9'
	*/
	public function get_aspect_ratio(string $source_file, string $quality) {

		// get streams
		$media_streams = Ffmpeg::get_media_streams( $source_file );
		if (isset($media_streams->streams[0]) && !empty($media_streams->streams[0]->display_aspect_ratio)) {

			// data from media_streams definition

			$aspect_ratio = $media_streams->streams[0]->display_aspect_ratio;
			$beats	= explode(':', $aspect_ratio);

			$aspect	= implode('x', $beats);

		}else{

			// data from size calculation

			if (isset($media_streams->streams[0]) && !empty($media_streams->streams[0]->width) && !empty($media_streams->streams[0]->height)) {

				// from streams
					$width	= (int)$media_streams->streams[0]->width;
					$height	= (int)$media_streams->streams[0]->height;

			}else{

				// retrieves info from reading the header
					$media_header = Ffmpeg::get_media_streams($source_file);
					debug_log(__METHOD__
						. " media_header from get_media_streams result: " . PHP_EOL
						. ' type: ' . gettype($media_header) . PHP_EOL
						. ' value: ' . to_string($media_header)
						, logger::DEBUG
					);

				// size
					$width_default	= 720;
					$height_default	= 404;

					$width = isset($media_header->{$quality}) && isset($media_header->{$quality}['width'])
						? (int)$media_header->{$quality}['width']
						: $width_default;

					$height = isset($media_header->{$quality}) && isset($media_header->{$quality}['height'])
						? (int)$media_header->{$quality}['height']
						: $height_default;

					debug_log(__METHOD__
						. " width/height result: " . PHP_EOL
						. ' width: ' . to_string($width). PHP_EOL
						. ' height: ' . to_string($height)
						, logger::DEBUG
					);
			}

			// aspect_ratio
				$aspect_ratio = 0;
				if($width>0 && $height>0)
				$aspect_ratio = round( ($width / $height), 2);

				switch($aspect_ratio) {

					case '1.33'	: $aspect = '4x3';	break;
					case '1.34'	: $aspect = '4x3';	break;

					case '1.77'	: $aspect = '16x9';	break;
					case '1.78'	: $aspect = '16x9';	break;

					case '1.66'	: $aspect = '5x3';	break;
					case '1.50'	: $aspect = '3x2';	break;
					case '1.25'	: $aspect = '5x4';	break;

					default		: $aspect = '16x9';
				}
		}

		debug_log(__METHOD__
			. " aspect result: " . PHP_EOL
			. ' aspect: ' . to_string($aspect)
			, logger::DEBUG
		);


		return $aspect; // default 16x9
	}//end get_aspect_ratio



	/**
	* CREATE POSTERFRAME
	* @param object $options
	* {
	* 	timecode : float|string like 102.369217 or 10:00:00,
	* 	src_file : string full path to source av file,
	* 	quality : string current quality used like 'original'
	* 	posterframe_path : string full path to target image file
	* }
	*
	* @return bool
	*/
	// public function create_posterframe(AVObj $AVObj, $timecode, ?array $ar_target=null) {
	public function create_posterframe(object $options) : bool {

		// options
			$timecode			= $options->timecode;
			$src_file			= $options->src_file;
			$quality			= $options->quality;
			$posterframe_path	= $options->posterframe_path;

		// aspect_ratio_cmd
			$raw_aspect_ratio	= $this->get_aspect_ratio($src_file, $quality);
			$aspect_ratio		= strtolower($raw_aspect_ratio)==='4x3'
				? '540x404'
				: '720x404'; // default for 16x9
			$aspect_ratio_cmd = '-s ' . $aspect_ratio;

		// timecode
		// We convert the received value to floating number and
		// we round the value to 3 decimal places to pass it to ffmpeg tipo '40.100'
			$timecode = number_format((float)$timecode, 3, '.', '');

		// posterframe directory exists check
			$target_dir = dirname($posterframe_path);
			if( !is_dir($target_dir) ) {
				$create_dir = mkdir($target_dir, 0775, true);
				if(!$create_dir) {
					debug_log(__METHOD__
						.' Error creating directory: ' . PHP_EOL
						.' target_dir: ' . $target_dir
						, logger::ERROR
					);
					return false;
				}
			}

		// commands shell
			// command (use video track only)
			$command = DEDALO_AV_FFMPEG_PATH . " -ss $timecode -i $src_file -y -vframes 1 -f rawvideo -an -vcodec mjpeg $aspect_ratio_cmd $posterframe_path";
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
	* BUILD_FRAGMENT_OLD
	* @return string $file_url
	*/
		// public function build_fragment_OLD(AVObj $AVObj, string $tcin, string $tcout, string $target_filename, int $watermark=0) : string {

		// 	$ffmpeg_installed_path	= DEDALO_AV_FFMPEG_PATH;
		// 	$reelID					= $AVObj->get_reelID();
		// 	$source_file			= $AVObj->get_media_path_abs() . $reelID .'.'. $AVObj->get_extension();
		// 	$target_filename_path	= $AVObj->get_media_path_abs() . 'fragments/' . $target_filename;

		// 	$tcin_secs	= OptimizeTC::TC2seg($tcin);
		// 	$tcout_secs	= OptimizeTC::TC2seg($tcout);
		// 	$duration	= $tcout_secs - $tcin_secs;
		// 	# duration is float like 538.521 and need to be converted to tc like 00:06:53.734
		// 	$duration	= OptimizeTC::seg2tc($duration);

		// 	debug_log(__METHOD__." ++ build_fragment duration ".$duration, logger::WARNING);

		// 	$watermark_file = DEDALO_AV_WATERMARK_FILE;

		// 		# fragments dir exists
		// 		$fragments_folder = $AVObj->get_media_path_abs() . 'fragments';
		// 		if( !is_dir($fragments_folder) ) {
		// 			$create_dir = mkdir($fragments_folder, 0777);
		// 			if(!$create_dir) {
		// 				if(SHOW_DEBUG===true) {
		// 					debug_log(__METHOD__." Error trying to create: $fragments_folder ".to_string(), logger::ERROR);
		// 				}
		// 				throw new Exception("Error on read or create directory for \"fragments\" folder. Permission denied ! ", 1);
		// 			}
		// 		}

		// 		# fragments dir set permissions 0777
		// 		$wantedPerms = 0777;
		// 		$actualPerms = fileperms($fragments_folder);
		// 		if($actualPerms < $wantedPerms) {
		// 			$chmod = chmod($fragments_folder, $wantedPerms);
		// 			if(!$chmod) die(" Sorry. Error on set valid permissions to directory for \"fragments\".  ") ;
		// 		}

		// 	if ($watermark==1) {

		// 		$target_filename_path_temp = $AVObj->get_media_path_abs() .'fragments/temp_'. $target_filename;

		// 		#$command = "nice -n 19 $ffmpeg_installed_path -i $source_file -ss $tcin -t $duration -vcodec copy -acodec copy -y $target_filename_path_temp";
		// 		$command  = "nice -n 19 $ffmpeg_installed_path -ss $tcin  -i $source_file -t ".$duration." -vcodec copy -acodec copy -y $target_filename_path_temp";

		// 		$command .= " && nice -n 19 $ffmpeg_installed_path -i $target_filename_path_temp -vf 'movie=$watermark_file [watermark]; [in][watermark] overlay=main_w-overlay_w-10:10 [out]' -y $target_filename_path";

		// 		# EXEC COMMAND
		// 		#$command_exc = Exec::exec_command($command);
		// 		$command_exc = shell_exec( $command );

		// 	}else{

		// 		# nice -n 19
		// 		#$command = "$ffmpeg_installed_path -i $source_file -ss $tcin -t $duration -vcodec copy -acodec copy -y $target_filename_path";
		// 		$command = "$ffmpeg_installed_path -ss $tcin -i $source_file -t ".$duration." -vcodec copy -acodec copy -y $target_filename_path";

		// 		# EXEC COMMAND
		// 		$command_exc = exec_::exec_command($command);

		// 		error_log($command);
		// 	}

		// 	$file_url = 'http://' . $_SERVER['HTTP_HOST'] . $AVObj->get_media_path() .'fragments/'. $target_filename;

		// 	return $file_url;
		// }//end build_fragment



	/**
	* BUILD_FRAGMENT
	* Process a av fragment based on given time codes in and out
	* @param object $options
	* @return object $response
	*/
	public static function build_fragment(object $options) : object {

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
			$fragments_dir_path = rtrim($fragments_dir_path, '/');
			if (!is_dir($fragments_dir_path)) {
				debug_log(__METHOD__.
					" fragments directory do not exists. Trying to create a new one in: " .PHP_EOL
					. to_string($fragments_dir_path)
					, logger::WARNING
				);
				if(!mkdir($fragments_dir_path, 0755)) {
					$response->msg .= " Error trying to create fragments_dir ";
					debug_log(__METHOD__
						." $response->msg " .PHP_EOL
						.to_string($fragments_dir_path)
						, logger::ERROR
					);
					return $response;
				}
			}

		// target_file_path
			$target_file_path = $fragments_dir_path . '/' . $target_filename;

		// ffmpeg bin path
			$ffmpeg_bin = DEDALO_AV_FFMPEG_PATH;

		// debug
			debug_log(__METHOD__
				." Building fragment '$target_filename'. Duration secs: ".$duration_secs
				, logger::WARNING
			);

		// command
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

				$command  = "   nice -n 19 $ffmpeg_bin -ss $tc_in  -i $source_file_path -t ".$duration_tc." -vcodec copy -acodec copy -y $target_file_path_temp ";
				$command .= "&& nice -n 19 $ffmpeg_bin -i $target_file_path_temp -vf 'movie=$watermark_file [watermark]; [in][watermark] overlay=main_w-overlay_w-10:10 [out]' -y $target_file_path";

			}else{

				$command = "$ffmpeg_bin -ss $tc_in -i $source_file_path -t ".$duration_tc." -vcodec copy -acodec copy -y $target_file_path";
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
	* @return string|null
	*/
	public function conform_header(AVObj $AVObj) : ?string {

		$result = null;

		$ffmpeg_installed_path 			= DEDALO_AV_FFMPEG_PATH;
		$qt_faststart_installed_path 	= DEDALO_AV_FASTSTART_PATH;

		//$AVObj->get_media_path_abs()	.
		$file_path 			= $AVObj->get_name() . '.' . $AVObj->get_extension();	//$AVObj->get_local_full_path();
		$file_path_temp 	= $AVObj->get_name() . '_temp.' . $AVObj->get_extension();;	//str_replace('.mp4', '_.mp4', $file_path);
		$file_path_original = $AVObj->get_name() . '_untouched.' . $AVObj->get_extension();;	//str_replace('.mp4', '_.mp4', $file_path);

		$source_file_path = $AVObj->get_local_full_path();

		$path_parts 	  = pathinfo($source_file_path);
		$target_file_path = $path_parts['dirname'].'/'.$path_parts['filename'].'.'.$path_parts['extension'];

		$command  = '';

		$command .= "cd ".$AVObj->get_media_path_abs()." ";

		# Copy file
		$command .= "&& $ffmpeg_installed_path -i $file_path -c:v copy -c:a copy $file_path_temp ";	# && rm -f $file_path && mv $file_path_temp $file_path # -y

		# Rename original to preserve the original file untouched
		$command .= "&& mv $file_path $file_path_original ";

		# Rename new file as source
		#$command .= "&& mv $file_path_temp $file_path ";

		# faststart (build final file)
		$command .= "&& $qt_faststart_installed_path $file_path_temp $target_file_path ";

		# Remove temp file
		$command .= "&& rm -f $file_path_temp ";


		try {

			$result = shell_exec( $command );

		} catch (Exception $e) {
			echo 'Caught exception: ',  $e->getMessage(), "\n";
			if(SHOW_DEBUG===true) {
				dump($e->getMessage(), " EXCEPTION ".to_string());
			}
		}

		#$conform_header_command_exc = Exec::exec_command($command);

		if(SHOW_DEBUG===true) {
			debug_log(__METHOD__." Exec command conform headers:".PHP_EOL.
				" sudo -u _www $command .".to_string($result),
				logger::DEBUG
			);
		}

		return $result;
	}//end conform_header



	/**
	* CONVERT_AUDIO
	* Transform audio file to default codec
	* @param object $options
	* @return string|false|null $result
	* 	A string containing the output from the executed command, false if the pipe cannot be established
	* 	or null if an error occurs or the command produces no output.
	*/
	// public function convert_audio(AVObj $AVObj, string $uploaded_file_path) : ?string {
	public static function convert_audio( object $options ) : ?string {

		// options
			$output_file_path	= $options->output_file_path;
			$uploaded_file_path	= $options->uploaded_file_path;

		// short vars
			$ffmpeg_installed_path			= DEDALO_AV_FFMPEG_PATH;
			$qt_faststart_installed_path	= DEDALO_AV_FASTSTART_PATH;

		// command
			$command  = '';

			// ffmpeg -i INPUT_FILE.EXT -aq 500 -acodec libfaac -map_meta_data OUTPUT_FILE.EXT:INPUT_FILE.EXT OUTPUT_FILE.EXT
			// ffmpeg -i INPUT_FILE.EXT -aq 70 -acodec libfaac -map_meta_data OUTPUT_FILE.EXT:INPUT_FILE.EXT OUTPUT_FILE.EXT
			// ffmpeg -i input.wav -c:a libfdk_aac -b:a 128k output.m4a
			// ffmpeg -i input.wav -strict experimental -c:a aac -b:a 240k output.m4a

			// ffmpeg audio codec test
			$acodec = self::get_audio_codec();

			// convert file
			$command .= "$ffmpeg_installed_path -i $uploaded_file_path -acodec $acodec -ar 44100 -ab 240k -ac 2 $output_file_path ";

			// faststart
			$command .= "&& $qt_faststart_installed_path $output_file_path $output_file_path ";

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
	* Trans-code any media to dedalo standard quality (usually 404)
	* Not return nothing, open terminal process and send result to /dev/null
	* @return string|false|null $result
	*/
	public static function convert_to_dedalo_av( string $source_file, string $target_file, bool $async=true ) : ?string {

		$ffmpeg_path		= DEDALO_AV_FFMPEG_PATH;
		$qt_faststart_path	= DEDALO_AV_FASTSTART_PATH;

		#
		# FFMPEG AUDIO CODEC TEST
		$acodec = self::get_audio_codec();

		$path_parts			= pathinfo($target_file);
		$temp_target_file	= $path_parts['dirname'] .'/'. $path_parts['filename'] .'_temp.' . $path_parts['extension'];

		$heigth = DEDALO_AV_QUALITY_DEFAULT; // 404, 240 ..

		# COMMAND: Full process
		#$command  = "nice $ffmpeg_path -y -i $source_file -vf \"yadif=0:-1:0, scale=720:404:-1\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $target_file ";
		#$command  = "nice $ffmpeg_path -y -i $source_file -vf \"yadif=0:-1:0, scale=720:404:-1\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $temp_target_file ";
		$command  = "nice $ffmpeg_path -y -i $source_file -vf \"yadif=0:-1:0, scale=-2:{$heigth}\" -vb 960k -g 75 -f mp4 -vcodec libx264 -acodec $acodec -ar 44100 -ab 128k -ac 2 -movflags faststart $temp_target_file ";
		$command .= "&& mv $temp_target_file $target_file ";
		# Processed command only fast start
		#$command = "nice $qt_faststart_path $source_file $target_file";

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
	* @return object|null $output
	* 	JSON mixed file info like:
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
	* 			"encoder": "Lavf59.16.100"
	* 		}
	* 	}
	* }
	*/
	public static function get_media_attributes( string $source_file ) : ?object {

		$command = DEDALO_AV_FFPROBE_PATH . ' -v quiet -print_format json -show_format ' . $source_file . ' 2>&1';
		$output  = json_decode( shell_exec($command) );

		return $output;
	}//end get_media_attributes



	/**
	* GET_MEDIA_STREAMS
	* @param string $source_file
	* @return object|null $output
	*/
	public static function get_media_streams( string $source_file ) : ?object {

		$command = DEDALO_AV_FFPROBE_PATH . ' -v quiet -show_streams -print_format json ' . $source_file . ' 2>&1';
		$output  = json_decode( shell_exec($command) );

		return $output;
	}//end get_media_streams



	/**
	* GET_AUDIO_CODEC
	* @return string $acodec
	*/
	public static function get_audio_codec() : string {


		// FFMPEG AUDIO CODEC TEST
		$ffmpeg_info = shell_exec(DEDALO_AV_FFMPEG_PATH .' -buildconf');
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

		// debug
			debug_log(__METHOD__
				." Using audio codec $acodec from ffmpeginfo : ".to_string($ffmpeg_info)
				, logger::DEBUG
			);


		return $acodec;
	}//end get_audio_codec



}//end Ffmpeg class
