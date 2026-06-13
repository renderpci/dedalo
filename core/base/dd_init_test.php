<?php declare(strict_types=1);
/**
 * SYSTEM INTEGRITY CHECK (INITIALIZATION TEST)
 *
 * This script verifies the core system integrity, typically executed during the boot sequence
 * or upon user login. it ensures that all mandatory environment requirements are met,
 * including PHP version, required extensions, file system permissions, mandatory constants,
 * database connectivity, and external library availability.
 *
 * Each check is critical for the stability and security of Dédalo.
 * Failure in mandatory checks will stop execution and return an error response.
 *
 * @package Core\Base
 * @author Paco <paco@atenea-solutions.com>
 */



// default values
	$create_dir_permissions = 0750;
	$php_user = exec('whoami');



// user_id fix if not already defined
	if (!isset($user_id)) {
		$user_id = logged_user_id();
	}



// RESPONSE OBJECT
	// $init_response will hold the result of all checks.
	$init_response = new stdClass();
		$init_response->result			= false;
		$init_response->msg				= []; // Array of status/error messages
		$init_response->errors			= []; // Array of critical errors (e.g. [true, true])
		$init_response->result_options	= null; // Optional data (e.g., redirect URL)



// PHP VERSION CHECK
	// Ensures the server meets the minimum PHP version required for v7 features
	// such as strict typing, constructor promotion, and performance optimizations.
	$minimum = '8.4.0';
	if (system::test_php_version_supported( $minimum )===false) {

		$init_response->msg[]	= 'Error. This php version '.PHP_VERSION.' is not supported by Dédalo. Update PHP to '.$minimum.' or higher ASAP';
		$init_response->errors[] = 'Unsupported PHP version ' . PHP_VERSION;
		debug_log(
			implode(PHP_EOL, (array)$init_response->msg) . PHP_EOL
			.' test_php_version_supported: ' . to_string( system::test_php_version_supported() ) . PHP_EOL
			.' PHP_VERSION: ' . PHP_VERSION . PHP_EOL
			.' minimum: ' . $minimum
			, logger::ERROR
		);

		return $init_response;
	}



// MANDATORY CONSTANTS CHECK
	// Verifies that all path and URL constants introduced or required in current version
	// are defined in the config file. These are essential for routing and file access.
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
			$init_response->msg[] = 'Error Processing Request: mandatory constant: '.$name.' is not defined in config file';
			$init_response->errors[] = 'Constant '.$name.' is not defined in config file';
			debug_log(
				implode(PHP_EOL, $init_response->msg)
				, logger::ERROR
			);

			return $init_response;
		}
	}



// MULTIBYTE STRING (MBSTRING) CHECK
	// Dédalo relies heavily on multibyte string functions for internationalization
	// and proper handling of UTF-8 data.
	if (!function_exists('mb_internal_encoding')) {

		$init_response->msg[] = 'Error. mb_internal_encoding is required by Dédalo. Please install php mbstring to continue';
		$init_response->errors[] = 'Missing mbstring extension';
		debug_log(
			implode(PHP_EOL, $init_response->msg)
			, logger::ERROR
		);

		return $init_response;
	}



// SESSIONS DIRECTORY CHECK
	// Verifies that the sessions directory is writable by the PHP user.
	// This is critical for maintaining user state and security tokens.
	if (defined('DEDALO_SESSIONS_PATH')) {
		// verify directory already exists
		$dir_exists = system::check_sessions_path();
		if( !$dir_exists ){
			$init_response->msg[] = 'Error. Unable to write sessions. Review your permissions for sessions directory path (php user: $php_user)';
			$init_response->errors[] = 'Sessions dir permission denied';
			debug_log(
				implode(PHP_EOL, $init_response->msg)
				, logger::ERROR
			);
			return $init_response;
		}
		// Maintenance Task: cleanup expired session files to prevent disk bloat.
		system::delete_old_sessions_files();
	}



// CACHE DIRECTORY CHECK
	// Verifies that the cache directory is writable by the PHP user.
	// This is critical for caching frequently accessed data like security trees.
	if (defined('DEDALO_CACHE_PATH')) {
		// verify directory already exists
		$dir_exists = system::check_cache_path();
		if( !$dir_exists ){
			$init_response->msg[] = 'Error. Unable to write cache. Review your permissions for cache directory path (php user: $php_user)';
			$init_response->errors[] = 'Cache dir permission denied';
			debug_log(
				implode(PHP_EOL, $init_response->msg)
				, logger::ERROR
			);
			return $init_response;
		}
		// Maintenance Task: cleanup expired cache files to prevent disk bloat.
		system::delete_old_cache_files();
	}



// BACKUPS DIRECTORY CHECK
	// Ensures the main backup directory exists and is writable.
	// Dédalo uses this for database dumps, ontology exports, and temporary migration files.
	if (!system::check_backup_path()) {
		$init_response->msg[] = "Error on read or create backups directory. (php user: $php_user)";
		$init_response->errors[] = 'Backups dir permission denied';
		debug_log(
			implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' folder_path: ' . DEDALO_BACKUP_PATH
			, logger::ERROR
		);

		return $init_response;
	}



// DEDALO_BACKUP_PATH_ONTOLOGY CHECK
	// Verifies the specific directory for ontology backups.
	$folder_path = DEDALO_BACKUP_PATH_ONTOLOGY;
	if (!system::check_directory($folder_path)) {
		$init_response->msg[] = "Error on read or create backup_path_ontology directory. Permission denied (php user: $php_user)";
		$init_response->errors[] = 'Backup ontology dir permission denied';
		debug_log(
			implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' folder_path: ' . $folder_path
			, logger::ERROR
		);

		return $init_response;
	}



// ONTOLOGY DATA I/O CHECK
	// This directory is used for importing/exporting ontology data packages.
	if (defined('ONTOLOGY_DATA_IO_DIR')) {
		$folder_path = ONTOLOGY_DATA_IO_DIR;
		if (!system::check_directory($folder_path)) {
			$init_response->msg[] = "Error on read or create ONTOLOGY_DATA_IO_DIR directory. Permission denied (php user: $php_user)";
			$init_response->errors[] = 'ONTOLOGY_DATA_IO_DIR dir permission denied';
			debug_log(
				implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' . $folder_path
				, logger::ERROR
			);

			return $init_response;
		}
	}



// TEMPORARY BACKUP CHECK
	// Directory for transient backup files during multi-step operations.
	$folder_path = DEDALO_BACKUP_PATH_TEMP;
	if (!system::check_directory($folder_path)) {
		$init_response->msg[] = "Error on read or create backup temp directory. Permission denied";
		$init_response->errors[] = 'Backup temp dir permission denied';
		debug_log(
			implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' folder_path: ' .$folder_path
			, logger::ERROR
		);

		return $init_response;
	}



// MEDIA FOLDER
	// Target folder exists test
	$folder_path = DEDALO_MEDIA_PATH;
	if (!system::check_directory($folder_path)) {
		$init_response->msg[] = "Error on read or create 'media' directory. Permission denied";
		$init_response->errors[] = 'Media dir permission denied';
		debug_log(
			implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' folder_path: ' .$folder_path
			, logger::ERROR
		);

		return $init_response;
	}



// MEDIA AUDIO/VIDEO QUALITY FOLDERS CHECK
	// Dédalo stores different versions of AV files (low res, high res, posterframes, subtitles).
	// These directories must exist and be writable for the media processor.
	$ar_folder = DEDALO_AV_AR_QUALITY;
	$ar_folder[] = 'posterframe'; // append posterframe as quality only to force iterate it
	$ar_folder[] = 'subtitles'; // append subtitles as quality only to force iterate it
	foreach ($ar_folder as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER .'/'. $quality;
		if (!system::check_directory($folder_path)) {
			$init_response->msg[] = "Error on read or create media quality: '$quality' directory. Permission denied";
			$init_response->errors[] = "Media AV quality '$quality' dir permission denied";
			debug_log(
				implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path . PHP_EOL
				.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
				, logger::ERROR
			);

			return $init_response;
		}
	}



// MEDIA IMAGE QUALITY FOLDERS CHECK
	// Ensures directories for different image derivatives (thumbnails, web versions, etc.) exist.
	$ar_quality = DEDALO_IMAGE_AR_QUALITY;
	$ar_quality[] = 'svg'; // ensured support for vector graphics
	foreach ($ar_quality as $quality) {
		$folder_path = DEDALO_MEDIA_PATH . DEDALO_IMAGE_FOLDER . '/'. $quality;
		if (!system::check_directory($folder_path)) {
			$init_response->msg[] = "Error on read or create image quality '$quality' directory. Permission denied (php user: $php_user)";
			$init_response->errors[] = "Media Image quality '$quality' dir permission denied";
			debug_log(
				implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path
				, logger::ERROR
			);

			return $init_response;
		}
	}



// MEDIA PDF QUALITY FOLDERS CHECK
	// If PDF support is enabled, verifies directories for PDF derivatives and thumbnails.
	if(defined('DEDALO_PDF_FOLDER')) {
			$ar_quality = DEDALO_PDF_AR_QUALITY;
			$ar_quality[] = DEDALO_QUALITY_THUMB;
			foreach ($ar_quality as $quality) {
				$folder_path = DEDALO_MEDIA_PATH . DEDALO_PDF_FOLDER . '/'. $quality;
				if (!system::check_directory($folder_path)) {
					$init_response->msg[] = "Error on read or create pdf quality '$quality' directory. Permission denied (php user: $php_user)";
					$init_response->errors[] = "Media PDF quality '$quality' dir permission denied";
					debug_log(
						implode(PHP_EOL, $init_response->msg) . PHP_EOL
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
			$init_response->msg[] = "Error on read or create 3d quality '$quality' directory. Permission denied (php user: $php_user)";
			$init_response->errors[] = "Media 3D quality '$quality' dir permission denied";
			debug_log(
				implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path
				, logger::ERROR
			);

			return $init_response;
		}
	}



// MEDIA SVG QUALITY FOLDERS CHECK
	// If SVG support is defined, verifies the main SVG folder and its quality derivatives.
	if(defined('DEDALO_SVG_FOLDER')) {
			$folder_path = DEDALO_MEDIA_PATH . DEDALO_SVG_FOLDER ;
			if (!system::check_directory($folder_path)) {
				$init_response->msg[] = "Error on read or create SVG directory. Permission denied (php user: $php_user)";
				$init_response->errors[] = 'Media SVG dir permission denied';
				debug_log(
					implode(PHP_EOL, $init_response->msg) . PHP_EOL
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
					$init_response->msg[] = "Error on read or create svg quality '$quality' directory. Permission denied (php user: $php_user)";
					$init_response->errors[] = "Media SVG quality '$quality' dir permission denied";
					debug_log(
						implode(PHP_EOL, $init_response->msg) . PHP_EOL
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

			$init_response->msg[] = "Error on read or create media DEDALO_HTML_FILES_FOLDER default directory. Permission denied (php user: $php_user)";
			$init_response->errors[] = 'Media HTML files dir permission denied';
			debug_log(
				implode(PHP_EOL, $init_response->msg) . PHP_EOL
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

			$init_response->msg[] = "Error on read or create media DEDALO_IMAGE_WEB_FOLDER default directory. Permission denied (php user: $php_user)";
			$init_response->errors[] = 'Media web images dir permission denied';
			debug_log(
				implode(PHP_EOL, $init_response->msg) . PHP_EOL
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

			$init_response->msg[] = "Error on read or create media DEDALO_TOOL_EXPORT_FOLDER_PATH default directory. Permission denied (php user: $php_user)";
			$init_response->errors[] = 'Tool export dir permission denied';
			debug_log(
				implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' folder_path: ' .$folder_path . PHP_EOL
				.' create_dir_permissions: ' . to_string($create_dir_permissions) . PHP_EOL
				, logger::ERROR
			);

			return $init_response;
		}
	}



// MEDIA PROTECTION CHECK
	// Verifies if media files are protected via .htaccess or similar mechanisms.
	if(defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true) {
		/*
		# Test .htaccess file existence
		$htaccess_file = DEDALO_MEDIA_PATH . '/.htaccess';
		if (!file_exists($htaccess_file)) {
			$init_response->msg[] = "Warning: Error on read protect file for av directory. File '.htaccess' not found";
		}
		*/
	}



// DEDALO_UPLOAD_TMP_DIR
	$folder_path = DEDALO_UPLOAD_TMP_DIR;
	if (!system::check_directory($folder_path)) {

		$init_response->msg[] = "Error on read or create DEDALO_UPLOAD_TMP_DIR directory. Permission denied (php user: $php_user)";
		$init_response->errors[] = 'Upload tmp dir permission denied';

		return $init_response;
	}
	// write dir inside
	if(!create_directory(
		DEDALO_UPLOAD_TMP_DIR . '/test',
		$create_dir_permissions
	)) {
		$init_response->msg[] = "Error on create DEDALO_UPLOAD_TMP_DIR /test directory. Permission denied (php user: $php_user)";
		$init_response->errors[] = 'Upload tmp/test dir permission denied';
		return $init_response;
	}



// IMPORT DIR
	$folder_path = DEDALO_MEDIA_PATH . '/import';
	if (!system::check_directory($folder_path)) {

		$init_response->msg[] = "Error on read or create import directory. Permission denied (php user: $php_user)";
		$init_response->errors[] = 'Import dir permission denied';

		return $init_response;
	}
	// write dir inside
	if(!create_directory(
		DEDALO_MEDIA_PATH . '/import/test',
		$create_dir_permissions
	)) {
		$init_response->msg[] = "Error on create DEDALO_MEDIA_PATH . '/import/test' directory. Permission denied (php user: $php_user)";
		$init_response->errors[] = 'Import test dir permission denied';
		return $init_response;
	}


// IMPORT HISTORY DIR
	$folder_path = DEDALO_MEDIA_PATH . '/import/history';
	if (!system::check_directory($folder_path)) {

		$init_response->msg[] = "Error on read or create import history directory. Permission denied (php user: $php_user)";
		$init_response->errors[] = 'Import history dir permission denied';

		return $init_response;
	}



// POSTGRESQL CLIENT (PSQL) CHECK
	// Dédalo requires the 'psql' binary for database operations, imports, and maintenance.
	// If DEDALO_DB_MANAGEMENT is false, this check is skipped as DB is managed externally.
	if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
		// Nothing to do
	}else{
		$path	= DB_BIN_PATH . 'psql';
		$res	= shell_exec('command -v '. $path);
		$psql	= is_string($res)
			? trim($res)
			: $res;
		if (empty($psql)) {

			$init_response->msg[] = 'Error: psql not found at: '.$path . PHP_EOL . ' Review your PostgreSQL installation or your db config file';
			$init_response->errors[] = 'psql binary not found';
			debug_log(__METHOD__
				.' '.implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' path: ' .$path . PHP_EOL
				.' psql: ' . to_string($psql) . PHP_EOL
				, logger::ERROR
			);

			return $init_response;
		}
	}



// PGPASS FILE CHECK
	// Verifies the existence and readability of the .pgpass file for passwordless DB access.
	// Failure here is often a warning because some environments might use other auth methods.
	if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===true) {
		if (!system::check_pgpass_file()) {

			$php_user_home	= getenv('HOME'); //$_SERVER['HOME'];
			$path			= $php_user_home . '/.pgpass';

			$init_response->msg[] = 'Warning: Invalid .pgpass file' . PHP_EOL . ' Check your .pgpass file into php user home dir';
			$init_response->errors[] = 'Invalid .pgpass file';
			debug_log(
				implode(PHP_EOL, $init_response->msg) . PHP_EOL
				.' php_user_home: ' . to_string($php_user_home) . PHP_EOL
				.' path: ' . to_string($path) . PHP_EOL
				, logger::ERROR
			);
			// Do not stop here. Only inform the user.
		}
	}



// IMAGEMAGICK CHECK
	// ImageMagick is mandatory for image processing, resizing, and format conversion.
	$imagemagick_version = ImageMagick::get_version();
	if (empty($imagemagick_version)) {

		$init_response->msg[] = 'Error on system test. ImageMagick lib not found. Review your config path';
		$init_response->errors[] = 'ImageMagick not found';
		debug_log(
			implode(PHP_EOL, $init_response->msg) .PHP_EOL
			.'path: ' . ImageMagick::get_imagemagick_installed_path()
			, logger::ERROR
		);

		return $init_response;
	}



// FFMPEG CHECK
	// ffmpeg is mandatory for any audio or video processing in Dédalo.
	$ffmpeg_version = Ffmpeg::get_version();
	if (empty($ffmpeg_version)) {

		$init_response->msg[] = 'Error on system test. ffmpeg lib not found';
		$init_response->errors[] = 'ffmpeg not found';
		debug_log(
			implode(PHP_EOL, $init_response->msg) .PHP_EOL
			.' ffmpeg_path: ' . Ffmpeg::get_ffmpeg_installed_path()
			, logger::ERROR
		);

		return $init_response;
	}



// FFPROBE
	$ffprove_version = Ffmpeg::get_ffprove_version();
	if (empty($ffprove_version)) {

		$init_response->msg[] = 'Error on system test. ffprobe lib not found';
		$init_response->errors[] = 'ffprobe not found';
		debug_log(
			implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' ffprove_path: ' . Ffmpeg::get_ffprove_installed_path()
			, logger::ERROR
		);

		return $init_response;
	}



// QT-FASTSTART
	$qt_faststart = trim(shell_exec('command -v '.DEDALO_AV_FASTSTART_PATH));
	if (empty($qt_faststart)) {

		$init_response->msg[] = 'Error on system test. qt-faststart lib not found';
		$init_response->errors[] = 'qt-faststart not found';
		debug_log(
			implode(PHP_EOL, $init_response->msg) . PHP_EOL
			.' DEDALO_AV_FASTSTART_PATH: ' . DEDALO_AV_FASTSTART_PATH
			, logger::ERROR
		);

		return $init_response;
	}



// DEFAULT PROJECT CONFIG CHECK
	// Ensures that essential configuration for the default project and section type filtering is set.
	if (!defined('DEDALO_DEFAULT_PROJECT') || !defined('DEDALO_FILTER_SECTION_TIPO_DEFAULT')) {

		$init_response->msg[] = 'Error Processing Request. Please define config DEDALO_DEFAULT_PROJECT and DEDALO_FILTER_SECTION_TIPO_DEFAULT';
		$init_response->errors[] = 'Missing default project config';
		debug_log(
			implode(PHP_EOL, $init_response->msg)
			, logger::ERROR
		);

	    return $init_response;
	}



// CURL
	if (!system::check_curl()) {

		$init_response->msg[] = 'Error Processing Request. Curl: function "curl_init" not found. Please review your PHP configuration';
		$init_response->errors[] = 'Curl extension missing';
		debug_log(
			implode(PHP_EOL, $init_response->msg)
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

		$init_response->msg[] = 'Error Processing Request: OPEN_SSL lib is not available';
		$init_response->errors[] = 'OpenSSL extension missing';
		debug_log(
			implode(PHP_EOL, $init_response->msg)
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

			$init_response->msg[] = 'Table matrix_test is not available. Auto-created table matrix_test';
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
					$init_response->msg[] = "Error Processing Request: Table matrix_tools is not available and it is not possible to create it";
					return $init_response;
				}

				// $init_response->msg = 'Warning. Redirect to Area Maintenance to update Dédalo data';
				$init_response->result_options	= (object)[
					'redirect'	=> DEDALO_CORE_URL .'/page/?t=' . DEDALO_AREA_MAINTENANCE_TIPO // dd88
				];

			}else{

				// Only user 'root' is allow to access Development Area. Stop execution here

				$init_response->msg[] = 'Table matrix_tools is not available. Please, login as Dédalo superuser (root) to grant access to Development Area. You need to update your Dédalo data, ontology and register the tools';
				return $init_response;
			}
		}
	}



// CACHE MANAGER CHECK
	// Dédalo uses a cache manager to store frequently accessed data.
	// This check verifies that the cache directory is writable and the file-based cache stream is functional.
	if (!defined('DEDALO_CACHE_MANAGER') || empty(DEDALO_CACHE_MANAGER)) {

		$init_response->msg[] = 'Error Processing Request: DEDALO_CACHE_MANAGER is mandatory. Please check your config file and set a valid value. You can see some examples in sample.config file';
		$init_response->errors[] = 'DEDALO_CACHE_MANAGER config missing';
		debug_log(
			implode(PHP_EOL, $init_response->msg)
			, logger::ERROR
		);

		return $init_response;
	}else{

		// Resolve cache path: DEDALO_CACHE_PATH takes priority over DEDALO_CACHE_MANAGER files_path
		$files_path = defined('DEDALO_CACHE_PATH')
			? DEDALO_CACHE_PATH
			: (DEDALO_CACHE_MANAGER['files_path'] ?? null);

		// create directory if is not already created
		if (!empty($files_path)) {
			// create directory if it does not already exist
			if (!system::check_directory($files_path)) {

				$init_response->msg[] = 'Warning: Unable to access or create cache dir: '.$files_path . PHP_EOL . ' Check your DEDALO_CACHE_MANAGER config to fix it';
				$init_response->errors[] = 'Cache dir permission denied';
				debug_log(
					implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' files_path: ' . $files_path
					, logger::ERROR
				);

				return $init_response;
			}
		}

		if (!empty($files_path) && !is_dir($files_path) ) {

			$init_response->msg[] = 'Warning: Cache dir unavailable at: '.$files_path . PHP_EOL . ' Check your DEDALO_CACHE_MANAGER config to fix it';
			$init_response->errors[] = 'Cache dir unavailable';
			debug_log(
				implode(PHP_EOL, (array)$init_response->msg) . PHP_EOL
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
				$init_response->msg[] = 'Warning: cache data stream fails. Check your DEDALO_CACHE_MANAGER config or your PHP bin path (config_db.php PHP_BIN_PATH) to fix it';
				$init_response->errors[] = 'Cache data stream failed';
				debug_log(
					implode(PHP_EOL, $init_response->msg) . PHP_EOL
					.' file_name: ' . $file_name
					, logger::ERROR
				);

				return $init_response;
			}else{
				// delete test file
				$delete_cache = dd_cache::delete_cache_files([
					$file_name // file name
				]);
				if ($delete_cache!==true) {
					$init_response->msg[] = 'Warning: delete cache test file fails. Check your DEDALO_CACHE_MANAGER files_path permissions to fix it';
					$init_response->errors[] = 'Cache test file delete failed';
					debug_log(
						implode(PHP_EOL, $init_response->msg)
						, logger::ERROR
					);

					return $init_response;
				}
			}
		}
	}



// TEMPORAL CHUNK CLEANUP
	// Maintenance Task: cleanup broken or abandoned upload file chunks.
	if (defined('DEDALO_UPLOAD_SERVICE_CHUNK_FILES') && DEDALO_UPLOAD_SERVICE_CHUNK_FILES!==false) {
		try {
			system::remove_old_chunk_files();
		} catch (Exception $e) {
			debug_log(
				" Error on clean CHUNK_FILES " . PHP_EOL
				. $e->getMessage()
				, logger::ERROR
			);
		}
	}



// ONTOLOGY RECOVERY CHECK
	// Ensures the 'dd_ontology_recovery' table exists, restoring it from file if necessary.
	$dd_ontology_recovery_exists	= DBi::check_table_exists('dd_ontology_recovery');
	if (!$dd_ontology_recovery_exists) {
		install::restore_dd_ontology_recovery_from_file();
	}



// FINAL RESULT AGGREGATION
	$init_response->result = true;
	if (empty($init_response->errors)) {
		$init_response->msg[] = 'OK. init test successful';
	}else{
		array_unshift($init_response->msg, 'Init test passed with some warnings');
	}

	return $init_response;
