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
			switch ($options->action) {

				case 'read':
					$dedalo_data = (object)dd_api::read( $options );
					break;

				case 'update':
					$dedalo_data = (object)dd_api::update( $options );
					break;

				default:
					$dedalo_data = new stdClass();
						$dedalo_data->result = false;
						$dedalo_data->msg 	 = "Error. Undefined method (action) : ".$options->action;
					break;
			}
	

		return $dedalo_data;
	}//end manage_request



}//end class manager