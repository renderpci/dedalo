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
	* @return string|false|null $res
	*/
	public static function optimize_tables( array $tables ) : string|false|null {

		// command_base
			$command_base = DB_BIN_PATH . 'psql ' . DEDALO_DATABASE_CONN . ' ' . DBi::get_connection_string();

		// re-index
			$index_commands = [];
			foreach ($tables as $current_table) {

				if (!DBi::check_table_exists($current_table)) {
					debug_log(__METHOD__
						. " Ignored non existing table " . PHP_EOL
						. ' table: ' . to_string($current_table)
						, logger::ERROR
					);
					continue;
				}

				$index_commands[] = 'REINDEX TABLE "'.$current_table.'"';
			}

			if (empty($index_commands)) {
				return false;
			}

			$command = $command_base . ' -c \''.implode('; ', $index_commands).';\'';
			// exec command
				$res = shell_exec($command);
			// debug
				debug_log(__METHOD__
					. ' result: ' . to_string($res) . PHP_EOL
					. ' command: ' . to_string($command)
					, logger::WARNING
				);

		// VACUUM
			// safe tables only
			$tables = array_filter($tables, 'DBi::check_table_exists');
			$command = $command_base . ' -c \'VACUUM ' . implode(', ', $tables) .';\'';
			// exec command
				$res = shell_exec($command);
			// debug
				debug_log(__METHOD__
					. ' result ' . to_string($res) . PHP_EOL
					. ' command: ' . to_string($command)
					, logger::WARNING
				);


		return $res;
	}//end optimize_tables



	/**
	* CONSOLIDATE_TABLE
	* Remunerates table id column to consolidate id sequence from 1,2,...
	* It gets the first id and the total rows,
	* if the first id is lower than total rows the table do not needs consolidate.
	* @return bool
	*/
	public static function consolidate_table( string $table ) : bool {

		// Get first id
			$first_id_query = '
				SELECT id
				FROM "'.$table.'"
				ORDER BY "id" ASC
				LIMIT 1;
			';

			$first_id_result = pg_query(DBi::_getConnection(), $first_id_query);

				if($first_id_result===false) {
					debug_log(__METHOD__
						. ' Failed consolidate_table: '.$table. PHP_EOL
						. 'strQuery: ' . to_string($first_id_query)
						, logger::ERROR
					);
					return false;
				}

			$first_id = null;
			while ($row = pg_fetch_assoc($first_id_result)) {
				$first_id = $row['id'];
			}

		// Get the total rows
			$count_rows_query = '
				SELECT COUNT(*)
				FROM "'.$table.'";
			';

			$count_rows_result = pg_query(DBi::_getConnection(), $count_rows_query);

				if($count_rows_result===false) {
					debug_log(__METHOD__
						. ' Failed consolidate_table: '.$table. PHP_EOL
						. 'strQuery: ' . to_string($count_rows_query)
						, logger::ERROR
					);
					return false;
				}

			$count_rows = null;
			while ($row = pg_fetch_assoc($count_rows_result)) {
				$count_rows = $row['count'];
			}

		// check the result
			if( empty($first_id) || empty($count_rows) ){
				debug_log(__METHOD__
					. ' Failed consolidate_table, impossible to know the id and total rows: '.$table. PHP_EOL
					, logger::ERROR
				);
				return false;
			}

		// test if the table needs to be consolidate
		// Only tables with first id > total rows needs remunerate it.
			if( (int)$first_id < (int)$count_rows ){

				debug_log(__METHOD__
					. ' Database do not need consolidate '.$table. PHP_EOL
					, logger::WARNING
				);
				return true;
			}

		// set a logical order of the data
		// it depends of the table.
			$order = ($table==='jer_dd')
				? 'tld, id'
				: 'section_tipo, section_id';

		// remunerate the table.
		// create a new_id column and set it in id
		// Update the sequence to the last id.
			$strQuery = '
				UPDATE '.$table.' t  -- intermediate unique violations are ignored now
				SET id = t1.new_id
				FROM (SELECT id, row_number() OVER (ORDER BY '.$order.') AS new_id FROM '.$table.') t1
				WHERE t.id = t1.id;

				SELECT setval(\''.$table.'_id_seq\', max(id)) FROM '.$table.';  -- reset sequence
			';

		// apply to DDBB
			$result = pg_query(DBi::_getConnection(), $strQuery);
			if($result===false) {
				debug_log(__METHOD__
					. ' Failed consolidate_table: '.$table. PHP_EOL
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



}//end db_tasks
