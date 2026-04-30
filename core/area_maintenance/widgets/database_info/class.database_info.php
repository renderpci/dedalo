<?php declare(strict_types=1);
/**
* DATABASE_INFO
* Review config vars status
*/
class database_info {



	/**
	* SEC-044: methods callable through `dd_area_maintenance_api::widget_request`.
	* `get_value` is intentionally absent because it is invoked through the
	* dedicated `get_widget_value` API action (which hard-codes the method
	* name) rather than through `widget_request`.
	*/
	public const API_ACTIONS = [
		'analyze_db',
		'optimize_tables',
		'recreate_db_assets',
		'rebuild_db_indexes',
		'rebuild_db_functions',
		'rebuild_db_constraints',
		'consolidate_tables',
		'rebuild_user_stats'
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

		// tables
		$tables = db_tasks::get_tables();

		// info
		$info = pg_version(DBi::_getConnection()) ?? [];
		$info['host'] = to_string(DEDALO_HOSTNAME_CONN);

		// indexes
		$indexes = [];
		foreach ($tables as $table) {
			$table_indexes = db_tasks::get_table_indexes($table);
			if (!empty($table_indexes)) {
				$indexes[$table] = $table_indexes;
			}
		}

		// result
		$result = [
			'info' => $info,
			'tables' => $tables,
			'indexes' => $indexes
		];

		// response
		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end get_value



	/**
	* ANALYZE_DB
	* Exec "ANALYZE" command on database for optimal performance.
	* @return object $response
	*/
	public static function analyze_db( object $options ) : object {

		$response = db_tasks::analyze_db();

		return $response;
	}//end analyze_db



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



	/**
	* RECREATE_DB_ASSETS
	* Force to re-build the PostgreSQL main indexes, extensions and functions
	* @param object $options
	* @return object $response
	*/
	public static function recreate_db_assets( object $options ) : object {

		set_time_limit(18000); // 5 hours

		$response = new stdClass();
			$response->result	= new stdClass();
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		// extensions
		$response_extensions	= db_tasks::create_extensions();
			$response->result->extensions	= $response_extensions->result;
			$response->errors				= $response_extensions->errors;
		// constraints
		$response_constraints	= db_tasks::rebuild_constraints();
			$response->result->constraints	= $response_constraints->result;
			$response->errors				= array_merge($response->errors, $response_constraints->errors);
		// functions
		$response_functions		= db_tasks::rebuild_functions();
			$response->result->functions	= $response_functions->result;
			$response->errors				= array_merge($response->errors, $response_functions->errors);
		// indexes
		$response_indexes		= db_tasks::rebuild_indexes();
			$response->result->indexes		= $response_indexes->result;
			$response->errors				= array_merge($response->errors, $response_indexes->errors);
		// maintenance
		$response_maintenance	= db_tasks::exec_maintenance();
			$response->result->maintenance	= $response_maintenance->result;
			$response->errors				= array_merge($response->errors, $response_maintenance->errors);


		return $response;
	}//end recreate_db_assets



	/**
	* REBUILD_DB_INDEXES
	* Force to re-build the PostgreSQL main indexes
	* @return object $response
	*/
	public static function rebuild_db_indexes( object $options ) : object {

		set_time_limit(7200); // 2 hours

		// options
		$tables = $options->tables ?? [];  // tables are optional. On empty, all tables are processed

		$response = db_tasks::rebuild_indexes($tables);

		return $response;
	}//end rebuild_db_indexes



	/**
	* REBUILD_DB_FUNCTIONS
	* Force to re-build the PostgreSQL main functions
	* @return object $response
	*/
	public static function rebuild_db_functions() : object {

		$response = db_tasks::rebuild_functions();

		return $response;
	}//end rebuild_db_functions



	/**
	* REBUILD_DB_CONSTRAINTS
	* Force to create the PostgreSQL constraints
	* @return object $response
	*/
	public static function rebuild_db_constraints() : object {

		$response = db_tasks::rebuild_constraints();

		return $response;
	}//end rebuild_db_constraints



	/**
	* CONSOLIDATE_TABLES
	* Remunerates table id column to consolidate id sequence from 1,2,...
	* @param object $options
	* @return object $response
	*/
	public static function consolidate_tables( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		// options
		$tables = $options->tables ?? [];

		$ar_tables = ['dd_ontology','matrix_ontology','matrix_ontology_main','matrix_dd'];

		// exec
		foreach ($tables as $table) {

			if (!in_array($table, $ar_tables)) {
				debug_log(__METHOD__
					. " Ignored non allow table " . PHP_EOL
					. ' table: ' . to_string($table)
					, logger::ERROR
				);
				continue;
			}

			$result = db_tasks::consolidate_table( $table );

			if($result === false){
				$response->errors[]	= 'It is not possible to consolidate the table: '.$table;
				return $response;
			}
		}

		// response OK
		$response->result	= true;
		$response->msg		= count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';


		return $response;
	}//end consolidate_tables



	/**
	* REBUILD_USER_STATS
	* Re-creates the user daily stats from matrix-activity
	* @param object $options
	* @return object $rebuild_user_stats
	*/
	public static function rebuild_user_stats( object $options ) : object {

		// options
			$users = $options->users ?? null;

		// response
			$response = new stdClass();
				$response->result		= false;
				$response->msg			= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors		= [];
				$response->updated_days	= [];

		// check users value
			if (empty($users)) {
				$response->msg		.= ' Empty users value';
				$response->errors[]	= 'invalid users';
				return $response;
			}

		// write_lang_file
			foreach ($users as $user_id) {

				// delete_user_activity_stats
				$deleted = diffusion_section_stats::delete_user_activity_stats( (int)$user_id );
				if (!$deleted) {
					$response->errors[] = 'failed delete user stats. User: '.$user_id;
					continue;
				}

				// update_user_activity_stats
				$update_user_response = diffusion_section_stats::update_user_activity_stats( (int)$user_id );
				if (!$update_user_response->result) {
					return $update_user_response;
				}

				// errors
				$response->errors = array_merge($response->errors, $update_user_response->errors);

				// updated_days
				$response->updated_days[] = $update_user_response->result;
			}

		// response OK
			$response->msg = empty($response->errors)
				? 'OK. Request done.'
				: 'Warning! Request done with errors';


		return $response;
	}//end rebuild_user_stats



}//end database_info
