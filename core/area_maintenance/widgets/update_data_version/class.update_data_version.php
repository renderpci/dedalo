<?php declare(strict_types=1);
include_once DEDALO_CORE_PATH . '/base/update/class.update.php';
/**
* UPDATE_DATA_VERSION
* Widget to manage Dédalo data updates
*/
class update_data_version {



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		$updates				= update::get_updates();
		$update_version			= update::get_update_version();
		$update_version_plain	= empty($update_version)
			? ''
			: implode('', $update_version);

		$result = (object)[
			'update_version'		=> $update_version,
			'current_version_in_db'	=> get_current_data_version(),
			'dedalo_version'		=> get_dedalo_version(),
			'updates'				=> $updates->{$update_version_plain} ?? null
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



}//end update_data_version
