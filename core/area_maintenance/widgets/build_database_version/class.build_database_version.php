<?php declare(strict_types=1);
/**
* BUILD_DATABASE_VERSION
* Widget to manage Dédalo database tasks
*/
class build_database_version {



	/**
	* GET_VALUE
	* Returns updated widget value
	* It is used to update widget data dynamically
	* @return object $response
	*/
	public static function get_value() : object {

		$result = (object)[
			'source_db'		=> DEDALO_DATABASE_CONN,
			'target_db'		=> install::$db_install_name,
			'target_file'	=> '/install/db/'.install::$db_install_name.'.pgsql.gz'
		];

		$response = new stdClass();
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';
			$response->errors	= [];


		return $response;
	}//end get_value



}//end build_database_version
