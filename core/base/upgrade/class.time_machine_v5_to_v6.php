<?php
/**
* CLASS time_machine_v5_to_v6
*
*
*/
class time_machine_v5_to_v6 {

	/**
	* CONVERT_TABLE_DATA_PROFILES
	* @return bool true
	*/
	public static function convert_table_data_time_machine() : bool {

		self::convert_table_data(["matrix_time_machine"]);

		return true;
	}//end convert_table_data_profiles



	/**
	* CONVERT_TABLE_DATA
	* @return bool true
	*/
	public static function convert_table_data(array $ar_tables) : bool {

		# Maximum execution time
		set_time_limit(0);

		$components_to_update = [
			// 'component_portal',
			'component_text_area',
			'component_json',
			// 'component_av',
			// 'component_image',
			// 'component_pdf',
			// 'component_svg',
			'component_number'
		];

		foreach ($ar_tables as $table) {

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
			$min = $min_rows['id'];

			//$min = 1;

			// iterate from 1 to last id
			$i_ref = 0; $start_time = start_time();
			for ($i=$min; $i<=$max; $i++) {

				$strQuery 	= "SELECT * FROM $table WHERE id = $i ORDER BY id ASC";
				$result 	= JSON_RecordDataBoundObject::search_free($strQuery);
				if($result===false) {
					$msg = "Failed Search id $i. Data is not found.";
					debug_log(__METHOD__
						." ERROR: $msg ". PHP_EOL
						.' strQuery: ' . $strQuery
						, logger::ERROR
					);
					continue;
				}
				$n_rows = pg_num_rows($result);

				if ($n_rows<1) continue;

				while($rows = pg_fetch_assoc($result)) {

					// columns
						$id					= $rows['id'];
						// $id_matrix		= $rows['id_matrix'];
						// $section_id		= $rows['section_id'];
						// $section_tipo	= $rows['section_tipo'];
						$tipo				= $rows['tipo'];
						// $lang			= $rows['lang'];

					// skip empty data
						if (empty($rows['dato'])) {
							continue;
						}

					$dato = json_decode($rows['dato']);
					if (!empty($dato)) {

						$model_name = RecordObj_dd::get_modelo_name_by_tipo($tipo);
						if(!in_array($model_name, $components_to_update)){
							continue;
						}

						switch ($model_name) {
							case 'component_text_area':
								if (is_array($dato)) {
									continue 2;
								}
								$format_dato	= '<p>'.$dato.'</p>';
								$changed_dato	= preg_replace('/(<\/? ?br>)/i', '</p><p>', $format_dato);
								// fix final dato with new format as array
								$new_dato = [$changed_dato];
								break;

							case 'component_number':
								if (is_array($dato)) {
									continue 2;
								}
								// fix final dato with new format as array
								$new_dato = [$dato];
								break;

							case 'component_json':
								if (!is_string($dato)) {
									continue 2;
								}
								// fix final dato with new format as array
								try {
									$new_dato = json_decode($dato);
								} catch (Exception $e) {
									error_log( 'Caught exception: ' . $e->getMessage() );
									debug_log(__METHOD__
										." ERROR: invalid JSON data id: ($id) ".$e->getMessage()
										, logger::ERROR
									);
									continue 2;
								}
								break;

							default:
								debug_log(__METHOD__
									." model_name not valid: ".to_string($model_name)
									, logger::ERROR
								);
								continue 2;
								break;
						}

						// data_encoded : JSON ENCODE ALWAYS !!!
							$data_encoded = json_handler::encode($new_dato);
							// prevent null encoded errors
							$safe_data = str_replace(['\\u0000','\u0000'], ' ', $data_encoded);

						$strQuery2		= "UPDATE $table SET dato = $1 WHERE id = $2 ";
						$result2		= pg_query_params(DBi::_getConnection(), $strQuery2, array( $safe_data, $id ));
						if($result2===false) {
							$msg = "Failed Update section_data $i";
							debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
							continue;
						}
					}else{
						debug_log(__METHOD__." Empty datos from: $table - $id ".to_string(), logger::WARNING);
					}
				}

				// log info each 1000
					if ($i_ref===0) {
						debug_log(__METHOD__
							." Partial update of section data table: $table - id: $id - total: $n_rows - total min: ".exec_time_unit($start_time,'min')
							, logger::DEBUG
						);
					}else{
						$i_ref = ($i_ref>10000) ? 0 : $i_ref + 1;
					}
			}
			#break; // stop now
		}//end foreach ($ar_tables as $key => $table)


		return true;
	}//end convert_table_data

}//end class
