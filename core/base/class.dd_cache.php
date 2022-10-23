<?php
/**
* CLASS DD_CACHE
* Manages Dédalo cache
*
*/
class dd_cache {



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
			// string process_file. File to manage the data process
			// Sample: dirname(dirname(__FILE__)) . '/component_security_access/calculate_tree.php'
			$process_file	= $options->process_file;
			// object data
			$data			= $options->data;
			// string file_name
			// Sample: 1.cache_tree.json
			$file_name		= $options->file_name;

		// navigator. force to re-init navigator (!)
			// $navigator = new navigator();

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
			$base_path = DEDALO_CACHE_MANAGER->files_path;

		// output. $output = '> /dev/null &';
			$output	= '> '.$base_path.'/'.$file_name.' &';

		// command
			$command = PHP_BIN_PATH ." $process_file '$server_vars' $output";

		// debug
			error_log("------> COMMAND CACHE_TO_FILE --------------------------------------------------------:"
				.PHP_EOL.PHP_EOL. $command .PHP_EOL);

		// exec command
			$status = exec($command);


		return $status;
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


		return $contents;
	}//end cache_from_file



}//end class dd_cache
