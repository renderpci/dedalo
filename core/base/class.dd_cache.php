<?php declare(strict_types=1);
/**
* CLASS DD_CACHE
* Manages Dédalo cache system for performance optimization
*
* This class provides file-based caching functionality with support for
* background processing and atomic operations using OPcache. It handles
* caching of expensive calculations like security access trees, user tools,
* and other frequently accessed data structures.
*
* Key Features:
* - User-scoped cache files with automatic prefix based on entity and user ID
* - Background processing for large calculations via shell execution
* - Atomic file operations using OPcache for optimal performance
* - Automatic cleanup on user logout/quit
* - Security validation to prevent directory traversal and command injection
*
* Architecture:
* - Uses OpcacheObjectManager for atomic file writes with OPcache integration
* - Cache files stored in DEDALO_CACHE_MANAGER['files_path'] (typically /tmp or sessions dir)
* - File naming: {entity}_{user_id}_{filename}.php
* - Custom prefixes available for shared cache files (note: not auto-deleted)
*
* Security Considerations:
* - All file names validated against directory traversal ('../', '/')
* - Process files restricted to DEDALO_CORE_PATH and DEDALO_LIB_PATH
* - Shell commands use proper escaping (escapeshellcmd, escapeshellarg)
* - PHP_BIN_PATH constant validated before use
*
* @see OpcacheObjectManager For atomic file operations and OPcache integration
* @see DEDALO_CACHE_MANAGER Configuration constant for cache settings
* @see component_security_access Primary consumer for permission tree caching
* @see login::logout() Triggers automatic cache cleanup on user logout
*
* @package Dedalo
* @subpackage Core
*
* @example Basic usage:
* // Cache data
* $options = (object)[
*     'data' => $my_data,
*     'file_name' => 'my_cache.php'
* ];
* dd_cache::cache_to_file($options);
*
* // Retrieve cached data
* $cached = dd_cache::cache_from_file($options);
*
* @example Background processing:
* // Process large calculation in background
* $options = (object)[
*     'process_file' => DEDALO_CORE_PATH . '/calculate_tree.php',
*     'data' => (object)['session_id' => session_id()],
*     'file_name' => 'tree_cache.php',
*     'wait' => false  // Non-blocking
* ];
* dd_cache::process_and_cache_to_file($options);
*/
class dd_cache {



	/**
	* GET_CACHE_FILE_PREFIX
	* Generates normalized cache file name prefix combining entity and user ID
	*
	* Creates a unique prefix for cache files that includes the current entity
	* and logged user ID, ensuring cache isolation between different users
	* and installations.
	*
	* Format: {DEDALO_ENTITY}_{user_id}_
	* Example: 'monedaiberica_1_' produces 'monedaiberica_1-cache_permissions_table.php'
	*
	* Null User Handling:
	* When no user is logged in (logged_user_id() returns null), uses 'anonymous'
	* as the user identifier. This allows caching for non-authenticated contexts.
	*
	* @see logged_user_id() Function that provides the current user ID
	* @see DEDALO_ENTITY Constant defining the current installation entity
	*
	* @return string Cache file prefix in format '{entity}_{user_id}_'
	*
	* @example
	* // With logged user ID 42 and entity 'myproject'
	* $prefix = dd_cache::get_cache_file_prefix();
	* // Returns: 'myproject_42_'
	*
	* // With no logged user
	* $prefix = dd_cache::get_cache_file_prefix();
	* // Returns: 'myproject_anonymous_'
	*/
	public static function get_cache_file_prefix() : string {
		$user_id = logged_user_id();
		if ($user_id === null) {
			$user_id = 'anonymous';
		}
		return DEDALO_ENTITY .'_'. $user_id . '_';
	}//end get_cache_file_prefix



	/**
	* GET_CACHE_FILES_PATH
	* Validates and returns the cache files storage directory path
	*
	* Performs validation checks on the cache directory configuration:
	* 1. Verifies DEDALO_CACHE_MANAGER constant is defined
	* 2. Checks 'files_path' key exists in configuration
	* 3. Validates the path is an actual directory
	* 4. Confirms the directory is writable by the web server
	*
	* All validation failures are logged via debug_log() at ERROR level
	* before returning false.
	*
	* @see DEDALO_CACHE_MANAGER Configuration array with 'files_path' key
	* @see debug_log() Logging function for error reporting
	* @see logger::ERROR Error level constant
	*
	* @return string|false Returns the validated cache directory path on success,
	*                       or false if validation fails
	*
	* @example
	* // Typical configuration in config.php:
	* define('DEDALO_CACHE_MANAGER', [
	*     'manager' => 'files',
	*     'files_path' => '/tmp'  // or DEDALO_SESSIONS_PATH
	* ]);
	*
	* // Internal usage:
	* $cache_path = self::get_cache_files_path();
	* if ($cache_path === false) {
	*     // Handle configuration error
	* }
	*/
	private static function get_cache_files_path() : string|false {
		if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER['files_path'])) {
			debug_log(__METHOD__
				." Error: Check your DEDALO_CACHE_MANAGER config to fix it "
				, logger::ERROR
			);
			return false;
		}
		$base_path = DEDALO_CACHE_MANAGER['files_path'];

		if (!is_dir($base_path) || !is_writable($base_path)) {
			debug_log(__METHOD__." Error: base_path is not writable: $base_path", logger::ERROR);
			return false;
		}

		return $base_path;
	}//end get_cache_files_path



	/**
	* PROCESS_AND_CACHE_TO_FILE
	* Executes a PHP script to generate and cache expensive calculation results
	*
	* Spawns a separate PHP process to execute a calculation script, capturing
	* its output to a cache file. Designed for large operations like security
	* access tree generation that would timeout if run inline.
	*
	* The process runs asynchronously by default (non-blocking), but can be
	* configured to wait for completion when immediate results are needed.
	*
	* Security Validations:
	* - process_file must exist and be within DEDALO_CORE_PATH or DEDALO_LIB_PATH
	* - file_name cannot contain directory traversal characters ('../', '/')
	* - PHP_BIN_PATH constant must be defined
	* - All shell arguments are properly escaped
	*
	* @param object $options {
	*    @type string $process_file Required. Absolute path to PHP script to execute.
	*                               Must be within DEDALO_CORE_PATH or DEDALO_LIB_PATH.
	*                               Example: DEDALO_CORE_PATH . '/component_security_access/calculate_tree.php'
	*    @type object $data Required. Data object passed to the process script via JSON argument.
	*                       Typically includes session_id, user_id, lang, etc.
	*    @type string $file_name Required. Target cache file name without path.
	*                            Cannot contain '/' or '..'. Extension typically .php or .json.
	*                            Example: 'cache_tree_lg-eng.php'
	*    @type bool $wait Optional. Whether to wait for process completion.
	*                     Default: false (runs in background).
	*                     Set to true for synchronous execution.
	*    @type string $prefix Optional. Custom file prefix overriding default user-scoped prefix.
	*                         Default: Uses get_cache_file_prefix().
	*                         Note: Custom prefix files are not auto-deleted on logout.
	* }
	*
	* @return string|bool Returns the last line of output from the executed command on success,
	*                     or false on validation failure or configuration error.
	*
	* @see cache_to_file() For direct data caching without background processing
	* @see exec() PHP function used for command execution
	* @see escapeshellcmd() For command escaping
	* @see escapeshellarg() For argument escaping
	*
	* @example Background processing (non-blocking):
	* $options = (object)[
	*     'process_file' => DEDALO_CORE_PATH . '/component_security_access/calculate_tree.php',
	*     'data' => (object)[
	*         'session_id' => session_id(),
	*         'user_id' => logged_user_id(),
	*         'lang' => DEDALO_APPLICATION_LANG
	*     ],
	*     'file_name' => 'cache_tree_' . DEDALO_APPLICATION_LANG . '.php',
	*     'wait' => false  // Fire and forget
	* ];
	* $result = dd_cache::process_and_cache_to_file($options);
	*
	* @example Synchronous processing:
	* $options = (object)[
	*     'process_file' => DEDALO_CORE_PATH . '/calculate_stats.php',
	*     'data' => (object)['report_id' => 123],
	*     'file_name' => 'report_123.json',
	*     'wait' => true  // Wait for completion
	* ];
	* $result = dd_cache::process_and_cache_to_file($options);
	*/
	public static function process_and_cache_to_file(object $options) : string|bool {

		// input validation
			if (!isset($options->process_file) || !is_string($options->process_file)) {
				debug_log(__METHOD__." Error: process_file is required and must be a string", logger::ERROR);
				return false;
			}
			if (!isset($options->data) || !is_object($options->data)) {
				debug_log(__METHOD__." Error: data is required and must be an object", logger::ERROR);
				return false;
			}
			if (!isset($options->file_name) || !is_string($options->file_name)) {
				debug_log(__METHOD__." Error: file_name is required and must be a string", logger::ERROR);
				return false;
			}

		// options
			// string process_file. File to manage the data process
			// Sample: dirname(__FILE__, 2) . '/component_security_access/calculate_tree.php'
			$process_file	= $options->process_file;
			// object data
			$data			= $options->data;
			// string file_name. Sample: 1.cache_tree.php
			$file_name		= $options->file_name;
			// wait until process ends
			$wait			= $options->wait ?? false;
			// prefix
			$prefix			= $options->prefix ?? dd_cache::get_cache_file_prefix();

		// validate file paths
			if (!file_exists($process_file)) {
				debug_log(__METHOD__." Error: process_file does not exist: $process_file", logger::ERROR);
				return false;
			}
			// Security: Ensure process_file is within allowed paths
			if (defined('DEDALO_CORE_PATH') && strpos(realpath($process_file), realpath(DEDALO_CORE_PATH)) !== 0) {
				if (!defined('DEDALO_LIB_PATH') || strpos(realpath($process_file), realpath(DEDALO_LIB_PATH)) !== 0) {
					debug_log(__METHOD__." Error: process_file is not within allowed paths: $process_file", logger::ERROR);
					return false;
				}
			}
			if (strpos($file_name, '..') !== false || strpos($file_name, '/') !== false) {
				debug_log(__METHOD__." Error: file_name contains invalid characters: $file_name", logger::ERROR);
				return false;
			}

		// sh_data
			$sh_data = [
				'server' => [
					'HTTP_HOST'		=> $_SERVER['HTTP_HOST'] ?? 'localhost',
					'REQUEST_URI'	=> $_SERVER['REQUEST_URI'] ?? '',
					'SERVER_NAME'	=> $_SERVER['SERVER_NAME'] ?? 'development'
				]
			];
			foreach ($data as $key => $value) {
				$sh_data[$key] = $value;
			}

		// server_vars
			$server_vars = json_encode($sh_data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);

		// base_path. Used to save the files. Usually '/tmp'
			$base_path = self::get_cache_files_path();
			if ($base_path === false) {
				return false;
			}

		// output file path
			$output_file = $base_path .'/'. $prefix . $file_name;

		// output redirection
			$output = '> '.escapeshellarg($output_file).' ';

		// wait
			if ($wait!==true) {
				$output	.= '&';
			}

		// command with proper escaping
			if (!defined('PHP_BIN_PATH')) {
				debug_log(__METHOD__." Error: PHP_BIN_PATH constant is not defined", logger::ERROR);
				return false;
			}
			$command = escapeshellcmd(PHP_BIN_PATH) .' '.escapeshellarg($process_file).' '.escapeshellarg($server_vars).' '.$output;

		// debug
			debug_log(__METHOD__
				." ------> COMMAND PROCESS_AND_CACHE_TO_FILE ------------------------------------------------:" . PHP_EOL
				.'file_name: ' .$file_name . PHP_EOL
				.'wait: ' . to_string($wait) . PHP_EOL
				.'command: ' . PHP_EOL
				. $command   . PHP_EOL
				." -------------------------------------------------------------------------------------------"
				, logger::DEBUG
			);

		// exec command
			$status = exec($command);


		return $status;
	}//end process_and_cache_to_file



	/**
	* CACHE_TO_FILE
	* Stores data in a cache file using OPcache-optimized serialization
	*
	* Writes arbitrary PHP data to a cache file using OpcacheObjectManager,
	* which generates optimized PHP code that benefits from OPcache bytecode
	* caching. This provides significantly faster retrieval than unserialized
	* data or JSON files.
	*
	* The method performs atomic file writes using temporary files and rename(),
	* preventing partial writes and race conditions in concurrent scenarios.
	*
	* Security Validations:
	* - file_name cannot contain directory traversal characters ('../', '/')
	* - Cache directory must be writable (validated by get_cache_files_path())
	*
	* @param object $options {
	*    @type mixed $data Required. Data to cache. Can be any serializable PHP value
	*                      (array, object, scalar, null). Will be converted to PHP code.
	*    @type string $file_name Required. Target cache file name without path.
	*                            Cannot contain '/' or '..'. Extension typically .php.
	*                            Example: 'cache_tree_lg-eng.php'
	*    @type string $prefix Optional. Custom file prefix overriding default user-scoped prefix.
	*                         Default: Uses get_cache_file_prefix().
	*                         Note: Custom prefix files are not auto-deleted on logout.
	* }
	*
	* @return bool Returns true on successful write, false on validation failure
	*              or write error.
	*
	* @see cache_from_file() For retrieving cached data
	* @see cache_file_exists() For checking cache existence
	* @see OpcacheObjectManager::save() For atomic file write implementation
	* @see OpcacheObjectManager::generateCode() For PHP code generation
	*
	* @example Basic caching:
	* $options = (object)[
	*     'data' => ['users' => $user_list, 'timestamp' => time()],
	*     'file_name' => 'user_list.php'
	* ];
	* $success = dd_cache::cache_to_file($options);
	* if (!$success) {
	*     // Handle cache write failure
	* }
	*
	* @example With custom prefix (shared cache):
	* $options = (object)[
	*     'data' => $global_config,
	*     'file_name' => 'global_config.php',
	*     'prefix' => 'shared_'  // Not tied to specific user
	* ];
	* dd_cache::cache_to_file($options);
	*/
	public static function cache_to_file(object $options) : bool {

		// input validation
			if (!isset($options->data)) {
				debug_log(__METHOD__." Error: data is required", logger::ERROR);
				return false;
			}
			if (!isset($options->file_name) || !is_string($options->file_name)) {
				debug_log(__METHOD__." Error: file_name is required and must be a string", logger::ERROR);
				return false;
			}

		// options
			// data
			$data = $options->data;
			// file_name. E.g. '1.cache_tree.php'
			$file_name = $options->file_name;
			// prefix
			$prefix = $options->prefix ?? dd_cache::get_cache_file_prefix();

		// validate file_name
			if (strpos($file_name, '..') !== false || strpos($file_name, '/') !== false) {
				debug_log(__METHOD__." Error: file_name contains invalid characters: $file_name", logger::ERROR);
				return false;
			}

		// base_path. Used to save the files. Usually '/tmp'
			$base_path = self::get_cache_files_path();
			if ($base_path === false) {
				return false;
			}

		// file_path
			$file_path = $base_path . '/' . $prefix . $file_name;

		// Write data to file. Using var_export enables the Opcode cache for this file.
			try {
				$result = OpcacheObjectManager::save($file_path, $data);
			} catch (Exception $e) {
				debug_log(__METHOD__
					." Error on write file: " . $e->getMessage()
					. " file_path: " . $file_path
					, logger::ERROR
				);
				$result = false;
			}

		// debug
			debug_log(__METHOD__.
				" ------> CACHE_TO_FILE: $file_name ------------------------------------------------------:" .PHP_EOL
				.' result: ' . to_string($result) .PHP_EOL
				." ----------------------------------------------------------------------------------------"
				, logger::DEBUG
			);


		return $result;
	}//end cache_to_file



	/**
	* CACHE_FROM_FILE
	* Retrieves cached data from a cache file
	*
	* Loads and returns data previously stored by cache_to_file() or
	* process_and_cache_to_file(). Uses OpcacheObjectManager to include
	* the PHP cache file, leveraging OPcache for optimal performance.
	*
	* The cached file is executed as PHP code (return [...];), so it benefits
	* from bytecode caching if OPcache is enabled. This makes retrieval
	* significantly faster than parsing JSON or unserializing data.
	*
	* Security Validations:
	* - file_name cannot contain directory traversal characters ('../', '/')
	* - Cache directory must be accessible (validated by get_cache_files_path())
	*
	* Note on Auto-Deletion:
	* Files created with default prefix (user-scoped) are automatically deleted
	* on user logout/quit. Files with custom prefixes must be manually managed.
	*
	* @param object $options {
	*    @type string $file_name Required. Cache file name to retrieve.
	*                            Cannot contain '/' or '..'.
	*                            Example: 'cache_tree_lg-eng.php'
	*    @type string $prefix Optional. Custom file prefix used during cache creation.
	*                         Default: Uses get_cache_file_prefix().
	*                         Must match the prefix used when caching the data.
	* }
	*
	* @return mixed Returns the cached data on success, or null if:
	*               - File does not exist
	*               - Validation fails
	*               - Cache file is empty or corrupted
	*               - Exception occurs during file loading
	*
	* @see cache_to_file() For storing data to cache
	* @see cache_file_exists() For checking cache existence before retrieval
	* @see OpcacheObjectManager::load() For file loading implementation
	* @see delete_cache_files() For cache cleanup
	*
	* @example Basic retrieval:
	* $options = (object)[
	*     'file_name' => 'user_list.php'
	* ];
	* $cached_data = dd_cache::cache_from_file($options);
	* if ($cached_data !== null) {
	*     // Use cached data
	*     $users = $cached_data['users'];
	* } else {
	*     // Cache miss - regenerate data
	* }
	*
	* @example With custom prefix:
	* $options = (object)[
	*     'file_name' => 'global_config.php',
	*     'prefix' => 'shared_'  // Must match prefix used in cache_to_file()
	* ];
	* $config = dd_cache::cache_from_file($options);
	*/
	public static function cache_from_file(object $options) : mixed {

		// input validation
			if (!isset($options->file_name) || !is_string($options->file_name)) {
				debug_log(__METHOD__." Error: file_name is required and must be a string", logger::ERROR);
				return null;
			}

		// options
			// string file_name. Sample: 1.cache_tree.php
			$file_name = $options->file_name;
			// prefix. (!) If you set custom prefix, the file created will not be deleted automatically on logout/quit
			$prefix = $options->prefix ?? dd_cache::get_cache_file_prefix();

		// validate file_name
			if (strpos($file_name, '..') !== false || strpos($file_name, '/') !== false) {
				debug_log(__METHOD__." Error: file_name contains invalid characters: $file_name", logger::ERROR);
				return null;
			}

		// base_path. Used to save the files. Usually '/tmp'
			$base_path = self::get_cache_files_path();
			if ($base_path === false) {
				return null;
			}

		// file_path
			$file_path = $base_path . '/' . $prefix . $file_name;

		// Include file. Note that PHP Opcode caches the file.
			try {
				$contents = OpcacheObjectManager::load($file_path);
				if ($contents === null) {
					debug_log(__METHOD__." Warning: Cache file returned null: $file_path", logger::WARNING);
				}
			} catch (Exception $e) {
				debug_log(__METHOD__." Error loading cache file: " . $e->getMessage(), logger::ERROR);
				$contents = null;
			}


		return $contents;
	}//end cache_from_file



	/**
	* CACHE_FILE_EXISTS
	* Checks whether a cache file exists in the cache directory
	*
	* Verifies the existence of a cache file without loading its contents.
	* Useful for conditional caching patterns where you want to check
	* cache status before attempting expensive data generation.
	*
	* Security Validations:
	* - file_name cannot contain directory traversal characters ('../', '/')
	* - Cache directory must be accessible (validated by get_cache_files_path())
	*
	* @param object $options {
	*    @type string $file_name Required. Cache file name to check.
	*                            Cannot contain '/' or '..'.
	*                            Example: 'cache_tree_lg-eng.php'
	*    @type string $prefix Optional. Custom file prefix used during cache creation.
	*                         Default: Uses get_cache_file_prefix().
	*                         Must match the prefix used when caching the data.
	* }
	*
	* @return bool Returns true if the cache file exists, false otherwise.
	*              Also returns false on validation failure.
	*
	* @see cache_from_file() For retrieving cached data
	* @see cache_to_file() For storing data to cache
	*
	* @example Check before expensive operation:
	* $options = (object)[
	*     'file_name' => 'expensive_calculation.php'
	* ];
	*
	* if (!dd_cache::cache_file_exists($options)) {
	*     // Cache miss - perform expensive calculation
	*     $data = perform_expensive_calculation();
	*     $options->data = $data;
	*     dd_cache::cache_to_file($options);
	* }
	*
	* // Retrieve from cache (now guaranteed to exist)
	* $cached = dd_cache::cache_from_file($options);
	*/
	public static function cache_file_exists(object $options) : bool {

		// input validation
			if (!isset($options->file_name) || !is_string($options->file_name)) {
				debug_log(__METHOD__." Error: file_name is required and must be a string", logger::ERROR);
				return false;
			}

		// options
			// string file_name. Sample: 1.cache_tree.php
			$file_name	= $options->file_name;
			// prefix. (!) If you set custom prefix, the file created will not be deleted automatically on logout/quit
			$prefix		= $options->prefix ?? dd_cache::get_cache_file_prefix();

		// validate file_name
			if (strpos($file_name, '..') !== false || strpos($file_name, '/') !== false) {
				debug_log(__METHOD__." Error: file_name contains invalid characters: $file_name", logger::ERROR);
				return false;
			}

		// base_path. Used to save the files. Usually '/tmp'
			$base_path = self::get_cache_files_path();
			if ($base_path === false) {
				return false;
			}

		// file_path
			$file_path	= $base_path . '/' . $prefix . $file_name;

		// result
			$result = file_exists($file_path);


		return $result;
	}//end cache_file_exists



	/**
	* DELETE_CACHE_FILES
	* Removes cache files from the cache directory
	*
	* Deletes cache files either by specific file list or by prefix pattern.
	* This method is called automatically on user logout to clean up user-scoped
	* cache files, but can also be called manually for cache management.
	*
	* Behavior Modes:
	* 1. Specific files: Provide $cache_files array with file names to delete
	* 2. Pattern matching: Leave $cache_files null to delete all files matching prefix
	*
	* Auto-Deletion on Logout:
	* Files with default prefix (user-scoped via get_cache_file_prefix()) are
	* automatically deleted when the user logs out or quits the session.
	* Files with custom prefixes are NOT auto-deleted and require manual cleanup.
	*
	* Error Handling:
	* - Non-existent files are logged as warnings (not errors)
	* - Failed deletions are logged as errors
	* - Method returns true even if some files fail to delete
	*
	* @param array|null $cache_files Optional. Array of file names to delete.
	*                                 If null, deletes all files matching the prefix pattern.
	*                                 File names should not include path or prefix.
	*                                 Example: ['cache_tree.php', 'user_tools.json']
	* @param string|null $prefix Optional. Custom prefix for file matching.
	*                             If null, uses get_cache_file_prefix() (user-scoped).
	*                             Use custom prefix to clean up shared cache files.
	*
	* @return bool Returns true on completion (even if some deletions failed),
	*              false if cache directory is inaccessible.
	*
	* @see login::logout() Calls this method on user logout
	* @see get_cache_file_prefix() For default user-scoped prefix
	*
	* @example Delete all user cache files (automatic on logout):
	* // Called automatically by login system
	* dd_cache::delete_cache_files();
	*
	* @example Delete specific cache files:
	* dd_cache::delete_cache_files([
	*     'temp_calculation.php',
	*     'old_cache.json'
	* ]);
	*
	* @example Delete custom prefix cache files:
	* // Clean up shared cache files
	* dd_cache::delete_cache_files(null, 'shared_');
	*
	* @example Delete specific files with custom prefix:
	* dd_cache::delete_cache_files(
	*     ['report_123.php', 'report_456.php'],
	*     'reports_'
	* );
	*/
	public static function delete_cache_files( ?array $cache_files=null, ?string $prefix=null ) : bool {

		// check base_path
			$base_path = self::get_cache_files_path();
			if ($base_path === false) {
				return false;
			}

		// files
			$cache_files_parsed = !empty($cache_files)
				? (function() use($cache_files, $prefix) {
					$cache_files_parsed = [];
					foreach ($cache_files as $file_name) {
						$full_file_name = $prefix===null
							? dd_cache::get_cache_file_prefix() . $file_name
							: $prefix . $file_name;
						$cache_files_parsed[] = $full_file_name;
					}
					return $cache_files_parsed;
				  })()
				: (function() use($base_path, $prefix){
					$use_prefix		= $prefix ?? dd_cache::get_cache_file_prefix();
					$file_pattern	= $base_path .'/'. $use_prefix .'*';
					$found_files	= glob($file_pattern);
					// Handle glob() failure
					return $found_files === false ? [] : $found_files;
				  })();

		// delete
			if (!empty($cache_files_parsed)) {
				foreach ($cache_files_parsed as $file_name) {
					$file_path = strpos($file_name, $base_path)===0
						? $file_name
						: $base_path .'/'. $file_name;
					if (file_exists($file_path)) {
						$deleted = unlink($file_path);
						if ($deleted===true) {
							debug_log(__METHOD__." Deleted file $file_path ", logger::DEBUG);
						}else{
							debug_log(__METHOD__
								. " Error deleting file " .PHP_EOL
								. ' file_path: ' . $file_path
								, logger::ERROR
							);
						}
					}else{
						debug_log(__METHOD__
							. " Warning. Ignored file not found for deletion " .PHP_EOL
							. ' file_path: ' . $file_path
							, logger::WARNING
						);
					}
				}
			}

		return true;
	}//end delete_cache_files



}//end class dd_cache
