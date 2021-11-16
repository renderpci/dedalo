<?php
/**
* SYSTEM TEST
* Verify the integrity of the system (usually in the boot or login sequence)
* Checks the existence of elements / directories / permissions necessary to execute Dédalo
*/



// RESPONSE
	$init_response = new stdClass();
		$init_response->result		= false;
		$init_response->msg			= 'Error on init test '.PHP_EOL;
		$init_response->warnings	= [];

// PHP VERSION
	if (version_compare(PHP_VERSION, '5.4.15', '<')) {

		$init_response->msg .= trim(" Error. This PHP version ".PHP_VERSION." is not supported by Dédalo");
		return $init_response;
	}


// MBSTRING
	if (!function_exists('mb_internal_encoding')) {
		$init_response->msg .= trim(" Error. mb_internal_encoding is required by Dédalo. Please install PHP mbstring to continue");
		return $init_response;
	}


// BACKUPS
	# Target folder exists test
	$folder_path = DEDALO_LIB_BASE_PATH.'/backup/backups';
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700,true)) {
			$init_response->msg .= trim(" Error on read or create backups directory. Permission denied. Please review your backup dir permissions");
			return $init_response;
		}
		$msg = "backups: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}


// BACKUPS_STRUCTURE
	# Target folder exists test
	$folder_path = DEDALO_LIB_BASE_PATH.'/backup/backups_structure';
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700,true)) {
			$init_response->msg .= trim(" Error on read or create backups_structure directory. Permission denied. Please review your backup dir permissions");
			return $init_response;
		}
		$msg = "backups: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}


// BACKUP_TEMP
	# Target folder exists test
	$folder_path = DEDALO_LIB_BASE_PATH.'/backup/temp';
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700,true)) {
			$init_response->msg .= trim(" Error on read or create backup temp directory. Permission denied. Please review your backup dir permissions");
			return $init_response;
		}
		$msg = "backups: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}


// BACKUP USERS DIR
	# Target folder exists test
	$folder_path = DEDALO_LIB_BASE_PATH.'/backup/users';
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700,true)) {
			$init_response->msg .= trim(" Error on read or create backup users directory. Permission denied. Please review your backup dir permissions");
			return $init_response;
		}
		$msg = "backups: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}


// BACKUP_TEMP
	# Target folder exists test
	if (defined('STRUCTURE_DOWNLOAD_DIR') && STRUCTURE_DOWNLOAD_DIR!==false) {
		$folder_path = STRUCTURE_DOWNLOAD_DIR;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0700,true)) {
				$init_response->msg .= trim(" Error on read or create backup ".STRUCTURE_DOWNLOAD_DIR." directory. Permission denied. Please review your structure download dir dir permissions. Config value: ".STRUCTURE_DOWNLOAD_DIR);
				return $init_response;
			}
			$msg = "backups: created dir: $folder_path";
			$init_response->warnings[] = $msg;
			debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
		}
	}


// DEDALO_PREFIX_TIPOS
	# Maintain consistency on defined DEDALO_PREFIX_TIPOS and extras folder dirs
	$DEDALO_PREFIX_TIPOS = (array)unserialize(DEDALO_PREFIX_TIPOS);
	foreach ($DEDALO_PREFIX_TIPOS as $current_tipo) {
		$folder_path = DEDALO_EXTRAS_PATH . '/' . $current_tipo;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0700,true)) {
				$init_response->msg .= trim(" Error on read or create extras directory ($current_tipo). Permission denied. Please review your DEDALO_EXTRAS_PATH dir permissions. Config value: ".DEDALO_EXTRAS_PATH);
				return $init_response;
			}
			$msg = "extras: created dir: $folder_path";
			$init_response->warnings[] = $msg;
			debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
		}
	}


// MEDIA folder
	# Target folder exists test
	$folder_path = DEDALO_MEDIA_BASE_PATH;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775,true)) {
			$init_response->msg .= trim(" Error on read or create media directory. Permission denied. Please review your DEDALO_MEDIA_BASE_PATH dir permissions. Config value: ".DEDALO_MEDIA_BASE_PATH);
			debug_log(__METHOD__." $init_response->msg . ".$folder_path , logger::ERROR);
			trigger_error($init_response->msg);
			return $init_response;
		}
		$msg = "media: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}


// MEDIA QUALITY FOLDERS (Important for FFMPEG conversions)
	$ar_folder = (array)unserialize(DEDALO_AV_AR_QUALITY);
	foreach ($ar_folder as $quality) {
		$folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER.'/'.$quality;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0775,true)) {
				$init_response->msg .= trim(" Error on read or create media quality [$quality] directory. Permission denied. Please review your folder_path dir permissions of ".$folder_path);
				trigger_error($init_response->msg);
				return $init_response;
			}
			$msg = "media quality folders: created dir: $folder_path";
			$init_response->warnings[] = $msg;
			debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
		}
	}


// MEDIA AV POSTERFRAME
	/*
	# Target folder exists test
	$folder_path = DEDALO_MEDIA_BASE_PATH .'/'. DEDALO_AV_FOLDER . '/posterframe/deleted';
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0777,true)) {
			$init_response->msg .= trim(" Error on read or create media posterframe deleted directory. Permission denied ");
		}
	}
	*/


// MEDIA IMAGE
	# Target folder exists test
	$ar_quality = (array)unserialize(DEDALO_IMAGE_AR_QUALITY);
	foreach ($ar_quality as $quality) {
		$folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER . '/'.$quality;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0775,true)) {
				$init_response->msg .= trim(" Error on read or create image $quality deleted directory. Permission denied. Please review your folder_path dir permissions of ".$folder_path);
				return $init_response;
			}
			$msg = "media image: created dir: $folder_path";
			$init_response->warnings[] = $msg;
			debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
		}
	}


// MEDIA PDF folder
	# Target folder exists test
	if(defined('DEDALO_PDF_FOLDER')) {
	$folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_PDF_FOLDER.'/'.DEDALO_PDF_QUALITY_DEFAULT;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775,true)) {
			$init_response->msg .= trim(" Error on read or create media PDF default directory. Permission denied. Please review your folder_path dir permissions of ".$folder_path);
			return $init_response;
		}
		$msg = "media pdf: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}}


// MEDIA PDF THUMBS folder
	# Target folder exists test
	if(defined('DEDALO_PDF_THUMB_DEFAULT')) {
	$folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_PDF_FOLDER.'/'.DEDALO_PDF_THUMB_DEFAULT;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775,true)) {
			$init_response->msg .= trim(" Error on read or create media PDF default directory. Permission denied. Please review your folder_path dir permissions of ".$folder_path);
			return $init_response;
		}
		$msg = "media pdf thumbs: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}}


// MEDIA HTML FILES folder
	# Target folder exists test
	if(defined('DEDALO_HTML_FILES_FOLDER')) {
	$folder_path = DEDALO_MEDIA_BASE_PATH.DEDALO_HTML_FILES_FOLDER;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775,true)) {
			$init_response->msg .= trim(" Error on read or create media DEDALO_HTML_FILES_FOLDER default directory. Permission denied. Please review your folder_path dir permissions of ".$folder_path);
			return $init_response;
		}
		$msg = "media html files: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}}


// MEDIA WEB IMAGES folder
	# Target folder exists test
	if(defined('DEDALO_IMAGE_WEB_FOLDER')) {
	$folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_IMAGE_FOLDER . DEDALO_IMAGE_WEB_FOLDER;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775,true)) {
			$init_response->msg .= trim(" Error on read or create media DEDALO_IMAGE_WEB_FOLDER default directory. Permission denied. Please review your folder_path dir permissions of ".$folder_path);
			return $init_response;
		}
		$msg = "media web images files: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}}


// MEDIA EXPORT folder
	# Target folder exists test
	if(defined('DEDALO_TOOL_EXPORT_FOLDER_PATH')) {
	$folder_path = DEDALO_TOOL_EXPORT_FOLDER_PATH;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775,true)) {
			$init_response->msg .= trim(" Error on read or create media DEDALO_TOOL_EXPORT_FOLDER_PATH default directory. Permission denied. Please review your folder_path dir permissions of ".$folder_path);
			return $init_response;
		}
		$msg = "media export folder: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}}


// MEDIA AV
	# Target folder exists test
	$ar_quality = (array)unserialize(DEDALO_AV_AR_QUALITY);
	foreach ($ar_quality as $quality) {
		$folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_AV_FOLDER . '/'.$quality;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0775,true)) {
				$init_response->msg .= trim(" Error on read or create image $quality directory. Permission denied. Please review your folder_path dir permissions of ".$folder_path);
				return $init_response;
			}
			$msg = "media av folder: created dir: $folder_path";
			$init_response->warnings[] = $msg;
			debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
		}
	}


// MEDIA SVG
	# Target folder exists test
	$folder_path = DEDALO_MEDIA_BASE_PATH . DEDALO_SVG_FOLDER ;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775,true)) {
			$init_response->msg .= trim(" Error on read or create avg directory. Permission denied. Please review your folder_path dir permissions of ".$folder_path);
			return $init_response;
		}
		$msg = "media svg folder: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}


// MEDIA PROTECTION
	# Target folder exists test
	if(defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) {
		/*
		# Test .htaccess file
		$htaccess_file = DEDALO_MEDIA_BASE_PATH . '/.htaccess';
		if (!file_exists($htaccess_file)) {
			$init_response->msg .= trim(" Error on read protect file for av directory. File '.htaccess' not found");
		}
		*/
	}


// LOGS FOLDER
	# Target folder exists test
	$folder_path = DEDALO_LOGS_DIR;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0777,true)) {
			$init_response->msg .= trim(" Error on read or create logs directory. Permission denied. Please review your folder_path dir permissions of ".$folder_path);
			return $init_response;
		}
		$msg = "logs folder: created dir: $folder_path";
		$init_response->warnings[] = $msg;
		debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
	}


// PSQL (Agus problem)
	if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
		// nothing to do
	}else{
		$path = DB_BIN_PATH . 'psql';
		$psql = trim(shell_exec('command -v '. $path));
		if (empty($psql)) {
			$init_response->msg .= trim('psql not found at: '.$path . PHP_EOL . ' Review your POSTGRES installation or your db config file');
			return $init_response;
		}
	}


// PGPASS FILE
	$php_user_home 	= getenv("HOME"); //$_SERVER['HOME'];
	$path 			= $php_user_home . '/.pgpass';
	if (!file_exists($path )) {
		$init_response->msg .= trim('File .pgpass not found at: '.$path . PHP_EOL . ' Check your .pgpass file into PHP user home dir');
		debug_log(__METHOD__. $init_response->msg, logger::ERROR);
		trigger_error($init_response->msg);
		$init_response->warnings[] = $init_response->msg;
		#return $init_response;
	}else{
		$file_permissions = substr(sprintf('%o', fileperms($path)), -4);
		if ($file_permissions!=='0600') {
			// Try to change it
				if(false===chmod($path, 0600)){
					$init_response->msg .= trim('File .pgpass permissions is : '.$file_permissions . PHP_EOL . ' Unable to automatic set. Check manually your .pgpass file permissions and set to: 0600');
					debug_log(__METHOD__. $init_response->msg, logger::ERROR);
					trigger_error($init_response->msg);
					$init_response->warnings[] = $init_response->msg;
					#return $init_response;
				}else{
					$init_response->msg .= " Changed permissions of file .pgpass to 0600 ";
					debug_log(__METHOD__." $init_response->msg ".to_string(), logger::ERROR);
					trigger_error($init_response->msg);
					$init_response->warnings[] = $init_response->msg;
				}
		}
	}



// IMAGE MAGICK
	#exec(MAGICK_PATH. "convert -version", $out, $rcode); // Try to get ImageMagick "convert" program version number.
	#if ($rcode!==0) $init_response->msg .= trim("Error on system test. ImageMagick lib not found");
	$image_magick = trim(shell_exec('command -v '.MAGICK_PATH.'convert'));
	if (empty($image_magick)) {
		$init_response->msg .= trim("Error on system test. ImageMagick lib not found in ".MAGICK_PATH. '. Please review your config file MAGICK_PATH value');
		return $init_response;
	}


// FFMPEG
	$ffmpeg = trim(shell_exec('command -v '.DEDALO_AV_FFMPEG_PATH));
	if (empty($ffmpeg)) {
		$init_response->msg .= trim("Error on system test. ffmpeg lib not found in ".DEDALO_AV_FFMPEG_PATH. '. Please review your config file DEDALO_AV_FFMPEG_PATH value');
		return $init_response;
	}


// QT-FASTSTART
	$qt_faststart = trim(shell_exec('command -v '.DEDALO_AV_FASTSTART_PATH));
	if (empty($qt_faststart)) {
		$init_response->msg .= trim("Error on system test. qt-faststart lib not found in ".DEDALO_AV_FASTSTART_PATH. '. Please review your config file DEDALO_AV_FASTSTART_PATH value');
		return $init_response;
	}


// FFPROBE
	$ffprobe = trim(shell_exec('command -v '.DEDALO_AV_FFPROBE_PATH));
	if (empty($ffprobe)) {
		$init_response->msg .= trim("Error on system test. ffprobe lib not found in ".DEDALO_AV_FFPROBE_PATH. '. Please review your config file DEDALO_AV_FFPROBE_PATH value');
		return $init_response;
	}


// NODE
	if (defined('DEDALO_NOTIFICATIONS') && DEDALO_NOTIFICATIONS===true) {
		$node = trim(shell_exec('command -v '.DEDALO_NODEJS));
		if (empty($node)) {
			$init_response->msg .= trim("Error on system test. node lib not found in ".DEDALO_AV_FFPROBE_PATH. '. Please review your config file DEDALO_AV_FFPROBE_PATH value');
			return $init_response;
		}
		/*
		$pm2 = trim(shell_exec('command -v '.DEDALO_NODEJS_PM2));
		if (empty($pm2)) {
			$init_response->msg .= trim("Error on system test. npm pm2 lib not found");
		}
		# pm2 start server.js --name "dd_node_"DEDALO_ENTITY --watch
		#$pm2_test = trim(shell_exec(DEDALO_NODEJS_PM2.' describe dd_node_'.DEDALO_ENTITY));
		#error_log($pm2_test);
		#error_log( DEDALO_NODEJS_PM2.' describe dd_node_'.DEDALO_ENTITY );
		*/
	}


// DEFAULT PROJECT
	if (!defined('DEDALO_DEFAULT_PROJECT') || !defined('DEDALO_FILTER_SECTION_TIPO_DEFAULT')) {
	    #$init_response->msg .= trim("Error Processing Request. Please define DEDALO_DEFAULT_PROJECT");
	    $init_response->msg .= trim("Error Processing Request. Please define congif DEDALO_DEFAULT_PROJECT and DEDALO_FILTER_SECTION_TIPO_DEFAULT");
	    return $init_response;
	}


// CURL
	if(!function_exists('curl_init') || !function_exists('curl_version')) {
		$init_response->msg .= trim("Error Processing Request. Curl: function 'curl_init' not found. Please review your PHP cofiguration");
		return $init_response;
	}


// LOCK COMPONENTS
	if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
		lock_components::clean_locks_garbage();
	}


// Test mcrypt lib
	# Change it to Open SSL in 4.0.22
	#if (!function_exists('mcrypt_encrypt')) {
	#	$init_response->msg .= trim("Error Processing Request: MCRYPT lib is not available");
	#}


// Test openSSL lib
	if (!function_exists('openssl_encrypt')) {
		$init_response->msg .= trim("Error Processing Request: OPEN_SSL lib is not available");
		return $init_response;
	}


// entity code name test
	function isValidName($str) {
		$safe_name = preg_replace( '/[^a-z0-9_]+/', '***', $str);
		if ($safe_name!==$str) {
			return false;
		}
		return true;
	}
	$entity_code = DEDALO_ENTITY;
	if( !isValidName($entity_code) ) {
		$init_response->msg .= trim("Error Processing Request: DEDALO_ENTITY config value its not a safe name ($entity_code). Please, use here a-z values without spaces or comas like 'numisdata' ");
		return $init_response;
	}


#// LANGS JS (moved to login.php !)
#	# Generate js files with all labels (in not exist current lang file)
#	$folder_path = DEDALO_LIB_BASE_PATH.'/common/js/lang';
#	if( !is_dir($folder_path) ) {
#		if(!mkdir($folder_path, 0777,true)) {
#			$init_response->msg .= trim(" Error on read or create js/lang directory. Permission denied");
#			return $init_response;
#		}
#		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::WARNING);
#	}
#	$ar_langs 	 = (array)unserialize(DEDALO_APPLICATION_LANGS);
#	foreach ($ar_langs as $lang => $label) {
#		$label_path  = '/common/js/lang/' . $lang . '.js';
#		if (!file_exists(DEDALO_LIB_BASE_PATH.$label_path)) {
#			$ar_label = label::get_ar_label($lang); // Get all properties
#				#dump($ar_label, ' ar_label');
#
#			file_put_contents( DEDALO_LIB_BASE_PATH.$label_path, 'const get_label='.json_encode($ar_label,JSON_UNESCAPED_UNICODE).'');
#			debug_log(__METHOD__." Generated js labels file for lang: $lang - $label_path ".to_string(), logger::WARNING);
#		}
#	}


#// STRUCTURE CSS (moved to login.php !)
#	# Generate css structure file (in not exist)
#	$file_path = DEDALO_LIB_BASE_PATH.'/common/css/structure.css';
#	if (!file_exists($file_path)) {
#
#		$response = (object)css::build_structure_css();
#		debug_log(__METHOD__." Generated structure css file: ".$response->msg, logger::WARNING);
#	}
#
#
#// SEQUENCES TEST
#	require(DEDALO_LIB_BASE_PATH.'/db/class.data_check.php');
#	$data_check = new data_check();
#	$response 	= $data_check->check_sequences();
#	if ($response->result!=true) {
#		debug_log(__METHOD__." $response->msg ".to_string(), logger::WARNING);
#		if(isset($_SESSION['dedalo4']['auth']['user_id']) && $_SESSION['dedalo4']['auth']['user_id']==DEDALO_SUPERUSER) {
#			$init_response->msg .= trim("Error on ".$response->msg);
#			return $init_response;
#		}
#	}


// ALL IS OK
	$init_response->result 	= true;
	$init_response->msg 	= 'OK. init test done';

