<?php
require_once( DEDALO_CONFIG_PATH .'/config.php');
/*
* CLASS REFERENCE_DATO_V47_TO_RELATION_DATO_V48 - C
*
*/
class reference_dato_v47_to_relation_dato_v48 {


	static $ar_models_to_change = array(
			"component_autocomplete",
			"component_autocomplete_hi",
			"component_check_box",
			"component_portal",
			"component_radio_button",
			"component_select",
			"component_publication", // Added 24-02-2018
			"component_select_lang"  // Added 24-02-2018
			);


	/**
	* CONVERT_REFERENCE_DATO_TO_RELATION_DATO
	* @return 
	*/
	public static function convert_reference_dato_to_relation_dato( stdClass $datos_column, $ar_models_to_change, $move_to_relations_container ) {

		$is_changed = false;

		#$dato = $section->get_dato();
		$dato = $datos_column;

		if (!property_exists($dato, 'relations')) {
			$dato->relations = array();
			#$is_changed = true;
		}

		#$data = new stdClass();
		// Add all section properties except components
		# foreach ($dato as $key => $value) {
		# 	if ($key=="components") {
		# 		$data->$key = array();
		# 	}else if ($key=="relations") {
		# 		continue; // Not used anymore
		# 	}else{
		# 		$data->$key = $value;
		# 	}
		# }
		
		if (isset($dato->components)) {
		
			$lg_nolan = DEDALO_DATA_NOLAN;
			foreach ((array)$dato->components as $key_tipo => $component) {

				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($key_tipo, true);
				if (!in_array($modelo_name, $ar_models_to_change)) {
					continue;
				}
				
				if (isset($component->dato->{$lg_nolan})) {
					
					if($move_to_relations_container===true) {
						foreach ((array)$component->dato->{$lg_nolan} as $lkey => $lvalue) {

							if (!isset($lvalue->section_tipo) || !isset($lvalue->section_id)) {
								debug_log(__METHOD__." ++ BAD LOCATOR FOUND IN $modelo_name - $key_tipo ".to_string($lvalue), logger::ERROR);
								continue;
							}

							if (!isset($lvalue->type)) {
								$lvalue->type = DEDALO_RELATION_TYPE_LINK;
							}

							if (!isset($lvalue->from_component_tipo)) {
								$lvalue->from_component_tipo = $key_tipo;
							}

							$locator = $lvalue;
							
							# Move data to relations container
							$dato->relations[] = $locator;
						}
					}
					
					# Remove whole component after move data
					unset($dato->components->$key_tipo);

					$is_changed = true;
				}		
			}//end foreach ($dato->components as $key_tipo => $component)
		}
		#dump($dato, ' dato ++ '.to_string());

		$response = new stdClass();
			$response->result 		= true;
			$response->is_changed 	= $is_changed;
			$response->dato 		= $dato;
			#dump($response, ' response ++ '.to_string()); die();

		return $response;
	}//end convert_reference_dato_to_relation_dato



	/**
	* CONVERT_TABLE_DATA
	* @return object $response
	*/
	public static function convert_table_data( $ar_models_json=null, $move_to_relations_container=true ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= array('Error. Request failed convert_table_data');

		$ar_msg = array();
		
		# ar_models_to_change
		if (empty($ar_models_json)) {
			$ar_models_to_change = (array)self::$ar_models_to_change;
		}else{
			$ar_models_to_change = (array)json_decode($ar_models_json);
		}
		if (empty($ar_models_to_change) || !is_array($ar_models_to_change)) {
			throw new Exception("Error Processing Request. Empty ar_models_to_change ", 1);			
		}
		
		# ar_tables
		$ar_tables = tool_administration::$ar_tables_with_relations;
		debug_log(__METHOD__." Tables to process: ".to_string($ar_tables), logger::ERROR);

		foreach ($ar_tables as $key => $table) {

			$counter = 1;
			
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

			debug_log(__METHOD__." Processing table $table records from $min to $max ".to_string(), logger::ERROR);
		
			// iterate from 1 to last id
			for ($i=$min; $i<=$max; $i++) {
				
				$strQuery 	= "SELECT id, datos FROM $table WHERE id = $i";
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
						$data_response = self::convert_reference_dato_to_relation_dato( $datos, $ar_models_to_change, (bool)$move_to_relations_container );
						if ($data_response->is_changed===false) {
							continue; // Skip update table
						}

						$data_encoded 	= json_encode($data_response->dato);
						
						# Save edited data object
						$strQuery 	= "UPDATE $table SET datos = $1 WHERE id = $2 ";
						$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( $data_encoded, $id ));
						if(!$result) {			
							$msg = "Failed Update section datos $i - $strQuery";
							debug_log(__METHOD__." ERROR: $msg ".to_string(), logger::ERROR);
							$response->msg[] = $msg;
							continue;
						}
						#pg_close(DBi::_getConnection());
						#debug_log(__METHOD__." Updated (removed old path components content) record from table: $table - $id - ".to_string($ar_models_to_change), logger::ERROR);

					}else{
						debug_log(__METHOD__." ERROR: Empty datos from: $table - $id ".to_string(), logger::ERROR);
					}
				}//end while($rows = pg_fetch_assoc($result)) {
				if(SHOW_DEBUG===true) {
					# Show log msg every 100 id					
					if ($counter===1) {
						debug_log(__METHOD__." Updated section data table $table - id $id  (total:$max) - ".to_string($ar_models_to_change), logger::ERROR);					
					}
					$counter++;	
					if ($counter>300) {
						$counter = 1;
					}			
				}				
				
				#break;
			}//end for ($i=$min; $i<=$max; $i++)
			$response->msg[] = " Updated table data table $table ";
			debug_log(__METHOD__." Updated table data table $table  ", logger::ERROR);
			#break; // stop now

		}//end foreach ($ar_tables as $key => $table)

		# Realocate updated files

		$response->result = true;
		$response->msg[0] = "Ok. All data is converted successfully"; // Override first message
		$response->msg    = "<br>".implode('<br>', $response->msg);
		
		return $response;
	}//end convert_table_data



	/**
	* CHECK_FILES_ALOCATION
	* @return 
	*/
	public static function check_files_alocation() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed check_files_alocation';

		$msg = array();
		
		$ar_models_to_change = self::$ar_models_to_change;
		#$ar_models_to_change = array("component_radio_button_TIRAR");

		$current_upgrade_dir = dirname(__FILE__) . '/reference_dato_v47_to_relation_dato_v48';

		foreach ($ar_models_to_change as $key => $dir_name) {
			if(!is_dir($current_upgrade_dir  . '/' . $dir_name)) {
				$response->msg .= ' Invalid or unable dir: '.$current_upgrade_dir  . '/' . $dir_name;
				return $response;
			}
		}

		$response->result 	= true;
		$response->msg 		= 'Test if all dirs are accessible passed:<br> '.to_string($ar_models_to_change);
		return $response;
		

		foreach ($ar_models_to_change as $key => $dir_name) {

			# Move old component
			$old_path = DEDALO_CORE_PATH . '/' . $dir_name;
			$new_path = $current_upgrade_dir . '/old_removed/' . $dir_name;
			$result = rename($old_path, $new_path);
			if ($result!==true) {
				$response->result 	= false;
				$response->msg 		= 'Error moving old file: '.to_string($dir_name);
				return $response;
			}
			$msg[] = "Moved old file $old_path to $new_path";

			# Move new component
			$old_path = $current_upgrade_dir  . '/' . $dir_name;
			$new_path = DEDALO_CORE_PATH  . '/' . $dir_name;
			$result = rename($old_path, $new_path);
			if ($result!==true) {
				$response->result 	= false;
				$response->msg 		= 'Error moving new file: '.to_string($dir_name);
				return $response;
			}
			$msg[] = "Moved new file $old_path to $new_path";			
		}

		$response->result 	= true;
		$response->msg 		= implode('<br>', $msg);

		return (object)$response;
	}//end check_files_alocation



}//end class
?>