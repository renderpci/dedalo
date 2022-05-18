<?php
/**
* DD_MANAGER
* Manage api web
*
*/
class dd_manager {



	static $version = "1.0.0"; // 05-06-2019


	/**
	* __CONSTRUCT
	* @return
	*/
	public function __construct() {


	}//end __construct



	/**
	* MANAGE_REQUEST
	* @return mixed array|object
	*/
	public function manage_request( object $rqo ) : object {
		$api_manager_start_time = start_time();

		// debug
			// dump($rqo, ' MANAGE_REQUEST rqo ++++++++++++++++++++++++++++++ '.to_string());
			if(SHOW_DEBUG===true) {
				$text			= 'API REQUEST ' . $rqo->action;
				$text_lenght	= strlen($text) +1;
				$nchars			= 200;
				$line			= $text .' '. str_repeat(">", $nchars - $text_lenght).PHP_EOL.json_encode($rqo, JSON_PRETTY_PRINT).PHP_EOL.str_repeat("<", $nchars).PHP_EOL;
				debug_log(__METHOD__ . PHP_EOL . $line, logger::DEBUG);
			}

		// logged
			$no_loggin_needed_actions = [
				'start',
				'change_lang',
				'login'
			];
			if (in_array($rqo->action, $no_loggin_needed_actions)) {
				// do not check login here
			}else{
				if (login::is_logged()!==true) {
					$response = new stdClass();
						$response->result	= false;
						$response->msg		= 'Error. user is not logged ! [action:'.$rqo->action.']';
						$response->error	= 'not_logged';
					return $response;
				}
			}

		// rqo check
			if (!is_object($rqo) || !property_exists($rqo,'action')) {

				$response = new stdClass();
					$response->result	= false;
					$response->msg		= "Invalid action var (not found in rqo)";
					$response->error		= 'undefined_method';

				debug_log(__METHOD__." $response->msg ".to_string(), logger::ERROR);

				return $response;
			}

		// actions
			$dd_api_type	= $rqo->dd_api ?? 'dd_core_api';
			$dd_api			= new $dd_api_type();
			if ( !method_exists($dd_api, $rqo->action) ) {
				$response = new stdClass();
					$response->result	= false;
					$response->msg		= "Error. Undefined $dd_api_type method (action) : ".$rqo->action;
					$response->error		= 'undefined_method';
			}else{
				$response = (object)$dd_api::{$rqo->action}( $rqo );
			}

		// debug
			if(SHOW_DEBUG===true) {
				$total_time_api_exec = exec_time_unit($api_manager_start_time,'ms')." ms";
				$api_debug = new stdClass();
					$api_debug->api_exec_time	= $total_time_api_exec;
					$api_debug->memory_usage	= dd_memory_usage();
					$api_debug->rqo				= json_encode($rqo, JSON_PRETTY_PRINT);

				if (isset($response->debug)) {
					// add to existing debug properties
					foreach ($api_debug as $key => $value) {
						$response->debug->{$key} = $value;
					}
				}else{
					// create new debug property
					$response->debug = $api_debug;
				}
				//dump($response->debug, ' $response->debug ++ '.to_string($rqo->action));
				// debug_log("API REQUEST $total_time ".str_repeat(">", 70).PHP_EOL.json_encode($rqo, JSON_PRETTY_PRINT).PHP_EOL.str_repeat("<", 171), logger::DEBUG);
				// debug_log(json_encode($rqo, JSON_PRETTY_PRINT) .PHP_EOL. "API REQUEST $total_time ".str_repeat(">", 70), logger::DEBUG);
				// $line = "API REQUEST total_time: $total_time ".str_repeat("<", 89); // 164
				// debug_log($line, logger::DEBUG);
				// if ($rqo->action==='read') {
				// 	dump($response, ' response ++ '.to_string());
				// }

				// end line info
					$id = $rqo->id ?? $rqo->source->tipo ?? '';
					$text			= 'API REQUEST ' . $rqo->action . ' ' . $id . ' END IN '.$total_time_api_exec;
					$text_lenght	= strlen($text) +1;
					$nchars			= 200;
					$line			= $text .' '. str_repeat(">", $nchars - $text_lenght).PHP_EOL;
					debug_log(__METHOD__ . PHP_EOL . $line, logger::DEBUG);
			}



		return $response;
	}//end manage_request



}//end class dd_manager
