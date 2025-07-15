<?php declare(strict_types=1);
/**
* COUNTERS_STATUS
* Review counters values
*/
class counters_status {



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		$check_counters_response = counter::check_counters();

		$result = [
			'datalist' => $check_counters_response->datalist ?? [],
			'errors' => $check_counters_response->errors ?? []
		];

		// response
		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end get_value



}//end counters_status
