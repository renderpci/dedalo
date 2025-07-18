<?php declare(strict_types=1);
/**
* DB_TASKS
* Manages database integrity tasks like check sequences
*/
class db_tasks {



	/**
	* CHECK_SEQUENCES
	* Verify that postgresql database sequences are correct
	* checking information_schema.table
	* @return stdClass object $response
	*/
	public static function check_sequences() : object {

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= '';
			$response->values	= [];

		try {

			// SHOW server_version;
			$sql					= " SHOW server_version; ";
			$result_v				= JSON_RecordObj_matrix::search_free($sql);
			$server_version			= pg_fetch_result($result_v, 0, 'server_version');
			$ar_parts				= explode('.', $server_version);
			$server_major_version	= (int)$ar_parts[0];

			$response->msg .= "TEST ALL SEQUENCES IN DATABASE: ".DEDALO_DATABASE_CONN;

			// skip tables
			$ar_skip_tables = [
				'session_data'
			];

			// Find and iterate all db tables
			$sql	= " SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name ASC ";
			$result	= JSON_RecordObj_matrix::search_free($sql);
			while ($rows = pg_fetch_assoc($result)) {

				$table_name = $rows['table_name'];

				if (in_array($table_name, $ar_skip_tables)) {
					continue; // Skip table
				}

				if (strpos($table_name, 'matrix_descriptors')!==false) {
					continue; // Skip table
				}

				// Detected  sqlmap tables. 'sqlmapfile','sqlmapoutput'
				if (strpos($table_name, 'sqlmap')!==false) {
					throw new Exception("Error Processing Request. Security sql injection warning", 1);
				}

				# Find last id in table
				$sql		= " SELECT id FROM $table_name ORDER BY id DESC LIMIT 1 ";
				$result2	= JSON_RecordObj_matrix::search_free($sql);
				if (!$result2) {
					continue;
				}
				if (pg_num_rows($result2) === 0) {
					continue;	// Skip empty tables
				}

				$last_id = pg_fetch_result($result2, 0, 'id');

				# Find vars in current sequence
				if ($server_major_version>=10) {
					$search_table	= 'sequencename';
					$sql			= " SELECT last_value, start_value FROM pg_sequences WHERE $search_table = '".$table_name."_id_seq' ; ";
				}else{
					$search_table	= $table_name."_id_seq";
					$sql			= " SELECT last_value, start_value FROM $search_table ; ";
				}
				$result_seq = JSON_RecordObj_matrix::search_free($sql);
				if (pg_num_rows($result_seq) === 0) {
					debug_log(__METHOD__
						." Warning. {$table_name}_id_seq not found in $search_table "
						, logger::WARNING
					);
					continue;	// Skip empty tables
				}
				$last_value		= pg_fetch_result($result_seq, 0, 'last_value');
				$start_value	= pg_fetch_result($result_seq, 0, 'start_value');

				$response->values[] = (object)[
					'table_name'	=> $table_name,
					'start_value'	=> $start_value,
					'last_value'	=> $last_value,
					'last_id'		=> $last_id,
					'last_id'		=> $last_id
				];

				$response->msg .= "<hr><b>$table_name</b> - start_value: $start_value - seq last_value: $last_value ";
				if ($last_value!=$last_id) {
					#$response->msg .= "<span style=\"color:#b97800\">[last id: $last_id] ALTER SEQUENCE {$table_name}_id_seq RESTART WITH $last_id;</span>";
					$response->msg .= "<span style=\"color:#b97800\">[last id: $last_id] SELECT setval('public.{$table_name}_id_seq', $last_id, true);</span>";
				}else{
					$response->msg .= "[last id: $last_id]";
				}


				if ($last_id>$last_value) {
					$response->msg .= "<br><b>   WARNING: seq last_id > last_value [$last_id > $last_value]</b>";
					$response->msg .= "<br>FIX AUTOMATIC TO $last_id start</pre>";
					#$response->msg .= "Use: <pre>SELECT setval('public.{$table_name}_id_seq', $last_id, true);</pre>";

					$sql2 	 = "SELECT setval('public.{$table_name}_id_seq', $last_id, true);";
					$result2 = JSON_RecordObj_matrix::search_free($sql2);
					if (!$result2) {
						$response->msg .= "Use: <b>SELECT setval('public.{$table_name}_id_seq', $last_id, true);</b>";
					}

					$response->result = false;
				}

				if ($start_value!=1) {
					$response->msg .= "<br><b>   WARNING: seq start_value != 1</b>";
					$response->msg .= "Use: <b>ALTER SEQUENCE {$table_name}_id_seq START WITH 1 ;</b>";

					$response->result = false;
				}
			}//end while ($rows = pg_fetch_assoc($result))

		} catch (Exception $e) {
			$response->result	= false;
			$response->msg		= 'Caught exception: ' . $e->getMessage();
			return $response;
		}


		return (object)$response;
	}//end check_sequences



	/**
	* OPTIMIZE_TABLES
	* Exec VACUUM ANALYZE command on every received table
	* @param array $tables
	* @return object
	*/
	public static function optimize_tables( array $tables ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];
			$response->reindex	= [];
			$response->vacuum	= [];

		// Validate and sanitize table names
		$valid_tables = [];
		foreach ($tables as $table) {

			if (empty($table) || !is_string($table)) {
				$response->errors[] = "Invalid table name: " . var_export($table, true);
				debug_log(__METHOD__
					. " Ignored Invalid table name " . PHP_EOL
					. ' table: ' . to_string($table)
					, logger::ERROR
				);
				continue;
			}

			// Sanitize table name - only allow alphanumeric, underscores, and dots
			if (!preg_match('/^[a-zA-Z0-9_\.]+$/', $table)) {
				$response->errors[] = "Invalid table name format: " . $table;
				debug_log(__METHOD__
					. " Ignored Invalid table name format " . PHP_EOL
					. ' table: ' . to_string($table)
					, logger::ERROR
				);
				continue;
			}

			if (!DBi::check_table_exists($table)) {
				$response->errors[] = "Table does not exist: " . $table;
				debug_log(__METHOD__
					. " Ignored non existing table " . PHP_EOL
					. ' table: ' . to_string($table)
					, logger::ERROR
				);
				continue;
			}

			$valid_tables[] = $table;
		}

		if (empty($valid_tables)) {
			$response->errors[] = "No valid tables to optimize";
			return $response;
		}

		// command_base
		$command_base = DB_BIN_PATH . 'psql ' . DEDALO_DATABASE_CONN . ' ' . DBi::get_connection_string();

		// REINDEX each table individually
		foreach ($valid_tables as $table) {

			$escaped_table = pg_escape_identifier(DBi::_getConnection(), $table);
			$command = $command_base . ' -c ' . escapeshellarg("REINDEX TABLE $escaped_table;");

			$res = shell_exec($command . ' 2>&1');
			$response->reindex[$table] = $res;

			// Check if command failed (basic error detection)
			if ($res === null || strpos(strtolower($res), 'error') !== false) {
				$response->errors[] = "REINDEX failed for table: $table";
				debug_log(__METHOD__
					. ' REINDEX result for table "' . $table . '": ' . to_string($res) . PHP_EOL
					. ' command: ' . to_string($command)
					, logger::ERROR
				);
			}

			// debug
			debug_log(__METHOD__
				. ' REINDEX result for ' . $table . ': ' . to_string($res) . PHP_EOL
				. ' command: ' . to_string($command)
				, logger::WARNING
			);
		}

		// VACUUM each table individually
		foreach ($valid_tables as $table) {

			$escaped_table = pg_escape_identifier(DBi::_getConnection(), $table);
			$command = $command_base . ' -c ' . escapeshellarg("VACUUM ANALYZE $escaped_table;");

			$res = shell_exec($command . ' 2>&1');
			$response->vacuum[$table] = $res;

			// Check if command failed (basic error detection)
			if ($res === null || strpos(strtolower($res), 'error') !== false) {
				$response->errors[] = "VACUUM failed for table: $table";
				debug_log(__METHOD__
					. " VACUUM failed for table: '$table'"
					, logger::ERROR
				);
			}

			// debug
			debug_log(__METHOD__
				. ' VACUUM result for "' . $table . '": ' . to_string($res) . PHP_EOL
				. ' command: ' . to_string($command)
				, logger::WARNING
			);
		}

		$response->result	= true;
		$response->msg		= empty($reponse->errors)
			? 'Successfully optimized ' . count($valid_tables) . ' table(s)'
			: 'Optimization completed with errors for some tables';


		return $response;
	}//end optimize_tables



	/**
	* CONSOLIDATE_TABLE
	* Renumbers table id column to consolidate id sequence from 1,2,...
	* It gets the first id and the total rows,
	* if the first id is lower than total rows the table does not need consolidation.
	* @return bool
	*/
	public static function consolidate_table( string $table ) : bool {
		// Get first id
		$first_id_query = '
			SELECT id
			FROM "' . $table . '"
			ORDER BY "id" ASC
			LIMIT 1;
		';
		$first_id_result = pg_query(DBi::_getConnection(), $first_id_query);
		if($first_id_result === false) {
			debug_log(__METHOD__
				. ' Failed consolidate_table: ' . $table . PHP_EOL
				. 'strQuery: ' . to_string($first_id_query)
				, logger::ERROR
			);
			return false;
		}

		$first_id = null;
		$row = pg_fetch_assoc($first_id_result);
		if ($row !== false) {
			$first_id = $row['id'];
		}

		// Get the total rows
		$count_rows_query = '
			SELECT COUNT(*) as count
			FROM "' . $table . '";
		';
		$count_rows_result = pg_query(DBi::_getConnection(), $count_rows_query);
		if($count_rows_result === false) {
			debug_log(__METHOD__
				. ' Failed consolidate_table: ' . $table . PHP_EOL
				. 'strQuery: ' . to_string($count_rows_query)
				, logger::ERROR
			);
			return false;
		}

		$count_rows = null;
		$row = pg_fetch_assoc($count_rows_result);
		if ($row !== false) {
			$count_rows = $row['count'];
		}

		// Check the result
		if( $first_id === null || $count_rows === null ){
			debug_log(__METHOD__
				. ' Failed consolidate_table, impossible to know the id and total rows: ' . $table . PHP_EOL
				, logger::ERROR
			);
			return false;
		}

		// Test if the table needs to be consolidated
		// Only tables with first id > total rows need renumbering.
		if( (int)$first_id <= (int)$count_rows ){
			debug_log(__METHOD__
				. ' Database does not need consolidation ' . $table . PHP_EOL
				, logger::WARNING
			);
			return true;
		}

		// Set a logical order of the data
		// It depends on the table.
		$order = ($table === 'jer_dd')
			? 'tld, id'
			: 'section_tipo, section_id';

		// Renumber the table.
		// Create a new_id column and set it in id
		// Update the sequence to the last id.
		$strQuery = '
			UPDATE "' . $table . '" t  -- intermediate unique violations are ignored now
			SET id = t1.new_id
			FROM (SELECT id, row_number() OVER (ORDER BY ' . $order . ') AS new_id FROM "' . $table . '") t1
			WHERE t.id = t1.id;
			SELECT setval(\'' . $table . '_id_seq\', max(id)) FROM "' . $table . '";  -- reset sequence
		';

		// Apply to database
		$result = pg_query(DBi::_getConnection(), $strQuery);
		if($result === false) {
			debug_log(__METHOD__
				. ' Failed consolidate_table: ' . $table . PHP_EOL
				. 'strQuery: ' . to_string($strQuery)
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end consolidate_table



	/**
	* REBUILD_INDEXES
	* Forces rebuilding of PostgreSQL main indexes, extensions and functions
	* @return object $response
	*/
	public static function rebuild_indexes() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		$ar_sql_query = [];

		// import file with all definitions of indexes
		require_once dirname(__FILE__) . '/db_indexes.php';

		// Validation for db_indexes vars.
		if (!isset($ar_sql_query) || !is_array($ar_sql_query) || empty($ar_sql_query)) {
			$response->errors[] = "No SQL queries found in db_indexes.php";
			return $response;
		}

		// exec
		foreach ($ar_sql_query as $sql_query) {

			// debug info
			debug_log(__METHOD__
				. " Executing rebuild_indexes SQL sentence " . PHP_EOL
				. ' sql_query: ' . trim($sql_query)
				, logger::WARNING
			);

			// exec query
			$result = pg_query(DBi::_getConnection(), $sql_query);
			if($result===false) {
				// error case
				debug_log(__METHOD__
					." Error Processing sql_query Request ". PHP_EOL
					. pg_last_error(DBi::_getConnection()) .PHP_EOL
					. 'sql_query: '.to_string($sql_query)
					, logger::ERROR
				);
				$response->errors[] = " Error Processing sql_query Request: ". pg_last_error(DBi::_getConnection());
				continue;
			}

			$response->success++;
		}

		// debug
			debug_log(__METHOD__
				. " Exec rebuild_indexes " . PHP_EOL
				. ' sql_query: ' .PHP_EOL. implode(PHP_EOL . PHP_EOL, $ar_sql_query) . PHP_EOL
				, logger::DEBUG
			);

		// response OK
		$response->result	= true;
		$response->msg		= count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';
		$response->n_queries = count($ar_sql_query);
		$response->n_errors = count($response->errors);


		return $response;
	}//end rebuild_indexes



	/**
	* GET_TABLES
	* Get the full list of tables (in 'public' schema) from Dédalo DDBB
	* @return array $tables
	*/
	public static function get_tables() : array {
		$sql = "
			SELECT tablename
			FROM pg_tables
			WHERE schemaname = 'public';
		";
		$result = pg_query(DBi::_getConnection(), $sql);

		// Error handling for the query
		if (!$result) {
			throw new Exception('Database query failed: ' . pg_last_error());
		}

		$tables = [];
		while ($row = pg_fetch_assoc($result)) {
			$tables[] = $row['tablename'];
		}

		// Free the result resource
		pg_free_result($result);

		return $tables;
	}//end get_tables



}//end db_tasks
