<?php declare(strict_types=1);
// Include the updates definition
include_once DEDALO_CORE_PATH . '/base/update/class.update.php';
/**
* UPDATE_CODE
* Get new code from code servers
* and install it
*/
class update_code {



	/**
	* CHECK_REMOTE_SERVER
	* Exec a curl request with given data to check current server status
	* @param object $server
	* {
	* 	url: https://master.dedalo.dev/dedalo/core/api/v1/json/
	* }
	* @return object $response
	*/
	public static function check_remote_server( object $server ) : object {

		// rqo
			$rqo = new stdClass();
				$rqo->dd_api	= 'dd_utils_api';
				$rqo->action	= 'get_server_ready_status';
				$rqo->options	= new stdClass();
					$rqo->options->check = 'code_server';

			$rqo_string = 'rqo=' . json_encode($rqo);

		// curl_request
			$response = curl_request((object)[
				'url'				=> $server->url,
				'post'				=> true,
				'postfields'		=> $rqo_string,
				'returntransfer'	=> 1,
				'followlocation'	=> true,
				'header'			=> false,
				'ssl_verifypeer'	=> false,
				'timeout'			=> 5, // seconds
				'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			]);

			if ( !empty($response->result) ){
				$response->result = json_decode($response->result);
			}


		return $response;
	}//end check_remote_server



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// servers
			$servers = (defined('CODE_SERVERS'))
				? CODE_SERVERS
				: null;
			if(empty($servers)) {
				debug_log(__METHOD__
					." Undefined CODE_SERVERS constant in config.php"
					, logger::ERROR
				);
				$response->errors[] = 'Undefined CODE_SERVERS constant in config.php';
				return $response;
			}

		// check code servers
			$code_servers = [];
			foreach ($servers as $current_server) {

				$server = (object)$current_server;

				// check server status
				$server_ready = update_code::check_remote_server( $server );

				// add server object additional info
				$server->msg			= $server_ready->msg;
				$server->error			= $server_ready->error;
				$server->response_code	= $server_ready->code;
				$server->result			= $server_ready->result;
				$server->code			= $server->code;

				$code_servers[] = $server;
			}

		$result = (object)[
			'servers'							=> $code_servers,
			'dedalo_source_version_local_dir'	=> DEDALO_SOURCE_VERSION_LOCAL_DIR,
			'is_a_code_server'					=> IS_A_CODE_SERVER,
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



	/**
	* UPDATE_CODE
	* Download code in zip format file from the GIT repository defined in config
	* @param object $options
	* {
	* 	file: object
	* }
	* @return object $response
	*/
	public static function update_code(object $options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__.' ';
			$response->errors	= [];

		// options
			$file = $options->file;

		try {

			$file_uri = $file->url ?? null;
			if( empty($file_uri) ){
				debug_log(__METHOD__
					. " Error: Update code can not work without a valid url " . PHP_EOL
					. to_string()
					, logger::WARNING
				);
				$response->errors[]	= 'Empty file URI';
				return $response;
			}

			// debug
				debug_log(__METHOD__
					." Start downloading file ".$file_uri
					, logger::DEBUG
				);

			// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg'		=> 'Start downloading file: ' . $file_uri ,
						'memory'	=> dd_memory_usage()
					]);
				}

			// Download zip file from server (master) curl mode (unified with download_remote_structure_file)
				// data
				$data_string = 'data=' . json_encode(null);
				// curl_request
				$curl_response = curl_request((object)[
					'url'				=> $file_uri,
					'post'				=> true,
					'postfields'		=> $data_string,
					'returntransfer'	=> 1,
					'followlocation'	=> true,
					'header'			=> false, // bool add header to result
					'ssl_verifypeer'	=> false,
					'timeout'			=> 300, // int seconds
					'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
						? SERVER_PROXY // from Dédalo config file
						: false // default case
				]);
				$contents = $curl_response->result;
				// check contents
				if ($contents===false) {
					$response->msg .= 'Contents from Dédalo code repository fail to download from: '.$file_uri;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					$response->errors[]	= 'Unable to download the file';
					return $response;
				}

				// result
				$result = new stdClass();
					$result->download_file = [
						'Downloaded file: ' . $file_uri,
						'Time: ' . exec_time_unit($start_time,'sec') . ' secs'
					];

				// debug
				debug_log(__METHOD__
					." Downloaded file (".$file_uri.") in ".exec_time_unit($start_time,'sec') . ' secs'
					, logger::DEBUG
				);

			// Save contents to local dir
				if ( !create_directory(DEDALO_SOURCE_VERSION_LOCAL_DIR) ) {
					$response->msg .= 'Unable to create dir: '.DEDALO_SOURCE_VERSION_LOCAL_DIR;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					$response->errors[]	= 'Unable create or access local directory ' .DEDALO_SOURCE_VERSION_LOCAL_DIR;
					return $response;
				}

				$file_name		= 'dedalo_code.zip';
				$target_file	= DEDALO_SOURCE_VERSION_LOCAL_DIR . '/' . $file_name;
				$put_contents	= file_put_contents($target_file, $contents);
				if (!$put_contents) {
					$response->msg .= 'Contents from Dédalo code repository fail to write on : '.$target_file;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					$response->errors[]	= 'Unable to put contents into file ' .$target_file;
					return $response;
				}
				$result->write_file = [
					"Written file: ". $target_file,
					"File size: "	. format_size_units( filesize($target_file) )
				];

			// extract files from zip. (!) Note that 'ZipArchive' needs to be installed in PHP to allow work
				// CLI msg
					if ( running_in_cli()===true ) {
						print_cli((object)[
							'msg'		=> 'Extracting zip file',
							'memory'	=> dd_memory_usage()
						]);
					}
				$zip = new ZipArchive;
				$res = $zip->open($target_file);
				if ($res!==true) {
					$response->msg .= 'ERROR ON ZIP file extraction to '.DEDALO_SOURCE_VERSION_LOCAL_DIR;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					$response->errors[]	= 'Unable to open ZIP file ' .$target_file;
					return $response;
				}
				$zip->extractTo(DEDALO_SOURCE_VERSION_LOCAL_DIR);
				$zip->close();
				$result->extract = [
					"Extracted ZIP file to: " . DEDALO_SOURCE_VERSION_LOCAL_DIR
				];
				debug_log(__METHOD__
					." ZIP file extracted successfully to ".DEDALO_SOURCE_VERSION_LOCAL_DIR
					, logger::DEBUG
				);

			// Install the new code
				// CLI msg
					if ( running_in_cli()===true ) {
						print_cli((object)[
							'msg'		=> 'Updating files',
							'memory'	=> dd_memory_usage()
						]);
					}
				// source: unzip directory name. Note that this folder was zip using `build_version_code` method
				// resulting file is: 6.4.0_dedalo.zip (server) => dedalo_code.zip (downloaded) => /dedalo_code (unzipped)
				$source		= DEDALO_SOURCE_VERSION_LOCAL_DIR .'/'. 'dedalo_code';
				$target		= DEDALO_ROOT_PATH;

				// upgrade files
				// copy downloaded folder to httpdocs like ../tmp/dedalo_code => ../httpdocs/dedalo_code
					$command = "cp -R {$source} {$target}_code";
					exec($command, $output, $result_code);
					if ($result_code!=0) {
						$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
						debug_log(__METHOD__
							. $response->msg  . PHP_EOL
							. ' command: ' . to_string($command) . PHP_EOL
							. ' output: ' . to_string($output) . PHP_EOL
							. ' result_code: ' . to_string($result_code)
							, logger::ERROR
						);
						return $response;
					}
					debug_log(__METHOD__
						. " exec command" . PHP_EOL
						. " command " . to_string($command) . PHP_EOL
						. " output " . to_string($output) . PHP_EOL
						. " result_code type " . gettype($result_code) . PHP_EOL
						. " result_code " . to_string($result_code)
						, logger::WARNING
					);

				// copy config files
					$files_to_copy = [
						'config/config.php',
						'config/config_db.php',
						'config/config_areas.php',
						'config/config_core.php'
					];
					foreach ($files_to_copy as $file_name) {

						if (!copy("{$target}/$file_name", "{$target}_code/{$file_name}")){
							$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error on copy file: '.$file_name;
							debug_log(__METHOD__
								. " copy file error " . PHP_EOL
								. " source " . "{$target}/$file_name" . PHP_EOL
								. " target " . "{$target}_code/{$file_name}"
								, logger::ERROR
							);
							return $response;
						}else{
							debug_log(__METHOD__
								. " copy file success " . PHP_EOL
								. " source " . "{$target}/$file_name" . PHP_EOL
								. " target " . "{$target}_code/{$file_name}"
								, logger::WARNING
							);
						}
					}

				// tools
					$dd_tools = [
						'tool_cataloging',
						'tool_common',
						'tool_dd_label',
						'tool_dev_template',
						'tool_diffusion',
						'tool_export',
						'tool_hierarchy',
						'tool_image_rotation',
						'tool_import_dedalo_csv',
						'tool_import_files',
						'tool_import_marc21',
						'tool_import_rdf',
						'tool_import_zotero',
						'tool_indexation',
						'tool_lang',
						'tool_lang_multi',
						'tool_media_versions',
						'tool_numisdata_epigraphy',
						'tool_numisdata_order_coins',
						'tool_pdf_extractor',
						'tool_posterframe',
						'tool_propagate_component_data',
						'tool_qr',
						'tool_subtitles',
						'tool_tc',
						'tool_time_machine',
						'tool_tr_print',
						'tool_transcription',
						'tool_update_cache',
						'tool_upload',
						'tool_user_admin'
					];

					$tools_src = "{$target}/tools";
					$old_tools = dir($tools_src);
					while(($file = $old_tools->read()) !== false) {
						if($file === "." || $file === "..") continue;
						if( is_dir($tools_src .'/'. $file) && !in_array($file, $dd_tools) ) {

							$command = "cp -R {$tools_src}/{$file} {$target}_code/tools/{$file}";
							exec($command, $output, $result_code);
							if ($result_code!=0) {
								$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
								debug_log(__METHOD__
									. $response->msg  . PHP_EOL
									. ' command: ' . to_string($command) . PHP_EOL
									. ' output: ' . to_string($output) . PHP_EOL
									. ' result_code: ' . to_string($result_code)
									, logger::ERROR
								);
								return $response;
							}
							debug_log(__METHOD__
								. " exec command" . PHP_EOL
								. " command " . to_string($command) . PHP_EOL
								. " output " . to_string($output) . PHP_EOL
								. " result_code type " . gettype($result_code) . PHP_EOL
								. " result_code " . to_string($result_code)
								, logger::WARNING
							);
						}
					}

				// move directory old version to backups as '../httpdocs/dedalo' => '../backup/code/dedalo_6.3.1'
					$backup_code_path = DEDALO_BACKUP_PATH . '/code';
					create_directory($backup_code_path);
					$old_copy_final_path = "{$backup_code_path}/dedalo_" .DEDALO_VERSION . '_' . date('Y-m-d_his');
					$command = "mv $target $old_copy_final_path";
					exec($command, $output, $result_code);
					if ($result_code!=0) {
						$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
						debug_log(__METHOD__
							. $response->msg  . PHP_EOL
							. ' command: ' . to_string($command) . PHP_EOL
							. ' output: ' . to_string($output) . PHP_EOL
							. ' result_code: ' . to_string($result_code)
							, logger::ERROR
						);
						return $response;
					}
					debug_log(__METHOD__
						. " exec command" . PHP_EOL
						. " command " . to_string($command) . PHP_EOL
						. " output " . to_string($output) . PHP_EOL
						. " result_code type " . gettype($result_code) . PHP_EOL
						. " result_code " . to_string($result_code)
						, logger::WARNING
					);

				// move media directory from old to the new directory like '../backup/code/dedalo_6.3.1/media' => '../httpdocs/dedalo_code/media'
					$command = "mv {$old_copy_final_path}/media {$target}_code/media";
					exec($command, $output, $result_code);
					if ($result_code!=0) {
						$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
						debug_log(__METHOD__
							. $response->msg  . PHP_EOL
							. ' command: ' . to_string($command) . PHP_EOL
							. ' output: ' . to_string($output) . PHP_EOL
							. ' result_code: ' . to_string($result_code)
							, logger::ERROR
						);
						return $response;
					}
					debug_log(__METHOD__
						. " exec command" . PHP_EOL
						. " command " . to_string($command) . PHP_EOL
						. " output " . to_string($output) . PHP_EOL
						. " result_code type " . gettype($result_code) . PHP_EOL
						. " result_code " . to_string($result_code)
						, logger::WARNING
					);

				// rename new version directory to final dir such as 'dedalo_code' => 'dedalo'
					$command = "mv {$target}_code {$target}";
					exec($command, $output, $result_code);
					if ($result_code!=0) {
						$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
						debug_log(__METHOD__
							. $response->msg  . PHP_EOL
							. ' command: ' . to_string($command) . PHP_EOL
							. ' output: ' . to_string($output) . PHP_EOL
							. ' result_code: ' . to_string($result_code)
							, logger::ERROR
						);
						return $response;
					}
					debug_log(__METHOD__
						. " exec command" . PHP_EOL
						. " command " . to_string($command) . PHP_EOL
						. " output " . to_string($output) . PHP_EOL
						. " result_code type " . gettype($result_code) . PHP_EOL
						. " result_code " . to_string($result_code)
						, logger::WARNING
					);

				// set permissions
					$command = "chmod -R 750 {$target}";
					exec($command, $output, $result_code);
					if ($result_code!=0) {
						$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
						debug_log(__METHOD__
							. $response->msg  . PHP_EOL
							. ' command: ' . to_string($command) . PHP_EOL
							. ' output: ' . to_string($output) . PHP_EOL
							. ' result_code: ' . to_string($result_code)
							, logger::ERROR
						);
						return $response;
					}
					debug_log(__METHOD__
						. " exec command" . PHP_EOL
						. " command " . to_string($command) . PHP_EOL
						. " output " . to_string($output) . PHP_EOL
						. " result_code type " . gettype($result_code) . PHP_EOL
						. " result_code " . to_string($result_code)
						, logger::WARNING
					);

			// remove temp used files and folders
				$command_rm_dir		= "rm -R -f $source";
				$output_rm_dir		= shell_exec($command_rm_dir);
				$result->remove_dir	= [
					"command_rm_dir: " . $command_rm_dir,
					"output_rm_dir: "  . $output_rm_dir
				];
				$command_rm_file 	= "rm $target_file";
				$output_rm_file		= shell_exec($command_rm_file);
				$result->remove_file= [
					"command_rm_file: " . $command_rm_file,
					"output_rm_file: "  . $output_rm_file
				];
				debug_log(__METHOD__
					." Removed temp used files and folders"
					, logger::DEBUG
				);

			// update JAVASCRIPT labels
				// CLI msg
					if ( running_in_cli()===true ) {
						print_cli((object)[
							'msg'		=> 'Updating js lang files',
							'memory'	=> dd_memory_usage()
						]);
					}
				$ar_langs = DEDALO_APPLICATION_LANGS;
				foreach ($ar_langs as $lang => $label) {
					backup::write_lang_file($lang);
				}

			// version info. Get from new downloaded file 'version.inc'
				$new_version_info = DEDALO_VERSION . ' Build ' . DEDALO_BUILD;

			// debug
				debug_log(__METHOD__
					.' Updated Dédalo code successfully. ' . $new_version_info
					, logger::DEBUG
				);

			// pause and force garbage collector (prevent cached files generating errors)
				sleep(1);
				opcache_reset();
				gc_collect_cycles();
				sleep(1);

			// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
				logger::$obj['activity']->log_message(
					'SAVE',
					logger::INFO,
					DEDALO_ROOT_TIPO,
					NULL,
					[
						'msg' => 'Updated code to v. ' . $new_version_info
					],
					logged_user_id() // int
				);

		} catch (Exception $e) {

			$response->msg = $e->getMessage();
		}

		$response->result	= $result ?? false;
		$response->msg		= 'OK. Updated Dédalo code successfully';


		return $response;
	}//end update_code



	/**
	* BUILD_VERSION_FROM_GIT_MASTER
	* Called by client widget code via the API
	* @param object $options
	* @return object $response
	*/
	public static function build_version_from_git_master( object $options ) : object {

		$start_time = start_time();

		// Write session to unlock session file
		session_write_close();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';
				$response->errors	= [];

		// options
			$branch = $options->branch ?? 'master';

		// try exec
			try {

				$output = update_code::build_version_code( $branch );

				// Append msg

				if( $output!==true ) {
					$response->msg = ' Error, is not possible build version code shell_exec output: '. $output;
					debug_log(__METHOD__
						.' ERROR: build_version_code output: '.$output
						, logger::ERROR
					);
					$response->errors[] = 'shell_exec execution failed';
					return $response;
				}

				$response->result = true;
				$response->msg = 'OK. The code version has been created successfully';

			} catch (Exception $e) {

				// Append msg
				$response->msg .= $e->getMessage();
				debug_log(__METHOD__
					." build_version_code output ERROR: $response->msg " . PHP_EOL
					. ' response: ' . to_string($response)
					, logger::ERROR
				);
				$response->errors[] = 'Exception occurred: '.$e->getMessage();
			}

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit_auto($start_time);
				$response->debug = $debug;
			}


		return $response;
	}//end build_version_from_git_master



	/**
	* BUILD_VERSION_CODE
	* Creates the GIT archive form given branch
	* executing a custom PHP command
	* Private: do not call directly from API
	* @see update_code::build_version_from_git_master
	* @param string $branch
	* @return string|true
	*/
	private static function build_version_code( string $branch ) : string|true {

		// version
			$version = get_dedalo_version();
			$major_version = $version[0];

		// version path
		// to create the path for the current version, it use major, and minor as
		// `/dedalo/code/6/6.4/
			$target_path = update_code::set_code_path();

		// build code target
			$file_verion	= update_code::get_file_version();
			$target			= $target_path .'/'.$file_verion.'.zip';

		// developer branch case
			if ($branch==='developer') {
				$development_path	= update_code::set_development_path();
				$target				= $development_path .'/dedalo_development.zip';
				$branch				= 'v'.$major_version.'_developer';
			}

		// source
			$source = DEDALO_CODE_SERVER_GIT_DIR;

		// command @see https://git-scm.com/docs/git-archive
			$command = strpos($source, 'ssh://')!==false
				? "git archive --remote=$source --verbose --format=zip --prefix=dedalo_code/ $branch > $target" // remote GIT
				: "cd $source; git archive --verbose --format=zip --prefix=dedalo_code/ $branch > $target "; // local GIT

		// debug
			debug_log(__METHOD__
				. " Called Dédalo build_version_code with command: " .PHP_EOL
				. to_string($command)
				, logger::DEBUG
			);

		$output			= null;
		$result_code	= null;
		exec($command, $output, $result_code);

		$result = ( $result_code===0 )
			? true
			: 'Return:'.PHP_EOL.'result code: '. ($result_code ?? null). PHP_EOL . 'output: ' . json_encode($output, JSON_PRETTY_PRINT);


		return $result;
	}//end build_version_code



	/**
	* GET_CODE_PATH
	* Get current version path for code
	* Check if exists, and return the path or false.
	* To create the path for the current version, it uses major, and minor
	* such as /dedalo/code/6/6.4/
	* @param array|null $version = null
	* @return string|false $path
	*/
	public static function get_code_path( ?array $version = null ) : string|false {

		$dedalo_version	= $version ?? get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];
		$base_path		= DEDALO_CODE_FILES_DIR."/{$dedalo_version[0]}/{$version_path}";
		$path			= is_dir( $base_path )===true
			? $base_path
			: false;

		return $path;
	}//end get_code_path



	/**
	* SET_CODE_PATH
	* Set current version path for code
	* Check if it exists, otherwise create it
	* @return string|false $path
	*/
	public static function set_code_path() : string|false {

		$dedalo_version	= get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];
		$base_path		= DEDALO_CODE_FILES_DIR."/{$dedalo_version[0]}/{$version_path}";
		$path			= create_directory( $base_path )===false
			? false
			: $base_path;

		return $path;
	}//end set_code_path



	/**
	* GET_FILE_VERSION
	* Get current version path for code
	* Check if exists, and return the path or false.
	* To create the path for the current version, it use major, and minor
	* such as /dedalo/code/6/6.4/
	* @param array|null $version = null
	* @return string|false $path
	*/
	public static function get_file_version( ?array $version = null ) : string {

		$dedalo_version	= $version ?? get_dedalo_version();
		$file_version	= implode('.', $dedalo_version).'_dedalo';

		return $file_version;
	}//end get_file_version



	/**
	* SET_DEVELOPMENT_PATH
	* Set current version path for development code, nightly version
	* Check if exist, else create it.
	* @return string|false $path
	*/
	public static function set_development_path() : string|false {

		$base_path	= DEDALO_CODE_FILES_DIR . '/development';
		$path		= create_directory( $base_path )===false
			? false
			: $base_path;

		return $path;
	}//end set_development_path



	/**
	* GET_CODE_URL
	* Get the current version URL for code directory
	* Check if exists, and return the URL or false
	* @param array|null $version = null
	* @return string|false $url
	*/
	public static function get_code_url( ?array $version = null ) : string|false {

		$dedalo_version	= $version ?? get_dedalo_version();
		$version_path	= $dedalo_version[0] .'.'. $dedalo_version[1];
		$base_path		= DEDALO_CODE_FILES_DIR . "/{$dedalo_version[0]}/{$version_path}";
		$url			= is_dir( $base_path )===true
			? DEDALO_CODE_FILES_URL . "/{$dedalo_version[0]}/{$version_path}"
			: false;

		return $url;
	}//end get_code_URl



	/**
	* GET_CODE_UPDATE_INFO
	* Collect local code files and set the valid files from given code version
	* Called by API.
	* Merge all information into one object using the available code files
	* @param array $client_version
	* 	as [6.4.0]
	* @return object $response
	* {
	*	result : {
	*		info : {},
	* 		files : [{
	* 			version : 6.4.1,
	* 			compatible : true,
	* 			url : https://master.dedalo.dev/code/6/6.4/6.4.1_dedalo.zip
	* 		}]
	* 	}
	* }
	*/
	public static function get_code_update_info( array $client_version ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// updates
		// reads 'update.php' file object
			$updates_object = update::get_updates();

			$next_version				= null;
			$next_version_update_from	= null;
			$upper_versions				= [];
			foreach ( $updates_object as $update ) {

				// check the next valid major version
				// only next major version is take in consideration
				// as 7.0.0 but any other minor or path versions as 7.0.1 or 7.2.0
				if( $update->version_major===$client_version[0]+1 &&
					$update->version_medium===0 &&
					$update->version_minor===0){
						// set the next major as possible option
						$next_version = [
							$update->version_major,
							$update->version_medium,
							$update->version_minor,
						];
						// get the valid version from the major version can update itself.
						$next_version_update_from = [
							$update->update_from_major,
							$update->update_from_medium,
							$update->update_from_minor,
						];
						// reset any other major versions
						// when client is in version 6.4.0 is not possible update to version 8.0.0
						// only version 7.0.0 is available as a possible update.
						$upper_versions = [];
				}

				// check the next valid minor version
				// only next minor version is take in consideration
				// as 6.5.0 but any other path versions as 6.5.1 or 6.6.1
				// this check overwrite previous major check
				if( $update->version_major===$client_version[0] &&
					$update->version_medium===$client_version[1]+1 &&
					$update->version_minor===0){
						// set it as next version
						$next_version = [
							$update->version_major,
							$update->version_medium,
							$update->version_minor,
						];
						// get the valid version from the minor version can update itself.
						$next_version_update_from = [
							$update->update_from_major,
							$update->update_from_medium,
							$update->update_from_minor,
						];
					// reset any other major or minor versions
					// when client is in version 6.2.9 is not possible update to version 7.0.0
					// only version 6.3.0 is available as a possible update.
					$upper_versions = [];
				}
				// check any other version bellow current client versions
				// remove they as possibles. Downgrade is not available in Dédalo updates
				// Go ahead!!!
				$add = false;
				// major
				if( (int)$update->version_major > (int)$client_version[0] ){
					$add = true;
				}
				// minor
				if( $add === false &&
					(int)$update->version_major >= (int)$client_version[0] &&
				    (int)$update->version_medium > (int)$client_version[1]
				){
					$add = true;
				}
				// path
				if( $add === false &&
					(int)$update->version_major >= (int)$client_version[0] &&
				   	(int)$update->version_medium >= (int)$client_version[1] &&
				  	(int)$update->version_minor > (int)$client_version[2]
				){
					$add = true;
				}
				// set if the version is greater than client version.
				if ($add===true) {

					$valid_version = [
						$update->version_major,
						$update->version_medium,
						$update->version_minor,
					];

					$upper_versions[] = $valid_version;
				}
			}

		// check the upper_versions to remove the non valid options
		// if the client is in the middle of the minor versions
		// it will need to update until last patch of his minor version:
		// client in 6.2.2
		// can update to 6.2.3, 6.2.4, 6.2.5, 6.2.7, 6.2.8 and 6.2.9
		// only when the client has the last path version can update to next minor:
		// client in 6.2.9
		// can update to 6.3.0
		// only when the client has the last minor version can update to next major:
		// client in 6.9.9
		// can update to 7.0.0
		$versions = [];
		foreach ($upper_versions as $version) {

			// remove the next minor versions that are greatest than next minor version.
			if( $version[0] === $next_version[0] &&
				$version[1] > $next_version[1]
			){
				continue;
			}
			// remove the next patch versions that are greatest than next patch version.
			if( $version[0] === $next_version[0] &&
				$version[1] === $next_version[1] &&
				$version[2] > 0
			){
				continue;
			}
			// check if the current version is the next version
			// if client has 6.2.9 the next version will be 6.3.0
			if( $version[0] === $next_version[0] &&
				$version[1] === $next_version[1] &&
				$version[2] === $next_version[2]
			){
				// check if the client has the valid version to update to next version
				// 6.2.9 vs 6.2.2 -> not valid
				// 6.2.9 vs 6.2.9 -> valid
				if( $next_version_update_from[0] !== $client_version[0] ||
					$next_version_update_from[1] !== $client_version[1] ||
					$next_version_update_from[2] !== $client_version[2]
				){
					// is not valid
					// the client has not the correct version to update to next minor or major version.
					continue;
				}
			}
			$versions[] = $version;
		}

		// result
			$result = new stdClass();
				$result->info	= new stdClass();
				$result->files	= [];

		// info
			$date			= dd_date::get_now_as_iso_timestamp();
			$dedalo_version	= get_dedalo_version();
			$server_version	= implode( '.', $dedalo_version );

			$result->info->version		= $server_version;
			$result->info->date			= $date;
			$result->info->entity_id	= DEDALO_ENTITY_ID;
			$result->info->entity		= DEDALO_ENTITY;
			$result->info->entity_label	= DEDALO_ENTITY_LABEL;
			$result->info->host			= DEDALO_HOST;

		// files
			// build the file_path with the valid versions
			// client will can select what is the update that it want use.
			foreach ($versions as $valid_version) {

				$code_url = update_code::get_code_url( $valid_version );

				$current_version_path	= update_code::get_code_path( $valid_version );
				$file_version			= update_code::get_file_version( $valid_version );

				$file_name = $file_version.'.zip';
				$file_path = $current_version_path.'/'.$file_name;

				if(file_exists($file_path)){

					$file_item = new stdClass();
						$file_item->version	= implode('.', $valid_version);
						$file_item->url		= DEDALO_PROTOCOL . DEDALO_HOST . $code_url .'/'. basename( $file_name );

					$result->files[] = $file_item;
				}
			}

		// response
		$response->result	= $result;
		$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end get_code_update_info( $ar_version )



}//end update_code
