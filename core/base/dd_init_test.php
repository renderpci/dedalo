<?php declare(strict_types=1);
/**
* SYSTEM TEST
* Verify the integrity of the system (usually in the boot sequence or login)
* Checks for the existence of items / directories / permissions needed to run Dédalo
*/



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
	if (system::test_php_version_supported()===false) {

		$init_response->msg[]	= 'Error. This php version '.PHP_VERSION.' is not supported by Dédalo. Update PHP to '.$minimum.' or higher ASAP';
		$init_response->errors	= true;
		debug_log(__METHOD__
			.' '.implode(PHP_EOL, $init_response->msg). PHP_EOL
			.' test_php_version_supported: ' . to_string( system::test_php_version_supported() ) . PHP_EOL
			.' PHP_VERSION: ' . PHP_VERSION . PHP_EOL
			.' minimum: ' . $minimum
			, logger::ERROR
		);

		return $init_response;
	}



// test new constants 6.4
	$new_constants = [
		'DEDALO_INSTALL_PATH',
		'DEDALO_INSTALL_URL',
		'DEDALO_API_URL',
		'ONTOLOGY_SERVERS',
		'ONTOLOGY_DATA_IO_DIR',
		'ONTOLOGY_DATA_IO_URL',
		'CODE_SERVERS',
		'DEDALO_SOURCE_VERSION_LOCAL_DIR'
	];
	foreach ($new_constants as $name) {
		if (!defined($name)) {
			$init_response->msg[]	= 'Error Processing Request: constant: '.$name.' is not defined in config file';
			$init_response->errors	= true;
			debug_log(__METHOD__
				."  ".implode(PHP_EOL, $init_response->msg)
				, logger::ERROR
			);

			return $init_response;
		}
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
		$dir_exists = system::check_sessions_path();
		if( !$dir_exists ){
			die("Unable to write sessions. Review your permissions for sessions directory path (php user: $php_user)");
		}
		// clean old files (sessions and caches)
		system::delete_old_sessions_files();
	}



// BACKUPS
	// Target folder exists test
	// Note that this directory contains various types of backups:
	// /db, /ontology, /mysql, /temp
	if (!system::check_backup_path()) {
		$init_response->msg[]	= "Error on read or create backups directory. (php user: $php_user)";
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' folder_path: ' . DEDALO_BACKUP_PATH
			, logger::ERROR
		);

		return $init_response;
	}



// DEDALO_BACKUP_PATH_ONTOLOGY
	// Target folder exists test
	// Note that this directory is inside DEDALO_BACKUP_PATH
	$folder_path = DEDALO_BACKUP_PATH_ONTOLOGY;
	if (!system::check_directory($folder_path)) {
		$init_response->msg[]	= "Error on read or create backup_path_ontology directory. Permission denied (php user: $php_user)";
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' folder_path: ' . $folder_path
			, logger::ERROR
		);

		return $init_response;
	}



// ONTOLOGY_DATA_IO_DIR
	// Target folder exists test
	// Normally is DEDALO_BACKUP_PATH_ONTOLOGY . '/download'
	if (defined('ONTOLOGY_DATA_IO_DIR')) {
		$folder_path = ONTOLOGY_DATA_IO_DIR;
		if (!system::check_directory($folder_path)) {
			$init_response->msg[]	= "Error on read or create ONTOLOGY_DATA_IO_DIR directory. Permission denied (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' . $folder_path
				, logger::ERROR
			);

			return $init_response;
		}
	}



// BACKUP_TEMP
	// Target folder exists test
	$folder_path = DEDALO_BACKUP_PATH_TEMP;
	if (!system::check_directory($folder_path)) {
		$init_response->msg[]	= "Error on read or create backup temp directory. Permission denied (php user: $php_user)";
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' folder_path: ' .$folder_path
			, logger::ERROR
		);

		return $init_response;
	}



// MEDIA FOLDER
	// Target folder exists test
	$folder_path = DEDALO_MEDIA_PATH;
	if (!system::check_directory($folder_path)) {
		$init_response->msg[]	= "Error on read or create 'media' directory. Permission denied (php user: $php_user)";
		$init_response->errors	= true;
		debug_log(__METHOD__
			.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' folder_path: ' .$folder_path
			, logger::ERROR
		);

		return $init_response;
	}



// MEDIA AV QUALITY FOLDERS
	$ar_folder = DEDALO_AV_AR_QUALITY;
	$ar_folder[] = 'posterframe'; // append posterframe as quality only to force iterate it
	$ar_folder[] = 'subtitles'; // append subtitles as quality only to force iterate it
	foreach ($ar_folder as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $quality;
		if (!system::check_directory($folder_path)) {
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
	}



// MEDIA IMAGE QUALITY FOLDERS
	// Target folder exists test
	$ar_quality = DEDALO_IMAGE_AR_QUALITY;
	$ar_quality[] = 'svg'; // append svg as quality only to force iterate it
	foreach ($ar_quality as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . '/'. $quality;
		if (!system::check_directory($folder_path)) {
			$init_response->msg[]	= "Error on read or create image quality '$quality' directory. Permission denied (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path
				, logger::ERROR
			);

			return $init_response;
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
				if (!system::check_directory($folder_path)) {

					$init_response->msg[]	= "Error on read or create pdf quality '$quality' directory. Permission denied (php user: $php_user)";
					$init_response->errors	= true;
					debug_log(__METHOD__
						.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
						.' folder_path: ' .$folder_path
						, logger::ERROR
					);

					return $init_response;
				}
			}
	}



// MEDIA 3D QUALITY FOLDERS
	// Target folder exists test
	$ar_quality = DEDALO_3D_AR_QUALITY;
	$ar_quality[] = 'posterframe';
	foreach ($ar_quality as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_3D_FOLDER . '/'. $quality;
		if (!system::check_directory($folder_path)) {

			$init_response->msg[]	= "Error on read or create 3d quality '$quality' directory. Permission denied (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path
				, logger::ERROR
			);

			return $init_response;
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
			if (!system::check_directory($folder_path)) {

				$init_response->msg[]	= "Error on read or create SVG directory. Permission denied (php user: $php_user)";
				$init_response->errors	= true;
				debug_log(__METHOD__
					.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' folder_path: ' .$folder_path . PHP_EOL
					, logger::ERROR
				);

				return $init_response;
			}

		// quality folders create if not already exists
			$ar_quality = DEDALO_SVG_AR_QUALITY;
			foreach ($ar_quality as $quality) {
				$folder_path = DEDALO_MEDIA_PATH . DEDALO_SVG_FOLDER . '/'. $quality;
				if (!system::check_directory($folder_path)) {

					$init_response->msg[]	= "Error on read or create svg quality '$quality' directory. Permission denied (php user: $php_user)";
					$init_response->errors	= true;
					debug_log(__METHOD__
						.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
						.' folder_path: ' .$folder_path
						, logger::ERROR
					);

					return $init_response;
				}
			}
	}



// MEDIA HTML FILES FOLDER
	// Target folder exists test
	if(defined('DEDALO_HTML_FILES_FOLDER')) {
		$folder_path = DEDALO_MEDIA_PATH.DEDALO_HTML_FILES_FOLDER;
		if (!system::check_directory($folder_path)) {

			$init_response->msg[]	= "Error on read or create media DEDALO_HTML_FILES_FOLDER default directory. Permission denied (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path
				, logger::ERROR
			);

			return $init_response;
		}
	}



// MEDIA WEB IMAGES FOLDER
	// Target folder exists test
	if(defined('DEDALO_IMAGE_WEB_FOLDER')) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . DEDALO_IMAGE_WEB_FOLDER;
		if (!system::check_directory($folder_path)) {

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
	}



// MEDIA EXPORT FOLDER
	// Target folder exists test
	if(defined('DEDALO_TOOL_EXPORT_FOLDER_PATH')) {
		$folder_path = DEDALO_TOOL_EXPORT_FOLDER_PATH;
		if (!system::check_directory($folder_path)) {

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
	if (!system::check_directory($folder_path)) {

		$init_response->msg[]	= "Error on read or create DEDALO_UPLOAD_TMP_DIR directory. Permission denied (php user: $php_user)";
		$init_response->errors	= true;

		return $init_response;
	}
	// write dir inside
	if(!create_directory(
		DEDALO_UPLOAD_TMP_DIR . '/test',
		$create_dir_permissions
	)) {
		$init_response->msg[]	= "Error on create DEDALO_UPLOAD_TMP_DIR /test directory. Permission denied (php user: $php_user)";
		$init_response->errors	= true;
		return $init_response;
	}



// curl check
	if (defined('STRUCTURE_SERVER_CODE')) {
		$remote_server_response = backup::check_remote_server();
		$code = $remote_server_response->code ?? 'unknown';
		if ($code!==200) {
			$init_response->msg[]	= "Error checking remote server. Response code: '$code' (php user: $php_user)";
			$init_response->errors	= true;
			debug_log(__METHOD__
				. ' Unable to connect with Ontology server' . PHP_EOL
				. ' STRUCTURE_SERVER_CODE: ' . to_string(STRUCTURE_SERVER_CODE)
				, logger::ERROR
			);
		}else{
			try {
				// data
				$data_string = "data=" . json_encode(null);
				// curl_request
				$curl_response = curl_request((object)[
					'url'				=> 'https://master.dedalo.dev/',
					'post'				=> true,
					'postfields'		=> $data_string,
					'returntransfer'	=> 1,
					'followlocation'	=> true,
					'header'			=> false, // bool add header to result
					'ssl_verifypeer'	=> false,
					'timeout'			=> 5, // int seconds
					'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
						? SERVER_PROXY // from Dédalo config file
						: false // default case
				]);
				$contents = $curl_response->result;
				// check contents
				if ($contents===false) {
					$msg = "Error checking curl_request. curl_response->result is false (php user: $php_user)";
					$init_response->msg[]	= $msg;
					$init_response->errors	= true;
					debug_log(__METHOD__
						. " $msg" . PHP_EOL
						. ' curl_response: ' . to_string($curl_response)
						, logger::ERROR
					);
				}
				$file_name		= 'test.html';
				$target_file	= DEDALO_UPLOAD_TMP_DIR . '/test/' . $file_name;
				$put_contents	= file_put_contents($target_file, $contents);
				if (!$put_contents) {
					$msg = 'Error. Request fail to write on : '.$target_file;
					$init_response->msg[]	= $msg;
					$init_response->errors	= true;
					debug_log(__METHOD__
						." $msg"
						, logger::ERROR
					);
				}
			} catch (Exception $e) {
				debug_log(__METHOD__
					. " Exception on curl request test: " . $e->getMessage()
					, logger::ERROR
				);
			}
		}
	}




// IMPORT DIR
	$folder_path = DEDALO_MEDIA_PATH . '/import';
	if (!system::check_directory($folder_path)) {

		$init_response->msg[]	= "Error on read or create import directory. Permission denied (php user: $php_user)";
		$init_response->errors	= true;

		return $init_response;
	}
	// write dir inside
	if(!create_directory(
		DEDALO_MEDIA_PATH . '/import/test',
		$create_dir_permissions
	)) {
		$init_response->msg[]	= "Error on create DEDALO_MEDIA_PATH . '/import/test' directory. Permission denied (php user: $php_user)";
		$init_response->errors	= true;
		return $init_response;
	}


// IMPORT HISTORY DIR
	$folder_path = DEDALO_MEDIA_PATH . '/import/history';
	if (!system::check_directory($folder_path)) {

		$init_response->msg[]	= "Error on read or create import history directory. Permission denied (php user: $php_user)";
		$init_response->errors	= true;

		return $init_response;
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
	if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===true) {
		if (!system::check_pgpass_file()) {

			$php_user_home	= getenv('HOME'); //$_SERVER['HOME'];
			$path			= $php_user_home . '/.pgpass';

			$init_response->msg[]	= 'Warning: Invalid .pgpass file' . PHP_EOL . ' Check your .pgpass file into php user home dir';
			$init_response->errors	= true;
			debug_log(__METHOD__
				.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' php_user_home: ' . to_string($php_user_home) . PHP_EOL
				.' path: ' . to_string($path) . PHP_EOL
				, logger::ERROR
			);
			// Do not stop here. Only inform to user
		}
	}



// IMAGE MAGICK
	$imagemagick_version = ImageMagick::get_version();
	if (empty($imagemagick_version)) {

		$init_response->msg[]	= 'Error on system test. ImageMagick lib not found. Review your config path';
		$init_response->errors	= true;
		debug_log(__METHOD__
			. "  ".implode(PHP_EOL, $init_response->msg) .PHP_EOL
			. 'path: ' . ImageMagick::get_imagemagick_installed_path()
			, logger::ERROR
		);

		return $init_response;
	}



// FFMPEG
	$ffmpeg_version = Ffmpeg::get_version();
	if (empty($ffmpeg_version)) {

		$init_response->msg[]	= 'Error on system test. ffmpeg lib not found';
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg) .PHP_EOL
			.' ffmpeg_path: ' . $ffmpeg_path
			, logger::ERROR
		);

		return $init_response;
	}



// FFPROBE
	$ffprove_version = Ffmpeg::get_ffprove_version();
	if (empty($ffprove_version)) {

		$init_response->msg[]	= 'Error on system test. ffprobe lib not found';
		$init_response->errors	= true;
		debug_log(__METHOD__
			."  ".implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' ffprove_path: ' . Ffmpeg::get_ffprove_installed_path()
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
	if (!system::check_curl()) {

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

			$current_query = PHP_EOL.sanitize_query("
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
				if (!system::check_directory($files_path)) {

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
			system::remove_old_chunk_files();
		} catch (Exception $e) {
			debug_log(__METHOD__
				. " Error on clean CHUNK_FILES " . PHP_EOL
				. $e->getMessage()
				, logger::ERROR
			);
		}
	}



// jer_dd_recovery. Create it if not already exists
	$jer_dd_recovery_exists	= DBi::check_table_exists('jer_dd_recovery');
	if (!$jer_dd_recovery_exists) {
		install::restore_jer_dd_recovery_from_file();
	}



// ALL IS OK
	$init_response->result = true;
	if ($init_response->errors===false) {
		$init_response->msg[] = 'OK. init test successful';
	}else{
		array_unshift($init_response->msg, 'Init test passed with some warnings');
	}

	return $init_response;
