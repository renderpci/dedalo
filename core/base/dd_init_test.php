<?php declare(strict_types=1);
/**
* SYSTEM INTEGRITY CHECK (INITIALIZATION TEST)
* Procedural boot-time script that verifies all mandatory runtime requirements
* before Dédalo accepts any user request.
*
* Responsibilities (executed in order):
* - PHP version gate (minimum 8.4.0 for strict typing, constructor promotion, etc.)
* - Mandatory config constants defined in the installation's config file
* - PHP mbstring extension availability (required for all UTF-8 / multilingual text handling)
* - File-system write access for sessions, backups, media derivation trees, upload scratch space,
*   and the import pipeline
* - External binary availability: psql, ImageMagick, ffmpeg, ffprobe, qt-faststart
* - CURL extension and OpenSSL extension
* - Active-lock garbage collection (when DEDALO_LOCK_COMPONENTS is enabled)
* - PostgreSQL table existence checks for matrix_test and matrix_tools, with
*   auto-creation and superuser redirect when they are missing
* - File-based cache smoke test (write → read → delete a probe file)
* - Temporary chunk-file cleanup for abandoned multi-part uploads
* - dd_ontology_recovery table existence, restored from disk snapshot on absence
*
* Usage contract:
* - This script is included (not required) by the boot loader, never executed directly.
*   It returns a stdClass $init_response on every exit path (early return on any failure,
*   final return at the bottom). Callers MUST check $init_response->result === true.
* - $user_id MAY be preset by the caller (e.g. from the active session). When absent,
*   the script resolves it via logged_user_id().
* - $create_dir_permissions is set here and can be used by the caller after include; it is
*   not exposed outside the script's own use.
*
* $init_response shape:
*   result         bool   - true only when every mandatory check passes
*   msg            array  - human-readable status/warning/error strings (accumulated)
*   errors         array  - machine-readable error keys (one per failed check)
*   result_options object|null - optional payload, e.g. ['redirect' => URL] for
*                               the superuser matrix_tools bootstrap redirect
*
* @package Dédalo
* @subpackage Core
*/



// default values
// $create_dir_permissions: octal mode applied to any directories created by this script.
// 0750 gives rwxr-x--- (owner full, group read/execute, world none) — suitable for a web-server
// process that is the only writer and should not expose files to other system users.
// $php_user: resolved at runtime for inclusion in diagnostic messages; helps ops trace which
// system account lacks the required directory permissions.
	$create_dir_permissions = 0750;
	// Prefer the real process user via whoami, but exec() may be disabled (disable_functions).
	// Fall back to pure-PHP sources so diagnostics never show an empty user.
	$php_user = function_exists('exec') ? (string) @exec('whoami') : '';
	if ($php_user === '') {
		$php_user = (function_exists('posix_geteuid') && function_exists('posix_getpwuid'))
			? (posix_getpwuid(posix_geteuid())['name'] ?? get_current_user())
			: get_current_user();
	}



// user_id fix if not already defined
// The boot loader may have already resolved $user_id from the active session before including
// this script. When it has not (e.g. during a lightweight API ping or early install probe),
// logged_user_id() reads from the current PHP session. The value is used later for the
// matrix_tools superuser check and for the cache smoke test.
	if (!isset($user_id)) {
		$user_id = logged_user_id();
	}



// RESPONSE OBJECT
// Initialised to result=false; only the very last statement in the script sets it to true.
// This ensures any early return (missing constant, failed directory, missing binary, etc.)
// returns a failure object without the caller having to inspect msg/errors.
	$init_response = new stdClass();
		$init_response->result			= false;
		$init_response->msg				= []; // Accumulates human-readable status/warning/error strings
		$init_response->errors			= []; // Accumulates machine-readable error keys (one per failed check)
		$init_response->result_options	= null; // Optional payload, e.g. (object)['redirect' => URL]



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
// These constants must be present in the installation's config file (typically config.php /
// config_db.php). Their absence indicates an incomplete or outdated configuration.
// The loop stops at the first missing constant and returns an error; a single missing
// constant can cause cascading undefined-constant fatal errors throughout the codebase.
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
// DEDALO_SESSIONS_PATH may be left undefined in configurations that rely on the system-default
// PHP session path. Only perform the check when the constant is explicitly set, which signals
// that the installation manages its own session directory (recommended for multi-tenant setups).
	if (defined('DEDALO_SESSIONS_PATH')) {
		// verify directory already exists
		// system::check_sessions_path() also creates the directory if writable by the PHP user.
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
		// Maintenance Task: cleanup expired sessions and cache files to prevent disk bloat.
		// Pruning is opportunistic (runs on each login), not a dedicated cron, so it adds
		// a small I/O burst here but avoids a separate daemon dependency.
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
// Dédalo stores transcoded AV files in per-quality subdirectories under DEDALO_AV_FOLDER.
// DEDALO_AV_AR_QUALITY holds the configured quality tiers (e.g. 'low', 'high').
// 'posterframe' and 'subtitles' are not quality variants in the encoding sense but still
// require their own subdirectories and are therefore appended here to reuse the same loop.
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
// Ensures directories for every configured image derivative (thumbnails, web-optimised, etc.)
// exist and are writable. The 'svg' subfolder is appended unconditionally: SVG files are
// re-encoded/sanitised and stored as image derivatives alongside raster quality tiers even
// when the optional DEDALO_SVG_FOLDER constant (for the main SVG media type) is not defined.
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
// PDF support is optional; the whole block is skipped when DEDALO_PDF_FOLDER is not defined.
// When enabled, DEDALO_PDF_AR_QUALITY lists the page-image quality variants, and
// DEDALO_QUALITY_THUMB is appended to ensure the thumbnail subdirectory also exists.
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
// Like AV files, 3D models are stored in per-quality subdirectories.
// A 'posterframe' subdirectory is also required for 3D model preview images (cover images
// generated by the viewer), mirroring the same convention used for AV assets above.
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
// DEDALO_SVG_FOLDER enables the dedicated SVG media type (scalable vector graphics stored as
// first-class media assets, e.g. infographics or architectural plans). When defined, both
// the root SVG folder and each per-quality subdirectory under it must be writable.
// Note: 'svg' as an image-quality variant for raster images is handled above in the image
// quality loop and is independent of this block.
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
// Optional folder for storing self-contained HTML export artefacts (e.g. interactive
// publications generated by diffusion). Skipped when DEDALO_HTML_FILES_FOLDER is not defined.
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
// Optional subfolder inside DEDALO_IMAGE_FOLDER for browser-optimised image variants
// (typically smaller JPEG/WebP files served to end-users without authentication).
// Skipped when DEDALO_IMAGE_WEB_FOLDER is not defined.
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
// Directory where tool_export writes its output bundles (NDJSON, ZIP, etc.).
// Checked separately from the general media tree because it may be configured on a
// different volume or mount point to keep export artefacts off the media NAS.
// Skipped when DEDALO_TOOL_EXPORT_FOLDER_PATH is not defined.
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
// When DEDALO_PROTECT_MEDIA_FILES is true, media files are served through a PHP/Nginx
// authentication gate instead of being publicly accessible via the web server.
// The commented-out .htaccess check below was used for Apache-based protection; it is
// retained in case an Apache-based protection path needs to be revived. See
// docs/development/using_media_components.md and the media-access-control-markers memory
// entry for the current token-based protection architecture.
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
// Scratch space for incoming multi-part file uploads (chunk assembly).
// Two checks are performed:
//   1. The directory itself is accessible/creatable by the PHP user.
//   2. A subdirectory '/test' can be created inside it, confirming that the PHP user
//      can write INTO the directory, not just that the directory inode exists.
// The second check catches situations where the directory is mounted read-only or
// owned by a different user with 0755 permissions.
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
// Root landing zone for data imports (CSV, JSON, Dédalo export bundles, etc.).
// The same two-level writability check used for DEDALO_UPLOAD_TMP_DIR is applied here:
// directory existence + ability to create a subdirectory inside it.
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
// Stores completed import logs and imported source files for audit and replay purposes.
// Located under the import directory so the same filesystem permissions apply.
	$folder_path = DEDALO_MEDIA_PATH . '/import/history';
	if (!system::check_directory($folder_path)) {

		$init_response->msg[] = "Error on read or create import history directory. Permission denied (php user: $php_user)";
		$init_response->errors[] = 'Import history dir permission denied';

		return $init_response;
	}



// POSTGRESQL CLIENT (PSQL) CHECK
// Dédalo's backup, restore, and maintenance tools invoke psql directly via shell_exec.
// When DEDALO_DB_MANAGEMENT===false the PostgreSQL instance is managed by an external
// service (e.g. a managed cloud database) and Dédalo does not need local binary access.
// 'command -v <path>' is used instead of 'which' for POSIX portability; it returns the
// resolved path when the binary is accessible, or empty output when it is not found.
	if (defined('DEDALO_DB_MANAGEMENT') && DEDALO_DB_MANAGEMENT===false) {
		// Nothing to do
	}else{
		// Resolve psql robustly (configured DB_BIN_PATH → platform base → PATH) so a fresh install
		// on a non-standard layout (e.g. a Homebrew Mac) passes without hand-editing config.
		$path	= system::get_pg_bin_path() . 'psql';
		$res	= shell_exec('command -v '. escapeshellarg($path));
		// trim() is safe on null as of PHP 8.x but $res is cast to string first to satisfy
		// strict-types; the ternary keeps the null branch visible for future type-strictness.
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



// PostgreSQL CLI authentication note
// Dédalo no longer requires a ~/.pgpass file. The command-line tools (psql, pg_dump,
// pg_restore) authenticate via the PGPASSWORD env var, exported transiently from
// DEDALO_PASSWORD_CONN around each child process (see DBi::pg_shell_exec / DBi::pg_exec).
// This lets the database live on a LOCAL or REMOTE server indistinguishably. A ~/.pgpass
// file is still honored by libpq as a fallback when DEDALO_PASSWORD_CONN is empty
// (e.g. peer / trust auth), so no startup check is needed here.



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
// ffprobe (the MediaInfo companion to ffmpeg) is used to read audio/video file metadata
// before transcoding (duration, codec, bitrate, etc.).
// (!) The Ffmpeg class and its methods use the identifier 'ffprove' (note the typo) throughout
// the codebase — this matches the actual method names Ffmpeg::get_ffprove_version() and
// Ffmpeg::get_ffprove_installed_path(). Do not rename $ffprove_version to 'ffprobe_version'
// without renaming the Ffmpeg class methods in core/media_engine/class.Ffmpeg.php first.
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
// qt-faststart (part of the FFmpeg project) re-orders MPEG-4/MOV moov atoms to the beginning
// of the file so that the browser can begin playback before the full file is downloaded
// (progressive download / pseudo-streaming). Without it, videos are not streamable.
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
// Stale-lock garbage collection is no longer run on every bootstrap. The hot path now
// self-heals: lock_components::update_lock_components_state() prunes expired entries
// (drop_expired) inside the row-locked transaction on every focus/blur, and the short
// LOCK_TTL_SECONDS bounds how long an abandoned lock can survive. The explicit sweep
// lock_components::clean_locks_garbage() remains available for the maintenance area.
// (Guard site kept intentionally for reviewability; it deliberately does nothing here.)
	if(defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {
		if (defined('DEDALO_LOCK_COMPONENTS') && DEDALO_LOCK_COMPONENTS===true) {
			// no-op: lazy GC handles stale locks on each registry mutation
		}
	}



// OPENSSL CHECK
// OpenSSL is required for encrypting/decrypting sensitive data (API tokens, stored credentials,
// media access signatures). The check uses function_exists on 'openssl_encrypt' as a lightweight
// probe; if the extension is loaded, all other openssl_* functions are also available.
	if (!function_exists('openssl_encrypt')) {

		$init_response->msg[] = 'Error Processing Request: OPEN_SSL lib is not available';
		$init_response->errors[] = 'OpenSSL extension missing';
		debug_log(
			implode(PHP_EOL, $init_response->msg)
			, logger::ERROR
		);

		return $init_response;
	}



// MATRIX_TOOLS / MATRIX_TEST TABLE CHECK
// These two PostgreSQL tables mirror the schema of the main 'matrix' table (all columns,
// constraints, indexes, storage, and comments via the LIKE … INCLUDING … clause) and are
// used exclusively by the Development Area:
//   - matrix_test:  Disposable sandbox table for generating and discarding test records.
//   - matrix_tools: Stores tool configuration and registration data consumed by the tools
//                   subsystem (tool_paths, tool_security, tool_ontology_map, etc.).
//
// Both tables are created automatically (with IF NOT EXISTS) the first time a fully-installed
// Dédalo instance encounters a missing table. This allows them to be added via an incremental
// Dédalo update without a manual DBA step.
//
// The matrix_tools creation path has an additional superuser gate:
//   - If $user_id == DEDALO_SUPERUSER (root), the table is auto-created and the response
//     carries a redirect to the Maintenance Area so the admin can run the data-update wizard.
//   - All other users receive an error and execution stops; non-root users must not access
//     the Development Area when the tools table is absent (it would yield empty tool sets).
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
				// result_options carries the redirect URL that the caller (boot loader / login handler)
				// must honour to send the superuser to the Maintenance Area for the data-update wizard.
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
// DEDALO_CACHE_MANAGER is a PHP constant array defined in config_db.php that configures the
// file-based cache layer used by dd_cache (security-access trees, tool lists, user preferences,
// etc.). The constant must define at least 'files_path' when file caching is active.
//
// Three-step validation:
//   1. Constant is defined and non-empty — a missing constant stops execution immediately.
//   2. The cache directory is accessible/creatable by the PHP user.
//   3. A smoke test writes a real cache probe file (via dd_cache::process_and_cache_to_file with
//      wait=true so the sub-process finishes before we read back), reads it, then deletes it.
//      This validates not only directory permissions but also that PHP_BIN_PATH is correct and
//      the background cache-writing sub-process can be spawned and complete successfully.
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

		// Secondary directory sanity check: after system::check_directory() (which may have
		// just created the directory), confirm is_dir() to rule out a symlink that points
		// to a non-directory target or a race condition on networked filesystems.
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
			// $test_user_id defaults to 0 when $user_id is null (anonymous/pre-login boot)
			// so that dd_cache can still derive a valid cache file name prefix.
			$test_user_id	= $user_id ?? 0;
			$file_name		= 'cache_test_file.json';
			dd_cache::process_and_cache_to_file((object)[
				'process_file'	=> DEDALO_CORE_PATH . '/base/cache_test_file.php',
				'data'			=> (object)[
					'session_id'	=> session_id(),
					'user_id'		=> $test_user_id
				],
				'file_name'	=> $file_name,
				'wait'		=> true  // synchronous: block until the sub-process writes the file
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
// Multi-part uploads leave partial chunk files on disk if a browser tab is closed mid-upload
// or a network error prevents the client from sending a 'finalize' request. This maintenance
// task removes chunks older than the configured TTL. Wrapped in try/catch because filesystem
// errors here are non-fatal; a warning is logged but boot continues.
// Skipped when DEDALO_UPLOAD_SERVICE_CHUNK_FILES is false (chunked upload is disabled).
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
// 'dd_ontology_recovery' is a PostgreSQL table that holds a snapshot of the ontology
// used as a fallback when the primary ontology data is corrupt or unavailable.
// If the table is missing (e.g. after a bare-metal restore without this table), the
// snapshot is re-imported from the on-disk JSON file via install::restore_dd_ontology_recovery_from_file(),
// which delegates to install_ontology_manager::restore_dd_ontology_recovery_from_file().
// This is a silent self-healing step — no error is raised and boot continues normally.
	// Only self-heal on an INSTALLED system. On a fresh install there is no database yet, so
	// check_table_exists returns false and a restore attempt would just gunzip→psql against a
	// missing DB (harmless but noisy). The recovery table is seeded by the normal install import.
	if (defined('DEDALO_INSTALL_STATUS') && DEDALO_INSTALL_STATUS==='installed') {
		$dd_ontology_recovery_exists	= DBi::check_table_exists('dd_ontology_recovery');
		if (!$dd_ontology_recovery_exists) {
			install::restore_dd_ontology_recovery_from_file();
		}
	}



// FINAL RESULT AGGREGATION
// Reaching this point means all mandatory checks passed. Set result=true.
// $init_response->errors may still be non-empty (e.g. a non-fatal warning that does not
// stop execution), so the final message distinguishes a clean pass from a pass-with-warnings.
// array_unshift ensures the summary line is the first human-readable message seen in any UI.
	$init_response->result = true;
	if (empty($init_response->errors)) {
		$init_response->msg[] = 'OK. init test successful';
	}else{
		array_unshift($init_response->msg, 'Init test passed with some warnings');
	}

	return $init_response;
