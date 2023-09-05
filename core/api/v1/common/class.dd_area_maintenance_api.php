<?php
/**
* DD_AREA_MAINTENANCE_API
* Manage API REST data flow of the area with Dédalo
* This class is a collection of area exposed methods to the API using
* a normalized RQO (Request Query Object)
*
*/
final class dd_area_maintenance_api {



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
					$response = lock_components::get_active_users();
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



}//end dd_area_maintenance_api
