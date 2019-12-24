<?php
#require_once( DEDALO_CONFIG_PATH .'/config.php');



/*
* CLASS DATO_V4_TO_SECTION_DATA_V5
*/
class dato_v4_to_section_data_v5 {



	/**
	* CONVERT_SECTION_DATO_TO_DATA
	* @return
	{
	  "label": "Web templates",
	  "components": [
	    {
	      "tipo": "mupreva2597",
	      "lang": "lg-esp",
	      "dato": [
	        ""
	      ],
	      "valor": "Test Only"
	    },
	    {
	      "tipo": "mupreva2597",
	      "lang": "lg-eng",
	      "dato": [
	        ""
	      ],
	      "valor": "Test Only"
	    },
	    {
	      "tipo": "mupreva2597",
	      "dataframe": [
	        {
	          "tipo": "dd577",
	          "type": "dd558"
	        }
	      ]
	    }
	  ],
	  "section_id": 6,
	  "created_date": "2017-10-31 22:09:53",
	  "section_tipo": "mupreva2595",
	  "modified_date": "2017-10-31 22:45:43",
	  "diffusion_info": null,
	  "created_by_userID": -1,
	  "section_real_tipo": "mupreva2595",
	  "modified_by_userID": -1,
	  "section_creator_top_tipo": "mupreva2595",
	  "section_creator_portal_tipo": "",
	  "section_creator_portal_section_tipo": ""
	}
	*/
	public static function convert_section_dato_to_data__OLD( stdClass $datos_column ) {


		#$dato = $section->get_dato();
		$dato = $datos_column;

		$data = new stdClass();
		// Add all section properties except components
		foreach ($dato as $key => $value) {
			if ($key=="components") {
				$data->$key = array();
			}else if ($key=="relations") {
				continue; // Not used anymore
			}else{
				$data->$key = $value;
			}
		}

		foreach ($dato->components as $key_tipo => $component) {

			// dato
			foreach ($component->dato as $clang => $cdato) {
				$current_obj = new stdClass();
					$current_obj->tipo 			= $key_tipo;
					$current_obj->lang 			= $clang;
					$current_obj->data 			= $cdato;
					if (isset($component->valor->$clang)) {
						$current_obj->value 	= $component->valor->$clang;
					}
					if (isset($component->valor_list->$clang)) {
						$current_obj->value_list 	= $component->valor_list->$clang;
					}
					if (isset($component->valor_search->$clang)) {
						$current_obj->value_search = $component->valor_search->$clang;
					}
				$data->components[] = $current_obj;
			};
			// dataframe
			if (isset($component->dataframe)) {
				$current_obj = new stdClass();
					$current_obj->tipo 		= $key_tipo;
					$current_obj->dataframe = $component->dataframe;
				$data->components[] = $current_obj;
			}
			// info
			if (isset($component->info)) {
				$current_obj = new stdClass();
					$current_obj->tipo 	= $key_tipo;
					$current_obj->info 	= $component->info;
				$data->components[] = $current_obj;
			}
		}


		// relations conversion
		# dump($dato, '$data->relations ++ '.to_string());
		if (isset($dato->relations)) {
			$ar_tipo = array();
			foreach ($dato->relations as $key => $locator) {
				if (!in_array($locator->from_component_tipo, $ar_tipo)) {
					$ar_tipo[] = $locator->from_component_tipo;
				}
			}
			#dump($dato->relations, ' var ++ '.to_string());
			foreach ($ar_tipo as $component_tipo) {

				$data_relations = $dato->relations;

				$ar_locators = array_filter(
					$data_relations,
					function ($data_relations) use($component_tipo) {
						return ($data_relations->from_component_tipo === $component_tipo);
					}
				);
				// Remove property from_component_tipo
				$component_dato = array();
				foreach ($ar_locators as $key => $locator) {
					$clean_locator = new stdClass();
					foreach ($locator as $lkey => $lvalue) {
						if ($lkey!=='from_component_tipo') {
							$clean_locator->$lkey = $lvalue;
						}
					}
					$component_dato[] = $clean_locator;
				}

				$current_obj = new stdClass();
					$current_obj->tipo 	= $component_tipo;
					$current_obj->data 	= $component_dato;
				$data->components[] = $current_obj;
			}

		}


		#dump($data, ' data ++ '.to_string());
		#dump(json_encode($data), ' data json encoded ++ '.to_string());

		return $data;
	}//end convert_section_dato_to_data



	public static function convert_section_dato_to_data( stdClass $datos_column ) {

		$dato = clone $datos_column;

		// values and dataframe containers
		$values 	= [];
		$dataframes = [];
		foreach ($dato->components as $key_tipo => $component) {

			$model = RecordObj_dd::get_modelo_name_by_tipo($key_tipo,true);

			// dato
				foreach ($component->dato as $clang => $cdato) {

					$component_dato = is_array($cdato) ? $cdato : array($cdato);

					$value_obj = new stdClass();
						$value_obj->from_component_tipo	= $key_tipo;
						$value_obj->lang 				= $clang;
						$value_obj->data 				= $component_dato;

					// component date exception
						if ($model==='component_date') {
							// move actual data to 'dato'
							$value_obj->dato = $cdato;
							// calculate text representation of component_date and replace 'data'
							$ar_dates = [];
							foreach ((array)$component_dato as $current_date) {
								$ar_dates[] = component_date::data_to_text($current_date);
							}
							$value_obj->data = $ar_dates;
						}

					$values[] = $value_obj;
				}

			// dataframe
				if (isset($component->dataframe)) {
					foreach ($component->dataframe as $dataframe_dato) {

						$dataframe_obj = new stdClass();
							$dataframe_obj->from_component_tipo = $key_tipo;
							$dataframe_obj->lang 				= DEDALO_DATA_NOLAN;
							$dataframe_obj->data 				= $dataframe_dato;
						$dataframes[] = $dataframe_obj;
					}
				}
		}

		// add ne containes to global data
			$dato->values 		= $values;
			$dato->dataframes 	= $dataframes;

		// remove old container components
			unset($dato->components);

		#dump($dato, ' dato ++ '.to_string());
		#dump(json_encode($dato), ' dato json encoded ++ '.to_string());

		return $dato;
	}//end convert_section_dato_to_data



	/**
	* CONVERT_TABLE_DATA
	* @return
	*/
	public static function convert_table_data($ar_tables=null) {

		if ($ar_tables===null) {
			// default
			$ar_tables = [
				"matrix",
				//"matrix_activities",
				//"matrix_activity",
				//"matrix_hierarchy",
				//"matrix_hierarchy_main",
				//"matrix_langs",
				//"matrix_layout",
				//"matrix_list",
				//"matrix_notes",
				//"matrix_profiles",
				//"matrix_projects",
				//"matrix_test",
				//"matrix_users",
				//"matrix_indexations",
				//"matrix_structurations",
				//"matrix_dataframe",
				//"matrix_dd",
				//"matrix_layout_dd"
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



}//end class
?>
