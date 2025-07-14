<?php declare(strict_types=1);
/**
* DATABASE_INFO
* Review config vars status
*/
class database_info {



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// tables
		$tables = db_tasks::get_tables();

		// info
		$info = pg_version(DBi::_getConnection()) ?? [];
		$info['host'] = to_string(DEDALO_HOSTNAME_CONN);

		// result
		$result = [
			'info' => $info,
			'tables' => $tables
		];

		// response
		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end get_value



	/**
	* OPTIMIZE_TABLES
	* Called by client widget code via the API
	* @param object $options
	* @return object $response
	*/
	public static function optimize_tables( object $options ) : object {

		$start_time = start_time();

		// Write session to unlock session file
		session_write_close();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';
				$response->errors	= [];

		// options
			$tables = $options->tables;

			if (empty($tables)) {
				$response->errors[] = 'No tables selected';
				return $response;
			}

			if (!is_array($tables)) {
				$response->errors[] = 'Invalid tables parameter';
				return $response;
			}

		// try exec
			try {

				$optimize_tables_response = db_tasks::optimize_tables($tables);

				// response overwrite
				$response = $optimize_tables_response;

			} catch (Exception $e) {

				// Append msg
				$response->msg .= $e->getMessage();
				debug_log(__METHOD__
					." Database optimization failed ERROR: " . $e->getMessage() . PHP_EOL
					. ' response: ' . to_string($response)
					, logger::ERROR
				);
				$response->errors[] = 'Database optimization failed';
			}

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit_auto($start_time);
				$response->debug = $debug;
			}


		return $response;
	}//end optimize_tables



}//end database_info
