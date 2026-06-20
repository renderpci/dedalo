<?php declare(strict_types=1);
/**
* CLASS SYSTEM
* Environment introspection and prerequisite-checking for the Dédalo platform.
*
* Centralises every read of OS-level state that is needed either at boot time
* (install checks, version gates) or at runtime (disk/RAM availability, media
* clean-up housekeeping).  All methods are static; the class is never
* instantiated directly — callers use the class as a namespace.
*
* Responsibilities:
* - Hardware / OS probing (RAM, CPU MHz, disk space, disk block-device layout)
*   via the host_info class (delegates to platform-native probes).
* - Daemon version detection (Apache, PostgreSQL, MariaDB/MySQL) by shelling out
*   to their CLI utilities, trying both a configured binary base path and the
*   plain command name in $PATH as fallback.
* - PHP environment checks (version gate, memory limit, GD extension, cURL,
*   current-user identity, error-log path).
* - Filesystem gate helpers used during installation: sessions directory,
*   backup directory, arbitrary directory creation.
* - Media housekeeping: deleting expired session/cache files and stale AV upload
*   chunk (.blob) files.
*
* Relationships:
* - Depends on global helper `get_base_binary_path()` (shared/core_functions.php)
*   to locate daemon binaries on the host.
* - Depends on `create_directory()` (shared/core_functions.php) for safe mkdir.
* - Depends on `debug_log()` and the `logger` constants for structured logging.
* - Delegates hardware introspection to the host_info class; methods degrade
*   gracefully to null/0 when probe data is unavailable.
* - `dd_init_test.php` (same directory) drives many of these checks during the
*   installation self-test flow.
*
* @package Dédalo
* @subpackage Core
*/
class system {



	/**
	* GET_RAM
	* Get the system physical memory installed in the system
	* in Gigabytes
	*
	* Delegates to host_info::get_ram_bytes() and converts bytes to whole
	* gigabytes via rounding.  Returns 0 when the probe is unavailable.
	* @see host_info::get_ram_bytes()
	* @return int $total_gb Returns 0 if info unavailable
	*/
	public static function get_ram() : int {

		$bytes = host_info::get_ram_bytes();
		if ($bytes === null) {
			return 0;
		}

		return intval( round($bytes / (1024 * 1024 * 1024), 0) );
	}//end get_ram



	/**
	* GET_MHZ
	* Get the system processor clock frequency if is available
	* in Mega Hertz. If is not resolved, null is returned.
	* like: 3600
	* @see host_info::get_cpu_mhz()
	* @return int|null $total_mhz
	*/
	public static function get_mhz() : ?int {

		return host_info::get_cpu_mhz();
	}//end get_mhz



	/**
	* TEST_PHP_VERSION_SUPPORTED
	* Test if PHP version is supported
	*
	* Compares the running PHP_VERSION constant against the supplied minimum
	* using version_compare().  On failure, logs an ERROR-level message that
	* includes the current version so the operator knows exactly what to upgrade.
	* @param string $minimum_php_version = '8.1.0'
	* @return bool
	*/
	public static function test_php_version_supported(string $minimum_php_version='8.1.0') : bool {

		if (version_compare(PHP_VERSION, $minimum_php_version) >= 0) {
			return true;
		}else{
			debug_log(__METHOD__
				." This PHP version (".PHP_VERSION.") is not supported ! Please update your PHP to $minimum_php_version or higher ASAP "
				, logger::ERROR
			);
			return false;
		}
	}//end test_php_version_supported



	/**
	* TEST_APACHE_VERSION_SUPPORTED
	* Test if Apache version is supported
	*
	* Delegates version string resolution to get_apache_version(), which tries
	* 'httpd' and 'apache2' on both the configured binary base path and $PATH.
	* Returns false when Apache cannot be detected at all (empty version string).
	* @param string $minimum_version = '2.4.6'
	* @return bool
	*/
	public static function test_apache_version_supported(string $minimum_version='2.4.6') : bool {

		$version = system::get_apache_version();

		if (empty($version)) {
			return false;
		}

		if (version_compare(trim($version), trim($minimum_version)) >= 0) {
			return true;
		}else{
			debug_log(__METHOD__
				." This Apache version (".$version.") is not supported ! Please update your Apache to $minimum_version or higher ASAP "
				, logger::ERROR
			);
			return false;
		}
	}//end test_apache_version_supported



	/**
	* TEST_POSTGRESQL_VERSION_SUPPORTED
	* Test if postgresql version is supported
	*
	* Delegates version resolution to get_postgresql_version(), which tries
	* 'pg_config' and 'psql' in cascade.  Returns false when neither tool is
	* found on the host.
	* @param string $minimum_version = '16.1'
	* @return bool
	*/
	public static function test_postgresql_version_supported(string $minimum_version='16.1') : bool {

		$version = system::get_postgresql_version();

		if (empty($version)) {
			return false;
		}

		if (version_compare(trim($version), trim($minimum_version)) >= 0) {
			return true;
		}else{
			debug_log(__METHOD__
				." This postgresql version (".$version.") is not supported ! Please update your postgresql to $minimum_version or higher ASAP "
				, logger::ERROR
			);
			return false;
		}
	}//end test_postgresql_version_supported



	/**
	* GET_APACHE_VERSION
	* Get the Apache daemon version
	*
	* Probes in four steps, stopping at the first non-empty result:
	*   1. DEDALO_BINARY_BASE_PATH + 'httpd -v'
	*   2. 'httpd -v' (bare, relies on $PATH)
	*   3. DEDALO_BINARY_BASE_PATH + 'apache2 -v'
	*   4. 'apache2 -v' (bare)
	* The sed expression strips everything but the semver portion of the
	* "Server version: Apache/X.Y.Z" line.
	* Returns an empty string and logs ERROR when no binary is found.
	* @return string $version
	*/
	public static function get_apache_version() : string {

		$binary_base_path = get_base_binary_path();

		$commands = [];

		$name		= 'httpd';
		// With full binary path
		$cmd		= $binary_base_path . '/'.$name.' -v | sed -n "s/Server version: Apache\/\([-0-9.]*\).*/\1/p;" ';
		$commands[] = $cmd;
		$version	= shell_exec($cmd);
		if (empty($version)) {
			// Without binary path
			$cmd		= $name.' -v | sed -n "s/Server version: Apache\/\([-0-9.]*\).*/\1/p;" ';
			$commands[] = $cmd;
			$version	= shell_exec($cmd);
		}

		if (empty($version)) {
			$name		= 'apache2';
			$cmd		= $binary_base_path . '/'.$name.' -v | sed -n "s/Server version: Apache\/\([-0-9.]*\).*/\1/p;" ';
			$version	= shell_exec($cmd);
			if (empty($version)) {
				$cmd		= $name.' -v | sed -n "s/Server version: Apache\/\([-0-9.]*\).*/\1/p;" ';
				$commands[] = $cmd;
				$version	= shell_exec($cmd);
			}
		}

		if (empty($version)) {
			debug_log(__METHOD__
				." Apache (httpd or apache2) not found " . PHP_EOL
				.' commands: ' . json_encode($commands, JSON_PRETTY_PRINT) . PHP_EOL
				.' binary_base_path: ' . $binary_base_path
				, logger::ERROR
			);
			return '';
		}


		return trim($version);
	}//end get_apache_version



	/**
	* GET_POSTGRESQL_VERSION
	* Get the postgresql daemon version
	*
	* Probes in cascade:
	*   1. DEDALO_BINARY_BASE_PATH + 'pg_config --version'
	*   2. 'pg_config --version' (bare $PATH)
	*   3. 'psql --version' (client binary — useful on hosts where the server
	*      tools are not in the default path but the client is)
	* The sed expression extracts only the numeric semver from the output line.
	* Returns an empty string and logs ERROR when no tool resolves.
	* @return string $version
	*/
	public static function get_postgresql_version() : string {

		$binary_base_path = get_base_binary_path();

		$name		= 'pg_config';
		$cmd		= $binary_base_path . '/'.$name.' --version | sed -n "s/PostgreSQL \([-0-9.]*\).*/\1/p;" ';
		$version	= shell_exec($cmd);
		if (empty($version)) {
			$cmd		= $name.' --version | sed -n "s/PostgreSQL \([-0-9.]*\).*/\1/p;" ';
			$version	= shell_exec($cmd);
		}

		// try using client psql
		if (empty($version)) {
			$name		= 'psql';
			$cmd		= $name.' --version | sed -n "s/psql (PostgreSQL) \([-0-9.]*\).*/\1/p;" ';
			$version	= shell_exec($cmd);
		}

		if (empty($version)) {
			debug_log(__METHOD__
				." PostgreSQL ($name) not found " . PHP_EOL
				.' command: ' . $cmd . PHP_EOL
				.' binary_base_path: ' . $binary_base_path
				, logger::ERROR
			);
			return '';
		}


		return trim($version);
	}//end get_postgresql_version



	/**
	* GET_PG_BIN_PATH
	* Resolve the directory (with trailing slash) that actually contains the PostgreSQL client
	* binaries (psql, pg_dump). Order: the configured DB_BIN_PATH if psql is really there → the
	* platform base from get_base_binary_path() (macOS /opt/homebrew/bin, Linux /usr/bin, or
	* DEDALO_BINARY_BASE_PATH) → a PATH lookup (`command -v psql`) → finally the configured path.
	* This lets a fresh install (whose DB_BIN_PATH is still the '/usr/bin/' default) find psql on
	* a Homebrew Mac or any non-standard layout WITHOUT the administrator editing a config file.
	* @return string e.g. '/opt/homebrew/bin/'
	*/
	public static function get_pg_bin_path() : string {

		// 1) explicit config wins — but only if psql is actually there
		if (defined('DB_BIN_PATH') && DB_BIN_PATH !== '') {
			$configured = rtrim(DB_BIN_PATH, '/') . '/';
			if (is_file($configured . 'psql')) {
				return $configured;
			}
		}

		// 2) platform base (the same resolver get_postgresql_version uses)
		$base = rtrim(get_base_binary_path(), '/') . '/';
		if (is_file($base . 'psql')) {
			return $base;
		}

		// 3) PATH lookup
		$found = @shell_exec('command -v psql 2>/dev/null');
		if (is_string($found) && trim($found) !== '') {
			return rtrim(dirname(trim($found)), '/') . '/';
		}

		// 4) fall back to the configured path (or platform base) so a command can still be built
		return (defined('DB_BIN_PATH') && DB_BIN_PATH !== '') ? rtrim(DB_BIN_PATH, '/') . '/' : $base;
	}//end get_pg_bin_path



	/**
	* GET_PHP_BIN
	* Resolve the PHP CLI binary (full path) used to spawn worker/cache processes. Order: the
	* configured PHP_BIN_PATH if it points at a real file → the platform base
	* (get_base_binary_path()) + '/php' → a PATH lookup (`command -v php`) → finally the configured
	* value. Lets a fresh install find php on a Homebrew Mac or any non-standard layout WITHOUT the
	* administrator editing a config file (mirrors get_pg_bin_path).
	* @return string e.g. '/opt/homebrew/bin/php'
	*/
	public static function get_php_bin() : string {

		// 1) explicit config wins, if it points at a real binary
		if (defined('PHP_BIN_PATH') && PHP_BIN_PATH !== '' && is_file(PHP_BIN_PATH)) {
			return PHP_BIN_PATH;
		}

		// 2) platform base
		$candidate = rtrim(get_base_binary_path(), '/') . '/php';
		if (is_file($candidate)) {
			return $candidate;
		}

		// 3) PATH lookup
		$found = @shell_exec('command -v php 2>/dev/null');
		if (is_string($found) && trim($found) !== '') {
			return trim($found);
		}

		// 4) fall back to the configured value (or the PHP_BINARY running this process)
		if (defined('PHP_BIN_PATH') && PHP_BIN_PATH !== '') {
			return PHP_BIN_PATH;
		}
		return defined('PHP_BINARY') && PHP_BINARY !== '' ? PHP_BINARY : 'php';
	}//end get_php_bin



	/**
	* GET_MYSQL_SERVER
	* Get the MariaDB/MySQL daemon version
	* Usually, MariaDB is used, but sometimes a MySQL database could be
	* used too. Try both in cascade
	*
	* Checks whether the 'mariadb' or 'mysql' CLI binary is reachable by
	* running '<binary> -V' and inspecting the output.  The bare binary name
	* is tried first (relies on $PATH), then the path from get_base_binary_path().
	* Returns the name of the first binary that responds ('mariadb' or 'mysql'),
	* or null when neither is found.
	*
	* (!) In v7, MariaDB is owned by the Bun diffusion layer; PHP never connects
	* to it directly.  This method is used only for system-info / install checks.
	* @return string|null $version - 'mariadb', 'mysql', or null
	*/
	public static function get_mysql_server() : ?string {

		$binary_base_path = get_base_binary_path();

		// mariadb try
			$cmd		= 'mariadb -V';
			$version	= shell_exec($cmd);
			if (empty($version)) {
				$cmd		= $binary_base_path . '/'. $cmd;
				$version	= shell_exec($cmd);
			}

			if (!empty($version)) {
				return 'mariadb';
			}

		// mysql try
			$cmd		= 'mysql -V';
			$version	= shell_exec($cmd);
			if (empty($version)) {
				$cmd		= $binary_base_path . '/'. $cmd;
				$version	= shell_exec($cmd);
			}

			if (!empty($version)) {
				return 'mysql';
			}


		return null;
	}//end get_mysql_server



	/**
	* GET_MYSQL_VERSION
	* Get the MYSQL daemon version
	*
	* When $mysql_server is null, calls get_mysql_server() to auto-detect
	* the installed binary name ('mariadb' or 'mysql').  Then runs
	* '<binary> -V' and extracts the numeric version with a sed pattern that
	* matches the "from X.Y.Z" fragment common to both MariaDB and MySQL
	* version strings.  If the binary-path-qualified command also fails,
	* returns null.
	* @param string|null $mysql_server = null
	* 	mariadb|mysql|null
	* @return string|null $version
	*/
	public static function get_mysql_version( ?string $mysql_server=null ) : ?string {

		// server: mariadb|mysql|null
		$mysql_server = $mysql_server ?? system::get_mysql_server();
		if (empty($mysql_server)) {
			return null;
		}

		$name		= $mysql_server;
		$cmd		= $name.' -V | sed -n "s/.*'.$name.' from \([0-9.]*\).*/\1/p;" ';
		$version	= shell_exec($cmd);

		// try with binary path
		if (empty($version)) {
			$binary_base_path	= get_base_binary_path();
			$cmd				= $binary_base_path . '/'. $cmd;
			$version			= shell_exec($cmd);
		}

		if (empty($version)) {
			return null;
		}


		return trim($version);
	}//end get_mysql_version



	/**
	* GET_PHP_MEMORY
	* Get PHP memory limit in gigabytes
	*
	* Reads the 'memory_limit' ini directive and converts the shorthand
	* string (e.g. '512M', '2G') to bytes via return_bytes(), then divides
	* to whole gigabytes.  The special ini value '-1' (unlimited) is mapped
	* to 0 by return_bytes() returning a negative number, which the <=0 guard
	* catches — callers should treat 0 as "limit unknown or unrestricted".
	* @return int $gigabytes
	*/
	public static function get_php_memory() : int {

		$memory_limit = ini_get('memory_limit') ?? '';
		if ($memory_limit === '' || $memory_limit === null) {
			return 0;
		}

		$bytes = system::return_bytes($memory_limit);
		if ($bytes <= 0) {
			// Treat -1 (no limit) or invalid values as 0 for reporting in GB
			return 0;
		}

		$gigabytes_float = $bytes / (1024 * 1024 * 1024);
		$gigabytes = intval(round($gigabytes_float, 0));

		return $gigabytes;
	}//end get_php_memory



	/**
	* RETURN_BYTES
	* Converts shorthand memory notation value to bytes
	* From http://php.net/manual/en/function.ini-get.php
	*
	* Handles the standard PHP ini shorthand suffixes:
	*   'g' / 'G' — gigabytes (× 1 073 741 824)
	*   'm' / 'M' — megabytes (× 1 048 576)
	*   'k' / 'K' — kilobytes (× 1 024)
	* Special case: '-1' is returned as-is (PHP's "no limit" sentinel).
	* Pure numeric strings are cast directly to int (already in bytes).
	* Unknown suffixes fall through to filter_var(FILTER_SANITIZE_NUMBER_INT),
	* stripping non-numeric characters and returning whatever integer remains.
	* @param string $val
	* 	Memory size shorthand notation string
	* @return int $val
	*/
	public static function return_bytes( string $val ) : int {
		$val = trim($val);
		// Handle special -1 value (no limit)
		if ($val === '-1') {
			return -1;
		}

		// Pure numeric value (bytes)
		if (is_numeric($val)) {
			return (int)$val;
		}

		$len = strlen($val);
		if ($len === 0) {
			return 0;
		}

		$last = strtolower($val[$len - 1]);
		$number = floatval(substr($val, 0, -1));
		switch ($last) {
			case 'g':
				$number *= (1024 * 1024 * 1024);
				break;
			case 'm':
				$number *= (1024 * 1024);
				break;
			case 'k':
				$number *= 1024;
				break;
			default:
				// Unknown suffix — try integer cast of full string
				return (int)filter_var($val, FILTER_SANITIZE_NUMBER_INT);
		}

		return (int)$number;
	}//end return_bytes



	/**
	* GET_PHP_USER_INFO
	* Resolves current PHP user
	*
	* On POSIX systems (Linux, macOS) where the posix extension is available,
	* uses posix_geteuid() + posix_getpwuid() to get the full passwd entry as
	* an associative array.  On non-POSIX environments (Windows or hosts without
	* the posix extension), falls back to get_current_user() / 'whoami' and
	* returns a minimal two-key array: ['name', 'current_user'].
	* The array is cast to stdClass so callers always receive an object.
	* @return object|null $info
	*/
	public static function get_php_user_info() : ?object {

		try {
			if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
				$ar_info = posix_getpwuid(posix_geteuid());
			}else{
				$name			= get_current_user();
				$current_user	= trim(shell_exec('whoami'));
				$ar_info = [
					'name'			=> $name,
					'current_user'	=> $current_user
				];
			}

			// cast to object
			$info = (object)$ar_info;

		} catch (Exception $e) {
			debug_log(__METHOD__
				." Exception:".$e->getMessage()
				, logger::ERROR
			);
		}

		return $info ?? null;
	}//end get_php_user_info



	/**
	* GET_ERROR_LOG_PATH
	* Resolves current PHP error log file path
	*
	* Reads the 'error_log' ini directive.  Returns null if the directive is
	* unset, empty, or if ini_get() raises an exception (e.g., open_basedir
	* restrictions).  The path is returned as-is without normalisation.
	* @return string|null $error_path
	*/
	public static function get_error_log_path() : ?string {

		try {

			$error_path = ini_get('error_log');

		} catch (Exception $e) {
			debug_log(__METHOD__
				." Exception:".$e->getMessage()
				, logger::ERROR
			);
		}

		return $error_path ?? null;
	}//end get_error_log_path



	/**
	* CHECK_GD_LIB
	* Returns true if the PHP GD lib is installed, false if not
	*
	* GD is required by Dédalo for image resizing and thumbnail generation.
	* This is a thin wrapper around extension_loaded() provided for consistency
	* with the other check_* methods so install-test code can iterate a uniform
	* API.
	* @see https://www.php.net/manual/en/book.image.php
	* @see https://www.php.net/manual/en/function.extension-loaded.php
	* @return bool
	*/
	public static function check_gd_lib() : bool {

		return extension_loaded('gd');
	}//end check_gd_lib



	/**
	* CHECK_SESSIONS_PATH
	* Checks if Dédalo sessions path is set and available
	* constant 'DEDALO_SESSIONS_PATH' is defined in config.php
	*
	* First verifies the DEDALO_SESSIONS_PATH constant is defined (returns false
	* if not, avoiding a fatal error from an undefined constant).  Then delegates
	* to create_directory() which both checks existence and attempts to create
	* the directory at mode 0750 if it does not yet exist.
	* @see config.php
	* @return bool
	*/
	public static function check_sessions_path() : bool {

		if (!defined('DEDALO_SESSIONS_PATH')) {
			return false;
		}

		$dir_exists = create_directory(DEDALO_SESSIONS_PATH, 0750);
		if( $dir_exists===true ){
			return true;
		}


		return false;
	}//end check_sessions_path



	/**
	* CHECK_CACHE_PATH
	* Checks if Dédalo cache path is set and available
	* constant 'DEDALO_CACHE_PATH' is defined in bootstrap.php
	* @see bootstrap.php
	* @return bool
	*/
	public static function check_cache_path() : bool {

		if (!defined('DEDALO_CACHE_PATH')) {
			return false;
		}

		$dir_exists = create_directory(DEDALO_CACHE_PATH, 0750);
		if( $dir_exists===true ){
			return true;
		}


		return false;
	}//end check_cache_path



	/**
	 * DELETE_OLD_CACHE_FILES
	 * Cleans old cache files from 'DEDALO_CACHE_PATH' directory
	 * Note that each Dédalo process creates an individual process log file.
	 *
	 * Iterates all files in the sessions directory and removes any whose last
	 * modification time is older than $cache_life seconds (currently 2 days).
	 * Directories inside the sessions path are skipped — only plain files are
	 * considered.  Each deletion is individually logged at DEBUG level, and
	 * errors (unreadable mtime, failed unlink) are logged at ERROR level
	 * without aborting the loop so remaining files are still processed.
	 * @return bool
	 */
	public static function delete_old_cache_files(): bool {

		if (!defined('DEDALO_CACHE_PATH')) {
			debug_log(
				__METHOD__
					. " Unable to delete cache files. Cache directory is undefined" . PHP_EOL
					. ' DEDALO_CACHE_PATH: undefined',
				logger::WARNING
			);
			return false;
		}

		$cache_life	= 2 * 24 * 60 * 60; // caching time, in seconds - 2 days -
		$files		= glob(DEDALO_CACHE_PATH . '/*');

		// check glob() result
		if ($files === false) {
			debug_log(
				__METHOD__
					. " Error reading cache directory" . PHP_EOL
					. ' DEDALO_CACHE_PATH: ' . DEDALO_CACHE_PATH,
				logger::ERROR
			);
			return false;
		}

		foreach ($files as $file) {

			// skip if not a file (e.g., directories)
			if (!is_file($file)) {
				continue;
			}

			// time in seconds (number of seconds since the Unix Epoch (January 1 1970 00:00:00 GMT))
			$date_now		= time();
			$date_modified	= filemtime($file);

			// check filemtime() result
			if ($date_modified === false) {
				debug_log(
					__METHOD__
						. " Error getting file modification time" . PHP_EOL
						. ' file: ' . to_string($file),
					logger::ERROR
				);
				continue;
			}

			if (($date_now - $date_modified) >= $cache_life) {
				$deleted = unlink($file);
				if (!$deleted) {
					debug_log(
						__METHOD__
							. " Error deleting cache file " . PHP_EOL
							. ' file: ' . to_string($file),
						logger::ERROR
					);
					continue;
				}

				debug_log(
					__METHOD__
						. " Deleted cache file " . PHP_EOL
						. ' file: ' . to_string($file) . PHP_EOL
						. ' date_modified: ' . to_string($date_modified),
					logger::DEBUG
				);
			}
		}

		return true;
	}//end delete_old_cache_files



	/**
	 * DELETE_OLD_SESSIONS_FILES
	 * Cleans old session files from 'DEDALO_SESSIONS_PATH' directory
	 * Uses session.gc_maxlifetime as the threshold (default 8 hours)
	 * Only applies when DEDALO_SESSION_HANDLER is 'files'
	 * @return bool
	 */
	public static function delete_old_sessions_files(): bool {

		if (!defined('DEDALO_SESSIONS_PATH')) {
			debug_log(
				__METHOD__
					. " Unable to delete session files. Sessions directory is undefined" . PHP_EOL
					. ' DEDALO_SESSIONS_PATH: undefined',
				logger::WARNING
			);
			return false;
		}

		// Only file-based sessions need manual cleanup
		if (defined('DEDALO_SESSION_HANDLER') && DEDALO_SESSION_HANDLER !== 'files') {
			return false;
		}

		// Use session.gc_maxlifetime as the session lifetime threshold
		$session_life = (int) ini_get('session.gc_maxlifetime');
		if ($session_life < 1) {
			// Fallback to 8 hours if ini value is not usable
			$session_life = 8 * 3600;
		}

		$files = glob(DEDALO_SESSIONS_PATH . '/*');

		// check glob() result
		if ($files === false) {
			debug_log(
				__METHOD__
					. " Error reading sessions directory" . PHP_EOL
					. ' DEDALO_SESSIONS_PATH: ' . DEDALO_SESSIONS_PATH,
				logger::ERROR
			);
			return false;
		}

		foreach ($files as $file) {

			// skip if not a file (e.g., directories like saml_seen, parallel_*)
			if (!is_file($file)) {
				continue;
			}

			// time in seconds (number of seconds since the Unix Epoch (January 1 1970 00:00:00 GMT))
			$date_now		= time();
			$date_modified	= filemtime($file);

			// check filemtime() result
			if ($date_modified === false) {
				debug_log(
					__METHOD__
						. " Error getting file modification time" . PHP_EOL
						. ' file: ' . to_string($file),
					logger::ERROR
				);
				continue;
			}

			if (($date_now - $date_modified) >= $session_life) {
				$deleted = unlink($file);
				if (!$deleted) {
					debug_log(
						__METHOD__
							. " Error deleting session file " . PHP_EOL
							. ' file: ' . to_string($file),
						logger::ERROR
					);
					continue;
				}

				debug_log(
					__METHOD__
						. " Deleted session file " . PHP_EOL
						. ' file: ' . to_string($file) . PHP_EOL
						. ' date_modified: ' . to_string($date_modified),
					logger::DEBUG
				);
			}
		}

		return true;
	}//end delete_old_sessions_files



	/**
	* CHECK_BACKUP_PATH
	* Checks if Dédalo backup path is set and available
	* constant 'DEDALO_BACKUP_PATH' is defined in config.php
	* Note that this directory contains various types of backups:
	* /db, /ontology, /mysql, /temp
	*
	* The DEDALO_BACKUP_PATH constant defines the root of the backup tree.
	* Sub-directories (/db, /ontology, /mysql, /temp) are created separately
	* by the tools that own each backup type.  This method only verifies
	* (or creates) the root directory.
	* @see config.php
	* @return bool
	*/
	public static function check_backup_path() : bool {

		if (!defined('DEDALO_BACKUP_PATH')) {
			return false;
		}

		$dir_exists = create_directory(DEDALO_BACKUP_PATH, 0750);
		if( $dir_exists===true ){
			return true;
		}


		return false;
	}//end check_backup_path



	/**
	* CHECK_DIRECTORY
	* Generic function to check if Dédalo directory is set and available.
	* If the folder does not exist, try to create it.
	*
	* A thin wrapper around create_directory() that is used when the caller
	* already holds the resolved path (e.g., a quality-specific media sub-folder)
	* rather than relying on a named constant.  Mode 0750 is always used to
	* keep media directories inaccessible to world.
	* @param string $name - Absolute path of the directory to check or create
	* @return bool
	*/
	public static function check_directory( string $name ) : bool {

		$dir_exists = create_directory($name, 0750);
		if( $dir_exists===true ){
			return true;
		}


		return false;
	}//end check_directory



	/**
	* CHECK_CURL
	* Checks if curl is installed and available for PHP
	*
	* Both curl_init and curl_version must exist — their presence confirms the
	* PHP curl extension is loaded, not just that the OS curl binary is present.
	* @return bool
	*/
	public static function check_curl() : bool{

		if(!function_exists('curl_init') || !function_exists('curl_version')) {

			return false;
		}

		return true;
	}//end check_curl



	/**
	* REMOVE_OLD_CHUNK_FILES
	* Delete chunk files older than x time
	* If errors occurred in upload files process, chunk files could be
	* stored and not deleted. use this function to clean old chunks
	* Note that chunk are used only if config 'DEDALO_UPLOAD_SERVICE_CHUNK_FILES' is set
	*
	* Iterates every quality folder in DEDALO_AV_AR_QUALITY and globs for
	* '.blob' files (the temporary chunk extension used during chunked AV uploads).
	* Any chunk older than $max_preservation_hours (12 h) is moved to a
	* 'to_delete' sub-directory within the same quality folder rather than
	* being deleted in place; this allows an external garbage-collection pass
	* to double-check the files before final removal.
	* A missing or uncreateable 'to_delete' directory causes the entire quality
	* folder to be skipped (logged at ERROR) so other qualities are still processed.
	* @see config.php
	* @return bool
	*/
	public static function remove_old_chunk_files() : bool {

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
				if (!system::check_directory($folder_path_to_delete)) {
					debug_log(__METHOD__
						. " Ignored quality. Unable to create directory " . PHP_EOL
						. 'quality: ' . to_string($quality) . PHP_EOL
						. 'folder_path_to_delete: ' . to_string($folder_path_to_delete)
						, logger::ERROR
					);
					continue;
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
						$rename_result = rename($file, $target);
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
				}//end foreach ($files as $file)
		}//end foreach ($ar_folder as $quality)


		return true;
	}//end remove_old_chunk_files



	/**
	* GET_DISK_INFO
	* Collects information about the system disks
	*
	* Returns a human-readable HTML-safe string describing the block-device
	* layout of the host.  Output format differs by OS:
	*   Darwin — runs 'diskutil list' for an overview, then 'diskutil info <dev>'
	*             for every /dev/diskN device found in that output.  Sections are
	*             separated by '<hr>'.
	*   Linux (default) — runs 'lsblk -io NAME,TYPE,SIZE,MOUNTPOINT,FSTYPE,MODEL'
	*                      which is available on all common distributions.
	* Newlines in the raw command output are replaced with '<br />' so the result
	* can be rendered directly in the admin UI without HTML escaping.
	* @return string $disk_info
	*/
	public static function get_disk_info() : string {

		try {

			switch (PHP_OS) {

				case 'Darwin':
					$ar_info = [];

					// general info list
					$list = shell_exec('/usr/sbin/diskutil list');
					$ar_info[] = $list ;

					// detailed info of each disk
					preg_match_all('/\/dev\/disk[0-9]+/', $list, $output_array);
					foreach ($output_array[0] as $disk_path) {
						$ar_info[] = shell_exec('/usr/sbin/diskutil info '.$disk_path);
					}

					// result
					$result = implode('<hr>', array_map(function($el){
						return trim($el);
					}, $ar_info));
					break;

				case 'Linux':
				default:
					$cmd = 'lsblk -io NAME,TYPE,SIZE,MOUNTPOINT,FSTYPE,MODEL';
					$result = shell_exec($cmd);
					break;
			}

			$disk_info = empty($result) ? 'Info unavailable' : str_replace("\n", '<br />', $result);

		} catch (Exception $e) {

			$disk_info = 'Info unavailable. Exception: ' . $e->getMessage();
		}


		return $disk_info;
	}//end get_disk_info



	/**
	* GET_DISK_FREE_SPACE
	* Get the main disk free space in megabytes
	* ! Note: This function will not work on remote files as the file to be
	* examined must be accessible via the server's filesystem.
	*
	* Passes '/' as the path so the result reflects free space on whichever
	* filesystem holds the root mount point.  On systems where DEDALO_ROOT_PATH
	* or DEDALO_MEDIA_PATH lives on a separate mount, this value may not reflect
	* the relevant partition — callers should interpret it as a rough system
	* health indicator rather than a precise media-storage gauge.
	* Returns null when disk_free_space() returns false (insufficient
	* permissions, or the path is unmountable).
	* @return int|null $megabytes
	*/
	public static function get_disk_free_space() : ?int {

		$free_space = disk_free_space('/');
		if (!$free_space) {
			return null;
		}

		$megabytes = intval($free_space / 1024 / 1024);

		return $megabytes;
	}//end get_disk_free_space



	/**
	* GET_IMAGEMAGICK_VERSION
	* Get the ImageMagick binary version string
	* Uses the Dédalo ImageMagick class which resolves the installed path from config
	* @return string $version Empty string if not found
	*/
	public static function get_imagemagick_version() : string {

		$cmd  = ImageMagick::get_imagemagick_installed_path();
		$cmd .= ' -version | sed -n "s/Version: ImageMagick \([-0-9.]*\).*/\1/p;" ';

		$version = trim(shell_exec($cmd) ?? '');

		return $version;
	}//end get_imagemagick_version



	/**
	* TEST_IMAGEMAGICK_VERSION_SUPPORTED
	* Test if ImageMagick version meets Dédalo minimum requirements
	* @param string $minimum_version = '6.9'
	* @return bool
	*/
	public static function test_imagemagick_version_supported(string $minimum_version='6.9') : bool {

		$version = system::get_imagemagick_version();

		if (empty($version)) {
			return false;
		}

		if (version_compare(trim($version), trim($minimum_version)) >= 0) {
			return true;
		}

		debug_log(__METHOD__
			." ImageMagick version ($version) is below minimum ($minimum_version)"
			, logger::ERROR
		);

		return false;
	}//end test_imagemagick_version_supported



	/**
	* GET_FFMPEG_VERSION
	* Get the FFmpeg binary version string
	* Uses the Dédalo Ffmpeg class which resolves the installed path from config
	* @return string $version Empty string if not found
	*/
	public static function get_ffmpeg_version() : string {

		$cmd  = Ffmpeg::get_ffmpeg_installed_path();
		$cmd .= ' -version | sed -n "s/ffmpeg version \([-0-9.]*\).*/\1/p;" ';

		$version = trim(shell_exec($cmd) ?? '');

		return $version;
	}//end get_ffmpeg_version



	/**
	* TEST_FFMPEG_VERSION_SUPPORTED
	* Test if FFmpeg version meets Dédalo minimum requirements
	* @param string $minimum_version = '4.4.2'
	* @return bool
	*/
	public static function test_ffmpeg_version_supported(string $minimum_version='4.4.2') : bool {

		$version = system::get_ffmpeg_version();

		if (empty($version)) {
			return false;
		}

		if (version_compare(trim($version), trim($minimum_version)) >= 0) {
			return true;
		}

		debug_log(__METHOD__
			." FFmpeg version ($version) is below minimum ($minimum_version)"
			, logger::ERROR
		);

		return false;
	}//end test_ffmpeg_version_supported



}//end class system
