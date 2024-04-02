<?php
/**
* DD_TOOLS_API
* Manage API REST data with Dédalo
*
*/
final class dd_tools_api {



	/**
	* USER_TOOLS
	* Get user authorized tools filtered by custom list (optional)
	* @param object $rqo
	* {
	*	dd_api	: 'dd_tools_api',
	*	action	: 'user_tools',
	*	source	: source,
	*	options	: {
	*		ar_requested_tools : ar_requested_tools
	*	}
	* }
	* @return object $response
	*/
	public static function user_tools(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__METHOD__.']. ';
			$response->error	= null;

		// options
			$options = $rqo->options;
			// list of requested tools
			$ar_requested_tools	= $options->ar_requested_tools ?? null;

		// all user authorized tools
			$user_id	= logged_user_id();
			$user_tools	= tool_common::get_user_tools($user_id);

		$result = [];
		foreach ($user_tools as $tool) {

			if(!empty($ar_requested_tools) && !in_array($tool->name, $ar_requested_tools)) {
				continue;
			}

			$simple_tool_object = tool_common::create_tool_simple_context($tool);

			$result[] = $simple_tool_object;
		}

		// response
			$response->result	= $result;
			$response->msg		= 'Ok. Request done: '.__METHOD__;


		return $response;
	}//end user_tools



	/**
	* TOOL_REQUEST
	* Call to tool method given and return and object with the response
	*
	* Class file of current tool must be exists in path: DEDALO_TOOLS_PATH / my_tool_name / class.my_tool_name.php
	* Method must be static and accept a only one object argument
	* Method must return an object like { result: mixed, msg: string }
	*
	* @param object $rqo
	* sample:
	* {
	* 	action: "tool_request"
	* 	dd_api: "dd_utils_api"
	* 	source: {
	* 		typo: "source",
	* 		action: "delete_tag",
	* 		model: "tool_indexation"
	* 	},
	* 	options: {
	*		indexing_component_tipo: "rsc860"
	*		main_component_lang: "lg-eng"
	*		main_component_tipo: "rsc36"
	*		section_id: "1"
	*		section_tipo: "rsc167"
	*		tag_id: "5"
	*    }
	* }
	* @return object response { result: mixed, msg: string }
	*/
	public static function tool_request(object $rqo) : object {

		// options
			$options			= $rqo->options ?? new stdClass();
			$fn_arguments		= $options;
			$background_running	= $options->background_running ?? false;

		// source
			$source			= $rqo->source;
			$tool_name		= $source->model;
			$tool_method	= $source->action;

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

		// load tool class file
			$class_file = DEDALO_TOOLS_PATH . '/' . $tool_name . '/class.' . $tool_name .'.php';
			if (!file_exists($class_file)) {
				$response->msg = 'Error. tool class_file do not exists. Create a new one in format class.my_tool_name.php ';
				if(SHOW_DEBUG===true) {
					$response->msg .= '. file: '.$class_file;
				}
				return $response;
			}
			require $class_file;

		// method (static)
			if (!method_exists($tool_name, $tool_method)) {
				$response->msg = 'Error. tool method \''.$tool_method.'\' do not exists ';
				return $response;
			}

		// background_running / direct cases
			switch (true) {
				case ($background_running===true):

					$cli_options = new stdClass();
						$cli_options->class_name	= $tool_name;
						$cli_options->method_name	= $tool_method;
						$cli_options->class_file	= $class_file;
						$cli_options->params		= $options;

					$fn_result = dd_tools_api::tool_request_cli($cli_options);
					break;

				default:
					// direct case

					try {

						$fn_result = call_user_func(array($tool_name, $tool_method), $fn_arguments);

					} catch (Exception $e) { // For PHP 5

						debug_log(__METHOD__
							." Exception caught [tool_request] : ". $e->getMessage()
							, logger::ERROR
						);
						trigger_error($e->getMessage());


						$fn_result = new stdClass();
							$fn_result->result	= false;
							$fn_result->msg		= 'Error. Request failed on call_user_func tool_method: '.$tool_method;
					}
					break;
			}

		$response = $fn_result;

		return $response;
	}//end tool_request



	/**
	* TOOL_REQUEST_CLI
	* Exec tool method in CLI
	* @param object $options
	* {
	* 	class_name: string "tool_request_cli"
	* 	method_name: string "export_records"
	* 	class_file: string
	*	params: object
	* }
	* @return object response { result: mixed, msg: string }
	*/
	private static function tool_request_cli(object $options) : object {

		// options
			$class_name		= $options->class_name;
			$method_name	= $options->method_name;
			$class_file		= $options->class_file;
			$params			= $options->params;

			$safe_params = new stdClass();
			foreach ($params as $key => $value) {
				$safe_params->{$key} = safe_xss($value);
			}

		// server_vars
			// sh_data mandatory vars
			$sh_data = [
				'server' => [
					'HTTP_HOST'		=> $_SERVER['HTTP_HOST'],
					'REQUEST_URI'	=> $_SERVER['REQUEST_URI'],
					'SERVER_NAME'	=> $_SERVER['SERVER_NAME']
				],
				'session_id'	=> session_id(),
				'user_id'		=> logged_user_id(),
				'class_name'	=> $class_name, // class name
				'method_name'	=> $method_name, // method name
				'file'			=> $class_file, // class file to include optional
				'params'		=> $safe_params // object with options passed to the function
			];
			$server_vars = json_encode($sh_data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);

		// process file (temporal file where store function output)
			$pfile			= process::get_unique_process_file(); // like 'process_1_2024-03-31_23-47-36_3137757' usually stored in the sessions directory
			$file_path		= process::get_process_path() .'/'. $pfile; // output file with errors and stream data

		// process_runner. File to sh execute that manage given vars calling desired class and method
			$process_runner	= DEDALO_CORE_PATH . '/base/process_runner.php';

		// command composition
			$cmd		= PHP_BIN_PATH . " $process_runner '$server_vars' ";
			$command	= "nohup nice -n 19 $cmd >$file_path 2>&1 & echo $!";

			// debug
				debug_log(__METHOD__
					." Running tool task in background ($pfile)". PHP_EOL
					." Command: ". PHP_EOL. to_string($command)
					, logger::DEBUG
				);

		// process creation
			$process	= new process($command);
			$pid		= $process->getPid();

		// response OK
			$response = new stdClass();
				$response->result	= true;
				$response->pid		= $pid;
				$response->pfile	= $pfile;
				$response->msg		= 'OK. Running publication ' . $pid;


		return $response;
	}//end tool_request_cli



}//end dd_utils_api
