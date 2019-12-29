<?php
/**
* CLASS DATO_V4_TO_SECTION_DATA_V5
*
*
*/
class security_v5_to_v6 {


	/**
	* CONVERT_SECTION_DATO_TO_DATA
	* @return object $dato
	*/
	public static function convert_section_dato_to_data( stdClass $datos_column ) {

		$dato = clone $datos_column;

		$section_tipo = $dato->section_tipo;

		if($section_tipo===DEDALO_SECTION_PROFILES_TIPO){

			// security_access / areas
				$security_acces_dato 	= $dato->components->{DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? new stdClass();
				$security_acces_areas 	= $dato->components->{DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? new stdClass();

				// change areas dato
				$new_access_dato = [];
				foreach ($security_acces_areas as $current_tipo => $value) {
					$current_dato = new stdClass();
						$current_dato->tipo 	= $current_tipo;
						$current_dato->parent 	= $current_tipo;
						$current_dato->type 	= 'area';
						$current_dato->value 	= $value;
					$new_access_dato[] = $current_dato;
				}
				// change access dato
				foreach ($security_acces_dato as $current_parent => $current_ar_tipo) {
					if (empty($current_ar_tipo)) {
						debug_log(__METHOD__." Empty current_ar_tipo for parent $current_parent in security_acces_dato. IGNORED !".to_string(), logger::ERROR);
						continue;
					}
					foreach ($current_ar_tipo as $current_tipo => $value) {
						$current_dato = new stdClass();
							$current_dato->tipo 	= $current_tipo;
							$current_dato->parent 	= $current_parent;
							$current_dato->value 	= $value;
						$new_access_dato[] = $current_dato;
					}
				}
				// replace data
				$dato->components->{DEDALO_COMPONENT_SECURITY_ACCESS_PROFILES_TIPO}->dato->{DEDALO_DATA_NOLAN} = $new_access_dato;
				// remove unused old value
				unset($dato->components->{DEDALO_COMPONENT_SECURITY_AREAS_PROFILES_TIPO});

			// security tools
				$security_tools_dato = $dato->components->{DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? new stdClass();

				$new_tool_dato =[];
				foreach ($security_tools_dato as $tool => $value) {
					$current_dato = new stdClass();
						$current_dato->name 	= $tool;
						$current_dato->value 	= $value;
					$new_tool_dato[] = $current_dato;
				}
				// replace data
				$dato->components->{DEDALO_COMPONENT_SECURITY_TOOLS_PROFILES_TIPO}->dato->{DEDALO_DATA_NOLAN} = $new_tool_dato;

		}else if ($section_tipo===DEDALO_SECTION_USERS_TIPO){

			// security_administrator
				$security_admin_dato = $dato->components->{DEDALO_SECURITY_ADMINISTRATOR_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? 0;
				$section_id 		 = ($security_admin_dato===1) ? '1' : '2';

				$current_dato = new locator();
					$current_dato->set_section_tipo('dd64');
					$current_dato->set_section_id($section_id);
					$current_dato->set_from_component_tipo(DEDALO_SECURITY_ADMINISTRATOR_TIPO);
					$current_dato->set_type(DEDALO_RELATION_TYPE_LINK);

				// remove unused old value
				unset($dato->components->{DEDALO_SECURITY_ADMINISTRATOR_TIPO});
				// add to realtions container
				$dato->relations[] = $current_dato;

			// user_profile
				$security_profile_dato = $dato->components->{DEDALO_USER_PROFILE_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? DEDALO_PROFILE_DEFAULT;

				$current_profile_dato = new locator();
					$current_profile_dato->set_section_tipo(DEDALO_SECTION_PROFILES_TIPO);
					$current_profile_dato->set_section_id($security_profile_dato);
					$current_profile_dato->set_from_component_tipo(DEDALO_USER_PROFILE_TIPO);
					$current_profile_dato->set_type(DEDALO_RELATION_TYPE_LINK);

				// remove unused old value
				unset($dato->components->{DEDALO_USER_PROFILE_TIPO});
				// add to realtions container
				$dato->relations[] = $current_profile_dato;

			// component_filter_records
				$filter_records_dato = $dato->components->{DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO}->dato->{DEDALO_DATA_NOLAN} ?? null;
				if (!empty($filter_records_dato)) {
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
					$dato->components->{DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO}->dato->{DEDALO_DATA_NOLAN}  = $new_filter_records_dato;
					$dato->components->{DEDALO_USER_COMPONENT_FILTER_RECORDS_TIPO}->valor->{DEDALO_DATA_NOLAN} = null;
				}
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
				"matrix_profiles",
				"matrix_users",
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

			$min = 1;
			if ($table==='matrix_users') {
				$min = -1;
			}

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
	* CONVERT_TABLE_DATA_PROFILES
	* @return bool true
	*/
	public static function convert_table_data_profiles() {

		self::convert_table_data(["matrix_profiles"]);

		return true;
	}//end convert_table_data_profiles



	/**
	* CONVERT_TABLE_DATA_USERS
	* @return bool true
	*/
	public static function convert_table_data_users() {

		self::convert_table_data(["matrix_users"]);

		return true;
	}//end convert_table_data_users



}//end class
