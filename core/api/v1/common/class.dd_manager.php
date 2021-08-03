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
	public function manage_request( $rqo ) {
		$api_manager_start_time=microtime(1);

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
			if ($rqo->action!=='login' && $rqo->action!=='get_login' && login::is_logged()!==true) {
				$response = new stdClass();
					$response->result	= false;
					$response->msg		= 'Error. user is not logged ! [action:'.$rqo->action.']';
				return $response;
			}

		// rqo check
			$dedalo_data = null;
			if (!is_object($rqo) || !property_exists($rqo,'action')) {
				debug_log(__METHOD__." Invalid action var (not found in rqo) ".to_string(), logger::ERROR);
				return $dedalo_data;
			}

		// actions (dd_core_api | dd_utils_api)
			$dd_api_type = $rqo->dd_api ?? 'dd_core_api';
			switch ($dd_api_type) {
				case 'dd_utils_api':
					$dd_utils_api = new dd_utils_api();
					if ( !method_exists($dd_utils_api, $rqo->action) ) {
						$dedalo_data = new stdClass();
							$dedalo_data->result	= false;
							$dedalo_data->msg		= "Error. Undefined dd_utils_api method (action) : ".$rqo->action;
					}else{
						$dedalo_data = (object)dd_utils_api::{$rqo->action}( $rqo );
					}
					break;

				case 'dd_core_api':
					$dd_core_api = new dd_core_api();
					if ( !method_exists($dd_core_api, $rqo->action) ) {
						$dedalo_data = new stdClass();
							$dedalo_data->result	= false;
							$dedalo_data->msg		= "Error. Undefined dd_core_api method (action) : ".$rqo->action;
					}else{
						$dedalo_data = (object)dd_core_api::{$rqo->action}( $rqo );
					}
					break;
			}

		// debug
			if(SHOW_DEBUG===true) {
				$total_time_api_exec = exec_time_unit($api_manager_start_time,'ms')." ms";
				$api_debug = new stdClass();
					$api_debug->api_exec_time	= $total_time_api_exec;
					$api_debug->memory_usage	= dd_memory_usage();
					$api_debug->rqo				= json_encode($rqo, JSON_PRETTY_PRINT);

				if (isset($dedalo_data->debug)) {
					// add to existing debug properties
					foreach ($api_debug as $key => $value) {
						$dedalo_data->debug->{$key} = $value;
					}
				}else{
					// create new debug property
					$dedalo_data->debug = $api_debug;
				}
				//dump($dedalo_data->debug, ' $dedalo_data->debug ++ '.to_string($rqo->action));
				// debug_log("API REQUEST $total_time ".str_repeat(">", 70).PHP_EOL.json_encode($rqo, JSON_PRETTY_PRINT).PHP_EOL.str_repeat("<", 171), logger::DEBUG);
				// debug_log(json_encode($rqo, JSON_PRETTY_PRINT) .PHP_EOL. "API REQUEST $total_time ".str_repeat(">", 70), logger::DEBUG);
				// $line = "API REQUEST total_time: $total_time ".str_repeat("<", 89); // 164
				// debug_log($line, logger::DEBUG);
				// if ($rqo->action==='read') {
				// 	dump($dedalo_data, ' dedalo_data ++ '.to_string());
				// }

				// end line info
					$id = $rqo->id ?? $rqo->source->tipo ?? '';
					$text			= 'API REQUEST ' . $rqo->action . ' ' . $id . ' END IN '.$total_time_api_exec;
					$text_lenght	= strlen($text) +1;
					$nchars			= 200;
					$line			= $text .' '. str_repeat(">", $nchars - $text_lenght).PHP_EOL;
					debug_log(__METHOD__ . PHP_EOL . $line, logger::DEBUG);
			}
		


		return $dedalo_data;
	}//end manage_request



}//end class dd_manager
