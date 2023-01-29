<?php
/**
* CLASS DD_CACHE
* Manages Dédalo cache
*
*/
class dd_cache {



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
			// Sample: dirname(dirname(__FILE__)) . '/component_security_access/calculate_tree.php'
			$process_file	= $options->process_file;
			// object data
			$data			= $options->data;
			// string file_name. Sample: 1.cache_tree.json
			$file_name		= $options->file_name;
			// wait until process ends
			$wait			= $options->wait ?? false;
			// prefix
			$prefix			= $options->prefix ?? dd_cache::get_cache_file_prefix();

		// sh_data
			$sh_data = [
				'server' => [
					'HTTP_HOST'		=> $_SERVER['HTTP_HOST'],
					'REQUEST_URI'	=> $_SERVER['REQUEST_URI'],
					'SERVER_NAME'	=> $_SERVER['SERVER_NAME']
				]
			];
			foreach ($data as $key => $value) {
				$sh_data[$key] = $value;
			}

		// server_vars
			$server_vars = json_encode($sh_data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);

		// base_path. Used to save the files. Usually '/tmp'
			if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER->files_path)) {
				debug_log(__METHOD__." Error: Check your DEDALO_CACHE_MANAGER config to fix it ".to_string(), logger::ERROR);
				return false;
			}
			$base_path = DEDALO_CACHE_MANAGER->files_path;

		// output. $output = '> /dev/null &';
			$output	= '> '.$base_path .'/'. $prefix . $file_name.' ';

		// wait
			if ($wait!==true) {
				$output	.= '&';
			}

		// command
			$command = PHP_BIN_PATH ." $process_file '$server_vars' $output";

		// debug
			debug_log(__METHOD__.
				" ------> COMMAND PROCESS_AND_CACHE_TO_FILE: $file_name --------------------------------------------------------:"
				.PHP_EOL.PHP_EOL. $command .PHP_EOL,
				logger::DEBUG
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
	* @return string|bool $status
	* 	Returns last line on success or false on failure.
	*/
	public static function cache_to_file(object $options) : string|bool {

		// options
			// object data
			$data		= $options->data;
			// string file_name. Sample	: 1.cache_tree.json
			$file_name	= $options->file_name;
			// prefix
			$prefix		= $options->prefix ?? dd_cache::get_cache_file_prefix();

		// base_path. Used to save the files. Usually '/tmp'
			if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER->files_path)) {
				debug_log(__METHOD__." Error: Check your DEDALO_CACHE_MANAGER config to fix it ".to_string(), logger::ERROR);
				return false;
			}
			$base_path = DEDALO_CACHE_MANAGER->files_path;

		// file_path
			$file_path	= $base_path . '/' . $prefix . $file_name;

		// string data
			$string_data = json_encode($data);

		// save data to file
			$result = file_put_contents($file_path, $string_data, LOCK_EX);
			if ($result===false) {
				debug_log(__METHOD__." Error on write file  ".to_string($file_path), logger::ERROR);
			}

		// debug
			debug_log(__METHOD__.
				" ------> CACHE_TO_FILE: $file_name --------------------------------------------------------:"
				.PHP_EOL.PHP_EOL. $result .PHP_EOL,
				logger::DEBUG
			);


		return $result;
	}//end cache_to_file



	/**
	* GET_CACHE_FILE_PREFIX
	* Normalized cache file name prefix
	* using entity id and logged user id
	* Like 'monedaiberica_1-' for use as 'monedaiberica_1-cache_permissions_table'
	* @return string
	*/
	public static function get_cache_file_prefix() : string {
		return DEDALO_ENTITY .'_'. navigator::get_user_id() . '_';
	}//end get_cache_file_prefix



	/**
	* CACHE_FROM_FILE
	* Write result of process to cache to manage large calculations like
	* component_security_access datalist
	* @param object $options
	* @return string|bool $status
	* 	Returns string content of file or false on failure.
	*/
	public static function cache_from_file(object $options) : string|bool {

		// options
			// string file_name. Sample: 1.cache_tree.json
			$file_name	= $options->file_name;
			// prefix. (!) If you set custom prefix, the file created will not be deleted automatically on logout/quit
			$prefix		= $options->prefix ?? dd_cache::get_cache_file_prefix();

		// base_path. Used to save the files. Usually '/tmp'
			if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER->files_path)) {
				debug_log(__METHOD__." Error on get cache manager files_path. Check your config file! ".to_string(), logger::ERROR);
				return false;
			}
			$base_path = DEDALO_CACHE_MANAGER->files_path;

		// file_path
			$file_path	= $base_path . '/' . $prefix . $file_name;

		// contents
			$contents = file_get_contents($file_path);
			if ($contents===false) {
				// error reading the file
				debug_log(__METHOD__." Error: reading cache file fail:  ".to_string($file_path), logger::ERROR);
			}
			// debug_log(__METHOD__." Returning file cache contents successfully:  ".to_string($file_path), logger::ERROR);


		return $contents;
	}//end cache_from_file



	/**
	* DELETE_CACHE_FILES
	* Remove existing cache files in DEDALO_CACHE_MANAGER->files_path
	* @param array $cache_files = null
	* 	If null, all files with default prefix will be deleted
	* @return bool
	*/
	public static function delete_cache_files( array $cache_files=null ) {

		// check base_path
			if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER->files_path)) {
				debug_log(__METHOD__." Error on get cache manager files_path. Check your config file! ".to_string(), logger::ERROR);
				return false;
			}
			$base_path = DEDALO_CACHE_MANAGER->files_path;

		// files
			$cache_files = !empty($cache_files)
				? $cache_files
				: (function() use($base_path){
					$prefix			= dd_cache::get_cache_file_prefix();
					$file_pattern	= $base_path .'/'. $prefix .'*';
					$found_files	= glob($file_pattern);
					return $found_files;
				  })();

		// delete
			if (!empty($cache_files)) {
				foreach ($cache_files as $file_name) {
					$file_path = strpos($file_name, $base_path)===0
						? $file_name
						: $base_path .'/'. $file_name;
					if (file_exists($file_path)) {
						$deleted = unlink($file_path);
						if ($deleted===true) {
							debug_log(__METHOD__." Deleted file $file_path ", logger::DEBUG);
						}else{
							debug_log(__METHOD__." Error on deleted file $file_path ", logger::ERROR);
						}
					}else{
						debug_log(__METHOD__." Warning. Ignored non found file to deleted: $file_path ", logger::ERROR);
					}
				}
			}

		return true;
	}//end delete_cache_files



}//end class dd_cache
