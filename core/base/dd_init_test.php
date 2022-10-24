<?php
# SYSTEM TEST
# Verifica la integridad del sistema (habitualmente en la secuencia de arranque o login)
# Comprueba la existencia de elementos / directorios / permisos necesarios para ejecutar Dédalo



// RESPONSE
	$init_response = new stdClass();
		$init_response->result			= false;
		$init_response->msg				= []; // 'Error on init test'
		$init_response->errors			= false;
		$init_response->result_options	= null;



// PHP VERSION
	$minimun = '8.1.0';
	if (test_php_version_supported()===false) {

		$init_response->msg[]	= 'Error. This php version '.PHP_VERSION.' is not supported by Dédalo. Update PHP to '.$minimun.' or higher ASAP';
		$init_response->errors	= true;
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

		return $init_response;
	}



// MBSTRING
	if (!function_exists('mb_internal_encoding')) {

		$init_response->msg[]	= 'Error. mb_internal_encoding is required by Dédalo. Please install php mbstring to continue';
		$init_response->errors	= true;
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

		return $init_response;
	}



// BACKUPS
	# Target folder exists test
	$folder_path = DEDALO_BACKUP_PATH;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700, true)) {

			$init_response->msg[]	= 'Error on read or create backups directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}



// BACKUPS_STRUCTURE
	# Target folder exists test
	$folder_path = DEDALO_BACKUP_PATH_STRUCTURE;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700, true)) {

			$init_response->msg[]	= 'Error on read or create backups_structure directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}



// BACKUP_TEMP
	# Target folder exists test
	$folder_path = DEDALO_BACKUP_PATH_TEMP;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700, true)) {

			$init_response->msg[]	= 'Error on read or create backup temp directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}



// BACKUP USERS DIR
	# Target folder exists test
	$folder_path = DEDALO_BACKUP_PATH_USERS;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700, true)) {

			$init_response->msg[]	= 'Error on read or create backup users directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}


// BACKUP_TEMP
	# Target folder exists test
	if (defined('STRUCTURE_DOWNLOAD_DIR') && STRUCTURE_DOWNLOAD_DIR!==false) {
		$folder_path = STRUCTURE_DOWNLOAD_DIR;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0700, true)) {

				$init_response->msg[]	= 'Error on read or create backup ' . STRUCTURE_DOWNLOAD_DIR . ' directory. Permission denied';
				$init_response->errors	= true;
				debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

				return $init_response;
			}
			debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
		}
	}



// DEDALO_PREFIX_TIPOS
	# Maintain consistency on defined DEDALO_PREFIX_TIPOS and extras folder dirs
	$DEDALO_PREFIX_TIPOS = (array)get_legacy_constant_value('DEDALO_PREFIX_TIPOS');
	foreach ($DEDALO_PREFIX_TIPOS as $current_tipo) {
		$folder_path = DEDALO_EXTRAS_PATH . '/' . $current_tipo;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0700, true)) {

				$init_response->msg[]	= 'Error on read or create extras directory ('.$current_tipo.'). Permission denied';
				$init_response->errors	= true;
				debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

				return $init_response;
			}
			debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
		}
	}



// MEDIA folder
	# Target folder exists test
	$folder_path = DEDALO_MEDIA_PATH;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775,true)) {

			$init_response->msg[]	= 'Error on read or create media directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}



// MEDIA QUALITY FOLDERS (Important for ffmpeg conversions)
	$ar_folder = DEDALO_AV_AR_QUALITY;
	foreach ($ar_folder as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER.'/'.$quality;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0775, true)) {

				$init_response->msg[]	= 'Error on read or create media quality ['.$quality.'] directory. Permission denied';
				$init_response->errors	= true;
				debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

				return $init_response;
			}
			debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
		}
	}



// MEDIA AV POSTERFRAME
	/*
	# Target folder exists test
	$folder_path = DEDALO_MEDIA_PATH .'/'. DEDALO_AV_FOLDER . '/posterframe/deleted';
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775, true)) {
			$init_response->msg .= trim(" Error on read or create media posterframe deleted directory. Permission denied ");
		}
	}
	*/



// MEDIA IMAGE
	# Target folder exists test
	$ar_quality = DEDALO_IMAGE_AR_QUALITY;
	// append svg as quality only to force iterate it
	$ar_quality[] = 'svg';
	foreach ($ar_quality as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . '/'.$quality;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0775, true)) {

				$init_response->msg[]	= 'Error on read or create image '.$quality.' deleted directory. Permission denied';
				$init_response->errors	= true;
				debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

				return $init_response;
			}
			debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
		}
	}



// MEDIA PDF folder
	# Target folder exists test
	if(defined('DEDALO_PDF_FOLDER')) {
	$folder_path = DEDALO_MEDIA_PATH.DEDALO_PDF_FOLDER.'/'.DEDALO_PDF_QUALITY_DEFAULT;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775, true)) {

			$init_response->msg[]	= 'Error on read or create media pdf default directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}}



// MEDIA PDF THUMBS folder
	# Target folder exists test
	if(defined('DEDALO_PDF_THUMB_DEFAULT')) {
	$folder_path = DEDALO_MEDIA_PATH.DEDALO_PDF_FOLDER.'/'.DEDALO_PDF_THUMB_DEFAULT;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775, true)) {

			$init_response->msg[]	= 'Error on read or create media pdf default directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}}



// MEDIA HTML FILES folder
	# Target folder exists test
	if(defined('DEDALO_HTML_FILES_FOLDER')) {
	$folder_path = DEDALO_MEDIA_PATH.DEDALO_HTML_FILES_FOLDER;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775, true)) {

			$init_response->msg[]	= 'Error on read or create media DEDALO_HTML_FILES_FOLDER default directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}}



// MEDIA WEB IMAGES folder
	# Target folder exists test
	if(defined('DEDALO_IMAGE_WEB_FOLDER')) {
	$folder_path = DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . DEDALO_IMAGE_WEB_FOLDER;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775, true)) {

			$init_response->msg[]	= 'Error on read or create media DEDALO_IMAGE_WEB_FOLDER default directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}}



// MEDIA EXPORT folder
	# Target folder exists test
	if(defined('DEDALO_TOOL_EXPORT_FOLDER_PATH')) {
	$folder_path = DEDALO_TOOL_EXPORT_FOLDER_PATH;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775, true)) {

			$init_response->msg[]	= 'Error on read or create media DEDALO_TOOL_EXPORT_FOLDER_PATH default directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}}



// MEDIA AV
	# Target folder exists test
	$ar_quality = DEDALO_AV_AR_QUALITY;
	foreach ($ar_quality as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . '/'.$quality;
		if( !is_dir($folder_path) ) {
			if(!mkdir($folder_path, 0775, true)) {

				$init_response->msg[]	= 'Error on read or create image '.$quality.' directory. Permission denied';
				$init_response->errors	= true;
				debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

				return $init_response;
			}
			debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
		}
	}



// MEDIA AVG
	# Target folder exists test
	$folder_path = DEDALO_MEDIA_PATH . DEDALO_SVG_FOLDER ;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0775, true)) {

			$init_response->msg[]	= 'Error on read or create svg directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}



// MEDIA PROTECTION
	# Target folder exists test
	if(defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) {
		/*
		# Test .htaccess file
		$htaccess_file = DEDALO_MEDIA_PATH . '/.htaccess';
		if (!file_exists($htaccess_file)) {
			$init_response->msg .= trim(" Error on read protect file for av directory. File '.htaccess' not found");
		}
		*/
	}



// LOGS FOLDER
	# Target folder exists test
	$folder_path = DEDALO_LOGS_DIR;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700, true)) {

			$init_response->msg[]	= 'Error on read or create logs directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}



// DEDALO_UPLOAD_TMP_DIR
	$folder_path = DEDALO_UPLOAD_TMP_DIR;
	if( !is_dir($folder_path) ) {
		if(!mkdir($folder_path, 0700, true)) {
			$init_response->msg[]	= 'Error on read or create DEDALO_UPLOAD_TMP_DIR directory. Permission denied';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}
		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	}



// PSQL (Agus problem)
	$path = DB_BIN_PATH . 'psql';
	$psql = trim(shell_exec('command -v '. $path));
	if (empty($psql)) {

		$init_response->msg[]	= 'Error: psql not found at: '.$path . PHP_EOL . ' Review your PostgreSQL installation or your db config file';
		$init_response->errors	= true;
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

		return $init_response;
	}



// PGPASS FILE
	$php_user_home 	= getenv("HOME"); //$_SERVER['HOME'];
	$path 			= $php_user_home . '/.pgpass';
	if (!file_exists($path)) {

		$init_response->msg[]	= 'Warning: File .pgpass not found at: '.$path . PHP_EOL . ' Check your .pgpass file into php user home dir';
		$init_response->errors	= true;
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

		// return $init_response; // continue here, don't stop the flow, only notify error

	}else{
		$file_permissions = substr(sprintf('%o', fileperms($path)), -4);
		if ($file_permissions!=='0600') {
			// Try to change it
				if(false===chmod($path, 0600)){

					$init_response->msg[]	= 'Warning: File .pgpass permissions is : '.$file_permissions . PHP_EOL . ' Unable to automatic set. Check manually your .pgpass file permissions and set to: 0600';
					$init_response->errors	= true;
					debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

					// return $init_response; // continue here, don't stop the flow, only notify error

				}else{
					debug_log(__METHOD__." Changed permissions of file .pgpass to 0600 ".to_string(), logger::ERROR);
				}
		}
	}



// IMAGE MAGICK
	#exec(MAGICK_PATH. "convert -version", $out, $rcode); // Try to get ImageMagick "convert" program version number.
	#if ($rcode!==0) $init_response->msg .= trim("Error on system test. ImageMagick lib not found");
	$image_magick = trim(shell_exec('command -v '.MAGICK_PATH.'convert'));
	if (empty($image_magick)) {

		$init_response->msg[]	= 'Error on system test. ImageMagick lib not found';
		$init_response->errors	= true;
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

		return $init_response;
	}



// FFMPEG
	$ffmpeg = trim(shell_exec('command -v '.DEDALO_AV_FFMPEG_PATH));
	if (empty($ffmpeg)) {

		$init_response->msg[]	= 'Error on system test. ffmpeg lib not found';
		$init_response->errors	= true;
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

		return $init_response;
	}



// QT-FASTSTART
	$qt_faststart = trim(shell_exec('command -v '.DEDALO_AV_FASTSTART_PATH));
	if (empty($qt_faststart)) {

		$init_response->msg[]	= 'Error on system test. qt-faststart lib not found';
		$init_response->errors	= true;
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

		return $init_response;
	}


// FFPROBE
	$ffprobe = trim(shell_exec('command -v '.DEDALO_AV_FFPROBE_PATH));
	if (empty($ffprobe)) {

		$init_response->msg[]	= 'Error on system test. ffprobe lib not found';
		$init_response->errors	= true;
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

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

		$init_response->msg[]	= 'Error Processing Request. Please define congif DEDALO_DEFAULT_PROJECT and DEDALO_FILTER_SECTION_TIPO_DEFAULT';
		$init_response->errors	= true;
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

	    return $init_response;
	}



// CURL
	if(!function_exists('curl_init') || !function_exists('curl_version')) {

		$init_response->msg[]	= 'Error Processing Request. Curl: function "curl_init" not found. Please review your PHP configuration';
		$init_response->errors	= true;
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

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
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

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

				// If user is 'root', auto create the necessary matrix_tools and redirect the browser to Development Area
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

				// $init_response->msg = 'Warning. Redirect to Area Development to update Dédalo data';
				$init_response->result_options	= (object)[
					'redirect'	=> DEDALO_CORE_URL.'/page/?t=dd770'
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
		debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

		return $init_response;
	}else{

		$files_path = DEDALO_CACHE_MANAGER->files_path ?? null;
		if ( !is_dir($files_path) ) {

			$init_response->msg[]	= 'Warning: Cache dir unavailable at: '.$files_path . PHP_EOL . ' Check your DEDALO_CACHE_MANAGER config to fix it';
			$init_response->errors	= true;
			debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

			return $init_response;
		}else{
			// write test file
			$file_name = DEDALO_ENTITY .'_'. $user_id.'.cache_test_file.json';
			dd_cache::process_and_cache_to_file((object)[
				'process_file' => DEDALO_CORE_PATH . '/base/cache_test_file.php',
				'data' => (object)[
					'session_id' => session_id(),
					'user_id' => $user_id
				],
				'file_name' => $file_name,
				'wait' => true
			]);
			// read test file
			$cache_data = dd_cache::cache_from_file((object)[
				'file_name' => $file_name
			]);

			if (empty($cache_data)) {
				$init_response->msg[]	= 'Warning: cache data stream fails. Check your DEDALO_CACHE_MANAGER config to fix it';
				$init_response->errors	= true;
				debug_log(__METHOD__."  ".implode(PHP_EOL, $init_response->msg), logger::ERROR);

				return $init_response;
			}
		}
	}


// LANGS JS (moved to login.php !)
	#	# Generate js files with all labels (in not extist current lang file)
	#	$folder_path = DEDALO_CORE_PATH.'/common/js/lang';
	#	if( !is_dir($folder_path) ) {
	#		if(!mkdir($folder_path, 0775, true)) {
	#			$init_response->msg .= trim(" Error on read or create js/lang directory. Permission denied");
	#			return $init_response;
	#		}
	#		debug_log(__METHOD__." CREATED DIR: $folder_path  ".to_string(), logger::DEBUG);
	#	}
	#	$ar_langs 	 = DEDALO_APPLICATION_LANGS;
	#	foreach ($ar_langs as $lang => $label) {
	#		$label_path  = '/common/js/lang/' . $lang . '.js';
	#		if (!file_exists(DEDALO_CORE_PATH.$label_path)) {
	#			$ar_label = label::get_ar_label($lang); // Get all properties
	#				#dump($ar_label, ' ar_label');
	#
	#			file_put_contents( DEDALO_CORE_PATH.$label_path, 'var get_label='.json_encode($ar_label,JSON_UNESCAPED_UNICODE).'');
	#			debug_log(__METHOD__." Generated js labels file for lang: $lang - $label_path ".to_string(), logger::DEBUG);
	#		}
	#	}



// STRUCTURE CSS (moved to login.php !)
	// 	# Generate css structure file (in not extist)
	// 	$file_path = DEDALO_CORE_PATH.'/common/css/structure.css';
	// 	if (!file_exists($file_path)) {

	// 		$response = (object)css::build_structure_css();
	// 		debug_log(__METHOD__." Generated structure css file: ".$response->msg, logger::DEBUG);
	// 	}


	// // SEQUENCES TEST
	// 	require(DEDALO_CORE_PATH.'/db/class.data_check.php');
	// 	$data_check = new data_check();
	// 	$response 	= $data_check->check_sequences();
	// 	if ($response->result!=true) {
	// 		debug_log(__METHOD__." $response->msg ".to_string(), logger::WARNING);
	// 		if(isset($_SESSION['dedalo']['auth']['user_id']) && $_SESSION['dedalo']['auth']['user_id']==DEDALO_SUPERUSER) {
	// 			$init_response->msg .= trim("Error on ".$response->msg);
	// 			return $init_response;
	// 		}
	// 	}



// ALL IS OK
	$init_response->result	= true;
	if ($init_response->errors===false) {
		$init_response->msg[] = 'OK. init test successful';
	}else{
		array_unshift($init_response->msg, 'Init test passed with some warnings');
	}


	return $init_response;
