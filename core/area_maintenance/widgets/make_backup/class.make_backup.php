<?php declare(strict_types=1);
/**
* MAKE_BACKUP
* Widget dedicated to database backup pourposes
*/
class make_backup {



	/**
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is invoked through `get_widget_value` (hard-coded method) and
	* therefore not listed here.
	*/
	public const API_ACTIONS = [
		'make_psql_backup',
		'make_mysql_backup',
		'get_dedalo_backup_files'
	];



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


		// short vars
		$mysql_db = defined('API_WEB_USER_CODE_MULTIPLE') ? API_WEB_USER_CODE_MULTIPLE : null;

		// result (value)
		$result	= (object)[
			'dedalo_db_management'	=> DEDALO_DB_MANAGEMENT,
			'backup_path'			=> DEDALO_BACKUP_PATH_DB,
			'file_name'				=> date("Y-m-d_His") .'.'. DEDALO_DATABASE_CONN .'.'. DEDALO_DB_TYPE .'_'. logged_user_id() .'_forced_dbv' . implode('-', get_current_data_version()).'.custom.backup',
			'mysql_db'				=> $mysql_db, // first 10 items
		];

		// response
		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end get_value



    /**
	* MAKE_PSQL_BACKUP
	* Alias of backup::init_backup_sequence
	* Exec a full pg_dump of current Dédalo database
	* Is fired by widget 'make_psql_backup'
	* @return object $response
	*/
	public static function make_psql_backup() : object {

		$user_id				= logged_user_id();
		$username				= logged_user_username();
		$skip_backup_time_range	= true;

		$response = backup::init_backup_sequence((object)[
			'user_id'					=> $user_id,
			'username'					=> $username,
			'skip_backup_time_range'	=> $skip_backup_time_range
		]);


		return $response;
	}//end make_psql_backup



    /**
	* MAKE_MYSQL_BACKUP
	* Alias of backup::make_mysql_backup
	* Exec a full MySQL dump of current Publication database
	* @return object $response
	*/
	public static function make_mysql_backup() : object {

		$response = backup::make_mysql_backup();


		return $response;
	}//end make_mysql_backup



    /**
	* GET_DEDALO_BACKUP_FILES
	* Called from widget 'make_backup'
	* @param object $options
	* {
	* 	max_files: int 10
	* 	psql_backup_files: bool true
	* 	mysql_backup_files: bool true
	* }
	* @return object $response
	*/
	public static function get_dedalo_backup_files(object $options) : object {

		// options
			$max_files			= $options->max_files ?? 10;
			$psql_backup_files	= $options->psql_backup_files ?? true;
			$mysql_backup_files	= $options->mysql_backup_files ?? true;

		// result
			$result = new stdClass();

			// psql_backup_files
				if ($psql_backup_files===true) {
					$files = backup::get_backup_files(); // PostgreSQL files
					$result->psql_backup_files = array_slice($files, 0, $max_files); // first N items
				}

			// mysql_backup_files
				if ($mysql_backup_files===true) {
					$files = backup::get_mysql_backup_files(); // MariaDB/MySQL files
					$result->mysql_backup_files = array_slice($files, 0, $max_files); // first N items
				}

		// response
			$response = new stdClass();
				$response->result	= $result;
				$response->msg		= 'OK. Request done';


		return $response;
	}//end get_dedalo_backup_files



}//end make_backup
