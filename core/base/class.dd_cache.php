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
			// string file_name
			// Sample: 1.cache_tree.json
			$file_name		= $options->file_name;
			// wait until process ends
			$wait			= $options->wait ?? false;

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
			$output	= '> '.$base_path.'/'.$file_name.' ';

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
			// string file_name
			// Sample	: 1.cache_tree.json
			$file_name	= $options->file_name;
			// user_id
			$user_id	= $options->user_id ?? navigator::get_user_id();

		// base_path. Used to save the files. Usually '/tmp'
			if (!defined('DEDALO_CACHE_MANAGER') || !isset(DEDALO_CACHE_MANAGER->files_path)) {
				debug_log(__METHOD__." Error: Check your DEDALO_CACHE_MANAGER config to fix it ".to_string(), logger::ERROR);
				return false;
			}
			$base_path = DEDALO_CACHE_MANAGER->files_path;

		// $file_path
			$file_path = $base_path . '/' . $file_name;

		// string data
			$string_data = json_encode($data);

		// save data to file
			$result = file_put_contents($file_path, $string_data);
			if ($result===false) {
				debug_log(__METHOD__." Error on write file  ".to_string($file_path), logger::ERROR);
			}

		// debug
			// debug_log(__METHOD__.
			// 	" ------> CACHE_TO_FILE: $file_name --------------------------------------------------------:"
			// 	.PHP_EOL.PHP_EOL. $result .PHP_EOL,
			// 	logger::DEBUG
			// );


		return $result;
	}//end cache_to_file



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
			// string file_name
			// Sample: 1.cache_tree.json
			$file_name = $options->file_name;

		// base_path. Used to save the files. Usually '/tmp'
			$base_path = DEDALO_CACHE_MANAGER->files_path;

		// path
			$path = $base_path . '/' . $file_name;

		// contents
			$contents = file_get_contents($path);
			if ($contents===false) {
				// error reading the file
				debug_log(__METHOD__." Error: reading cache file fail:  ".to_string($path), logger::ERROR);
			}
			// debug_log(__METHOD__." Returning file cache contents successfully:  ".to_string($path), logger::ERROR);


		return $contents;
	}//end cache_from_file



}//end class dd_cache
