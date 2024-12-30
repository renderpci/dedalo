<?php declare(strict_types=1);
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
				$rqo->dd_api	= "dd_utils_api";
				$rqo->action	= "get_server_ready_status";
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
				$server_ready			= update_code::check_remote_server( $server );
				$server->msg			= $server_ready->msg;
				$server->error			= $server_ready->error;
				$server->response_code	= $server_ready->code;
				$server->result			= $server_ready->result;
				$server->code			= $server->code;
				$code_servers[]			= $server;
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
	* @return object $response
	*/
	public static function update_code(object $options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		try {

			$result = new stdClass();

			debug_log(__METHOD__." Start downloading file ".DEDALO_SOURCE_VERSION_URL, logger::DEBUG);

			// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg'		=> 'Start downloading file: ' . DEDALO_SOURCE_VERSION_URL,
						'memory'	=> dd_memory_usage()
					]);
				}

			// Download zip file from server (master) curl mode (unified with download_remote_structure_file)
				// data
				$data_string = "data=" . json_encode(null);
				// curl_request
				$curl_response = curl_request((object)[
					'url'				=> DEDALO_SOURCE_VERSION_URL,
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
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Contents from Dédalo code repository fail to download from: '.DEDALO_SOURCE_VERSION_URL;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					return $response;
				}
				$result->download_file = [
					'Downloaded file: ' . DEDALO_SOURCE_VERSION_URL,
					'Time: ' . exec_time_unit($start_time,'sec') . ' secs'
				];
				debug_log(__METHOD__
					." Downloaded file (".DEDALO_SOURCE_VERSION_URL.") in ".exec_time_unit($start_time,'sec') . ' secs'
					, logger::DEBUG
				);

			// Save contents to local dir
				if (!is_dir(DEDALO_SOURCE_VERSION_LOCAL_DIR)) {
					if( !mkdir(DEDALO_SOURCE_VERSION_LOCAL_DIR,  0775) ) {
						$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Unable to create dir: '.DEDALO_SOURCE_VERSION_LOCAL_DIR;
						debug_log(__METHOD__
							." $response->msg"
							, logger::ERROR
						);
						return $response;
					}
				}
				$file_name		= 'dedalo6_code.zip';
				$target_file	= DEDALO_SOURCE_VERSION_LOCAL_DIR . '/' . $file_name;
				$put_contents	= file_put_contents($target_file, $contents);
				if (!$put_contents) {
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Contents from Dédalo code repository fail to write on : '.$target_file;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					return $response;
				}
				$result->write_file = [
					"Written file: ". $target_file,
					"File size: "	. format_size_units( filesize($target_file) )
				];

			// extract files from zip. (!) Note that 'ZipArchive' need to be installed in PHP to allow work
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
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. ERROR ON ZIP file extraction to '.DEDALO_SOURCE_VERSION_LOCAL_DIR;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
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

			// rsync
				// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg'		=> 'Updating files',
						'memory'	=> dd_memory_usage()
					]);
				}
				$source		= (strpos(DEDALO_SOURCE_VERSION_URL, 'github.com'))
					? DEDALO_SOURCE_VERSION_LOCAL_DIR .'/dedalo-master' // like 'dedalo-master'
					: DEDALO_SOURCE_VERSION_LOCAL_DIR .'/'. pathinfo($file_name)['filename']; // like 'dedalo6_code' from 'dedalo6_code.zip'
				$target		= DEDALO_ROOT_PATH;
				$exclude	= ' --exclude="*/config*" --exclude="media" ';
				$additional = ''; // $is_preview===true ? ' --dry-run ' : '';
				$command	= 'rsync -avui --no-owner --no-group --no-perms --progress '. $exclude . $additional . $source.'/ ' . $target.'/';
				$output		= shell_exec($command);
				if ($output===null) {
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing rsync command. source: '.$source;
					debug_log(__METHOD__
						. $response->msg  . PHP_EOL
						. ' command: ' . to_string($command) . PHP_EOL
						. ' output: ' . to_string($output)
						, logger::ERROR
					);
					return $response;
				}
				$result->rsync = [
					"command: " . $command,
					"output: "  . str_replace(["\n","\r"], '<br>', $output),
				];
				debug_log(__METHOD__
					." RSYNC command done ". PHP_EOL .to_string($command)
					, logger::DEBUG
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
				$command = 'ddversion=`'.PHP_BIN_PATH.' << \'EOF\'
				<?php require "'.DEDALO_CORE_PATH.'/base/version.inc"; echo DEDALO_VERSION ." Build ". DEDALO_BUILD; ?>`
				echo $ddversion';
				// exec command
				$new_version_info = exec($command); // string like '6.0.0_RC6 Build 2023-08-22T19:19:35+02:00'

			// response OK
				// $response->result	= $result;
				// $response->msg		= 'OK. Updated Dédalo code successfully. ' . $new_version_info;

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

		$response->result	= true;
		$response->msg		= 'OK. Updated Dédalo code successfully. '.__METHOD__;


		return $response;
	}//end update_code




	/**
	* BUILD_VERSION_FROM_GIT_MASTER
	* Called from dd_list.js -> dd.build_version_from_git_master()
	*/
	public static function build_version_from_git_master(object $options) : object {

		// Write session to unlock session file
		session_write_close();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';

		// options
			$options = $data;
			$version = $options->version;
			if (empty($version)) {
				$response->msg = 'Version is mandatory!';
				return $response;
			}
			$branch = $options->branch ?? 'master';


		// try exec
			try{

				$output = update_code::update_head_code($response, $version, $branch);

				// Append msg
				$msg = PHP_EOL ."update_head_code shell_exec output: ". PHP_EOL. to_string($output);
				$response->msg .= $msg;
				debug_log(__METHOD__
					." update_head_code output OK: $msg "
					, logger::DEBUG
				);

				$response->result = true;

			} catch (Exception $e) {

				// Append msg
				$response->msg .= $e->getMessage();
				debug_log(__METHOD__
					." update_head_code output ERROR: $response->msg " . PHP_EOL
					. ' response: ' . to_string($response)
					, logger::ERROR
				);
			}

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit_auto($start_time);
				$response->debug = $debug;
			}

		header('Content-Type: application/json');
		echo json_encode($response, JSON_UNESCAPED_UNICODE);


		return $response;
	}//end export_str



	// rsync trigger code HEAD from master git
	private static function update_head_code(object $response, int $version, string $branch) : string {

		if ($version==6) {
			// source
			$source = DEDALO_6_CODE_SERVER_GIT_DIR;
			// target
			$target = DEDALO_6_CODE_FILES_DIR .'/dedalo'.$version.'_code.zip';
			// branch conditional
			if ($branch==='v6_developer') {
				$target = DEDALO_6_CODE_FILES_DIR .'/dedalo'.$version.'_'.$branch.'_code.zip';
			}
			// command @see https://git-scm.com/docs/git-archive
			$command = "cd $source; git archive --verbose --format=zip --prefix=dedalo{$version}_code/ $branch > $target ";

		}else{
			// source
			$source = DEDALO_CODE_SERVER_GIT_DIR;
			// target
			$target = DEDALO_CODE_FILES_DIR .'/dedalo'.$version.'_code.zip';
			// command @see https://git-scm.com/docs/git-archive
			$command = "cd $source; git archive --verbose --format=zip --prefix=dedalo{$version}_code/ v5 > $target ";
		}

		$msg = "Called Dédalo update_head_code with command: " .PHP_EOL. to_string($command);
		debug_log(__METHOD__." $msg ".to_string(), logger::DEBUG);
		$response->msg .= PHP_EOL . $msg;

		$output_array	= null;
		$retval			= null;
		exec($command, $output_array, $retval);

		$result = 'Return:'.PHP_EOL.'status: '. ($retval ?? null). PHP_EOL . 'output: ' . json_encode($output_array, JSON_PRETTY_PRINT);

		return $result;
	}



	/**
	* SET_DEVELOPMENT_PATH
	* Set current version path for development code, nightly version
	* Check if exist, else create it.
	* if the directory doesn't exist it will be created.
	* @return string|false $path
	*/
	public static function set_development_path() : string|false {

		$base_path	= DEDALO_CODE_FILES_DIR."/development";
		$path		= create_directory( $base_path )===false
			? false
			: $base_path;

		return $path;
	}//end set_development_path

}//end update_code
