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

		// options check
			$dedalo_data = null;
			if (!is_object($options) || !property_exists($options,'action')) {
				debug_log(__METHOD__." Invalid action var (not found in options) ".to_string(), logger::ERROR);
				return $dedalo_data;
			}		

		// actions
			$dd_api = new dd_api;
			if ( !method_exists($dd_api, $options->action) ) {
				$dedalo_data = new stdClass();
					$dedalo_data->result = false;
					$dedalo_data->msg 	 = "Error. Undefined method (action) : ".$options->action;
			}else{
				$dedalo_data = (object)dd_api::{$options->action}( $options );
			}

			/*
			switch ($options->action) {

				case 'read':
					$dedalo_data = (object)dd_api::read( $options );
					break;

				case 'save':
					$dedalo_data = (object)dd_api::save( $options );
					break;

				case 'count':
					$dedalo_data = (object)dd_api::count( $options );
					break;

				default:
					$dedalo_data = new stdClass();
						$dedalo_data->result = false;
						$dedalo_data->msg 	 = "Error. Undefined method (action) : ".$options->action;
					break;
			}
			*/

		return $dedalo_data;
	}//end manage_request



}//end class manager