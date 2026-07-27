<?php declare(strict_types=1);
/**
* CLASS COUNTER
* Manages auto-increment section-ID counters persisted in the PostgreSQL matrix_counter table.
*
* Each section tipo (e.g. 'oh1', 'dd561') keeps one row in matrix_counter tracking the
* highest section_id ever issued for that section type. When a new record is created,
* update_counter() atomically increments this value and returns it as the next section_id.
*
* Responsibilities:
* - Reading the current counter value for a tipo (get_counter_value).
* - Incrementing and persisting the counter on each new record creation (update_counter).
* - Resynchronising a counter after a bulk import that inserted non-sequential IDs
*   (consolidate_counter): scans the data matrix table, finds the highest existing
*   section_id, and writes that value directly into matrix_counter.
* - Admin-gated reset ('reset') and repair ('fix') operations (modify_counter).
* - Auditing the consistency of all counter rows against their live matrix tables
*   (check_counters).
*
* Table schema (matrix_counter / matrix_counter_dd):
*   tipo  VARCHAR(128) PRIMARY KEY  — ontology tipo of the section type
*   value INTEGER                   — last issued section_id (next id = value + 1)
*   ref   TEXT                      — human-readable label built from the ontology term
*
* Note: the activity-log section (DEDALO_ACTIVITY_SECTION_TIPO / 'dd542') is explicitly
* excluded from counter management because its records are written by internal logging
* code that manages its own identifiers.
*
* This class is abstract and contains only static methods; it is never instantiated.
* Loaded unconditionally via core/base/class.loader.php.
*
* @package Dédalo
* @subpackage Core
*/
abstract class counter {



	/**
	* GET_COUNTER_VALUE
	* Returns the current (last-issued) section_id counter value for a section tipo.
	*
	* Reads the 'value' column from the given matrix_counter table for the specified tipo.
	* Returns 0 when no counter row exists yet, which signals update_counter() that it
	* must INSERT rather than UPDATE. Also returns 0 immediately for the activity-section
	* tipo (DEDALO_ACTIVITY_SECTION_TIPO) since that section manages its own identifiers.
	*
	* @param string $tipo         - Ontology tipo identifying the section type, e.g. 'dd561'
	* @param string $matrix_table = 'matrix_counter' - Target counter table; pass 'matrix_counter_dd'
	*                               for the ontology-data counter table
	* @return int - Last issued section_id, or 0 if no counter row exists
	* @throws Exception           - On PostgreSQL query failure
	*/
	public static function get_counter_value(string $tipo, string $matrix_table='matrix_counter') : int {

		$counter_number = 0; # Default (when no counter exists in db)

		# ACTIVITY_SECTION DON'T USE COUNTERS
		if ($tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			return 0;
		}

		$strQuery 	= 'SELECT value AS counter_number FROM "'.$matrix_table.'" WHERE tipo = $1 LIMIT 1';
		$result	  	= pg_query_params(DBi::_getConnection(), $strQuery, array($tipo));
		if (!$result) {
			throw new Exception("Error Processing Request. DB error on get counter value", 1);
		}
		$rows 		= pg_num_rows($result);
		if ($rows>0) {
			$counter_number = pg_fetch_result($result, 0, 0);
		}else{
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__
					." counter not found in db ($matrix_table). Value ".(string)$counter_number." is returned instead (".str_replace(array('$1'), array($tipo), $strQuery).") "
					, logger::DEBUG
				);
			}
		}

		return (int)$counter_number;
	}//end get_counter_value



	/**
	* UPDATE_COUNTER
	* Increments (or creates) the persistent section_id counter for a given tipo.
	*
	* Typical call site: section_record::create() calls this immediately before inserting a
	* new row so the returned value becomes the new record's section_id.
	*
	* Algorithm:
	*   1. If no explicit $value is provided, read the current value with get_counter_value().
	*   2. Increment by 1 (counter_data_updated = value + 1).
	*   3. If the result is 0 (i.e. value + 1 = 0, meaning the incoming value was -1),
	*      INSERT a new counter row. Otherwise UPDATE the existing row.
	*
	* The INSERT branch is a legacy path for edge cases where the incoming $value is -1.
	* Normal callers should omit $value entirely. consolidate_counter() bootstraps a
	* missing row by calling update_counter(..., 0), which increments to 1 and goes to
	* the UPDATE branch; the actual final value is then written by a direct SQL UPDATE.
	*
	* @param string $tipo         - Ontology tipo of the section type, e.g. 'oh1'
	* @param string $matrix_table = 'matrix_counter' - Target counter table
	* @param mixed  $value        = false - Starting value before increment;
	*                               false means "read from DB"; -1 triggers INSERT (new row)
	* @return int - The new counter value (= next section_id to use)
	* @throws Exception           - On PostgreSQL query failure
	*/
	public static function update_counter(string $tipo, string $matrix_table='matrix_counter', $value=false) : int {

		// Activity_section don't use counters
		if ($tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			return (int)0;
		}

		// counter_data_updated
			if ($value===false) {
				$value = (int)counter::get_counter_value($tipo, $matrix_table);
			}
			$counter_data_updated = intval($value)+1;

		// short vars
			$value 	= $counter_data_updated;
			$tipo 	= (string)$tipo;

		if( intval($value)===0 ) {

			// new counter case
			// Build a human-readable ref label from the ontology term so that the
			// matrix_counter row is self-describing without extra joins.
			$ref		= ontology_node::get_term_by_tipo($tipo)." [".ontology_node::get_model_by_tipo($tipo,true)."]";
			$strQuery	= "INSERT INTO \"$matrix_table\" (tipo, value, ref) VALUES ($1, $2, $3)";
			$result		= pg_query_params(DBi::_getConnection(), $strQuery, array($tipo, $value, $ref));
			if ($result===false) {
				throw new Exception("Error Processing Request. DB error on update counter. Insert into '$matrix_table'", 1);
			}
			debug_log(__METHOD__." Created new counter with value: counter_number:'".(string)$value." ($strQuery) ", logger::DEBUG);

		}else{

			// update already created counter case

			$strQuery	= 'UPDATE "'.$matrix_table.'" SET value = $1 WHERE tipo = $2';
			$result		= pg_query_params(DBi::_getConnection(), $strQuery, array($value, $tipo));
			if ($result===false) {
				throw new Exception("Error Processing Request. DB error on update counter. Update '$matrix_table'", 1);
			}
			debug_log(__METHOD__." Updated counter with value: counter_number:'".(string)$value."', tipo:$tipo (".str_replace(array('$1','$2'), array($value,$tipo), $strQuery).") ", logger::DEBUG);
		}


		return $value;
	}//end update_counter



	/**
	* CONSOLIDATE_COUNTER
	* Repairs the counter for a section tipo by scanning the actual data matrix table
	* and setting the counter value to the highest existing section_id found there.
	*
	* This is necessary after a bulk import that inserted records with non-sequential or
	* externally assigned section_ids, where update_counter() was bypassed. Without
	* consolidation, the counter would issue IDs that collide with already-existing rows.
	*
	* Algorithm:
	*   1. Query $matrix_table for the highest section_id where section_tipo = $section_tipo.
	*      If the table is empty, return false (nothing to do).
	*   2. If no counter row yet exists for the tipo, bootstrap one via update_counter(..., 0).
	*   3. Write $bigger_section_id directly into matrix_counter with a raw UPDATE, bypassing
	*      the +1 increment that update_counter() would apply — the goal is to match the
	*      existing maximum, not to advance past it.
	*
	* (!) update_counter() always adds 1 to whatever value is passed. That is why this method
	* writes the raw $bigger_section_id directly into the counter table instead of delegating
	* to update_counter().
	*
	* Called by: ontology_data_io (post-import repair), class.transform_data (upgrade scripts),
	* and matrix_db_manager (integrity checks).
	*
	* @param string $section_tipo         - Ontology tipo of the section, e.g. 'oh1'
	* @param string $matrix_table         - Data matrix table to scan, e.g. 'matrix'
	* @param string $counter_matrix_table = 'matrix_counter' - Counter table to update
	* @return bool - true if the counter was updated or created; false if the data table
	*                is empty and there is nothing to consolidate
	* @throws Exception                   - On any PostgreSQL query failure
	*/
	public static function consolidate_counter(string $section_tipo, string $matrix_table, string $counter_matrix_table='matrix_counter') : bool {

		# BIGGER_SECTION_ID . Search bigger section_tipo existent
		$strQuery	= 'SELECT section_id FROM "'.$matrix_table.'" WHERE section_tipo = $1 AND section_id > 0 ORDER BY section_id DESC LIMIT 1';
		$result		= pg_query_params(DBi::_getConnection(), $strQuery, array($section_tipo));
		if($result===false) {
			throw new Exception("Error Processing Request. DB error on get last section_id of tipo: '$section_tipo' - table: '$matrix_table'", 1);
		}
		$rows = (array)pg_fetch_assoc($result);
		$bigger_section_id = reset($rows);
		if (empty($bigger_section_id)) {
			return false;
		}

		#
		# UPDATE COUNTER WITH BIGGEST VALUE
		$bigger_section_id = (int)$bigger_section_id; # update_counter set current value + 1. For this we pass current -1 to consolidate counter
		if ($bigger_section_id<0) {
			$bigger_section_id=0;
		}

		#
		# TEST IF COUNTER EXISTS BEFORE SET
		$counter_created = false;
		// When current_value is bigger than zero, test is counter exits. If not, create calling counter with zero value
		$strQuery 	= 'SELECT value AS counter_number FROM "'.$counter_matrix_table.'" WHERE tipo = $1 LIMIT 1';
		$result	  	= pg_query_params(DBi::_getConnection(), $strQuery, array($section_tipo));
		if(!$result) throw new Exception("Error Processing Request. DB error on get counter value", 1);
		$rows 		= pg_num_rows($result);
		if ($rows<1) {
			# COUNTER NOT EXITS. Call update counter with value zero to force create new
			counter::update_counter($section_tipo, $counter_matrix_table, 0); # Zero is important
			$counter_created = true;
		}

		# $counter_number = pg_fetch_result($result, 0, 0);
		# COUNTER EXISTS. But value is different than bigger_section_id
		if($bigger_section_id>0) {
			# update_counter with bigger_section_id value
			$strQuery = 'UPDATE "'.$counter_matrix_table.'" SET value = $1 WHERE tipo = $2';
			$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $bigger_section_id, $section_tipo ));
			if(!$result)throw new Exception("Error Processing Request. DB error on update counter value", 1);
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Consolidated counter with value: counter_number:'".(string)$bigger_section_id."', section_tipo:'".(string)$section_tipo."' (".str_replace(array('$1','$2'), array($bigger_section_id,$section_tipo), $strQuery).") ".to_string(), logger::DEBUG);
			}
		}

		// debug
			debug_log(__METHOD__
				." Triggered consolidate_counter [$section_tipo - $matrix_table] counter_created: ".to_string($counter_created)
				, logger::DEBUG
			);


		return true;
	}//end consolidate_counter



	/**
	* DELETE_COUNTER
	* Permanently removes the counter row for a given tipo from the counter table.
	*
	* Used exclusively by modify_counter() as the implementation of the 'reset' action.
	* After deletion, the next call to update_counter() for this tipo will INSERT a fresh
	* row starting at value 1, effectively resetting the section_id sequence.
	*
	* (!) This operation is destructive. If records with higher section_ids already exist
	* in the data matrix, the counter will re-issue IDs that are already taken and cause
	* primary-key conflicts on the next insert. Only use via modify_counter() which
	* enforces global-admin privilege before delegating here.
	*
	* @param string $tipo         - Ontology tipo whose counter row should be deleted
	* @param string $matrix_table = 'matrix_counter' - Counter table to target
	* @return bool                - Always true on success
	* @throws Exception           - On PostgreSQL query failure
	*/
	private static function delete_counter(string $tipo, string $matrix_table='matrix_counter') : bool {

		$strQuery = 'DELETE FROM "'.$matrix_table.'" WHERE tipo = $1';
		$result	  = pg_query_params(DBi::_getConnection(), $strQuery, array($tipo));
		if($result===false) {
			throw new Exception("Error Processing Request. DB error on delete counter $tipo", 1);
		}

		return true;
	}//end delete_counter



	/**
	* MODIFY_COUNTER
	* Admin-gated entry point for destructive counter operations (reset and fix).
	*
	* Enforces that only a global admin may alter counters, then dispatches to the
	* appropriate implementation:
	*   'reset' — deletes the counter row via delete_counter(), so the sequence
	*             restarts from 1 on the next record creation.
	*   'fix'   — calls consolidate_counter() to re-synchronise the counter with
	*             the highest section_id that actually exists in the data matrix.
	*             Use this after bulk imports or manual DB edits.
	*
	* Called via dd_area_maintenance_api::modify_counter() (API action),
	* ontology::modify_counter(), and matrix_db_manager integrity checks.
	*
	* @see dd_utils_api::modify_counter - API wrapper that also calls check_counters() afterwards
	*
	* @param string $section_tipo    - Ontology tipo whose counter should be modified
	* @param string $counter_action  - Action to perform: 'reset' or 'fix'
	* @return bool                   - true on success; false if the caller lacks privileges,
	*                                  the matrix table cannot be resolved (fix only), or
	*                                  an unknown action is passed
	*/
	public static function modify_counter(string $section_tipo, string $counter_action) : bool {

		// check user before proceed
			$user_id			= logged_user_id();
			$is_global_admin	= security::is_global_admin($user_id);
			if ($is_global_admin!==true) {
				debug_log(__METHOD__
					. " Error. Unable to modify counter. Insufficient privileges " . PHP_EOL
					. ' To modify counters you must be global admin or higher'
					, logger::ERROR
				);
				return false;
			}

		// exec counter_action
			switch ($counter_action) {
				case 'reset':
					$result = counter::delete_counter(
						$section_tipo,
						'matrix_counter'
					);
					break;

				case 'fix':
					$matrix_table = common::get_matrix_table_from_tipo($section_tipo);
					if (empty($matrix_table)) {
						debug_log(__METHOD__
							. " Error. Unable to fix counter. Invalid (empty) matrix table. " . PHP_EOL
							. ' tipo: ' . to_string($section_tipo)
							, logger::ERROR
						);
						return false;
					}
					$result = counter::consolidate_counter(
						$section_tipo,
						$matrix_table,
						'matrix_counter'
					);
					break;

				default:
					$result = false;
					break;
			}


		return $result;
	}//end modify_counter



	/**
	* CHECK_COUNTERS
	* Audits every row in matrix_counter against the actual data in the corresponding
	* section matrix table, collecting the counter value and the real maximum section_id.
	*
	* For each counter row the method:
	*   1. Verifies that the ontology model for the tipo is 'section' — non-section tipos
	*      (components, relations, etc.) must never have counter rows; any such entry is
	*      reported as an error.
	*   2. Resolves the matrix table for the tipo and queries for its highest section_id.
	*   3. Adds an item_info object to $response->datalist containing both values so the
	*      caller (counters_status widget / dd_area_maintenance_api) can highlight drift
	*      between counter_value and last_section_id.
	*
	* The response object shape:
	*   result    bool    — false only if matrix_counter itself cannot be read
	*   msg       string  — human-readable audit title including the DB connection name
	*   errors    array   — entries for non-section tipo rows or DB access failures
	*   datalist  array   — one item_info object per valid counter row:
	*                         { section_tipo, label, counter_value, last_section_id }
	*   debug     object  — { counters_total: int, time: string (ms) }
	*
	* @return object - Audit result; see shape above
	*/
	public static function check_counters() : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= "TEST ALL COUNTERS IN DATABASE: ".DEDALO_DATABASE_CONN;
			$response->errors	= [];
			$response->datalist	= [];

		// Find all matrix_counter rows
		$sql	= 'SELECT tipo, value FROM "matrix_counter" ORDER BY tipo ASC';
		$result = matrix_db_manager::exec_search($sql, []);
		if ($result===false) {
			debug_log(__METHOD__
				. " Error reading counters " . PHP_EOL
				. to_string()
				, logger::ERROR
			);

			$response->result	= false;
			$response->errors[] = ' Error reading DB counters. Unable to access table matrix_counter';

			return $response;
		}

		$i=0;
		while ($row = pg_fetch_assoc($result)) {

			$section_tipo	= $row['tipo'];
			$counter_value	= (int)$row['value'];

			// model check
			// Only section tipos may legitimately own a counter row. A non-section entry
			// indicates either a stale row from a deleted TLD or a data integrity issue.
				$model_name = ontology_node::get_model_by_tipo($section_tipo,true);
				if ($model_name!=='section') {
					$msg = empty($model_name)
						? "Counter row with tipo: '$section_tipo' is empty model_name. Maybe deleted TLD?"
						: "Counter row with tipo: '$section_tipo' is a '$model_name' . Only sections can use counters. Fix ASAP";
					debug_log(__METHOD__
						. ' ' . $msg
						, logger::WARNING
					);
					$response->errors[] = $msg;

					continue;
				}

			// Find last id of current section
			// last_section_id may differ from counter_value after a bulk import that
			// bypassed update_counter(). A mismatch here means consolidate_counter() is needed.
				$table_name = common::get_matrix_table_from_tipo($section_tipo);
				$sql2  = 'SELECT section_id' . PHP_EOL;
				$sql2 .= 'FROM "'.$table_name.'"' . PHP_EOL;
				$sql2 .= 'WHERE section_tipo = $1' . PHP_EOL;
				$sql2 .= 'ORDER BY section_id DESC' . PHP_EOL;
				$sql2 .= 'LIMIT 1';
				$result2 = matrix_db_manager::exec_search($sql2, [$section_tipo]);
				$last_section_id = ($result2 === false)
					? 0 // Skip empty tables
					: ((pg_num_rows($result2)===0)
						? 0 // Skip empty tables
						: (int)pg_fetch_result($result2, 0, 'section_id'));

			// item_info
				$item_info = (object)[
					'section_tipo'		=> $section_tipo,
					'label'				=> ontology_node::get_term_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true),
					'counter_value'		=> $counter_value,
					'last_section_id'	=> $last_section_id
				];

				$response->datalist[] = $item_info;

			$i++;
		}//end while ($row = pg_fetch_assoc($result)) {

		// debug
			$response->debug = (object)[
				'counters_total'	=> $i,
				'time'				=> exec_time_unit($start_time,'ms')
			];
			debug_log(__METHOD__
				.' check_counters TOTAL ('.(string)$i.')' . PHP_EOL
				.' time ms: ' . exec_time_unit($start_time,'ms')
				, logger::DEBUG
			);


		return $response;
	}//end check_counters



}//end class counter
