<?php
# SYSTEM TEST
# Verify the integrity of the system (usually in the boot sequence or login)
# Checks for the existence of items / directories / permissions needed to run Dédalo


// default values
	$create_dir_permissions = 0750;
	$php_user = exec('whoami');



// user_id fix if not already defined
	if (!isset($user_id)) {
		$user_id = logged_user_id() ?? null;
	}



// RESPONSE
	$init_response = new stdClass();
		$init_response->result			= false;
		$init_response->msg				= []; // 'Error on init test'
		$init_response->errors			= false;
		$init_response->result_options	= null;



// PHP VERSION
	$minimum = '8.1.0';
	if (test_php_version_supported()===false) {

		$init_response->msg[]	= 'Error. This php version '.PHP_VERSION.' is not supported by Dédalo. Update PHP to '.$minimum.' or higher ASAP';
		$init_response->errors	= true;
		debug_log(__METHOD__
			.' '.implode(PHP_EOL, $init_response->msg). PHP_EOL
			.' test_php_version_supported: ' . to_string( test_php_version_supported() ) . PHP_EOL
			.' PHP_VERSION: ' . PHP_VERSION . PHP_EOL
			.' minimum: ' . $minimum
			, logger::ERROR
		);

		return $init_response;
	}



// MBSTRING
	if (!function_exists('mb_internal_encoding')) {

		$init_response->msg[]	= 'Error. mb_internal_encoding is required by Dédalo. Please install php mbstring to continue';
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg)
			, logger::ERROR
		);

		return $init_response;
	}



// SESSIONS
	if (defined('DEDALO_SESSIONS_PATH')) {
		// verify directory already exists
		if( !check_sessions_directory() ){
			die("Unable to write sessions. Review your permissions for sessions directory path (php user: $php_user)");
		}
		// clean old files (sessions and caches)
		$cache_life	= 4 * 24 * 60 * 60; // caching time, in seconds - 2 days -
		$files		= glob(DEDALO_SESSIONS_PATH . '/*');
		foreach($files as $file) {

			// time in seconds (number of seconds since the Unix Epoch (January 1 1970 00:00:00 GMT))
			$date_now		= time();
			$date_modified	= filemtime($file);

			if ( ($date_now - $date_modified) >= $cache_life ) {
				$deleted = unlink($file);
				if( !$deleted ) {
					debug_log(__METHOD__
						. " Error deleting cache file " . PHP_EOL
						. ' file: ' . to_string($file)
						, logger::ERROR
					);
					continue;
				}

				debug_log(__METHOD__
					. " Deleted cache file " . PHP_EOL
					. ' file: ' . to_string($file) .PHP_EOL
					. ' date_modified: ' . to_string($date_modified)
					, logger::WARNING
				);
			}
		}
	}



// BACKUPS
	// Target folder exists test
	$folder_path = DEDALO_BACKUP_PATH;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, $create_dir_permissions, true)) {

			$init_response->msg[]	= "Error on read or create backups directory. Permission denied (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path . PHP_EOL
				.' create_dir_permissions: ' . to_string($create_dir_permissions)
				, logger::ERROR
			);

			return $init_response;
		}
		debug_log(__METHOD__
			." CREATED DIR: $folder_path  "
			, logger::DEBUG
		);
	}



// BACKUP_PATH_ONTOLOGY
	// Target folder exists test
	$folder_path = DEDALO_BACKUP_PATH_ONTOLOGY;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, $create_dir_permissions, true)) {

			$init_response->msg[]	= "Error on read or create backup_path_ontology directory. Permission denied (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path . PHP_EOL
				.' create_dir_permissions: ' . to_string($create_dir_permissions)
				, logger::ERROR
			);

			return $init_response;
		}
		debug_log(__METHOD__
			." CREATED DIR: $folder_path  "
			, logger::DEBUG
		);
	}



// BACKUPS_ONTOLOGY_DOWNLOAD_DIR
	# Target folder exists test
	$folder_path = ONTOLOGY_DOWNLOAD_DIR;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700, true)) {

			$init_response->msg[]	= "Error on read or create ONTOLOGY_DOWNLOAD_DIR directory. Permission denied (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path . PHP_EOL
				.' create_dir_permissions: ' . to_string($create_dir_permissions)
				, logger::ERROR
			);

			return $init_response;
		}
		debug_log(__METHOD__
			." CREATED DIR: $folder_path  "
			, logger::DEBUG
		);
	}



// BACKUP_TEMP
	// Target folder exists test
	$folder_path = DEDALO_BACKUP_PATH_TEMP;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, $create_dir_permissions, true)) {

			$init_response->msg[]	= "Error on read or create backup temp directory. Permission denied (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path . PHP_EOL
				.' create_dir_permissions: ' . to_string($create_dir_permissions)
				, logger::ERROR
			);

			return $init_response;
		}
		debug_log(__METHOD__
			." CREATED DIR: $folder_path "
			, logger::DEBUG
		);
	}



// BACKUP_TEMP
	// Target folder exists test
	if (defined('ONTOLOGY_DOWNLOAD_DIR') && ONTOLOGY_DOWNLOAD_DIR!==false) {
		$folder_path = ONTOLOGY_DOWNLOAD_DIR;

		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, $create_dir_permissions, true)) {

				$init_response->msg[]	= 'Error on read or create backup ' .ONTOLOGY_DOWNLOAD_DIR. ' directory. Permission denied '."(php user: $php_user)";
				$init_response->errors	= true;
				debug_log(__METHOD__
					."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' folder_path: ' .$folder_path . PHP_EOL
					.' create_dir_permissions: ' . to_string($create_dir_permissions)
					, logger::ERROR
				);

				return $init_response;
			}
			debug_log(__METHOD__
				." CREATED DIR: $folder_path  "
				, logger::DEBUG
			);
		}
	}



// DEDALO_PREFIX_TIPOS
	# Maintain consistency on defined DEDALO_PREFIX_TIPOS and extras folder dirs
	$DEDALO_PREFIX_TIPOS = (array)get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
	foreach ($DEDALO_PREFIX_TIPOS as $current_tipo) {
		$folder_path = DEDALO_EXTRAS_PATH . '/' . $current_tipo;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, $create_dir_permissions, true)) {

				$init_response->msg[]	= "Error on read or create 'extras' directory ($current_tipo). Permission denied (php user: $php_user)";
				$init_response->errors	= true;
				debug_log(__METHOD__
					.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' folder_path: ' .$folder_path . PHP_EOL
					.' create_dir_permissions: ' . to_string($create_dir_permissions)
					, logger::ERROR
				);

				return $init_response;
			}
			debug_log(__METHOD__
				." CREATED DIR: $folder_path "
				, logger::DEBUG
			);
		}
	}



// MEDIA FOLDER
	// Target folder exists test
	$folder_path = DEDALO_MEDIA_PATH;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, $create_dir_permissions,true)) {

			$init_response->msg[]	= "Error on read or create 'media' directory. Permission denied (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path . PHP_EOL
				.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
				, logger::ERROR
			);

			return $init_response;
		}
		debug_log(__METHOD__
			." CREATED DIR: $folder_path "
			, logger::DEBUG
		);
	}



// MEDIA AV QUALITY FOLDERS
	$ar_folder = DEDALO_AV_AR_QUALITY;
	$ar_folder[] = 'posterframe'; // append posterframe as quality only to force iterate it
	$ar_folder[] = 'subtitles'; // append subtitles as quality only to force iterate it
	foreach ($ar_folder as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $quality;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, $create_dir_permissions, true)) {

				$init_response->msg[]	= "Error on read or create media quality: '$quality' directory. Permission denied (php user: $php_user)";
				$init_response->errors	= true;
				debug_log(__METHOD__
					.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' folder_path: ' .$folder_path . PHP_EOL
					.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
					, logger::ERROR
				);

				return $init_response;
			}
			debug_log(__METHOD__
				." CREATED DIR: $folder_path "
				, logger::DEBUG
			);
		}
	}



// MEDIA IMAGE QUALITY FOLDERS
	// Target folder exists test
	$ar_quality = DEDALO_IMAGE_AR_QUALITY;
	$ar_quality[] = 'svg'; // append svg as quality only to force iterate it
	foreach ($ar_quality as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . '/'. $quality;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, $create_dir_permissions, true)) {

				$init_response->msg[]	= "Error on read or create image quality '$quality' directory. Permission denied (php user: $php_user)";
				$init_response->errors	= true;
				debug_log(__METHOD__
					.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' folder_path: ' .$folder_path . PHP_EOL
					.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
					, logger::ERROR
				);

				return $init_response;
			}
			debug_log(__METHOD__
				." CREATED DIR: $folder_path "
				, logger::DEBUG
			);
		}
	}



// MEDIA PDF QUALITY FOLDERS
	if(defined('DEDALO_PDF_FOLDER')) {
		// v5 to v6 names manage
			$default_quality_path	= DEDALO_MEDIA_PATH.DEDALO_PDF_FOLDER.'/'.DEDALO_PDF_QUALITY_DEFAULT;
			$original_quality_path	= DEDALO_MEDIA_PATH.DEDALO_PDF_FOLDER.'/'.DEDALO_PDF_QUALITY_ORIGINAL;
			if( !is_dir($default_quality_path) || !is_dir($original_quality_path) ) {
				require_once DEDALO_CORE_PATH .'/base/upgrade/class.v5_to_v6.php';
				v5_to_v6::update_component_pdf_media_dir();
			}
		// Target folder exists test
			$ar_quality = DEDALO_PDF_AR_QUALITY;
			$ar_quality[] = DEDALO_QUALITY_THUMB; // append thumb as quality only to force iterate it
			foreach ($ar_quality as $quality) {
				$folder_path = DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER . '/'. $quality;
				if( !is_dir($folder_path) ) {
					if(!mkdir($folder_path, $create_dir_permissions, true)) {

						$init_response->msg[]	= "Error on read or create pdf quality '$quality' directory. Permission denied (php user: $php_user)";
						$init_response->errors	= true;
						debug_log(__METHOD__
							.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
							.' folder_path: ' .$folder_path . PHP_EOL
							.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
							, logger::ERROR
						);

						return $init_response;
					}
					debug_log(__METHOD__
						." CREATED DIR: $folder_path "
						, logger::DEBUG
					);
				}
			}
	}



// MEDIA 3D QUALITY FOLDERS
	// Target folder exists test
	$ar_quality = DEDALO_3D_AR_QUALITY;
	$ar_quality[] = 'posterframe';
	foreach ($ar_quality as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_3D_FOLDER . '/'. $quality;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, $create_dir_permissions, true)) {

				$init_response->msg[]	= "Error on read or create 3d quality '$quality' directory. Permission denied (php user: $php_user)";
				$init_response->errors	= true;
				debug_log(__METHOD__
					.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' folder_path: ' .$folder_path . PHP_EOL
					.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
					, logger::ERROR
				);

				return $init_response;
			}
			debug_log(__METHOD__
				." CREATED DIR: $folder_path "
				, logger::DEBUG
			);
		}
	}



// MEDIA SVG QUALITY FOLDERS
	if(defined('DEDALO_SVG_FOLDER')) {
		// v5 to v6 names manage
			$default_quality_path	= DEDALO_MEDIA_PATH.DEDALO_SVG_FOLDER.'/'.DEDALO_SVG_QUALITY_DEFAULT;
			$original_quality_path	= DEDALO_MEDIA_PATH.DEDALO_SVG_FOLDER.'/'.DEDALO_SVG_QUALITY_ORIGINAL;
			if( !is_dir($default_quality_path) || !is_dir($original_quality_path) ) {
				require_once DEDALO_CORE_PATH .'/base/upgrade/class.v5_to_v6.php';
				v5_to_v6::update_component_svg_media_dir();
			}

		// Target folder exists test
			$folder_path = DEDALO_MEDIA_PATH . DEDALO_SVG_FOLDER ;
			if( !is_dir($folder_path) ) {
				if(!mkdir($folder_path, $create_dir_permissions, true)) {

					$init_response->msg[]	= "Error on read or create SVG directory. Permission denied (php user: $php_user)";
					$init_response->errors	= true;
					debug_log(__METHOD__
						.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
						.' folder_path: ' .$folder_path . PHP_EOL
						.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
						, logger::ERROR
					);

					return $init_response;
				}
				debug_log(__METHOD__
					." CREATED DIR: $folder_path "
					, logger::DEBUG
				);
			}

		// quality folders create if not already exists
			$ar_quality = DEDALO_SVG_AR_QUALITY;
			foreach ($ar_quality as $quality) {
				$folder_path = DEDALO_MEDIA_PATH . DEDALO_SVG_FOLDER . '/'. $quality;
				if( !is_dir($folder_path) ) {
					if(!mkdir($folder_path, $create_dir_permissions, true)) {

						$init_response->msg[]	= "Error on read or create svg quality '$quality' directory. Permission denied (php user: $php_user)";
						$init_response->errors	= true;
						debug_log(__METHOD__
							.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
							.' folder_path: ' .$folder_path . PHP_EOL
							.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
							, logger::ERROR
						);

						return $init_response;
					}
					debug_log(__METHOD__
						." CREATED DIR: $folder_path "
						, logger::DEBUG
					);
				}
			}
	}



// MEDIA HTML FILES FOLDER
	// Target folder exists test
	if(defined('DEDALO_HTML_FILES_FOLDER')) {
		$folder_path = DEDALO_MEDIA_PATH.DEDALO_HTML_FILES_FOLDER;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, $create_dir_permissions, true)) {

				$init_response->msg[]	= "Error on read or create media DEDALO_HTML_FILES_FOLDER default directory. Permission denied (php user: $php_user)";
				$init_response->errors	= true;
				debug_log(__METHOD__
					.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' folder_path: ' .$folder_path . PHP_EOL
					.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
					, logger::ERROR
				);

				return $init_response;
			}
			debug_log(__METHOD__
				." CREATED DIR: $folder_path "
				, logger::DEBUG
			);
		}
	}



// MEDIA WEB IMAGES FOLDER
	// Target folder exists test
	if(defined('DEDALO_IMAGE_WEB_FOLDER')) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . DEDALO_IMAGE_WEB_FOLDER;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, $create_dir_permissions, true)) {

				$init_response->msg[]	= "Error on read or create media DEDALO_IMAGE_WEB_FOLDER default directory. Permission denied (php user: $php_user)";
				$init_response->errors	= true;
				debug_log(__METHOD__
					.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' folder_path: ' .$folder_path . PHP_EOL
					.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
					, logger::ERROR
				);

				return $init_response;
			}
			debug_log(__METHOD__
				." CREATED DIR: $folder_path "
				, logger::DEBUG
			);
		}
	}



// MEDIA EXPORT FOLDER
	// Target folder exists test
	if(defined('DEDALO_TOOL_EXPORT_FOLDER_PATH')) {
		$folder_path = DEDALO_TOOL_EXPORT_FOLDER_PATH;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, $create_dir_permissions, true)) {

				$init_response->msg[]	= "Error on read or create media DEDALO_TOOL_EXPORT_FOLDER_PATH default directory. Permission denied (php user: $php_user)";
				$init_response->errors	= true;
				debug_log(__METHOD__
					.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' folder_path: ' .$folder_path . PHP_EOL
					.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
					, logger::ERROR
				);

				return $init_response;
			}
			debug_log(__METHOD__
				." CREATED DIR: $folder_path "
				, logger::DEBUG
			);
		}
	}



// MEDIA PROTECTION
	// Target folder exists test
	if(defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) {
		/*
		# Test .htaccess file
		$htaccess_file = DEDALO_MEDIA_PATH . '/.htaccess';
		if (!file_exists($htaccess_file)) {
			$init_response->msg .= trim(" Error on read protect file for av directory. File '.htaccess' not found");
		}
		*/
	}



// DEDALO_UPLOAD_TMP_DIR
	$folder_path = DEDALO_UPLOAD_TMP_DIR;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, $create_dir_permissions, true)) {
			$init_response->msg[]	= "Error on read or create DEDALO_UPLOAD_TMP_DIR directory. Permission denied (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path . PHP_EOL
				.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
				, logger::ERROR
			);

			return $init_response;
		}
		debug_log(__METHOD__
			." CREATED DIR: $folder_path "
			, logger::DEBUG
		);
	}



// PSQL (Agus problem)
	// non dedalo_db_management case. Used when DDBB is in a external server or when backups are managed externally
	if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
		// nothing to do
	}else{
		$path	= DB_BIN_PATH . 'psql';
		$res	= shell_exec('command -v '. $path);
		$psql	= is_string($res)
			? trim($res)
			: $res;
		if (empty($psql)) {

			$init_response->msg[]	= 'Error: psql not found at: '.$path . PHP_EOL . ' Review your PostgreSQL installation or your db config file';
			$init_response->errors	= true;
			debug_log(__METHOD__
				.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' path: ' .$path . PHP_EOL
				.' psql: ' . to_string($psql) . PHP_EOL
				, logger::ERROR
			);

			return $init_response;
		}
	}



// PGPASS FILE
	$php_user_home 	= getenv('HOME'); //$_SERVER['HOME'];
	$path 			= $php_user_home . '/.pgpass';
	if (!file_exists($path)) {

		$init_response->msg[]	= 'Warning: File .pgpass not found at: '.$path . PHP_EOL . ' Check your .pgpass file into php user home dir';
		$init_response->errors	= true;
		debug_log(__METHOD__
			.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' php_user_home: ' . to_string($php_user_home) . PHP_EOL
			.' path: ' . to_string($path) . PHP_EOL
			, logger::ERROR
		);

		// return $init_response; // continue here, don't stop the flow, only notify error

	}else{

		$file_permissions = substr(sprintf('%o', fileperms($path)), -4);
		if ($file_permissions!='0600') {
			// Try to change it
				if(false===chmod($path, 0600)){

					$init_response->msg[]	= 'Warning: File .pgpass permissions is : '.$file_permissions . PHP_EOL . ' Unable to automatic set. Check manually your .pgpass file permissions and set to: 0600';
					$init_response->errors	= true;
					debug_log(__METHOD__
						.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
						.' file_permissions: ' . to_string($file_permissions)
						, logger::ERROR
					);

					// return $init_response; // continue here, don't stop the flow, only notify error

				}else{
					debug_log(__METHOD__
						." Changed permissions of file .pgpass to 0600 "
						, logger::ERROR
					);
				}
		}
	}



// IMAGE MAGICK
	#exec(MAGICK_PATH. "convert -version", $out, $rcode); // Try to get ImageMagick "convert" program version number.
	#if ($rcode!==0) $init_response->msg .= trim("Error on system test. ImageMagick lib not found");
	$image_magick = shell_exec('command -v '.MAGICK_PATH.'convert');
	if (empty($image_magick)) {

		$init_response->msg[]	= 'Error on system test. ImageMagick lib not found. Review your config path';
		$init_response->errors	= true;
		debug_log(__METHOD__
			. "  ".implode(PHP_EOL, $init_response->msg) .PHP_EOL
			. 'path: ' . MAGICK_PATH
			, logger::ERROR
		);

		return $init_response;
	}



// FFMPEG
	$ffmpeg = trim(shell_exec('command -v '.DEDALO_AV_FFMPEG_PATH));
	if (empty($ffmpeg)) {

		$init_response->msg[]	= 'Error on system test. ffmpeg lib not found';
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg) .PHP_EOL
			.' DEDALO_AV_FFMPEG_PATH: ' . DEDALO_AV_FFMPEG_PATH
			, logger::ERROR
		);

		return $init_response;
	}



// QT-FASTSTART
	$qt_faststart = trim(shell_exec('command -v '.DEDALO_AV_FASTSTART_PATH));
	if (empty($qt_faststart)) {

		$init_response->msg[]	= 'Error on system test. qt-faststart lib not found';
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' DEDALO_AV_FASTSTART_PATH: ' . DEDALO_AV_FASTSTART_PATH
			, logger::ERROR
		);

		return $init_response;
	}


// FFPROBE
	$ffprobe = trim(shell_exec('command -v '.DEDALO_AV_FFPROBE_PATH));
	if (empty($ffprobe)) {

		$init_response->msg[]	= 'Error on system test. ffprobe lib not found';
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' DEDALO_AV_FFPROBE_PATH: ' . DEDALO_AV_FFPROBE_PATH
			, logger::ERROR
		);

		return $init_response;
	}



// NODE
	// if (defined('DEDALO_NOTIFICATIONS') && DEDALO_NOTIFICATIONS===true) {
	// 	$node = trim(shell_exec('command -v '.DEDALO_NODEJS));
	// 	if (empty($node)) {

	// 		$init_response->msg[]	= 'Error on system test. node lib not found';
	// 		$init_response->errors	= true;
	// 		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

	// 		return $init_response; // continue here, don't stop the flow, only notify error
	// 	}
	// 	/*
	// 	$pm2 = trim(shell_exec('command -v '.DEDALO_NODEJS_PM2));
	// 	if (empty($pm2)) {
	// 		$init_response->msg .= trim("Error on system test. npm pm2 lib not found");
	// 	}
	// 	# pm2 start server.js --name "dd_node_"DEDALO_ENTITY --watch
	// 	#$pm2_test = trim(shell_exec(DEDALO_NODEJS_PM2.' describe dd_node_'.DEDALO_ENTITY));
	// 	#error_log($pm2_test);
	// 	#error_log( DEDALO_NODEJS_PM2.' describe dd_node_'.DEDALO_ENTITY );
	// 	*/
	// }



// DEFAULT PROJECT
	if (!defined('DEDALO_DEFAULT_PROJECT') || !defined('DEDALO_FILTER_SECTION_TIPO_DEFAULT')) {

		$init_response->msg[]	= 'Error Processing Request. Please define config DEDALO_DEFAULT_PROJECT and DEDALO_FILTER_SECTION_TIPO_DEFAULT';
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg)
			, logger::ERROR
		);

	    return $init_response;
	}



// CURL
	if(!function_exists('curl_init') || !function_exists('curl_version')) {

		$init_response->msg[]	= 'Error Processing Request. Curl: function "curl_init" not found. Please review your PHP configuration';
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg)
			, logger::ERROR
		);

		return $init_response;
	}



// LOCK COMPONENTS
	if(defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {
		if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
			lock_components::clean_locks_garbage();
		}
	}


// Test mcrypt lib
	# Change it to Open SSL in 4.0.22
	#if (!function_exists('mcrypt_encrypt')) {
	#	$init_response->msg .= trim("Error Processing Request: MCRYPT lib is not available");
	#}



// Test openSSL lib
	if (!function_exists('openssl_encrypt')) {

		$init_response->msg[]	= 'Error Processing Request: OPEN_SSL lib is not available';
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg)
			, logger::ERROR
		);

		return $init_response;
	}



// table matrix_tools - matrix_test only when system is already installed
	if(defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {
		$tables = (array)backup::get_tables();
		if (!in_array('matrix_test', $tables)) {

			// matrix_test, auto create the necessary matrix_test table, used to generate test data in area development

			include_once DEDALO_CORE_PATH . '/base/update/class.update.php';

			$current_query 	= PHP_EOL.sanitize_query("
				CREATE TABLE IF NOT EXISTS public.matrix_test
				(
				   LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS
				)
				WITH (OIDS = FALSE);
				CREATE SEQUENCE IF NOT EXISTS matrix_test_id_seq;
				ALTER TABLE public.matrix_test ALTER COLUMN id SET DEFAULT nextval('matrix_test_id_seq'::regclass);
			");
			$SQL_update = update::SQL_update($current_query);

			$init_response->msg .= ' Table matrix_test is not available. Auto-created table matrix_test';
		}
		if (!in_array('matrix_tools', $tables)) {

			if ($user_id==DEDALO_SUPERUSER) {

				// If user is 'root', auto create the necessary matrix_tools and redirect the browser to Maintenance Area
				// to admin de Dédalo data updates

				include_once DEDALO_CORE_PATH . '/base/update/class.update.php';

				$current_query 	= PHP_EOL.sanitize_query("
					CREATE TABLE IF NOT EXISTS public.matrix_tools
					(
					   LIKE public.matrix INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING STORAGE INCLUDING COMMENTS
					)
					WITH (OIDS = FALSE);
					CREATE SEQUENCE IF NOT EXISTS matrix_tools_id_seq;
					ALTER TABLE public.matrix_tools ALTER COLUMN id SET DEFAULT nextval('matrix_tools_id_seq'::regclass);
				");
				$SQL_update = update::SQL_update($current_query);

				if ($SQL_update->result===false) {
					$init_response->msg .= trim("Error Processing Request: Table matrix_tools is not available and it is not possible to create it");
					return $init_response;
				}

				// $init_response->msg = 'Warning. Redirect to Area Maintenance to update Dédalo data';
				$init_response->result_options	= (object)[
					'redirect'	=> DEDALO_CORE_URL .'/page/?t=' . DEDALO_AREA_MAINTENANCE_TIPO // dd88
				];

			}else{

				// Only user 'root' is allow to access Development Area. Stop execution here

				$init_response->msg .= 'Table matrix_tools is not available. Please, login as Dédalo superuser (root) to grant access to Development Area. You need to update your Dédalo data, ontology and register the tools';
				return $init_response;
			}
		}
	}



// cache
	if (!defined('DEDALO_CACHE_MANAGER') || empty(DEDALO_CACHE_MANAGER)) {

		$init_response->msg[]	= '
			Error Processing Request: DEDALO_CACHE_MANAGER is mandatory.
			Please check your config file and set a valid value. You can see some examples in sample.config file';
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg)
			, logger::ERROR
		);

		return $init_response;
	}else{

		$files_path = DEDALO_CACHE_MANAGER['files_path'] ?? null;

		// create directory if is not already created
			if (!empty($files_path)) {
				if ( !is_dir($files_path) ) {
					if(!mkdir($files_path, 0750, true)) {
						debug_log(__METHOD__
							." Error creating files_path path: " . $files_path
							, logger::ERROR
						);

						$init_response->msg[]	= 'Warning: Unable to create cache dir: '.$files_path . PHP_EOL . ' Check your DEDALO_CACHE_MANAGER config to fix it';
						$init_response->errors	= true;
						debug_log(__METHOD__
							."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
							.' files_path: ' . $files_path
							, logger::ERROR
						);

						return $init_response;
					}
				}
			}

		if (!empty($files_path) && !is_dir($files_path) ) {

			$init_response->msg[]	= 'Warning: Cache dir unavailable at: '.$files_path . PHP_EOL . ' Check your DEDALO_CACHE_MANAGER config to fix it';
			$init_response->errors	= true;
			debug_log(__METHOD__
				."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' files_path: ' . $files_path
				, logger::ERROR
			);

			return $init_response;
		}else{

			// write test file
			$test_user_id	= $user_id ?? 0;
			$file_name		= 'cache_test_file.json';
			dd_cache::process_and_cache_to_file((object)[
				'process_file'	=> DEDALO_CORE_PATH . '/base/cache_test_file.php',
				'data'			=> (object)[
					'session_id'	=> session_id(),
					'user_id'		=> $test_user_id
				],
				'file_name'	=> $file_name,
				'wait'		=> true
			]);
			// read test file
			$cache_data = dd_cache::cache_from_file((object)[
				'file_name'	=> $file_name
			]);
			// check file data
			if (empty($cache_data)) {
				$init_response->msg[]	= 'Warning: cache data stream fails. Check your DEDALO_CACHE_MANAGER config or your PHP bin path (config_db.php PHP_BIN_PATH) to fix it';
				$init_response->errors	= true;
				debug_log(__METHOD__."  "
					. implode(PHP_EOL, $init_response->msg) . PHP_EOL
					. 'file_name: ' . $file_name
					, logger::ERROR
				);

				return $init_response;
			}else{
				// delete test file
				$delete_cache = dd_cache::delete_cache_files([
					$file_name // file name
				]);
				if ($delete_cache!==true) {
					$init_response->msg[]	= 'Warning: delete cache test file fails. Check your DEDALO_CACHE_MANAGER files_path permissions to fix it';
					$init_response->errors	= true;
					debug_log(__METHOD__
						."  ".implode(PHP_EOL, $init_response->msg)
						, logger::ERROR
					);

					return $init_response;
				}
			}
		}
	}



// temporal chunks remove. Delete possible broken upload files as chunks
	if (defined('DEDALO_UPLOAD_SERVICE_CHUNK_FILES') && DEDALO_UPLOAD_SERVICE_CHUNK_FILES!==false) {
		try {
			$ar_folder = DEDALO_AV_AR_QUALITY;
			foreach ($ar_folder as $quality) {

				$folder_path = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . '/'. $quality;

				// get chunk files (.blob)
					$files = glob( $folder_path.'/*.blob' );
					if (empty($files)) {
						continue;
					}

				// folder_path_to_delete
					$folder_path_to_delete = $folder_path .'/to_delete';
					if( !is_dir($folder_path_to_delete) ) {
						if(!mkdir($folder_path_to_delete, 0755, true)) {
							debug_log(__METHOD__
								." Error creating folder_path_to_delete path: " . $folder_path_to_delete
								, logger::ERROR
							);
						}
						debug_log(__METHOD__
							." Created dir: ".$folder_path_to_delete
							, logger::WARNING
						);
					}

				// iterate found files checking the date
					$max_preservation_hours = 12;
					foreach ($files as $file) {

						$modification_time_secs	= filemtime($file);
						$current_time_secs		= time();
						$difference_in_hours	= round( ($current_time_secs/3600) - round($modification_time_secs/3600), 0 );
						if ($difference_in_hours >= $max_preservation_hours) {

							$target = $folder_path_to_delete . '/' . pathinfo($file)['basename'];

							// move file to directory 'to_delete'
							$rename_result	= rename($file, $target);
							if ($rename_result===false) {
								debug_log(__METHOD__
									. " Error on move file " . PHP_EOL
									. ' file: ' .$file . PHP_EOL
									. ' target: ' .$target
									, logger::ERROR
								);
							}else{
								debug_log(__METHOD__
									. " Moved file successfully " . PHP_EOL
									. ' file:   ' . $file . PHP_EOL
									. ' target: ' . $target
									, logger::DEBUG
								);
							}
						}
					}
			}
		} catch (Exception $e) {
			debug_log(__METHOD__
				. " Error on clean CHUNK_FILES " . PHP_EOL
				. $e->getMessage()
				, logger::ERROR
			);
		}
	}



// ALL IS OK
	$init_response->result = true;
	if ($init_response->errors===false) {
		$init_response->msg[] = 'OK. init test successful';
	}else{
		array_unshift($init_response->msg, 'Init test passed with some warnings');
	}


	return $init_response;
