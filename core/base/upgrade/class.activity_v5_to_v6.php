<?php
/**
* CLASS DATO_V4_TO_SECTION_DATA_V5
*
*
*/
class activity_v5_to_v6 {


	public static $what_conversion_values = [
		"dd696"		=>	1,
		"dd697"		=>	2,
		"dd695"		=>	3,
		"dd698"		=>	4,
		"dd700"		=>	5,
		"dd694"		=>	6,
		"dd693"		=>	7,
		"dd699"		=>	8,
		"dd1090"	=>	9,
		"dd1080"	=>	10,
		"dd1094"	=>	11,
		"dd1095"	=>	12,
		"dd1092"	=>	13,
		"dd1091"	=>	14,
		"dd1098"	=>	15,
		"dd1081"	=>	16
	];



	/**
	* CONVERT_SECTION_DATO_TO_DATA
	* @return object $dato
	*/
	public static function convert_section_dato_to_data( stdClass $datos_column ) {

		$dato = clone $datos_column;

		$section_tipo = $dato->section_tipo;
		if($section_tipo===DEDALO_ACTIVITY_SECTION_TIPO){

			// what dd545 (changed to select)
				$activity_what_dato = $dato->components->dd545->dato->{DEDALO_DATA_NOLAN} ?? null;
				if (!empty($activity_what_dato)) {
					if (isset(self::$what_conversion_values[$activity_what_dato])) {

						$new_section_id = self::$what_conversion_values[$activity_what_dato];

						// change areas dato
						$new_what_dato = new locator();
							$new_what_dato->set_section_tipo('dd42');
							$new_what_dato->set_section_id($new_section_id);
							$new_what_dato->set_from_component_tipo('dd545');
							$new_what_dato->set_type('dd151');

						$found = array_filter($dato->relations, function($item) use($new_what_dato){
							if (true===locator::compare_locators($item, $new_what_dato)) {
								return $item;
							}
						});
						if (empty($found)) {
							$dato->relations[] = $new_what_dato;
						}else{
							debug_log(__METHOD__." 'security_admin_dato' already exists in relations. Ignored (maybe is already updated) ", logger::ERROR);
						}

						unset($dato->components->dd545);

					}else{
						dump($activity_what_dato, ' activity_what_dato ++ '.to_string());
						debug_log(__METHOD__." ERROR ON GET activity_what_dato: '$activity_what_dato' in the array 'what_conversion_values' ++++++++++++++++++++++ ".to_string(), logger::ERROR);
						// throw new Exception("Error Processing Request", 1);
					}
				}

			// where dd546 (changed to input_text) data change format from string to array
				$activity_where_dato = $dato->components->dd546->dato->{DEDALO_DATA_NOLAN} ?? "";
				if (!is_array($activity_where_dato)) {
					$dato->components->dd546->dato->{DEDALO_DATA_NOLAN} = [$activity_where_dato]; // same dato but as array
				}

			// ip dd544 (data change format from string to array)
				$activity_ip_dato = $dato->components->dd544->dato->{DEDALO_DATA_NOLAN} ?? "";
				if (!is_array($activity_ip_dato)) {
					$dato->components->dd544->dato->{DEDALO_DATA_NOLAN} = [$activity_ip_dato]; // same dato but as array
				}


			// date dd547


			// json dd551


		}

		return $dato;
	}//end convert_section_dato_to_data



	/**
	* CONVERT_TABLE_DATA
	* @return bool true
	*/
	public static function convert_table_data($ar_tables=null) {

		if ($ar_tables===null) {
			// default
			$ar_tables = [
				"matrix_activity"
			];
		}

		foreach ($ar_tables as $key => $table) {

			// Get last id in the table
			$strQuery 	= "SELECT id FROM $table ORDER BY id DESC LIMIT 1 ";
			$result 	= JSON_RecordDataBoundObject::search_free($strQuery);
			$rows 		= pg_fetch_assoc($result);
			if (!$rows) {
				continue;
			}
			$max 		= $rows['id'];

			// Get first id in the table
			$min_strQuery 	= "SELECT id FROM $table ORDER BY id LIMIT 1 ";
			$min_result 	= JSON_RecordDataBoundObject::search_free($min_strQuery);
			$min_rows 		= pg_fetch_assoc($min_result);
			if (!$min_rows) {
				continue;
			}
			$min 		= $min_rows['id'];

			//$min = 1;

			// iterate from 1 to last id
			$i_ref = 0; $start_time=microtime(1);
			for ($i=$min; $i<=$max; $i++) {

				$strQuery 	= "SELECT id, datos FROM $table WHERE id = $i ORDER BY id ASC";
				$result 	= JSON_RecordDataBoundObject::search_free($strQuery);
				if(!$result) {
					$msg = "Failed Search id $i. Data is not found.";
					debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
					continue;
				}
				$n_rows = pg_num_rows($result);

				if ($n_rows<1) continue;

				while($rows = pg_fetch_assoc($result)) {

					$id 	= $rows['id'];
					$datos 	= json_decode($rows['datos']);
						#dump($datos, ' datos ++ '.to_string($id));

					if (!empty($datos)) {
						$section_data 			= self::convert_section_dato_to_data( $datos );
						$section_data_encoded 	= json_encode($section_data);

						$strQuery 	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
						$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
						if(!$result) {
							$msg = "Failed Update section_data $i";
							debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
							continue;
						}
					}else{
						debug_log(__METHOD__." ERROR: Empty datos from: $table - $id ".to_string(), logger::ERROR);
					}
				}

				// log info each 1000
					if ($i_ref===0) {
						debug_log(__METHOD__." Partial update of section data table: $table - id: $id - total: $n_rows - total time secs: ".exec_time_unit($start_time,'sec'), logger::DEBUG);
					}else{
						$i_ref = ($i_ref>1000) ? 0 : $i_ref + 1;
					}
			}
			#break; // stop now
		}//end foreach ($ar_tables as $key => $table)


		return true;
	}//end convert_table_data



	/**
	* CONVERT_TABLE_DATA_ACTIVITY
	* @return bool true
	*/
	public static function convert_table_data_activity() {

		self::convert_table_data(["matrix_activity"]);

		return true;
	}//end convert_table_data_activity



}//end class
