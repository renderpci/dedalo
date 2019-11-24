<?php
/**
* MANAGER
* Manage api web
*
*/
class manager {



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
	public function manage_request( $options ) {

		$api_start_time=microtime(1);

		// options check
			$dedalo_data = null;
			if (!is_object($options) || !property_exists($options,'action')) {
				debug_log(__METHOD__." Invalid action var (not found in options) ".to_string(), logger::ERROR);
				return $dedalo_data;
			}		

		// actions
			$dd_api_type = $options->dd_api ?? 'dd_core_api';

			switch ($dd_api_type) {
				case 'dd_utils_api':
					$dd_utils_api = new dd_utils_api();
					if ( !method_exists($dd_utils_api, $options->action) ) {
						$dedalo_data = new stdClass();
							$dedalo_data->result = false;
							$dedalo_data->msg 	 = "Error. Undefined dd_utils_api method (action) : ".$options->action;
					}else{
						$dedalo_data = (object)dd_utils_api::{$options->action}( $options );
					}
					break;
				
				case 'dd_core_api':
					$dd_core_api = new dd_core_api();
					if ( !method_exists($dd_core_api, $options->action) ) {
						$dedalo_data = new stdClass();
							$dedalo_data->result = false;
							$dedalo_data->msg 	 = "Error. Undefined dd_core_api method (action) : ".$options->action;
					}else{
						$dedalo_data = (object)dd_core_api::{$options->action}( $options );
					}
					break;
			}

		if(SHOW_DEBUG===true) {
			$api_debug = new stdClass();
				$api_debug->api_exec_time = exec_time_unit($api_start_time,'ms')." ms";
					
			if (isset($dedalo_data->debug)) {
				// add to existing debug properties
				foreach ($api_debug as $key => $value) {
					$dedalo_data->debug->{$key} = $value;
				}
			}else{
				// create new debug property
				$dedalo_data->debug = $api_debug;
			}
			//dump($dedalo_data->debug, ' $dedalo_data->debug ++ '.to_string($options->action));
		}


		return $dedalo_data;
	}//end manage_request



}//end class manager