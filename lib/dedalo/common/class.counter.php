<?php
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
	public static function get_counter_value($tipo, $matrix_table='matrix_counter') {

		$counter_number = 0; # Default (when no counter exists in db)

		# ACTIVITY_SECTION DON'T USE COUNTERS
		if ($tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			return (int)0;
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
				debug_log(__METHOD__." counter not found in db ($matrix_table). Value $counter_number is returned instead (".str_replace(array('$1'), array($tipo), $strQuery).") ".to_string(), logger::DEBUG);
			}
		}
		
		return (int)$counter_number;
	}//end get_counter_value



	/**
	* UPDATE_COUNTER
	* @param string $tipo Like dd561
	* @param string $matrix_table Like matrix_counter (default)
	* @param int $current_value (default false)
	* @return int $counter_dato_updated
	* NOTA : HACERLO DIRECTO SQL, PASANDO DE LOS COMPONENTES Y DEMÁS ZARANDAJAS !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
	*/
	public static function update_counter($tipo, $matrix_table='matrix_counter', $current_value=false) {

		# ACTIVITY_SECTION DON'T USE COUNTERS
		if ($tipo===DEDALO_ACTIVITY_SECTION_TIPO) {
			return (int)0;
		}		
		
		if ($current_value===false) {
			$current_value = (int)counter::get_counter_value($tipo, $matrix_table);
		}
		$counter_dato_updated = intval($current_value)+1;

		$parent = 0;
		$dato 	= $counter_dato_updated;
		$tipo 	= (string)$tipo;
		$lang 	= DEDALO_DATA_NOLAN;

		if( intval($current_value)===0 ) {
			$ref 	  = RecordObj_dd::get_termino_by_tipo($tipo)." [".RecordObj_dd::get_modelo_name_by_tipo($tipo,true)."]";
			$strQuery = "INSERT INTO \"$matrix_table\" (parent, dato, tipo, lang, ref) VALUES ($1, $2, $3, $4, $5)";
			$result   = pg_query_params(DBi::_getConnection(), $strQuery, array($parent, $dato, $tipo, $lang, $ref));
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." CREATED NEW COUNTER with value: counter_number:$dato ($strQuery) ".to_string(), logger::DEBUG);
				if (!$result) {
					trigger_error("VARS: parent:$parent, dato:$dato, tipo:$tipo, lang:$lang, ref:$ref");
				}
			}
		}else{
			$strQuery = 'UPDATE "'.$matrix_table.'" SET dato = $1 WHERE tipo = $2';
			$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $dato, $tipo ));
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__." Updated counter with value: dato:$dato, tipo:$tipo (".str_replace(array('$1','$2'), array($dato,$tipo), $strQuery).") ".to_string(), logger::DEBUG);
				if (!$result) {
					trigger_error("VARS: dato:$dato, tipo:$tipo");
				}
			}
		}			
		if (!$result) {
			throw new Exception("Error Processing Request. DB error on update counter", 1);
		}			

		return (int)$counter_dato_updated;			
	}//end update_counter



	/**
	* CONSOLIDATE_COUNTER
	* Get de bigger section_id of current section_tipo and set the counter with this value (useful for import records not sequentially)
	* If counter not exists, a new counter is created
	* @param string $section_tipo
	* @param string $matrix_table
	* @param string $counter_matrix_table default matrix_counter
	* @return bool true if update/create counter, false if not
	*/
	public static function consolidate_counter( $section_tipo, $matrix_table, $counter_matrix_table='matrix_counter' ) {
		
		# BIGGER_SECTION_ID . Search bigger section_tipo existent
		$strQuery = 'SELECT section_id FROM "'.$matrix_table.'" WHERE section_tipo = $1 ORDER BY section_id DESC LIMIT 1';
		$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $section_tipo ));
		$rows 	  = (array)pg_fetch_assoc($result);

		$bigger_section_id = reset($rows);
			#dump($bigger_section_id, 'consolidate_counter strQuery:'.$strQuery);			
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
		# When current_value is bigger than zero, test is counter exits. If not, create calling counter with zero value				
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
		#debug_log(__METHOD__." Triggered consolidate_counter and update_counter with value: $current_value [$section_tipo - $matrix_table] ".to_string(), logger::DEBUG);
		
		return true;
	}//end consolidate_counter



	/**
	* DELETE_COUNTER
	* @return bool
	*/
	private static function delete_counter($tipo, $matrix_table='matrix_counter') {
		
		$strQuery = 'DELETE FROM "'.$matrix_table.'" WHERE tipo = $1';
		$result	  = pg_query_params(DBi::_getConnection(), $strQuery, array($tipo));
		if(!$result)throw new Exception("Error Processing Request. DB error on delete counter $tipo", 1);

		return true;
	}//end delete_counter



	/**
	* CHECK_counters
	* @return stdClass object $response
	*/
	public static function check_counters() {	
		
		$response = new stdClass();
			$response->result 	= true;
			$response->msg 	 	= '';

		$response->msg .= "TEST ALL COUNTERS IN DATABASE: ".DEDALO_DATABASE_CONN;

		# Find and iterate all db tables
		$sql 	= 'SELECT * FROM matrix_counter ORDER BY tipo ASC';
		$result = JSON_RecordObj_matrix::search_free($sql);
		while ($rows = pg_fetch_assoc($result)) {
				
			$section_tipo 		= $rows['tipo'];
			$counter_section_id = (int)$rows['dato'];

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($section_tipo,true);
			if ($modelo_name!=='section') {
				debug_log(__METHOD__." Counter row with tipo: $section_tipo is a $modelo_name . Only sections can use counters. Fix ASAP ".to_string(), logger::ERROR);
				continue;
			}

			# Find last id in table
			$table_name = common::get_matrix_table_from_tipo($section_tipo);
			$sql2 	 = 'SELECT section_id FROM "'.$table_name.'" WHERE section_tipo = \''.$section_tipo.'\' ORDER BY section_id DESC LIMIT 1 ';
			$result2 = JSON_RecordObj_matrix::search_free($sql2);
			if (pg_num_rows($result2) === 0) {
				$last_section_id = 0;	// Skip empty tables
			}else{
				$last_section_id = (int)pg_fetch_result($result2, 0, 'section_id');
			}
			
			$section_name = RecordObj_dd::get_termino_by_tipo($section_tipo);
			$response->msg .= "<hr><b>-- $section_tipo $section_name</b> - counter: $counter_section_id - last_section_id: $last_section_id ";
			if ($last_section_id!=$counter_section_id) {
				$response->msg .= "[?]";
				if($last_section_id > 0){
					$response->msg .= "<h5 style=\"padding:5px;padding-left:50px\"><span style=\"color:#b97800\">UPDATE \"matrix_counter\" SET dato = $last_section_id WHERE tipo = '$section_tipo'; </span></h5>";
				}else{
					$response->msg .= "<h5 style=\"padding:5px;padding-left:50px\"><span style=\"color:#b97800\">DELETE FROM \"matrix_counter\"  WHERE tipo = '$section_tipo'; </span></h5>";
				}
				
			
				#$response->msg .= "<br><b>   WARNING: last_section_id != counter_section_id [$last_section_id != $counter_section_id]</b>";
				#$response->msg .= "<br>FIX AUTOMATIC TO $last_section_id start</pre>";
				/*
				$sql3 	 = "UPDATE \"matrix_counter\" SET \"dato\" = '$last_section_id' WHERE \"tipo\" = '$section_tipo';";
				$result3 = JSON_RecordObj_matrix::search_free($sql3);
				if (!$result3) {
					$response->msg .= "Use: <b>SELECT setval('public.{$table_name}_id_seq', $last_section_id, true);</b>";
				}
				*/
				$response->result = false;

			}else{
				$response->msg .= "[ok]";
			}
			
		}//end while ($rows = pg_fetch_assoc($result)) {


		return (object)$response;
	}//end check_counters



}//end class counter
?>