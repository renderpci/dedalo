<?php
/**
* CLASS security_v5_to_v6
*
*
*/
class security_v5_to_v6 {



	/**
	* CONVERT_SECTION_DATO_TO_DATA
	* @param stdClass $datos_column
	* @return object $dato
	*/
	public static function convert_section_dato_to_data( stdClass $datos_column ) : object {

		$dato = clone $datos_column;

		$section_tipo = $dato->section_tipo;

		if($section_tipo===DEDALO_SECTION_PROFILES_TIPO) {	// PROFILES TABLE

			// security_access / areas

				// dd774 COMPONENT_SECURITY_ACCESS
				$security_acces_dato = $dato->components->{DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? new stdClass(); // expected object
				if (is_object($security_acces_dato)) {

					// converting from v5 data (was an object. On finish, an array is saved)

					// dd249 COMPONENT_SECURITY_AREAS
					$security_areas_dato = $dato->components->{DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO}->dato->{DEDALO_DATA_NOLAN}  ?? new stdClass(); // expected object

					// change areas dato dd249
						// sample data dd249
						// from
						// {
						//  "ad1": 3,
						//  "ds1": 3
						// }
						// to
						// {
						// 	"tipo": "ad1",
						// 	"section_tipo": "ad1",
						// 	"value": 3
						// }
					$new_access_dato = [];
					foreach ($security_areas_dato as $current_tipo => $value) {

						$current_dato = new stdClass();
							$current_dato->tipo			= $current_tipo;
							$current_dato->section_tipo	= $current_tipo; // self (section, area) tipo as section tipo
							$current_dato->value		= $value;
						$new_access_dato[] = $current_dato;
					}

					// change access dato dd774
						// sample data dd774
						// from
						// "oh8": "2",
						// {
						// "ad1": {
						// 	"hierarchy21": 2,
						// 	"hierarchy22": 2
						// },
						// "ad2": {
						// 	"hierarchy21": 2,
						// 	"hierarchy22": 2
						// }
						// to
						// {
						// 	"tipo": "hierarchy21",
						// 	"section_tipo": "ad1",
						// 	"value": 1
						// }
						// {
						// 	"tipo": "hierarchy22",
						// 	"section_tipo": "ad1",
						// 	"value": 1
						// }
						// ...
					foreach ($security_acces_dato as $current_parent => $current_ar_tipo) {
						if (empty($current_ar_tipo)) {
							debug_log(__METHOD__." Empty current_ar_tipo for parent $current_parent in security_acces_dato. IGNORED !".to_string(), logger::ERROR);
							continue;
						}
						// areas direct case
						if (is_string($current_ar_tipo)) {
							$current_ar_tipo = (object)[
								$current_parent => $current_ar_tipo
							];
						}
						foreach ($current_ar_tipo as $current_tipo => $value) {
							$current_dato = new stdClass();
								$current_dato->tipo			= $current_tipo;
								$current_dato->section_tipo	= $current_parent; // current area/section
								$current_dato->value		= $value;
							$new_access_dato[] = $current_dato;
						}
					}

					// replace data profiles
						$dato->components->{DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO} = (object)[
							'dato' => (object)[
								DEDALO_DATA_NOLAN => $new_access_dato
							]
						];

					// remove unused old value (SECURITY_AREAS)
						if (isset($dato->components->{DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO})) {
							unset($dato->components->{DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO});
						}

				}else{

					// v6 already converted case (array) or unknown error

					if (gettype($security_acces_dato)==='array') {

						debug_log(__METHOD__
							." 'security_acces_dato' is array. Ignored already updated data"
							, logger::WARNING
						);

					}else{

						debug_log(__METHOD__
							." 'security_acces_dato' is not an expected type object or array. Ignored type: ".gettype($security_acces_dato). PHP_EOL
							.' value: '. to_string($security_acces_dato)
							, logger::ERROR
						);
					}
				}

			// security tools
				$security_tools_dato = $dato->components->{DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? new stdClass(); // expected object

				// sample data

				if (is_object($security_tools_dato)) {

					// change areas dato dd1067
						// [{
						// 	"tool_qr": 2,
						// 	"tool_tc": 2
						// }]
						// to
						// [{
						// 	"type": "dd151",
						// 	"section_id": "8",
						// 	"section_tipo": "dd1324",
						// 	"from_component_tipo": "dd1067"
						// }]

					$new_tool_dato = [];
					foreach ($security_tools_dato as $tool_name => $value) {

						$new_name = (function() use($tool_name){

							$new_tool_name = '';

							switch ($tool_name) {
								case 'tool_av_versions':
								case 'tool_pdf_versions':
								case 'tool_image_versions':
									$new_tool_name = 'tool_media_versions';
									break;

								case 'tool_add_component_data':
								case 'tool_replace_component_data':
									$new_tool_name = 'tool_propagate_component_data';
									break;

								default:
									$new_tool_name = $tool_name;
									break;
							}
							return $new_tool_name;
						})();

						// find tool by name in registered tools
						$target_section_tipo	= 'dd1324'; // $section_registered_tools_tipo	= 'dd1324'; // Tools register section
						$tool_found				= tools_register::get_tool_data_by_name($new_name, $target_section_tipo); // return section record raw data or null
						if (empty($tool_found)) {
							$msg = 'WARNING on import tool permissions. Tool: '.$tool_name.' not found in tools_register section [Ignored]';
							debug_log(__METHOD__." $msg ".to_string(), logger::WARNING);
							continue;
						}

						$locator = new locator();
							$locator->set_section_tipo($target_section_tipo);
							$locator->set_section_id($tool_found->section_id);
							$locator->set_from_component_tipo(DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO); // dd1067
							$locator->set_type(DEDALO_RELATION_TYPE_LINK); // dd151

						if(!locator::in_array_locator( $locator, $new_tool_dato, ['section_id'])) {
							$new_tool_dato[] = $locator;
						}
					}
					// add data to relations
						if (!empty($new_tool_dato)) {
							// relations
							if (!isset($dato->relations)) {
								$dato->relations = [];
							}
							foreach ($new_tool_dato as $current_locator) {
								$dato->relations[] = $current_locator;
							}
						}

				}else{
					debug_log(__METHOD__." 'security_tools_dato' is not an expected type object. Ignored (maybe is already updated) type: ".gettype($security_tools_dato).' - value: '.to_string($security_tools_dato), logger::ERROR);
				}
		}
		else if ($section_tipo===DEDALO_SECTION_USERS_TIPO){	// USERS TABLE

			// security_administrator
				$security_admin_dato	= $dato->components->{DEDALO_SECURITY_ADMINISTRATOR_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? 0;
				$section_id				= ($security_admin_dato===1) ? '1' : '2';

				$new_dato = new locator();
					$new_dato->set_section_tipo('dd64');
					$new_dato->set_section_id($section_id);
					$new_dato->set_from_component_tipo(DEDALO_SECURITY_ADMINISTRATOR_TIPO);
					$new_dato->set_type(DEDALO_RELATION_TYPE_LINK);

				// remove unused old value
				unset($dato->components->{DEDALO_SECURITY_ADMINISTRATOR_TIPO});
				// add to relations container if not already exists
				$found = array_filter($dato->relations, function($item) use($new_dato){
					if (true===locator::compare_locators($item, $new_dato)) {
						return $item;
					}
				});
				if (empty($found)) {
					$dato->relations[] = $new_dato;
				}else{
					debug_log(__METHOD__." 'security_admin_dato' already exists in relations. Ignored (maybe is already updated) ", logger::ERROR);
				}

			// user_profile
				$security_profile_dato = $dato->components->{DEDALO_USER_PROFILE_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? DEDALO_PROFILE_DEFAULT;

				$new_dato = new locator();
					$new_dato->set_section_tipo(DEDALO_SECTION_PROFILES_TIPO);
					$new_dato->set_section_id($security_profile_dato);
					$new_dato->set_from_component_tipo(DEDALO_USER_PROFILE_TIPO);
					$new_dato->set_type(DEDALO_RELATION_TYPE_LINK);

				// remove unused old value
				unset($dato->components->{DEDALO_USER_PROFILE_TIPO});
				// add to relations container
				$found = array_filter($dato->relations, function($item) use($new_dato){
					if (true===locator::compare_locators($item, $new_dato)) {
						return $item;
					}
				});
				if (empty($found)) {
					$dato->relations[] = $new_dato;
				}else{
					debug_log(__METHOD__." 'security_profile_dato' already exists in relations. Ignored (maybe is already updated) ", logger::ERROR);
				}

			// component_filter_records
				$filter_records_dato = $dato->components->{DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? null; // expected object or null
				if (!empty($filter_records_dato)) {
					if (is_object($filter_records_dato)) {
						$new_filter_records_dato = [];
						foreach ($filter_records_dato as $current_section_tipo => $ar_value) {

							$item = new stdClass();
								$item->tipo  = $current_section_tipo;
								$item->value = array_map(function($current_section_id){
									return (int)$current_section_id;
								}, $ar_value);

							$new_filter_records_dato[] = $item;
						}

						// replace data
						$dato->components->{DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO}->dato->{DEDALO_DATA_NOLAN} = $new_filter_records_dato;
						// $dato->components->{DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO}->valor->{DEDALO_DATA_NOLAN} = null;
					}else{
						debug_log(__METHOD__." 'filter_records_dato' is not an expected type object. Ignored (maybe is already updated) type: ".gettype($filter_records_dato).' - value: '.to_string($filter_records_dato), logger::ERROR);
					}
				}
		}

		return $dato;
	}//end convert_section_dato_to_data



	/**
	* CONVERT_TABLE_DATA
	* @param array|null $ar_tables = null
	* @return bool
	* 	true
	*/
	public static function convert_table_data( ?array $ar_tables=null ) : bool {

		if ($ar_tables===null) {
			// default
			$ar_tables = [
				'matrix_profiles',
				'matrix_users',
			];
		}

		foreach ($ar_tables as $table) {

			debug_log(__METHOD__ . PHP_EOL
				. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
				. " CONVERTING ... " . PHP_EOL
				. " convert_table_data [security_v5_to_v6] table: $table " . PHP_EOL
				. " convert_table_data [security_v5_to_v6] memory usage: " . dd_memory_usage() . PHP_EOL
				. " ))))))))))))))))))))))))))))))))))))))))))))))))))))))) " . PHP_EOL
				, logger::WARNING
			);

			// Get last id in the table
			$strQuery 	= "SELECT id FROM $table ORDER BY id DESC LIMIT 1 ";
			$result 	= JSON_RecordDataBoundObject::search_free($strQuery);
			$rows 		= pg_fetch_assoc($result);
			if (!$rows) {
				continue;
			}
			$max = $rows['id'];

			$min = 1;
			if ($table==='matrix_users') {
				$min = -1;
			}

			// iterate from 1 to last id
			$i_ref = 0; $start_time = start_time();
			for ($i=$min; $i<=$max; $i++) {

				$strQuery	= "SELECT id, datos FROM $table WHERE id = $i ORDER BY id ASC";
				$result		= JSON_RecordDataBoundObject::search_free($strQuery);
				if($result===false) {
					$msg = "Failed Search id $i. Data is not found (security_v5_to_v6).";
					debug_log(__METHOD__
						." ERROR: $msg "
						, logger::ERROR
					);
					continue;
				}
				$n_rows = pg_num_rows($result);

				if ($n_rows<1) continue;

				while($rows = pg_fetch_assoc($result)) {

					$id		= $rows['id'];
					$datos	= json_decode($rows['datos']);

					if (!empty($datos)) {
						$section_data			= self::convert_section_dato_to_data( $datos );
						$section_data_encoded	= json_encode($section_data);

						$strQuery	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
						$result		= pg_query_params(DBi::_getConnection(), $strQuery, array( $section_data_encoded, $id ));
						if($result===false) {
							$msg = "Failed Update (security_v5_to_v6) section_data $i";
							debug_log(__METHOD__
								." ERROR: $msg "
								, logger::ERROR
							);
							continue;
						}
					}else{
						debug_log(__METHOD__
							." ERROR: Empty datos from: $table - $id "
							, logger::ERROR
						);
					}
				}

				// log info each 1000
					if ($i_ref===0) {
						debug_log(__METHOD__
							." Partial update (security_v5_to_v6) of section data table: $table - id: $id - total: $n_rows - total min: ".exec_time_unit($start_time,'min')
							, logger::DEBUG
						);

						// clean vars
						// unset($result);
						// let GC do the memory job
						time_nanosleep(0, 5000000); // Slept for 5000000 nanoseconds
						// Forces collection of any existing garbage cycles
						gc_collect_cycles();
					}

				// reset counter
					$i_ref++;
					if ($i_ref > 10001) {
						$i_ref = 0;
					}
			}
			#break; // stop now
		}//end foreach ($ar_tables as $key => $table)


		return true;
	}//end convert_table_data



	/**
	* CONVERT_TABLE_DATA_PROFILES
	* @return bool true
	*/
	public static function convert_table_data_profiles() : bool {

		self::convert_table_data(['matrix_profiles']);

		return true;
	}//end convert_table_data_profiles



	/**
	* CONVERT_TABLE_DATA_USERS
	* @return bool true
	*/
	public static function convert_table_data_users() : bool {

		self::convert_table_data(['matrix_users']);

		return true;
	}//end convert_table_data_users



}//end class security_v5_to_v6
