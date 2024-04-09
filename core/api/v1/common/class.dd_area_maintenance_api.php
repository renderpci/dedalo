<?php
declare(strict_types=1); // NOT IN UNIT TEST !
/**
* DD_AREA_MAINTENANCE_API
* Manage API REST data flow of the area with Dédalo
* This class is a collection of area exposed methods to the API using
* a normalized RQO (Request Query Object)
* Note that only authorized users (Global Admins, Developer and root users)
* can access this methods (permissions checked in dd_manager)
*
*/
final class dd_area_maintenance_api {



	/**
	* CLASS_REQUEST
	* Call to class method given and return and object with the response
	* Method must be static and accept a only one object argument
	* Method must return an object like { result: mixed, msg: string }
	*
	* @param object $rqo
	* sample:
	* {
	* 	action: "class_request"
	* 	dd_api: "dd_area_maintenance_api"
	* 	source: {
	* 		typo: "source",
	* 		action: "make_backup"
	* 	},
	* 	options: {
	*   	skip_backup_time_range: true
	*   }
	* }
	* @return object response { result: mixed, msg: string }
	*/
	public static function class_request(object $rqo) : object {

		// options
			$options			= $rqo->options ?? [];
			$fn_arguments		= $options;
			$background_running	= $options->background_running ?? false;

		// source
			$source			= $rqo->source;
			$class_name		= 'area_maintenance';
			$class_method	= $source->action;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
				$response->errors	= [];

		// check valid options
			if (!is_object($options)) {
				$response->msg = 'Error. invalid options ';
				$response->errors[] = 'Invalid options type';
				debug_log(__METHOD__
					. " $response->msg " . PHP_EOL
					. ' options: ' .to_string($options)
					, logger::ERROR
				);
				return $response;
			}

		// method (static)
			if (!method_exists($class_name, $class_method)) {
				$response->msg = 'Error. class method \''.$class_method.'\' do not exists ';
				return $response;
			}
			try {

				// background_running / direct cases
				switch (true) {
					case ($background_running===true):

						$cli_options = new stdClass();
							$cli_options->class_name	= $class_name;
							$cli_options->method_name	= $class_method;
							$cli_options->class_file	= null; // already loaded by loader
							$cli_options->params		= $options;

						$fn_result = exec_::request_cli($cli_options);
						break;

					default:
						// direct case

						$fn_result = call_user_func(array($class_name, $class_method), $fn_arguments);
						break;
				}

			} catch (Exception $e) { // For PHP 5

				debug_log(__METHOD__
					." Exception caught [class_request] : ". $e->getMessage()
					, logger::ERROR
				);
				trigger_error($e->getMessage());


				$fn_result = new stdClass();
					$fn_result->result	= false;
					$fn_result->msg		= 'Error. Request failed on call_user_func method: '.$class_method;
					$response->errors[] = 'Invalid method ' . $class_method;
			}

			$response = $fn_result;


		return $response;
	}//end class_request



	/**
	* UPDATE_ONTOLOGY
	* @param object $rqo
	* @return object $response
	*/
	public static function update_ontology(object $rqo) : object {

		session_write_close();

		// options
			$options = $rqo->options ?? [];

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// dedalo_prefix_tipos
			$dedalo_prefix_tipos = array_find((array)$options, function($item){
				return $item->name==='dedalo_prefix_tipos';
			})->value ?? '';
			$ar_dedalo_prefix_tipos = array_map(function($item){
				return trim($item);
			}, explode(',', $dedalo_prefix_tipos));
			if (empty($ar_dedalo_prefix_tipos)) {
				// error
				$response->msg .= ' - Empty dedalo_prefix_tipos value!';
				return $response;
			}

		$response = backup::update_ontology( $ar_dedalo_prefix_tipos );


		return $response;
	}//end update_ontology



	/**
	* STRUCTURE_TO_JSON
	* @param object $rqo
	* @return object $response
	*/
	public static function structure_to_json(object $rqo) : object {

		// session_write_close();

		// options
			$options = $rqo->options ?? [];

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// dedalo_prefix_tipos
			$dedalo_prefix_tipos = array_find((array)$options, function($item){
				return $item->name==='dedalo_prefix_tipos';
			})->value ?? '';
			$ar_dedalo_prefix_tipos = array_map(function($item){
				return trim($item);
			}, explode(',', $dedalo_prefix_tipos));
			if (empty($ar_dedalo_prefix_tipos)) {
				$response->msg .= ' - Empty dedalo_prefix_tipos value!';
				return $response;
			}

		$ar_tld		= $ar_dedalo_prefix_tipos;
		$json_data	= backup::structure_to_json($ar_tld);

		$file_name	= 'structure.json';
		$file_path	= (defined('STRUCTURE_DOWNLOAD_JSON_FILE') ? STRUCTURE_DOWNLOAD_JSON_FILE : ONTOLOGY_DOWNLOAD_DIR) . '/' . $file_name;

		if(!file_put_contents($file_path, json_encode($json_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX)) {
			// write error occurred
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']. Impossible to write json file';
			return $response;
		}

		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end structure_to_json



	/**
	* IMPORT_STRUCTURE_FROM_JSON
	* @param object $rqo
	* @return object $response
	*/
	public static function import_structure_from_json(object $rqo) : object {

		// session_write_close();

		// options
			$options = $rqo->options ?? [];

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// dedalo_prefix_tipos
			$dedalo_prefix_tipos = array_find((array)$options, function($item){
				return $item->name==='dedalo_prefix_tipos';
			})->value ?? '';
			$ar_dedalo_prefix_tipos = array_map(function($item){
				return trim($item);
			}, explode(',', $dedalo_prefix_tipos));


		$ar_tld	= empty($ar_dedalo_prefix_tipos) ? [] : $ar_dedalo_prefix_tipos;

		$file_name	= 'structure.json';
		$file_path	= (defined('STRUCTURE_DOWNLOAD_JSON_FILE') ? STRUCTURE_DOWNLOAD_JSON_FILE : ONTOLOGY_DOWNLOAD_DIR) . '/' . $file_name;

		$data		= json_decode( file_get_contents($file_path) );
		$response	= backup::import_structure_json_data($data, $ar_tld);

		$response->result	= true;
		$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end import_structure_from_json



	/**
	* UPDATE_DATA_VERSION
	* Updates Dédalo data version.
	* Allow change components data format or add new tables or index
	* Triggered by Area Development button 'UPDATE DATA'
	* Sample: Current data version: 5.8.2 -----> 6.0.0
	* @param object $rqo
	* @return object $response
	*/
	public static function update_data_version(object $rqo) : object {

		// set time limit
			set_time_limit ( 259200 );  // 3 days

		include(DEDALO_CORE_PATH . '/base/update/class.update.php');

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		try {

			// exec update_data_version. return object response
				$update_data_version_response = update::update_version();

		} catch (Exception $e) {

			debug_log(__METHOD__
				. " Caught exception [update_data_version]: " . PHP_EOL
				. ' msg: ' . $e->getMessage()
				, logger::ERROR
			);

			$update_data_version_response = (object)[
				'result'	=> false,
				'msg'		=> 'ERROR on update_data_version .Caught exception: ' . $e->getMessage()
			];

			// log line
				$update_log_file = DEDALO_CONFIG_PATH . '/update.log';
				$log_line  = PHP_EOL . date('c') . ' ERROR [Exception] ';
				$log_line .= PHP_EOL . 'Caught exception: ' . $e->getMessage();
				file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);
		}

		$response->result	= $update_data_version_response->result ?? false;
		$response->msg		= $update_data_version_response->msg ?? 'Error. Request failed ['.__FUNCTION__.']';


		return $response;
	}//end update_data_version



	/**
	* UPDATE_CODE
	* Download code in zip format file from the GIT repository defined in config
	* @param object $rqo
	* @return object $response
	*/
	public static function update_code(object $rqo) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;

		try {

			$result = new stdClass();

			debug_log(__METHOD__." Start downloading file ".DEDALO_SOURCE_VERSION_URL, logger::DEBUG);

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
				$source		= (strpos(DEDALO_SOURCE_VERSION_URL, 'github.com'))
					? DEDALO_SOURCE_VERSION_LOCAL_DIR .'/dedalo-master' // like 'dedalo-master'
					: DEDALO_SOURCE_VERSION_LOCAL_DIR .'/'. pathinfo($file_name)['filename']; // like 'dedalo6_code' from 'dedalo6_code.zip'
				$target		= DEDALO_ROOT_PATH;
				$exclude	= ' --exclude="*/config*" --exclude="media" ';
				$aditional 	= ''; // $is_preview===true ? ' --dry-run ' : '';
				$command	= 'rsync -avui --no-owner --no-group --no-perms --progress '. $exclude . $aditional . $source.'/ ' . $target.'/';
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
					]
				);

		} catch (Exception $e) {

			$response->msg = $e->getMessage();
		}

		$response->result	= true;
		$response->msg		= 'OK. Updated Dédalo code successfully. '.__METHOD__;


		return $response;
	}//end update_code



	/**
	* LOCK_COMPONENTS_ACTIONS
	* Get lock components active users info
	*
	* @param object $rqo
	* 	Sample:
	* {
	* 	action	: "lock_components_actions",
	*	dd_api	: 'dd_area_maintenance_api',
	* 	options : {
	* 		'fn_action' : get_active_users
	* 	}
	* }
	* @return object $response
	*/
	public static function lock_components_actions( object $rqo ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= [];
				$response->error	= null;

		// options
			$fn_action	= $rqo->options->fn_action;
			$user_id	= $rqo->options->user_id ?? null;

		// switch fn_action
			switch ($fn_action) {
				case 'get_active_users':
					$response->result			= true;
					$response->ar_user_actions	= lock_components::get_active_users_full();
					break;

				case 'force_unlock_all_components':
					$user_id = !empty($user_id)
						? (int)$user_id
						: null;
					$response = lock_components::force_unlock_all_components($user_id);
					break;

				default:
					break;
			}


		return $response;
	}//end lock_components_actions



	/**
	* MODIFY_COUNTER
	* @param object $rqo
	* @return object $response
	*/
	public static function modify_counter(object $rqo) : object {

		session_write_close();

		// options
			$options = $rqo->options;

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__METHOD__.']';

		// short vars
			$section_tipo = $options->section_tipo;
			if (empty($section_tipo)) {
				$response->msg = 'Error: empty mandatory section_tipo';
				return $response;
			}
			$counter_action = $options->counter_action; // reset|fix

		// modify_counter
			$result = counter::modify_counter(
				$section_tipo,
				$counter_action
			);

		// check_counters
			$result_check_counters	= counter::check_counters();

		// response
			$response->result	= $result;
			$response->msg		= $result===true
				? 'OK. '.$counter_action.' counter successfully ' . $section_tipo
				: 'Error on '.$counter_action.' counter ' . $section_tipo;
			$response->datalist	= $result_check_counters->datalist ?? [];


		return $response;
	}//end modify_counter



	/**
	* GET_SIMPLE_SCHEMA_CHANGES_FILES
	* Used to call the hierarchy function by client
	* get the last list of files with the changes in ontology
	* @return object $response
	*/
	public static function get_simple_schema_changes_files() : object {

		$response = new stdClass();
			$response->result	= hierarchy::get_simple_schema_changes_files();
			$response->msg		= 'OK';

		return $response;
	}//end get_simple_schema_changes_files



	/**
	* PARSE_SIMPLE_SCHEMA_CHANGES_FILES
	* Used to call the hierarchy function by client
	* get the parse data of specific file send by client in the rqo->options->filename
	* @param object $rqo
	* @return object $response
	* response>result will be the array of changes/additions into the ontology since last update section by section.
	*/
	public static function parse_simple_schema_changes_files(object $rqo) : object {

		// options
			$options	= $rqo->options;
			$filename	= $options->filename;

		$changes = hierarchy::parse_simple_schema_changes_file($filename);

		$response = new stdClass();
			$response->result = $changes;
			$response->msg = 'OK';

		return $response;
	}//end parse_simple_schema_changes_files



}//end dd_area_maintenance_api
