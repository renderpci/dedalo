<?php
declare(strict_types=1);
/**
* AREA_MAINTENANCE_WIDGETS
* Handle area maintenance widgets values
*/
class area_maintenance_widgets extends area_common {



	/**
	* UPDATE_DATA_VERSION
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function update_data_version() {

		$updates				= update::get_updates();
		$update_version			= update::get_update_version();
		$update_version_plain	= empty($update_version)
			? ''
			: implode('', $update_version);

		$result = (object)[
			'update_version'		=> $update_version,
			'current_version_in_db'	=> get_current_version_in_db(),
			'dedalo_version'		=> get_dedalo_version(),
			'updates'				=> $updates->{$update_version_plain} ?? null
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];

		return $response;
	}//end update_data_version



}//end area_maintenance_widgets
