<?php
/**
* CLASS DD_CACHE
* Manages Dédalo cache
*
*/
class dd_cache {



	/**
	* GET_CACHE_FILE_PREFIX
	* Normalized cache file name prefix
	* using entity id and logged user id
	* Like 'monedaiberica_1-' for use as 'monedaiberica_1-cache_permissions_table'
	* @return string
	*/
	public static function get_cache_file_prefix() : string {
		return DEDALO_ENTITY .'_'. logged_user_id() . '_';
	}//end get_cache_file_prefix



	/**
	* PROCESS_AND_CACHE_TO_FILE
	* Write result of process to cache to manage large calculations like
	* component_security_access datalist
	* @param object $options
	* @return string|bool $status
	* 	Returns last line on success or false on failure.
	*/
	public static function process_and_cache_to_file(object $options) : string|bool {

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
			if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER['files_path'])) {
				debug_log(__METHOD__
					." Error: Check your DEDALO_CACHE_MANAGER config to fix it "
					, logger::ERROR
				);
				return false;
			}
			$base_path = DEDALO_CACHE_MANAGER['files_path'];

		// output. $output = '> /dev/null &';
			$output	= '> '.$base_path .'/'. $prefix . $file_name.' ';

		// wait
			if ($wait!==true) {
				$output	.= '&';
			}

		// command
			$command = PHP_BIN_PATH ." $process_file '$server_vars' $output";

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
	* Write result of process to cache to manage large calculations like
	* component_security_access datalist
	* @param object $options
	* @return bool $result
	*/
	public static function cache_to_file(object $options) : bool {

		// options
			// data
			$data = $options->data;
			// file_name. E.g. '1.cache_tree.php'
			$file_name = $options->file_name;
			// prefix
			$prefix = $options->prefix ?? dd_cache::get_cache_file_prefix();

		// base_path. Used to save the files. Usually '/tmp'
			if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER['files_path'])) {
				debug_log(__METHOD__
					." Error: Check your DEDALO_CACHE_MANAGER config to fix it "
					, logger::ERROR
				);
				return false;
			}
			$base_path = DEDALO_CACHE_MANAGER['files_path'];

		// file_path
			$file_path = $base_path . '/' . $prefix . $file_name;

		// Write data to file. Using var_export enables the Opcode cache for this file.
			try {
				$result = OpcacheObjectManager::save($file_path, $data);
			} catch (Exception $e) {
				debug_log(__METHOD__
					." Error on write file. file_path:  " . $file_path
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
	* Reads cache file contents
	* @param object $options
	* @return mixed $contents
	* 	Returns mixed content of the file or false on failure.
	*/
	public static function cache_from_file(object $options) : mixed {

		// options
			// string file_name. Sample: 1.cache_tree.php
			$file_name = $options->file_name;
			// prefix. (!) If you set custom prefix, the file created will not be deleted automatically on logout/quit
			$prefix = $options->prefix ?? dd_cache::get_cache_file_prefix();

		// base_path. Used to save the files. Usually '/tmp'
			if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER['files_path'])) {
				debug_log(__METHOD__
					." Error on get cache manager files_path. Check your config file! "
					, logger::ERROR
				);
				return false;
			}
			$base_path = DEDALO_CACHE_MANAGER['files_path'];

		// file_path
			$file_path = $base_path . '/' . $prefix . $file_name;

		// Include file. Note that PHP Opcode caches the file.
			try {
				$contents = OpcacheObjectManager::load($file_path);
			} catch (Exception $e) {
				$contents = false;
			}


		return $contents;
	}//end cache_from_file



	/**
	* CACHE_FILE_EXISTS
	* Reads cache file to check its existence
	* @param object $options
	* @return bool $result
	*/
	public static function cache_file_exists(object $options) : bool {

		// options
			// string file_name. Sample: 1.cache_tree.php
			$file_name	= $options->file_name;
			// prefix. (!) If you set custom prefix, the file created will not be deleted automatically on logout/quit
			$prefix		= $options->prefix ?? dd_cache::get_cache_file_prefix();

		// base_path. Used to save the files. Usually '/tmp'
			if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER['files_path'])) {
				debug_log(__METHOD__
					." Error on get cache manager files_path. Check your config file! "
					, logger::ERROR
				);
				return false;
			}
			$base_path = DEDALO_CACHE_MANAGER['files_path'];

		// file_path
			$file_path	= $base_path . '/' . $prefix . $file_name;

		// result
			$result = file_exists($file_path);


		return $result;
	}//end cache_file_exists



	/**
	* DELETE_CACHE_FILES
	* Remove existing cache files in DEDALO_CACHE_MANAGER['files_path']
	* @param array|null $cache_files = null
	* 	If null, all files with default prefix will be deleted
	* @param string|null $prefix = null
	* @return bool
	*/
	public static function delete_cache_files( ?array $cache_files=null, ?string $prefix=null ) : bool {

		// check base_path
			if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER['files_path'])) {
				debug_log(__METHOD__
					. " Error on get cache manager files_path. Check your config file! "
					, logger::ERROR
				);
				return false;
			}
			$base_path = DEDALO_CACHE_MANAGER['files_path'];

		// files
			$cache_files_parsed = !empty($cache_files)
				? (function() use($cache_files, $prefix) {
					$cache_files_parsed = [];
					foreach ($cache_files as $file_name) {
						$full_file_name = empty($prefix)
							? dd_cache::get_cache_file_prefix() . $file_name
							: $prefix . $file_name;
						$cache_files_parsed[] = $full_file_name;
					}
					return $cache_files_parsed;
				  })()
				: (function() use($base_path){
					$prefix			= dd_cache::get_cache_file_prefix();
					$file_pattern	= $base_path .'/'. $prefix .'*';
					$found_files	= glob($file_pattern);
					return $found_files;
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
