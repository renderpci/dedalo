<?php declare(strict_types=1);
/**
* PHP_RUNTIME
* Widget showing server PHP runtime details (process user, error-log/session
* paths and opcache status) and exposing an opcache reset action so admins can
* reload config changes / clear compiled caches on demand.
*/
class php_runtime {



	/**
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is invoked through `get_widget_value` (hard-coded method) and
	* therefore not listed here.
	*/
	public const API_ACTIONS = [
		'reset_opcache',
		'reset_realpath_cache',
		'clear_cache_files',
		'clear_session_files',
		'clear_chunk_files'
	];



	/**
	* GET_VALUE
	* Returns updated widget value (used to refresh widget data dynamically,
	* e.g. after a reset). The shape MUST mirror the value object built in
	* area_maintenance::get_ar_widgets().
	* @return object $response
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		$result = (object)[
			'info'					=> system::get_php_user_info(),
			'php_error_log_path'	=> system::get_error_log_path(),
			'php_session_path'		=> session_save_path(),
			'environment'			=> self::get_environment(),
			'opcache'				=> self::get_opcache_status(),
			'directories'			=> self::get_directories_status()
		];

		$response->result	= $result;
		$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end get_value



	/**
	* GET_OPCACHE_STATUS
	* Lightweight, throw-safe summary of the PHP opcache for the UI panel.
	* Mirrors the reads already used by the system_info widget.
	* @return object
	*/
	public static function get_opcache_status() : object {

		$out = new stdClass();
			$out->enabled		= false;
			$out->hit_rate		= null;
			$out->used_memory	= null;
			$out->free_memory	= null;
			$out->cache_full	= null;
			$out->message		= null;

		if (!function_exists('opcache_get_status')) {
			$out->message = 'opcache extension not available';
			return $out;
		}

		try {
			$status = opcache_get_status(false);
		} catch (\Throwable $e) {
			$status = false;
		}

		if ($status===false || !is_array($status)) {
			// opcache disabled for this SAPI, or restricted
			$out->message = 'opcache is not enabled';
			return $out;
		}

		$out->enabled		= !empty($status['opcache_enabled']);
		$out->cache_full	= $status['cache_full'] ?? null;

		if (isset($status['opcache_statistics']['opcache_hit_rate'])) {
			$out->hit_rate = round((float) $status['opcache_statistics']['opcache_hit_rate'], 2) . '%';
		}
		if (isset($status['memory_usage']['used_memory'])) {
			$out->used_memory = round($status['memory_usage']['used_memory'] / 1024 / 1024, 1) . ' MB';
		}
		if (isset($status['memory_usage']['free_memory'])) {
			$out->free_memory = round($status['memory_usage']['free_memory'] / 1024 / 1024, 1) . ' MB';
		}


		return $out;
	}//end get_opcache_status



	/**
	* GET_ENVIRONMENT
	* PHP runtime summary for the "PHP environment" panel: version, SAPI, JIT,
	* the ini limits that most often break Dédalo media uploads, and presence of
	* the critical extensions. Pure reads (no side effects).
	* @return object
	*/
	public static function get_environment() : object {

		// JIT (best-effort; opcache may be disabled)
		$jit_enabled = null;
		if (function_exists('opcache_get_status')) {
			try {
				$status = opcache_get_status(false);
				$jit_enabled = (is_array($status) && isset($status['jit']['enabled']))
					? (bool) $status['jit']['enabled']
					: null;
			} catch (\Throwable $e) {
				$jit_enabled = null;
			}
		}

		return (object)[
			'php_version'	=> PHP_VERSION,
			'sapi'			=> PHP_SAPI,
			'jit_enabled'	=> $jit_enabled,
			'limits'		=> (object)[
				'memory_limit'			=> ini_get('memory_limit'),
				'max_execution_time'	=> ini_get('max_execution_time'),
				'upload_max_filesize'	=> ini_get('upload_max_filesize'),
				'post_max_size'			=> ini_get('post_max_size'),
				'max_input_vars'		=> ini_get('max_input_vars'),
				'max_file_uploads'		=> ini_get('max_file_uploads')
			],
			'extensions'	=> (object)[
				// 'opcache' registers under its Zend name
				'gd'		=> extension_loaded('gd'),
				'curl'		=> extension_loaded('curl'),
				'mbstring'	=> extension_loaded('mbstring'),
				'pdo_pgsql'	=> extension_loaded('pdo_pgsql'),
				'intl'		=> extension_loaded('intl'),
				'exif'		=> extension_loaded('exif'),
				'zip'		=> extension_loaded('zip'),
				'opcache'	=> extension_loaded('Zend OPcache')
			]
		];
	}//end get_environment



	/**
	* GET_DIRECTORIES_STATUS
	* Writable status of the key Dédalo runtime directories plus a rough
	* system free-space gauge, for the "Caches & directories" health panel.
	* The check_*_path() helpers verify (and create if missing) each directory.
	* @return object
	*/
	public static function get_directories_status() : object {

		$session_handler = defined('DEDALO_SESSION_HANDLER') ? DEDALO_SESSION_HANDLER : null;

		return (object)[
			'cache' => (object)[
				'path'		=> defined('DEDALO_CACHE_PATH') ? DEDALO_CACHE_PATH : null,
				'writable'	=> system::check_cache_path()
			],
			'sessions' => (object)[
				'path'		=> defined('DEDALO_SESSIONS_PATH') ? DEDALO_SESSIONS_PATH : null,
				'writable'	=> system::check_sessions_path(),
				'handler'	=> $session_handler
			],
			'backup' => (object)[
				'path'		=> defined('DEDALO_BACKUP_PATH') ? DEDALO_BACKUP_PATH : null,
				'writable'	=> system::check_backup_path()
			],
			'disk_free_mb' => system::get_disk_free_space()
		];
	}//end get_directories_status



	/**
	* CLEAR_CACHE_FILES
	* Removes old files from DEDALO_CACHE_PATH (older than the cache lifetime).
	* Alias of system::delete_old_cache_files(). Fired by widget 'php_runtime'.
	* @return object $response
	*/
	public static function clear_cache_files() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		$dir	= defined('DEDALO_CACHE_PATH') ? DEDALO_CACHE_PATH : null;
		$before	= self::dir_file_stats($dir);

		$ok = system::delete_old_cache_files();
		if ($ok!==true) {
			$response->msg = 'Error. Could not clear old cache files (check DEDALO_CACHE_PATH and permissions)';
			$response->errors[] = 'delete_old_cache_files returned false';
			return $response;
		}

		$after		= self::dir_file_stats($dir);
		$removed	= max(0, $before->count - $after->count);
		$freed		= max(0, $before->bytes - $after->bytes);

		$response->result	= true;
		$response->msg		= $removed>0
			? 'OK. Removed '.$removed.' old cache file'.($removed===1?'':'s').' ('.self::format_mb($freed).' freed)'
			: 'OK. No old cache files to clear';


		return $response;
	}//end clear_cache_files



	/**
	* CLEAR_SESSION_FILES
	* Removes expired file-based session files from DEDALO_SESSIONS_PATH.
	* No-op (reported as such) when the session handler is not file-based
	* (e.g. redis). Alias of system::delete_old_sessions_files().
	* Fired by widget 'php_runtime'.
	* @return object $response
	*/
	public static function clear_session_files() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// Only file-based sessions are stored on disk; for any other handler this
		// is a no-op, which delete_old_sessions_files() cannot distinguish from a
		// real failure via its bool return — so pre-check the handler here.
		if (defined('DEDALO_SESSION_HANDLER') && DEDALO_SESSION_HANDLER !== 'files') {
			$response->result	= true;
			$response->msg		= "Skipped. Session handler is '".DEDALO_SESSION_HANDLER."' (no file-based sessions to clear)";
			return $response;
		}

		$dir	= defined('DEDALO_SESSIONS_PATH') ? DEDALO_SESSIONS_PATH : null;
		$before	= self::dir_file_stats($dir);

		$ok = system::delete_old_sessions_files();
		if ($ok!==true) {
			$response->msg = 'Error. Could not clear old session files (check DEDALO_SESSIONS_PATH and permissions)';
			$response->errors[] = 'delete_old_sessions_files returned false';
			return $response;
		}

		$after		= self::dir_file_stats($dir);
		$removed	= max(0, $before->count - $after->count);
		$freed		= max(0, $before->bytes - $after->bytes);

		$response->result	= true;
		$response->msg		= $removed>0
			? 'OK. Removed '.$removed.' old session file'.($removed===1?'':'s').' ('.self::format_mb($freed).' freed)'
			: 'OK. No old session files to clear';


		return $response;
	}//end clear_session_files



	/**
	* CLEAR_CHUNK_FILES
	* Moves stale media upload chunk files (.blob) to a 'to_delete' folder.
	* Alias of system::remove_old_chunk_files(). Fired by widget 'php_runtime'.
	* @return object $response
	*/
	public static function clear_chunk_files() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		$before	= self::chunk_blob_stats();

		$ok = system::remove_old_chunk_files();
		if ($ok!==true) {
			$response->msg = 'Error. Could not remove old chunk files';
			$response->errors[] = 'remove_old_chunk_files returned false';
			return $response;
		}

		// remove_old_chunk_files() MOVES stale .blob files into a 'to_delete'
		// subfolder, so the drop in source .blob count is the number processed.
		$after	= self::chunk_blob_stats();
		$moved	= max(0, $before->count - $after->count);

		$response->result	= true;
		$response->msg		= $moved>0
			? 'OK. Moved '.$moved.' stale upload chunk'.($moved===1?'':'s').' to the delete queue'
			: 'OK. No stale upload chunks to remove';


		return $response;
	}//end clear_chunk_files



	/**
	* DIR_FILE_STATS
	* Counts plain files (non-recursive) and their total size in a directory.
	* Used to report what a clear action actually removed.
	* @param string|null $dir
	* @return object {count:int, bytes:int}
	*/
	private static function dir_file_stats(?string $dir) : object {

		if ($dir===null || !is_dir($dir)) {
			return (object)['count'=>0, 'bytes'=>0];
		}

		return self::file_stats(glob($dir . '/*'));
	}//end dir_file_stats



	/**
	* CHUNK_BLOB_STATS
	* Counts media upload chunk files (*.blob) across all AV quality folders.
	* @return object {count:int, bytes:int}
	*/
	private static function chunk_blob_stats() : object {

		$files = [];
		if (defined('DEDALO_MEDIA_PATH') && defined('DEDALO_AV_FOLDER')
			&& defined('DEDALO_AV_AR_QUALITY') && is_array(DEDALO_AV_AR_QUALITY)) {
			foreach (DEDALO_AV_AR_QUALITY as $quality) {
				$found = glob(DEDALO_MEDIA_PATH . DEDALO_AV_FOLDER . '/' . $quality . '/*.blob');
				if (is_array($found)) {
					$files = array_merge($files, $found);
				}
			}
		}

		return self::file_stats($files);
	}//end chunk_blob_stats



	/**
	* FILE_STATS
	* Sums count and byte size of the plain files in a glob() result.
	* @param array|false $files
	* @return object {count:int, bytes:int}
	*/
	private static function file_stats($files) : object {

		$count = 0;
		$bytes = 0;
		if (is_array($files)) {
			foreach ($files as $file) {
				if (!is_file($file)) {
					continue;
				}
				$count++;
				$size = @filesize($file);
				if ($size!==false) {
					$bytes += $size;
				}
			}
		}


		return (object)['count'=>$count, 'bytes'=>$bytes];
	}//end file_stats



	/**
	* FORMAT_MB
	* Human-readable megabytes from a byte count.
	* @param int $bytes
	* @return string
	*/
	private static function format_mb(int $bytes) : string {

		return round($bytes / 1024 / 1024, 2) . ' MB';
	}//end format_mb



	/**
	* RESET_OPCACHE
	* Resets the PHP opcache (clears all compiled opcodes, including the config
	* engine's source files, so config edits reload on the next request even
	* when opcache.validate_timestamps=0). Also best-effort removes any compiled
	* config artifact (forward-compatible: a no-op today since the live boot
	* re-resolves config and does not persist an artifact).
	* Fired by widget 'php_runtime'.
	* @return object $response
	*/
	public static function reset_opcache() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// opcache must be available and enabled for this SAPI
		if (!function_exists('opcache_reset')) {
			$response->msg = 'opcache extension is not available';
			$response->errors[] = 'opcache_reset undefined';
			return $response;
		}
		if (!ini_get('opcache.enable')) {
			$response->msg = 'opcache is not enabled';
			$response->errors[] = 'opcache.enable is off';
			return $response;
		}

		// reset opcode cache
		$reset_ok = opcache_reset();
		if ($reset_ok===false) {
			// false here typically means opcache.restrict_api blocks this path,
			// or opcache is disabled for the current SAPI.
			$response->msg = 'opcache_reset() was refused (check opcache.restrict_api / opcache.enable)';
			$response->errors[] = 'opcache_reset returned false';
			return $response;
		}

		// best-effort: drop any compiled config artifact so config truly reloads
		$removed = self::clear_config_artifacts();

		$response->result	= true;
		$response->msg		= 'OK. PHP opcache reset'
			. ($removed>0 ? ' ('.$removed.' config artifact'.($removed===1?'':'s').' removed)' : '');


		return $response;
	}//end reset_opcache



	/**
	* RESET_REALPATH_CACHE
	* Clears PHP's realpath / stat cache so the next request re-reads file paths
	* from disk. Complements reset_opcache() after a config/code change.
	* Fired by widget 'php_runtime'.
	* @return object $response
	*/
	public static function reset_realpath_cache() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// true = also clear the realpath cache (not just the stat cache)
		clearstatcache(true);

		$response->result	= true;
		$response->msg		= 'OK. Realpath / stat cache cleared';


		return $response;
	}//end reset_realpath_cache



	/**
	* CLEAR_CONFIG_ARTIFACTS
	* Best-effort removal of compiled config artifacts (config.<host>.<entity>.php)
	* from the config cache dir, if such a dir exists. Guarded so a missing dir
	* or unwired artifact pipeline is a harmless no-op.
	* @return int number of files removed
	*/
	private static function clear_config_artifacts() : int {

		if (!defined('DEDALO_CACHE_PATH')) {
			return 0;
		}

		$config_cache_dir = DEDALO_CACHE_PATH . '/config';
		if (!is_dir($config_cache_dir)) {
			return 0;
		}

		$removed = 0;
		$files = glob($config_cache_dir . '/config.*.php');
		if ($files===false) {
			return 0;
		}
		foreach ($files as $file) {
			if (is_file($file) && @unlink($file)) {
				$removed++;
			}
		}


		return $removed;
	}//end clear_config_artifacts



}//end php_runtime
