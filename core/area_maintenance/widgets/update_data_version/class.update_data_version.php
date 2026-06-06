<?php declare(strict_types=1);
include_once DEDALO_CORE_PATH . '/base/update/class.update.php';
/**
* UPDATE_DATA_VERSION
* Widget to manage Dédalo data updates
*/
class update_data_version {

	/**
	 * SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	 * `get_value` is invoked through `get_widget_value` (hard-coded method) and
	 * therefore not listed here.
	 */
	public const API_ACTIONS = [
		'update_data_version'
	];



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



	/**
	 * UPDATE_DATA_VERSION
	 * Allow change components data format or add new tables or index
	 * Triggered by Area Development button 'UPDATE DATA'
	 * Sample: Current data version: 5.8.2 -----> 6.0.0
	 * @param object $options
	 * {
	 *	"updates_checked": {
	 *		"SQL_update_1": true,
	 *		"components_update_1": true,
	 *		"components_update_2": true,
	 *		"components_update_3": true,
	 *		"components_update_4": true,
	 *		"run_scripts_1": true,
	 *		"run_scripts_2": true
	 *	}
	 * }
	 * @return object $response
	 */
	public static function update_data_version(object $options): object
	{

		// options
		$updates_checked = $options->updates_checked;

		// set time limit
		set_time_limit(259200);  // 3 days

		$response = new stdClass();
		$response->result = false;
		$response->errors = [];
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';

		// DEDALO_SUPERUSER only
		if (logged_user_id() != DEDALO_SUPERUSER) {
			$response->msg = 'Error. Only Dédalo superuser can do this action';
			return $response;
		}

		// DEDALO_MAINTENANCE_MODE
		$maintenance_mode = defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
			? DEDALO_MAINTENANCE_MODE_CUSTOM
			: DEDALO_MAINTENANCE_MODE;
		if ($maintenance_mode !== true) {
			$response->msg = 'Error. Update data is not allowed if Dédalo is not in maintenance_mode';
			return $response;
		}

		try {

			// exec update_data_version. return object response
			$update_data_version_response = update::update_version($updates_checked);

		} catch (Exception $e) {

			debug_log(
				__METHOD__
				. " Caught exception [update_data_version]: " . PHP_EOL
				. ' msg: ' . $e->getMessage()
				,
				logger::ERROR
			);

			$update_data_version_response = (object) [
				'result' => false,
				'msg' => 'ERROR on update_data_version .Caught exception: ' . $e->getMessage()
			];

			// log line
			$update_log_file = DEDALO_CONFIG_PATH . '/update.log';
			$log_line = PHP_EOL . date('c') . ' ERROR [Exception] ';
			$log_line .= PHP_EOL . 'Caught exception: ' . $e->getMessage();
			file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);
		}

		$response->result = $update_data_version_response->result ?? false;
		$response->msg = $update_data_version_response->msg ?? 'Error. Request failed [' . __FUNCTION__ . ']';
		$response->errors = array_merge($response->errors, $update_data_version_response->errors);


		return $response;
	}//end update_data_version



}//end update_data_version
