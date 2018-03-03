<?php
require_once( dirname(dirname(dirname(dirname(__FILE__)))) .'/config/config4.php');



/*
* CLASS REFERENCE_DATO_V47_TO_RELATION_DATO_V48
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
	public static function convert_reference_dato_to_relation_dato( stdClass $datos_column ) {

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

		$ar_models_to_change = self::$ar_models_to_change;
		
		if (isset($dato->components)) {
		
			foreach ((array)$dato->components as $key_tipo => $component) {

				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($key_tipo, true);
				if (!in_array($modelo_name, $ar_models_to_change)) {
					continue;
				}

				$lg_nolan = DEDALO_DATA_NOLAN;
				if (isset($component->dato->{$lg_nolan})) {
					
					foreach ((array)$component->dato->{$lg_nolan} as $lkey => $lvalue) {
						if (!isset($lvalue->section_tipo) || !isset($lvalue->section_id)) {
							continue;
						}
						$locator = new locator();
							$locator->set_section_tipo($lvalue->section_tipo);
							$locator->set_section_id($lvalue->section_id);
							$locator->set_type(DEDALO_RELATION_TYPE_LINK);
							$locator->set_from_component_tipo($key_tipo);
						
						# Move data to relations container
						$dato->relations[] = $locator;
					}
					
					# Remove after move data
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
	* @return 
	*/
	public static function convert_table_data() {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= array('Error. Request failed convert_table_data');

		$ar_msg = array();

		# Check files alocation is good. If not stop all and warning to user
		/*$allow_response = self::check_files_alocation();
		$response->msg[] = $allow_response->msg;
		if ($allow_response->result!==true) {
			$response->result = false;
			$response->msg    = "<br>".implode('<br>', $response->msg);
			return $response;
		}*/

		#$response->msg   .= "<br>".implode('<br>', $msg);
		#return $response;

		
		$ar_tables = tool_administration::$ar_tables_with_relations;

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
						$data_response = self::convert_reference_dato_to_relation_dato( $datos );
						if ($data_response->is_changed===false) {
							continue;
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
					}else{
						debug_log(__METHOD__." ERROR: Empty datos from: $table - $id ".to_string(), logger::ERROR);
					}
				}
				if(SHOW_DEBUG===true) {
					# Show log msg every 100 id					
					if ($counter===1) {
						debug_log(__METHOD__." Updated section data table $table - id $id  ".to_string(), logger::DEBUG);					
					}
					$counter++;	
					if ($counter>300) {
						$counter = 1;
					}			
				}				
				
				#break;
			}//end for ($i=$min; $i<=$max; $i++)
			$response->msg[] = " Updated table data table $table ";
			debug_log(__METHOD__." Updated table data table $table  ", logger::WARNING);
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
			$old_path = DEDALO_LIB_BASE_PATH . '/' . $dir_name;
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
			$new_path = DEDALO_LIB_BASE_PATH  . '/' . $dir_name;
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