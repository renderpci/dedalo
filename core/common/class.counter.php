<?php declare(strict_types=1);
/**
* COUNTER
*
*
*/
abstract class counter {



	/**
	* GET_COUNTER_VALUE
	* COUNTER (STORED IN MATRIX_COUNTER TABLE)
	* @param string $tipo Like dd561
	* @param string $matrix_table Like matrix_counter (default)
	* @return int $counter_number
	*/
	public static function get_counter_value(string $tipo, string $matrix_table='matrix_counter') : int {

		$counter_number = 0; # Default (when no counter exists in db)

		# ACTIVITY_SECTION DON'T USE COUNTERS
		if ($tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			return 0;
		}

		$strQuery 	= 'SELECT dato AS counter_number FROM "'.$matrix_table.'" WHERE tipo = $1 LIMIT 1';
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
					." counter not found in db ($matrix_table). Value $counter_number is returned instead (".str_replace(array('$1'), array($tipo), $strQuery).") "
					, logger::DEBUG
				);
			}
		}

		return (int)$counter_number;
	}//end get_counter_value



	/**
	* UPDATE_COUNTER
	* Create/update a counter for the given tipo in the given table
	* @param string $tipo Like dd561
	* @param string $matrix_table Like matrix_counter (default)
	* @param int $current_value (default false)
	* @return int $counter_dato_updated
	*/
	public static function update_counter(string $tipo, string $matrix_table='matrix_counter', $current_value=false) : int {

		// Activity_section don't use counters
		if ($tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			return (int)0;
		}

		// counter_dato_updated
			if ($current_value===false) {
				$current_value = (int)counter::get_counter_value($tipo, $matrix_table);
			}
			$counter_dato_updated = intval($current_value)+1;

		// short vars
			$parent = 0;
			$dato 	= $counter_dato_updated;
			$tipo 	= (string)$tipo;
			$lang 	= DEDALO_DATA_NOLAN;

		if( intval($current_value)===0 ) {

			// new counter case

			$ref		= RecordObj_dd::get_termino_by_tipo($tipo)." [".RecordObj_dd::get_model_name_by_tipo($tipo,true)."]";
			$strQuery	= "INSERT INTO \"$matrix_table\" (parent, dato, tipo, lang, ref) VALUES ($1, $2, $3, $4, $5)";
			$result		= pg_query_params(DBi::_getConnection(), $strQuery, array($parent, $dato, $tipo, $lang, $ref));
			if ($result===false) {
				throw new Exception("Error Processing Request. DB error on update counter. Insert into '$matrix_table'", 1);
			}
			debug_log(__METHOD__." Created new counter with value: counter_number:'$dato' ($strQuery) ", logger::DEBUG);

		}else{

			// update already created counter case

			$strQuery	= 'UPDATE "'.$matrix_table.'" SET dato = $1 WHERE tipo = $2';
			$result		= pg_query_params(DBi::_getConnection(), $strQuery, array($dato, $tipo));
			if ($result===false) {
				throw new Exception("Error Processing Request. DB error on update counter. Update '$matrix_table'", 1);
			}
			debug_log(__METHOD__." Updated counter with value: dato:'$dato', tipo:$tipo (".str_replace(array('$1','$2'), array($dato,$tipo), $strQuery).") ", logger::DEBUG);
		}


		return (int)$counter_dato_updated;
	}//end update_counter



	/**
	* CONSOLIDATE_COUNTER
	* Get de bigger section_id of current section_tipo and set the counter with this value (useful for import records not sequentially)
	* If counter do not exists, a new counter is created
	* @param string $section_tipo
	* @param string $matrix_table
	* @param string $counter_matrix_table default matrix_counter
	* @return bool true if update/create counter, false if not
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
		$strQuery 	= 'SELECT dato AS counter_number FROM "'.$counter_matrix_table.'" WHERE tipo = $1 LIMIT 1';
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
			$strQuery = 'UPDATE "'.$counter_matrix_table.'" SET dato = $1 WHERE tipo = $2';
			$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $bigger_section_id, $section_tipo ));
			if(!$result)throw new Exception("Error Processing Request. DB error on update counter value", 1);
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Consolidated counter with value: dato:$bigger_section_id, section_tipo:$section_tipo (".str_replace(array('$1','$2'), array($bigger_section_id,$section_tipo), $strQuery).") ".to_string(), logger::DEBUG);
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
	* @param string $tipo
	* @param string $matrix_table = 'matrix_counter'
	* @return bool
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
	* @see dd_utils_aì::modify_counter
	* @param string $section_tipo
	* @param string $counter_action
	* 	reset|fix
	* @return bool
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
	* Test all counters in DDBB
	* @return object $response
	* {
	* 	result : bool,
	* 	msg : string,
	* 	errors : array,
	* 	datalist: array
	* }
	*/
	public static function check_counters() : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= "TEST ALL COUNTERS IN DATABASE: ".DEDALO_DATABASE_CONN;
			$response->errors	= [];
			$response->datalist	= [];

		// Find all db tables
			$sql	= 'SELECT tipo, dato FROM matrix_counter ORDER BY tipo ASC';
			$result	= JSON_RecordObj_matrix::search_free($sql);
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

			// debug
				debug_log(__METHOD__
					.' check_counters done ' . PHP_EOL
					.' SQL: '  . $sql . PHP_EOL
					.' time: ' . exec_time_unit($start_time,'ms') . ' ms'
					, logger::DEBUG
				);

		$i=0;
		while ($rows = pg_fetch_assoc($result)) {

			$section_tipo	= $rows['tipo'];
			$counter_value	= (int)$rows['dato'];

			// model check
				$model_name = RecordObj_dd::get_model_name_by_tipo($section_tipo,true);
				if ($model_name!=='section') {
					$msg = " Counter row with tipo: '$section_tipo' is a '$model_name' . Only sections can use counters. Fix ASAP ";
					debug_log(__METHOD__
						. $msg
						, logger::ERROR
					);
					$response->errors[] = $msg;

					continue;
				}

			// Find last id of current section
				$table_name			= common::get_matrix_table_from_tipo($section_tipo);
				$sql2				= 'SELECT section_id FROM "'.$table_name.'" WHERE section_tipo = \''.$section_tipo.'\' ORDER BY section_id DESC LIMIT 1 ';
				$result2			= JSON_RecordObj_matrix::search_free($sql2);
				$last_section_id	= ($result2 === false)
					? 0 // Skip empty tables
					: ((pg_num_rows($result2)===0)
						? 0 // Skip empty tables
						: (int)pg_fetch_result($result2, 0, 'section_id'));

			// item_info
				$item_info = (object)[
					'section_tipo'		=> $section_tipo,
					'label'				=> RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_DATA_LANG, true, true),
					'counter_value'		=> $counter_value,
					'last_section_id'	=> $last_section_id
				];

				$response->datalist[] = $item_info;

			$i++;
		}//end while ($rows = pg_fetch_assoc($result)) {

		// debug
			$response->debug = (object)[
				'counters_total'	=> $i,
				'time'				=> exec_time_unit($start_time,'ms')
			];
			debug_log(__METHOD__
				." check_counters TOTAL ($i)" . PHP_EOL
				.' time ms: ' . exec_time_unit($start_time,'ms')
				, logger::DEBUG
			);


		return $response;
	}//end check_counters



}//end class counter
